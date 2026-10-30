// The sidebar (docs/unify-plan.md Part 1): Inbound, CRM and Nurture, then Settings. Each item is one
// route; pages inside a route are tabs under its title, each with its own address. The app opens on Contacts. Old
// addresses keep working: they forward to their new page.

export type Route =
  | "contacts"
  | "companies"
  | "opportunities"
  | "meetings"
  | "reps"
  | "objects"
  | "workflows"
  | "routing"
  | "enrichment"
  | "forms"
  | "scheduling"
  | "emails"
  | "segments"
  | "scoring"
  | "settings";

export type GroupKey = "inbound" | "crm" | "nurture" | "settings";
export type Tone = "sky" | "clay" | "sage" | "butter";

/** A group's color tile (docs/brand.md: sidebar groups) and its title; an empty title draws a rule. */
export const GROUPS: { key: GroupKey; label: string; tone: Tone | null }[] = [
  { key: "inbound", label: "Inbound", tone: "sage" },
  { key: "crm", label: "CRM", tone: "sky" },
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

/**
 * Inbound is set up the way a sales team works (docs/unify-plan.md): Forms, the people who take leads (Reps), what
 * leads book (Meetings, once Calendar, with the upcoming meetings), who gets which lead (Routing), and Scoring.
 */
export const NAV: NavItem[] = [
  item("inbound", "forms", "Forms"),
  item("inbound", "reps", "Reps"),
  item("inbound", "scheduling", "Meetings"),
  item("inbound", "routing", "Routing"),
  item("inbound", "scoring", "Scoring"),
  item("crm", "contacts", "Contacts"),
  item("crm", "companies", "Companies"),
  item("crm", "opportunities", "Opportunities"),
  item("nurture", "emails", "Emails"),
  item("nurture", "segments", "Segments"),
  item("settings", "settings", "Settings"),
];

const ROUTES = new Set<string>([...NAV.map((n) => n.route), "meetings", "objects", "enrichment", "workflows"]);

export const defaultRoute: Route = "contacts";

/** The sidebar item an address belongs to: each route has one. A new workflow is made under Emails; one meeting's page under Meetings. */
export const activeItem = (route: Route): NavItem | null => NAV.find((n) => n.route === (route === "workflows" ? "emails" : route === "meetings" ? "scheduling" : route)) ?? null;

/** Reps: someone has no calendar. Routing: not live, paused, or a draft that isn't published. */
export function inboundDots(r: { routing: boolean; no_calendar?: number; routing_draft?: boolean; routing_paused?: boolean }): { reps: boolean; routing: boolean } {
  return { reps: (r.no_calendar ?? 0) > 0, routing: !r.routing || !!r.routing_draft || !!r.routing_paused };
}

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

/** One meeting (<id>); the list of upcoming meetings lives in Meetings › Upcoming. Anything else opens the list. */
export function meetingsPage(id: string): { page: "list" | "meeting"; id: string } {
  const [a = ""] = id.split("/");
  return UUID.test(a) ? { page: "meeting", id: a } : { page: "list", id: "" };
}

export type RoutingPageKey = "" | "teams" | "history";
export const ROUTING_TABS: Tab<RoutingPageKey>[] = [
  { value: "", label: "Rules" },
  { value: "teams", label: "Teams" },
  { value: "history", label: "History" },
];

/**
 * Routing's tabs: Rules (""), Teams, History with one run open ("history/<run>") or the leads held for review
 * ("history/review"), one past version read-only ("versions/<n>", on Rules) and the flowchart ("flow", on Rules).
 * Older names forward: setup, rules, overview, regions and company-types to Rules; team to Teams; leads, log, review
 * and held to History. (Reps has its own page: /routing/reps opens it, see resolveRoute.)
 */
export function routingPage(id: string): { page: RoutingPageKey; sub: string; version: number | null; id: string } {
  const [raw = "", b = ""] = id.split("/");
  const a = ({ leads: "history", log: "history", review: "held", team: "teams" } as Record<string, string>)[raw] ?? raw;
  if (a === "teams") return { page: "teams", sub: "", version: null, id: "teams" };
  if (a === "held" || (a === "history" && b === "review")) return { page: "history", sub: "review", version: null, id: "history/review" };
  if (a === "history") return UUID.test(b) ? { page: "history", sub: b, version: null, id: `history/${b}` } : { page: "history", sub: "", version: null, id: "history" };
  if (a === "versions" && /^[1-9]\d{0,6}$/.test(b)) return { page: "", sub: "", version: Number(b), id: `versions/${b}` };
  if (a === "flow") return { page: "", sub: "flow", version: null, id: "flow" };
  return { page: "", sub: "", version: null, id: "" };
}

/** Reps: the table ("") and the availability editor with its views ("availability", "availability/calendars"...). */
export function repsPage(id: string): { page: "list" | "availability"; sub: string; id: string } {
  const [a = "", b = ""] = id.split("/");
  if (a !== "availability") return { page: "list", sub: "", id: "" };
  const tab = (["calendars", "team", "days-off"] as string[]).includes(b) ? b : "";
  return { page: "availability", sub: tab, id: tab ? `availability/${tab}` : "availability" };
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

export type SchedulingPageKey = "types" | "upcoming" | "booking" | "links" | "settings";
export type AvailabilityTab = "schedules" | "calendars" | "team" | "days-off";
/** The icon beside each Meetings tab (the screen draws it, from src/components/Icons.tsx). */
export type SchedulingTabIcon = "grid" | "monitor" | "calendar" | "link" | "gear";
export const SCHEDULING_TABS: (Tab<SchedulingPageKey> & { icon: SchedulingTabIcon })[] = [
  { value: "types", label: "Meetings", icon: "grid" },
  { value: "upcoming", label: "Upcoming", icon: "calendar" },
  { value: "booking", label: "Booking page", icon: "monitor" },
  { value: "links", label: "Links and polls", icon: "link" },
  { value: "settings", label: "Settings", icon: "gear" },
];

/** Meetings › Settings: the things set once, listed on the left. */
export type CalendarSettingsKey = "reminders" | "payments" | "webhooks";
export const CALENDAR_SETTINGS: Tab<CalendarSettingsKey>[] = [
  { value: "reminders", label: "Reminders" },
  { value: "payments", label: "Payments" },
  { value: "webhooks", label: "Webhooks" },
];
const SETTINGS_KEYS = new Set<string>(CALENDAR_SETTINGS.map((t) => t.value));

/**
 * Meetings' tabs (route "scheduling", once Calendar): Meetings with one type open in the panel ("types/<id>" or
 * "types/new") or in the full editor ("types/<id>/all"), Upcoming (the meetings on the calendar, once CRM ›
 * Meetings), Booking page, Links and polls, and Settings with Reminders, Payments and Webhooks ("settings/payments").
 * The old Reminders, Payments and Webhooks tabs open inside Settings; Availability moved to Reps (see resolveRoute).
 * Anything else opens Meetings.
 */
export function schedulingPage(id: string): { page: SchedulingPageKey; sub: string; id: string } {
  const [a = "", b = "", c = ""] = id.split("/");
  if (a === "types") {
    if (UUID.test(b) && c === "all") return { page: "types", sub: `${b}/all`, id: `types/${b}/all` };
    return UUID.test(b) || b === "new" ? { page: "types", sub: b, id: `types/${b}` } : { page: "types", sub: "", id: "types" };
  }
  if (a === "settings") return SETTINGS_KEYS.has(b) ? { page: "settings", sub: b, id: `settings/${b}` } : { page: "settings", sub: "reminders", id: "settings" };
  if (SETTINGS_KEYS.has(a)) return { page: "settings", sub: a, id: `settings/${a}` };
  if (a === "booking" || a === "links" || a === "upcoming") return { page: a, sub: "", id: a };
  return { page: "types", sub: "", id: "types" };
}

/** Availability's view from its address part ("" is Schedules). */
export const availabilityPage = (sub: string): AvailabilityTab => (sub === "calendars" || sub === "team" || sub === "days-off" ? sub : "schedules");

export type EmailsTab = "journeys" | "emails" | "library" | "brand";
export const EMAILS_TABS: Tab<EmailsTab>[] = [
  { value: "journeys", label: "Journeys" },
  { value: "emails", label: "Emails" },
  { value: "library", label: "Library" },
  { value: "brand", label: "Brand" },
];

/**
 * Emails' tabs (docs/email-plan.md Part 8): Journeys ("", one open as "journeys/<id>"), every email sent ("emails"),
 * the Library ("library") and Brand ("brand"). The old Templates tab ("templates") opens the Library.
 */
export function emailsPage(id: string): { tab: EmailsTab; sub: string; id: string } {
  const [a = "", b = ""] = id.split("/");
  if (a === "emails" || a === "brand") return { tab: a, sub: "", id: a };
  if (a === "library" || a === "templates") return { tab: "library", sub: "", id: "library" };
  if (a === "journeys" && UUID.test(b)) return { tab: "journeys", sub: b, id: `journeys/${b}` };
  return { tab: "journeys", sub: "", id: "" };
}

export type ScoringTab = "model" | "leads" | "ideal";
export const SCORING_TABS: Tab<ScoringTab>[] = [
  { value: "model", label: "Model" },
  { value: "leads", label: "Leads" },
  { value: "ideal", label: "Ideal customer" },
];

/** Lead scoring's tabs: Model (""), Leads and Ideal customer. */
export function scoringPage(id: string): { tab: ScoringTab; id: string } {
  const first = id.split("/")[0] ?? "";
  return first === "ideal" || first === "leads" ? { tab: first, id: first } : { tab: "model", id: "" };
}

// Old addresses ---------------------------------------------------------------------------------------------------

/** Old first parts of an address and where they open now: the route, and the page inside it. */
const MOVED: Record<string, { route: Route; id?: string; keepId?: boolean }> = {
  // Visitors (once Signals) was removed; its addresses open Contacts.
  visitors: { route: "contacts" },
  signals: { route: "contacts" },
  leads: { route: "contacts", keepId: true },
  people: { route: "contacts" },
  accounts: { route: "companies", id: "account", keepId: true },
  journeys: { route: "emails" },
  nurture: { route: "emails" },
  templates: { route: "emails", id: "templates" },
  analytics: { route: "emails" },
};


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
  calendar: { route: "reps", id: "availability/calendars" },
  calendars: { route: "reps", id: "availability/team" },
  payments: { route: "scheduling", id: "settings/payments" },
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
  // Meeting types lived under Meetings; booking forms under Scheduling. The list of meetings is Meetings › Upcoming;
  // one meeting keeps its own page. Availability lives in Reps, and so do Routing's reps.
  if (first === "meetings" && a === "types") return { route: "scheduling", id: ["types", ...rest].join("/") };
  if (first === "meetings") return UUID.test(a) ? { route: "meetings", id: a } : { route: "scheduling", id: "upcoming" };
  if (first === "scheduling" && a === "forms") return { route: "forms", id: "" };
  if (first === "scheduling" && a === "availability") return { route: "reps", id: ["availability", ...rest].join("/") };
  if (first === "availability") return { route: "reps", id: ["availability", ...(a ? [a] : [])].join("/") };
  if (first === "routing" && a === "reps") return { route: "reps", id: "" };
  if (first === "companies" && a === "visits") return { route: "companies", id: "" };
  if (first === "settings" && SETTINGS_MOVED[a]) return SETTINGS_MOVED[a];
  if (first === "reports") return REPORTS[a] ?? REPORTS[""]!;
  // Workflows live in Emails › Journeys (docs/email-plan.md Part 8); only a new one keeps its own screen.
  if (first === "workflows" && a !== "new") return { route: "emails", id: UUID.test(a) ? `journeys/${a}` : "" };
  if (ROUTES.has(first)) return { route: first as Route, id };
  const m = MOVED[first];
  if (!m) return { route: defaultRoute, id: "" };
  if (m.keepId && id) return { route: m.route, id: m.id ? `${m.id}/${id}` : id };
  return { route: m.route, id: m.id && !m.keepId ? m.id : "" };
}
