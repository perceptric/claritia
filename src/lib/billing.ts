import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cents, isInterval, isPaidPlan, planById, seats, type Interval, type PlanId } from "./plans.ts";
import { APP_URL } from "./site.ts";

// Billing needs one setting: STRIPE_SECRET_KEY. Prices come from src/lib/plans.ts (docs/pricing.md), and the app makes
// its own products, webhook and billing page in Stripe the first time they're needed.
//
// A subscription has one seat line: the plan's price per seat, with a quantity of the seats (the people anyone can
// book, at least 1). It's priced from plans.ts on the way in, so there are no price ids to copy. The plan and interval
// live in the subscription's metadata (only this server sets it), and a line only counts when its price matches the
// plan's.
//
// Before per-seat pricing (November 2026), a subscription had a plan line with 1 seat in it and an extra-seat line for
// the rest. The old plan line costs what one seat does now, so it reads as the seat line; the old extra-seat line
// (LEGACY_EXTRA) still counts its seats, and the next seat sync folds it into the seat line, prorated.

type Paid = Exclude<PlanId, "free">;
type Admin = Pick<SupabaseClient, "from" | "rpc">;

const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.upcoming",
];
const PAYING = new Set(["active", "trialing", "past_due"]);

export const appBase = () => process.env.APP_URL?.trim().replace(/\/+$/, "") || APP_URL;

/** Stripe, when STRIPE_SECRET_KEY is set. */
export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? new Stripe(key) : null;
}

export { isPaidPlan };

// Products ------------------------------------------------------------------------------------------------------

/** Each plan's product in Stripe, plus the old extra-seat products where they were made before per-seat pricing. */
export type Products = Record<`${Paid}:plan`, string> & Partial<Record<`${Paid}:host`, string>>;
const PAID_IDS: Paid[] = ["starter", "pro", "business"];

/** The old extra-seat price in cents, by plan and interval, so a subscription from before per-seat pricing still reads. */
export const LEGACY_EXTRA: Record<Paid, Record<Interval, number>> = {
  starter: { month: 800, year: 7200 },
  pro: { month: 1500, year: 14400 },
  business: { month: 2500, year: 24000 },
};

/** Claritia's products in Stripe, one for each plan. Made once, found by metadata. */
let productsReady: Promise<Products> | null = null;
export function ensureProducts(stripe: Stripe): Promise<Products> {
  productsReady ??= (async () => {
    const found: Partial<Products> = {};
    for await (const p of stripe.products.list({ active: true, limit: 100 })) {
      const key = p.metadata?.claritia_product as keyof Products | undefined;
      if (key && !found[key]) found[key] = p.id;
    }
    for (const id of PAID_IDS) {
      const key = `${id}:plan` as const;
      if (found[key]) continue;
      found[key] = (await stripe.products.create({ name: `Claritia ${planById(id).name}`, metadata: { claritia_product: key } }, { idempotencyKey: `claritia-product-${key}` })).id;
    }
    return found as Products;
  })().catch((e) => {
    productsReady = null;
    throw e;
  });
  return productsReady;
}

/** The seat line's price, for a plan and interval. */
const seatPrice = (products: Products, plan: Paid, interval: Interval) => ({ currency: "usd", product: products[`${plan}:plan`], unit_amount: cents(planById(plan), interval), recurring: { interval } });

/** The checkout line for a plan, an interval and a number of seats. */
export function linesFor(products: Products, plan: Paid, interval: Interval, hosts: number): Stripe.Checkout.SessionCreateParams.LineItem[] {
  return [{ quantity: seats(hosts), price_data: seatPrice(products, plan, interval) }];
}

/** A subscription's seat line, and an old extra-seat line if it still has one, matched by price against its plan. */
export function linesOf(sub: Stripe.Subscription, plan: Paid, interval: Interval) {
  const right = (i: Stripe.SubscriptionItem) => i.price.recurring?.interval === interval && (i.price.recurring?.interval_count ?? 1) === 1;
  const items = sub.items.data;
  const seat = items.find((i) => right(i) && i.price.unit_amount === cents(planById(plan), interval) && (i.quantity ?? 1) >= 1);
  const legacy = items.find((i) => i !== seat && right(i) && i.price.unit_amount === LEGACY_EXTRA[plan][interval]);
  return { seat, legacy, seats: seat ? (seat.quantity ?? 1) + (legacy?.quantity ?? 0) : 0 };
}

// Webhook and billing page ----------------------------------------------------------------------------------------

