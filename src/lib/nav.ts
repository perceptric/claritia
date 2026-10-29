// The sidebar (docs/unify-plan.md Part 1): CRM, Automation, Inbound and Nurture, then Settings. Each item is one
// route; pages inside a route are tabs under its title, each with its own address. The app opens on Contacts. Old
// addresses keep working: they forward to their new page.

export type Route =
  | "contacts"
  | "companies"
  | "opportunities"
  | "meetings"
  | "objects"
  | "workflows"
  | "routing"
  | "enrichment"
  | "forms"
  | "scheduling"
  | "visitors"
  | "emails"
  | "segments"
  | "scoring"
  | "settings";

export type GroupKey = "crm" | "automation" | "inbound" | "nurture" | "settings";
export type Tone = "sky" | "clay" | "sage" | "butter";

/** A group's color tile (docs/brand.md: sidebar groups) and its title; an empty title draws a rule. */
export const GROUPS: { key: GroupKey; label: string; tone: Tone | null }[] = [
  { key: "crm", label: "CRM", tone: "sky" },
  { key: "automation", label: "Automation", tone: "clay" },
  { key: "inbound", label: "Inbound", tone: "sage" },
  { key: "nurture", label: "Nurture", tone: "butter" },
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
};

const item = (group: GroupKey, route: Route, label: string): NavItem => ({ key: route, route, page: "", label, group });

export const NAV: NavItem[] = [
  item("crm", "contacts", "Contacts"),
  item("crm", "companies", "Companies"),
  item("crm", "opportunities", "Opportunities"),
  item("crm", "meetings", "Meetings"),
  item("automation", "workflows", "Workflows"),
  item("automation", "routing", "Routing"),
  item("automation", "enrichment", "Enrichment"),
  item("inbound", "forms", "Forms"),
  item("inbound", "scheduling", "Scheduling"),
  item("inbound", "visitors", "Visitors"),
  item("nurture", "emails", "Emails"),
  item("nurture", "segments", "Segments"),
  item("nurture", "scoring", "Lead scoring"),
  item("settings", "settings", "Settings"),
];

const ROUTES = new Set<string>([...NAV.map((n) => n.route), "objects"]);

export const defaultRoute: Route = "contacts";

/** The sidebar item an address belongs to: each route has one. */
export const activeItem = (route: Route): NavItem | null => NAV.find((n) => n.route === route) ?? null;

// Tabs inside a route -----------------------------------------------------------------------------------------------

export type Tab<T extends string = string> = { value: T; label: string };

const UUID = /^[0-9a-f-]{36}$/;

/** Contacts: the table (""), the Overview (funnel and reps), and one contact (<id>). */
export function contactsPage(id: string): { page: "list" | "overview" | "contact"; id: string } {
  const [a = ""] = id.split("/");
  if (a === "overview") return { page: "overview", id: a };
  return UUID.test(a) ? { page: "contact", id: a } : { page: "list", id: "" };
}
export const CONTACTS_TABS: Tab[] = [
  { value: "", label: "Contacts" },
  { value: "overview", label: "Overview" },
];

/** Forms: the list (""), the Overview (views, fills and booked per form), a new form ("new") and one form (<id>). */

/** Meetings: the list ("") and one meeting (<id>). Anything else opens the list. */
export function meetingsPage(id: string): { page: "list" | "meeting"; id: string } {
  const [a = ""] = id.split("/");
  return UUID.test(a) ? { page: "meeting", id: a } : { page: "list", id: "" };
}

export type RoutingPageKey = "" | "leads" | "team";
export const ROUTING_TABS: Tab<RoutingPageKey>[] = [
  { value: "", label: "Setup" },
  { value: "leads", label: "Leads" },
  { value: "team", label: "Team" },
];

/**
 * Routing's tabs (docs/routing-chat-plan.md 1.4): Setup (""), Leads with one run open ("leads/<run>") or the ones
 * held for review ("leads/review"), Team, and one past version read-only ("versions/<n>", on Setup). Older names
 * forward: rules, overview, regions and company-types to Setup; history, log, review and held to Leads; teams and
 * reps to Team.
 */
