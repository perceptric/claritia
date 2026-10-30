// Routing › Assignment's logic over the saved router body (src/lib/router/types.ts), kept apart from the screen so the
// tests can run it (tests/routingAssign.test.ts). The screen reads the body as cards and changes it with these edits;
// nothing reaches the server until Save, which saves and publishes in one step.
//
//   Round robin       rules off (or none): every lead goes to the fallback queue, the reps picked on it.
//   Assignment rules  each rule owns its own queue (the reps picked on the rule, by Round robin or Fewest meetings
//                     first); the Default rule is the fallback queue.
//   Shared teams      a body where several rules (or a rule and the fallback) share one queue shows that queue's reps
//                     on each; the queue is split only when someone changes the reps or method on one of them, so an
//                     untouched body comes back as it was.
//   Safeguards        Hold spam = spam.on. Known leads = account.on and keep.on (on when either is; a toggle sets
//                     both). Skip away or full reps = keep.whenOut not "keep" (an away owner's lead goes to their
//                     backup; queues always skip reps who are paused, away or at their limit). Alert when there is
//                     no availability = notify.noTimes.

import { condWords, ruleWords, type FieldDef } from "../../../lib/router/conditions.ts";
import type { Cond, Decision, Member, Method, Queue, Rule, RouterBody, StepResult, Then } from "../../../lib/router/types.ts";
import { moveRule, removeRule, ruleTitle, setRule } from "./editorModel.ts";

export type Mode = "rr" | "rules";
export type SafeKey = "spam" | "owner" | "skip" | "alert";
export type Safe = Record<SafeKey, boolean>;

export type RuleCard = {
  id: string;
  /** The name shown: the one someone gave it, else what it matches. */
  title: string;
  conds: Cond[];
  match: "all" | "any";
  then: Then;
  on: boolean;
  queue: string;
  reps: string[];
  method: Method;
  meet: string | null;
  /** Its queue is shared with another rule or the Default rule (split on the first change to its reps or method). */
  shared: boolean;
};

export type DefaultCard = { kind: "queue" | "user" | "none"; id: string | null; reps: string[]; method: Method; meet: string | null; shared: boolean };

export type AssignView = { mode: Mode; rules: RuleCard[]; def: DefaultCard; safe: Safe };

const thenOf = (r: Rule): Then => r.then ?? "queue";

/** A rule's name on screen: "Rule 2" as it was added, a name someone gave it, else what it matches. */
const titleOf = (r: Rule, fields: FieldDef[], b: RouterBody) => (/^Rule \d+$/.test(r.name) ? r.name : ruleTitle(r, fields, b.territories));
const queueOf = (b: RouterBody, id: string | null | undefined) => (id ? b.queues.find((q) => q.id === id) : undefined);

/** How many places send leads to a queue: rules (on or off) that use it as their queue, and the fallback. */
function usersOf(b: RouterBody, queue: string): number {
  return b.rules.list.filter((r) => thenOf(r) === "queue" && r.queue === queue).length + (b.fallback?.kind === "queue" && b.fallback.id === queue ? 1 : 0);
}

/** Round robin when the rules are off or there are none; Assignment rules otherwise. */
export const modeOf = (b: RouterBody): Mode => (b.rules.on && b.rules.list.length ? "rules" : "rr");

export function safeOf(b: RouterBody): Safe {
  return { spam: b.spam.on, owner: b.account.on || b.keep.on, skip: b.keep.whenOut !== "keep", alert: b.notify?.noTimes === true };
}

/** The body as the Assignment cards. Pure: the body isn't changed. */
export function viewOf(b: RouterBody, fields: FieldDef[]): AssignView {
  const rules = b.rules.list.map((r): RuleCard => {
    const q = queueOf(b, r.queue);
    return {
      id: r.id,
      title: titleOf(r, fields, b),
      conds: r.conds,
      match: r.match,
      then: thenOf(r),
      on: r.on !== false,
      queue: r.queue,
      reps: thenOf(r) === "queue" ? (q?.members.map((m) => m.user) ?? []) : [],
      method: q?.method ?? "rr",
      meet: r.meet ?? null,
      shared: !!q && usersOf(b, q.id) > 1,
    };
  });
  const fb = b.fallback;
  const fq = fb?.kind === "queue" ? queueOf(b, fb.id) : undefined;
  const def: DefaultCard = !fb
    ? { kind: "none", id: null, reps: [], method: "rr", meet: null, shared: false }
    : fb.kind === "user"
      ? { kind: "user", id: fb.id, reps: [fb.id], method: "rr", meet: fb.meet ?? null, shared: false }
      : { kind: "queue", id: fb.id, reps: fq?.members.map((m) => m.user) ?? [], method: fq?.method ?? "rr", meet: fb.meet ?? null, shared: !!fq && usersOf(b, fq.id) > 1 };
  return { mode: modeOf(b), rules, def, safe: safeOf(b) };
}

