"use client";

// The parts every Calendar panel is made of (docs/scheduling-plan.md 11.1): closed sections with an icon tile, a
// title and one gray line saying what's set, one open at a time; option chips; a footer pinned to the panel's bottom;
// the corner bracket on the open row; and a pill pair of icon buttons (Desktop | Phone).

import { useEffect, useRef } from "react";
import { ChevronDown, Lock } from "../../Icons";

/** The corner bracket from the mark, on the row that's open. Its parent needs `relative`. */
export function Corners({ r = 10 }: { r?: number }) {
  return (
    <>
      <span aria-hidden="true" className="anim-fade pointer-events-none absolute -top-px -left-px z-[1] size-3 border-t-[1.5px] border-l-[1.5px] border-ink" style={{ borderTopLeftRadius: r }} />
      <span aria-hidden="true" className="anim-fade pointer-events-none absolute -right-px -bottom-px z-[1] size-3 border-r-[1.5px] border-b-[1.5px] border-ink" style={{ borderBottomRightRadius: r }} />
    </>
  );
}

/** A panel section: a 58 px row with its icon, title and summary; the body shows when it's the open one. */
export function PanelSection({
  icon,
  title,
  summary,
  open,
  onToggle,
  locked = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary: string;
  open: boolean;
  onToggle: () => void;
  locked?: boolean;
  children: React.ReactNode;
}) {
  const box = useRef<HTMLElement>(null);
  // The section that opens comes into view, so its body is never below the fold.
  useEffect(() => {
    if (!open) return;
    const still = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.current?.scrollIntoView?.({ block: "nearest", behavior: still ? "auto" : "smooth" });
  }, [open]);
  return (
    <section ref={box} className="scroll-my-2 border-b border-line">
      <button type="button" aria-expanded={open} onClick={onToggle} className="flex min-h-[58px] w-full items-center gap-3 px-4 py-[9px] text-left transition-colors duration-[120ms] hover:bg-paper">
        <span className={`flex size-[30px] shrink-0 items-center justify-center rounded-lg transition-colors duration-[120ms] [&_svg]:size-3.5 ${open ? "bg-ink text-paper" : "bg-paper-deep text-body"}`}>{icon}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
            {title}
            {locked ? <Lock size={11} className="text-faint" /> : null}
          </span>
          <span className="truncate text-[12px] text-muted">{summary}</span>
        </span>
        <ChevronDown size={14} className={`text-faint transition-transform duration-[200ms] ease-out ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className={`anim-rise-sm flex flex-col gap-3.5 pt-0.5 pr-5 pb-[18px] pl-[58px] ${locked ? "pointer-events-none opacity-60" : ""}`}>{children}</div> : null}
    </section>
  );
}

/** One choice among several, as a pill; the picked one has an ink edge. */
export function Chip({ on, onClick, disabled, children, label }: { on: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`press inline-flex h-[30px] items-center gap-1.5 rounded-full border px-[11px] text-[12.5px] whitespace-nowrap transition-colors duration-[120ms] disabled:cursor-default disabled:opacity-45 ${on ? "border-ink bg-paper-deep font-medium text-ink" : "border-line text-body hover:border-line-strong"}`}
    >
      {children}
    </button>
  );
}

/** A small label over a control, inside a section. */
export function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      {children}
    </div>
  );
}

/** An underlined link that does something in the app. */
export function TextLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 self-start text-[12.5px] font-medium text-ink underline decoration-line-strong underline-offset-[3px] hover:decoration-ink">
      {children}
    </button>
  );
}

/** The footer pinned to a panel's bottom. */
export function PanelFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 border-t border-line bg-card px-4 py-3">{children}</div>;
}

/** A pill pair of icon buttons, one picked. */
export function IconSeg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; icon: React.ReactNode }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full bg-paper-deep p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-[26px] w-[38px] items-center justify-center rounded-full transition-colors duration-[200ms] [&_svg]:size-3.5 ${value === o.value ? "bg-ink text-paper" : "text-muted hover:text-ink"}`}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

/** The mono eyebrow over a panel's title. */
export function Eyebrow({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10.5px] tracking-[0.06em] text-muted uppercase">{children}</span>;
}
