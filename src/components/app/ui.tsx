"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { cache, type Snap } from "@/lib/queryCache";
import { Dots } from "./Ai";

import type { Route } from "@/lib/nav";
export type { Route };
export type Workspace = { id: string; name: string; features: string[] };
export type Project = { id: string; name: string; workspace_id: string; created_at: string };
export type Environment = { id: string; project_id: string; name: string; base_url: string; created_at: string };
export type Secret = { id: string; environment_id: string; name: string; updated_at: string };
export type Role = "owner" | "member";

export type ViewProps = {
  sb: SupabaseClient;
  session: Session;
  ws: Workspace;
  role: Role;
  /** Open a screen; `query` (like "tab=design") goes in the address after the record. */
  navigate: (r: Route, id?: string, query?: string) => void;
  /** The record in the address, like a contact's id in /contacts/<id>. */
  id: string;
  /** Change the workspace on screen (a rename shows everywhere without reloading the page). */
  onWorkspace?: (patch: Partial<Workspace>) => void;
};

// A page with unsaved changes can ask before anyone leaves it, from the sidebar or the back button.
let leaveGuard: (() => Promise<boolean>) | null = null;
export const setLeaveGuard = (fn: (() => Promise<boolean>) | null) => {
  leaveGuard = fn;
};
export const mayLeave = () => (leaveGuard ? leaveGuard() : Promise.resolve(true));

/** The app's shared cache (src/lib/queryCache.ts): screens paint from it at once and fetch again in the background. */
export { cache };
export const invalidate = (name: string | ((key: string) => boolean)) => void cache.invalidate(name);

export type Query<T> = {
  data: T | null;
  error: string;
  /** True once this key has an answer (data, or null, or an error); false while it first loads. */
  loaded: boolean;
  /** True while a fetch is out (the data on screen may be the last answer). */
  fetching: boolean;
  /** Fetch again now. */
  reload: () => void;
  /** Change the data in place (a row that came back from a write). */
  set: (next: T | ((prev: T) => T)) => void;
  /** Change the data at once, send the write, and put it back (and throw) when the write fails. */
  mutate: <R>(change: (prev: T) => T, write: () => Promise<R>, opts?: { refetch?: boolean }) => Promise<R>;
};

const noop = () => {};
const EMPTY_SNAP: Snap<never> = { data: undefined, error: "", at: 0, fetching: false };

/**
 * Read a key from the shared cache. Keys name what they hold, like `meeting_types:<workspace>`, so every screen that
 * asks for the same key shares one answer; `invalidate("meeting_types")` fetches it again wherever it's shown. The last
 * answer paints at once (a tab switch or the back button shows the page with no wait) and is fetched again when older
 * than `staleMs`. While a new key loads, the previous key's data stays on screen. A `null` key loads nothing.
 */
export function useQuery<T>(key: string | null, fn: () => Promise<T>, opts: { staleMs?: number } = {}): Query<T> {
  const staleMs = opts.staleMs ?? 15_000;
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  const subscribe = useCallback((cb: () => void) => (key ? cache.subscribe(key, cb) : noop), [key]);
  const read = useCallback((): Snap<T> => (key ? cache.get<T>(key) : EMPTY_SNAP), [key]);
  const snap = useSyncExternalStore(subscribe, read, read);
  useEffect(() => {
    if (!key) return;
    const run = () => latest.current();
    cache.register(key, run);
    if (cache.isStale(key, staleMs)) cache.fetch(key, run).catch(noop);
  }, [key, staleMs]);
  // While a new key loads, keep showing the last data (search, paging, the next record).
  const [last, setLast] = useState<{ data: T } | null>(null);
  if (snap.data !== undefined && last?.data !== snap.data) setLast({ data: snap.data });
  const data = snap.data !== undefined ? snap.data : snap.at || !key ? null : (last?.data ?? null);
  const reload = useCallback(() => {
    if (key) cache.fetch(key, () => latest.current(), true).catch(noop);
  }, [key]);
  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (key) cache.set<T>(key, next as T | ((prev: T | undefined) => T));
    },
    [key],
  );
  const mutate = useCallback(
    <R,>(change: (prev: T) => T, write: () => Promise<R>, o?: { refetch?: boolean }) => (key ? cache.mutate<T, R>(key, (p) => change(p as T), write, o) : write()),
    [key],
  );
  return { data, error: snap.error, fetching: snap.fetching, loaded: snap.at > 0, reload, set, mutate };
}