// Edits: each returns the same body when nothing changes, so a body nobody touched is never saved again. -----------

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A free queue id, from the rule's own id when it can be. */
function freeId(b: RouterBody, base: string): string {
  const ids = new Set(b.queues.map((q) => q.id));
  const stem = `q_${base}`.replace(/[^a-z0-9_-]/gi, "").slice(0, 36);
  if (!ids.has(stem)) return stem;
  for (let i = 2; ; i++) if (!ids.has(`${stem}_${i}`)) return `${stem}_${i}`;
}

/** The members for `reps`: those kept keep their weight and order, new ones join at the end. */
function membersFor(before: Member[], reps: string[]): Member[] {
  const want = new Set(reps);
  const kept = before.filter((m) => want.has(m.user));
  const have = new Set(kept.map((m) => m.user));
  return [...kept, ...reps.filter((u, i) => !have.has(u) && reps.indexOf(u) === i).map((user) => ({ user, weight: 1 }))];
}

/**
 * Give a rule a queue of its own: its queue when nothing else uses it, else a copy of it (or a new empty one) that
 * only this rule sends to. A queue left with nobody sending to it stays: a meeting type may host by it.
 */
function ownQueue(b: RouterBody, ruleId: string): { body: RouterBody; queue: Queue } {
  const r = b.rules.list.find((x) => x.id === ruleId)!;
  const q = thenOf(r) === "queue" ? queueOf(b, r.queue) : undefined;
  if (q && usersOf(b, q.id) === 1) return { body: b, queue: q };
  const own: Queue = { id: freeId(b, r.id), name: r.name.slice(0, 80) || "Rule", method: q?.method ?? "rr", strict: q?.strict ?? false, hoursOnly: q?.hoursOnly ?? false, members: q ? q.members.map((m) => ({ ...m })) : [] };
  const body = { ...b, queues: [...b.queues, own], rules: { ...b.rules, list: b.rules.list.map((x) => (x.id === ruleId ? { ...x, queue: own.id } : x)) } };
  return { body, queue: own };
}

/** The fallback's own queue: as for rules, and a fallback to one rep (or none) becomes a queue. */
function ownDefault(b: RouterBody): { body: RouterBody; queue: Queue } {
  const fb = b.fallback;
  const q = fb?.kind === "queue" ? queueOf(b, fb.id) : undefined;
  if (q && usersOf(b, q.id) === 1) return { body: b, queue: q };
  const members: Member[] = q ? q.members.map((m) => ({ ...m })) : fb?.kind === "user" ? [{ user: fb.id, weight: 1 }] : [];
  const own: Queue = { id: freeId(b, "default"), name: "Default rule", method: q?.method ?? "rr", strict: q?.strict ?? false, hoursOnly: q?.hoursOnly ?? false, members };
  return { body: { ...b, queues: [...b.queues, own], fallback: { kind: "queue", id: own.id, ...(fb?.meet ? { meet: fb.meet } : {}) } }, queue: own };
}

const withQueue = (b: RouterBody, q: Queue): RouterBody => ({ ...b, queues: b.queues.map((x) => (x.id === q.id ? q : x)) });

/** The reps a rule assigns to. Picking reps on a rule that held or went to the owner makes it assign to them. */
export function setRuleReps(b: RouterBody, ruleId: string, reps: string[]): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  if (!r) return b;
  const q = thenOf(r) === "queue" ? queueOf(b, r.queue) : undefined;
  if (q && sameList(q.members.map((m) => m.user), reps)) return b;
  const base = thenOf(r) === "queue" ? b : setRule(b, ruleId, { then: undefined });
  const own = ownQueue(base, ruleId);
  return withQueue(own.body, { ...own.queue, members: membersFor(own.queue.members, reps) });
}

