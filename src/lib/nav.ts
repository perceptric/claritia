// The sidebar (docs/marketing-platform.md): Site, CRM, Email, Ads and Settings. Forms come first and are where the
// app opens. The testing screens are gone; their old addresses land on Forms.

export type Route =
  | "contacts"
  | "companies"
  | "opportunities"
  | "objects"
  | "segments"
  | "templates"
  | "workflows"
  | "analytics"
  | "forms"
  | "pages"
  | "ads"
  | "settings";

export type NavItem = { route: Route; label: string; group?: string };

export const NAV: NavItem[] = [
  { route: "forms", label: "Forms", group: "Site" },
  { route: "pages", label: "Pages" },
  { route: "contacts", label: "Contacts", group: "CRM" },
  { route: "companies", label: "Companies" },
  { route: "opportunities", label: "Opportunities" },
  { route: "segments", label: "Segments", group: "Email" },
  { route: "templates", label: "Templates" },
  { route: "workflows", label: "Workflows" },
  { route: "analytics", label: "Analytics" },
  { route: "ads", label: "Ads", group: "" },
  { route: "settings", label: "Settings", group: "" },
];

const ROUTES = new Set<string>([...NAV.map((n) => n.route), "objects"]);

/** Old addresses and where they open now: the route, and the record or page inside it. */
const MOVED: Record<string, { route: Route; id?: string; keepId?: boolean }> = {
  leads: { route: "contacts", keepId: true },
  people: { route: "contacts" },
  accounts: { route: "companies", id: "account", keepId: true },
  visitors: { route: "companies", id: "visits" },
  journeys: { route: "workflows" },
  nurture: { route: "workflows", keepId: true },
  reports: { route: "analytics" },
};

export const defaultRoute: Route = "forms";

/**
 * The screen for an address's first two parts. Unknown and old testing addresses open Forms; moved ones open
 * their new home. An account id opens through /companies/account/<id>, which finds its company.
 */
export function resolveRoute(first: string, id: string): { route: Route; id: string } {
  if (ROUTES.has(first)) return { route: first as Route, id };
  const m = MOVED[first];
  if (!m) return { route: defaultRoute, id: "" };
  if (m.keepId && id) return { route: m.route, id: m.id ? `${m.id}/${id}` : id };
  return { route: m.route, id: m.id && !m.keepId ? m.id : "" };
}
