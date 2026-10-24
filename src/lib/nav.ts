// The sidebar (docs/app-structure.md Part 1): CRM, Automation, Routing, Scheduling, Email, Site, Ads and Settings.
// CRM comes first and the app opens on Contacts. An item is a route, or one page inside a route (Routing and
// Scheduling have several). Old addresses keep working: they forward to their new page.

export type Route =
  | "contacts"
  | "companies"
  | "opportunities"
  | "meetings"
  | "objects"
  | "workflows"
  | "forms"
  | "signals"
  | "enrichment"
  | "routing"
  | "scheduling"
  | "segments"
  | "templates"
  | "analytics"
  | "pages"
  | "ads"
  | "settings";

export type GroupKey = "crm" | "automation" | "routing" | "scheduling" | "email" | "site" | "ads" | "settings";

/** A group's color tile (docs/brand.md: sidebar groups) and its title; empty titles draw a rule. */
export const GROUPS: { key: GroupKey; label: string; tone: "sky" | "clay" | "sage" | "butter" | null }[] = [
  { key: "crm", label: "CRM", tone: "sky" },
  { key: "automation", label: "Automation", tone: "clay" },
  { key: "routing", label: "Routing", tone: "sage" },
  { key: "scheduling", label: "Scheduling", tone: "butter" },
  { key: "email", label: "Email", tone: null },
  { key: "site", label: "Site", tone: null },
  { key: "ads", label: "", tone: null },
  { key: "settings", label: "", tone: null },
];

export type NavItem = {
  /** Unique, for keys and the command bar. */
  key: string;
  route: Route;
  /** The page inside the route ("" is the route's first page). */
  page: string;
  label: string;
  group: GroupKey;
  /** Shown with a "Soon" pill; opens a first screen. */
  soon?: boolean;
};

const item = (group: GroupKey, route: Route, label: string, page = "", o: { soon?: boolean } = {}): NavItem => ({
  key: page ? `${route}/${page}` : route,
  route,
  page,
  label,
  group,
  ...o,
});

export const NAV: NavItem[] = [
  item("crm", "contacts", "Contacts"),
  item("crm", "companies", "Companies"),
  item("crm", "opportunities", "Opportunities"),
  item("crm", "meetings", "Meetings"),
  item("automation", "workflows", "Workflows"),
  item("automation", "forms", "Forms"),
  item("automation", "signals", "Signals"),
  item("automation", "enrichment", "Enrichment"),
  item("routing", "routing", "Overview"),
  item("routing", "routing", "Rules", "rules"),
  item("routing", "routing", "Teams", "teams"),
  item("routing", "routing", "Regions", "regions"),
  item("routing", "routing", "Company types", "company-types"),
  item("routing", "routing", "Handoffs", "handoffs", { soon: true }),
  item("routing", "routing", "History", "history"),
  item("routing", "routing", "Needs review", "review"),
  item("scheduling", "scheduling", "Meeting types", "types"),
  item("scheduling", "scheduling", "Availability", "availability"),
  item("scheduling", "scheduling", "Links and polls", "links"),
  item("scheduling", "scheduling", "Booking forms", "forms"),
  item("scheduling", "scheduling", "Reminders", "reminders"),
  item("scheduling", "scheduling", "Payments", "payments"),
  item("scheduling", "scheduling", "AI scheduler", "ai", { soon: true }),
  item("scheduling", "scheduling", "Notetaker", "notetaker", { soon: true }),
  item("email", "segments", "Segments"),
  item("email", "templates", "Templates"),
  item("email", "analytics", "Analytics"),
  item("site", "pages", "Pages"),
  item("ads", "ads", "Ads"),
  item("settings", "settings", "Settings"),
];

const ROUTES = new Set<string>([...NAV.map((n) => n.route), "objects"]);

export const defaultRoute: Route = "contacts";

/** The sidebar item an address belongs to. */
export function activeItem(route: Route, id: string): NavItem | null {
  const first = id.split("/")[0] ?? "";
  if (route === "routing") return NAV.find((n) => n.route === "routing" && n.page === routingPage(id).page) ?? null;
  if (route === "scheduling") return NAV.find((n) => n.route === "scheduling" && n.page === schedulingPage(id).page) ?? null;
  return NAV.find((n) => n.route === route && (n.page === "" || n.page === first)) ?? null;
}

// Pages inside a route --------------------------------------------------------------------------------------------

const UUID = /^[0-9a-f-]{36}$/;

/** Meetings' pages: the list ("") and one meeting (<id>). Anything else opens the list. */
export function meetingsPage(id: string): { page: "list" | "meeting"; id: string } {
  const [a = ""] = id.split("/");
  return UUID.test(a) ? { page: "meeting", id: a } : { page: "list", id: "" };
}

export type RoutingPageKey = "" | "rules" | "teams" | "regions" | "company-types" | "handoffs" | "history" | "review";

/**
 * Routing's pages (docs/app-structure.md Part 5): Overview (""), Rules, Teams, Regions, Company types, Handoffs,
 * History with one run open ("history/<run>"), Needs review, and one past setup read-only ("versions/<n>", on
 * Overview). Older names (reps, log, held) forward. `id` is the address to keep.
 */