export function setRuleMethod(b: RouterBody, ruleId: string, method: Method): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  if (!r || thenOf(r) !== "queue") return b;
  const q = queueOf(b, r.queue);
  if ((q?.method ?? "rr") === method && q) return b;
  const own = ownQueue(b, ruleId);
  return withQueue(own.body, { ...own.queue, method });
}

export function setDefaultReps(b: RouterBody, reps: string[]): RouterBody {
  const now = viewOf(b, []).def;
  if (now.kind !== "none" && sameList(now.reps, reps)) return b;
  const own = ownDefault(b);
  return withQueue(own.body, { ...own.queue, members: membersFor(own.queue.members, reps) });
}

export function setDefaultMethod(b: RouterBody, method: Method): RouterBody {
  const now = viewOf(b, []).def;
  if (now.kind === "queue" && now.method === method) return b;
  const own = ownDefault(b);
  return withQueue(own.body, { ...own.queue, method });
}

/** The meeting type a rule (or the Default rule, "default") offers; null is the form's own. */
export function setMeet(b: RouterBody, target: string, meet: string | null): RouterBody {
  if (target === "default") {
    const fb = b.fallback;
    if ((fb?.meet ?? null) === meet) return b;
    if (!fb) {
      const own = ownDefault(b);
      return setMeet(own.body, "default", meet);
    }
    const { meet: _drop, ...rest } = fb;
    void _drop;
    return { ...b, fallback: meet ? { ...rest, meet } : rest };
  }
  const r = b.rules.list.find((x) => x.id === target);
  if (!r || (r.meet ?? null) === meet) return b;
  return setRule(b, target, { meet: meet ?? undefined });
}

/** Round robin turns the rules off (they're kept); Assignment rules turns them on. */
export function setMode(b: RouterBody, mode: Mode): RouterBody {
  const on = mode === "rules";
  return b.rules.on === on ? b : { ...b, rules: { ...b.rules, on } };
}

/**
 * A new rule at the end: "Country is United States", booking the Default rule's meeting, with no reps yet, so it can't
 * go live until someone picks them.
 */
export function addRule(b: RouterBody, id: string): RouterBody {
  const names = new Set(b.rules.list.map((r) => r.name));
  let n = b.rules.list.length + 1;
  while (names.has(`Rule ${n}`)) n++;
  const meet = b.fallback?.meet;
  const rule: Rule = { id, name: `Rule ${n}`, match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "", ...(meet ? { meet } : {}) };
  return { ...b, rules: { on: true, list: [...b.rules.list, rule] } };
}

export const deleteRule = removeRule;
export { moveRule };

/** Hold for review, the owner, or back to reps (an empty pick, to fill). */
export function setThen(b: RouterBody, ruleId: string, then: Then): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  if (!r || thenOf(r) === then) return b;
  if (then === "queue") return setRule(b, ruleId, { then: undefined });
  return setRule(b, ruleId, then === "hold" ? { then, meet: undefined } : { then });
}

export function setCond(b: RouterBody, ruleId: string, i: number, c: Cond): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  if (!r || JSON.stringify(r.conds[i]) === JSON.stringify(c)) return b;
  return setRule(b, ruleId, { conds: r.conds.map((x, j) => (j === i ? c : x)) });
}

export function addCond(b: RouterBody, ruleId: string, c: Cond): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  return r && r.conds.length < 6 ? setRule(b, ruleId, { conds: [...r.conds, c] }) : b;
}

export function removeCond(b: RouterBody, ruleId: string, i: number): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  return r && r.conds.length > 1 ? setRule(b, ruleId, { conds: r.conds.filter((_, j) => j !== i) }) : b;
}

export function setMatch(b: RouterBody, ruleId: string, match: "all" | "any"): RouterBody {
  const r = b.rules.list.find((x) => x.id === ruleId);
  return !r || r.match === match ? b : setRule(b, ruleId, { match });
}

