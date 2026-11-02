"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The form's own dropdown (no browser <select>), styled with the form's accent. The list opens in a layer above the
// page so a short iframe or a card never cuts it off; it types-to-find for long lists like countries.

export function Dropdown({
  id,
  value,
  options,
  onChange,
  placeholder = "Choose…",
  invalid,
  disabled,
  describedBy,
}: {
  id: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; max: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const want = Math.min(280, options.length * 36 + 8);
      const up = below < Math.min(want, 160) && above > below;
      const max = Math.max(120, Math.min(want, up ? above : below));
      setPos({ left: r.left, top: up ? r.top - max - 4 : r.bottom + 4, width: r.width, max });
    };
    place();
    setActive(Math.max(0, options.indexOf(value)));
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options, value]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!list.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const pick = (i: number) => {
    const o = options[i];
    if (o === undefined) return;
    setOpen(false);
    btn.current?.focus();
    onChange(o);
  };
  const find = (key: string) => {
    const now = Date.now();
    typed.current = { text: now - typed.current.at < 700 ? typed.current.text + key.toLowerCase() : key.toLowerCase(), at: now };
    const i = options.findIndex((o) => o.toLowerCase().startsWith(typed.current.text));
    if (i >= 0) setActive(i);
    return i;
  };

  return (
    <>
      <button
        ref={btn}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
            e.preventDefault();
            setOpen(true);
          } else if (open) {
            if (e.key === "Escape" || e.key === "Tab") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(options.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              pick(active);
            } else if (e.key.length === 1) find(e.key);
          } else if (e.key.length === 1 && /\S/.test(e.key)) {
            const i = find(e.key);
            if (i >= 0) onChange(options[i]!);
          }
        }}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-md border bg-white px-3 text-left text-[14px] outline-none focus-visible:border-[var(--fa)] focus-visible:ring-1 focus-visible:ring-[var(--fa)] disabled:opacity-60 ${invalid ? "border-danger" : "border-line-strong hover:border-ink/40"}`}
      >
        <span className={`truncate ${value ? "text-ink" : "text-faint"}`}>{value || placeholder}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 text-faint" aria-hidden="true">
          <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <ul
              ref={list}
              role="listbox"
              aria-labelledby={id}
              style={{ position: "fixed", left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.max }}
              className="z-[200] overflow-y-auto border border-line-strong bg-white p-1 text-[14px] shadow-pop"
            >
              {options.map((o, i) => (
                <li
                  key={o}
                  data-i={i}
                  role="option"
                  aria-selected={o === value}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(i)}
                  className={`flex min-h-9 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 ${i === active ? "bg-hover" : ""}`}
                >
                  <span>{o}</span>
                  {o === value ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-[var(--fa)]" aria-hidden="true">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
