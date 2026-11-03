import assert from "node:assert/strict";
import { test } from "node:test";
import Stripe from "stripe";
import { applySubscription, changePlan, handleWebhook, LEGACY_EXTRA, linesFor, linesOf, syncHosts, type Products } from "../src/lib/billing.ts";
import { allows, cents, creditCost, kindAllowed, monthlyTotal, planById, PLANS, seats } from "../src/lib/plans.ts";
import { fetchReceived, firstInbox, readRecipient } from "../src/lib/inbound.ts";


test("inbox addresses map to a project's inbox id", () => {
  assert.deepEqual(readRecipient("a1b2c3d4-signup-1f2e3d@inbox.tryclaritia.com", "inbox.tryclaritia.com"), { inboxId: "a1b2c3d4", address: "a1b2c3d4-signup-1f2e3d@inbox.tryclaritia.com" });
  assert.equal(readRecipient("Sam <A1B2C3D4-X@Inbox.TryClaritia.com>", "inbox.tryclaritia.com")?.inboxId, "a1b2c3d4");
  assert.equal(readRecipient("a1b2c3d4@evil.com", "inbox.tryclaritia.com"), null);
  assert.equal(readRecipient("nothex-x@inbox.tryclaritia.com", "inbox.tryclaritia.com"), null);
  assert.equal(firstInbox(["boss@acme.com", "a1b2c3d4-x-123456@inbox.tryclaritia.com"], "inbox.tryclaritia.com")?.address, "a1b2c3d4-x-123456@inbox.tryclaritia.com");
  assert.equal(firstInbox("boss@acme.com", "inbox.tryclaritia.com"), null);
});

test("received emails are fetched from Resend with our key", async () => {
  const calls: { url: string; auth: string | null }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    if (url.endsWith("/missing")) return new Response("{}", { status: 404 });
    return Response.json({ id: "em_1", from: "Acme <no-reply@acme.com>", to: ["a1b2c3d4-signup-abc123@inbox.tryclaritia.com"], subject: "Your code", text: null, html: "<p>Code 123456</p>" });
  }) as typeof fetch;
  const e = await fetchReceived("re_key", "em_1", fake);
  assert.equal(calls[0]!.url, "https://api.resend.com/emails/receiving/em_1");
  assert.equal(calls[0]!.auth, "Bearer re_key");
  assert.equal(e.text, "");
  assert.equal(e.html, "<p>Code 123456</p>");
  assert.deepEqual(e.to, ["a1b2c3d4-signup-abc123@inbox.tryclaritia.com"]);
  await assert.rejects(() => fetchReceived("re_key", "missing", fake), /404/);
});

// Plans ---------------------------------------------------------------------------------------------------------

test("the plan list matches docs/pricing.md", () => {
  assert.deepEqual(PLANS.map((p) => [p.id, p.monthly, p.yearly, p.submissions, p.aiCredits, p.calendars]), [
    ["free", 0, 0, 250, 100, 1],
    ["starter", 15, 12, 2000, 500, 6],
    ["pro", 39, 31, 5000, 2000, 6],
    ["business", 79, 63, null, 5000, 6],
  ]);
  // Yearly is 20% off, rounded to whole dollars.
  for (const p of PLANS) assert.ok(Math.abs(p.yearly - p.monthly * 0.8) < 1, p.id);
  assert.equal(planById("team").id, "pro", "the old Team plan is Pro");
  assert.equal(planById("nope").id, "free");
});

test("totals: every seat costs the plan's price", () => {
  const pro = planById("pro");
  assert.equal(monthlyTotal(pro, "month", 1), 39);
  assert.equal(monthlyTotal(pro, "month", 10), 390);
  assert.equal(monthlyTotal(pro, "year", 3), 93);
  assert.equal(monthlyTotal(planById("free"), "month", 5), 0);
  assert.equal(seats(0), 1, "a paid plan always bills at least 1 seat");
  assert.equal(seats(1), 1);
  assert.equal(seats(4.7), 4);
  assert.equal(seats(Number.NaN), 1);
  assert.equal(cents(pro, "month"), 3900);
  assert.equal(cents(pro, "year"), 37200);
});