/** One safeguard on or off. "Known leads" sets both owner steps; "Skip" picks the away behaviour. */
export function setSafe(b: RouterBody, key: SafeKey, on: boolean): RouterBody {
  if (safeOf(b)[key] === on && !(key === "owner" && b.account.on !== b.keep.on)) return b;
  switch (key) {
    case "spam":
      return { ...b, spam: { ...b.spam, on } };
    case "owner":
      return { ...b, account: { ...b.account, on }, keep: { ...b.keep, on } };
    case "skip":
      return { ...b, keep: { ...b.keep, whenOut: on ? "backup" : "keep" } };
    case "alert":
      return { ...b, notify: { noTimes: on } };
  }
}

/** Whether the body on screen differs from the one saved (the live version, or nothing yet). */
export const changed = (b: RouterBody, saved: RouterBody | null) => !saved || JSON.stringify(b) !== JSON.stringify(saved);

// Action required ---------------------------------------------------------------------------------------------------

export type Issue = { key: string; title: string; line: string; open?: "reps" };

/** Reps who get leads but have no calendar, and rules with nobody to assign to. */
export function issuesOf(v: AssignView, o: { calendar: (user: string) => boolean; name: (user: string) => string }): Issue[] {
  const out: Issue[] = [];
  const live = v.mode === "rules" ? v.rules.filter((r) => r.on && r.then === "queue") : [];
  const used = [...new Set([...live.flatMap((r) => r.reps), ...v.def.reps])];
  for (const u of used) if (!o.calendar(u)) out.push({ key: `cal:${u}`, title: `${o.name(u)} has no calendar connected`, line: "Leads assigned to them can't book until they connect one", open: "reps" });
  for (const r of live) if (!r.reps.length) out.push({ key: `rule:${r.id}`, title: `${r.title} has no reps`, line: "Pick reps before saving" });
  if (!v.def.reps.length) out.push({ key: "rule:default", title: v.mode === "rules" ? "Default rule has no reps" : "Round robin has no reps", line: "Pick reps before saving" });
  return out;
}

/** The rule, as Assignment sees it, that took a tested lead: a rule's id, "default", or null (held, or kept by an owner). */
export function hitOf(d: Pick<Decision, "result" | "steps">): string | null {
  const r = d.result;
  const rules = d.steps.find((s): s is Extract<StepResult, { step: "rules" }> => s.step === "rules");
  if (r.kind === "held") return r.signals.includes("rule") && rules?.rule ? rules.rule.id : null;
  if (r.kind === "owner") {
    if (r.rule) return r.rule;
    return r.by === "fallback" ? "default" : null;
  }
  // No one free: the rule that matched, or the Default rule when none did.
  if (rules?.rule) return rules.rule.id;
  return d.steps.some((s) => s.step === "fallback") ? "default" : null;
}

const first = (name: string) => name.split(" ")[0] || name;

/** The one gray line under a tested lead: why it went there, in Assignment's words. */
export function whyOf(d: Pick<Decision, "result" | "steps">, o: { body: RouterBody; fields: FieldDef[]; name: (id: string) => string }): string {
  const r = d.result;
  const step = <K extends StepResult["step"]>(k: K) => d.steps.find((s): s is Extract<StepResult, { step: K }> => s.step === k);
  if (r.kind === "held") {
    const rules = step("rules");
    if (r.signals.includes("rule") && rules?.rule) return `Matches ${ruleName(o.body, rules.rule.id, rules.rule.name, o.fields)}, which holds leads for review`;
    return "Held for review as spam";
  }
  if (r.kind === "owner" && (r.by === "account" || r.by === "keep") && !r.rule) {
    const s = step(r.by);
    const owner = s && "owner" in s ? s.owner : undefined;
    if (s && "backup" in s && s.backup && owner) return `Known lead, assigned to their owner ${o.name(owner)}. ${first(o.name(owner))} is away, so the backup ${o.name(s.backup)} takes it`;
    return `Known lead, assigned to their owner ${o.name(r.user)}`;
  }
  const hit = hitOf(d);
  const mode = modeOf(o.body);
  if (hit && hit !== "default") {
    const rule = o.body.rules.list.find((x) => x.id === hit);
    const words = rule ? ruleWords(rule, o.fields, o.body.territories) : "";
    const name = ruleName(o.body, hit, rule?.name ?? "A rule", o.fields);
    if (r.kind === "owner" && r.by === "account") return `Matches ${name}, so it goes to their owner ${o.name(r.user)}`;
    if (r.kind === "owner") return words && words !== name ? `Matches ${name}: ${words}` : `Matches ${name}`;
    return `Matches ${name}, but no rep in it is available`;
  }
  if (mode === "rr") {
    const n = viewOf(o.body, o.fields).def.reps.length;
    if (r.kind === "owner") return `Round robin across ${n} ${n === 1 ? "rep" : "reps"}`;
    return n ? "Everyone in the rotation is away or at capacity" : "Round robin has no reps";
  }
  return r.kind === "owner" ? "No rule matches, so the Default rule applies" : "No rep on the Default rule is available";
}

