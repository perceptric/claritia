"use client";

// The side rail (docs/app-structure.md Part 1, docs/email-canvas-plan.md Part A): Create, Search, then Forms and each
// page of Meetings and Emails from src/lib/nav.ts, each under a row that opens and folds like Forms' folders, and Settings at the very bottom above
// the account row. Folded to icons, a thin line stands in for each label. Items can show a count. The
// open item is a white chip on a ring shadow with a green icon. Folds to icons between 768 and 1,280 px, and on wider
// screens when the person folds it (kept on this computer) or while Form Studio is open (docs/studio-v2-plan.md,
// Part 1: the Studio sends "claritia:studio"; leaving it puts the sidebar back the way it was).

import { useEffect, useState } from "react";
import { activeItem, NAV, SECTION_LABEL, type NavItem, type NavSection, type Route as NavRoute } from "@/lib/nav";
import {
  Box,
  Branch,
  CalendarIcon,
  Check,
  ChevronDown,
  Clock,
  FileText,
  FormIcon,
  Gear,
  Grid,
  Link,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  Plus,
  Search,
  Send,
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
  meetings: <CalendarIcon size={14} />,
  objects: <Box size={14} />,
  workflows: <Branch size={14} />,
  routing: <Signpost size={14} />,
  forms: <FormIcon size={14} />,
  scheduling: <CalendarIcon size={14} />,
  emails: <Mail size={14} />,
  settings: <Settings size={14} />,
  "meetings-types": <Grid size={14} />,
  "meetings-upcoming": <CalendarIcon size={14} />,
  "meetings-availability": <Clock size={14} />,
  "meetings-booking": <Monitor size={14} />,
  "meetings-links": <Link size={14} />,
  "meetings-settings": <Gear size={14} />,
  "emails-home": <Send size={14} />,
  "emails-automations": <Branch size={14} />,
  "emails-audiences": <Users size={14} />,
  "emails-templates": <FileText size={14} />,
  "emails-brand": <Palette size={14} />,
};

const RAIL_KEY = "claritia:nav-rail";