test("features sit on their plan and up", () => {
  assert.equal(allows("free", "polls"), false);
  assert.equal(allows("starter", "polls"), true);
  assert.equal(allows("starter", "round_robin"), false);
  assert.equal(allows("pro", "round_robin"), true);
  assert.equal(allows("team", "round_robin"), true, "old Team workspaces keep Pro's features");
  assert.equal(allows("pro", "owner_first"), false);
  assert.equal(allows("business", "link_domain"), true);
  assert.equal(allows("pro", "link_domain"), false);
  assert.equal(kindAllowed("free", "one"), true);
  assert.equal(kindAllowed("free", "group"), false);
  assert.equal(kindAllowed("starter", "collective"), false);
  assert.equal(kindAllowed("business", "double"), true);
});

test("AI credits: a new form is about 10, a small change 1, unasked work nothing", () => {
  assert.equal(creditCost("form_new_brief") + creditCost("form_new_plan") + creditCost("form_new_build"), 10);
  assert.equal(creditCost("studio_chat"), 1);
  assert.equal(creditCost("brand_book"), 0, "reading a brand for a public booking page is never charged");
  assert.equal(creditCost("template_match"), 0);
});

// Stripe --------------------------------------------------------------------------------------------------------

const PRODUCTS: Products = { "starter:plan": "prod_sp", "pro:plan": "prod_pp", "business:plan": "prod_bp" };

test("checkout: one line at the plan's price per seat, as many as the seats", () => {
  const one = linesFor(PRODUCTS, "pro", "month", 1);
  assert.equal(one.length, 1);
  assert.deepEqual([one[0]!.price_data?.unit_amount, one[0]!.price_data?.product, one[0]!.price_data?.recurring?.interval, one[0]!.quantity], [3900, "prod_pp", "month", 1]);
  const four = linesFor(PRODUCTS, "starter", "year", 4);
  assert.equal(four.length, 1);
  assert.deepEqual([four[0]!.price_data?.unit_amount, four[0]!.quantity], [14400, 4], "Starter yearly: $12 a month for 12 months, for each of 4 seats");
  assert.equal(linesFor(PRODUCTS, "business", "month", 0)[0]!.quantity, 1, "never fewer than 1 seat");
});

/** A stand-in for the admin Supabase client: workspace_billing, and plan_hosts. */
function fakeAdmin(rows: Record<string, unknown>[] = [], hosts = 1) {
  return {
    rows,
    hosts,
    rpc: async (fn: string) => (fn === "plan_hosts" ? { data: hosts, error: null } : { data: null, error: { message: `no ${fn}` } }),
    from: () => ({
      select: () => ({ eq: (k: string, v: unknown) => ({ maybeSingle: async () => ({ data: rows.find((r) => r[k] === v) ?? null, error: null }) }) }),
      upsert: async (row: Record<string, unknown>) => {
        const at = rows.findIndex((r) => r.workspace_id === row.workspace_id);
        if (at >= 0) rows[at] = { ...rows[at], ...row };
        else rows.push(row);
        return { error: null };
      },
      update: (patch: Record<string, unknown>) => ({
        eq: async (k: string, v: unknown) => {
          const r = rows.find((x) => x[k] === v);
          if (r) Object.assign(r, patch);
          return { error: null };
        },
      }),
    }),
  };
}
type Item = { id: string; quantity: number; price: { unit_amount: number; recurring: { interval: string; interval_count: number } }; current_period_start: number; current_period_end: number };
const item = (id: string, cents: number, quantity = 1, interval = "month"): Item => ({ id, quantity, price: { unit_amount: cents, recurring: { interval, interval_count: 1 } }, current_period_start: 1_760_000_000, current_period_end: 1_762_600_000 });
const sub = (status: string, items: Item[], metadata: Record<string, string> = {}) => ({ id: "sub_1", status, customer: "cus_1", metadata, items: { data: items } }) as unknown as Stripe.Subscription;

