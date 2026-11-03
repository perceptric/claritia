// The plans, in one place (docs/pricing.md): Stripe checkout, Settings › Billing, pricing.md and the database limits
// (plan_caps in supabase/migrations/120_plans.sql) all follow this list. Change both together. The website
// (claritia-site, tools/pricing.py) shows the same numbers.

export type PlanId = "free" | "starter" | "pro" | "business";
export type Interval = "month" | "year";

export type Plan = {
  id: PlanId;
  name: string;
  /** Dollars a month, billed monthly. */
  monthly: number;
  /** Dollars a month when billed yearly (20% off); the year is 12 times this. */
  yearly: number;
  /** Each host past the first, dollars a month (monthly / yearly billing). Null on Free, which has 1 host. */
  host: { monthly: number; yearly: number } | null;
  /** Null means no limit. */
  submissions: number | null;
  aiCredits: number;
  /** Calendars each host can connect. */
  calendars: number | null;
  /** Active meeting types in the workspace. */
  meetingTypes: number | null;
  /** The testing product's limits, for workspaces that still run tests (005, 016). */
  testing: { projects: number | null; minutes: number | null; credits: number | null };
};

export const PLANS: Plan[] = [
  { id: "free", name: "Free", monthly: 0, yearly: 0, host: null, submissions: 250, aiCredits: 100, calendars: 1, meetingTypes: 1, testing: { projects: 1, minutes: 300, credits: 200 } },
  { id: "starter", name: "Starter", monthly: 15, yearly: 12, host: { monthly: 8, yearly: 6 }, submissions: 2000, aiCredits: 500, calendars: 3, meetingTypes: null, testing: { projects: 3, minutes: 2000, credits: 2000 } },
  { id: "pro", name: "Pro", monthly: 39, yearly: 31, host: { monthly: 15, yearly: 12 }, submissions: 5000, aiCredits: 2000, calendars: 10, meetingTypes: null, testing: { projects: null, minutes: 10000, credits: 10000 } },
  { id: "business", name: "Business", monthly: 79, yearly: 63, host: { monthly: 25, yearly: 20 }, submissions: null, aiCredits: 5000, calendars: null, meetingTypes: null, testing: { projects: null, minutes: null, credits: null } },
];

export const PAID: PlanId[] = ["starter", "pro", "business"];
const ORDER: PlanId[] = ["free", "starter", "pro", "business"];

/** A plan by id. Old ids still in the database map to their new plan ("team" became Pro). */
export const planById = (id: string | null | undefined): Plan => PLANS.find((p) => p.id === (id === "team" ? "pro" : id)) ?? PLANS[0]!;
export const isPaidPlan = (plan: unknown): plan is "starter" | "pro" | "business" => PAID.includes(plan as PlanId);
export const isInterval = (v: unknown): v is Interval => v === "month" || v === "year";

/** What's held back to a plan and up. Everything else is on every plan. */
export const FEATURES = {
  // Meetings
  group: "starter",
  polls: "starter",
  one_off: "starter",
  single_use: "starter",
  paid_meetings: "starter",
  booking_brand: "starter",
  round_robin: "pro",
  collective: "pro",
  owner_first: "business",
  double: "business",
  // Forms and sharing
  no_badge: "pro",
  partial: "business",
  link_domain: "business",
  salesforce: "business",
} as const satisfies Record<string, PlanId>;
export type Feature = keyof typeof FEATURES;

/** Whether a plan has a feature. */
export const allows = (plan: string | null | undefined, f: Feature): boolean => ORDER.indexOf(planById(plan).id) >= ORDER.indexOf(FEATURES[f]);

/** The lowest plan with a feature, for the upgrade line. */
export const planFor = (f: Feature): Plan => planById(FEATURES[f]);

/** The meeting kinds each plan can save (src/lib/meetings/check.ts). "one" is on every plan. */
export function kindAllowed(plan: string | null | undefined, kind: string): boolean {
  if (kind === "group" || kind === "round_robin" || kind === "collective" || kind === "owner_first" || kind === "double") return allows(plan, kind);
  return true;
}

/** Hosts past the first, the ones Stripe bills for. */
export const extraHosts = (hosts: number): number => Math.max(0, Math.floor(hosts) - 1);

/** What a plan costs a month with this many hosts, in dollars (a yearly plan's month). */
export function monthlyTotal(plan: Plan, interval: Interval, hosts: number): number {
  const base = interval === "year" ? plan.yearly : plan.monthly;
  const each = plan.host ? (interval === "year" ? plan.host.yearly : plan.host.monthly) : 0;
  return base + each * extraHosts(hosts);
}

/** Stripe's amounts in cents for one billing period: the plan, and each extra host. */
export function cents(plan: Plan, interval: Interval): { plan: number; host: number } {
  const months = interval === "year" ? 12 : 1;
  const base = interval === "year" ? plan.yearly : plan.monthly;
  const each = plan.host ? (interval === "year" ? plan.host.yearly : plan.host.monthly) : 0;
  return { plan: base * months * 100, host: each * months * 100 };
}

/**
 * AI credits for one uncached Tia step a person asked for, by kind (src/lib/ai/cache.ts). A small change is 1; building
 * a whole new form is about 10 (brief 1, plan 1, build 8). A step replayed from the cache is free, and so is work no
 * one asked for in the moment (reading a brand for a booking page, matching templates while someone types).
 */
const CREDIT_COST: Record<string, number> = {
  form_new_brief: 1,
  form_new_plan: 1,
  form_new_build: 8,
  form_new_edit: 1,
  studio_chat: 1,
  studio_translate: 1,
  email_chat: 1,
  router_chat: 1,
};
export const creditCost = (kind: string): number => CREDIT_COST[kind] ?? 0;

/** "2,000" or "Unlimited". */
export const amount = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en-US"));
