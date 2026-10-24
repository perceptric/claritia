// The Router editor's logic, kept apart from the screens so it can be tested (docs/router-ux.md 4.2 and 7.2): the undo
// reducer, the body edits the inspector makes, condition values that follow their test, the flow's 7-day counts, the
// Finish setup list, and which cards a test lead's path lights up.

import { opsFor, needsValue, type FieldDef, type FieldType } from "../../../lib/router/conditions.ts";
import type { Problem } from "../../../lib/router/check.ts";
import type { Line } from "../../../lib/router/explain.ts";
import type { Cond, Op, Queue, Rule, RouterBody } from "../../../lib/router/types.ts";

// Undo ------------------------------------------------------------------------------------------------------------

export type EditorState = {
  body: RouterBody;
  past: RouterBody[];
  future: RouterBody[];
  /** The last edit's merge key and time: typing in one box within a second is one undo step. */
  merge: { key: string; at: number } | null;
  /** Counts every change, so autosave and the test panel know when the body moved. */
  n: number;
};

export type EditorAction =
  | { type: "edit"; edit: (b: RouterBody) => RouterBody; key?: string; at: number }
  | { type: "undo" }
  | { type: "redo" }
  /** A body from outside (load theirs, start over): the history starts again. */
  | { type: "reset"; body: RouterBody };

export const startEditor = (body: RouterBody): EditorState => ({ body, past: [], future: [], merge: null, n: 0 });

const LIMIT = 100;

export function editorReducer(s: EditorState, a: EditorAction): EditorState {
  switch (a.type) {
    case "edit": {
      const next = a.edit(s.body);
      if (next === s.body || JSON.stringify(next) === JSON.stringify(s.body)) return s;
      const joins = !!a.key && s.merge?.key === a.key && a.at - s.merge.at < 1000;
      return {
        body: next,
        past: joins ? s.past : [...s.past.slice(-(LIMIT - 1)), s.body],
        future: [],
        merge: a.key ? { key: a.key, at: a.at } : null,
        n: s.n + 1,
      };
    }
    case "undo": {
      if (!s.past.length) return s;
      return { body: s.past[s.past.length - 1]!, past: s.past.slice(0, -1), future: [s.body, ...s.future], merge: null, n: s.n + 1 };
    }
    case "redo": {
      if (!s.future.length) return s;
      return { body: s.future[0]!, past: [...s.past, s.body], future: s.future.slice(1), merge: null, n: s.n + 1 };
    }
    case "reset":
      return { ...startEditor(a.body), n: s.n + 1 };
  }
}

// Body edits ------------------------------------------------------------------------------------------------------

export function setRule(b: RouterBody, id: string, patch: Partial<Rule>): RouterBody {
  return { ...b, rules: { ...b.rules, list: b.rules.list.map((r) => (r.id === id ? { ...r, ...patch } : r)) } };
}

export function setQueue(b: RouterBody, id: string, patch: Partial<Queue>): RouterBody {
  return { ...b, queues: b.queues.map((q) => (q.id === id ? { ...q, ...patch } : q)) };
}

/** A new rule at the end, named "Rule N" with a free number, sending to `queue` when given. */
export function addRule(b: RouterBody, id: string, queue = ""): RouterBody {
  const names = new Set(b.rules.list.map((r) => r.name));
  let i = b.rules.list.length + 1;
  while (names.has(`Rule ${i}`)) i++;
  return { ...b, rules: { ...b.rules, list: [...b.rules.list, { id, name: `Rule ${i}`, match: "all", conds: [], queue }] } };
}

export function removeRule(b: RouterBody, id: string): RouterBody {
  return { ...b, rules: { ...b.rules, list: b.rules.list.filter((r) => r.id !== id) } };
}

/** Move a rule to an index (drag), clamped to the list. */
export function moveRuleTo(b: RouterBody, id: string, index: number): RouterBody {
  const list = [...b.rules.list];
  const from = list.findIndex((r) => r.id === id);
  if (from < 0) return b;
  const to = Math.max(0, Math.min(list.length - 1, index));
  if (to === from) return b;
  const [r] = list.splice(from, 1);
  list.splice(to, 0, r!);
  return { ...b, rules: { ...b.rules, list } };
}

