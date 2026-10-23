// Paid meeting types on the workspace's own Stripe account (docs/meetings-scheduler.md 1.8b, Payments; Part 3).
// Stripe Connect Standard: each workspace connects its own account, guests pay the team directly (direct charges),
// Stripe's fees are the team's, and Claritia never holds money.
//   book() with pending holds the time 10 minutes (meeting_holds) → a Checkout session on the team's account →
//   the webhook says paid → meeting_pay books it if the time is still free (always within the hold), else cancels
//   and the payment is refunded at once. Expired or failed checkouts let the held time go.
// Events can arrive late, out of order or twice: meeting_pay locks the hosts and answers from the meeting's state,
// and refunds carry an idempotency key, so the same event twice changes nothing.
// Stripe itself is passed in (the routes use the real client; the tests a fake), so this runs anywhere.

import { enqueueJob, type Rpc } from "../jobs.ts";
import { loadMeeting, type MeetingView } from "./public.ts";

/** Checkout must stay open at least 30 minutes (Stripe's minimum); the time itself is held for 10. */
export const CHECKOUT_MINUTES = 30;

export type PayStripe = {
  /** A Checkout session on the connected account; returns its id and the page to send the guest to. */
  checkout(account: string, p: { meetingId: string; workspaceId: string; name: string; amount: number; currency: string; email: string; successUrl: string; cancelUrl: string; expiresAt: number }): Promise<{ id: string; url: string }>;
  /** Refund a payment in full on the connected account; the key makes a repeat the same refund. */
  refund(account: string, paymentIntent: string, key: string): Promise<string>;
};

/** The parts of a Stripe event this reads. */
export type PayEvent = {
  type: string;
  account?: string | null;
  data: { object: { id: string; object?: string; metadata?: Record<string, string> | null; payment_intent?: string | { id: string } | null; payment_status?: string; amount_total?: number | null; currency?: string | null; charges_enabled?: boolean } };
};

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Open checkout for a meeting just held by book(). If Stripe can't be reached, the hold is let go at once so the time
 * isn't blocked for 10 minutes by a guest who can't pay.
 */
export async function startCheckout(rpc: Rpc, stripe: PayStripe, o: { meetingId: string; token: string; base: string; now?: number }): Promise<{ ok: true; url: string } | { ok: false }> {
  const v = await loadMeeting(rpc, { id: o.meetingId });
  const price = v?.type?.settings.price;
  const account = v?.ws.pay?.ready ? v.ws.pay.account : null;
  if (!v || !price || !account || v.meeting.status !== "pending_payment") return { ok: false };
  const now = o.now ?? Date.now();
  try {
    const s = await stripe.checkout(account, {
      meetingId: v.meeting.id,
      workspaceId: v.meeting.workspace_id,
      name: v.type!.name,
      amount: price.amount,
      currency: price.currency.toLowerCase(),
      email: v.meeting.guest_email,
      successUrl: `${o.base}/book/m/${o.token}?paid=1`,
      cancelUrl: `${o.base}/book/m/${o.token}`,
      expiresAt: Math.floor(now / 1000) + CHECKOUT_MINUTES * 60 + 60,
    });
    await call(rpc, "meeting_payment", { p_id: v.meeting.id, p_patch: { session: s.id, url: s.url, account, amount: price.amount, currency: price.currency.toLowerCase(), status: "open" } });
    return { ok: true, url: s.url };
  } catch {
    await rpc("meeting_status", { p_id: v.meeting.id, p_status: "canceled", p_reason: "Checkout could not start.", p_by: null });
    return { ok: false };
  }
}

export type PayResult = { ok: true; did: "booked" | "already" | "refunded" | "released" | "ready" | "skipped" } | { ok: false; reason: string };

const intentOf = (o: PayEvent["data"]["object"]) => (typeof o.payment_intent === "string" ? o.payment_intent : (o.payment_intent?.id ?? null));