const ruleName = (b: RouterBody, id: string, saved: string, fields: FieldDef[]) => {
  const r = b.rules.list.find((x) => x.id === id);
  return r ? titleOf(r, fields, b) : saved;
};

/** The meeting a routed lead books: its rule's, or the Default rule's when no rule fit; null is the form's own. */
export function bookedMeeting(body: Pick<RouterBody, "rules" | "fallback">, d: Pick<Decision, "result">): string | null {
  const r = d.result;
  if (r.kind !== "owner") return null;
  if (r.rule) return body.rules.list.find((x) => x.id === r.rule)?.meet ?? null;
  return r.by === "fallback" ? (body.fallback?.meet ?? null) : null;
}

// Samples for Routing preview ---------------------------------------------------------------------------------------

export type Sample = { key: string; label: string; line: string; email: string; changes: Record<string, unknown>; owner: string | null };

/** A value that makes a condition hold, for a sample lead; null when there's no good one. */
export function valueFor(c: Cond): unknown {
  const v = Array.isArray(c.value) ? c.value[0] : c.value;
  switch (c.op) {
    case "one_of":
    case "is":
    case "contains":
    case "starts_with":
    case "gte":
      return v === undefined || v === "" ? null : typeof v === "string" && v.startsWith("t:") ? null : v;
    case "gt":
      return typeof v === "number" ? v + 1 : v === undefined ? null : Number(v) + 1;
    case "lt":
      return typeof v === "number" ? Math.max(0, v - 1) : v === undefined ? null : Math.max(0, Number(v) - 1);
    case "between":
      return Array.isArray(c.value) ? c.value[0] : null;
    case "filled":
      return "Yes";
    default:
      return null;
  }
}

/**
 * Four sample leads made from the workspace's own setup, for a workspace with no leads yet: one for each of the first
 * two rules (it meets the rule's first condition), one who already has an owner (the first rep), and an obvious
 * spam address. The engine decides each one; these only say what the lead looks like.
 */
export function samplesFor(b: RouterBody, o: { fields: FieldDef[]; reps: { id: string; name: string }[] }): Sample[] {
  const people = [
    { email: "maya@globex.com", label: "Maya, Globex" },
    { email: "kai@tinyco.io", label: "Kai, TinyCo" },
    { email: "ana@initech.com", label: "Ana, Initech" },
  ];
  const out: Sample[] = [];
  const rules = modeOf(b) === "rules" ? b.rules.list.filter((r) => r.on !== false && r.conds.length) : [];
  for (const r of rules.slice(0, 2)) {
    const c = r.conds[0]!;
    const value = valueFor(c);
    if (value === null || value === undefined) continue;
    const p = people[out.length]!;
    const keys = c.field === "lead.country" || c.field === "contact.country" || c.field === "company.country" ? ["lead.country", "contact.country", "company.country"] : c.field === "company.size" || c.field === "company.employees" ? ["company.size", "company.employees"] : [c.field];
    const words = condWords(c, o.fields, b.territories);
    out.push({ key: `rule:${r.id}`, label: p.label, line: words.charAt(0).toUpperCase() + words.slice(1), email: p.email, changes: Object.fromEntries(keys.map((k) => [k, value])), owner: null });
  }
  while (out.length < 2) {
    const p = people[out.length]!;
    out.push({ key: `plain:${out.length}`, label: p.label, line: "New lead", email: p.email, changes: {}, owner: null });
  }
  const owner = o.reps[0];
  if (owner && safeOf(b).owner) out.push({ key: "owner", label: people[2]!.label, line: `Owner: ${first(owner.name)}`, email: people[2]!.email, changes: {}, owner: owner.id });
  else out.push({ key: "plain:2", label: people[2]!.label, line: "New lead", email: people[2]!.email, changes: {}, owner: null });
  out.push({ key: "spam", label: "test@mailinator.com", line: "Spam", email: "test@mailinator.com", changes: {}, owner: null });
  return out;
}

