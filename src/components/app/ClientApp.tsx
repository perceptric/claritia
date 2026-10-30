"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, type SupaConfig } from "@/lib/supa";
import { contactsPage, emailsPage, enrichmentPage, NAV, resolveRoute, routingPage, schedulingPage, scoringPage } from "@/lib/nav";
import { Check, LogOut, Moon, Sun } from "../Icons";
import { Logo } from "../Logo";
import { AuthScreen } from "./AuthScreen";
import { Dots } from "./Ai";
import { CommandBar, type Command } from "./CommandBar";
import { DialogHost } from "./Dialogs";
import { cache, ErrorNote, errorText, Loading, mayLeave, must, useQuery, type Role, type Route, type ViewProps, type Workspace } from "./ui";
import { GetStarted } from "./GetStarted";
import { NAV_ICONS, Sidebar, type CreateItem } from "./Sidebar";
import { useRoutingCommands } from "./routing/commands";
import { useAppCounts } from "./appCounts";

// Each section loads its own code when first opened (or when its sidebar item is hovered), so the app starts small.
const LOADERS = {
  contacts: () => import("./views/ContactsView").then((m) => m.ContactsView),
  companies: () => import("./views/RecordsViews").then((m) => m.CompaniesView),
  opportunities: () => import("./views/RecordsViews").then((m) => m.OpportunitiesView),
  objects: () => import("./views/RecordsViews").then((m) => m.ObjectsView),
  meetings: () => import("./meetings/MeetingsView").then((m) => m.MeetingsView),
  routing: () => import("./routing/RoutingView").then((m) => m.RoutingView),
  scheduling: () => import("./scheduling/SchedulingView").then((m) => m.SchedulingView),
  enrichment: () => import("./enrichment/EnrichmentView").then((m) => m.EnrichmentView),
  segments: () => import("./views/SegmentsView").then((m) => m.SegmentsView),
  workflows: () => import("./workflows/WorkflowsView").then((m) => m.WorkflowsView),
  emails: () => import("./nurture/EmailsView").then((m) => m.EmailsView),
  scoring: () => import("./scoring/ScoringView").then((m) => m.ScoringView),
  forms: () => import("./forms/FormsView").then((m) => m.FormsView),
  settings: () => import("./views/SettingsView").then((m) => m.SettingsView),
} satisfies Partial<Record<Route, () => Promise<React.ComponentType<ViewProps>>>>;
type ViewRoute = keyof typeof LOADERS;

const loading = () => <Loading />;
const VIEWS: Record<ViewRoute, React.ComponentType<ViewProps>> = {
  contacts: dynamic(LOADERS.contacts, { ssr: false, loading }),
  companies: dynamic(LOADERS.companies, { ssr: false, loading }),
  opportunities: dynamic(LOADERS.opportunities, { ssr: false, loading }),
  objects: dynamic(LOADERS.objects, { ssr: false, loading }),
  meetings: dynamic(LOADERS.meetings, { ssr: false, loading }),
  routing: dynamic(LOADERS.routing, { ssr: false, loading }),
  scheduling: dynamic(LOADERS.scheduling, { ssr: false, loading }),
  enrichment: dynamic(LOADERS.enrichment, { ssr: false, loading }),
  segments: dynamic(LOADERS.segments, { ssr: false, loading }),
  workflows: dynamic(LOADERS.workflows, { ssr: false, loading }),
  emails: dynamic(LOADERS.emails, { ssr: false, loading }),
  scoring: dynamic(LOADERS.scoring, { ssr: false, loading }),
  forms: dynamic(LOADERS.forms, { ssr: false, loading }),
  settings: dynamic(LOADERS.settings, { ssr: false, loading }),
};
const viewOf = (r: Route): ViewRoute => (r in LOADERS ? (r as ViewRoute) : "settings");
const preloadView = (r: Route) => void LOADERS[viewOf(r)]().catch(() => undefined);

/** The open section. Memoized, so the command bar and the sidebar counts don't redraw it. */
const OpenView = memo(function OpenView({ route, ...props }: ViewProps & { route: Route }) {
  const View = VIEWS[viewOf(route)];
  // Custom objects: a different object is a different list.
  return <View key={route === "objects" ? props.id.split("/")[0] : undefined} {...props} />;
});

const GROUP_LABEL = { crm: "CRM", automation: "Automation", inbound: "Inbound", nurture: "Nurture", settings: "App" } as const;

type Loc = { route: Route; id: string };
const WITH_ID = new Set<Route>(["contacts", "companies", "opportunities", "segments", "forms", "workflows"]);