/** A key's data from the cache when fresh, else one shared fetch: for loaders that build on shared data. */
export function cached<T>(key: string, fn: () => Promise<T>, staleMs = 30_000): Promise<T> {
  if (!cache.isStale(key, staleMs)) return Promise.resolve(cache.get<T>(key).data as T);
  return cache.fetch(key, fn);
}

/** Load data for this screen only, again when `key` changes or `reload` is called. Shared data uses `useQuery`. */
export function useLoad<T>(fn: () => Promise<T>, key: string) {
  const id = useId();
  return useQuery<T>(`local:${id}:${key}`, fn, { staleMs: Infinity });
}

// A screen's own state (search, page, selection, scroll) kept while you open a record and come back.
const kept = new Map<string, unknown>();

/** `useState` that outlives the screen: list → record → back finds the same search, page and selection. */
export function useKept<T>(key: string, initial: T | (() => T)) {
  const [v, setV] = useState<T>(() => (kept.has(key) ? (kept.get(key) as T) : typeof initial === "function" ? (initial as () => T)() : initial));
  const set = useCallback(
    (next: T | ((prev: T) => T)) =>
      setV((prev) => {
        const n = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        kept.set(key, n);
        return n;
      }),
    [key],
  );
  return [v, set] as const;
}

/** A scroll box that comes back where you left it: put the returned ref on the element that scrolls. */
export function useKeptScroll(key: string) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const top = kept.get(`scroll:${key}`) as number | undefined;
      if (top) requestAnimationFrame(() => (el.scrollTop = top));
      el.addEventListener("scroll", () => kept.set(`scroll:${key}`, el.scrollTop), { passive: true });
    },
    [key],
  );
}

/**
 * Call `fn` every `every` ms while `active` and the tab is visible; each call waits `backoff` times longer (up to
 * `max`), and polling stops after `stopAfter` ms. A tab coming back into view calls it once at once.
 */
export function usePoll(fn: () => void, active: boolean, { every = 10_000, backoff = 1, max = 60_000, stopAfter = Infinity }: { every?: number; backoff?: number; max?: number; stopAfter?: number } = {}) {
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    let wait = every;
    let t: ReturnType<typeof setTimeout> | null = null;
    const next = () => {
      if (Date.now() - started > stopAfter) return;
      t = setTimeout(() => {
        if (document.visibilityState === "visible") latest.current();
        wait = Math.min(max, wait * backoff);
        next();
      }, wait);
    };
    next();
    const vis = () => {
      if (document.visibilityState === "visible" && Date.now() - started <= stopAfter) latest.current();
    };
    document.addEventListener("visibilitychange", vis);
    return () => {
      if (t) clearTimeout(t);
      document.removeEventListener("visibilitychange", vis);
    };
  }, [active, every, backoff, max, stopAfter]);
}

/** The value, settled for `ms` (search boxes ask the server once you stop typing). */
export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Draw only the rows in view of a long list (over `min` rows). Put `box` (a ref callback) on the list's box, `data-row` on each row,
 * render rows `start` to `end`, and a spacer of `before` px above and `after` px below. Rows are measured as they draw.
 */
export function useWindowed(count: number, { estimate = 44, overscan = 12, min = 200 }: { estimate?: number; overscan?: number; min?: number } = {}) {
  const [el, box] = useState<HTMLElement | null>(null);
  const on = count > min;
  const [range, setRange] = useState({ start: 0, end: 60, h: estimate });
  useLayoutEffect(() => {
    if (!on || !el) return;
    const scroller = scrollParent(el);
    const update = () => {
      const h = el.querySelector<HTMLElement>("[data-row]")?.getBoundingClientRect().height || estimate;
      const viewTop = scroller ? scroller.getBoundingClientRect().top : 0;
      const viewH = scroller ? scroller.clientHeight : window.innerHeight;
      const startPx = Math.max(0, viewTop - el.getBoundingClientRect().top);
      const start = Math.max(0, Math.floor(startPx / h) - overscan);
      const end = Math.min(count, Math.ceil((startPx + viewH) / h) + overscan);
      setRange((r) => (r.start === start && r.end === end && r.h === h ? r : { start, end, h }));
    };
    update();
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      target.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [el, on, count, overscan, estimate]);
  if (!on) return { box, start: 0, end: count, before: 0, after: 0 };
  const start = Math.min(range.start, count);
  const end = Math.min(Math.max(range.end, start), count);
  return { box, start, end, before: start * range.h, after: (count - end) * range.h };
}

/** Patch one row (by id) in every cached list under `name`, like a contact's status wherever it's listed. */
export function patchRows<R extends { id: string }>(name: string, id: string, patch: Partial<R> | ((r: R) => R)) {
  for (const k of cache.keys(name)) {
    const rows = cache.get<unknown>(k).data;
    if (Array.isArray(rows) && rows.some((r: R) => r?.id === id))
      cache.set(
        k,
        rows.map((r: R) => (r?.id === id ? (typeof patch === "function" ? patch(r) : { ...r, ...patch }) : r)),
      );
  }
}

/** POST to one of our API routes as the signed-in user. */
export async function postJson<T = Record<string, unknown>>(session: Session, path: string, body: object): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data as T;
}

