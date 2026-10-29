"use client";

// The side rail (docs/app-structure.md Part 1): Create, Search, then the groups from src/lib/nav.ts. Groups fold (the
// fold is kept on this computer; the open page's group never folds), and Needs review and Meetings show a count. The
// open item is a white chip with a hairline, like Omniscient. Folds to icons between 768 and 1,280 px.

import { useEffect, useState } from "react";
import { activeItem, GROUPS, NAV, type GroupKey, type NavItem, type Route as NavRoute } from "@/lib/nav";
import {
  Box,
  Branch,
  CalendarIcon,
  ChevronDown,
  Clock,
  Contact,
  Dollar,
  FormIcon,
  Gauge,
  Layers,
  ListIcon,
  LogOut,
  Mail,
  Moon,
  Plus,
  Radar,
  Search,
  Settings,
  Signpost,
  Sun,
  Users,
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
  routing: <Signpost size={14} />,
  enrichment: <Layers size={14} />,
  forms: <FormIcon size={14} />,
  scheduling: <Clock size={14} />,
  visitors: <Radar size={14} />,
  emails: <Mail size={14} />,
  segments: <ListIcon size={14} />,
  scoring: <Gauge size={14} />,
  settings: <Settings size={14} />,
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
  const active = activeItem(p.route as NavRoute);
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
        className="hidden h-8 items-center gap-2 rounded-md border border-line bg-card px-3 text-[13px] text-muted transition-colors duration-[140ms] hover:border-line-strong hover:text-ink md:flex md:justify-center xl:justify-start"
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
                  className="group/head mt-3 mb-0.5 hidden h-6 items-center gap-1 rounded-md px-2 text-left text-[11.5px] text-faint transition-colors duration-[140ms] hover:text-ink xl:flex"
                >
                  <span className="flex-1">{g.label}</span>
                  <ChevronDown size={12} className={`opacity-0 transition-[transform,opacity] duration-[140ms] group-hover/head:opacity-100 ${open ? "" : "-rotate-90 opacity-100"}`} />
                </button>
              ) : (
                <span aria-hidden="true" className="mx-2 mt-3 mb-2 hidden h-px bg-line md:block" />
              )}
              <div className={`flex gap-1 md:flex-col md:gap-0.5 ${open ? "" : "xl:hidden"}`}>
                {items.map((n) => (
                  <NavLink key={n.key} n={n} on={active?.key === n.key} count={p.counts[n.key]} navigate={p.navigate} />
                ))}
                {g.key === "crm"
                  ? p.objects.map((o) => (
                      <NavLink
                        key={`o-${o.key}`}
                        n={{ key: `objects/${o.key}`, route: "objects", page: o.key, label: o.plural, group: "crm" }}
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

function NavLink({ n, on, count, navigate, icon }: { n: NavItem; on: boolean; count?: number; navigate: SidebarProps["navigate"]; icon?: React.ReactNode }) {
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
      className={`flex h-8 shrink-0 items-center gap-2.5 rounded-[7px] px-2 text-[13px] transition-[background-color,color,box-shadow] duration-[120ms] md:justify-center xl:justify-start ${on ? "bg-card text-ink shadow-[0_0_0_1px_var(--color-line),0_1px_2px_rgb(10_10_10/0.05)]" : "text-muted hover:bg-hover hover:text-ink"}`}
    >
      <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center ${on ? "text-ink" : ""}`}>
        {glyph}
      </span>
      <span className="truncate md:hidden xl:inline">{n.label}</span>
      {count ? (
        <span className="ml-auto rounded-full bg-hover px-1.5 font-mono text-[11px] tabular-nums text-muted md:hidden xl:inline">{count > 99 ? "99+" : count}</span>
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
        className="press flex h-8 items-center justify-center gap-1.5 rounded-full bg-ink px-3.5 text-[13px] font-medium text-paper transition-colors duration-[140ms] hover:bg-ink/90"
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
