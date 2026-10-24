"use client";

// Small shared parts of the Router screens: inspector blocks, the slide-in for panels, the count-up for Replay, the
// field picker grouped like the condition editor, and a chip list that takes pasted lists.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FieldDef } from "@/lib/router/conditions";
import { Check, ChevronsUpDown, Plus, X } from "../../Icons";
import { Popover } from "../FilterBar";
import { Input } from "../ui";
import { splitList } from "./editorModel";

export const fmt = (n: number) => n.toLocaleString("en-US");

export const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** A titled block in the inspector, like the meeting type editor's. */
export function Block({ title, children, action, first = false }: { title?: string; children: React.ReactNode; action?: React.ReactNode; first?: boolean }) {
  return (
    <section className={`flex flex-col gap-2.5 px-5 py-4 ${first ? "" : "border-t border-line"}`}>
      {title || action ? (
        <div className="flex min-h-7 items-center gap-2">
          {title ? <h3 className="flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-ink">{title}</h3> : <span className="flex-1" />}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** A label on the left and a switch or a value on the right. */
export function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="min-w-0 truncate text-[12.5px] text-body">{label}</span>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/** Panels slide in from the right (calm, ease-out); nothing moves under reduced motion. */
export function useSlideIn<T extends HTMLElement>(from: "right" | "up" = "right") {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || typeof el.animate !== "function") return;
    el.animate([{ transform: from === "right" ? "translateX(24px)" : "translateY(8px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, [from]);
  return ref;
}

/** A number that counts up to its value (slow); it shows at once under reduced motion. */
export function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = from.current;
    if (reducedMotion() || start === value) {
      const raf = requestAnimationFrame(() => setShown(value));
      from.current = value;
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 700);
      const e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + (value - start) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmt(shown)}</>;
}

const GROUPS: FieldDef["group"][] = ["Contact", "Company", "Form answers", "Source", "Score"];

/** Pick a field: a search box and the fields grouped as Contact, Company, Form answers, Source and Score. */
export function FieldPicker({ fields, value, onChange, disabled = false, className = "" }: { fields: FieldDef[]; value: string; onChange: (f: FieldDef) => void; disabled?: boolean; className?: string }) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [q, setQ] = useState("");
  const current = fields.find((f) => f.key === value);
  const s = q.trim().toLowerCase();
  const shown = fields.filter((f) => !s || f.label.toLowerCase().includes(s) || f.group.toLowerCase().includes(s));
  const close = () => {
    const a = anchor;
    setAnchor(null);
    setQ("");
    a?.focus();
  };
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={!!anchor}
        aria-label="Field"
        onClick={(e) => (anchor ? close() : setAnchor(e.currentTarget))}
        className={`inline-flex h-7 min-w-0 items-center justify-between gap-1.5 rounded-sm border border-line-strong bg-card px-2 text-left text-[12.5px] text-ink hover:border-ink/40 disabled:opacity-60 ${className}`}
      >
        <span className={`truncate ${current ? "" : "text-faint"}`}>{current?.label ?? (value ? value.replace(/^[a-z]+\./, "") : "Field")}</span>
        <ChevronsUpDown size={12} className="shrink-0 text-faint" />
      </button>
      {anchor ? (
        <Popover anchor={anchor} onClose={close} width={260}>
          <div className="border-b border-line p-2">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search fields" className="h-8" />
          </div>
          <ul role="listbox" aria-label="Fields" className="max-h-72 overflow-y-auto p-1">
            {GROUPS.map((g) => {
              const list = shown.filter((f) => f.group === g);
              if (!list.length) return null;
              return (
                <li key={g}>
                  <p className="px-2.5 pt-2 pb-1 text-[11.5px] text-faint">{g}</p>
                  <ul>
                    {list.map((f) => (
                      <li key={f.key} role="option" aria-selected={f.key === value}>
                        <button
                          type="button"
                          onClick={() => {
                            onChange(f);
                            close();
                          }}
                          className="flex h-8 w-full items-center gap-2 rounded-sm px-2.5 text-left hover:bg-hover"
                        >
                          <span className="flex-1 truncate">{f.label}</span>
                          {f.key === value ? <Check size={12} /> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
            {!shown.length ? <li className="px-2.5 py-2 text-faint">No fields</li> : null}
          </ul>
        </Popover>
      ) : null}
    </>
  );
}

/** Values as pills. Typing and Enter, a comma or a pasted list adds them; Backspace on an empty box removes the last. */
export function ChipList({
  values,
  onChange,
  label,
  placeholder,
  clean,
  disabled = false,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  label: string;
  placeholder?: string;
  clean?: (v: string) => string | null;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const add = (raw: string) => {
    const parts = splitList(raw)
      .map((x) => (clean ? clean(x) : x))
      .filter((x): x is string => !!x);
    if (parts.length) onChange([...new Set([...values, ...parts])]);
    setText("");
  };
  return (
    <div className="flex min-h-8 w-full min-w-0 flex-wrap items-center gap-1 rounded-sm border border-line-strong bg-card px-1 py-1 focus-within:border-ink focus-within:ring-1 focus-within:ring-ink">
      {values.map((v) => (
        <span key={v} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12px] text-ink">
          <span className="truncate">{v}</span>
          {!disabled ? (
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="flex size-4 items-center justify-center rounded-full text-faint hover:text-ink">
              <X size={10} />
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <input
          value={text}
          aria-label={label}
          placeholder={values.length ? "" : placeholder}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (/[\s,;]/.test(t.trim())) {
              e.preventDefault();
              add(`${text} ${t}`);
            }
          }}
          onBlur={() => text.trim() && add(text)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            } else if (e.key === "Backspace" && !text && values.length) onChange(values.slice(0, -1));
          }}
          className="h-6 min-w-[80px] flex-1 bg-transparent px-1.5 text-[12.5px] outline-none placeholder:text-faint"
        />
      ) : null}
    </div>
  );
}

/** Choices as pills with a searchable list to add from. `groups` label the options (Territories, Countries...). */
export function ChoiceChips({
  values,
  options,
  onChange,
  label,
  disabled = false,
  onPickExtra,
}: {
  values: string[];
  options: { value: string; label: string; group?: string }[];
  onChange: (v: string[]) => void;
  label: string;
  disabled?: boolean;
  /** Options that do more than add a value (a region that becomes a territory). */
  onPickExtra?: { options: { value: string; label: string }[]; group: string; pick: (value: string) => void };
}) {
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const [q, setQ] = useState("");
  const name = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const s = q.trim().toLowerCase();
  const left = options.filter((o) => !values.includes(o.value) && (!s || o.label.toLowerCase().includes(s) || o.value.toLowerCase() === s));
  const extra = (onPickExtra?.options ?? []).filter((o) => !s || o.label.toLowerCase().includes(s));
  const groups = [...new Set(left.map((o) => o.group ?? ""))];
  const close = () => {
    const a = anchor;
    setAnchor(null);
    setQ("");
    a?.focus();
  };
  const row = (key: string, text: string, onPick: () => void) => (
    <li key={key}>
      <button type="button" onClick={onPick} className="flex h-8 w-full items-center rounded-sm px-2.5 text-left hover:bg-hover">
        <span className="truncate">{text}</span>
      </button>
    </li>
  );
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {values.map((v) => (
        <span key={v} className="inline-flex h-6 max-w-full items-center gap-1 rounded-full bg-paper-deep pr-1 pl-2.5 text-[12px] text-ink">
          <span className="truncate">{name(v)}</span>
          {!disabled ? (
            <button type="button" aria-label={`Remove ${name(v)}`} onClick={() => onChange(values.filter((x) => x !== v))} className="flex size-4 items-center justify-center rounded-full text-faint hover:text-ink">
              <X size={10} />
            </button>
          ) : null}
        </span>
      ))}
      {!disabled ? (
        <button
          type="button"
          aria-label={`Add to ${label}`}
          aria-expanded={!!anchor}
          onClick={(e) => (anchor ? close() : setAnchor(e.currentTarget))}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-line-strong px-2 text-[12px] font-medium text-body hover:border-ink/40 hover:text-ink"
        >
          <Plus size={11} />
          Add
        </button>
      ) : null}
      {anchor ? (
        <Popover anchor={anchor} onClose={close} width={260}>
          <div className="border-b border-line p-2">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && left[0]) {
                  e.preventDefault();
                  onChange([...values, left[0].value]);
                  setQ("");
                }
              }}
              placeholder="Search"
              aria-label={`Search ${label}`}
              className="h-8"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto p-1">
            {extra.length && onPickExtra ? (
              <li>
                <p className="px-2.5 pt-2 pb-1 text-[11.5px] text-faint">{onPickExtra.group}</p>
                <ul>
                  {extra.map((o) =>
                    row(`x:${o.value}`, o.label, () => {
                      onPickExtra.pick(o.value);
                      close();
                    }),
                  )}
                </ul>
              </li>
            ) : null}
            {groups.map((g) => (
              <li key={g || "-"}>
                {g ? <p className="px-2.5 pt-2 pb-1 text-[11.5px] text-faint">{g}</p> : null}
                <ul>
                  {left
                    .filter((o) => (o.group ?? "") === g)
                    .slice(0, 300)
                    .map((o) =>
                      row(o.value, o.label, () => {
                        onChange([...values, o.value]);
                        setQ("");
                      }),
                    )}
                </ul>
              </li>
            ))}
            {!left.length && !extra.length ? <li className="px-2.5 py-2 text-faint">No matches</li> : null}
          </ul>
        </Popover>
      ) : null}
    </div>
  );
}
