"use client";

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
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
};

// A page with unsaved changes can ask before anyone leaves it, from the sidebar or the back button.
let leaveGuard: (() => Promise<boolean>) | null = null;
export const setLeaveGuard = (fn: (() => Promise<boolean>) | null) => {
  leaveGuard = fn;
};
export const mayLeave = () => (leaveGuard ? leaveGuard() : Promise.resolve(true));

/** Tell every loaded page that data changed, so lists reload. */
export const announceChange = () => window.dispatchEvent(new Event("claritia:changed"));

/** Load data once, and again when `reload` is called or `key` changes. */
export function useLoad<T>(fn: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const latest = useRef(fn);
  useEffect(() => {
    latest.current = fn;
  });
  useEffect(() => {
    let live = true;
    latest
      .current()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    window.addEventListener("claritia:changed", reload);
    return () => window.removeEventListener("claritia:changed", reload);
  }, [reload]);
  return { data, error, reload };
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
  actions,
  back,
  flush = false,
  onRename,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
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

/** Tabs under a page header, with an ink underline that slides to the open one. */
export function Tabs<T extends string>({ value, tabs, onChange, bare = false }: { value: T; tabs: { value: T; label: string; count?: number; icon?: React.ReactNode }[]; onChange: (v: T) => void; bare?: boolean }) {
  const { box, at } = useSlide(
    tabs.findIndex((t) => t.value === value),
    [tabs.map((t) => `${t.label}${t.count ?? ""}`).join()],
  );
  return (
    <div ref={box} role="tablist" className={`relative flex h-10 shrink-0 items-end gap-2 overflow-x-auto ${bare ? "-mb-px" : "border-b border-line px-3"}`}>
      {tabs.map((t) => (
        <button
          key={t.value}
          data-slide=""
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`relative flex h-10 shrink-0 items-center gap-1.5 px-2 text-[13px] whitespace-nowrap transition-colors duration-[120ms] ${value === t.value ? "font-medium text-ink" : "text-muted hover:text-ink"}`}
        >
          {t.icon ? <span className="flex shrink-0 items-center [&_svg]:size-3.5">{t.icon}</span> : null}
          {t.label}
          {t.count != null ? <span className={`text-[12px] tabular-nums ${value === t.value ? "font-medium text-ink" : "text-faint"}`}>{t.count}</span> : null}
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
