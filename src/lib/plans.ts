// The plans, in one place (docs/pricing.md): Stripe checkout, Settings › Billing, pricing.md and the database limits
// (plan_caps in supabase/migrations/120_plans.sql, plan_sends in 144_send_limits.sql) all follow this list. Change both together. The website
// (claritia-site, tools/pricing.py) shows the same numbers.

export type PlanId = "free" | "starter" | "pro" | "business";
export type Interval = "month" | "year";

export type Plan = {
  id: PlanId;
  name: string;
  /** Dollars per seat per month, billed monthly. A seat is a person people can book. */
  monthly: number;
  /** Dollars per seat per month when billed yearly (20% off); the year is 12 times this. */
  yearly: number;
  /** Null means no limit. */
  submissions: number | null;
  aiCredits: number;
  /** Workflow and campaign emails a month (plan_sends in 144_send_limits.sql). Past it they wait, never dropped. */
  sends: number;
  /** Calendar accounts each seat can connect. */
  calendars: number | null;
  /** Active meeting types in the workspace. */
  meetingTypes: number | null;
  /** The testing product's limits, for workspaces that still run tests (005, 016). */
  testing: { projects: number | null; minutes: number | null; credits: number | null };
};

export const PLANS: Plan[] = [
  { id: "free", name: "Free", monthly: 0, yearly: 0, submissions: 250, aiCredits: 100, sends: 1000, calendars: 1, meetingTypes: 1, testing: { projects: 1, minutes: 300, credits: 200 } },
  { id: "starter", name: "Starter", monthly: 15, yearly: 12, submissions: 2000, aiCredits: 500, sends: 10000, calendars: 6, meetingTypes: null, testing: { projects: 3, minutes: 2000, credits: 2000 } },
  { id: "pro", name: "Pro", monthly: 39, yearly: 31, submissions: 5000, aiCredits: 2000, sends: 50000, calendars: 6, meetingTypes: null, testing: { projects: null, minutes: 10000, credits: 10000 } },
  { id: "business", name: "Business", monthly: 79, yearly: 63, submissions: null, aiCredits: 5000, sends: 200000, calendars: 6, meetingTypes: null, testing: { projects: null, minutes: null, credits: null } },
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

/** The Claritia badge on live forms (docs/pricing.md Part 3): the full badge on Free, a small one on Starter, none from Pro. */
export const formBadge = (plan: string | null | undefined): "full" | "small" | "none" => (allows(plan, "no_badge") ? "none" : planById(plan).id === "free" ? "full" : "small");

/** The lowest plan with a feature, for the upgrade line. */
export const planFor = (f: Feature): Plan => planById(FEATURES[f]);

/** The meeting kinds each plan can save (src/lib/meetings/check.ts). "one" is on every plan. */
export function kindAllowed(plan: string | null | undefined, kind: string): boolean {
  if (kind === "group" || kind === "round_robin" || kind === "collective" || kind === "owner_first" || kind === "double") return allows(plan, kind);
  return true;
}

/** The seats Stripe bills for: the people anyone can book, never fewer than 1. */
export const seats = (hosts: number): number => Math.max(1, Math.floor(hosts) || 0);

/** What a plan costs a month with this many seats, in dollars (a yearly plan's month). */
export function monthlyTotal(plan: Plan, interval: Interval, hosts: number): number {
  return (interval === "year" ? plan.yearly : plan.monthly) * seats(hosts);
}

/** Stripe's amount in cents for one seat for one billing period. */
export const cents = (plan: Plan, interval: Interval): number => (interval === "year" ? plan.yearly * 12 : plan.monthly) * 100;

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
