"use client";

// The small parts every Forms screen is drawn with, the same sizes as Calendar's: pill buttons, the gray pill switch
// (Seg), the field picker (Dd, in its own layer so no panel cuts it off), cards with rows, a dialog, notes in a box,
// and the one-line note at the bottom of the screen.

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ic } from "./ic";

// Class strings ------------------------------------------------------------------------------------------------------

/** The one primary action: a black pill. */
export const BTN = "press inline-flex h-[32px] shrink-0 items-center gap-[6px] rounded-full bg-ink px-[14px] text-[13px] font-medium whitespace-nowrap text-card transition-opacity duration-[120ms] disabled:pointer-events-none disabled:opacity-30";
/** A secondary action: a white pill on a hairline. */
export const GHOST = "press inline-flex h-[30px] shrink-0 items-center gap-[6px] rounded-full border border-line bg-card px-[12px] text-[12.5px] whitespace-nowrap text-body transition-colors duration-[120ms] hover:border-line-strong hover:text-ink disabled:pointer-events-none disabled:opacity-45";
export const GHOST_SM = "press inline-flex h-[26px] shrink-0 items-center gap-[6px] rounded-full border border-line bg-card px-[10px] text-[12px] whitespace-nowrap text-body transition-colors duration-[120ms] hover:border-line-strong hover:text-ink disabled:pointer-events-none disabled:opacity-45";
/** A round icon button. */
export const IB = "press inline-flex size-[30px] shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35";
export const IB_SM = "press inline-flex size-[24px] shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-35";
/** A text box: 34 px, 6 px corners. */
export const IN = "h-[34px] w-full min-w-0 rounded-sm border border-line-strong bg-card px-[10px] text-[13px] text-ink outline-none placeholder:text-faint focus:border-ink";
export const IN_SM = "h-[30px] w-full min-w-0 rounded-sm border border-line-strong bg-card px-[10px] text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-ink";
/** A small text box with its own width (set beside it). */
export const IN_FIT = IN_SM.replace("w-full ", "");
export const AREA = "w-full min-w-0 resize-y rounded-sm border border-line-strong bg-card px-[10px] py-[8px] text-[13px] leading-normal text-ink outline-none placeholder:text-faint focus:border-ink";
export const EYEBROW = "font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase";
export const CARD = "rounded-[10px] border border-line bg-card";
/** A row in a card: what it is on the left, the control on the right. */
export const CROW = "flex min-h-[52px] items-center gap-[12px] border-t border-line px-[16px] py-[12px] first:border-t-0 max-[860px]:flex-wrap";
/** A stacked row in a card: a small label over the control. */
export const CSTACK = "flex flex-col gap-[8px] border-t border-line px-[16px] py-[12px] first:border-t-0";
export const LINK = "inline-flex items-center gap-[5px] self-start text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink";

/** A card row's words: a bold line and a gray one under it. */
export function RowText({ title, sub, tone }: { title: React.ReactNode; sub?: React.ReactNode; tone?: "bad" }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col max-[860px]:min-w-[60%]">
      <span className="font-medium text-ink">{title}</span>
      {sub ? <span className={`text-[12px] ${tone === "bad" ? "text-rose" : "text-muted"}`}>{sub}</span> : null}
    </span>
  );
}

// Seg ------------------------------------------------------------------------------------------------------------------

export type SegOption<T extends string> = { value: T; label: React.ReactNode; title?: string; disabled?: boolean };

