// Checkout on PayPal or Square for a form's fill or a paid meeting (docs/integrations-plan.md, Next step 12), beside
// Stripe (src/lib/forms/pay.ts, src/lib/meetings/pay.ts), with the same rules: the amount is the server's, the time
// is held while the guest pays, and a payment counts only once the server has read it back from the provider. The
// guest comes back through a signed return address (/api/pay/return), so the page never says what was paid; the
// webhook does the same check when the guest never comes back. Runs anywhere: the client is passed in.

import { createHmac, timingSafeEqual } from "node:crypto";
import { enqueueJob, type Rpc } from "../jobs.ts";
import { payAmount, type Form } from "../forms/schema.ts";
import { guestContact, loadMeeting, type MeetingView } from "../meetings/public.ts";
import { PROVIDER_NAME, type PayClient, type PayProvider, type PayRef, type PayState } from "./providers.ts";

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// The signed return address -----------------------------------------------------------------------------------------

export type Back = { ref: PayRef; provider: PayProvider; ws: string; to: string; paid: boolean };

const key = (secret?: string) => {
  const k = (secret ?? process.env.SECRETS_KEY ?? "").trim();
  if (k.length < 32) throw new Error("Add SECRETS_KEY (32 or more random characters).");
  return createHmac("sha256", "pay-return").update(k).digest();
};

/** Where the provider sends the guest: our own address, carrying where to go next, signed so it can't be changed. */
export function returnUrl(base: string, b: Back, secret?: string): string {
  const body = Buffer.from(JSON.stringify(b)).toString("base64url");
  return `${base}/api/pay/return?s=${body}.${createHmac("sha256", key(secret)).update(body).digest("base64url")}`;
}

export function readReturn(raw: string | null, secret?: string): Back | null {
  const [body, sig] = (raw ?? "").split(".");
  if (!body || !sig) return null;
  const want = Buffer.from(createHmac("sha256", key(secret)).update(body).digest("base64url"));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const b = JSON.parse(Buffer.from(body, "base64url").toString()) as Back;
    return b && typeof b.to === "string" && /^https?:\/\//.test(b.to) && (b.provider === "paypal" || b.provider === "square") ? b : null;
  } catch {
    return null;
  }
}

/** Does what the provider holds match what the server asked for? The same reference, the same amount and currency. */
export function matches(s: PayState, ref: PayRef, amount: number | undefined, currency: string | undefined): boolean {
  return s.paid && !!s.ref && s.ref.kind === ref.kind && s.ref.id === ref.id && s.amount === amount && s.currency === (currency ?? "").toLowerCase();
}

// Forms -------------------------------------------------------------------------------------------------------------

