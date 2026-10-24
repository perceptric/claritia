"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, type SupaConfig } from "@/lib/supa";
import { enrichmentPage, NAV, resolveRoute, routingPage, schedulingPage, signalsPage } from "@/lib/nav";
import { Check, LogOut, Moon, Sun } from "../Icons";
import { Logo } from "../Logo";
import { AuthScreen } from "./AuthScreen";
import { Dots } from "./Ai";
import { CommandBar, type Command } from "./CommandBar";
import { DialogHost } from "./Dialogs";
import { ErrorNote, errorText, mayLeave, must, type Role, type Route, type ViewProps, type Workspace } from "./ui";
import { GetStarted } from "./GetStarted";
import { NAV_ICONS, Sidebar, type CreateItem } from "./Sidebar";
import { EnrichmentView } from "./enrichment/EnrichmentView";
import { SchedulingView } from "./scheduling/SchedulingView";
import { SignalsView } from "./signals/SignalsView";
import { ContactsView } from "./views/ContactsView";
import { CompaniesView, ObjectsView, OpportunitiesView } from "./views/RecordsViews";
import { SegmentsView } from "./views/SegmentsView";
import { AdsView, AnalyticsView, PagesView } from "./views/MarketingIntros";
import { FormsView } from "./forms/FormsView";
import { MeetingsView } from "./meetings/MeetingsView";
import { useRoutingCommands } from "./routing/commands";
import { RoutingView } from "./routing/RoutingView";
import { EmailTemplatesView } from "./workflows/EmailTemplatesView";
import { WorkflowsView } from "./workflows/WorkflowsView";
import { SettingsView } from "./views/SettingsView";

const GROUP_LABEL = { crm: "CRM", automation: "Automation", routing: "Routing", scheduling: "Scheduling", email: "Email", site: "Site", ads: "App", settings: "App" } as const;

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
  // Meetings: /meetings/<id>.
  if (r.route === "meetings") return { route: r.route, id: uuid(a) ? a : "" };
  // Pages inside a route (src/lib/nav.ts).
  if (r.route === "routing") return { route: r.route, id: routingPage(r.id).id };
  if (r.route === "scheduling") return { route: r.route, id: schedulingPage(r.id).id };
  if (r.route === "signals") return { route: r.route, id: signalsPage(r.id).id };
  if (r.route === "enrichment") return { route: r.route, id: enrichmentPage(r.id).id };
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

  // Your workspace, made on first sign-in.
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const id = must(await sb.rpc("ensure_workspace")) as string;
      const w = must(await sb.from("workspaces").select("id, name, features").eq("id", id).single()) as Workspace;
      const m = must(await sb.from("workspace_members").select("role").eq("workspace_id", id).eq("user_id", userId).single()) as { role: Role };
      setWs(w);
      setRole(m.role);
    })().catch((e) => setError(errorText(e)));
  }, [sb, userId]);

  // The workspace's custom objects, listed in the sidebar after Opportunities.
  const [customObjects, setCustomObjects] = useState<{ key: string; plural: string }[]>([]);
  useEffect(() => {
    if (!ws) return;
    const load = () =>
      void sb
        .from("objects")
        .select("key, plural")
        .eq("workspace_id", ws.id)
        .eq("system", false)
        .order("created_at")
        .then(({ data }) => setCustomObjects((data ?? []) as { key: string; plural: string }[]));
    load();
    window.addEventListener("claritia:changed", load);
    return () => window.removeEventListener("claritia:changed", load);
  }, [sb, ws]);

  // Counts in the sidebar: leads waiting in Needs review, and today's meetings.
  const [counts, setCounts] = useState<Partial<Record<string, number>>>({});
  useEffect(() => {
    if (!ws) return;
    const load = async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);
      const [review, today] = await Promise.all([
        sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("route_status", ["held", "unassigned"]).is("deleted_at", null),
        sb.from("meetings").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("status", ["booked", "held"]).gte("start_at", start.toISOString()).lt("start_at", end.toISOString()),
      ]);
      setCounts({ "routing/review": review.count ?? 0, meetings: today.count ?? 0 });
    };
    void load();
    window.addEventListener("claritia:changed", load);
    return () => window.removeEventListener("claritia:changed", load);
  }, [sb, ws]);

  // Pages with unsaved changes get to ask first.
  const navigate = useCallback((r: Route, id = "", query = "") => {
    mayLeave().then((ok) => {
      if (!ok) return;
      window.history.pushState(null, "", `/${r}${id ? `/${id}` : ""}${query ? `?${query}` : ""}`);
      setLoc({ route: r, id });
    });
  }, []);
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

  const props: ViewProps = { sb, session, ws, role, navigate, id: loc.id };
  const email = session.user.email ?? "";

  const create: CreateItem[] = [
    { group: "CRM", label: "Contact", run: () => navigate("contacts", "", "create=1") },
    { group: "CRM", label: "Opportunity", run: () => navigate("opportunities", "", "create=1") },
    { group: "Automation", label: "Workflow", run: () => navigate("workflows", "new") },
    { group: "Automation", label: "Broadcast", run: () => navigate("workflows", "new", "template=broadcast") },
    { group: "Automation", label: "Form", run: () => navigate("forms", "new") },
    { group: "Routing", label: "Rule", run: () => navigate("routing", "rules", "create=1") },
    { group: "Routing", label: "Team", run: () => navigate("routing", "teams", "create=1") },
    { group: "Scheduling", label: "Meeting type", run: () => navigate("scheduling", "types/new") },
    { group: "Scheduling", label: "Single-use link", run: () => navigate("scheduling", "links", "create=single_use") },
    { group: "Scheduling", label: "Poll", run: () => navigate("scheduling", "links", "create=poll") },
    { group: "Scheduling", label: "Booking form", run: () => navigate("scheduling", "forms", "create=1") },
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
        create={create}
        start={<GetStarted sb={sb} ws={ws} session={session} navigate={navigate} />}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden border-line bg-card md:my-2.5 md:mr-2.5 md:rounded-3xl md:border">
        {error ? (
          <div className="border-b border-line p-3">
            <ErrorNote message={error} />
          </div>
        ) : null}
        {route === "contacts" ? (
          <ContactsView {...props} />
        ) : route === "companies" ? (
          <CompaniesView {...props} />
        ) : route === "opportunities" ? (
          <OpportunitiesView {...props} />
        ) : route === "meetings" ? (
          <MeetingsView key={loc.id} {...props} />
        ) : route === "routing" ? (
          <RoutingView key="routing" {...props} />
        ) : route === "scheduling" ? (
          <SchedulingView key={loc.id.split("/")[0]} {...props} />
        ) : route === "signals" ? (
          <SignalsView {...props} />
        ) : route === "enrichment" ? (
          <EnrichmentView {...props} />
        ) : route === "objects" ? (
          <ObjectsView key={loc.id.split("/")[0]} {...props} />
        ) : route === "segments" ? (
          <SegmentsView {...props} />
        ) : route === "templates" ? (
          <EmailTemplatesView {...props} />
        ) : route === "workflows" ? (
          <WorkflowsView key={loc.id === "new" ? "new" : "wf"} {...props} />
        ) : route === "analytics" ? (
          <AnalyticsView />
        ) : route === "forms" ? (
          <FormsView {...props} />
        ) : route === "pages" ? (
          <PagesView />
        ) : route === "ads" ? (
          <AdsView />
        ) : (
          <SettingsView {...props} />
        )}
      </main>
    </div>
  );
}