test("a subscription sets the plan, interval and seats; canceling puts it back on Free", async () => {
  const admin = fakeAdmin([{ workspace_id: "ws1", stripe_customer_id: "cus_1", plan: "free" }]);
  await applySubscription(admin as never, sub("active", [item("si_s", 3900, 5)], { plan: "pro", interval: "month" }));
  assert.deepEqual([admin.rows[0]!.plan, admin.rows[0]!.billing_interval, admin.rows[0]!.hosts], ["pro", "month", 5]);
  assert.equal(admin.rows[0]!.period_end, new Date(1_762_600_000_000).toISOString());
  await applySubscription(admin as never, sub("active", [item("si_s", 75600, 1, "year")], { plan: "business", interval: "year" }));
  assert.deepEqual([admin.rows[0]!.plan, admin.rows[0]!.billing_interval, admin.rows[0]!.hosts], ["business", "year", 1]);
  await applySubscription(admin as never, sub("past_due", [item("si_s", 1500)], { plan: "starter" }));
  assert.equal(admin.rows[0]!.plan, "starter", "a missed payment keeps the plan while Stripe retries");
  await applySubscription(admin as never, sub("canceled", [item("si_s", 1500, 3)], { plan: "starter" }));
  assert.deepEqual([admin.rows[0]!.plan, admin.rows[0]!.hosts, admin.rows[0]!.stripe_subscription_id], ["free", 1, null]);
});

test("an old subscription, 1 seat in the plan plus an extra-seat line, still reads with every seat", async () => {
  const admin = fakeAdmin([{ workspace_id: "ws1", stripe_customer_id: "cus_1", plan: "free" }]);
  // Before per-seat pricing: Pro at $39 for the first seat, then 4 more at $15.
  await applySubscription(admin as never, sub("active", [item("si_p", 3900), item("si_h", 1500, 4)], { plan: "pro", interval: "month" }));
  assert.deepEqual([admin.rows[0]!.plan, admin.rows[0]!.hosts], ["pro", 5]);
  // Starter yearly: $12 x 12 for the first, $6 x 12 for each of 2 more.
  await applySubscription(admin as never, sub("active", [item("si_p", 14400, 1, "year"), item("si_h", 7200, 2, "year")], { plan: "starter", interval: "year" }));
  assert.deepEqual([admin.rows[0]!.plan, admin.rows[0]!.hosts], ["starter", 3]);
});

test("a plan only counts at its own price", async () => {
  const admin = fakeAdmin([{ workspace_id: "ws1", stripe_customer_id: "cus_1", plan: "free" }]);
  await applySubscription(admin as never, sub("active", [item("si_s", 1500, 3)], { plan: "business" }));
  assert.equal(admin.rows[0]!.plan, "free", "Business paid at the Starter price never counts");
  await applySubscription(admin as never, sub("active", [item("si_s", 3100)], { plan: "pro", interval: "month" }));
  assert.equal(admin.rows[0]!.plan, "free", "the yearly month's price billed monthly never counts");
  await applySubscription(admin as never, sub("active", [item("si_h", 1500, 4)], { plan: "pro", interval: "month" }));
  assert.equal(admin.rows[0]!.plan, "free", "an old extra-seat line alone is no plan");
  await applySubscription(admin as never, sub("active", [item("si_s", 3900)], { plan: "free" }));
  assert.equal(admin.rows[0]!.plan, "free", "only paid plans come from Stripe");
  await applySubscription(admin as never, sub("active", [item("si_s", 3900)], { plan: "team" }));
  assert.equal(admin.rows[0]!.plan, "pro", "an old Team subscription at Pro's price is Pro");
  const none = await applySubscription(fakeAdmin() as never, sub("active", [item("si_s", 3900)], { plan: "pro" }));
  assert.equal(none.ok, false);
});

test("linesOf finds the seat line, and an old extra-seat line, by price", () => {
  const s = sub("active", [item("si_other", 999), item("si_h", 1500, 2), item("si_s", 3900, 1)]);
  const l = linesOf(s, "pro", "month");
  assert.deepEqual([l.seat?.id, l.legacy?.id, l.seats], ["si_s", "si_h", 3]);
  const now = linesOf(sub("active", [item("si_s", 3900, 6)]), "pro", "month");
  assert.deepEqual([now.seat?.id, now.legacy, now.seats], ["si_s", undefined, 6]);
  assert.equal(linesOf(s, "pro", "year").seat, undefined);
  assert.deepEqual(Object.keys(LEGACY_EXTRA), ["starter", "pro", "business"]);
});