/** Throw a Supabase error so callers can show it. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function timeAgo(iso: string | null) {
  if (!iso) return "—";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** A page in the app: a crumb and a title, then the content. `onRename` makes the title an input you can type in. */
/** A section with tabs (Routing, Scheduling, Visitors...): every page inside it shows the section's title and tabs. */
/** `banner` is one slim line across the top of the work area, under the tabs (Calendar's Connect your calendar). */
export type SectionNav = { title: string; tabs: { value: string; label: string; icon?: React.ReactNode }[]; current: string; onPick: (v: string) => void; banner?: React.ReactNode };
const SectionCtx = createContext<SectionNav | null>(null);
export function Section({ nav, children }: { nav: SectionNav; children: React.ReactNode }) {
  return <SectionCtx.Provider value={nav}>{children}</SectionCtx.Provider>;
}

// A page shown inside another page (Calendar › Settings shows Reminders and Webhooks on its right): no title or
// tabs of its own, only its actions and its body.
const InsetCtx = createContext(false);
export function Inset({ children }: { children: React.ReactNode }) {
  return <InsetCtx.Provider value>{children}</InsetCtx.Provider>;
}

/**
 * Every screen's frame (docs/unify-plan.md 2.1): the title (or a back crumb and the record's name), one row of
 * actions on the right, the section's tabs under it, then the body. Inside a `Section`, pages show its title and tabs;
 * a page with `back` is a record or an editor and shows its own title instead.
 */
export function Page({
  icon,
  title,
  count,
  badge,
  actions,
  back,
  flush = false,
  onRename,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  /** A state beside the title (Routing's Draft or Live). */
  badge?: React.ReactNode;
  onRename?: (name: string) => void;
  count?: number | string;
  actions?: React.ReactNode;
  back?: { label: string; onClick: () => void };
  flush?: boolean;
  children: React.ReactNode;
}) {
  const section = useContext(SectionCtx);
  const inset = useContext(InsetCtx);
  const tabs = section && !back ? section : null;
  const heading = tabs ? tabs.title : title;
  if (inset)
    return (
      <div className="flex h-full min-h-0 flex-col">
        {actions ? (
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4 md:px-6">
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{title}</h2>
            {actions}
          </div>
        ) : null}
        <div className={`min-h-0 flex-1 overflow-auto ${flush ? "" : "p-4 md:p-6"}`}>{children}</div>
      </div>
    );
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-3">
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
          {back ? (
            <span className="contents">
              <button type="button" onClick={back.onClick} className="min-w-0 truncate rounded-sm px-1 py-0.5 text-[13px] text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-ink">
                {back.label}
              </button>
              <span className="text-faint">/</span>
            </span>
          ) : null}
          <span className="flex min-w-0 items-center gap-1.5 px-1">
            {icon ? <span className="flex shrink-0 items-center text-muted [&_svg]:size-4">{icon}</span> : null}
            {onRename ? (
              <TitleInput value={heading} onChange={onRename} />
            ) : (
              <h1 aria-current="page" className="truncate text-[13px] leading-normal font-medium text-ink">
                {heading}
              </h1>
            )}
            {count != null ? <span className="text-[13px] text-faint tabular-nums">{count}</span> : null}
            {badge ? <span className="ml-1 flex shrink-0 items-center">{badge}</span> : null}
          </span>
        </nav>
        {actions ? <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div> : null}
      </header>
      {tabs ? <Tabs value={tabs.current} tabs={tabs.tabs} onChange={tabs.onPick} /> : null}
      {tabs?.banner ?? null}
      <div className={`min-h-0 flex-1 overflow-auto ${flush ? "" : "p-4 md:p-6"}`}>{children}</div>
    </div>
  );
}