export function routingPage(id: string): { page: RoutingPageKey; sub: string; version: number | null; id: string } {
  const [raw = "", b = ""] = id.split("/");
  const a = ({ reps: "teams", log: "history", held: "review" } as Record<string, string>)[raw] ?? raw;
  if (a === "rules" || a === "teams" || a === "regions" || a === "company-types" || a === "handoffs" || a === "review") return { page: a, sub: "", version: null, id: a };
  if (a === "history") return UUID.test(b) ? { page: "history", sub: b, version: null, id: `history/${b}` } : { page: "history", sub: "", version: null, id: "history" };
  if (a === "versions" && /^[1-9]\d{0,6}$/.test(b)) return { page: "", sub: "", version: Number(b), id: `versions/${b}` };
  return { page: "", sub: "", version: null, id: "" };
}

export type SchedulingPageKey = "types" | "availability" | "links" | "forms" | "reminders" | "payments" | "ai" | "notetaker";
export type AvailabilityTab = "schedules" | "calendars" | "team" | "days-off";

/**
 * Scheduling's pages (docs/app-structure.md Part 6): Meeting types with one type ("types/<id>" or "types/new"),
 * Availability with its tabs ("availability/calendars"...), Links and polls, Booking forms, Reminders, Payments, and
 * the two coming soon. Anything else opens Meeting types.
 */
export function schedulingPage(id: string): { page: SchedulingPageKey; sub: string; id: string } {
  const [a = "", b = ""] = id.split("/");
  if (a === "types") return UUID.test(b) || b === "new" ? { page: "types", sub: b, id: `types/${b}` } : { page: "types", sub: "", id: "types" };
  if (a === "availability") {
    const tab = (["calendars", "team", "days-off"] as string[]).includes(b) ? b : "";
    return { page: "availability", sub: tab, id: tab ? `availability/${tab}` : "availability" };
  }
  if (a === "links" || a === "forms" || a === "reminders" || a === "payments" || a === "ai" || a === "notetaker") return { page: a, sub: "", id: a };
  return { page: "types", sub: "", id: "types" };
}

/** Availability's tab from its address part ("" is Schedules). */
export const availabilityPage = (sub: string): AvailabilityTab => (sub === "calendars" || sub === "team" || sub === "days-off" ? sub : "schedules");

export type SignalsTab = "feed" | "visitors" | "alerts" | "setup";

/** Signals' tabs: Feed (""), Visitors, Alerts and Setup. */
export function signalsPage(id: string): { tab: SignalsTab; id: string } {
  const a = id.split("/")[0] ?? "";
  return a === "visitors" || a === "alerts" || a === "setup" ? { tab: a, id: a } : { tab: "feed", id: "" };
}

export type EnrichmentTab = "overview" | "providers" | "history";

/** Enrichment's tabs: Overview (""), Providers and History. */
export function enrichmentPage(id: string): { tab: EnrichmentTab; id: string } {
  const a = id.split("/")[0] ?? "";
  return a === "providers" || a === "history" ? { tab: a, id: a } : { tab: "overview", id: "" };
}

// Old addresses ---------------------------------------------------------------------------------------------------

/** Old first parts of an address and where they open now: the route, and the page inside it. */
const MOVED: Record<string, { route: Route; id?: string; keepId?: boolean }> = {
  leads: { route: "contacts", keepId: true },
  people: { route: "contacts" },
  accounts: { route: "companies", id: "account", keepId: true },
  visitors: { route: "signals", id: "visitors" },
  journeys: { route: "workflows" },
  nurture: { route: "workflows", keepId: true },
  reports: { route: "analytics" },
};

/** Settings pages that moved out of Settings. */
const SETTINGS_MOVED: Record<string, { route: Route; id: string }> = {
  calendar: { route: "scheduling", id: "availability/calendars" },
  calendars: { route: "scheduling", id: "availability/team" },
  payments: { route: "scheduling", id: "payments" },
  sites: { route: "signals", id: "setup" },
  identity: { route: "signals", id: "setup" },
  account_alerts: { route: "signals", id: "alerts" },
};

/**
 * The screen for an address's first part and the rest. Unknown and old testing addresses open Contacts; moved ones
 * open their new home. An account id opens through /companies/account/<id>, which finds its company.
 */
export function resolveRoute(first: string, id: string): { route: Route; id: string } {
  const [a = "", ...rest] = id.split("/");
  // Meeting types lived under Meetings.
  if (first === "meetings" && a === "types") return { route: "scheduling", id: ["types", ...rest].join("/") };
  if (first === "companies" && a === "visits") return { route: "signals", id: "visitors" };
  if (first === "settings" && SETTINGS_MOVED[a]) return SETTINGS_MOVED[a];
  if (ROUTES.has(first)) return { route: first as Route, id };
  const m = MOVED[first];
  if (!m) return { route: defaultRoute, id: "" };
  if (m.keepId && id) return { route: m.route, id: m.id ? `${m.id}/${id}` : id };
  return { route: m.route, id: m.id && !m.keepId ? m.id : "" };
}
