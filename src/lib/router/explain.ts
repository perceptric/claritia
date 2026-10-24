// A run in plain sentences (docs/router.md Part 4). One function for every place a run is read: the Log, the Test
// panel, the contact page, Slack, email and MCP. `explain` returns parts with links for the screens; `plain` returns
// text. Old runs keep their own names in their facts and steps, so they read the same after the rules change.

import { BASE_FIELDS, condWords, type FieldDef } from "./conditions.ts";
import { SIGNAL_WORDS } from "./spam.ts";
import type { Decision, Facts, Method, StepResult, Territory, Why } from "./types.ts";

export type Part = string | { text: string; kind: "user" | "company" | "rule" | "queue"; id: string };

export type Line = {
  step: StepResult["step"];
  /** ✓ the step decided, ✗ it looked and passed the lead on, – it had nothing to do or was off. */
  mark: "ok" | "miss" | "skip";
  title: string;
  parts: Part[];
  /** More detail, shown folded: skipped rules, the other reps in the queue. */
  more?: Part[][];
};

const TITLES: Record<StepResult["step"], string> = { spam: "Spam check", account: "Match account", keep: "Keep owner", rules: "Rules", queue: "Queue", fallback: "Fallback", hand: "By hand" };
const METHOD_WORDS: Record<Method, string> = { rr: "round robin", weighted: "weighted", load: "by load" };

