// The sidebar (docs/unify-plan.md Part 1): Inbound, CRM and Nurture, then Settings. Each item is one
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
 * Inbound is set up the way a sales team works (docs/unify-plan.md): Forms (each form's Routing picks the meeting) and
 * Meetings (a Dynamic meeting picks the rep; Availability holds hours, teams and who's away; docs/on-submission.md).
 * Nurture is Workflows (folders of workflows, reminders included; docs/workflows.md), Segments and Scoring. Routing
 * has no item of its own: its old addresses open where its parts went (resolveRoute).
 */
export const NAV: NavItem[] = [
  item("inbound", "forms", "Forms"),
  item("inbound", "scheduling", "Meetings"),
  item("crm", "contacts", "Contacts"),
  item("crm", "companies", "Companies"),
  item("crm", "opportunities", "Opportunities"),
  item("nurture", "workflows", "Workflows"),
  item("nurture", "segments", "Segments"),
  item("nurture", "scoring", "Scoring"),
  item("settings", "settings", "Settings"),
];

const ROUTES = new Set<string>([...NAV.map((n) => n.route), "meetings", "routing", "objects", "enrichment"]);

export const defaultRoute: Route = "forms";

/** The sidebar item an address belongs to: each route has one. A new workflow is made under Emails; one meeting's page under Meetings. */
export const activeItem = (route: Route): NavItem | null => NAV.find((n) => n.route === (route === "emails" ? "workflows" : route === "meetings" || route === "routing" ? "scheduling" : route)) ?? null;

/**
 * Routing's amber dot: the default policy has something to fix (a rep who gets leads has no calendar, or a rule's
 * team has nobody; `routing_action` from 094, reading teams from 096). Before 094 there's no count, so no dot.
 */
export function inboundDots(r: { routing_action?: number }): { routing: boolean } {
  return { routing: (r.routing_action ?? 0) > 0 };
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

export type RoutingPageKey = "" | "teams" | "activity";
export const ROUTING_TABS: Tab<RoutingPageKey>[] = [
  { value: "", label: "Policies" },
  { value: "teams", label: "Teams" },
  { value: "activity", label: "Activity" },
];

/**
 * Routing's tabs (docs/routing-workflow.md Section 3): Policies ("", one policy's editor at "policies/<id>"), Teams
 * ("teams", one team at "teams/<id>", the working-hours editor at "teams/availability" and its views
 * "teams/availability/calendars"...) and Activity ("activity", one run at "activity/<run>", the review list at
 * "activity/review" and errors at "activity/errors"). Older addresses forward: Assignment and its pages (setup,
 * rules, versions/<n>, flow...) to Policies; Sales reps (reps, team, teams) and its availability editor to Teams;
 * History (history, leads, log, held, review) to Activity.
 */
export function routingPage(id: string): { page: RoutingPageKey; sub: string; id: string } {
  const [raw = "", b = "", c = ""] = id.split("/");
  const a = ({ reps: "teams", team: "teams", history: "activity", leads: "activity", log: "activity", held: "review", review: "review" } as Record<string, string>)[raw] ?? raw;
  if (a === "policies" && UUID.test(b)) return { page: "", sub: b, id: `policies/${b}` };
  if (a === "teams") {
    if (b === "availability") {
      const tab = (["calendars", "team", "days-off"] as string[]).includes(c) ? c : "";
      return { page: "teams", sub: tab ? `availability/${tab}` : "availability", id: tab ? `teams/availability/${tab}` : "teams/availability" };
    }
    return UUID.test(b) ? { page: "teams", sub: b, id: `teams/${b}` } : { page: "teams", sub: "", id: "teams" };
  }
  if (a === "review" || (a === "activity" && b === "review")) return { page: "activity", sub: "review", id: "activity/review" };
  if (a === "activity" && b === "errors") return { page: "activity", sub: "errors", id: "activity/errors" };
  if (a === "activity") return UUID.test(b) ? { page: "activity", sub: b, id: `activity/${b}` } : { page: "activity", sub: "", id: "activity" };
  return { page: "", sub: "", id: "" };
}

/** Teams: the list (""), one team (<id>) and the working-hours editor with its views ("availability", "availability/team"...). */
export function teamsPage(sub: string): { page: "list" | "team" | "availability"; sub: string } {
  const [a = "", b = ""] = sub.split("/");
  if (UUID.test(a)) return { page: "team", sub: a };
  if (a !== "availability") return { page: "list", sub: "" };
  const tab = (["calendars", "team", "days-off"] as string[]).includes(b) ? b : "";
  return { page: "availability", sub: tab };
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

export type SchedulingPageKey = "types" | "upcoming" | "availability" | "booking" | "links" | "settings";
export type AvailabilityTab = "schedules" | "calendars" | "team" | "days-off";
/** The icon beside each Meetings tab (the screen draws it, from src/components/Icons.tsx). */
export type SchedulingTabIcon = "grid" | "monitor" | "calendar" | "link" | "gear";
export const SCHEDULING_TABS: (Tab<SchedulingPageKey> & { icon: SchedulingTabIcon })[] = [
  { value: "types", label: "Meetings", icon: "grid" },
  { value: "upcoming", label: "Upcoming", icon: "calendar" },
  { value: "availability", label: "Availability", icon: "calendar" },
  { value: "booking", label: "Booking page", icon: "monitor" },
  { value: "links", label: "Links and polls", icon: "link" },
  { value: "settings", label: "Settings", icon: "gear" },
];

/** Meetings › Settings: the things set once, listed on the left. */
/** Meetings › Settings. Reminders moved to Workflows (docs/workflows.md); their old addresses open there. */
export type CalendarSettingsKey = "payments" | "webhooks";
export const CALENDAR_SETTINGS: Tab<CalendarSettingsKey>[] = [
  { value: "payments", label: "Payments" },
  { value: "webhooks", label: "Webhooks" },
];
const SETTINGS_KEYS = new Set<string>(CALENDAR_SETTINGS.map((t) => t.value));

/**
 * Meetings' tabs (route "scheduling", once Calendar): Meetings with one type open in the panel ("types/<id>" or
 * "types/new") or in the full editor ("types/<id>/all"), Upcoming (the meetings on the calendar, once CRM ›
 * Meetings), Availability (everyone's hours, calendars and who's away, read by forms and booking pages alike:
 * "availability", "availability/team"...), Booking page, Links and polls, and Settings with Reminders, Payments and
 * Webhooks ("settings/payments"). The old Reminders, Payments and Webhooks tabs open inside Settings; Routing ›
 * Teams' old availability addresses open here (see resolveRoute).
 * Anything else opens Meetings.
 */
export function schedulingPage(id: string): { page: SchedulingPageKey; sub: string; id: string } {
  const [a = "", b = "", c = ""] = id.split("/");
  if (a === "types") {
    if (UUID.test(b) && c === "all") return { page: "types", sub: `${b}/all`, id: `types/${b}/all` };
    return UUID.test(b) || b === "new" ? { page: "types", sub: b, id: `types/${b}` } : { page: "types", sub: "", id: "types" };
  }
  if (a === "availability") {
    const tab = (["calendars", "team", "days-off"] as string[]).includes(b) ? b : "";
    return { page: "availability", sub: tab, id: tab ? `availability/${tab}` : "availability" };
  }
  if (a === "settings") return SETTINGS_KEYS.has(b) ? { page: "settings", sub: b, id: `settings/${b}` } : { page: "settings", sub: "payments", id: "settings" };
  if (SETTINGS_KEYS.has(a)) return { page: "settings", sub: a, id: `settings/${a}` };
  if (a === "booking" || a === "links" || a === "upcoming") return { page: a, sub: "", id: a };
  return { page: "types", sub: "", id: "types" };
}

/** Availability's view from its address part ("" is Schedules). */
export const availabilityPage = (sub: string): AvailabilityTab => (sub === "calendars" || sub === "team" || sub === "days-off" ? sub : "schedules");

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
  journeys: { route: "workflows" },
  nurture: { route: "workflows" },
  templates: { route: "workflows" },
  analytics: { route: "workflows" },
};


/** Reports' old pages, now inside the sections they're about. */
const REPORTS: Record<string, { route: Route; id: string }> = {
  "": { route: "contacts", id: "overview" },
  reps: { route: "contacts", id: "overview" },
  speed: { route: "scheduling", id: "upcoming" },
  forms: { route: "forms", id: "" },
  email: { route: "workflows", id: "" },
};

/** Settings and Scheduling pages that moved. */
const SETTINGS_MOVED: Record<string, { route: Route; id: string }> = {
  calendar: { route: "scheduling", id: "availability/calendars" },
  calendars: { route: "scheduling", id: "availability/team" },
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
  // one meeting keeps its own page. Availability lives in Meetings (it was Routing › Teams'); the old Reps page is
  // Routing › Teams.
  if (first === "meetings" && a === "types") return { route: "scheduling", id: ["types", ...rest].join("/") };
  if (first === "meetings") return UUID.test(a) ? { route: "meetings", id: a } : { route: "scheduling", id: "upcoming" };
  if (first === "scheduling" && a === "forms") return { route: "forms", id: "" };
  const availability = (tab: string | undefined) => ({ route: "scheduling" as Route, id: schedulingPage(["availability", ...(tab ? [tab] : [])].join("/")).id });
  if (first === "availability") return availability(a);
  if (first === "routing" && a === "teams" && rest[0] === "availability") return availability(rest[1]);
  if (first === "reps" && a === "availability") return availability(rest[0]);
  // Routing's parts moved (docs/on-submission.md): its policies are meetings now, its teams and reps are in
  // Availability › Team. One policy's page and the activity log still open where they were.
  if (first === "reps" || (first === "routing" && (routingPage(id).page === "teams" || ["reps", "team"].includes(a)))) return availability("team");
  if (first === "routing" && routingPage(id).page === "" && !routingPage(id).sub) return { route: "scheduling", id: "types" };
  if (first === "companies" && a === "visits") return { route: "companies", id: "" };
  if (first === "settings" && SETTINGS_MOVED[a]) return SETTINGS_MOVED[a];
  // Meeting reminders are a workflow now.
  if (first === "scheduling" && (a === "reminders" || (a === "settings" && rest[0] === "reminders"))) return { route: "workflows", id: "" };
  if (first === "reports") return REPORTS[a] ?? REPORTS[""]!;
  // Emails became Workflows: folders of workflows, one open beside them (/workflows/<id>); /workflows/new picks a
  // template. Emails' old addresses open there.
  if (first === "workflows") return { route: "workflows", id: a === "new" || UUID.test(a) ? a : "" };
  if (first === "emails") return { route: "workflows", id: a === "journeys" && UUID.test(rest[0] ?? "") ? rest[0]! : "" };
  if (ROUTES.has(first)) return { route: first as Route, id };
  const m = MOVED[first];
  if (!m) return { route: defaultRoute, id: "" };
  if (m.keepId && id) return { route: m.route, id: m.id ? `${m.id}/${id}` : id };
  return { route: m.route, id: m.id && !m.keepId ? m.id : "" };
}
