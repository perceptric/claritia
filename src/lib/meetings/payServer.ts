import "server-only";
import type Stripe from "stripe";
import { appBase, stripeClient } from "../billing.ts";
import type { Rpc } from "../jobs.ts";
import { serviceClient } from "../serviceClient.ts";
import { handlePayEvent, refundFor, type PayEvent, type PayResult, type PayStripe } from "./pay.ts";
import { loadMeeting } from "./public.ts";

// The real Stripe behind pay.ts: Checkout and refunds on a workspace's connected account (Connect Standard), the
// Connect onboarding link, the webhook, and refundMeeting() for a host's cancel (the Meetings screen calls it).

const CONNECT_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "checkout.session.expired",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "account.updated",
];

export function payStripe(stripe: Stripe): PayStripe {
  return {
    async checkout(account, p) {
      const s = await stripe.checkout.sessions.create(
        {
          mode: "payment",
          // Cards (and Link) only: a bank payment that settles days later can't keep a 10-minute hold.
          allowed_payment_method_types: ["card", "link"],
          line_items: [{ quantity: 1, price_data: { currency: p.currency, unit_amount: p.amount, product_data: { name: p.name } } }],
          customer_email: p.email,
          metadata: { meeting_id: p.meetingId, workspace_id: p.workspaceId },
          payment_intent_data: { metadata: { meeting_id: p.meetingId, workspace_id: p.workspaceId } },
          success_url: p.successUrl,
          cancel_url: p.cancelUrl,
          expires_at: p.expiresAt,
        },
        { stripeAccount: account, idempotencyKey: `checkout-${p.meetingId}` },
      );
      if (!s.url) throw new Error("No checkout page.");
      return { id: s.id, url: s.url };
    },
    async refund(account, paymentIntent, key) {
      const r = await stripe.refunds.create({ payment_intent: paymentIntent, metadata: { reason: "meeting" } }, { stripeAccount: account, idempotencyKey: key });
      return r.id;
    },
  };
}

const rpcOf = (db: NonNullable<ReturnType<typeof serviceClient>>): Rpc => (fn, args) => db.rpc(fn, args);

/** Make sure Stripe sends connected accounts' checkout events here. Once per server start. */
let hookReady: Promise<void> | null = null;
export function ensureConnectWebhook(stripe: Stripe) {
  hookReady ??= (async () => {
    const url = `${appBase()}/api/book/pay/webhook`;
    if (!url.startsWith("https://")) return;
    const all = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = all.data.find((w) => w.url === url && w.status === "enabled");
    if (found && CONNECT_EVENTS.every((e) => found.enabled_events.includes(e))) return;
    if (found) await stripe.webhookEndpoints.update(found.id, { enabled_events: CONNECT_EVENTS });
    else await stripe.webhookEndpoints.create({ url, enabled_events: CONNECT_EVENTS, connect: true, description: "Claritia paid meetings" });
  })().catch((e) => {
    hookReady = null;
    throw e;
  });
  return hookReady;
}

/**
 * Where an owner goes to connect (or finish connecting) the workspace's Stripe account. The account is made the
 * first time; Stripe sends them back to Settings → Payments.
 */
export async function connectLink(rpc: Rpc, stripe: Stripe, ws: string, existing: string | null): Promise<string> {
  await ensureConnectWebhook(stripe).catch(() => {});
  let account = existing;
  if (!account) {
    const a = await stripe.accounts.create({ type: "standard", metadata: { workspace_id: ws } }, { idempotencyKey: `connect-${ws}` });
    account = a.id;
    const { error } = await rpc("payment_account_set", { p_ws: ws, p_account: account, p_ready: !!a.charges_enabled });
    if (error) throw new Error(error.message);
  }
  const back = `${appBase()}/scheduling/payments`;
  const link = await stripe.accountLinks.create({ account, type: "account_onboarding", refresh_url: `${back}?stripe=retry`, return_url: `${back}?stripe=done` });
  return link.url;
}

/** Read the account's state from Stripe again (after onboarding) and keep whether it takes payments. */
export async function refreshAccount(rpc: Rpc, stripe: Stripe, ws: string, account: string): Promise<boolean> {
  const a = await stripe.accounts.retrieve(account);
  const { error } = await rpc("payment_account_set", { p_ws: ws, p_account: account, p_ready: !!a.charges_enabled });
  if (error) throw new Error(error.message);
  return !!a.charges_enabled;
}

/**
 * A webhook call. Anyone can post here, so only the event's id and account are read from the body; the event is
 * fetched back from Stripe on that account, which proves it's real.
 */
export async function handleConnectWebhook(stripe: Stripe, rpc: Rpc, body: string): Promise<PayResult> {
  let raw: { id?: unknown; account?: unknown };
  try {
    raw = JSON.parse(body) as typeof raw;
  } catch {
    return { ok: false, reason: "Not JSON." };
  }
  if (typeof raw.id !== "string" || !/^evt_[A-Za-z0-9]+$/.test(raw.id)) return { ok: false, reason: "No event id." };
  if (typeof raw.account !== "string" || !/^acct_[A-Za-z0-9]+$/.test(raw.account)) return { ok: true, did: "skipped" };
  const event = await stripe.events.retrieve(raw.id, {}, { stripeAccount: raw.account });
  return handlePayEvent(rpc, payStripe(stripe), { ...(event as unknown as PayEvent), account: raw.account });
}

/**
 * Refund a paid meeting in full, once. For the host's cancel (the Meetings screen's route calls it after
 * meeting_status canceled). Nothing happens for an unpaid or already refunded meeting.
 */
export async function refundMeeting(meetingId: string): Promise<{ ok: true; refunded: boolean } | { ok: false; reason: string }> {
  const stripe = stripeClient();
  const db = serviceClient();
  if (!stripe || !db) return { ok: false, reason: "Payments aren't set up." };
  const rpc = rpcOf(db);
  const v = await loadMeeting(rpc, { id: meetingId });
  if (!v) return { ok: false, reason: "Meeting not found." };
  try {
    return await refundFor(rpc, payStripe(stripe), v);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "Stripe didn't answer." };
  }
}