const readLoc = (): Loc => {
  const [, first = "", id = "", rest = ""] = window.location.pathname.split("/");
  const r = resolveRoute(first, rest ? `${id}/${rest}` : id);
  const [a = "", b = ""] = r.id.split("/");
  const uuid = (x: string) => /^[0-9a-f-]{36}$/.test(x);
  // Custom objects: /objects/<key> and /objects/<key>/<record id>.
  if (r.route === "objects") return { route: r.route, id: /^[a-z][a-z0-9_]{0,39}$/.test(a) ? (uuid(b) ? `${a}/${b}` : a) : "" };
  // Settings pages: /settings/<page>.
  if (r.route === "settings") return { route: r.route, id: /^[a-z_]{2,30}$/.test(a) ? a : "" };
  if ((r.route === "segments" || r.route === "forms" || r.route === "workflows") && a === "new") return { route: r.route, id: a };
  if (r.route === "forms" && a === "overview") return { route: r.route, id: a };
  // Meetings: /meetings/<id>.
  if (r.route === "meetings") return { route: r.route, id: uuid(a) ? a : "" };
  // Pages inside a route (src/lib/nav.ts).
  if (r.route === "routing") return { route: r.route, id: routingPage(r.id).id };
  if (r.route === "scheduling") return { route: r.route, id: schedulingPage(r.id).id };
  if (r.route === "enrichment") return { route: r.route, id: enrichmentPage(r.id).id };
  if (r.route === "emails") return { route: r.route, id: emailsPage(r.id).id };
  if (r.route === "scoring") return { route: r.route, id: scoringPage(r.id).id };
  if (r.route === "contacts" && !uuid(a)) return { route: r.route, id: contactsPage(r.id).id };
  // Companies: an old account link that finds its company.
  if (r.route === "companies" && a === "account" && uuid(b)) return { route: r.route, id: `account/${b}` };
  return { route: r.route, id: WITH_ID.has(r.route) && uuid(a) ? a : "" };
};

function Splash() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <Dots />
    </main>
  );
}

type Theme = "light" | "dark";

/** Light or dark, saved on this computer; the page sets it before the first paint. */
function useTheme() {
  // The app shows a splash before anything themed, so reading the page here can't differ from the server's render.
  const [theme, setTheme] = useState<Theme>(() => (typeof document !== "undefined" && document.documentElement.dataset.theme === "dark" ? "dark" : "light"));
  const flip = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = next;
      try {
        localStorage.setItem("claritia:theme", next);
      } catch {}
      return next;
    });
  }, []);
  return { theme, flip };
}

