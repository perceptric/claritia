"use client";

// Compact controls for the form editor, in the Framer way: 12 to 13px, a label on the left and the control on the
// right, number boxes you can drag to scrub, segmented pills, sliders, swatches. Tokens only; the colors the color
// picker shows are the form's own data.

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { contrast } from "@/lib/forms/brand";
import { Check, Search, X } from "../../Icons";
import { Select } from "../Select";
import { Toggle } from "../ui";
import { FONTS, familyOf, grade, previewFontsUrl, SYSTEM_FONT } from "./editorModel";

export const INPUT =
  "h-7 w-full min-w-0 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] text-ink outline-none transition-shadow duration-[140ms] placeholder:text-faint hover:border-ink/40 focus:border-ink focus:ring-1 focus:ring-ink";
export const PICK = "h-7 w-full min-w-0 rounded-sm border border-line-strong bg-card px-2 text-[12.5px] text-ink hover:border-ink/40";

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
      className="w-full min-w-0 resize-y rounded-sm border border-line-strong bg-card px-2 py-1.5 text-[12.5px] leading-snug text-ink outline-none placeholder:text-faint hover:border-ink/40 focus:border-ink focus:ring-1 focus:ring-ink"
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

/** A slider with its number: drag the track, the label or the box. */
export function SliderRow({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  return (
    <Row label={label} onScrub={(dx) => onChange(clamp(value + dx * step, min, max))}>
      <Slider label={label} value={value} min={min} max={max} step={step} onChange={onChange} />
      <span className="w-[52px] shrink-0">
        <NumIn label={`${label} value`} value={value} min={min} max={max} step={step} unit={unit} onChange={(v) => v !== undefined && onChange(v)} />
      </span>
    </Row>
  );
}

export function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const pct = ((clamp(value, min, max) - min) / (max - min || 1)) * 100;
  const at = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const raw = min + ((clientX - r.left) / r.width) * (max - min);
    return clamp(Math.round(raw / step) * step, min, max);
  };
  return (
    <div
      ref={track}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      onPointerDown={(e) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).focus();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        onChange(at(e.clientX));
      }}
      onPointerMove={(e) => {
        if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) onChange(at(e.clientX));
      }}
      onKeyDown={(e) => {
        const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        onChange(clamp(value + d * step * (e.shiftKey ? 10 : 1), min, max));
      }}
      className="group relative flex h-7 min-w-0 flex-1 cursor-pointer touch-none items-center outline-none"
    >
      <span className="h-1 w-full rounded-full bg-paper-deep">
        <span className="block h-1 rounded-full bg-ink" style={{ width: `${pct}%` }} />
      </span>
      <span
        className="absolute size-3.5 -translate-x-1/2 rounded-full border border-line-strong bg-card shadow-soft transition-transform duration-[140ms] group-hover:scale-110 group-focus-visible:ring-2 group-focus-visible:ring-ink"
        style={{ left: `${pct}%` }}
      />
    </div>
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

// Color ---------------------------------------------------------------------------------------------------------

const SWATCHES = [
  "#111111",
  "#3a3a3a",
  "#6b6b6b",
  "#a3a3a3",
  "#d4d4d4",
  "#f4f4f4",
  "#ffffff",
  "#1d4ed8",
  "#2563eb",
  "#0ea5e9",
  "#0d9488",
  "#16a34a",
  "#65a30d",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#db2777",
  "#9333ea",
  "#7c3aed",
  "#4f46e5",
  "#b5532a",
];