export function dateWords(ms: number, tz = "UTC", now = Date.now()): string {
  const days = (ms - now) / 86_400_000;
  const o: Intl.DateTimeFormatOptions = days < 6 ? { weekday: "long", timeZone: tz } : { month: "short", day: "numeric", timeZone: tz };
  try {
    return new Intl.DateTimeFormat("en-US", o).format(ms);
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

export function whyWords(why: Why | "none", until?: number | null, rep?: { capDay?: number | null; capWeek?: number | null; tz?: string }, now = Date.now()): string {
  switch (why) {
    case "not_member":
      return "is no longer in the workspace";
    case "paused":
      return until ? `is paused until ${dateWords(until, rep?.tz, now)}` : "is paused";
    case "out":
      return until ? `is out of office until ${dateWords(until, rep?.tz, now)}` : "is out of office";
    case "cap_day":
      return rep?.capDay ? `is at their daily cap of ${rep.capDay}` : "is at their daily cap";
    case "cap_week":
      return rep?.capWeek ? `is at their weekly cap of ${rep.capWeek}` : "is at their weekly cap";
    case "hours":
      return "is outside their working hours";
    default:
      return "can't take it";
  }
}

const ACTION_WORDS = { keep: "Kept anyway.", backup: "Backup:", route: "Routed on." } as const;

export function explain(d: Decision, f: Facts, o: { fields?: FieldDef[]; territories?: Territory[] } = {}): Line[] {
  const user = (id: string): Part => ({ text: f.reps[id]?.name || "Someone", kind: "user", id });
  const fields = o.fields ?? BASE_FIELDS;
  const territories = o.territories ?? [];
  return d.steps.map((s): Line => {
    const title = TITLES[s.step];
    switch (s.step) {
      case "spam": {
        if (s.off) return { step: s.step, mark: "skip", title, parts: ["Off."] };
        if (s.allowed) return { step: s.step, mark: "ok", title, parts: ["On the allow list."] };
        if (s.ok) return { step: s.step, mark: "ok", title, parts: [`Passed ${s.checks} ${s.checks === 1 ? "check" : "checks"}.`] };
        return { step: s.step, mark: "miss", title, parts: [`Held: ${s.signals.map((x) => SIGNAL_WORDS[x].toLowerCase()).join(", ")}.`] };
      }
      case "account": {
        if (s.off) return { step: s.step, mark: "skip", title, parts: ["Off."] };
        if (s.miss === "no_email") return { step: s.step, mark: "skip", title, parts: ["No email to match."] };
        if (s.miss === "free_mail") return { step: s.step, mark: "skip", title, parts: ["Personal email, no account to match."] };
        if (s.miss === "no_company") return { step: s.step, mark: "skip", title, parts: [`No company for ${f.lead.domain ?? "this domain"}.`] };
        const co: Part = { text: s.company?.name ?? "The company", kind: "company", id: s.company?.id ?? "" };
        const dom = s.company?.domain ? ` (${s.company.domain})` : "";
        if (s.miss === "no_owner") return { step: s.step, mark: "skip", title, parts: [co, `${dom} has no owner.`] };
        if (s.miss === "unmapped") return { step: s.step, mark: "skip", title, parts: [co, `${dom} is owned in the CRM by someone not linked to a teammate.`] };
        const via = s.via === "opp" ? [`'s open opportunity${s.opp ? ` "${s.opp}"` : ""} is owned by `] : [`${dom} is owned by `];
        const parts: Part[] = [co, ...via, user(s.owner!), "."];
        if (s.unavailable) {
          parts.push(" ", user(s.unavailable.user), ` ${whyWords(s.unavailable.why, s.unavailable.until, f.reps[s.unavailable.user], f.now)}.`);
          if (s.action) parts.push(` ${ACTION_WORDS[s.action]}`);
          if (s.backup) parts.push(" ", user(s.backup), ".");
          else if (s.action === "backup") parts.push(" No backup can take it. Routed on.");
        }
        return { step: s.step, mark: s.ok ? "ok" : "miss", title, parts };
      }
      case "keep": {
        if (s.off) return { step: s.step, mark: "skip", title, parts: ["Off."] };
        if (s.miss === "no_owner") return { step: s.step, mark: "skip", title, parts: [`${f.lead.name || "The lead"} had no owner.`] };
        if (s.miss === "unmapped") return { step: s.step, mark: "skip", title, parts: ["The CRM owner isn't linked to a teammate."] };
        const parts: Part[] = [`${f.lead.name || "The lead"} is owned by `, user(s.owner!), "."];
        if (s.unavailable) {
          parts.push(" ", user(s.unavailable.user), ` ${whyWords(s.unavailable.why, s.unavailable.until, f.reps[s.unavailable.user], f.now)}.`);
          if (s.action) parts.push(` ${ACTION_WORDS[s.action]}`);
          if (s.backup) parts.push(" ", user(s.backup), ".");
          else if (s.action === "backup") parts.push(" No backup can take it. Routed on.");
        }
        return { step: s.step, mark: s.ok ? "ok" : "miss", title, parts };
      }
      case "rules": {
        if (s.off) return { step: s.step, mark: "skip", title, parts: ["Off."] };
        const more = s.skipped.map((k): Part[] => [
          "Skipped ",
          { text: `"${k.name}"`, kind: "rule", id: k.id },
          k.failed ? `: ${condWords(k.failed.cond, fields, territories)} (it's ${k.failed.actual === null || k.failed.actual === undefined || k.failed.actual === "" ? "empty" : String(k.failed.actual)}).` : ": it has no conditions.",
        ]);
        if (!s.rule) return { step: s.step, mark: "miss", title, parts: [s.skipped.length ? "No rule matched." : "No rules."], ...(more.length ? { more } : {}) };
        return { step: s.step, mark: "ok", title, parts: [{ text: `"${s.rule.name}"`, kind: "rule", id: s.rule.id }, " matched."], ...(more.length ? { more } : {}) };
      }
      case "queue": {
        const q: Part = { text: s.queue.name, kind: "queue", id: s.queue.id };
        const unit = s.queue.method === "load" ? "meetings this week" : `of the last ${s.window}`;
        const more = s.others.map((x): Part[] => [user(x.user), x.why ? ` ${whyWords(x.why, x.until, f.reps[x.user], f.now)}.` : s.queue.method === "load" ? ` has ${x.n} meetings this week.` : ` had ${x.n}.`]);
        if (!s.picked) return { step: s.step, mark: "miss", title, parts: [q, `, ${METHOD_WORDS[s.queue.method]}. No one can take it.`], ...(more.length ? { more } : {}) };
        const had = s.queue.method === "load" ? ` has ${s.pickedN ?? 0} ${unit}.` : s.window === 0 ? " takes the queue's first lead." : ` had ${s.pickedN ?? 0} ${unit}.`;
        return { step: s.step, mark: "ok", title, parts: [q, `, ${METHOD_WORDS[s.queue.method]}. `, user(s.picked), had], ...(more.length ? { more } : {}) };
      }
      case "hand":
        return { step: s.step, mark: "ok", title, parts: s.by_user ? ["Assigned to ", user(s.user), " by ", user(s.by_user), "."] : ["Assigned to ", user(s.user), "."] };
      case "fallback": {
        if (s.why === "none") return { step: s.step, mark: "miss", title, parts: [s.queue ? "No one in the fallback can take it. Unassigned." : "No fallback set. Unassigned."] };
        if (s.picked) return { step: s.step, mark: "ok", title, parts: s.queue ? [{ text: s.queue.name, kind: "queue", id: s.queue.id }, ": ", user(s.picked), "."] : [user(s.picked), "."] };
        return { step: s.step, mark: "miss", title, parts: ["The fallback ", `${whyWords(s.why ?? "none", null, undefined, f.now)}. Unassigned.`] };
      }
    }
  });
}

export const partText = (p: Part) => (typeof p === "string" ? p : p.text);

/** A run as text, one line per step, for Slack, email, MCP and the timeline. */
export function plain(d: Decision, f: Facts, o: { fields?: FieldDef[]; territories?: Territory[] } = {}): string {
  return explain(d, f, o)
    .map((l) => [`${l.mark === "ok" ? "✓" : l.mark === "miss" ? "✗" : "–"} ${l.title}: ${l.parts.map(partText).join("")}`, ...(l.more ?? []).map((m) => `    ${m.map(partText).join("")}`)].join("\n"))
    .join("\n");
}

/** The result in a few words: "Lee Park", "Held", "Unassigned". */
export function resultWords(d: Pick<Decision, "result">, f: Pick<Facts, "reps">): string {
  if (d.result.kind === "held") return "Held";
  if (d.result.kind === "unassigned") return "Unassigned";
  return f.reps[d.result.user]?.name ?? "Someone";
}

/** The deciding step as a short phrase for the Log's Path column: "Matched Acme", "Rule: EMEA → round robin". */
export function pathWords(d: Decision): string {
  const r = d.result;
  if (r.kind === "held") return `Held: ${r.signals.map((s) => SIGNAL_WORDS[s].toLowerCase()).join(", ")}`;
  if (r.kind === "unassigned") return "No one could take it";
  if (r.by === "account") {
    const a = d.steps.find((s): s is Extract<StepResult, { step: "account" }> => s.step === "account");
    return `Matched ${a?.company?.name ?? "the account"}${a?.backup ? " (backup)" : ""}`;
  }
  if (r.by === "keep") return "Kept owner";
  if (r.by === "fallback") return "Fallback";
  if (r.by === "hand") return "By hand";
  const rule = d.steps.find((s): s is Extract<StepResult, { step: "rules" }> => s.step === "rules")?.rule;
  const q = d.steps.find((s): s is Extract<StepResult, { step: "queue" }> => s.step === "queue");
  return `Rule: ${rule?.name ?? "?"} → ${q ? METHOD_WORDS[q.queue.method] : "queue"}`;
}
