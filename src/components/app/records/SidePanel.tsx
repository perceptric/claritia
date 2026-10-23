"use client";

// A panel that slides in from the right, for forms and wizards over a list.

import { useEffect } from "react";
import { Button } from "../ui";

export function SidePanel({ title, onClose, children, footer, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !document.querySelector('[role="listbox"]') && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <>
      <div className="anim-fade fixed inset-0 z-[80] bg-scrim" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={title} className={`fixed inset-y-2 right-2 z-[81] flex w-[calc(100%-1rem)] flex-col overflow-hidden rounded-2xl border border-line bg-card shadow-float transition-[transform,opacity] duration-[320ms] ease-out starting:translate-x-8 starting:opacity-0 ${wide ? "max-w-[760px]" : "max-w-[480px]"}`}>
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-5">
          <h2 className="serif truncate text-[20px] text-ink">{title}</h2>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        {footer ? <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-paper px-5 py-3">{footer}</div> : null}
      </aside>
    </>
  );
}

