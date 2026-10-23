"use client";

// The Settings tab's parts (docs/form-studio.md Part 3): one card per section, small labels, big option cards, radio
// rows and the live link check, so every section reads the same.

import { Check } from "../../Icons";

export const AREA = "w-full rounded-sm border border-line-strong bg-card px-3 py-2 text-[13.5px] text-ink outline-none transition-shadow duration-[140ms] placeholder:text-faint focus:border-ink focus:ring-1 focus:ring-ink";

/** The app's Select, dressed like an input. Add a height. */
export const SEL = "w-full rounded-sm border border-line-strong bg-card px-3 text-[13px] text-ink outline-none transition-colors duration-[140ms] hover:border-ink focus-visible:border-ink focus-visible:ring-1 focus-visible:ring-ink";

/** A section of the tab: a title row and its body, as one card. */
export function Section({ id, title, aside, children }: { id: string; title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-8 rounded-2xl border border-line bg-card">
      <header className="flex min-h-14 items-center gap-3 px-6 pt-5">
        <h2 id={`${id}-title`} className="text-[15px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {aside ? <div className="ml-auto flex items-center gap-1.5">{aside}</div> : null}
      </header>
      <div className="flex flex-col gap-6 px-6 pt-3 pb-6">{children}</div>
    </section>
  );
}

/** A small label over a group: Geist 12px, medium, muted, sentence case. */
export function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
      {children}
    </label>
  ) : (
    <span className="text-[12px] font-medium text-muted">{children}</span>
  );
}

export function Group({ label, children, htmlFor }: { label: string; children: React.ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

/** A setting on one line: its label on the left, the control on the right. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-4">
      <span className="text-[13.5px] text-ink">{label}</span>
      {children}
    </div>
  );
}

/** A big pickable card: an icon or logo, a title, ink ring when picked. */
export function OptionCard({ picked, onPick, icon, title, compact = false }: { picked: boolean; onPick: () => void; icon: React.ReactNode; title: string; compact?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={picked}
      onClick={onPick}
      className={`press group relative flex text-left transition-[border-color,box-shadow,background-color] duration-[140ms] ${compact ? "h-11 items-center gap-2.5 rounded-lg px-3 text-[13px]" : "min-h-[104px] flex-col justify-between gap-6 rounded-lg p-4 text-[13.5px]"} border ${picked ? "border-ink bg-card ring-1 ring-ink" : "border-line bg-card hover:border-line-strong hover:bg-hover"}`}
    >
      <span className={`flex items-center justify-center ${compact ? "" : `size-9 rounded-full ${picked ? "bg-ink text-paper" : "bg-paper-deep text-ink"} transition-colors duration-[140ms]`}`}>{icon}</span>
      <span className={`font-medium ${picked ? "text-ink" : "text-body"}`}>{title}</span>
      {picked && !compact ? (
        <span className="anim-pop absolute top-3 right-3 flex size-5 items-center justify-center rounded-full bg-ink text-paper">
          <Check size={12} />
        </span>
      ) : null}
    </button>
  );
}

/** One choice of a radio group, with room under it for what that choice needs. */
export function RadioRow({ picked, onPick, label, children }: { picked: boolean; onPick: () => void; label: string; children?: React.ReactNode }) {
  return (
    <div className={`rounded-lg border transition-colors duration-[140ms] ${picked ? "border-line-strong bg-card" : "border-line bg-card hover:border-line-strong"}`}>
      <button type="button" role="radio" aria-checked={picked} onClick={onPick} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-[13.5px]">
        <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-[140ms] ${picked ? "border-ink bg-ink" : "border-line-strong"}`}>
          {picked ? <span className="size-1.5 rounded-full bg-paper" /> : null}
        </span>
        <span className={picked ? "font-medium text-ink" : "text-body"}>{label}</span>
      </button>
      {picked && children ? <div className="anim-rise-sm flex flex-col gap-3 px-4 pb-4 pl-11">{children}</div> : null}
    </div>
  );
}

/** An input with the link check on it: a green check when it works, the exact problem when it doesn't. */
export function LinkInput({ id, value, onChange, onBlur, problem, ok, placeholder = "https://", disabled, label }: { id?: string; value: string; onChange: (v: string) => void; onBlur?: (v: string) => void; problem: string | null; ok: boolean; placeholder?: string; disabled?: boolean; label?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="relative">
        <input
          id={id}
          value={value}
          disabled={disabled}
          aria-label={label}
          aria-invalid={!!problem}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onBlur?.(e.target.value)}
          placeholder={placeholder}
          className={`h-10 w-full rounded-sm border bg-card pr-9 pl-3 text-[13.5px] text-ink outline-none transition-shadow duration-[140ms] placeholder:text-faint focus:ring-1 disabled:opacity-55 ${problem ? "border-rose focus:border-rose focus:ring-rose" : "border-line-strong focus:border-ink focus:ring-ink"}`}
        />
        {ok ? (
          <span className="anim-pop pointer-events-none absolute top-1/2 right-2.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-sage-wash text-sage" aria-label="Works" role="img">
            <Check size={12} />
          </span>
        ) : null}
      </div>
      {problem ? <p className="text-[12px] text-rose">{problem}</p> : null}
    </div>
  );
}
