"use client";

// The side rail (docs/app-structure.md Part 1): Create, Search, then the groups from src/lib/nav.ts. Groups fold (the
// fold is kept on this computer; the open page's group never folds), items in the four main groups carry a small
// tile in their group's wash, and Needs review and Meetings show a count. Folds to icons between 768 and 1,280 px.

import { useEffect, useState } from "react";
import { activeItem, GROUPS, NAV, type GroupKey, type NavItem, type Route as NavRoute } from "@/lib/nav";
import {
  Box,
  Branch,
  Building,
  CalendarIcon,
  Card,
  ChevronDown,
  Clock,
  Contact,
  Dollar,
  FileText,
  Flag,
  FormIcon,
  Funnel,
  Gauge,
  History,
  Layers,
  Link as LinkIcon,
  ListIcon,
  LogOut,
  Mail,
  MapIcon,
  Megaphone,
  Mic,
  Moon,
  Plus,
  Radar,
  Search,
  Settings,
  Signpost,
  Sparkle,
  Sun,
  Swap,
  Users,
  Bell,
} from "../Icons";
import { Logo } from "../Logo";
import { Popover } from "./FilterBar";
import { Avatar, type Route } from "./ui";

/** One icon per sidebar item, by its key. */
export const NAV_ICONS: Record<string, React.ReactNode> = {
  contacts: <Contact size={14} />,
  companies: <Users size={14} />,
  opportunities: <Dollar size={14} />,
  meetings: <CalendarIcon size={14} />,
  objects: <Box size={14} />,
  workflows: <Branch size={14} />,
  forms: <FormIcon size={14} />,
  signals: <Radar size={14} />,
  enrichment: <Layers size={14} />,
  routing: <Gauge size={14} />,
  "routing/rules": <Signpost size={14} />,
  "routing/teams": <Users size={14} />,
  "routing/regions": <MapIcon size={14} />,
  "routing/company-types": <Building size={14} />,
  "routing/handoffs": <Swap size={14} />,
  "routing/history": <History size={14} />,
  "routing/review": <Flag size={14} />,
  "scheduling/types": <CalendarIcon size={14} />,
  "scheduling/availability": <Clock size={14} />,
  "scheduling/links": <LinkIcon size={14} />,
  "scheduling/forms": <FormIcon size={14} />,
  "scheduling/reminders": <Bell size={14} />,
  "scheduling/payments": <Card size={14} />,
  "scheduling/ai": <Sparkle size={14} />,
  "scheduling/notetaker": <Mic size={14} />,
  segments: <ListIcon size={14} />,
  templates: <Mail size={14} />,
  reports: <Funnel size={14} />,
  "reports/speed": <Clock size={14} />,
  "reports/reps": <Users size={14} />,
  "reports/forms": <FormIcon size={14} />,
  "reports/email": <Mail size={14} />,
  pages: <FileText size={14} />,
  ads: <Megaphone size={14} />,
  settings: <Settings size={14} />,
};

const TILE: Record<"sky" | "clay" | "sage" | "butter" | "lilac", string> = {
  lilac: "bg-lilac-wash text-lilac",
  sky: "bg-sky-wash text-sky",
  clay: "bg-clay-wash text-clay",
  sage: "bg-sage-wash text-sage",
  butter: "bg-butter-wash text-butter",
};

const FOLD_KEY = "claritia:nav-folded";

function readFolded(): Set<GroupKey> {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? (v as GroupKey[]) : []);
  } catch {
    return new Set();
  }
}

export type CreateItem = { group: string; label: string; run: () => void };

export type SidebarProps = {
  route: Route;
  id: string;
  navigate: (r: Route, id?: string, query?: string) => void;
  objects: { key: string; plural: string }[];
  counts: Partial<Record<string, number>>;
  wsName: string;
  email: string;
  theme: "light" | "dark";
  onTheme: () => void;
  onSignOut: () => void;
  onSearch: () => void;
  create: CreateItem[];
  start: React.ReactNode;
};

