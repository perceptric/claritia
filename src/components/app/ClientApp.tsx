"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabase, type SupaConfig } from "@/lib/supa";
import { NAV, resolveRoute, type Route as NavRoute } from "@/lib/nav";
import { BarChart, Box, Branch, Contact, Dollar, FileText, FormIcon, ListIcon, LogOut, Mail, Megaphone, Moon, Search, Settings, Sun, Users } from "../Icons";
import { Logo } from "../Logo";
import { AuthScreen } from "./AuthScreen";
import { Dots } from "./Ai";
import { CommandBar, type Command } from "./CommandBar";
import { DialogHost } from "./Dialogs";
import { Avatar, ErrorNote, errorText, mayLeave, must, type Role, type Route, type ViewProps, type Workspace } from "./ui";
import { ContactsView } from "./views/ContactsView";
import { CompaniesView, ObjectsView, OpportunitiesView } from "./views/RecordsViews";
import { SegmentsView } from "./views/SegmentsView";
import { AdsView, AnalyticsView, PagesView, TemplatesView } from "./views/MarketingIntros";
import { FormsView } from "./forms/FormsView";
import { NurtureView } from "./views/NurtureView";
import { SettingsView } from "./views/SettingsView";

// One icon per screen. The sidebar's groups are in src/lib/nav.ts.
const ICONS: Record<NavRoute, React.ReactNode> = {
  contacts: <Contact size={15} />,
  companies: <Users size={15} />,
  opportunities: <Dollar size={15} />,
  objects: <Box size={15} />,
  segments: <ListIcon size={15} />,
  templates: <Mail size={15} />,
  workflows: <Branch size={15} />,
  analytics: <BarChart size={15} />,
  forms: <FormIcon size={15} />,
  pages: <FileText size={15} />,
  ads: <Megaphone size={15} />,
  settings: <Settings size={15} />,
};

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
  // Companies: the live visit feed, and an old account link that finds its company.
  if (r.route === "companies" && a === "visits") return { route: r.route, id: a };
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
      const l = readLoc();
      setLoc(l);
      // Old and unknown addresses show where they landed.
      const want = `/${l.route}${l.id ? `/${l.id}` : ""}`;
      if (window.location.pathname !== want && !(l.route === "settings" && !l.id)) window.history.replaceState(null, "", want);
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

  // Pages with unsaved changes get to ask first.
  const navigate = useCallback((r: Route, id = "") => {
    mayLeave().then((ok) => {
      if (!ok) return;
      window.history.pushState(null, "", `/${r}${id ? `/${id}` : ""}`);
      setLoc({ route: r, id });
    });
  }, []);

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

  const objectLinks = customObjects.map((o) => {
    const on = route === "objects" && (loc.id === o.key || loc.id.startsWith(`${o.key}/`));
    return (
      <a
        key={`o-${o.key}`}
        href={`/objects/${o.key}`}
        onClick={(e) => {
          e.preventDefault();
          navigate("objects", o.key);
        }}
        aria-current={on && loc.id === o.key ? "page" : undefined}
        className={`flex h-9 shrink-0 items-center gap-2.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-[140ms] ${on ? "bg-ink text-paper" : "text-body hover:bg-hover hover:text-ink"}`}
      >
        <span className={on ? "text-paper" : "text-muted"}>{ICONS.objects}</span>
        <span className="truncate">{o.plural}</span>
      </a>
    );
  });
  const navLinks = NAV.map((n) => [
    n.group !== undefined ? (
      <p key={`g-${n.route}`} className={`hidden px-3.5 text-[12px] text-faint md:block ${n.group ? "mt-4 mb-1" : "mx-3.5 mt-3 mb-2 h-px bg-line px-0"}`}>
        {n.group}
      </p>
    ) : null,
    <a
      key={n.route}
      href={`/${n.route}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(n.route);
      }}
      aria-current={route === n.route && !loc.id ? "page" : undefined}
      className={`flex h-9 shrink-0 items-center gap-2.5 rounded-full px-3.5 text-[13.5px] font-medium transition-colors duration-[140ms] ${route === n.route ? "bg-ink text-paper" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      <span className={route === n.route ? "text-paper" : "text-muted"}>{ICONS[n.route]}</span>
      {n.label}
    </a>,
    n.route === "opportunities" ? objectLinks : null,
  ]);

  const commands: Command[] = [
    ...NAV.map((n) => ({ id: n.route, label: n.label, group: n.group || "App", icon: ICONS[n.route], run: () => navigate(n.route) })),
    ...customObjects.map((o) => ({ id: `o-${o.key}`, label: o.plural, group: "CRM", icon: ICONS.objects, run: () => navigate("objects", o.key) })),
    { id: "theme", label: theme === "dark" ? "Light mode" : "Dark mode", group: "Look", icon: theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, run: flip },
    { id: "out", label: "Sign out", group: "Account", icon: <LogOut size={15} />, run: () => void sb.auth.signOut() },
  ];

  return (
    <div className="flex h-screen min-h-0 flex-col bg-paper-deep md:flex-row">
      <DialogHost />
      {searching ? <CommandBar onClose={() => setSearching(false)} commands={commands} /> : null}
      {/* Side rail on wide screens, a top bar on phones */}
      <aside className="flex shrink-0 flex-col gap-3 p-3 md:h-full md:w-60 md:py-4">
        <div className="flex items-center justify-between gap-2 px-2">
          <Logo />
          <span className="truncate text-[12px] text-faint">{ws.name}</span>
        </div>
        <button
          type="button"
          onClick={() => setSearching(true)}
          className="hidden h-9 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-[13px] text-muted transition-colors duration-[140ms] hover:border-line-strong hover:text-ink md:flex"
        >
          <Search size={14} />
          <span className="flex-1 text-left">Search</span>
          <kbd className="font-mono text-[11px] text-faint">⌘K</kbd>
        </button>
        <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">{navLinks}</nav>
        <div className="mt-auto hidden items-center gap-1 px-1 pt-3 md:flex">
          <Avatar label={email} size={28} />
          <span className="ml-1 min-w-0 flex-1 truncate text-[12.5px] text-body">{email}</span>
          <button type="button" aria-label={theme === "dark" ? "Light mode" : "Dark mode"} title={theme === "dark" ? "Light mode" : "Dark mode"} onClick={flip} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
            {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <button type="button" aria-label="Sign out" title="Sign out" onClick={() => sb.auth.signOut()} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
            <LogOut size={15} />
          </button>
        </div>
      </aside>
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
        ) : route === "objects" ? (
          <ObjectsView key={loc.id.split("/")[0]} {...props} />
        ) : route === "segments" ? (
          <SegmentsView {...props} />
        ) : route === "templates" ? (
          <TemplatesView />
        ) : route === "workflows" ? (
          <NurtureView {...props} />
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
