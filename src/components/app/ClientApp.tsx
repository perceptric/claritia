"use client";

import { FormFolderNav } from "./forms/folders";
import type { Session } from "@supabase/supabase-js";
import dynamic from "next/dynamic";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, type SupaConfig } from "@/lib/supa";
import { NAV, resolveRoute, routingPage, schedulingPage } from "@/lib/nav";
import { LogOut, Moon, Sun } from "../Icons";
import { Logo } from "../Logo";
import { AuthScreen } from "./AuthScreen";
import { OAuthApprove } from "./OAuthApprove";
import { Dots } from "./Ai";
import { CommandBar, type Command } from "./CommandBar";
import { askText, DialogHost, tell } from "./Dialogs";
import { bookingOrigin, bookingUrl } from "@/lib/meetings/handles";
import { cache, ErrorNote, errorText, Loading, mayLeave, must, postJson, type Role, type Route, type ViewProps, type Workspace } from "./ui";
import { NAV_ICONS, Sidebar, type CreateItem, type WorkspaceChoice } from "./Sidebar";
import { GetStarted } from "./GetStarted";
import { isMissingFn } from "@/lib/forms/newer";
import { useRoutingCommands } from "./routing/commands";
import { useAppCounts } from "./appCounts";

// Each section loads its own code when first opened (or when its sidebar item is hovered), so the app starts small.
const LOADERS = {
  meetings: () => import("./meetings/MeetingsView").then((m) => m.MeetingsView),
  routing: () => import("./routing/RoutingView").then((m) => m.RoutingView),
  scheduling: () => import("./scheduling/SchedulingView").then((m) => m.SchedulingView),
  workflows: () => import("./workflows/WorkflowsView").then((m) => m.WorkflowsView),
  forms: () => import("./forms/FormsView").then((m) => m.FormsView),
  settings: () => import("./views/SettingsView").then((m) => m.SettingsView),
} satisfies Partial<Record<Route, () => Promise<React.ComponentType<ViewProps>>>>;
type ViewRoute = keyof typeof LOADERS;

const loading = () => <Loading />;
const VIEWS: Record<ViewRoute, React.ComponentType<ViewProps>> = {
  meetings: dynamic(LOADERS.meetings, { ssr: false, loading }),
  routing: dynamic(LOADERS.routing, { ssr: false, loading }),
  scheduling: dynamic(LOADERS.scheduling, { ssr: false, loading }),
  workflows: dynamic(LOADERS.workflows, { ssr: false, loading }),
  forms: dynamic(LOADERS.forms, { ssr: false, loading }),
  settings: dynamic(LOADERS.settings, { ssr: false, loading }),
};
const viewOf = (r: Route): ViewRoute => (r in LOADERS ? (r as ViewRoute) : "settings");
const preloadView = (r: Route) => void LOADERS[viewOf(r)]().catch(() => undefined);

/** The open section. Memoized, so the command bar and the sidebar counts don't redraw it. */
const OpenView = memo(function OpenView({ route, ...props }: ViewProps & { route: Route }) {
  const View = VIEWS[viewOf(route)];
  return <View {...props} />;
});

const GROUP_LABEL = { main: "Go to", settings: "App" } as const;

type Loc = { route: Route; id: string };
const WITH_ID = new Set<Route>(["forms", "workflows"]);

const readLoc = (): Loc => {
  const [, first = "", id = "", rest = ""] = window.location.pathname.split("/");
  const r = resolveRoute(first, rest ? `${id}/${rest}` : id);
  const [a = ""] = r.id.split("/");
  const uuid = (x: string) => /^[0-9a-f-]{36}$/.test(x);
  // Settings pages: /settings/<page>.
  if (r.route === "settings") return { route: r.route, id: /^[a-z_]{2,30}$/.test(a) ? a : "" };
  if ((r.route === "forms" || r.route === "workflows") && a === "new") return { route: r.route, id: a };
  if (r.route === "forms" && a === "overview") return { route: r.route, id: a };
  // The template gallery: /forms/templates and /forms/templates/<template> (the website links there).
  if (r.route === "forms" && a === "templates") {
    const t = r.id.split("/")[1] ?? "";
    return { route: r.route, id: /^[a-z0-9-]{3,80}$/.test(t) ? `templates/${t}` : "templates" };
  }
  // Meetings: /meetings/<id>.
  if (r.route === "meetings") return { route: r.route, id: uuid(a) ? a : "" };
  // Pages inside a route (src/lib/nav.ts).
  if (r.route === "routing") return { route: r.route, id: routingPage(r.id).id };
  if (r.route === "scheduling") return { route: r.route, id: schedulingPage(r.id).id };
  return { route: r.route, id: WITH_ID.has(r.route) && uuid(a) ? a : "" };
};