/** Make sure Stripe sends subscription events to this app. Done once per server start. */
let webhookReady: Promise<void> | null = null;
export function ensureWebhook(stripe: Stripe) {
  webhookReady ??= (async () => {
    const url = `${appBase()}/api/billing/webhook`;
    // Stripe only sends to public https addresses, so local runs skip this.
    if (!url.startsWith("https://")) return;
    const all = await stripe.webhookEndpoints.list({ limit: 100 });
    const found = all.data.find((w) => w.url === url && w.status === "enabled");
    if (found && EVENTS.every((e) => found.enabled_events.includes(e))) return;
    if (found) await stripe.webhookEndpoints.update(found.id, { enabled_events: EVENTS });
    else await stripe.webhookEndpoints.create({ url, enabled_events: EVENTS, description: "Claritia plans" });
  })().catch((e) => {
    webhookReady = null;
    throw e;
  });
  return webhookReady;
}

/** Stripe's billing page, set up by the app: change card, see invoices, cancel. Plan changes happen in Settings. */
let portalConfig: Promise<string> | null = null;
export function ensurePortal(stripe: Stripe) {
  portalConfig ??= (async () => {
    const all = await stripe.billingPortal.configurations.list({ limit: 100, active: true });
    const ours = all.data.find((c) => c.metadata?.claritia === "2");
    if (ours) return ours.id;
    const made = await stripe.billingPortal.configurations.create({
      metadata: { claritia: "2" },
      default_return_url: `${appBase()}/settings/billing`,
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email", "address", "tax_id"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
      },
    });
    return made.id;
  })().catch((e) => {
    portalConfig = null;
    throw e;
  });
  return portalConfig;
}

// Subscriptions -----------------------------------------------------------------------------------------------------

const at = (s: number | undefined) => (s ? new Date(s * 1000).toISOString() : null);

/**
 * Copy a subscription onto its workspace's plan. The workspace, plan and interval come from the subscription's
 * metadata, which only this server sets. The plan only counts when its seat line is priced right; the seats are that
 * line's quantity (plus an old extra-seat line's). A canceled or unpaid subscription puts the workspace back on Free.
 */
export async function applySubscription(admin: Admin, sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  let workspaceId = sub.metadata?.workspace_id || null;
  if (!workspaceId) {
    const { data } = await admin.from("workspace_billing").select("workspace_id").eq("stripe_customer_id", customerId).maybeSingle();
    workspaceId = (data as { workspace_id: string } | null)?.workspace_id ?? null;
  }
  if (!workspaceId) return { ok: false as const, reason: "No workspace for this subscription." };

  const asked = sub.metadata?.plan === "team" ? "pro" : sub.metadata?.plan;
  const interval: Interval = isInterval(sub.metadata?.interval) ? sub.metadata.interval : "month";
  const lines = isPaidPlan(asked) ? linesOf(sub, asked, interval) : null;
  const plan: PlanId = PAYING.has(sub.status) && lines?.seat ? (asked as PlanId) : "free";
  const hosts = plan === "free" ? 1 : lines!.seats;
  const item = lines?.seat ?? sub.items.data[0];
  const { error } = await admin.from("workspace_billing").upsert(
    {
      workspace_id: workspaceId,
      plan,
      billing_interval: plan === "free" ? "month" : interval,
      hosts,
      status: sub.status,
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.status === "canceled" ? null : sub.id,
      period_start: at(item?.current_period_start),
      period_end: at(item?.current_period_end),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id" },
  );
  if (error) throw new Error(error.message);
  return { ok: true as const, workspaceId, plan, hosts };
}

type BillingRow = { plan: string; billing_interval?: string | null; stripe_subscription_id: string | null; hosts?: number | null };

async function billingRow(admin: Admin, ws: string): Promise<BillingRow | null> {
  const { data, error } = await admin.from("workspace_billing").select("plan, billing_interval, stripe_subscription_id, hosts").eq("workspace_id", ws).maybeSingle();
  if (error) throw new Error(error.message);
  return data as BillingRow | null;
}

/** The people anyone can book in the workspace now (plan_hosts in 120). */
export async function hostsNow(admin: Admin, ws: string): Promise<number> {
  const { data, error } = await admin.rpc("plan_hosts", { p_ws: ws });
  if (error) throw new Error(`plan_hosts: ${error.message}`);
  return Math.max(1, Number(data) || 0);
}

/**
 * Keep Stripe's seat quantity in step with the people anyone can book. Runs after a meeting type is saved, after a
 * plan change and before each invoice (invoice.upcoming), so a renewal always bills the right count. An old extra-seat
 * line is folded into the seat line in the same update. Changes are prorated. Returns the seats billed.
 */
export async function syncHosts(stripe: Stripe, admin: Admin, ws: string): Promise<number | null> {
  const b = await billingRow(admin, ws);
  if (!b || !isPaidPlan(b.plan) || !b.stripe_subscription_id) return null;
  const interval: Interval = isInterval(b.billing_interval) ? b.billing_interval : "month";
  const [sub, hosts] = await Promise.all([stripe.subscriptions.retrieve(b.stripe_subscription_id), hostsNow(admin, ws)]);
  if (!PAYING.has(sub.status)) return null;
  const { seat, legacy } = linesOf(sub, b.plan, interval);
  // No seat line at this plan's price: the subscription isn't ours to change (applySubscription treats it as Free).
  if (!seat) return null;
  const want = seats(hosts);
  if (legacy) {
    // One update, so the seats are never billed twice or dropped between the two changes.
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: seat.id, quantity: want }, { id: legacy.id, deleted: true }],
      proration_behavior: "create_prorations",
    });
  } else if ((seat.quantity ?? 1) !== want) {
    await stripe.subscriptionItems.update(seat.id, { quantity: want, proration_behavior: "create_prorations" });
  }
  const { error } = await admin.from("workspace_billing").update({ hosts: want, updated_at: new Date().toISOString() }).eq("workspace_id", ws);
  if (error) throw new Error(error.message);
  return want;
}

