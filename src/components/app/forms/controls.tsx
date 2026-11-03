"use client";

// Compact panel controls (meetings, routing and the email builder), in the Framer way: 12 to 13px, a label on the left
// and the control on the right, number boxes you can drag to scrub, segmented pills and tags. Tokens only.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "../../Icons";
import { Select } from "../Select";
import { Toggle } from "../ui";

export const INPUT =
  "h-7 w-full min-w-0 rounded-md bg-card shadow-input px-2 text-[12.5px] text-ink outline-none transition-shadow duration-[140ms] placeholder:text-faint hover:shadow-input-hover focus:shadow-focus";
export const PICK = "h-7 w-full min-w-0 rounded-md bg-card shadow-input px-2 text-[12.5px] text-ink hover:shadow-input-hover";

/** A titled block in a panel. */
export function Section({ title, action, children, first = false }: { title?: string; action?: React.ReactNode; children: React.ReactNode; first?: boolean }) {
  return (
    <section className={`flex flex-col gap-2 px-3 py-3 ${first ? "" : "border-t border-line"}`}>
      {title || action ? (
        <div className="flex min-h-6 items-center gap-2">
          {title ? <h3 className="flex-1 text-[12px] font-semibold tracking-normal text-ink">{title}</h3> : <span className="flex-1" />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** How wide row labels are: the inspector's default, narrower in the left panel. */
export const LabelWidth = createContext(76);

/** Label left, control right. */
export function Row({ label, children, top = false, onScrub }: { label: string; children: React.ReactNode; top?: boolean; onScrub?: (dx: number, e: PointerEvent) => void }) {
  const w = useContext(LabelWidth);
  return (
    <div className={`grid gap-2 ${top ? "items-start" : "items-center"}`} style={{ gridTemplateColumns: `${w}px minmax(0,1fr)` }}>
      {onScrub ? <ScrubLabel onScrub={onScrub}>{label}</ScrubLabel> : <span className={`truncate text-[12px] text-muted ${top ? "pt-1.5" : ""}`}>{label}</span>}
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A label you can drag left and right to change the number beside it. */
function ScrubLabel({ children, onScrub }: { children: React.ReactNode; onScrub: (dx: number, e: PointerEvent) => void }) {
  return (
    <span
      className="cursor-ew-resize truncate text-[12px] text-muted select-none hover:text-ink"
      onPointerDown={(e) => {
        e.preventDefault();
        let last = e.clientX;
        const move = (ev: PointerEvent) => {
          const dx = ev.clientX - last;
          if (Math.abs(dx) >= 2) {
            onScrub(Math.trunc(dx / 2), ev);
            last = ev.clientX;
          }
        };
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    >
      {children}
    </span>
  );
}

export function TextIn({
  value,
  onChange,
  placeholder,
  label,
  mono = false,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  mono?: boolean;
  onBlur?: () => void;
}) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} aria-label={label} className={`${INPUT} ${mono ? "font-mono text-[12px]" : ""}`} />;
}

export function AreaIn({ value, onChange, placeholder, label, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; rows?: number }) {
  return (
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className="w-full min-w-0 resize-y rounded-md bg-card shadow-input px-2 py-1.5 text-[12.5px] leading-snug text-ink outline-none placeholder:text-faint hover:shadow-input-hover focus:shadow-focus"
    />
  );
}

const clamp = (n: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));

/**
 * A number box: type and press Enter, use the arrow keys (Shift for ten), or drag the row's label. Empty means
 * "not set" when `empty` is on.
 */
export function NumIn({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  empty = false,
  unit,
  placeholder,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  empty?: boolean;
  unit?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    setDraft(null);
    if (!t) return empty ? onChange(undefined) : undefined;
    const n = Number(t);
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
  };
  return (
    <span className="relative flex min-w-0 flex-1 items-center">
      <input
        value={shown}
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.target as HTMLInputElement).blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const base = Number(draft ?? value ?? min ?? 0) || 0;
            const n = clamp(+(base + (e.key === "ArrowUp" ? 1 : -1) * step * (e.shiftKey ? 10 : 1)).toFixed(4), min, max);
            setDraft(null);
            onChange(n);
          } else if (e.key === "Escape") {
            setDraft(null);
            (e.target as HTMLInputElement).blur();
          }
        }}
        className={`${INPUT} tabular-nums ${unit ? "pr-7" : ""}`}
      />
      {unit ? <span className="pointer-events-none absolute right-2 text-[11px] text-faint">{unit}</span> : null}
    </span>
  );
}

/** A number row whose label scrubs. */
export function NumRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  empty,
  unit,
  placeholder,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  empty?: boolean;
  unit?: string;
  placeholder?: string;
}) {
  return (
    <Row label={label} onScrub={(dx, e) => onChange(clamp(+((value ?? min ?? 0) + dx * step * (e.shiftKey ? 10 : 1)).toFixed(4), min, max))}>
      <NumIn label={label} value={value} onChange={onChange} min={min} max={max} step={step} empty={empty} unit={unit} placeholder={placeholder} />
    </Row>
  );
}

