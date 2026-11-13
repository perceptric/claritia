"use client";

// The canvas's left panel (docs/email-canvas-b5.md section 2.1): two tabs, Tia (the chat) and Add (the + panel's
// tiles), with a close X. Docked on the left at 340 px; a sheet from the bottom under 1,024 px, like the right panel.

import { X } from "../../../Icons";

export type LeftTab = "tia" | "add";

export function LeftPanel({ tab, onTab, onClose, children }: { tab: LeftTab; onTab: (t: LeftTab) => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <aside
      data-canvas-ui=""
      aria-label={tab === "add" ? "Add" : "Tia"}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || (e.target as HTMLElement).closest("textarea")) return;
        e.stopPropagation();
        onClose();
      }}
      className="z-[6] flex min-h-0 shrink-0 flex-col bg-card max-lg:absolute max-lg:inset-x-0 max-lg:bottom-0 max-lg:max-h-[55%] max-lg:rounded-t-2xl max-lg:shadow-float lg:order-first lg:w-[340px] lg:shadow-[1px_0_0_var(--color-line)]"
    >
      <div className="flex shrink-0 items-center gap-1 px-3 pt-3 pb-2">
        <div role="tablist" aria-label="Left panel" className="flex items-center gap-0.5 rounded-full bg-paper-deep p-0.5">
          {(["tia", "add"] as const).map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => onTab(t)} className={`h-7 rounded-full px-3 text-[12.5px] font-medium transition-colors duration-[140ms] ${tab === t ? "bg-card text-ink shadow-chip" : "text-muted hover:text-ink"}`}>
              {t === "tia" ? "Tia" : "Add"}
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <button type="button" aria-label={tab === "add" ? "Close the add panel" : "Close Tia"} title="Close" onClick={onClose} className="flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink">
          <X size={14} />
        </button>
      </div>
      {children}
    </aside>
  );
}