export function Sidebar(p: SidebarProps) {
  const active = activeItem(p.route as NavRoute, p.id);
  const [folded, setFolded] = useState<Set<GroupKey>>(() => (typeof window === "undefined" ? new Set() : readFolded()));
  const toggle = (g: GroupKey) =>
    setFolded((s) => {
      const next = new Set(s);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      try {
        localStorage.setItem(FOLD_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  return (
    <aside className="flex shrink-0 flex-col gap-2.5 p-3 md:h-full md:w-[68px] md:py-4 xl:w-60">
      <div className="flex items-center justify-between gap-2 px-2 md:justify-center xl:justify-between">
        <Logo />
        <span className="truncate text-[12px] text-faint md:hidden xl:inline">{p.wsName}</span>
      </div>
      <CreateButton items={p.create} />
      <button
        type="button"
        onClick={p.onSearch}
        aria-label="Search"
        className="hidden h-9 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-[13px] text-muted transition-colors duration-[140ms] hover:border-line-strong hover:text-ink md:flex md:justify-center xl:justify-start"
      >
        <Search size={14} />
        <span className="flex-1 text-left md:hidden xl:inline">Search</span>
        <kbd className="font-mono text-[11px] text-faint md:hidden xl:inline">⌘K</kbd>
      </button>
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:min-h-0 md:flex-1 md:flex-col md:gap-0 md:overflow-y-auto md:overflow-x-hidden">
        {GROUPS.map((g) => {
          const items = NAV.filter((n) => n.group === g.key);
          const open = !folded.has(g.key) || active?.group === g.key;
          return (
            <div key={g.key} role="group" aria-label={g.label || undefined} className="flex shrink-0 gap-1 md:flex-col md:gap-0.5">
              {g.label ? (
                <button
                  type="button"
                  onClick={() => toggle(g.key)}
                  aria-expanded={open}
                  className="group/head mt-3 mb-0.5 hidden h-6 items-center gap-1 rounded-full px-3.5 text-left text-[12px] text-faint transition-colors duration-[140ms] hover:text-ink xl:flex"
                >
                  <span className="flex-1">{g.label}</span>
                  <ChevronDown size={12} className={`opacity-0 transition-[transform,opacity] duration-[140ms] group-hover/head:opacity-100 ${open ? "" : "-rotate-90 opacity-100"}`} />
                </button>
              ) : (
                <span aria-hidden="true" className="mx-3.5 mt-3 mb-2 hidden h-px bg-line md:block" />
              )}
              <div className={`flex gap-1 md:flex-col md:gap-0.5 ${open ? "" : "xl:hidden"}`}>
                {items.map((n) => (
                  <NavLink key={n.key} n={n} tone={g.tone} on={active?.key === n.key} count={p.counts[n.key]} navigate={p.navigate} />
                ))}
                {g.key === "crm"
                  ? p.objects.map((o) => (
                      <NavLink
                        key={`o-${o.key}`}
                        n={{ key: `objects/${o.key}`, route: "objects", page: o.key, label: o.plural, group: "crm" }}
                        tone={g.tone}
                        on={p.route === "objects" && (p.id === o.key || p.id.startsWith(`${o.key}/`))}
                        navigate={p.navigate}
                        icon={NAV_ICONS.objects}
                      />
                    ))
                  : null}
              </div>
            </div>
          );
        })}
      </nav>
      {p.start}
      <div className="hidden items-center gap-1 px-1 pt-1 md:flex md:flex-col xl:flex-row">
        <Avatar label={p.email} size={28} />
        <span className="ml-1 min-w-0 flex-1 truncate text-[12.5px] text-body md:hidden xl:inline">{p.email}</span>
        <button type="button" aria-label={p.theme === "dark" ? "Light mode" : "Dark mode"} title={p.theme === "dark" ? "Light mode" : "Dark mode"} onClick={p.onTheme} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
          {p.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={p.onSignOut} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
          <LogOut size={15} />
        </button>
      </div>
    </aside>
  );
}

function NavLink({ n, tone, on, count, navigate, icon }: { n: NavItem; tone: "sky" | "clay" | "sage" | "butter" | "lilac" | null; on: boolean; count?: number; navigate: SidebarProps["navigate"]; icon?: React.ReactNode }) {
  const glyph = icon ?? NAV_ICONS[n.key] ?? NAV_ICONS[n.route];
  return (
    <a
      href={`/${n.route}${n.page ? `/${n.page}` : ""}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(n.route as Route, n.page);
      }}
      aria-current={on ? "page" : undefined}
      title={n.label}
      className={`flex h-9 shrink-0 items-center gap-2.5 rounded-full px-2 text-[13.5px] font-medium transition-colors duration-[140ms] md:justify-center xl:justify-start ${on ? "bg-ink text-paper" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      <span
        aria-hidden="true"
        className={`flex size-6 shrink-0 items-center justify-center rounded-md transition-colors duration-[140ms] ${on ? "bg-paper/15 text-paper" : tone ? TILE[tone] : "text-muted"}`}
      >
        {glyph}
      </span>
      <span className="truncate md:hidden xl:inline">{n.label}</span>
      {n.soon ? <span className={`ml-auto rounded-full px-1.5 text-[10.5px] md:hidden xl:inline ${on ? "bg-paper/15 text-paper" : "bg-paper-deep text-faint"}`}>Soon</span> : null}
      {count ? (
        <span className={`ml-auto rounded-full px-1.5 text-[11px] tabular-nums md:hidden xl:inline ${on ? "bg-paper/15 text-paper" : "bg-butter-wash text-butter"}`}>{count > 99 ? "99+" : count}</span>
      ) : null}
    </a>
  );
}

/** "+ Create": one menu for everything you can make, grouped like the sidebar. */
function CreateButton({ items }: { items: CreateItem[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const open = !!anchor;
  const setOpen = (v: boolean) => (v ? null : setAnchor(null));
  const groups = [...new Set(items.map((i) => i.group))];
  useEffect(() => {
    if (!open) return;
    const first = document.querySelector<HTMLElement>("[data-create-item]");
    first?.focus();
  }, [open]);
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className="press flex h-9 items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-paper transition-colors duration-[140ms] hover:bg-ink/90"
      >
        <Plus size={14} />
        <span className="md:hidden xl:inline">Create</span>
        <ChevronDown size={12} className="md:hidden xl:inline" />
      </button>
      {open ? (
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={240}>
          <div role="menu" aria-label="Create" className="flex max-h-[70vh] flex-col overflow-y-auto py-1">
            {groups.map((g) => (
              <div key={g} className="flex flex-col py-1">
                <p className="px-3 pb-1 text-[11.5px] text-faint">{g}</p>
                {items
                  .filter((i) => i.group === g)
                  .map((i) => (
                    <button
                      key={i.label}
                      type="button"
                      role="menuitem"
                      data-create-item=""
                      onClick={() => {
                        setOpen(false);
                        i.run();
                      }}
                      className="mx-1 flex h-8 items-center gap-2 rounded-lg px-2.5 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
                    >
                      <Plus size={13} className="text-faint" />
                      {i.label}
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
