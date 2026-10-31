"use client";

// The one side sheet (docs/unify-plan.md 2.2): it slides in from the right over the page for a record's details, a
// form or wizard, history, versions or a test. Inset from the edges with round corners, a title and an X, a body that
// scrolls, and an optional footer. Escape or a click outside closes it, unless a dialog is open on top of it.

import { useEffect, useLayoutEffect, useRef } from "react";
import { X } from "../Icons";
import { IconButton } from "./ui";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function Sheet({
  title,
  onClose,
  children,
  footer,
  head,
  actions,
  wide = false,
  width,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Shown instead of the plain title (an avatar and two lines, say); `title` stays the dialog's name. */
  head?: React.ReactNode;
  actions?: React.ReactNode;
  wide?: boolean;
  /** Its own width in px (Routing's drawers are 620), instead of the two standard ones. */
  width?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof el.animate !== "function") return;
    el.animate([{ transform: "translateX(24px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" });
  }, []);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="listbox"]')) return;
      // Only the top dialog closes.
      const dialogs = [...document.querySelectorAll('[aria-modal="true"]')];
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      onClose();
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <>
      <div className="anim-fade fixed inset-0 z-[80] bg-scrim" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={width ? { maxWidth: width } : undefined}
        className={`fixed inset-y-2 right-2 z-[81] flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-float ${width ? "" : wide ? "max-w-[760px]" : "max-w-[480px]"}`}
      >
        <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-line px-5 py-2">
          <div className="min-w-0 flex-1">{head ?? <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>}</div>
          {actions}
          <IconButton label="Close" onClick={onClose} className="-mr-2">
            <X size={15} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer ? <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div> : null}
      </aside>
    </>
  );
}
