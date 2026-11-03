import "server-only";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cents, extraHosts, isInterval, isPaidPlan, planById, type Interval, type PlanId } from "./plans.ts";
import { APP_URL } from "./site.ts";

// Billing needs one setting: STRIPE_SECRET_KEY. Prices come from src/lib/plans.ts (docs/pricing.md), and the app makes
// its own products, webhook and billing page in Stripe the first time they're needed.
//
// A subscription has a plan line (quantity 1) and, with more than one host, an extra-host line whose quantity is the
// hosts past the first. Both are priced from plans.ts on the way in, so there are no price ids to copy. The plan and
// interval live in the subscription's metadata (only this server sets it), and a line only counts when its price
// matches the plan's.

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

export type Products = Record<`${Paid}:${"plan" | "host"}`, string>;
const PAID_IDS: Paid[] = ["starter", "pro", "business"];

/** Claritia's products in Stripe, one for each plan and one for its extra hosts. Made once, found by metadata. */
let productsReady: Promise<Products> | null = null;
export function ensureProducts(stripe: Stripe): Promise<Products> {
  productsReady ??= (async () => {
    const found: Partial<Products> = {};
    for await (const p of stripe.products.list({ active: true, limit: 100 })) {
      const key = p.metadata?.claritia_product as keyof Products | undefined;
      if (key && !found[key]) found[key] = p.id;
    }
    for (const id of PAID_IDS) {
      for (const kind of ["plan", "host"] as const) {
        const key = `${id}:${kind}` as const;
        if (found[key]) continue;
        const name = kind === "plan" ? `Claritia ${planById(id).name}` : `Claritia ${planById(id).name} extra seat`;
        found[key] = (await stripe.products.create({ name, metadata: { claritia_product: key } }, { idempotencyKey: `claritia-product-${key}` })).id;
      }
    }
    return found as Products;
  })().catch((e) => {
    productsReady = null;
    throw e;
  });
  return productsReady;
}

/** The checkout lines for a plan, an interval and a number of hosts. */
export function linesFor(products: Products, plan: Paid, interval: Interval, hosts: number): Stripe.Checkout.SessionCreateParams.LineItem[] {
  const c = cents(planById(plan), interval);
  const extra = extraHosts(hosts);
  const line = (product: string, amount: number, quantity: number) => ({ quantity, price_data: { currency: "usd", product, unit_amount: amount, recurring: { interval } } });
  return [line(products[`${plan}:plan`], c.plan, 1), ...(extra > 0 ? [line(products[`${plan}:host`], c.host, extra)] : [])];
}

/** A subscription's plan line and extra-host line, matched by price against the plan it says it is. */
export function linesOf(sub: Stripe.Subscription, plan: Paid, interval: Interval) {
  const c = cents(planById(plan), interval);
  const right = (i: Stripe.SubscriptionItem) => i.price.recurring?.interval === interval && (i.price.recurring?.interval_count ?? 1) === 1;
  const items = sub.items.data;
  return {
    plan: items.find((i) => right(i) && i.price.unit_amount === c.plan && (i.quantity ?? 1) === 1),
    host: items.find((i) => right(i) && i.price.unit_amount === c.host),
  };
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
 * metadata, which only this server sets. The plan only counts when its line is priced right; the hosts are 1 plus the
 * extra-host line's quantity. A canceled or unpaid subscription puts the workspace back on Free.
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
  const plan: PlanId = PAYING.has(sub.status) && lines?.plan ? (asked as PlanId) : "free";
  const hosts = plan === "free" ? 1 : 1 + (lines?.host?.quantity ?? 0);
  const item = lines?.plan ?? sub.items.data[0];
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
 * Keep Stripe's extra-host quantity in step with the hosts people can book. Runs after a meeting type is saved, after
 * a plan change and before each invoice (invoice.upcoming), so a renewal always bills the right count. Changes are
 * prorated. Returns the hosts billed.
 */
export async function syncHosts(stripe: Stripe, admin: Admin, ws: string): Promise<number | null> {
  const b = await billingRow(admin, ws);
  if (!b || !isPaidPlan(b.plan) || !b.stripe_subscription_id) return null;
  const interval: Interval = isInterval(b.billing_interval) ? b.billing_interval : "month";
  const [sub, hosts, products] = await Promise.all([stripe.subscriptions.retrieve(b.stripe_subscription_id), hostsNow(admin, ws), ensureProducts(stripe)]);
  if (!PAYING.has(sub.status)) return null;
  const want = extraHosts(hosts);
  const { host } = linesOf(sub, b.plan, interval);
  const have = host?.quantity ?? 0;
  if (want !== have) {
    if (host && want > 0) await stripe.subscriptionItems.update(host.id, { quantity: want, proration_behavior: "create_prorations" });
    else if (host) await stripe.subscriptionItems.del(host.id, { proration_behavior: "create_prorations" });
    else
      await stripe.subscriptionItems.create(
        {
          subscription: sub.id,
          quantity: want,
          proration_behavior: "create_prorations",
          price_data: { currency: "usd", product: products[`${b.plan}:host`], unit_amount: cents(planById(b.plan), interval).host, recurring: { interval } },
        },
        { idempotencyKey: `claritia-hosts-${sub.id}-${want}-${have}` },
      );
  }
  const { error } = await admin.from("workspace_billing").update({ hosts: 1 + want, updated_at: new Date().toISOString() }).eq("workspace_id", ws);
  if (error) throw new Error(error.message);
  return 1 + want;
}

/**
 * Move a paying workspace to another paid plan or interval: the plan line and the host line are swapped for the new
 * prices in one update, prorated. Returns the subscription as Stripe now has it.
 */
export async function changePlan(stripe: Stripe, admin: Admin, ws: string, plan: Paid, interval: Interval): Promise<Stripe.Subscription> {
  const b = await billingRow(admin, ws);
  if (!b || !isPaidPlan(b.plan) || !b.stripe_subscription_id) throw new Error("This workspace has no paid plan to change.");
  const from: Interval = isInterval(b.billing_interval) ? b.billing_interval : "month";
  const [sub, hosts, products] = await Promise.all([stripe.subscriptions.retrieve(b.stripe_subscription_id), hostsNow(admin, ws), ensureProducts(stripe)]);
  const old = linesOf(sub, b.plan, from);
  const c = cents(planById(plan), interval);
  const extra = extraHosts(hosts);
  const price = (kind: "plan" | "host", amount: number) => ({ currency: "usd", product: products[`${plan}:${kind}`], unit_amount: amount, recurring: { interval } });
  // Every line that isn't ours stays as it is; ours are replaced.
  const ours = new Set([old.plan?.id, old.host?.id].filter(Boolean));
  const items: Stripe.SubscriptionUpdateParams.Item[] = [
    ...[...ours].map((id) => ({ id: id as string, deleted: true })),
    { price_data: price("plan", c.plan), quantity: 1 },
    ...(extra > 0 ? [{ price_data: price("host", c.host), quantity: extra }] : []),
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
      // Before a renewal is billed: the host count is brought up to date.
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