/** Refund a meeting's payment once. Nothing happens when there's no payment or it was already refunded. */
export async function refundFor(rpc: Rpc, stripe: PayStripe, v: MeetingView): Promise<{ ok: true; refunded: boolean } | { ok: false; reason: string }> {
  const p = v.meeting.payment;
  if (!p?.intent || !p.account) return { ok: true, refunded: false };
  if (p.refund) return { ok: true, refunded: false };
  const id = await stripe.refund(p.account, p.intent, `refund-${v.meeting.id}`);
  await call(rpc, "meeting_payment", { p_id: v.meeting.id, p_patch: { refund: id, status: "refunded", refunded_at: new Date().toISOString() } });
  return { ok: true, refunded: true };
}

/**
 * One Stripe event from a connected account, already fetched back from Stripe (so it's real). Only events for a
 * meeting on that same account count.
 */
export async function handlePayEvent(rpc: Rpc, stripe: PayStripe, e: PayEvent): Promise<PayResult> {
  const obj = e.data.object;
  if (e.type === "account.updated") {
    const acct = obj.id;
    if (!/^acct_/.test(acct) || e.account !== acct) return { ok: true, did: "skipped" };
    const ws = obj.metadata?.workspace_id;
    if (!ws || !/^[0-9a-f-]{36}$/.test(ws)) return { ok: true, did: "skipped" };
    await call(rpc, "payment_account_set", { p_ws: ws, p_account: acct, p_ready: !!obj.charges_enabled });
    return { ok: true, did: "ready" };
  }
  if (!e.type.startsWith("checkout.session.")) return { ok: true, did: "skipped" };
  const meetingId = obj.metadata?.meeting_id;
  if (!meetingId || !/^[0-9a-f-]{36}$/.test(meetingId)) return { ok: true, did: "skipped" };
  const v = await loadMeeting(rpc, { id: meetingId });
  if (!v) return { ok: true, did: "skipped" };
  const account = v.ws.pay?.account;
  if (!account || e.account !== account || obj.metadata?.workspace_id !== v.meeting.workspace_id) return { ok: false, reason: "Not this workspace's account." };
  const paid = (e.type === "checkout.session.completed" && obj.payment_status === "paid") || e.type === "checkout.session.async_payment_succeeded";
  if (paid) {
    const intent = intentOf(obj);
    const r = await call<"booked" | "already" | "refund">(rpc, "meeting_pay", {
      p_id: meetingId,
      p_payment: { session: obj.id, account, ...(intent ? { intent } : {}), status: "paid", paid_at: new Date().toISOString() },
    });
    if (r === "booked") {
      await enqueueJob(rpc, { workspaceId: v.meeting.workspace_id, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
      return { ok: true, did: "booked" };
    }
    if (r === "already") return { ok: true, did: "already" };
    const fresh = await loadMeeting(rpc, { id: meetingId });
    const f = await refundFor(rpc, stripe, fresh ?? v);
    if (!f.ok) return f;
    return { ok: true, did: f.refunded ? "refunded" : "already" };
  }
  if (e.type === "checkout.session.expired" || e.type === "checkout.session.async_payment_failed") {
    // Only a meeting still waiting on this session lets go; a paid or canceled one is left alone.
    if (v.meeting.status !== "pending_payment" || (v.meeting.payment?.session && v.meeting.payment.session !== obj.id)) return { ok: true, did: "skipped" };
    const { error } = await rpc("meeting_status", { p_id: meetingId, p_status: "canceled", p_reason: "The payment wasn't completed.", p_by: null });
    if (error && !error.message.includes("bad_change")) throw new Error(error.message);
    await call(rpc, "meeting_payment", { p_id: meetingId, p_patch: { status: e.type === "checkout.session.expired" ? "expired" : "failed" } });
    return { ok: true, did: "released" };
  }
  return { ok: true, did: "skipped" };
}
