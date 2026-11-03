"use client";

// The small parts Reps, Meetings and Routing share (docs/unify-plan.md, Inbound): the page's column, the two-tone
// title, flat cards on a hairline, the amber note, the table cells, a person with a line under their name, and the
// app's own dropdown in its two looks (a field, and a word inside a sentence).

import { Warn } from "../../Icons";
import { Select, type Option } from "../Select";
import { PersonAvatar, type Person } from "../meetings/parts";

/** The working column: 980 px wide at most, centered, with the page's gaps. */
export function Column({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 pt-6 pb-14 md:px-7">{children}</div>;
}

/** A big title in two tones: black, then gray. */
export function Title({ children, gray }: { children: React.ReactNode; gray?: string }) {
  return (
    <h2 className="text-[22px] leading-tight font-semibold tracking-[-0.02em] text-ink">
      {children}
      {gray ? <span className="text-faint"> {gray}</span> : null}
    </h2>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[10px] border border-line bg-card ${className}`}>{children}</section>;
}

export function CardTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <header className="flex items-center gap-2.5 border-b border-line px-4 py-3">
      <h3 className="flex-1 text-[13px] font-semibold text-ink">{title}</h3>
      {children}
    </header>
  );
}

/** One line in a card: a bold label on the left, its control on the right. */
export function CardRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[52px] flex-wrap items-center gap-3 border-t border-line px-4 py-3 first:border-t-0">
      <span className="min-w-0 flex-1 font-medium text-ink">{label}</span>
      {children}
    </div>
  );
}

/** The amber note: something a person needs to do before leads can book. */
export function Alert({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="status" className="flex items-center gap-2.5 rounded-[10px] bg-butter-wash px-3 py-2.5 text-[12.5px] text-butter">
      <Warn size={14} />
      <span className="flex-1 font-medium">{children}</span>
      {action}
    </div>
  );
}

export const TH = "border-b border-line px-4 py-2 text-left text-[11.5px] font-medium whitespace-nowrap text-muted";
export const TD = "border-b border-line px-4 py-2.5 align-middle";

/** A person: their face, their name (with a word after it, like "You" or Next) and a gray line under it. */
export function Who({ person, name, after, line, size = 28 }: { person?: Person | null; name: string; after?: React.ReactNode; line?: React.ReactNode; size?: number }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <PersonAvatar person={person} label={name} size={size} />
      <span className="flex min-w-0 flex-col leading-[1.3]">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-ink">
          <span className="truncate">{name}</span>
          {after}
        </span>
        {line ? <span className="truncate text-[11.5px] text-muted">{line}</span> : null}
      </span>
    </span>
  );
}

/** The green "Next" tag on whoever gets the next lead. */
export const NextTag = () => <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-signal-soft px-[7px] text-[10.5px] font-semibold text-signal-text">Next</span>;

const LOOK = {
  field: "h-[30px] gap-1.5 rounded-sm border border-line-strong bg-card pr-1.5 pl-2.5 text-[13px] text-ink transition-colors duration-[140ms] hover:border-faint aria-expanded:border-ink disabled:opacity-60",
  word: "h-[26px] gap-1.5 rounded-sm border border-line-strong bg-paper pr-1.5 pl-2 text-[13px] font-medium text-ink transition-colors duration-[140ms] hover:border-faint aria-expanded:border-ink disabled:opacity-60",
} as const;

/**
 * The app's dropdown as these screens draw it: a field (`field`, the default) or a word inside a sentence (`word`).
 * The menu opens on the floating layer, so tables and cards never cut it off.
 */
export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  label,
  look = "field",
  shown,
  disabled,
  placeholder,
  width,
  menuWidth,
  align,
  className = "",
}: {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  label: string;
  look?: keyof typeof LOOK;
  shown?: React.ReactNode;
  disabled?: boolean;
  placeholder?: string;
  width?: number;
  menuWidth?: number;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span className="inline-flex" style={width ? { minWidth: width } : undefined}>
      <Select<T>
        value={value}
        options={options}
        onChange={onChange}
        ariaLabel={label}
        shown={shown}
        disabled={disabled}
        placeholder={placeholder}
        plainPlaceholder
        down
        menuWidth={menuWidth ?? 220}
        align={align}
        className={`${LOOK[look]} ${width ? "w-full" : ""} ${className}`}
      />
    </span>
  );
}
