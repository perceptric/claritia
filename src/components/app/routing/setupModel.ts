// The plain helpers behind Routing's Rules and Teams tabs: where a tried lead stops on the five steps and why, in
// short numbered lines; the meeting it books; who gets a team's next leads (the engine's own pick, from the team's
// real turns and who is in today); and the "Get ready to take bookings" checks. No React, so the tests can run them
// (tests/inboundSetup.test.ts).

import { pickInQueue } from "../../../lib/router/engine.ts";
import { ruleWords, type FieldDef } from "../../../lib/router/conditions.ts";
import { SIGNAL_WORDS } from "../../../lib/router/spam.ts";
import type { Decision, Facts, Queue, RepFacts, RouterBody, StepResult } from "../../../lib/router/types.ts";

/** The five steps on the Rules tab, top to bottom. */
export type Stop = "spam" | "company" | "person" | "rule" | "fallback";
export const STOPS: Stop[] = ["spam", "company", "person", "rule", "fallback"];

type Step<K extends StepResult["step"]> = Extract<StepResult, { step: K }>;
const find = <K extends StepResult["step"]>(steps: StepResult[], k: K) => steps.find((s): s is Step<K> => s.step === k);

/**
 * The step a lead stops at, from the engine's decision: junk held at step 1, its company's or its own rep at 2 or 3,
 * a rule at 4 (a rule that holds or sends to the company's rep stops there too), else step 5. A rule whose team had
 * nobody free goes on to step 5, like the engine.
 */
export function stopOf(d: Pick<Decision, "result" | "steps">): { stop: Stop; rule: string | null } {
  const r = d.result;
  const rules = find(d.steps, "rules");
  if (r.kind === "held") return r.signals.includes("rule") && rules?.rule ? { stop: "rule", rule: rules.rule.id } : { stop: "spam", rule: null };
  if (r.kind === "owner") {
    if (r.rule) return { stop: "rule", rule: r.rule };
    if (r.by === "account") return { stop: "company", rule: null };
    if (r.by === "keep") return { stop: "person", rule: null };
  }
  return { stop: "fallback", rule: null };
}

/** The meeting a routed lead books: its rule's, or the fallback's when no rule fit; null is the form's own. */
export function bookedMeeting(body: Pick<RouterBody, "rules" | "fallback">, d: Pick<Decision, "result">): string | null {
  const r = d.result;
  if (r.kind !== "owner") return null;
  if (r.rule) return body.rules.list.find((x) => x.id === r.rule)?.meet ?? null;
  return r.by === "fallback" ? (body.fallback?.meet ?? null) : null;
}

/** The team a routed lead went through, if any. */
export function teamOfResult(body: Pick<RouterBody, "queues">, d: Pick<Decision, "result">): Queue | null {
  return d.result.kind === "owner" && d.result.queue ? (body.queues.find((q) => q.id === (d.result as { queue?: string }).queue) ?? null) : null;
}

const first = (name: string) => name.split(" ")[0] || name;

/** Why the lead went where it did, one short line per step it passed through. */
export function whyLines(d: Pick<Decision, "result" | "steps">, o: { body: Pick<RouterBody, "rules" | "queues" | "territories">; fields: FieldDef[]; name: (id: string) => string }): string[] {
  const out: string[] = [];
  const name = o.name;
  for (const s of d.steps) {
    switch (s.step) {
      case "spam":
        if (s.off) break;
        if (!s.ok) out.push(`Looks like junk (${s.signals.map((x) => SIGNAL_WORDS[x].toLowerCase()).join(", ")}), so it waits for you to review`);
        else out.push("Passed the spam check");
        break;
      case "account":
      case "keep": {
        if (s.off) break;
        const who = s.step === "account" ? "Their company" : "They";
        if (s.ok && s.owner) {
          out.push(`${who} already ${s.step === "account" ? "works" : "work"} with ${name(s.owner)}`);
          if (s.backup) out.push(`${first(name(s.owner))} is away, so their backup ${name(s.backup)} takes it`);
        } else if (s.unavailable) out.push(`${who} ${s.step === "account" ? "works" : "work"} with ${name(s.unavailable.user)}, who can't take it now`);
        else if (s.step === "account" && s.miss === "free_mail") out.push("It's a personal email, so there's no company to match");
        else out.push(s.step === "account" ? "Their company has no rep yet" : "They have no rep yet");
        break;
      }
      case "rules": {
        if (s.off || !s.rule) break;
        const rule = o.body.rules.list.find((r) => r.id === s.rule!.id);
        const words = rule ? ruleWords(rule, o.fields, o.body.territories) : s.rule.name;
        if (s.rule.then === "hold") out.push(`${words}, so it waits for you to review`);
        else if (s.rule.then === "owner") out.push(s.ok && s.owner ? `${words}, so it goes to their company's rep, ${name(s.owner)}` : `${words}, but their company's rep can't take it`);
        else {
          const q = o.body.queues.find((x) => x.id === s.rule!.queue);
          out.push(`${words}, so they go to the ${q?.name ?? "team"}`);
        }
        break;
      }
      case "queue":
        out.push(s.picked ? `${name(s.picked)} ${s.queue.method === "load" ? "has the fewest meetings this week" : "is next in line"}` : `Nobody in the ${s.queue.name} can take it right now`);
        break;
      case "fallback":
        if (s.queue) {
          out.push(`No rule fits, so they go to the ${s.queue.name}`);
          if (s.picked) out.push(`${name(s.picked)} is next in line`);
          else out.push(`Nobody in the ${s.queue.name} can take it right now`);
        } else if (s.picked) out.push(`No rule fits, so it goes to ${name(s.picked)}`);
        else if (s.why === "none") out.push("No rule fits, and there's nowhere to send it");
        else out.push("No rule fits, and the rep it goes to can't take it now");
        break;
      default:
        break;
    }
  }
  return out;
}