export function routingPage(id: string): { page: RoutingPageKey; sub: string; version: number | null; id: string } {
  const [raw = "", b = ""] = id.split("/");
  const a = ({ history: "leads", log: "leads", review: "held", teams: "team", reps: "team" } as Record<string, string>)[raw] ?? raw;
  if (a === "team") return { page: "team", sub: "", version: null, id: "team" };
  if (a === "held" || (a === "leads" && b === "review")) return { page: "leads", sub: "review", version: null, id: "leads/review" };
  if (a === "leads") return UUID.test(b) ? { page: "leads", sub: b, version: null, id: `leads/${b}` } : { page: "leads", sub: "", version: null, id: "leads" };
  if (a === "versions" && /^[1-9]\d{0,6}$/.test(b)) return { page: "", sub: "", version: Number(b), id: `versions/${b}` };
  return { page: "", sub: "", version: null, id: "" };
}

export type EnrichmentTab = "overview" | "providers" | "rules" | "history";
export const ENRICHMENT_TABS: Tab<EnrichmentTab>[] = [
  { value: "overview", label: "Overview" },
  { value: "providers", label: "Providers" },
  { value: "rules", label: "Rules" },
  { value: "history", label: "History" },
];

/** Enrichment's tabs: Overview (""), Providers, Rules and History. */
export function enrichmentPage(id: string): { tab: EnrichmentTab; id: string } {
  const a = id.split("/")[0] ?? "";
  return a === "providers" || a === "rules" || a === "history" ? { tab: a, id: a } : { tab: "overview", id: "" };
}

export type SchedulingPageKey = "types" | "availability" | "links" | "reminders" | "payments";
export type AvailabilityTab = "schedules" | "calendars" | "team" | "days-off";
export const SCHEDULING_TABS: Tab<SchedulingPageKey>[] = [
  { value: "types", label: "Meeting types" },
  { value: "availability", label: "Availability" },
  { value: "links", label: "Links and polls" },
  { value: "reminders", label: "Reminders" },
  { value: "payments", label: "Payments" },
];

/**
 * Scheduling's tabs: Meeting types with one type ("types/<id>" or "types/new"), Availability with its views
 * ("availability/calendars"...), Links and polls, Reminders and Payments. Anything else opens Meeting types.
 */
export function schedulingPage(id: string): { page: SchedulingPageKey; sub: string; id: string } {
  const [a = "", b = ""] = id.split("/");
  if (a === "types") return UUID.test(b) || b === "new" ? { page: "types", sub: b, id: `types/${b}` } : { page: "types", sub: "", id: "types" };
  if (a === "availability") {
    const tab = (["calendars", "team", "days-off"] as string[]).includes(b) ? b : "";
    return { page: "availability", sub: tab, id: tab ? `availability/${tab}` : "availability" };
  }
  if (a === "links" || a === "reminders" || a === "payments") return { page: a, sub: "", id: a };
  return { page: "types", sub: "", id: "types" };
}

/** Availability's view from its address part ("" is Schedules). */
export const availabilityPage = (sub: string): AvailabilityTab => (sub === "calendars" || sub === "team" || sub === "days-off" ? sub : "schedules");

export type VisitorsTab = "feed" | "visits" | "alerts" | "setup";
export const VISITORS_TABS: Tab<VisitorsTab>[] = [
  { value: "feed", label: "Signals" },
  { value: "visits", label: "Visits" },
  { value: "alerts", label: "Alerts" },
  { value: "setup", label: "Setup" },
];

/** Visitors' tabs (today's Signals): Signals (""), Visits, Alerts and Setup. */
export function visitorsPage(id: string): { tab: VisitorsTab; id: string } {
  const a = id.split("/")[0] ?? "";
  return a === "visits" || a === "alerts" || a === "setup" ? { tab: a, id: a } : { tab: "feed", id: "" };
}