export function ClientApp({ config }: { config: SupaConfig }) {
  const sb = useMemo(() => getSupabase(config), [config]);
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [loc, setLoc] = useState<Loc>({ route: "contacts", id: "" });
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const { theme, flip } = useTheme();
  const route = loc.route;

  // ⌘K or Ctrl+K opens the command bar.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching((v) => !v);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [sb]);

  useEffect(() => {
    const sync = () => {
      const l = readLoc();
      setLoc(l);
      // Old and unknown addresses show where they landed.
      const want = `/${l.route}${l.id ? `/${l.id}` : ""}`;
      if (window.location.pathname !== want && !(l.route === "settings" && !l.id) && !(l.route === "scheduling" && l.id === "types" && window.location.pathname === "/scheduling"))
        window.history.replaceState(null, "", want + window.location.search);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const userId = session?.user.id;

  // Your workspace (made on first sign-in) and your role, in one call.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const r = must(await sb.rpc("app_start")) as { workspace: Workspace; role: Role };
      setWs(r.workspace);
      setRole(r.role);
    })().catch((e) => setError(errorText(e)));
  }, [sb, userId]);
  // Signing out empties the cache, so the next person starts clean.
  useEffect(() => {
    if (session === null) cache.clear();
  }, [session]);

  // The workspace's custom objects, listed in the sidebar after Opportunities.
  const customObjects = useCustomObjects(sb, ws?.id ?? null);

  // Counts in the sidebar: leads waiting in Needs review, and today's meetings.
  const counts = useAppCounts(sb, ws?.id ?? null).data?.sidebar ?? NO_COUNTS;

  // Pages with unsaved changes get to ask first.
  const navigate = useCallback((to: Route, toId = "", query = "") => {
    // Moved pages open their new home (a workflow opens in Emails › Journeys).
    const { route: r, id } = to === "workflows" ? resolveRoute(to, toId) : { route: to, id: toId };
    mayLeave().then((ok) => {
      if (!ok) return;
      window.history.pushState(null, "", `/${r}${id ? `/${id}` : ""}${query ? `?${query}` : ""}`);
      setLoc({ route: r, id });
    });
  }, []);
  const onWorkspace = useCallback((patch: Partial<Workspace>) => setWs((w) => (w ? { ...w, ...patch } : w)), []);
  const routingCommands = useRoutingCommands({ sb, session, ws: ws?.id ?? null, navigate });

  if (session === undefined) return <Splash />;
  if (!session) return <AuthScreen sb={sb} />;
  if (error && !ws)
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-card p-7">
          <Logo />
          <ErrorNote message={error} />
        </div>
      </main>
    );
  if (!ws) return <Splash />;

  const props: ViewProps = { sb, session, ws, role, navigate, id: loc.id, onWorkspace };
  const email = session.user.email ?? "";

  const create: CreateItem[] = [
    { group: "CRM", label: "Contact", run: () => navigate("contacts", "", "create=1") },
    { group: "CRM", label: "Opportunity", run: () => navigate("opportunities", "", "create=1") },
    { group: "Automation", label: "Workflow", run: () => navigate("workflows", "new") },
    { group: "Automation", label: "Routing rule", run: () => navigate("routing", "") },
    { group: "Automation", label: "Team", run: () => navigate("routing", "team", "create=1") },
    { group: "Inbound", label: "Form", run: () => navigate("forms", "new") },
    { group: "Inbound", label: "Meeting type", run: () => navigate("scheduling", "types/new") },
    { group: "Inbound", label: "Single-use link", run: () => navigate("scheduling", "links", "create=single_use") },
    { group: "Inbound", label: "Poll", run: () => navigate("scheduling", "links", "create=poll") },
    { group: "Nurture", label: "Broadcast", run: () => navigate("workflows", "new", "template=broadcast") },
    { group: "Nurture", label: "Email template", run: () => navigate("emails", "library", "create=1") },
    { group: "Nurture", label: "Segment", run: () => navigate("segments", "new") },
  ];

  const commands: Command[] = [
    ...NAV.map((n) => ({ id: n.key, label: n.label, group: GROUP_LABEL[n.group], icon: NAV_ICONS[n.key] ?? NAV_ICONS[n.route], run: () => navigate(n.route, n.page) })),
    ...customObjects.map((o) => ({ id: `o-${o.key}`, label: o.plural, group: "CRM", icon: NAV_ICONS.objects, run: () => navigate("objects", o.key) })),
    ...create.map((c) => ({ id: `create-${c.label}`, label: `New ${c.label.toLowerCase()}`, group: "Create", icon: NAV_ICONS.objects, run: c.run })),
    { id: "get-started", label: "Get started", group: "App", icon: <Check size={15} />, run: () => window.dispatchEvent(new Event("claritia:get-started")) },
    ...routingCommands,
    { id: "theme", label: theme === "dark" ? "Light mode" : "Dark mode", group: "Look", icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, run: flip },
    { id: "out", label: "Sign out", group: "Account", icon: <LogOut size={15} />, run: () => void sb.auth.signOut() },
  ];

  return (
    <div className="flex h-screen min-h-0 flex-col bg-paper-deep md:flex-row">
      <DialogHost />
      {searching ? <CommandBar onClose={() => setSearching(false)} commands={commands} /> : null}
      {/* Side rail on wide screens, a top bar on phones */}
      <Sidebar
        route={route}
        id={loc.id}
        navigate={navigate}
        objects={customObjects}
        counts={counts}
        wsName={ws.name}
        email={email}
        theme={theme}
        onTheme={flip}
        onSignOut={() => void sb.auth.signOut()}
        onSearch={() => setSearching(true)}
        onPreload={preloadView}
        create={create}
        start={<GetStarted sb={sb} ws={ws} navigate={navigate} />}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden border-line bg-card md:my-2 md:mr-2 md:rounded-2xl md:border md:shadow-xs">
        {error ? (
          <div className="border-b border-line p-3">
            <ErrorNote message={error} />
          </div>
        ) : null}
        <OpenView route={route} {...props} />
      </main>
    </div>
  );
}

const NO_COUNTS: Partial<Record<string, number>> = {};

/** Custom objects for the sidebar and the command bar (`objects:<workspace>:custom`). */
function useCustomObjects(sb: SupabaseClient, ws: string | null) {
  const q = useQuery<{ key: string; plural: string }[]>(
    ws ? `objects:${ws}:custom` : null,
    async () => (must(await sb.from("objects").select("key, plural").eq("workspace_id", ws!).eq("system", false).order("created_at")) ?? []) as { key: string; plural: string }[],
    { staleMs: 60_000 },
  );
  return q.data ?? NO_OBJECTS;
}
const NO_OBJECTS: { key: string; plural: string }[] = [];