/** A rep as a team's preview sees them now: paused, away, today's leads against their daily limit. */
export type RepNow = { pausedUntil: number | null; outUntil: number | null; capDay: number | null; today: number; meetingsWeek?: number };

/**
 * Who the team's next `n` leads go to, by the engine's own pick: each member's leads from this team in 30 days (the
 * team's real turns) or, for "Fewest meetings first", their meetings this week; who is paused or away now; and daily
 * limits as today's leads fill them. Each lead counts as one more lead and one more meeting. Nothing is written.
 */
export function nextLeads(q: Queue, o: { turns?: Map<string, number>; reps: Map<string, RepNow>; now: number }, n = 5): string[] {
  const reps: Record<string, RepFacts> = {};
  for (const m of q.members) {
    const r = o.reps.get(m.user);
    reps[m.user] = { name: m.user, member: true, tz: "UTC", pausedUntil: r?.pausedUntil ?? null, outUntil: r?.outUntil ?? null, backup: null, capDay: r?.capDay ?? null, capWeek: null, today: r?.today ?? 0, week: 0, meetingsWeek: r?.meetingsWeek ?? 0, inHours: null };
  }
  const counts: Facts["counts"] = { [q.id]: Object.fromEntries(q.members.map((m, i) => [m.user, { n: o.turns?.get(m.user) ?? 0, last: i }])) };
  const out: string[] = [];
  for (let i = 0; i < Math.min(n, 50); i++) {
    const f: Facts = { now: o.now, lead: { id: "", name: "", email: null, emailClass: null, domain: null, firstName: null, lastName: null, recent: 0, disposable: false }, values: {}, owner: null, company: null, reps, counts, lists: { allow: [], block: [] } };
    const p = pickInQueue({ ...q, hoursOnly: false }, f);
    if (!p.picked) break;
    const u = p.picked.user;
    out.push(u);
    const c = counts[q.id]![u] ?? { n: 0, last: 0 };
    counts[q.id]![u] = { n: c.n + 1, last: q.members.length + i + 1 };
    reps[u] = { ...reps[u]!, today: reps[u]!.today + 1, meetingsWeek: reps[u]!.meetingsWeek + 1 };
  }
  return out;
}

/** "Get ready to take bookings": the four checks, each done or not, with its gray line. */
export function readyChecks(o: { noCalendar: string[]; meetings: number; body: Pick<RouterBody, "queues">; live: boolean; draft: boolean }) {
  const n = o.noCalendar.length;
  const teams = o.body.queues;
  return [
    { key: "reps", title: "Connect each rep's calendar", line: n ? `${o.noCalendar.map(first).join(", ")} still ${n === 1 ? "needs" : "need"} to connect` : "Everyone is connected", ok: !n },
    { key: "meet", title: "Make a meeting people can book", line: `${o.meetings} ${o.meetings === 1 ? "meeting" : "meetings"}`, ok: o.meetings > 0 },
    { key: "team", title: "Put your reps in a team", line: `${teams.length} ${teams.length === 1 ? "team" : "teams"}`, ok: teams.length > 0 && teams.every((q) => q.members.length > 0) },
    { key: "pub", title: "Publish your routing", line: o.live && !o.draft ? "Live" : "Your changes aren't live yet", ok: o.live && !o.draft },
  ] as const;
}

/**
 * History's "Because": the step that decided, in the Rules tab's own words. A rule reads as its conditions (from the
 * live version when it's still there, else the name saved with the run).
 */
export function becauseWords(d: Pick<Decision, "result" | "steps">, o: { body: Pick<RouterBody, "rules" | "territories"> | null; fields: FieldDef[] }): string {
  const r = d.result;
  const rules = find(d.steps, "rules");
  const rule = () => {
    const live = rules?.rule ? o.body?.rules.list.find((x) => x.id === rules.rule!.id) : undefined;
    return live ? ruleWords(live, o.fields, o.body!.territories) : (rules?.rule?.name ?? "A rule");
  };
  if (d.steps.some((s) => s.step === "sla") && r.kind === "owner" && r.by === "hand") return "Response time missed";
  if (r.kind === "held") return r.signals.includes("rule") ? rule() : "Stop junk";
  if (r.kind === "unassigned") return "Nobody could take it";
  if (r.rule) return rule();
  if (r.by === "account") return "Same company, same rep";
  if (r.by === "keep") return "Returning lead, same rep";
  if (r.by === "hand") return "Given by hand";
  return "When no rule fits";
}