/** A stand-in for Stripe that records what changes. */
function fakeStripe(s: Stripe.Subscription) {
  const calls: [string, unknown][] = [];
  return {
    calls,
    subscriptions: {
      retrieve: async () => s,
      update: async (id: string, p: unknown) => (calls.push(["sub.update", p]), s),
    },
    subscriptionItems: {
      update: async (id: string, p: unknown) => (calls.push([`item.update ${id}`, p]), {}),
      del: async (id: string) => (calls.push([`item.del ${id}`, null]), {}),
      create: async (p: unknown) => (calls.push(["item.create", p]), {}),
    },
    products: {
      list: () => ({ async *[Symbol.asyncIterator]() { for (const [k, id] of Object.entries(PRODUCTS)) yield { id, metadata: { claritia_product: k } }; } }),
      create: async () => {
        throw new Error("products exist");
      },
    },
  };
}

test("seat sync: Stripe's seat count follows the people anyone can book", async () => {
  const paid = { workspace_id: "ws1", plan: "pro", billing_interval: "month", stripe_subscription_id: "sub_1", hosts: 1 };
  // One seat to four: the seat line's quantity goes up.
  let admin = fakeAdmin([{ ...paid }], 4);
  let stripe = fakeStripe(sub("active", [item("si_s", 3900, 1)], { plan: "pro" }));
  assert.equal(await syncHosts(stripe as never, admin as never, "ws1"), 4);
  assert.deepEqual(stripe.calls, [["item.update si_s", { quantity: 4, proration_behavior: "create_prorations" }]]);
  assert.equal(admin.rows[0]!.hosts, 4);
  // Four to two: it drops.
  admin = fakeAdmin([{ ...paid, hosts: 4 }], 2);
  stripe = fakeStripe(sub("active", [item("si_s", 3900, 4)], { plan: "pro" }));
  await syncHosts(stripe as never, admin as never, "ws1");
  assert.deepEqual(stripe.calls, [["item.update si_s", { quantity: 2, proration_behavior: "create_prorations" }]]);
  // Nobody bookable: still 1 seat, never 0.
  admin = fakeAdmin([{ ...paid, hosts: 2 }], 0);
  stripe = fakeStripe(sub("active", [item("si_s", 3900, 2)], { plan: "pro" }));
  assert.equal(await syncHosts(stripe as never, admin as never, "ws1"), 1);
  assert.deepEqual(stripe.calls, [["item.update si_s", { quantity: 1, proration_behavior: "create_prorations" }]]);
  // Already right: nothing changes. Free and canceled workspaces are never touched.
  admin = fakeAdmin([{ ...paid, hosts: 3 }], 3);
  stripe = fakeStripe(sub("active", [item("si_s", 3900, 3)], { plan: "pro" }));
  await syncHosts(stripe as never, admin as never, "ws1");
  assert.equal(stripe.calls.length, 0);
  assert.equal(await syncHosts(stripe as never, fakeAdmin([{ workspace_id: "ws1", plan: "free" }], 9) as never, "ws1"), null);
  stripe = fakeStripe(sub("canceled", [item("si_s", 3900)], { plan: "pro" }));
  assert.equal(await syncHosts(stripe as never, fakeAdmin([{ ...paid }], 9) as never, "ws1"), null);
  assert.equal(stripe.calls.length, 0);
  // A subscription with no seat line at this plan's price is never changed.
  stripe = fakeStripe(sub("active", [item("si_x", 999, 2)], { plan: "pro" }));
  assert.equal(await syncHosts(stripe as never, fakeAdmin([{ ...paid }], 5) as never, "ws1"), null);
  assert.equal(stripe.calls.length, 0);
});

test("seat sync folds an old extra-seat line into the seat line in one update", async () => {
  const paid = { workspace_id: "ws1", plan: "pro", billing_interval: "month", stripe_subscription_id: "sub_1", hosts: 4 };
  // Old: $39 for the first seat plus 3 extra at $15. Still 4 people bookable.
  let admin = fakeAdmin([{ ...paid }], 4);
  let stripe = fakeStripe(sub("active", [item("si_p", 3900, 1), item("si_h", 1500, 3), item("si_tax", 123)], { plan: "pro" }));
  assert.equal(await syncHosts(stripe as never, admin as never, "ws1"), 4);
  assert.deepEqual(stripe.calls, [["sub.update", { items: [{ id: "si_p", quantity: 4 }, { id: "si_h", deleted: true }], proration_behavior: "create_prorations" }]]);
  assert.equal(admin.rows[0]!.hosts, 4);
  // The count can change in the same update: 2 people now.
  admin = fakeAdmin([{ ...paid }], 2);
  stripe = fakeStripe(sub("active", [item("si_p", 3900, 1), item("si_h", 1500, 3)], { plan: "pro" }));
  await syncHosts(stripe as never, admin as never, "ws1");
  assert.deepEqual(stripe.calls, [["sub.update", { items: [{ id: "si_p", quantity: 2 }, { id: "si_h", deleted: true }], proration_behavior: "create_prorations" }]]);
  // Run twice (a retried webhook): once folded, the second run changes nothing.
  admin = fakeAdmin([{ ...paid }], 2);
  stripe = fakeStripe(sub("active", [item("si_p", 3900, 2)], { plan: "pro" }));
  await syncHosts(stripe as never, admin as never, "ws1");
  assert.equal(stripe.calls.length, 0);
});