export type EmailsTab = "emails" | "templates";
export const EMAILS_TABS: Tab<EmailsTab>[] = [
  { value: "emails", label: "Emails" },
  { value: "templates", label: "Templates" },
];

/** Emails' tabs: every email (""), and Templates. */
export function emailsPage(id: string): { tab: EmailsTab; id: string } {
  return (id.split("/")[0] ?? "") === "templates" ? { tab: "templates", id: "templates" } : { tab: "emails", id: "" };
}

export type ScoringTab = "score" | "ideal";
export const SCORING_TABS: Tab<ScoringTab>[] = [
  { value: "score", label: "Score" },
  { value: "ideal", label: "Ideal customer" },
];

/** Lead scoring's tabs: Score ("") and Ideal customer. */
export function scoringPage(id: string): { tab: ScoringTab; id: string } {
  return (id.split("/")[0] ?? "") === "ideal" ? { tab: "ideal", id: "ideal" } : { tab: "score", id: "" };
}

// Old addresses ---------------------------------------------------------------------------------------------------

/** Old first parts of an address and where they open now: the route, and the page inside it. */
const MOVED: Record<string, { route: Route; id?: string; keepId?: boolean }> = {
  leads: { route: "contacts", keepId: true },
  people: { route: "contacts" },
  accounts: { route: "companies", id: "account", keepId: true },
  journeys: { route: "workflows" },
  nurture: { route: "workflows", keepId: true },
  templates: { route: "emails", id: "templates" },
  analytics: { route: "emails" },
};

/** Signals' old tabs, now under Visitors. */
const SIGNALS: Record<string, string> = { "": "", visitors: "visits", alerts: "alerts", setup: "setup" };

/** Reports' old pages, now inside the sections they're about. */
const REPORTS: Record<string, { route: Route; id: string }> = {
  "": { route: "contacts", id: "overview" },
  reps: { route: "contacts", id: "overview" },
  speed: { route: "routing", id: "" },
  forms: { route: "forms", id: "" },
  email: { route: "emails", id: "" },
};

/** Settings and Scheduling pages that moved. */
const SETTINGS_MOVED: Record<string, { route: Route; id: string }> = {
  calendar: { route: "scheduling", id: "availability/calendars" },
  calendars: { route: "scheduling", id: "availability/team" },
  payments: { route: "scheduling", id: "payments" },
  sites: { route: "visitors", id: "setup" },
  identity: { route: "visitors", id: "setup" },
  account_alerts: { route: "visitors", id: "alerts" },
  lead_scoring: { route: "scoring", id: "" },
  icp: { route: "scoring", id: "ideal" },
};

/**
 * The screen for an address's first part and the rest. Unknown and old testing addresses (and the removed Pages and
 * Ads) open Contacts; moved ones open their new home. An account id opens through /companies/account/<id>, which
 * finds its company.
 */
export function resolveRoute(first: string, id: string): { route: Route; id: string } {
  const [a = "", ...rest] = id.split("/");
  // Meeting types lived under Meetings; booking forms under Scheduling.
  if (first === "meetings" && a === "types") return { route: "scheduling", id: ["types", ...rest].join("/") };
  if (first === "scheduling" && a === "forms") return { route: "forms", id: "" };
  if (first === "companies" && a === "visits") return { route: "visitors", id: "visits" };
  if (first === "settings" && SETTINGS_MOVED[a]) return SETTINGS_MOVED[a];
  if (first === "signals") return { route: "visitors", id: SIGNALS[a] ?? "" };
  if (first === "reports") return REPORTS[a] ?? REPORTS[""]!;
  // /visitors/visitors was Signals' visitor list.
  if (first === "visitors" && a === "visitors") return { route: "visitors", id: "visits" };
  if (ROUTES.has(first)) return { route: first as Route, id };
  const m = MOVED[first];
  if (!m) return { route: defaultRoute, id: "" };
  if (m.keepId && id) return { route: m.route, id: m.id ? `${m.id}/${id}` : id };
  return { route: m.route, id: m.id && !m.keepId ? m.id : "" };
}
