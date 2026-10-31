"use client";

// The small parts the Policies, Teams and Activity screens share, drawn as the approved Routing demo draws them: a
// numbered card with a plain label, a row with a label and a gray line under it, the pickers for a destination and a
// person, pill switches for a list's views, and the drawer (the app's Sheet at the demo's width).

import { Badge, type Tone } from "../../ui";
import { Choice } from "../../inbound/parts";
import type { Option } from "../../Select";
import { destFrom, destName, destValue, type Dest, type Names } from "@/lib/routing/screenModel";
import type { Person, Team } from "./api";

/** One of the editor's sections: a number, a plain label, and what's on its right. */
export function Sec({ n, label, aside, children }: { n?: number | string; label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-[10px] border border-line bg-card text-[13px]">
      <header className="flex min-h-[50px] items-center gap-2.5 border-b border-line px-4 py-2.5">
        {n !== undefined ? <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-paper-deep text-[11px] font-semibold text-body">{n}</span> : null}
        <h2 className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink">{label}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** A setting's row: its label, a gray line under it, and its control. */
export function Row({ label, line, children, className = "" }: { label: React.ReactNode; line?: React.ReactNode; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0 ${className}`}>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{label}</div>
        {line ? <div className="text-[12px] text-muted">{line}</div> : null}
      </div>
      {children}
    </div>
  );
}

export const tone = (t: "gray" | "green" | "amber" | "red"): Tone => t;

export function State({ label, t }: { label: string; t: "gray" | "green" | "amber" | "red" }) {
  return (
    <Badge tone={t} dot>
      {label}
    </Badge>
  );
}

export const namesOf = (people: Person[], teams: Team[]): Names => ({
  people: Object.fromEntries(people.map((p) => [p.id, p.name])),
  teams: Object.fromEntries(teams.flatMap((t) => t.keys.map((k) => [k, t.name]))),
});

/** A team's key: the first id rules use for it. */
export const keyOf = (t: Team) => t.keys[0] ?? "";

/** Pick a destination: a team, a person, or (where it's allowed) manual review. */
export function DestChoice({ value, onChange, people, teams, names, review, reviewer, label, align }: { value: Dest; onChange: (d: Dest) => void; people: Person[]; teams: Team[]; names: Names; review: boolean; reviewer: string | null; label: string; align?: "left" | "right" }) {
  const options: Option<string>[] = [
    ...teams.filter((t) => t.keys.length).map((t) => ({ value: `t:${keyOf(t)}`, label: t.name, hint: `${t.members.length} ${t.members.length === 1 ? "member" : "members"} · round robin`, group: "Teams" })),
    ...people.map((p) => ({ value: `p:${p.id}`, label: p.name, group: "People" })),
    ...(review ? [{ value: "review", label: "Manual review", hint: reviewer ? `Monitored by ${names.people[reviewer] ?? "the reviewer"}` : undefined, group: " " }] : []),
  ];
  const v = destValue(value);
  // A team named by a key other than its first still shows as chosen.
  const shown = value?.kind === "team" ? (teams.find((t) => t.keys.includes(value.key)) ? `t:${keyOf(teams.find((t) => t.keys.includes(value.key))!)}` : v) : v;
  return <Choice<string> label={label} value={shown} placeholder="Select" options={options} onChange={(x) => onChange(destFrom(x))} shown={value ? destName(value, names) : undefined} align={align} menuWidth={260} />;
}

export function PersonChoice({ value, onChange, people, label, none, align, full }: { value: string | null; onChange: (id: string | null) => void; people: Person[]; label: string; none?: string; align?: "left" | "right"; full?: boolean }) {
  return (
    <Choice<string>
      label={label}
      value={value ?? ""}
      placeholder="Select"
      align={align}
      {...(full ? { width: 10, className: "justify-between" } : {})}
      options={[...(none ? [{ value: "", label: none }] : []), ...people.map((p) => ({ value: p.id, label: p.name }))]}
      onChange={(v) => onChange(v || null)}
    />
  );
}

/** A list's views as pills: the current one solid black (the demo's All runs / Needs review / Errors, the team pills). */
export function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string; count?: number }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`press inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-[120ms] ${o.value === value ? "bg-ink text-paper" : "border border-line-strong bg-card text-ink hover:bg-hover"}`}
        >
          {o.label}
          {o.count !== undefined ? <span className="opacity-60 tabular-nums">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** A person's initials in a round chip, for tables and the result cards. */
export function Initials({ name, size = 26 }: { name: string; size?: number }) {
  const t =
    name
      .replace(/@.*/, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?";
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-ink font-semibold text-paper" style={{ width: size, height: size, fontSize: Math.max(9, size * 0.38) }} aria-hidden="true">
      {t}
    </span>
  );
}

export const when = (iso: string | null | undefined): string => {
  if (!iso) return "No runs";
  const ms = Date.now() - Date.parse(iso);
  if (ms < 60_000) return "Just now";
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min ago`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)} h ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });

/** "Tue 10:00" in a zone. */
export function slotWords(ms: number, tz: string | null): string {
  const o: Intl.DateTimeFormatOptions = { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, ...(tz ? { timeZone: tz } : {}) };
  try {
    return new Intl.DateTimeFormat("en-US", o).format(new Date(ms)).replace(",", "");
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}