/** A page title you can click and type in. Enter or clicking away saves; Escape puts the old name back. */
function TitleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    setText(value);
  }
  const done = () => {
    const t = text.trim();
    if (t && t !== value) onChange(t);
    else setText(value);
  };
  return (
    <input
      aria-label="Name"
      value={text}
      maxLength={120}
      onChange={(e) => setText(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setText(value);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      style={{ width: `${Math.max(6, text.length + 1)}ch` }}
      className="h-7 max-w-[60vw] min-w-0 rounded-sm border border-transparent bg-transparent px-1 text-[13px] font-medium text-ink outline-none hover:bg-hover focus:border-ink focus:bg-card"
    />
  );
}

/** A flat card on a hairline. `frame` gives the one frame a screen is about its shadow. */
export function Panel({ children, className = "", frame = false }: { children: React.ReactNode; className?: string; frame?: boolean }) {
  return <div className={`rounded-lg border border-line bg-card ${frame ? "frame" : ""} ${className}`}>{children}</div>;
}

/** A card's header bar: a label, with room for actions on the right. */
export function CardHead({ label, count, children }: { label: string; count?: number | string; children?: React.ReactNode }) {
  return (
    <div className="flex h-12 items-center gap-2 border-b border-line px-5">
      <h2 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{label}</h2>
      {count != null ? <span className="text-[12px] text-muted tabular-nums">{count}</span> : null}
      {children ? <div className="ml-auto flex items-center gap-1.5">{children}</div> : null}
    </div>
  );
}

/** An empty list: a sketch or an icon, one line, and what to do. */
export function Empty({ icon, sketch, title, children }: { icon?: React.ReactNode; sketch?: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <div className="anim-rise-sm flex flex-col items-center gap-2 px-6 py-16 text-center">
      {sketch || icon ? <div className="mb-3">{sketch ?? <span className="flex size-12 items-center justify-center rounded-lg border border-line bg-card text-ink">{icon}</span>}</div> : null}
      <p className="font-semibold tracking-[-0.02em] text-[18px] text-ink">{title}</p>
      {children ? <div className="max-w-sm text-[13.5px] text-muted">{children}</div> : null}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return message ? (
    <p role="alert" className="rounded-lg bg-rose-wash px-3.5 py-2.5 text-[13px] text-rose">
      {message}
    </p>
  ) : null;
}

/** Loading: dots over soft rows that shimmer. */
export function Loading() {
  return (
    <div className="space-y-2.5 p-5" aria-label="Loading">
      <Dots className="mb-1 ml-1" />
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="anim-shimmer h-10 rounded-md bg-paper-deep" style={{ opacity: 1 - i * 0.16, animationDelay: `${i * 0.1}s` }} />
      ))}
    </div>
  );
}

export function Button({ variant = "primary", size = "md", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "plain" | "danger"; size?: "sm" | "md" }) {
  const look =
    variant === "primary"
      ? "bg-ink text-paper hover:bg-brand-hover"
      : variant === "ghost"
        ? "border border-line-strong bg-card text-ink hover:bg-hover"
        : variant === "danger"
          ? "border border-line-strong bg-card text-rose hover:bg-rose-wash"
          : "text-body hover:bg-hover hover:text-ink";
  return (
    <button
      {...props}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-[background-color,border-color,transform] duration-[120ms] disabled:pointer-events-none disabled:opacity-45 ${size === "sm" ? "h-8 px-3.5 text-[12.5px]" : "h-9 px-4 text-[13.5px]"} ${look} ${className}`}
    />
  );
}

/** A round icon button with a tooltip. */
export function IconButton({ label, className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} {...props} className={`press inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink disabled:opacity-45 ${className}`} />;
}

export function Input({ className = "", ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`h-10 w-full rounded-sm border border-line-strong bg-card px-3 text-[13.5px] text-ink outline-none transition-shadow duration-[140ms] placeholder:text-faint focus:border-ink focus:ring-[3px] focus:ring-hover ${className}`}
    />
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-body">{label}</span>
      {children}
    </label>
  );
}

/** An on/off switch: a pill with a thumb that springs across. */
export function Toggle({ on, onChange, label, disabled = false }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-[320ms] disabled:opacity-45 ${on ? "bg-ink" : "bg-line-strong"}`}
    >
      <span className={`absolute left-0.5 size-4 rounded-full bg-paper transition-transform duration-[320ms] ease-spring ${on ? "translate-x-4" : ""}`} />
    </button>
  );
}