/** Where the form's page goes after: its own page (or the hosted one) with the note the form reads. */
export function formBack(page: string | undefined, hosted: string, paid: boolean): string {
  let u: URL;
  try {
    u = new URL(page && /^https?:\/\//.test(page) ? page : hosted);
  } catch {
    u = new URL(hosted);
  }
  u.searchParams.set("clr_pay", paid ? "done" : "back");
  return u.href;
}

/** Open the provider's checkout for a saved fill. Null with nothing to charge. A fill sent again reuses an open one. */
export async function startFormPay(
  rpc: Rpc,
  client: PayClient,
  o: { form: Form; formName: string; workspaceId: string; submissionId: string; answers: Record<string, unknown>; email: string | null; page?: string; hosted: string; base: string; existing?: { url?: string; status?: string } | null; secret?: string },
): Promise<{ url: string } | null> {
  if (o.existing?.status === "paid") return null;
  if (o.existing?.url && o.existing.status === "open") return { url: o.existing.url };
  const due = payAmount(o.form, o.answers);
  if (!due) return null;
  const ref: PayRef = { kind: "form", id: o.submissionId };
  const back = (paid: boolean) => returnUrl(o.base, { ref, provider: client.provider, ws: o.workspaceId, to: formBack(o.page, o.hosted, paid), paid }, o.secret);
  const c = await client.create({ ref, name: o.formName, amount: due.amount, currency: due.currency, email: o.email, successUrl: back(true), cancelUrl: back(false) });
  await call(rpc, "submission_payment", { p_sid: o.submissionId, p_patch: { provider: client.provider, session: c.id, url: c.url, amount: due.amount, currency: due.currency, status: "open" } });
  return { url: c.url };
}

/** Read the fill's payment back from the provider and keep it paid when it is. A paid one stays paid. */
export async function settleForm(rpc: Rpc, client: PayClient, submissionId: string): Promise<"paid" | "open" | "mismatch" | "none"> {
  const cur = await call<{ provider?: string; session?: string; amount?: number; currency?: string; status?: string } | null>(rpc, "submission_payment", { p_sid: submissionId, p_patch: {} });
  if (!cur?.session || cur.provider !== client.provider) return "none";
  if (cur.status === "paid") return "paid";
  const s = await client.settle(cur.session);
  if (!s.paid) return "open";
  if (!matches(s, { kind: "form", id: submissionId }, cur.amount, cur.currency)) {
    await call(rpc, "submission_payment", { p_sid: submissionId, p_patch: { status: "failed", error: `${PROVIDER_NAME[client.provider]} holds a different amount or order.` } });
    return "mismatch";
  }
  await call(rpc, "submission_payment", { p_sid: submissionId, p_patch: { status: "paid", capture: s.capture, paid_at: new Date().toISOString() } });
  return "paid";
}

// Meetings ----------------------------------------------------------------------------------------------------------

/**
 * Open the provider's checkout for a meeting just held by book(). If it can't open, the hold is let go at once so
 * the time isn't blocked by a guest who can't pay.
 */
export async function startMeetingPay(rpc: Rpc, client: PayClient, o: { meetingId: string; token: string; base: string; secret?: string }): Promise<{ ok: true; url: string } | { ok: false }> {
  const v = await loadMeeting(rpc, { id: o.meetingId });
  const price = v?.type?.settings.price;
  if (!v || !price || v.meeting.status !== "pending_payment") return { ok: false };
  const ref: PayRef = { kind: "meeting", id: v.meeting.id };
  const currency = price.currency.toLowerCase();
  const back = (paid: boolean) => returnUrl(o.base, { ref, provider: client.provider, ws: v.meeting.workspace_id, to: `${o.base}/book/m/${o.token}${paid ? "?paid=1" : ""}`, paid }, o.secret);
  try {
    const c = await client.create({ ref, name: v.type!.name, amount: price.amount, currency, email: v.meeting.guest_email, successUrl: back(true), cancelUrl: back(false) });
    await call(rpc, "meeting_payment", { p_id: v.meeting.id, p_patch: { provider: client.provider, session: c.id, url: c.url, amount: price.amount, currency, status: "open" } });
    return { ok: true, url: c.url };
  } catch {
    await rpc("meeting_status", { p_id: v.meeting.id, p_status: "canceled", p_reason: "Checkout could not start.", p_by: null });
    return { ok: false };
  }
}

type MeetingPay = NonNullable<MeetingView["meeting"]["payment"]> & { provider?: string; capture?: string };

/**
 * Read a meeting's payment back from the provider. Paid and matching: the meeting is booked (if the time is still
 * free, else the payment is refunded at once), then its calendar event and emails follow as with Stripe.
 */
export async function settleMeeting(rpc: Rpc, client: PayClient, meetingId: string): Promise<"booked" | "already" | "refunded" | "open" | "mismatch" | "none"> {
  const v = await loadMeeting(rpc, { id: meetingId });
  const p = v?.meeting.payment as MeetingPay | null | undefined;
  if (!v || !p?.session || p.provider !== client.provider) return "none";
  if (p.status === "paid" || p.status === "refunded") return "already";
  const s = await client.settle(p.session);
  if (!s.paid) return "open";
  if (!matches(s, { kind: "meeting", id: meetingId }, p.amount, p.currency)) return "mismatch";
  const r = await call<"booked" | "already" | "refund">(rpc, "meeting_pay", {
    p_id: meetingId,
    p_payment: { session: p.session, provider: client.provider, capture: s.capture, status: "paid", paid_at: new Date().toISOString() },
  });
  if (r === "booked") {
    await guestContact(rpc, meetingId, { email: v.meeting.guest_email, name: v.meeting.guest_name, tz: v.meeting.guest_tz });
    await enqueueJob(rpc, { workspaceId: v.meeting.workspace_id, kind: "meeting_sync", key: `create:${meetingId}`, payload: { meeting: meetingId, action: "create" } });
    return "booked";
  }
  if (r === "already") return "already";
  // The time went while they paid: the money goes back at once.
  const withCapture = { ...v, meeting: { ...v.meeting, payment: { ...p, capture: s.capture ?? undefined } as MeetingView["meeting"]["payment"] } };
  return (await refundProvider(rpc, client, withCapture)) ? "refunded" : "already";
}

/** Refund a meeting's PayPal or Square payment in full, once. False when there's nothing to refund. */
export async function refundProvider(rpc: Rpc, client: PayClient, v: MeetingView): Promise<boolean> {
  const p = v.meeting.payment as MeetingPay | null;
  if (!p?.capture || !p.session || p.refund || !p.amount || !p.currency) return false;
  const id = await client.refund({ id: p.session, capture: p.capture, amount: p.amount, currency: p.currency }, `refund-${v.meeting.id}`);
  await call(rpc, "meeting_payment", { p_id: v.meeting.id, p_patch: { refund: id, status: "refunded", refunded_at: new Date().toISOString() } });
  return true;
}