/**
 * Move a paying workspace to another paid plan or interval: the seat line (and an old extra-seat line) is swapped for
 * the new plan's seat line in one update, prorated. Returns the subscription as Stripe now has it.
 */
export async function changePlan(stripe: Stripe, admin: Admin, ws: string, plan: Paid, interval: Interval): Promise<Stripe.Subscription> {
  const b = await billingRow(admin, ws);
  if (!b || !isPaidPlan(b.plan) || !b.stripe_subscription_id) throw new Error("This workspace has no paid plan to change.");
  const from: Interval = isInterval(b.billing_interval) ? b.billing_interval : "month";
  const [sub, hosts, products] = await Promise.all([stripe.subscriptions.retrieve(b.stripe_subscription_id), hostsNow(admin, ws), ensureProducts(stripe)]);
  const old = linesOf(sub, b.plan, from);
  // Every line that isn't ours stays as it is; ours are replaced.
  const ours = [old.seat?.id, old.legacy?.id].filter((id): id is string => !!id);
  const items: Stripe.SubscriptionUpdateParams.Item[] = [
    ...ours.map((id) => ({ id, deleted: true })),
    { price_data: seatPrice(products, plan, interval), quantity: seats(hosts) },
  ];
  return stripe.subscriptions.update(sub.id, {
    items,
    proration_behavior: "create_prorations",
    metadata: { ...sub.metadata, workspace_id: ws, plan, interval },
  });
}

/**
 * A webhook call. Anyone can post here, so only the event's id is read from the body. The event itself is
 * fetched from Stripe with the secret key, which proves it's real without a webhook signing secret.
 */
export async function handleWebhook(stripe: Stripe, admin: Admin, body: string) {
  let id: unknown;
  try {
    id = (JSON.parse(body) as { id?: unknown }).id;
  } catch {
    return { ok: false as const, reason: "Not JSON." };
  }
  if (typeof id !== "string" || !/^evt_[A-Za-z0-9]+$/.test(id)) return { ok: false as const, reason: "No event id." };
  const event = await stripe.events.retrieve(id);
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode !== "subscription" || !s.subscription) return { ok: true as const, skipped: true };
      // Fetch the subscription fresh, so an old event never undoes a newer change.
      return applySubscription(admin, await stripe.subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id));
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return applySubscription(admin, await stripe.subscriptions.retrieve(event.data.object.id));
    case "invoice.upcoming": {
      // Before a renewal is billed: the seat count is brought up to date.
      const inv = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null; parent?: { subscription_details?: { subscription?: string | Stripe.Subscription } | null } | null };
      const ref = inv.parent?.subscription_details?.subscription ?? inv.subscription;
      const subId = typeof ref === "string" ? ref : ref?.id;
      if (!subId) return { ok: true as const, skipped: true };
      const r = await applySubscription(admin, await stripe.subscriptions.retrieve(subId));
      if (r.ok && r.plan !== "free") await syncHosts(stripe, admin, r.workspaceId);
      return r;
    }
    default:
      return { ok: true as const, skipped: true };
  }
}