/** A big number with a label under it. */
export function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-medium text-[30px] leading-none tracking-[-0.04em] text-ink tabular-nums">{value}</span>
      <span className="label-mono">{label}</span>
    </div>
  );
}

export type Tone = "gray" | "brand" | "violet" | "green" | "amber" | "red" | "sky";
const TONES: Record<Tone, { tag: string; dot: string }> = {
  gray: { tag: "bg-paper-deep text-body", dot: "bg-muted" },
  brand: { tag: "bg-clay-wash text-clay", dot: "bg-clay" },
  violet: { tag: "bg-lilac-wash text-lilac", dot: "bg-lilac" },
  green: { tag: "bg-sage-wash text-sage", dot: "bg-sage" },
  amber: { tag: "bg-butter-wash text-butter", dot: "bg-butter" },
  red: { tag: "bg-rose-wash text-rose", dot: "bg-rose" },
  sky: { tag: "bg-sky-wash text-sky", dot: "bg-sky" },
};

/** A record's state: a pill tag, wash fill and deep text, with an optional dot. */
export function Badge({ children, tone = "gray", dot = false }: { children: React.ReactNode; tone?: Tone; dot?: boolean }) {
  return (
    <span className={`inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap ${TONES[tone].tag}`}>
      {dot ? <span className={`size-1.5 rounded-full ${TONES[tone].dot}`} /> : null}
      {children}
    </span>
  );
}

// Avatars are plain gray with dark initials, like Omniscient. Color is kept for status.
const AVATAR = ["bg-paper-deep text-body"];

/** A round avatar with initials, for people. */
export function Avatar({ label, size = 24 }: { label: string; size?: number }) {
  const initials =
    label
      .replace(/@.*/, "")
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  let h = 0;
  for (const c of label) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-card ${AVATAR[h % AVATAR.length]}`} style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }}>
      {initials}
    </span>
  );
}

export function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`sticky top-0 z-[1] h-10 border-r border-b border-r-line-light border-b-line bg-card px-3 text-left text-[12px] font-medium whitespace-nowrap text-faint last:border-r-0 ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`h-10 border-r border-b border-line-light px-3 text-[13px] whitespace-nowrap last:border-r-0 ${className}`}>{children}</td>;
}

/** The host of a URL, for showing it short. */
export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Accepts "staging.acme.com" or a full URL, and returns a clean https URL or null. */
export function cleanUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    if (!u.hostname.includes(".") && u.hostname !== "localhost") return null;
    return u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

/** Where the picked child sits, so a thumb or underline can slide to it. */
function useSlide(index: number, deps: unknown[]) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelectorAll<HTMLElement>("[data-slide]")[index];
    setAt(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, ...deps]);
  return { box, at };
}