test("a plan change swaps our lines for the new seat line, prorated, and keeps others", async () => {
  const admin = fakeAdmin([{ workspace_id: "ws1", plan: "starter", billing_interval: "month", stripe_subscription_id: "sub_1" }], 3);
  const stripe = fakeStripe(sub("active", [item("si_p", 1500), item("si_h", 800, 2), item("si_tax", 123)], { plan: "starter", workspace_id: "ws1" }));
  await changePlan(stripe as never, admin as never, "ws1", "business", "year");
  const [name, p] = stripe.calls[0] as [string, { items: Record<string, unknown>[]; proration_behavior: string; metadata: Record<string, string> }];
  assert.equal(name, "sub.update");
  assert.equal(p.proration_behavior, "create_prorations");
  assert.deepEqual(p.metadata, { plan: "business", workspace_id: "ws1", interval: "year" });
  assert.deepEqual(p.items.slice(0, 2), [{ id: "si_p", deleted: true }, { id: "si_h", deleted: true }], "the old plan line and extra-seat line go");
  assert.equal(p.items.some((i) => i.id === "si_tax"), false, "a line that isn't ours stays");
  assert.equal(p.items.length, 3);
  const seat = p.items[2] as { quantity: number; price_data: { unit_amount: number; product: string; recurring: { interval: string } } };
  assert.deepEqual([seat.quantity, seat.price_data.unit_amount, seat.price_data.product, seat.price_data.recurring.interval], [3, 75600, "prod_bp", "year"]);
  await assert.rejects(() => changePlan(stripe as never, fakeAdmin([{ workspace_id: "ws1", plan: "free" }]) as never, "ws1", "pro", "month"), /no paid plan/);
});

test("the webhook trusts only events it can fetch back from Stripe", async () => {
  const events: Record<string, unknown> = {
    evt_real: { id: "evt_real", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } },
    evt_soon: { id: "evt_soon", type: "invoice.upcoming", data: { object: { parent: { subscription_details: { subscription: "sub_1" } } } } },
  };
  const s = sub("active", [item("si_p", 1500)], { plan: "starter", workspace_id: "ws9", interval: "month" });
  const stripe = {
    ...fakeStripe(s),
    events: {
      retrieve: async (id: string) => {
        if (!events[id]) throw new Error("No such event");
        return events[id];
      },
    },
  };
  const admin = fakeAdmin([], 2);
  const ok = await handleWebhook(stripe as never, admin as never, JSON.stringify({ id: "evt_real", type: "customer.subscription.updated", data: { object: { plan: "business" } } }));
  assert.equal(ok.ok, true);
  assert.equal(admin.rows[0]!.plan, "starter", "the posted body is ignored; Stripe's copy is used");
  // Before a renewal: the seat count is brought up to date.
  await handleWebhook(stripe as never, admin as never, JSON.stringify({ id: "evt_soon" }));
  assert.deepEqual(stripe.calls[0], ["item.update si_p", { quantity: 2, proration_behavior: "create_prorations" }]);
  assert.equal(admin.rows[0]!.hosts, 2);
  await assert.rejects(() => handleWebhook(stripe as never, admin as never, JSON.stringify({ id: "evt_fake" })));
  assert.equal((await handleWebhook(stripe as never, admin as never, "not json")).ok, false);
  assert.equal((await handleWebhook(stripe as never, admin as never, JSON.stringify({ id: "../x" }))).ok, false);
});