const hexOk = (v: string) => /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(v.trim());
function toRgb(hex: string): [number, number, number] {
  let h = hex.replace("#", "").slice(0, 6);
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0) as [number, number, number];
}
function toHsv([r, g, b]: [number, number, number]): [number, number, number] {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max];
}
function fromHsv(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** A color: a swatch that opens a picker, the hex, and how well it reads on the color it sits on. */
export function ColorField({ label, value, onChange, against, need = 4.5 }: { label: string; value: string; onChange: (v: string) => void; against?: string; need?: number }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState<string | null>(null);
  const v = value.slice(0, 7);
  const ratio = against && hexOk(v) && hexOk(against.slice(0, 7)) ? contrast(v, against.slice(0, 7)) : null;
  const g = ratio !== null ? grade(ratio, need) : null;
  return (
    <Row label={label}>
      <button ref={btn} type="button" aria-label={`${label} color`} onClick={() => setOpen((o) => !o)} className="press size-6 shrink-0 rounded-full border border-line-strong p-0.5">
        <span className="block size-full rounded-full" style={{ background: v }} />
      </button>
      <input
        value={hex ?? v}
        aria-label={`${label} hex`}
        onChange={(e) => {
          setHex(e.target.value);
          if (hexOk(e.target.value)) onChange(e.target.value.trim().toLowerCase());
        }}
        onBlur={() => setHex(null)}
        className={`${INPUT} font-mono text-[11.5px] uppercase`}
      />
      {g ? (
        <span
          title={`${ratio!.toFixed(1)} : 1`}
          className={`inline-flex h-5 shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-medium tabular-nums ${g.ok ? "bg-sage-wash text-sage" : "bg-rose-wash text-rose"}`}
        >
          {ratio!.toFixed(1)}
        </span>
      ) : null}
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={`${label} color`} width={232}>
        <ColorPicker value={hexOk(v) ? v : "#000000"} onChange={onChange} />
        {g ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-muted">
            <span className={`inline-flex h-5 items-center rounded-full px-1.5 font-medium ${g.ok ? "bg-sage-wash text-sage" : "bg-rose-wash text-rose"}`}>{g.label}</span>
            <span className="tabular-nums">{ratio!.toFixed(2)} : 1</span>
          </p>
        ) : null}
      </Popover>
    </Row>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hsv, setHsv] = useState(() => toHsv(toRgb(value)));
  const [was, setWas] = useState(value);
  if (value !== was) {
    setWas(value);
    if (fromHsv(...hsv) !== value.toLowerCase()) setHsv(toHsv(toRgb(value)));
  }
  const set = (h: number, s: number, v: number) => {
    setHsv([h, s, v]);
    onChange(fromHsv(h, s, v));
  };
  const drag = (el: HTMLElement, e: React.PointerEvent, fn: (x: number, y: number) => void) => {
    el.setPointerCapture(e.pointerId);
    const go = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      fn(clamp((cx - r.left) / r.width, 0, 1), clamp((cy - r.top) / r.height, 0, 1));
    };
    go(e.clientX, e.clientY);
    const move = (ev: PointerEvent) => go(ev.clientX, ev.clientY);
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };
  const [h, s, v] = hsv;
  return (
    <div className="flex flex-col gap-2.5">
      <div
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuenow={Math.round(s * 100)}
        tabIndex={0}
        onPointerDown={(e) => drag(e.currentTarget, e, (x, y) => set(h, x, 1 - y))}
        onKeyDown={(e) => {
          const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, 0.02], ArrowDown: [0, -0.02] }[e.key];
          if (!d) return;
          e.preventDefault();
          set(h, clamp(s + d[0], 0, 1), clamp(v + d[1], 0, 1));
        }}
        className="relative h-32 cursor-crosshair touch-none rounded-sm"
        style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${fromHsv(h, 1, 1)})` }}
      >
        <span
          className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-float"
          style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%` }}
        />
      </div>
      <div
        role="slider"
        aria-label="Hue"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(h)}
        tabIndex={0}
        onPointerDown={(e) => drag(e.currentTarget, e, (x) => set(x * 359.9, s, v))}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" ? 4 : e.key === "ArrowLeft" ? -4 : 0;
          if (!d) return;
          e.preventDefault();
          set((h + d + 360) % 360, s, v);
        }}
        className="relative h-3 cursor-pointer touch-none rounded-full"
        style={{ background: "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
      >
        <span className="pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-float" style={{ left: `${(h / 360) * 100}%` }} />
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={c} title={c} onClick={() => onChange(c)} className="press relative aspect-square rounded-full border border-line-strong" style={{ background: c }}>
            {c === value.toLowerCase() ? <Check size={11} className="absolute inset-0 m-auto mix-blend-difference text-white" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

// Fonts ---------------------------------------------------------------------------------------------------------

let previewAdded = false;
function loadPreviewFonts() {
  if (previewAdded || typeof document === "undefined") return;
  previewAdded = true;
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = previewFontsUrl();
  document.head.append(l);
}

/** Pick a Google Font with search; each name shows in its own font. `allowSame` adds "Same as text". */
export function FontPicker({ label, value, onChange, allowSame = false }: { label: string; value: string; onChange: (name: string) => void; allowSame?: boolean }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = value ? familyOf(value) : "";
  const shownName = !value ? (allowSame ? "Same as text" : "System") : current;
  const list = FONTS.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const pick = (n: string) => {
    onChange(n);
    setOpen(false);
    setQ("");
  };
  return (
    <Row label={label}>
      <button
        ref={btn}
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => {
          loadPreviewFonts();
          setOpen((o) => !o);
        }}
        className={`${PICK} flex items-center justify-between gap-2 text-left`}
      >
        <span className="truncate" style={value ? { fontFamily: value } : undefined}>
          {shownName}
        </span>
      </button>
      <Popover anchor={btn} open={open} onClose={() => setOpen(false)} label={label} width={240}>
        <label className="mb-1.5 flex h-7 items-center gap-1.5 rounded-sm border border-line-strong px-2 focus-within:border-ink">
          <Search size={12} className="text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search fonts"
            aria-label="Search fonts"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] outline-none placeholder:text-faint"
          />
          {q ? (
            <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="text-faint hover:text-ink">
              <X size={11} />
            </button>
          ) : null}
        </label>
        <ul role="listbox" aria-label={label} className="-mx-1 max-h-64 overflow-y-auto">
          {!q ? <FontRow name={allowSame ? "Same as text" : "System"} family={allowSame ? undefined : SYSTEM_FONT} on={!value} onPick={() => pick("")} /> : null}
          {list.map((f) => (
            <FontRow
              key={f.name}
              name={f.name}
              family={`'${f.name}', ${f.cat === "serif" ? "serif" : f.cat === "mono" ? "monospace" : "sans-serif"}`}
              tag={f.cat === "sans" ? "" : f.cat}
              on={current.toLowerCase() === f.name.toLowerCase()}
              onPick={() => pick(f.name)}
            />
          ))}
          {!list.length ? <li className="px-2 py-2 text-[12px] text-muted">No matches</li> : null}
        </ul>
      </Popover>
    </Row>
  );
}

function FontRow({ name, family, tag = "", on, onPick }: { name: string; family?: string; tag?: string; on: boolean; onPick: () => void }) {
  return (
    <li role="option" aria-selected={on} onClick={onPick} className={`flex h-8 cursor-pointer items-center gap-2 rounded-sm px-2 text-[14px] hover:bg-hover ${on ? "text-ink" : "text-body"}`}>
      <span className="min-w-0 flex-1 truncate" style={family ? { fontFamily: family } : undefined}>
        {name}
      </span>
      {tag ? <span className="text-[11px] text-faint">{tag}</span> : null}
      {on ? <Check size={12} /> : null}
    </li>
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
    <div className="flex min-h-7 w-full min-w-0 flex-wrap items-center gap-1 rounded-sm border border-line-strong bg-card px-1 py-0.5 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
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