/** Move up (-1) or down (1): the keyboard twin of dragging. */
export const moveRule = (b: RouterBody, id: string, dir: -1 | 1) => moveRuleTo(b, id, b.rules.list.findIndex((r) => r.id === id) + dir);

/** A new empty queue; the name gets a number when it's taken. */
export function addQueue(b: RouterBody, id: string, name = "New queue"): RouterBody {
  const names = new Set(b.queues.map((q) => q.name));
  let n = name;
  for (let i = 2; names.has(n); i++) n = `${name} ${i}`;
  return { ...b, queues: [...b.queues, { id, name: n, method: "rr", strict: false, hoursOnly: false, members: [] }] };
}

/** A queue goes; rules that sent to it send nowhere (a problem to fix) and a fallback to it is cleared. */
export function removeQueue(b: RouterBody, id: string): RouterBody {
  return {
    ...b,
    queues: b.queues.filter((q) => q.id !== id),
    rules: { ...b.rules, list: b.rules.list.map((r) => (r.queue === id ? { ...r, queue: "" } : r)) },
    fallback: b.fallback?.kind === "queue" && b.fallback.id === id ? null : b.fallback,
  };
}

export function addMember(b: RouterBody, queue: string, user: string): RouterBody {
  const q = b.queues.find((x) => x.id === queue);
  if (!q || q.members.some((m) => m.user === user)) return b;
  return setQueue(b, queue, { members: [...q.members, { user, weight: 1 }] });
}

export function removeMember(b: RouterBody, queue: string, user: string): RouterBody {
  const q = b.queues.find((x) => x.id === queue);
  return q ? setQueue(b, queue, { members: q.members.filter((m) => m.user !== user) }) : b;
}

export function setWeight(b: RouterBody, queue: string, user: string, weight: number): RouterBody {
  const q = b.queues.find((x) => x.id === queue);
  const w = Math.min(10, Math.max(1, Math.round(weight)));
  return q ? setQueue(b, queue, { members: q.members.map((m) => (m.user === user ? { ...m, weight: w } : m)) }) : b;
}

// Conditions ------------------------------------------------------------------------------------------------------

const LISTS: Op[] = ["one_of", "not_one_of"];

/** A new condition on a field: its first test and an empty value of the right shape. */
export function newCond(f: FieldDef): Cond {
  const op = opsFor(f.type)[0]!;
  return withOp({ field: f.key, op }, op, f.type);
}

/** The value kept when the test changes: a list for "is one of", nothing for "is filled", a pair for "between". */
export function withOp(c: Cond, op: Op, type: FieldType): Cond {
  if (!needsValue(op)) return { field: c.field, op };
  const list = Array.isArray(c.value) ? c.value : c.value === undefined || c.value === "" ? [] : [c.value];
  if (op === "between") return { field: c.field, op, value: c.op === "between" ? list : [] };
  if (LISTS.includes(op)) return { field: c.field, op, value: c.op === "between" ? [] : list.map(String) };
  if (type === "bool") return { field: c.field, op, value: typeof list[0] === "string" ? list[0] : "true" };
  const first = c.op === "between" ? undefined : list[0];
  if (type === "number") return first === undefined || first === "" || !Number.isFinite(Number(first)) ? { field: c.field, op } : { field: c.field, op, value: Number(first) };
  return first === undefined ? { field: c.field, op, value: "" } : { field: c.field, op, value: String(first) };
}

/** Changing a condition's field keeps the test when the new field allows it, else takes the first that fits. */
export function withField(c: Cond, f: FieldDef, before: FieldDef | undefined): Cond {
  if (before && before.type === f.type && opsFor(f.type).includes(c.op)) return { ...c, field: f.key };
  return newCond(f);
}

/** Paste-friendly list input: commas, semicolons, spaces and new lines all split. */
export const splitList = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);

// The flow --------------------------------------------------------------------------------------------------------