/** Small segmented pills. Options may be icons, named by `title`. */
export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-7 min-w-0 flex-1 items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.title}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`flex h-6 min-w-0 flex-1 items-center justify-center rounded-full px-1.5 text-[12px] font-medium whitespace-nowrap transition-colors duration-[140ms] ${value === o.value ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ label, on, onChange, disabled }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className={`flex min-h-7 items-center justify-between gap-2 ${disabled ? "opacity-50" : ""}`}>
      <span className="truncate text-[12px] text-muted">{label}</span>
      <Toggle label={label} on={on} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function Pick<T extends string | number>({
  value,
  options,
  onChange,
  label,
  placeholder,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  placeholder?: string;
}) {
  return <Select<T> value={value} options={options} onChange={onChange} ariaLabel={label} placeholder={placeholder} className={PICK} />;
}

// Popovers -------------------------------------------------------------------------------------------------------

/** A layer anchored to a button, above everything; closes on a click away or Escape. */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  width = 248,
  label,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  label: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const place = () => {
      const r = anchor.current!.getBoundingClientRect();
      const h = box.current?.offsetHeight ?? 320;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      const below = r.bottom + 6;
      const top = below + h > window.innerHeight - 8 && r.top - h - 6 > 8 ? r.top - h - 6 : Math.max(8, Math.min(below, window.innerHeight - h - 8));
      setPos({ left, top });
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
  }, [open, anchor, width]);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc, true);
    };
  }, [open, onClose, anchor]);
  if (!open) return null;
  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={label}
      style={{ position: "fixed", left: pos?.left ?? -9999, top: pos?.top ?? -9999, width }}
      className="anim-rise-sm z-[100] rounded-lg bg-card p-2.5 text-[12.5px] shadow-float"
    >
      {children}
    </div>,
    document.body,
  );
}

// Tags ----------------------------------------------------------------------------------------------------------

/** A list of short values as pills: type and press Enter or comma; Backspace on an empty box removes the last. */
export function TagInput({
  values,
  onChange,
  placeholder,
  label,
  clean,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  label: string;
  clean?: (v: string) => string | null;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = raw
      .split(/[\s,]+/)
      .map((x) => (clean ? clean(x) : x.trim()))
      .filter((x): x is string => !!x);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setText("");
  };
  return (
    <div className="flex min-h-7 w-full min-w-0 flex-wrap items-center gap-1 rounded-md bg-card shadow-input px-1 py-0.5 focus-within:shadow-focus">
      {values.map((v) => (
        <span key={v} className="inline-flex h-5 items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2 text-[11.5px] text-ink">
          {v}
          <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-faint hover:text-ink">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        value={text}
        aria-label={label}
        placeholder={values.length ? "" : placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text.trim() && add(text)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(text);
          } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
        }}
        className="h-6 min-w-[60px] flex-1 bg-transparent px-1 text-[12.5px] outline-none placeholder:text-faint"
      />
    </div>
  );
}