/** One of a few, as pills in a gray track: the picked one is black. `icons` makes square-ish icon pills. */
export function Seg<T extends string>({ value, options, onChange, label, icons = false }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; label: string; icons?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex max-w-full shrink-0 gap-[2px] overflow-x-auto rounded-full bg-paper-deep p-[3px] [scrollbar-width:none]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.title}
          title={o.title}
          disabled={o.disabled}
          onClick={() => o.value !== value && onChange(o.value)}
          className={`inline-flex h-[26px] items-center gap-[6px] rounded-full text-[12.5px] whitespace-nowrap transition-colors duration-[120ms] disabled:cursor-default disabled:opacity-40 ${icons ? "w-[30px] justify-center" : "px-[12px]"} ${o.value === value ? "bg-ink text-card" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A count inside a Seg pill, at 60%. */
export const SegN = ({ n }: { n: number | string }) => <span className="opacity-60 tabular-nums">{n}</span>;

// Dd: the picker -----------------------------------------------------------------------------------------------------

export type DdItem =
  | { kind: "group"; label: React.ReactNode }
  | { kind: "option"; key: string; label: React.ReactNode; on?: boolean; why?: string | null; onPick: () => void; search?: string; hint?: string }
  | { kind: "add"; key: string; label: React.ReactNode; hint?: string; onPick: () => void };

/**
 * A button that opens a list in its own layer: options with a check on the picked one, groups, options that can't be
 * picked with the reason on the right, a search box and an add row at the bottom.
 */
export function Dd({ label, items, sm = false, search, onSearch, ariaLabel, searchLabel = "Search fields", menuWidth }: { label: React.ReactNode; items: DdItem[]; sm?: boolean; search?: string; onSearch?: (q: string) => void; ariaLabel: string; searchLabel?: string; menuWidth?: number }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; max: number } | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    onSearch?.("");
  }, [onSearch]);
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 12;
      const up = below < 200 && r.top > below;
      const max = Math.min(300, Math.max(140, up ? r.top - 12 : below));
      const width = Math.max(r.width, menuWidth ?? 0);
      setPos({ left: Math.max(8, Math.min(r.left, r.right - width)), width, max, top: up ? r.top - 4 - Math.min(max, menu.current?.scrollHeight ?? max) : r.bottom + 4 });
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, items.length, menuWidth]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menu.current?.contains(t) || btn.current?.contains(t)) return;
      close();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      close();
      btn.current?.focus();
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
    };
  }, [open, close]);
  const q = (search ?? "").trim().toLowerCase();
  const shown = onSearch && q ? items.filter((i) => i.kind !== "option" || String(i.search ?? "").toLowerCase().includes(q)) : items;
  // A group with nothing under it after the search goes too.
  const list = shown.filter((i, n) => i.kind !== "group" || (shown[n + 1] && shown[n + 1]!.kind === "option"));
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : setOpen(true))}
        className={`flex w-full min-w-0 items-center justify-between gap-[8px] rounded-sm border bg-card pr-[8px] pl-[10px] text-left font-normal text-ink transition-colors duration-[120ms] hover:border-ink ${sm ? "h-[30px] text-[12.5px]" : "h-[34px] text-[13px]"} ${open ? "border-ink" : "border-line-strong"}`}
      >
        <span className="inline-flex min-w-0 items-center gap-[7px] truncate">{label}</span>
        <Ic n="chev" className="text-muted" />
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={menu}
              role="listbox"
              aria-label={ariaLabel}
              style={{ position: "fixed", left: pos.left, top: pos.top, width: Math.max(pos.width, 180), maxHeight: pos.max }}
              className="anim-rise-sm z-[100] flex flex-col overflow-y-auto rounded-[10px] border border-line bg-card p-[4px] text-[13px] text-ink shadow-float"
            >
              {onSearch ? <input autoFocus value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder="Search fields" aria-label={searchLabel} className={`${IN_SM} mb-[4px] shrink-0`} /> : null}
              {list.map((i, n) =>
                i.kind === "group" ? (
                  <div key={`g${n}`} className="flex items-center gap-[6px] px-[8px] pt-[8px] pb-[2px] text-[11.5px] text-faint">
                    {i.label}
                  </div>
                ) : i.kind === "add" ? (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => {
                      close();
                      i.onPick();
                    }}
                    className="mt-[4px] flex min-h-[30px] items-center gap-[7px] rounded-b-md border-t border-line px-[8px] pt-[8px] pb-[4px] text-left hover:bg-hover"
                  >
                    <Ic n="plus" />
                    <span className="min-w-0 truncate">{i.label}</span>
                    {i.hint ? <em className="ml-auto text-[11.5px] whitespace-nowrap text-faint not-italic">{i.hint}</em> : null}
                  </button>
                ) : (
                  <button
                    key={i.key}
                    type="button"
                    role="option"
                    aria-selected={!!i.on}
                    disabled={!!i.why}
                    onClick={() => {
                      close();
                      i.onPick();
                    }}
                    className={`flex min-h-[30px] shrink-0 items-center justify-between gap-[8px] rounded-md px-[8px] py-[4px] text-left enabled:hover:bg-hover disabled:cursor-default disabled:text-faint ${i.on ? "font-medium" : ""}`}
                  >
                    <span className="inline-flex min-w-0 items-center gap-[7px] truncate">{i.label}</span>
                    {i.hint ? <span className="ml-auto text-[12px] whitespace-nowrap text-muted">{i.hint}</span> : null}
                    {i.why ? <em className="text-[11.5px] whitespace-nowrap text-faint not-italic">{i.why}</em> : i.on ? <Ic n="check" /> : null}
                  </button>
                ),
              )}
              {!list.some((i) => i.kind === "option") && q ? <p className="px-[8px] py-[8px] text-muted">No matches</p> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

// Boxes, dialogs and notes ------------------------------------------------------------------------------------------

/** A note in a box: amber to look at, red when something's wrong, gray for a plain fact. */
export function Box({ tone, title, children, row = false }: { tone: "warn" | "bad" | "info"; title?: React.ReactNode; children?: React.ReactNode; row?: boolean }) {
  const look = tone === "warn" ? "bg-butter-wash text-butter" : tone === "bad" ? "bg-rose-wash text-rose" : "border border-line bg-paper text-body";
  return (
    <div className={`flex gap-[6px] rounded-lg px-[12px] py-[10px] text-[12.5px] ${row ? "w-full flex-row items-center gap-[10px]" : "flex-col items-start"} ${look}`}>
      {title ? <b className="inline-flex items-center gap-[6px] font-medium">{title}</b> : null}
      {children}
    </div>
  );
}

/**
 * A dialog over the screen it belongs to (the scrim covers the page panel, not the sidebar). Escape or a click on the
 * scrim closes it. `wide` is 720 px; the rest are 440.
 */
export function Dialog({ label, onClose, wide = false, alert = false, children }: { label: string; onClose: () => void; wide?: boolean; alert?: boolean; children: React.ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <>
      <div className="anim-fade absolute inset-0 z-[60] bg-scrim" onMouseDown={onClose} aria-hidden="true" />
      <div
        role={alert ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-label={label}
        className={`anim-pop absolute top-1/2 left-1/2 z-[61] flex max-h-[calc(100%-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[12px] overflow-auto rounded-2xl bg-card p-[20px] text-[13px] shadow-float ${wide ? "w-[min(720px,calc(100%-32px))]" : "w-[min(440px,calc(100%-32px))]"}`}
      >
        {children}
      </div>
    </>
  );
}

/** A dialog's title row, with a close button when asked. */
export function DialogHead({ title, onClose }: { title: string; onClose?: () => void }) {
  return (
    <div className="flex items-center gap-[8px]">
      <h2 className="flex-1 text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</h2>
      {onClose ? (
        <button type="button" className={IB} onClick={onClose} aria-label="Close" title="Close">
          <Ic n="x" />
        </button>
      ) : null}
    </div>
  );
}

/** One line at the bottom of the screen that says what just happened, gone after two seconds. */
export function useNote() {
  const [text, setText] = useState<{ t: string; n: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((t: string) => {
    if (timer.current) clearTimeout(timer.current);
    setText({ t, n: Date.now() });
    timer.current = setTimeout(() => setText(null), 1900);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  const node = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[20px] z-[90] flex justify-center px-[16px]">
      {text ? (
        <span key={text.n} role="status" className="anim-rise-sm rounded-full bg-ink px-[14px] py-[8px] text-[12.5px] whitespace-nowrap text-card">
          {text.t}
        </span>
      ) : null}
    </div>
  );
  return { show, node };
}

/** Copy text, and say whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** A form's thumbnail: three gray lines and its button, in the form's own button color. */
export function Thumb({ accent }: { accent?: string }) {
  return (
    <span aria-hidden="true" className="flex h-[48px] w-[40px] shrink-0 flex-col gap-[4px] rounded-[6px] border border-line bg-card px-[6px] py-[7px]">
      <i className="block h-[3px] rounded-[2px] bg-line-strong" />
      <i className="block h-[3px] w-3/5 rounded-[2px] bg-line-strong" />
      <i className="block h-[3px] rounded-[2px] bg-line-strong" />
      <em className="mt-auto block h-[6px] rounded-full bg-ink" style={accent ? { background: accent } : undefined} />
    </span>
  );
}

/** Three dots while something works. */
export const Dots = ({ className = "" }: { className?: string }) => (
  <span className={`inline-flex gap-[3px] ${className}`} aria-hidden="true">
    {[0, 150, 300].map((d) => (
      <i key={d} className="fm-blink size-[4px] rounded-full bg-current" style={{ animationDelay: `${d}ms` }} />
    ))}
  </span>
);

/** A small secondary action that removes something: red words on the same pill. */
export const GHOST_SM_RED = GHOST_SM.replace("text-body hover:border-line-strong hover:text-ink", "text-rose hover:border-line-strong");
export const GHOST_RED = GHOST.replace("text-body hover:border-line-strong hover:text-ink", "text-rose hover:border-line-strong");

/** An on/off switch: 34 by 20, the thumb springs across. */
export function Tg({ on, onChange, label, disabled = false }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[20px] w-[34px] shrink-0 rounded-full transition-colors duration-[200ms] disabled:opacity-40 ${on ? "bg-ink" : "bg-line-strong"}`}
    >
      <span className={`absolute top-[2px] left-[2px] size-[16px] rounded-full bg-card transition-transform duration-[200ms] ease-out ${on ? "translate-x-[14px]" : ""}`} />
    </button>
  );
}
