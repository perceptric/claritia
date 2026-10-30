"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronsUpDown } from "../Icons";

/** `hint`: a gray line under the label. `group`: a small heading shown above the first option of each group. */
export type Option<T extends string | number> = { value: T; label: string; hint?: string; group?: string };

/**
 * The app's own dropdown, so menus look the same on every computer. The menu opens in a layer above the
 * page, so tables and scrolling panels never cut it off.
 */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  className = "",
  ariaLabel,
  placeholder = "Choose…",
  autoOpen = false,
  onClose,
  disabled = false,
  plainPlaceholder = false,
  shown,
  down = false,
  menuWidth,
  align = "left",
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
  ariaLabel?: string;
  placeholder?: string;
  autoOpen?: boolean;
  onClose?: () => void;
  disabled?: boolean;
  /** Show the placeholder in normal text, for a menu that works like a button. */
  plainPlaceholder?: boolean;
  /** What the button shows instead of the option's label (a badge, a name with a word before it). */
  shown?: React.ReactNode;
  /** A plain down chevron instead of the up-down one (the sentence and table dropdowns). */
  down?: boolean;
  /** The menu's least width. */
  menuWidth?: number;
  /** Line the menu up with the button's right edge. */
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(autoOpen);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; up: boolean } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const current = options.find((o) => o.value === value);

  const close = (focus = true) => {
    setOpen(false);
    onClose?.();
    if (focus) button.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      const groups = new Set(options.map((o) => o.group).filter(Boolean)).size;
      const height = Math.min(300, options.reduce((n, o) => n + (o.hint ? 50 : 32), 8) + groups * 26);
      const up = r.bottom + height + 8 > window.innerHeight && r.top > height + 8;
      const width = Math.max(r.width, menuWidth ?? 160);
      const left = align === "right" ? Math.max(8, r.right - width) : Math.min(r.left, Math.max(8, window.innerWidth - width - 8));
      setPos({ left, top: up ? r.top - height - 4 : r.bottom + 4, width, up });
    };
    place();
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options, value, menuWidth, align]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  });

  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pickAt = (i: number) => {
    const o = options[i];
    if (!o) return;
    close();
    if (o.value !== value) onChange(o.value);
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        autoFocus={autoOpen}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setOpen(true);
          } else if (open) {
            if (e.key === "Escape" || e.key === "Tab") close(e.key === "Escape");
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pickAt(active);
            }
          }
        }}
        className={`inline-flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${current || plainPlaceholder || shown ? "" : "text-faint"}`}>{shown ?? current?.label ?? placeholder}</span>
        {down ? <ChevronDown size={12} className="shrink-0 text-muted" /> : <ChevronsUpDown size={13} className="shrink-0 text-faint" />}
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={menu}
              role="listbox"
              aria-label={ariaLabel}
              style={{ position: "fixed", left: pos.left, top: pos.top, minWidth: pos.width, maxHeight: 300 }}
              className="anim-rise-sm z-[100] overflow-y-auto rounded-lg bg-card p-1.5 text-[13px] shadow-float"
            >
              {options.map((o, i) => [
                o.group && o.group !== options[i - 1]?.group ? (
                  <li key={`g-${o.group}`} role="presentation" className="px-2.5 pt-2 pb-1 text-[11.5px] text-muted">
                    {o.group}
                  </li>
                ) : null,
                <li
                  key={String(o.value)}
                  data-i={i}
                  role="option"
                  aria-selected={o.value === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickAt(i)}
                  className={`flex cursor-pointer gap-2 rounded-sm px-2.5 ${o.hint ? "items-start py-1.5" : "h-8 items-center whitespace-nowrap"} ${i === active ? "bg-hover" : ""}`}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="whitespace-nowrap text-ink">{o.label}</span>
                    {o.hint ? <span className="max-w-[260px] text-[11.5px] leading-snug text-muted">{o.hint}</span> : null}
                  </span>
                  {o.value === value ? <Check size={13} className={`shrink-0 text-ink ${o.hint ? "mt-0.5" : ""}`} /> : <span className="w-[13px] shrink-0" />}
                </li>,
              ])}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