export type Stats = { total: number; held: number; unassigned: number; by: Record<string, number>; rules: Record<string, number>; queues: Record<string, number> };

export type FlowCounts = {
  total: number;
  /** Leads that went on past each step, and the ones that branched off at it. */
  afterSpam: number;
  held: number;
  afterAccount: number;
  matched: number;
  afterKeep: number;
  kept: number;
  rules: Record<string, number>;
  noRule: number;
  fallback: number;
};

/** The 7-day counts on the flow's lines, from `router_stats`. A step that's off passes everyone on. */
export function flowCounts(stats: Partial<Stats> | null | undefined, b: RouterBody): FlowCounts {
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
  const by = stats?.by ?? {};
  const total = n(stats?.total);
  const held = b.spam.on ? Math.min(total, n(stats?.held)) : 0;
  const afterSpam = total - held;
  const matched = b.account.on ? Math.min(afterSpam, n(by.account)) : 0;
  const afterAccount = afterSpam - matched;
  const kept = b.keep.on ? Math.min(afterAccount, n(by.keep)) : 0;
  const afterKeep = afterAccount - kept;
  const rules: Record<string, number> = {};
  let used = 0;
  for (const r of b.rules.on ? b.rules.list : []) {
    rules[r.id] = n(stats?.rules?.[r.id]);
    used += rules[r.id]!;
  }
  return { total, afterSpam, held, afterAccount, matched, afterKeep, kept, rules, noRule: Math.max(0, afterKeep - used), fallback: n(by.fallback) + n(stats?.unassigned) };
}

/** What the inspector shows. */
export type Selection = { kind: "spam" | "account" | "keep" | "rules" | "fallback" } | { kind: "rule" | "queue"; id: string };

export const sameSelection = (a: Selection | null, b: Selection | null) => !!a && !!b && a.kind === b.kind && ("id" in a ? a.id : "") === ("id" in b ? b.id : "");

/** The card a problem belongs to. */
export const selectionOf = (p: Problem): Selection => (p.where.kind === "rule" || p.where.kind === "queue" ? { kind: p.where.kind, id: p.where.id ?? "" } : { kind: p.where.kind });

/** Finish setup: each open problem as something to do. "EMEA has no reps" reads "Add reps to EMEA". */
export function setupItems(ps: Problem[]): { text: string; at: Selection }[] {
  const seen = new Set<string>();
  const out: { text: string; at: Selection }[] = [];
  for (const p of ps) {
    const m = p.text.match(/^(.*) has no reps$/);
    const text = m ? `Add reps to ${m[1]}` : p.text;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push({ text, at: selectionOf(p) });
  }
  return out;
}

export type Mark = Line["mark"];
export type FlowStep = "spam" | "account" | "keep" | "rules" | "fallback";

/**
 * Which cards a test lead's path lights up: each step's mark, the rule that matched, and the steps it reached. The
 * queue's line counts toward the Rules card (the queue is where its rule sends).
 */
export function pathOf(lines: Line[] | null | undefined): { marks: Partial<Record<FlowStep, Mark>>; reached: Set<FlowStep>; rule: string | null; queue: string | null } {
  const marks: Partial<Record<FlowStep, Mark>> = {};
  const reached = new Set<FlowStep>();
  let rule: string | null = null;
  let queue: string | null = null;
  for (const l of lines ?? []) {
    if (l.step === "queue") {
      const q = l.parts.find((p) => typeof p !== "string" && p.kind === "queue");
      queue = q && typeof q !== "string" ? q.id : null;
      if (marks.rules === "ok" && l.mark !== "ok") marks.rules = "miss";
      continue;
    }
    if (l.step === "hand") continue;
    marks[l.step] = l.mark;
    reached.add(l.step);
    if (l.step === "rules" && l.mark === "ok") {
      const p = l.parts.find((x) => typeof x !== "string" && x.kind === "rule");
      rule = p && typeof p !== "string" ? p.id : null;
    }
  }
  return { marks, reached, rule, queue };
}

/** The flow's steps in order, for lighting the lines between them. */
export const FLOW: FlowStep[] = ["spam", "account", "keep", "rules", "fallback"];