/** A row of choices where one is picked: a pill track with a sliding pill thumb. */
export function Segmented<T extends string>({ value, options, onChange, label, size = "md" }: { value: T; options: { value: T; label: string; disabled?: boolean }[]; onChange: (v: T) => void; label?: string; size?: "sm" | "md" }) {
  const { box, at } = useSlide(
    options.findIndex((o) => o.value === value),
    [options.map((o) => o.label).join(), size],
  );
  const sm = size === "sm";
  return (
    <div ref={box} role="radiogroup" aria-label={label} className={`relative inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-full bg-paper-deep ${sm ? "h-8 p-[3px]" : "h-9 p-1"}`}>
      {at ? <span aria-hidden="true" className={`absolute rounded-full bg-ink transition-[transform,width] duration-[320ms] ease-out ${sm ? "top-[3px] bottom-[3px]" : "top-1 bottom-1"}`} style={{ left: 0, width: at.width, transform: `translateX(${at.left}px)` }} /> : null}
      {options.map((o) => (
        <button
          key={o.value}
          data-slide=""
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={`relative inline-flex items-center rounded-full px-3 text-[12.5px] font-medium whitespace-nowrap transition-colors duration-[320ms] disabled:cursor-default disabled:opacity-45 ${sm ? "h-[26px]" : "h-7"} ${value === o.value ? "text-paper" : "text-muted hover:text-ink"} ${at ? "" : value === o.value ? "bg-ink" : ""}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Tabs under a page header, with an ink underline that slides to the open one. `dense` is the 38 px row a record's
 * own tabs use (a form's Build, Submissions...); a tab's `dot` is an amber point when something there needs a look.
 */
export function Tabs<T extends string>({
  value,
  tabs,
  onChange,
  bare = false,
  dense = false,
}: {
  value: T;
  tabs: { value: T; label: string; count?: number; icon?: React.ReactNode; dot?: string }[];
  onChange: (v: T) => void;
  bare?: boolean;
  dense?: boolean;
}) {
  const { box, at } = useSlide(
    tabs.findIndex((t) => t.value === value),
    [tabs.map((t) => `${t.label}${t.count ?? ""}${t.dot ?? ""}`).join()],
  );
  return (
    <div ref={box} role="tablist" className={`relative flex shrink-0 items-end overflow-x-auto [scrollbar-width:none] ${dense ? "h-[38px] gap-[4px]" : "h-10 gap-2"} ${bare ? "-mb-px" : `border-b border-line ${dense ? "px-[10px]" : "px-3"}`}`}>
      {tabs.map((t) => (
        <button
          key={t.value}
          data-slide=""
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`relative flex shrink-0 items-center text-[13px] whitespace-nowrap transition-colors duration-[120ms] ${dense ? "h-[38px] gap-[7px] px-[8px]" : "h-10 gap-1.5 px-2"} ${value === t.value ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
        >
          {t.icon ? <span className="flex shrink-0 items-center [&_svg]:size-3.5">{t.icon}</span> : null}
          {t.label}
          {t.count != null ? <span className={`tabular-nums ${dense ? "text-[11.5px] font-normal text-faint" : `text-[12px] ${value === t.value ? "font-medium text-ink" : "text-faint"}`}`}>{t.count}</span> : null}
          {t.dot ? <span title={t.dot} aria-label={t.dot} className="size-1.5 rounded-full bg-butter" /> : null}
        </button>
      ))}
      {at ? <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.5 bg-ink transition-[transform,width] duration-[200ms] ease-out" style={{ width: at.width, transform: `translateX(${at.left}px)` }} /> : null}
    </div>
  );
}

/** Priority as three small bars, filled up to the level. */
export function PriorityBars({ value }: { value: "low" | "medium" | "high" }) {
  const level = value === "high" ? 3 : value === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
      <span aria-hidden="true" className="inline-flex h-2.5 items-end gap-px">
        {[4, 7, 10].map((h, i) => (
          <span key={h} className={`w-[3px] rounded-full ${i < level ? "bg-ink" : "bg-line-strong"}`} style={{ height: h }} />
        ))}
      </span>
      {value[0]!.toUpperCase() + value.slice(1)}
    </span>
  );
}

export type RunStatus = "queued" | "running" | "passed" | "failed" | "error" | "canceled";
export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
const RUN_TONE: Record<RunStatus | StepStatus, Tone> = { queued: "gray", pending: "gray", running: "brand", passed: "green", failed: "red", error: "amber", canceled: "gray", skipped: "gray" };
const RUN_LABEL: Record<RunStatus | StepStatus, string> = { queued: "Waiting", pending: "Waiting", running: "Running", passed: "Passed", failed: "Failed", error: "Error", canceled: "Canceled", skipped: "Skipped" };

/** A run's or a step's state as a tag. */
export function StatusTag({ status }: { status: RunStatus | StepStatus }) {
  return <Badge tone={RUN_TONE[status] ?? "gray"}>{RUN_LABEL[status] ?? status}</Badge>;
}

/** 1.2s, 45s, 2m 05s */
export function duration(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  return `${m}m ${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
}

export type Verdict = "app_bug" | "flaky" | "setup";
const VERDICT: Record<Verdict, { label: string; tone: Tone }> = {
  app_bug: { label: "App bug", tone: "red" },
  flaky: { label: "Flaky", tone: "amber" },
  setup: { label: "Setup", tone: "gray" },
};

/** The Judge's call on a failed run. */
export function VerdictTag({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict || !VERDICT[verdict]) return null;
  return <Badge tone={VERDICT[verdict].tone}>{VERDICT[verdict].label}</Badge>;
}