// The workspace picked on this computer, for people in more than one.
const PICK_KEY = "claritia:workspace";
const readPicked = (): string | null => {
  try {
    const v = localStorage.getItem(PICK_KEY);
    return v && /^[0-9a-f-]{36}$/.test(v) ? v : null;
  } catch {
    return null;
  }
};
const savePicked = (id: string) => {
  try {
    localStorage.setItem(PICK_KEY, id);
  } catch {}
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
  const [ws, setWs] = useState<(Workspace & { named?: boolean }) | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceChoice[]>([]);
  // Bumped to open another workspace: app_start runs again with the new pick.
  const [wsPick, setWsPick] = useState(0);
  const [role, setRole] = useState<Role>("member");
  const [loc, setLoc] = useState<Loc>({ route: "forms", id: "" });
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
      // An app's sign-in keeps its own address (the approve screen reads it).
      if (window.location.pathname.startsWith("/oauth/")) return;
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

  // Your workspace (made on first sign-in), your role and the workspaces to switch to, in one call. A workspace just
  // joined from an invite opens first, then the one picked on this computer (133_signup.sql).
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const picked = readPicked();
      let res = await sb.rpc("app_start", { p_ws: picked });
      // The database before 133: the old call, one workspace.
      if (isMissingFn(res.error)) res = await sb.rpc("app_start");
      const r = must(res) as { workspace: Workspace & { named?: boolean }; role: Role; workspaces?: WorkspaceChoice[] };
      setWs(r.workspace);
      setRole(r.role);
      setWorkspaces(r.workspaces ?? [{ id: r.workspace.id, name: r.workspace.name, role: r.role }]);
      savePicked(r.workspace.id);
    })().catch((e) => setError(errorText(e)));
  }, [sb, userId, wsPick]);
  // A new workspace is named after the email: its owner is asked for the team's name once (133_signup.sql).
  const unnamed = !!ws && ws.named === false && role === "owner" ? ws.id : null;
  useEffect(() => {
    if (!unnamed) return;
    const key = `claritia:named:${unnamed}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {}
    (async () => {
      const name = (await askText("What's your team called?", { placeholder: "Acme", ok: "Continue" }))?.trim();
      if (!name) return;
      must(await sb.rpc("workspace_name_set", { p_ws: unnamed, p_name: name }));
      setWs((w) => (w && w.id === unnamed ? { ...w, name, named: true } : w));
      setWorkspaces((list) => list.map((x) => (x.id === unnamed ? { ...x, name } : x)));
    })().catch((e) => setError(errorText(e)));
  }, [sb, unnamed]);

  // Signing out empties the cache, so the next person starts clean.
  useEffect(() => {
    if (session === null) cache.clear();
  }, [session]);

  // Counts in the sidebar (today's meetings) and its dots (a rep with no calendar, routing not live).
  const appCounts = useAppCounts(sb, ws?.id ?? null).data;
  const counts = appCounts?.sidebar ?? NO_COUNTS;
  const dots = appCounts?.dots ?? NO_DOTS;

  // Pages with unsaved changes get to ask first.
  const navigate = useCallback((to: Route, toId = "", query = "") => {
    // Moved pages open their new home (a workflow opens in Emails › Journeys, availability in Routing › Sales reps).
    const { route: r, id } = resolveRoute(to, toId);
    mayLeave().then((ok) => {
      if (!ok) return;
      window.history.pushState(null, "", `/${r}${id ? `/${id}` : ""}${query ? `?${query}` : ""}`);
      setLoc({ route: r, id });
    });
  }, []);
  const onWorkspace = useCallback((patch: Partial<Workspace>) => {
    setWs((w) => (w ? { ...w, ...patch } : w));
    if (patch.name) setWorkspaces((list) => list.map((x) => (x.id === ws?.id ? { ...x, name: patch.name! } : x)));
  }, [ws?.id]);
  // Another workspace: forget this one's screens and open Forms there.
  const pickWorkspace = useCallback((id: string) => {
    mayLeave().then((ok) => {
      if (!ok) return;
      savePicked(id);
      cache.clear();
      setWs(null);
      window.history.pushState(null, "", "/forms");
      setLoc({ route: "forms", id: "" });
      setWsPick((n) => n + 1);
    });
  }, []);
  const routingCommands = useRoutingCommands({ sb, session, ws: ws?.id ?? null, navigate });

  if (session === undefined) return <Splash />;
  if (!session) return <AuthScreen sb={sb} config={config} />;
  if (error && !ws)
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-7 shadow-hover">
          <Logo />
          <ErrorNote message={error} />
        </div>
      </main>
    );
  if (!ws) return <Splash />;
  if (typeof window !== "undefined" && window.location.pathname === "/oauth/authorize") return <OAuthApprove session={session} ws={ws} />;

  const props: ViewProps = { sb, session, ws, role, navigate, id: loc.id, onWorkspace };
  const email = session.user.email ?? "";

  const create: CreateItem[] = [
    { group: "Forms", label: "Form", run: () => navigate("forms", "new") },
    { group: "Meetings", label: "Meeting type", run: () => navigate("scheduling", "types/new") },
    { group: "Meetings", label: "Single-use link", run: () => navigate("scheduling", "links", "create=single_use") },
    { group: "Meetings", label: "Poll", run: () => navigate("scheduling", "links", "create=poll") },
    { group: "Workflows", label: "Workflow", run: () => navigate("workflows", "new") },
  ];

  // ⌘K "Copy my booking link": your page's address, or the Booking page to set one.
  const copyBookingLink = async () => {
    if (!session || !ws) return;
    try {
      const r = await postJson<{ profile: { handle: string | null } | null }>(session, "/api/meetings/booking", { workspaceId: ws.id, action: "load" });
      const handle = r.profile?.handle;
      if (!handle) return navigate("scheduling", "booking");
      await navigator.clipboard.writeText(bookingUrl(bookingOrigin(window.location), handle));
      await tell("Copied your booking link");
    } catch (e) {
      await tell(errorText(e));
    }
  };

  const commands: Command[] = [
    ...NAV.map((n) => ({ id: n.key, label: n.label, group: GROUP_LABEL[n.group], icon: NAV_ICONS[n.key] ?? NAV_ICONS[n.route], run: () => navigate(n.route, n.page) })),
    ...create.map((c) => ({ id: `create-${c.label}`, label: `New ${c.label.toLowerCase()}`, group: "Create", icon: NAV_ICONS.objects, run: c.run })),
    ...routingCommands,
    { id: "booking-link", label: "Copy my booking link", group: "Meetings", icon: NAV_ICONS.scheduling, run: () => void copyBookingLink() },
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
        counts={counts}
        dots={dots}
        wsName={ws.name}
        wsId={ws.id}
        workspaces={workspaces}
        onPickWorkspace={pickWorkspace}
        start={<GetStarted sb={sb} ws={ws} navigate={navigate} />}
        email={email}
        theme={theme}
        onTheme={flip}
        onSignOut={() => void sb.auth.signOut()}
        onSearch={() => setSearching(true)}
        onPreload={preloadView}
        create={create}
        under={{ forms: <FormFolderNav sb={sb} ws={ws.id} current={route === "forms" ? loc.id : ""} open navigate={(r, id) => navigate(r, id)} onError={setError} /> }}
      />
      <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-paper md:my-2 md:mr-2 md:rounded-xl md:shadow-rest">
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
const NO_DOTS: Partial<Record<string, boolean>> = {};


