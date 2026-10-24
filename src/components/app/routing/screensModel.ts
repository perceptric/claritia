// The plain helpers behind Reps, Log and Held (docs/router-ux.md 4.7 to 4.10): a saved run as a Decision, its facts
// made safe to read, a rep's status in words, pause choices, meter words, and the Log's filters. No React, so the
// tests can run them (tests/routingScreens.test.ts).

import { SIGNAL_WORDS } from "../../../lib/router/spam.ts";
import { REASONS, type Decision, type Facts, type Reason, type RepFacts, type Result, type RouterBody, type SpamSignal, type StepResult } from "../../../lib/router/types.ts";

/** A row of router_runs as the screens read it. */
export type RunRow = {
  id: string;
  contact_id: string | null;
  key?: string;
  reason: Reason;
  version: number | null;
  kind: "owner" | "held" | "unassigned";
  owner: string | null;
  by: "account" | "keep" | "queue" | "fallback" | "hand" | null;
  queue_id: string | null;
  rule_id: string | null;
  steps: StepResult[] | null;
  facts: Partial<Facts> | null;
  ms: number | null;
  created_at: string;
  undone_at?: string | null;
};

const signalsOf = (steps: StepResult[]): SpamSignal[] => {
  const s = steps.find((x): x is Extract<StepResult, { step: "spam" }> => x.step === "spam");
  return s?.signals ?? [];
};

/** The run's result, built from the row's kind, owner, by, queue and rule (the steps hold the held signals). */
export function resultOf(r: Pick<RunRow, "kind" | "owner" | "by" | "queue_id" | "rule_id" | "steps">): Result {
  if (r.kind === "held") return { kind: "held", signals: signalsOf(r.steps ?? []) };
  if (r.kind === "unassigned" || !r.owner) return { kind: "unassigned" };
  return { kind: "owner", user: r.owner, by: r.by ?? "queue", ...(r.queue_id ? { queue: r.queue_id } : {}), ...(r.rule_id ? { rule: r.rule_id } : {}) };
}

export const decisionOf = (r: RunRow): Decision => ({ result: resultOf(r), steps: Array.isArray(r.steps) ? r.steps : [] });

const blankRep = (name: string): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: null });

/**
 * A run's facts, safe for explain(): runs assigned by hand keep no facts, and older runs may miss parts. Reps the
 * run names but its facts don't (the hand step's people) take their names from `names`.
 */
export function factsOf(r: Pick<RunRow, "facts" | "created_at" | "owner" | "steps">, names: Record<string, string> = {}): Facts {
  const f = (r.facts ?? {}) as Partial<Facts>;
  const reps: Record<string, RepFacts> = { ...(f.reps ?? {}) };
  const ids = new Set<string>();
  if (r.owner) ids.add(r.owner);
  for (const s of r.steps ?? []) if (s.step === "hand") [s.user, s.by_user].forEach((u) => u && ids.add(u));
  for (const id of ids) if (!reps[id] && names[id]) reps[id] = blankRep(names[id]);
  // A name changed since the run keeps the run's own name; a missing one takes today's.
  for (const [id, rep] of Object.entries(reps)) if (!rep?.name && names[id]) reps[id] = { ...rep, name: names[id] };
  return {
    now: typeof f.now === "number" ? f.now : Date.parse(r.created_at) || Date.now(),
    lead: { id: "", name: "", email: null, emailClass: null, domain: null, firstName: null, lastName: null, recent: 0, disposable: false, ...(f.lead ?? {}) },
    values: f.values ?? {},
    owner: f.owner ?? null,
    company: f.company ?? null,
    reps,
    counts: f.counts ?? {},
    lists: f.lists ?? { allow: [], block: [] },
  };
}

/** Where the lead came from: the form's name for form runs, else the reason's word. */
export function fromWords(r: Pick<RunRow, "reason" | "facts">, forms: Record<string, string> = {}): string {
  if (r.reason === "form") {
    const id = r.facts?.values?.["lead.form"];
    if (typeof id === "string" && forms[id]) return forms[id];
  }
  return REASONS[r.reason] ?? "API";
}

/** The lead as the Log shows it: name, email and domain from the run's facts. */
export function leadOf(r: Pick<RunRow, "facts">): { name: string; email: string; domain: string; company: string } {
  const l = r.facts?.lead;
  const email = l?.email ?? "";
  const domain = l?.domain ?? (email.includes("@") ? email.split("@").pop()! : "");
  return { name: l?.name || email || "A lead", email, domain, company: r.facts?.company?.name ?? "" };
}

/** "Routed by US mid-market", "Kept owner", "Matched Acme" for the contact page. */
export function routedBy(r: RunRow): string {
  const d = decisionOf(r);
  if (d.result.kind === "held") return "Held";
  if (d.result.kind === "unassigned") return "Unassigned";
  switch (d.result.by) {
    case "account": {
      const a = d.steps.find((s): s is Extract<StepResult, { step: "account" }> => s.step === "account");
      return `Matched ${a?.company?.name ?? "account"}`;
    }
    case "keep":
      return "Kept owner";
    case "fallback":
      return "Routed by fallback";
    case "hand":
      return "Assigned by hand";
    default: {
      const rule = d.steps.find((s): s is Extract<StepResult, { step: "rules" }> => s.step === "rules")?.rule;
      const q = d.steps.find((s): s is Extract<StepResult, { step: "queue" }> => s.step === "queue")?.queue;
      return `Routed by ${rule?.name ?? q?.name ?? "the router"}`;
    }
  }
}

/** The held run's signals as pill words. */
export const heldWords = (r: Pick<RunRow, "steps">): string[] => signalsOf(r.steps ?? []).map((s) => SIGNAL_WORDS[s]);