/** Icons only, on wide screens too: the person's choice, or folded while Form Studio is open. */
function useRail(): [boolean, () => void] {
  const [pref, setPref] = useState(() => {
    try {
      return typeof window !== "undefined" && localStorage.getItem(RAIL_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [studio, setStudio] = useState<boolean | null>(null);
  useEffect(() => {
    const on = (e: Event) => setStudio((e as CustomEvent<boolean>).detail ? true : null);
    window.addEventListener("claritia:studio", on);
    return () => window.removeEventListener("claritia:studio", on);
  }, []);
  const rail = studio ?? pref;
  const toggle = () => {
    if (studio !== null) return setStudio(!studio);
    setPref(!pref);
    try {
      localStorage.setItem(RAIL_KEY, pref ? "0" : "1");
    } catch {}
  };
  return [rail, toggle];
}

const SECTIONS_KEY = "claritia:nav-closed";

/** Which of Meetings and Emails are folded on the wide sidebar (kept on this computer). */
function useSections(): [Partial<Record<NavSection, boolean>>, (s: NavSection) => void] {
  const [closed, setClosed] = useState<Partial<Record<NavSection, boolean>>>(() => {
    try {
      return typeof window !== "undefined" ? JSON.parse(localStorage.getItem(SECTIONS_KEY) || "{}") : {};
    } catch {
      return {};
    }
  });
  const toggle = (sec: NavSection) => {
    const next = { ...closed, [sec]: !closed[sec] };
    setClosed(next);
    try {
      localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
    } catch {}
  };
  return [closed, toggle];
}

export type CreateItem = { group: string; label: string; run: () => void };
/** A workspace this person is in (133_signup.sql). */
export type WorkspaceChoice = { id: string; name: string; role: string };

export type SidebarProps = {
  route: Route;
  id: string;
  navigate: (r: Route, id?: string, query?: string) => void;
  counts: Partial<Record<string, number>>;
  /** A small amber dot when an item needs a step (a rep with no calendar, routing not live). */
  dots?: Partial<Record<string, boolean>>;
  wsName: string;
  /** Every workspace this person is in; more than one shows a switcher on the name. */
  workspaces?: WorkspaceChoice[];
  wsId?: string;
  onPickWorkspace?: (id: string) => void;
  email: string;
  theme: "light" | "dark";
  onTheme: () => void;
  onSignOut: () => void;
  onSearch: () => void;
  /** Load a section's code ahead, when its item is hovered. */
  onPreload?: (r: Route) => void;
  create: CreateItem[];
  start?: React.ReactNode;
  /** Shown under an item when the sidebar is wide: the form folders under Forms. */
  under?: Partial<Record<string, React.ReactNode>>;
};

export function Sidebar(p: SidebarProps) {
  const active = activeItem(p.route as NavRoute, p.id);
  const [rail, toggleRail] = useRail();
  const [closed, toggleSection] = useSections();
  // Wide-screen classes apply only when the sidebar isn't folded to icons.
  const xl = (c: string) => (rail ? "" : c);

  return (
    <aside className={`flex shrink-0 flex-col gap-2.5 p-3 transition-[width] duration-200 md:h-full md:w-[68px] md:py-4 ${xl("xl:w-60")}`}>
      {/* The mark and the name, never cut; the workspace on its own line, in full. Folded to icons: the mark alone. */}
      <div className={`flex flex-col gap-1 px-2 md:items-center ${xl("xl:items-stretch")}`}>
        <Logo nameClass={`md:hidden ${xl("xl:inline")}`} />
        {p.wsName && (p.workspaces?.length ?? 0) > 1 && p.onPickWorkspace ? (
          <WorkspaceSwitch name={p.wsName} current={p.wsId ?? ""} workspaces={p.workspaces!} onPick={p.onPickWorkspace} className={`md:hidden ${xl("xl:flex")}`} />
        ) : p.wsName ? (
          <span className={`text-[12px] leading-snug text-faint [overflow-wrap:anywhere] md:hidden ${xl("xl:block")}`}>{p.wsName}</span>
        ) : null}
      </div>
      <CreateButton items={p.create} rail={rail} />
      <button
        type="button"
        onClick={p.onSearch}
        aria-label="Search"
        className={`hidden h-8 items-center gap-2 rounded-md bg-card px-2.5 text-[13px] text-muted shadow-chip transition-[color,box-shadow] duration-[150ms] hover:text-ink hover:shadow-pill md:flex md:justify-center ${xl("xl:justify-start")}`}
      >
        <Search size={14} />
        <span className={`flex-1 text-left md:hidden ${xl("xl:inline")}`}>Search</span>
        <kbd className={`text-[12px] text-faint md:hidden ${xl("xl:inline")}`}>⌘K</kbd>
      </button>
      <nav aria-label="Main" className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mt-3 md:min-h-0 md:flex-1 md:flex-col md:gap-0.5 md:overflow-y-auto md:overflow-x-hidden">
        {NAV.filter((n) => !n.section || NAV.find((m) => m.section === n.section) === n).map((n) => {
          // Forms and Settings are single items; Meetings and Emails open and fold like Forms' folders.
          const items = n.section ? NAV.filter((m) => m.section === n.section) : [n];
          const link = (m: NavItem) => <NavLink key={m.key} n={m} on={active?.key === m.key} count={p.counts[m.key]} dot={!!p.dots?.[m.key]} navigate={p.navigate} preload={p.onPreload} rail={rail} />;
          if (!n.section)
            return (
              // Settings sits at the bottom of the sidebar on wider screens; on phones it stays in the row.
              <span key={n.key} className={n.group === "settings" ? "contents md:hidden" : "contents"}>
                {link(n)}
                {p.under?.[n.key] && !rail ? <span className="hidden xl:contents">{p.under[n.key]}</span> : null}
              </span>
            );
          const sec = n.section;
          const shut = !rail && closed[sec];
          const inside = items.some((m) => m.key === active?.key);
          return (
            <span key={sec} className="contents">
              <span className="hidden md:contents">
                {rail ? (
                  <span aria-hidden="true" className="mx-2 my-2 h-px shrink-0 bg-line" />
                ) : (
                  <>
                    <span aria-hidden="true" className="mx-2 my-2 h-px shrink-0 bg-line xl:hidden" />
                    <button
                      type="button"
                      aria-expanded={!shut}
                      onClick={() => toggleSection(sec)}
                      className="hidden h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-[13.5px] text-body transition-[background-color,color] duration-[150ms] hover:bg-hover hover:text-ink xl:flex"
                    >
                      <span aria-hidden="true" className={`flex size-5 shrink-0 items-center justify-center ${shut && inside ? "text-signal" : "text-muted"}`}>
                        {sec === "meetings" ? <CalendarIcon size={14} /> : <Mail size={14} />}
                      </span>
                      <span className="whitespace-nowrap">{SECTION_LABEL[sec]}</span>
                      <span aria-hidden="true" className={`ml-auto text-faint transition-transform duration-[150ms] ${shut ? "-rotate-90" : ""}`}>
                        <ChevronDown size={13} />
                      </span>
                    </button>
                  </>
                )}
              </span>
              <span className={rail ? "contents" : `contents xl:ml-[18px] xl:flex xl:flex-col xl:gap-[1px] xl:border-l xl:border-line xl:pl-[6px] ${shut ? "xl:hidden" : ""}`}>{items.map(link)}</span>
            </span>
          );
        })}
      </nav>
      {p.start}
      <div className="hidden flex-col gap-0.5 md:flex">
        {NAV.filter((n) => n.group === "settings").map((n) => (
          <NavLink key={n.key} n={n} on={active?.key === n.key} count={p.counts[n.key]} dot={!!p.dots?.[n.key]} navigate={p.navigate} preload={p.onPreload} rail={rail} />
        ))}
      </div>
      <div className={`hidden items-center gap-1 px-1 pt-1 md:flex md:flex-col ${xl("xl:flex-row")}`}>
        {/* The account as its avatar, the email on hover: nothing cut short. */}
        <span title={p.email} aria-label={p.email} role="img" className="inline-flex">
          <Avatar label={p.email} size={28} />
        </span>
        <span className={`flex-1 md:hidden ${xl("xl:block")}`} />
        <button type="button" aria-label={p.theme === "dark" ? "Light mode" : "Dark mode"} title={p.theme === "dark" ? "Light mode" : "Dark mode"} onClick={p.onTheme} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
          {p.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        <button type="button" aria-label="Sign out" title="Sign out" onClick={p.onSignOut} className="press rounded-full p-2 text-muted hover:bg-hover hover:text-ink">
          <LogOut size={15} />
        </button>
        <button type="button" aria-label={rail ? "Expand the sidebar" : "Collapse the sidebar"} title={rail ? "Expand the sidebar" : "Collapse the sidebar"} aria-expanded={!rail} onClick={toggleRail} className="press hidden rounded-full p-2 text-muted hover:bg-hover hover:text-ink xl:block">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={rail ? "m13 10 2 2-2 2" : "m16 10-2 2 2 2"} />
          </svg>
        </button>
      </div>
    </aside>
  );
}

function NavLink({ n, on, count, dot, navigate, icon, preload, rail }: { n: NavItem; on: boolean; count?: number; dot?: boolean; navigate: SidebarProps["navigate"]; icon?: React.ReactNode; preload?: SidebarProps["onPreload"]; rail?: boolean }) {
  const glyph = icon ?? NAV_ICONS[n.key] ?? NAV_ICONS[n.route];
  const xl = (c: string) => (rail ? "" : c);
  return (
    <a
      href={`/${n.route}${n.page ? `/${n.page}` : ""}`}
      onClick={(e) => {
        e.preventDefault();
        navigate(n.route as Route, n.page);
      }}
      onPointerEnter={preload ? () => preload(n.route as Route) : undefined}
      onFocus={preload ? () => preload(n.route as Route) : undefined}
      aria-current={on ? "page" : undefined}
      title={n.label}
      className={`flex h-8 shrink-0 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-[background-color,color,box-shadow] duration-[150ms] md:justify-center ${xl("xl:justify-start")} ${on ? "bg-card font-medium text-ink shadow-chip" : "text-body hover:bg-hover hover:text-ink"}`}
    >
      <span aria-hidden="true" className={`relative flex size-5 shrink-0 items-center justify-center ${on ? "text-signal" : "text-muted"}`}>
        {glyph}
        {dot ? <span className={`absolute -top-0.5 -right-0.5 hidden size-1.5 rounded-full bg-butter md:block ${xl("xl:hidden")}`} /> : null}
      </span>
      <span className={`whitespace-nowrap md:hidden ${xl("xl:inline")}`}>{n.label}</span>
      {dot ? <span role="img" aria-label="Needs a step" title="Needs a step" className={`ml-auto size-1.5 shrink-0 rounded-full bg-butter md:hidden ${xl("xl:block")}`} /> : null}
      {count ? (
        <span className={`${dot ? "ml-1.5" : "ml-auto"} px-1 text-[12px] font-normal tabular-nums text-muted md:hidden ${xl("xl:inline")}`}>{count > 99 ? "99+" : count}</span>
      ) : null}
    </a>
  );
}

/** "+ Create": one menu for everything you can make, grouped like the sidebar. */
function CreateButton({ items, rail }: { items: CreateItem[]; rail?: boolean }) {
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
        className="press flex h-8 items-center justify-center gap-1.5 rounded-full bg-brand px-3.5 text-[13px] font-medium text-on-brand shadow-primary transition-colors duration-[150ms] hover:bg-brand-hover"
      >
        <Plus size={14} />
        <span className={rail ? "md:hidden" : "md:hidden xl:inline"}>Create</span>
        <ChevronDown size={12} className={rail ? "md:hidden" : "md:hidden xl:inline"} />
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

/** The workspace name as a button: the workspaces this person is in, the open one ticked. */
function WorkspaceSwitch({ name, current, workspaces, onPick, className }: { name: string; current: string; workspaces: WorkspaceChoice[]; onPick: (id: string) => void; className: string }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={(e) => setAnchor(anchor ? null : e.currentTarget)}
        className={`-mx-1 items-start gap-1 rounded-md px-1 py-0.5 text-left text-[12px] leading-snug text-faint hover:bg-hover hover:text-ink ${className}`}
      >
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{name}</span>
        <ChevronDown size={12} className="mt-0.5 shrink-0" />
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={() => setAnchor(null)} width={240}>
          <div role="menu" aria-label="Workspaces" className="flex max-h-[60vh] flex-col overflow-y-auto py-1">
            {workspaces.map((w) => (
              <button
                key={w.id}
                type="button"
                role="menuitemradio"
                aria-checked={w.id === current}
                onClick={() => {
                  setAnchor(null);
                  if (w.id !== current) onPick(w.id);
                }}
                className="mx-1 flex min-h-8 items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] text-ink hover:bg-hover focus-visible:bg-hover focus-visible:outline-none"
              >
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{w.name}</span>
                {w.id === current ? <Check size={13} className="mt-0.5 shrink-0 text-signal" /> : null}
              </button>
            ))}
          </div>
        </Popover>
      ) : null}
    </>
  );
}