/** The reps each rep's rules, as Sales reps' Assignment column reads them. */
export function rulesByRep(v: AssignView): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const add = (u: string, name: string) => out.set(u, [...(out.get(u) ?? []), name]);
  if (v.mode === "rr") for (const u of v.def.reps) add(u, "Round robin");
  else {
    for (const r of v.rules) if (r.on && r.then === "queue") for (const u of r.reps) add(u, r.title);
    for (const u of v.def.reps) add(u, "Default rule");
  }
  return out;
}

// First-time setup --------------------------------------------------------------------------------------------------

/**
 * What "Turn on routing" saves: the reps on the Default rule (Round robin, or the rules after setup), the meeting
 * type it books, and the mode picked. Other parts of the body stay as they are.
 */
export function setupBody(b: RouterBody, o: { reps: string[]; mode: Mode; meet: string | null }): RouterBody {
  let out = setDefaultReps(b, o.reps);
  out = setMeet(out, "default", o.meet);
  if (o.mode === "rr") out = setMode(out, "rr");
  else out = { ...out, rules: { ...out.rules, on: true } };
  return out;
}

// Save ----------------------------------------------------------------------------------------------------------------

type Call = <T>(action: string, body: object) => Promise<T>;

/**
 * Save: the body as the draft (from the revision on screen, so a teammate's change in between is refused, not lost),
 * then published as a new version in the same step. A failed draft save publishes nothing; a body that didn't change
 * isn't sent at all.
 */
export async function saveAndPublish(call: Call, body: RouterBody, o: { revision: number; saved: RouterBody | null }): Promise<{ version: number } | null> {
  if (!changed(body, o.saved)) return null;
  await call<{ revision: number }>("save_draft", { body, revision: o.revision });
  return call<{ version: number }>("publish", { note: null });
}

/**
 * A Test a lead (or preview) answer as the screen shows it. A failed check (the facts read failed, the server said
 * no) is its error and nothing else: never an earlier answer or a guess.
 */
export function testResult<T>(r: { ok: true; out: { draft: T | null } } | { ok: false; error: string }): { out: T | null; error: string } {
  if (!r.ok) return { out: null, error: r.error === "Something went wrong." ? "Couldn't test this lead." : r.error };
  if (!r.out.draft) return { out: null, error: "Couldn't test this lead." };
  return { out: r.out.draft, error: "" };
}

/**
 * History's Rule column: the rule that took the lead (by its name now, else the name saved with the run), "Default
 * rule" (or "Round robin") for leads no rule matched, "Owner" for known leads, and "Spam" for held junk.
 */
export function ruleColumn(d: Pick<Decision, "result" | "steps">, o: { body: RouterBody | null; fields: FieldDef[] }): string {
  const r = d.result;
  const rules = d.steps.find((s): s is Extract<StepResult, { step: "rules" }> => s.step === "rules");
  const named = (id: string, saved: string) => {
    const x = o.body?.rules.list.find((y) => y.id === id);
    return x ? titleOf(x, o.fields, o.body!) : saved;
  };
  if (d.steps.some((s) => s.step === "sla") && r.kind === "owner" && r.by === "hand") return "Response time missed";
  if (r.kind === "held") return r.signals.includes("rule") && rules?.rule ? named(rules.rule.id, rules.rule.name) : "Spam";
  if (r.kind === "owner" && r.rule) return named(r.rule, rules?.rule?.name ?? "A rule");
  if (r.kind === "owner" && (r.by === "account" || r.by === "keep")) return "Owner";
  if (r.kind === "owner" && r.by === "hand") return "By hand";
  if (r.kind === "unassigned" && rules?.rule) return named(rules.rule.id, rules.rule.name);
  return o.body && modeOf(o.body) === "rr" ? "Round robin" : "Default rule";
}