// Reps --------------------------------------------------------------------------------------------------------------

export type RepRow = { user_id: string; paused_until: string | null; out_dates: { from: string; to: string }[] | null; backup: string | null; cap_day: number | null; cap_week: number | null };

export type Status = { kind: "in" | "paused" | "out"; words: string; until: number | null };

/** "2026-10-24" in the browser's own day. */
export const localDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const short = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** "Oct 28–31", "Oct 30–Nov 2", "Oct 28". */
export function rangeWords(from: string, to: string): string {
  if (from === to) return short(from);
  const [a, b] = [short(from), short(to)];
  return a.split(" ")[0] === b.split(" ")[0] ? `${a}–${b.split(" ")[1]}` : `${a}–${b}`;
}

/** Postgres sends "infinity" for "until I turn it back on". */
export const pausedMs = (v: string | null | undefined): number | null => (!v ? null : v === "infinity" ? Infinity : Number.isNaN(Date.parse(v)) ? null : Date.parse(v));

/** A rep's status now from what's set on Reps: paused first, then hand-set out-of-office dates, else in. */
export function repStatus(r: Pick<RepRow, "paused_until" | "out_dates"> | null | undefined, now = Date.now()): Status {
  const p = pausedMs(r?.paused_until);
  if (p !== null && p > now) {
    if (p === Infinity) return { kind: "paused", words: "Paused", until: Infinity };
    const sameDay = localDate(p) === localDate(now);
    const days = (p - now) / 86_400_000;
    const when = sameDay
      ? new Date(p).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
      : days < 6
        ? new Date(p).toLocaleDateString("en-US", { weekday: "short" })
        : new Date(p).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { kind: "paused", words: `Paused · ${when}`, until: p };
  }
  const today = localDate(now);
  const out = (r?.out_dates ?? []).find((d) => d.from <= today && today <= d.to);
  if (out) return { kind: "out", words: `Out · ${rangeWords(out.from, out.to)}`, until: Date.parse(`${out.to}T23:59:59`) };
  return { kind: "in", words: "In", until: null };
}

export type PauseChoice = "hour" | "today" | "forever";

/** What to send as paused_until for a Pause choice. */
export function pauseUntil(choice: PauseChoice, now = Date.now()): string {
  if (choice === "forever") return "infinity";
  if (choice === "hour") return new Date(now + 3_600_000).toISOString();
  const d = new Date(now);
  d.setHours(23, 59, 59, 0);
  return d.toISOString();
}

/** A date picked for "Until a date": the end of that day, in the browser's zone. */
export const endOfDay = (iso: string) => new Date(`${iso}T23:59:59`).toISOString();

/** The start of the browser's day and week (Monday), for the Today and This week meters. */
export function dayStart(now = Date.now()): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function weekStart(now = Date.now()): number {
  const d = new Date(dayStart(now));
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/** "6/8", "2/—"; the fill as a share of the cap, 0 to 1. */
export function meter(n: number, cap: number | null): { words: string; fill: number; full: boolean } {
  return { words: `${n}/${cap ?? "—"}`, fill: cap ? Math.min(1, n / cap) : 0, full: !!cap && n >= cap };
}

/** A typed cap: a whole number from 1 to the max, or null for none. Anything else is undefined (not valid). */
export function parseCap(text: string, max: number): number | null | undefined {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= 1 && n <= max ? n : undefined;
}

/** The queues each rep is in, from the live body. */
export function queuesByRep(body: Pick<RouterBody, "queues"> | null): Map<string, { id: string; name: string }[]> {
  const out = new Map<string, { id: string; name: string }[]>();
  for (const q of body?.queues ?? []) for (const m of q.members) out.set(m.user, [...(out.get(m.user) ?? []), { id: q.id, name: q.name }]);
  return out;
}

export type Warning = "no_calendar" | "no_queue" | "no_hours";
export const WARNING_WORDS: Record<Warning, string> = { no_calendar: "No calendar connected", no_queue: "Not in any queue", no_hours: "No working hours" };

/** What's missing for a rep to take leads well. `hours`: their weekly hours, or null when none are set. */
export function repWarnings(o: { calendar: boolean; queues: number; hasRouter: boolean; hours: Record<string, unknown[]> | null }): Warning[] {
  const out: Warning[] = [];
  if (!o.calendar) out.push("no_calendar");
  if (o.hasRouter && !o.queues) out.push("no_queue");
  if (!o.hours || !Object.values(o.hours).some((d) => Array.isArray(d) && d.length)) out.push("no_hours");
  return out;
}

// Log ---------------------------------------------------------------------------------------------------------------

export type LogFilters = { owner: string; queue: string; rule: string; result: "" | "owner" | "held" | "unassigned"; reason: "" | Reason; version: string; days: "" | "1" | "7" | "30" };
export const NO_FILTERS: LogFilters = { owner: "", queue: "", rule: "", result: "", reason: "", version: "", days: "" };

/** Whether a run matches the search: name, email or domain, any case. */
export function matchesSearch(r: Pick<RunRow, "facts">, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  const l = leadOf(r);
  return [l.name, l.email, l.domain, l.company].some((x) => x.toLowerCase().includes(t));
}

/** Merge newer runs on top of a list, newest first, without repeats. */
export function mergeNewer(list: RunRow[], newer: RunRow[]): RunRow[] {
  const seen = new Set(list.map((r) => r.id));
  return [...newer.filter((r) => !seen.has(r.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)), ...list];
}

/** A domain from an email ("al@initech.io" → "initech.io"). */
export const domainOf = (email: string | null | undefined) => {
  const e = (email ?? "").trim().toLowerCase();
  return e.includes("@") ? e.split("@").pop()! : "";
};
