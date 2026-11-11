// Routing in Form Studio (docs/on-submission.md): named rules of "When <question or past fill> <test> <value>, and
// (or or) more, book <meeting> with <the meeting's own people, or a team or person>", read top to bottom, first match
// wins, and Otherwise the form's meeting. A rule keeps its first condition at the top (field, op, value), as rows did
// before rules had several, and the rest in `more`. Each rule compiles to router rules (src/lib/routing/compile.ts),
// so the preview and the live form agree. Runs in the browser and on the server.

import { holds, isPast, needsValue, toNumber } from "../router/conditions.ts";
import type { Cond, Op } from "../router/types.ts";

/** One condition. `field` is a question's name on the page, or a past fill (past.*). */
export type RouteCond = { field: string; op: Op; value?: string | number | string[] | number[] };
/** Who takes the meeting a rule books, when it isn't the meeting's own people: one person, or a team taking turns. */
export type RouteWith = { kind: "user" | "team"; id: string };
/**
 * One rule: its first condition, then `more` joined by `match` (all: and, any: or), the meeting it books and, when
 * set, who takes it. `name` is what the team calls it ("Big teams").
 */
export type StudioRoute = RouteCond & { meeting: string; name?: string; match?: "all" | "any"; more?: RouteCond[]; with?: RouteWith };

/** A rule's conditions, first to last. */
export const condsOf = (r: StudioRoute): RouteCond[] => [{ field: r.field, op: r.op, ...(r.value !== undefined ? { value: r.value } : {}) }, ...(r.more ?? [])];
/** A rule with these conditions (the first at the top, the rest in `more`). Null with none. */
export function withConds(r: StudioRoute, conds: RouteCond[]): StudioRoute | null {
  if (!conds.length) return null;
  const [first, ...rest] = conds;
  const keep: Partial<StudioRoute> = { ...r };
  delete keep.value;
  delete keep.more;
  return { ...(keep as StudioRoute), field: first!.field, op: first!.op, ...(first!.value !== undefined ? { value: first!.value } : {}), ...(rest.length ? { more: rest } : {}) };
}

/** What a row compares: a question with answers to pick, a number, free text, a yes/no past fill, or days. */
export type RouteKind = "choice" | "number" | "text" | "yesno" | "days";

/** The question facts a row needs: its type on the page and its answers. */
export type RouteQuestion = { name: string; type?: string; block?: { type?: string } | null; options: { value: string; label?: string }[] };

/** Past fills a row can test, in the words the editor shows. */
export const PAST_ROUTES: { field: string; label: string; kind: RouteKind }[] = [
  { field: "past.sent_form", label: "Has sent this form before", kind: "yesno" },
  { field: "past.has_meeting", label: "Has a meeting booked", kind: "yesno" },
  { field: "past.days_since_booked", label: "Booked in the last", kind: "days" },
];

const NUMBER_TYPES = new Set(["number", "range", "rating", "scale", "nps"]);

export function routeKind(field: string, q: RouteQuestion | undefined): RouteKind {
  const past = PAST_ROUTES.find((p) => p.field === field);
  if (past) return past.kind;
  if (!q) return "text";
  if (q.block?.type && NUMBER_TYPES.has(q.block.type)) return "number";
  if (q.options.length) return "choice";
  return q.type && NUMBER_TYPES.has(q.type) ? "number" : "text";
}

/** The tests each kind offers, in the order the menu shows them. */
export const ROUTE_OPS: Record<RouteKind, Op[]> = {
  choice: ["one_of", "not_one_of", "filled", "empty"],
  number: ["lt", "gt", "lte", "gte", "between", "is", "filled", "empty"],
  text: ["contains", "is", "is_not", "starts_with", "filled", "empty"],
  yesno: ["is"],
  days: ["lte"],
};

export const OP_LABEL: Record<Op, string> = {
  one_of: "is",
  not_one_of: "is not",
  lt: "is less than",
  gt: "is more than",
  lte: "is at most",
  gte: "is at least",
  between: "is between",
  is: "is",
  is_not: "is not",
  contains: "contains",
  starts_with: "starts with",
  filled: "is answered",
  empty: "is empty",
};

const ALL_OPS = new Set<Op>(Object.keys(OP_LABEL) as Op[]);

/** A new row's test and value for a field. */
export function routeStart(field: string, q: RouteQuestion | undefined): Pick<StudioRoute, "op" | "value"> {
  const kind = routeKind(field, q);
  if (kind === "choice") return { op: "one_of", value: q?.options[0] ? [q.options[0].value] : [] };
  if (kind === "yesno") return { op: "is", value: "true" };
  if (kind === "days") return { op: "lte", value: 30 };
  if (kind === "number") return { op: "lt", value: "" };
  return { op: "contains", value: "" };
}

/** A rule as saved (old rows were { field, value, meeting }: "is" that answer). Null when it can't be read. */
export function cleanRoute(raw: unknown): StudioRoute | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  const first = cleanCond(x);
  if (!first || typeof x.meeting !== "string") return null;
  const more = (Array.isArray(x.more) ? x.more : []).slice(0, 9).map(cleanCond).filter((c): c is RouteCond => !!c);
  const name = typeof x.name === "string" ? x.name.trim().slice(0, 60) : "";
  const w = x.with && typeof x.with === "object" ? (x.with as Record<string, unknown>) : null;
  const withOk = w && (w.kind === "user" || w.kind === "team") && typeof w.id === "string" && /^[\w.:-]{1,80}$/.test(w.id);
  return {
    ...first,
    meeting: x.meeting.slice(0, 40),
    ...(name ? { name } : {}),
    ...(x.match === "any" && more.length ? { match: "any" as const } : {}),
    ...(more.length ? { more } : {}),
    ...(withOk ? { with: { kind: w!.kind as RouteWith["kind"], id: w!.id as string } } : {}),
  };
}

/** One condition as saved. Null when it can't be read. */
export function cleanCond(raw: unknown): RouteCond | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.field !== "string" || !x.field) return null;
  const op: Op = typeof x.op === "string" && ALL_OPS.has(x.op as Op) ? (x.op as Op) : "is";
  const v = x.value;
  let value: StudioRoute["value"];
  if (Array.isArray(v)) {
    const nums = v.every((n) => typeof n === "number" && Number.isFinite(n));
    value = nums ? (v as number[]).slice(0, 2) : v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 200)).slice(0, 50);
  } else if (typeof v === "number" && Number.isFinite(v)) value = v;
  else if (typeof v === "string") value = v.slice(0, 200);
  return { field: x.field.slice(0, 60), op, ...(value !== undefined ? { value } : {}) };
}

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && (!v.length || v.some((x) => x === "" || x === null)));

/** Whether a row still needs its value (then it never routes anyone). */
export function routeIncomplete(r: RouteCond, kind: RouteKind): boolean {
  if (!needsValue(r.op)) return false;
  if (r.op === "between") {
    const a = Array.isArray(r.value) ? r.value.map(toNumber) : [];
    return a.length !== 2 || a.some((n) => n === null);
  }
  if (kind === "number" || kind === "days") return toNumber(Array.isArray(r.value) ? r.value[0] : r.value) === null;
  return blank(r.value);
}

/**
 * The row as the router's condition on `field` (answer.<key> for a question, the past fill as it is). Numbers become
 * numbers, so "Locations is less than 5" compares 3 with 5 and never "3" with "5". Null for a row with a value missing.
 */
export function routeCond(r: RouteCond, field: string, kind: RouteKind): Cond | null {
  if (routeIncomplete(r, kind)) return null;
  if (!needsValue(r.op)) return { field, op: r.op };
  if (r.op === "between") {
    const [a, b] = (r.value as (string | number)[]).map((n) => toNumber(n)!);
    return { field, op: "between", value: [Math.min(a!, b!), Math.max(a!, b!)] };
  }
  if (kind === "number" || kind === "days") return { field, op: r.op, value: toNumber(Array.isArray(r.value) ? r.value[0] : r.value)! };
  if (kind === "yesno") return { field, op: "is", value: r.value === "false" ? "false" : "true" };
  if (r.op === "one_of" || r.op === "not_one_of") return { field, op: r.op, value: Array.isArray(r.value) ? r.value.map(String) : [String(r.value)] };
  return { field, op: r.op, value: Array.isArray(r.value) ? String(r.value[0]) : String(r.value) };
}

/** The field a row reads on the router: its past fill, or answer.<key> for a question (null when it's gone). */
export function routeField(r: RouteCond, keyOf: (name: string) => string | null | undefined): string | null {
  if (isPast(r.field)) return PAST_ROUTES.some((p) => p.field === r.field) ? r.field : null;
  const key = keyOf(r.field);
  return key ? `answer.${key}` : null;
}

/** Whether one condition holds for these answers; a past fill that isn't known (the preview) never does. */
function condHolds(c: RouteCond, values: Record<string, unknown>, questions: RouteQuestion[], past: Record<string, unknown>): boolean {
  const kind = routeKind(c.field, questions.find((x) => x.name === c.field));
  const rc = routeCond(c, c.field, kind);
  if (!rc) return false;
  const actual = isPast(c.field) ? past[c.field] : values[c.field];
  if (isPast(c.field) && actual === undefined) return false;
  return holds(rc, actual, [], "v2");
}

/** Whether a rule holds: all its conditions, or any of them. */
export function ruleHolds(r: StudioRoute, values: Record<string, unknown>, questions: RouteQuestion[], past: Record<string, unknown> = {}): boolean {
  const cs = condsOf(r);
  return r.match === "any" ? cs.some((c) => condHolds(c, values, questions, past)) : cs.every((c) => condHolds(c, values, questions, past));
}

/** The first rule that holds (first match wins), or -1 for Otherwise. */
export function routeIndex(routes: StudioRoute[], values: Record<string, unknown>, questions: RouteQuestion[], past: Record<string, unknown> = {}): number {
  return routes.findIndex((r) => ruleHolds(r, values, questions, past));
}

/**
 * Which meeting the answers book: the first rule that holds, else the form's meeting. `values` are the answers by
 * question name (a list for pick-many); `past` the past fills when known (the preview has none, so those rules wait).
 */
export function routeMeeting(routes: StudioRoute[], fallback: string, values: Record<string, unknown>, questions: RouteQuestion[], past: Record<string, unknown> = {}): string {
  const i = routeIndex(routes, values, questions, past);
  return i >= 0 ? routes[i]!.meeting : fallback;
}

/**
 * Answers a lead for this rule would give (Preview as): enough to meet all its conditions, or the first of an "or"
 * rule. The preview then runs them through every rule, so an earlier rule that catches them shows as it would live.
 */
export function sampleFor(r: StudioRoute, questions: RouteQuestion[]): { values: Record<string, unknown>; past: Record<string, unknown> } {
  const values: Record<string, unknown> = {}, past: Record<string, unknown> = {};
  const cs = r.match === "any" ? condsOf(r).slice(0, 1) : condsOf(r);
  for (const c of cs) {
    const q = questions.find((x) => x.name === c.field);
    const kind = routeKind(c.field, q);
    const one = Array.isArray(c.value) ? c.value[0] : c.value;
    const n = toNumber(one);
    let v: unknown;
    if (c.op === "empty") v = "";
    else if (c.op === "filled") v = kind === "choice" ? q?.options[0]?.value ?? "yes" : kind === "number" ? "1" : "yes";
    else if (kind === "yesno") v = c.value === "false" ? "false" : "true";
    else if (kind === "days") v = n ?? 1;
    else if (kind === "choice") v = c.op === "not_one_of" ? q?.options.find((o) => !(Array.isArray(c.value) ? c.value.map(String) : [String(c.value)]).includes(o.value))?.value ?? "" : String(one ?? "");
    else if (kind === "number" && n !== null) v = String(c.op === "gt" ? n + 1 : c.op === "lt" ? n - 1 : n);
    else if (c.op === "is_not") v = `${one ?? ""}x`;
    else v = String(one ?? "");
    if (isPast(c.field)) past[c.field] = v;
    else values[c.field] = q && q.type === "checkbox" ? [v] : v;
  }
  return { values, past };
}

// Can never run ---------------------------------------------------------------------------------------------------
// A rule can never run when an earlier rule catches every lead it would: each way it can match (all of its conditions,
// or each one of an "or" rule) already meets that earlier rule. Only sure cases are named, so the warning is never
// wrong; overlaps it can't prove stay quiet.

type Span = { lo: number; loIn: boolean; hi: number; hiIn: boolean };
function spanOf(c: RouteCond): Span | null {
  const nums = (Array.isArray(c.value) ? c.value : [c.value]).map(toNumber);
  const a = nums[0];
  if (c.op === "between") return nums.length === 2 && a !== null && nums[1] !== null ? { lo: Math.min(a, nums[1]!), loIn: true, hi: Math.max(a, nums[1]!), hiIn: true } : null;
  if (a === null || a === undefined) return null;
  if (c.op === "gte") return { lo: a, loIn: true, hi: Infinity, hiIn: false };
  if (c.op === "gt") return { lo: a, loIn: false, hi: Infinity, hiIn: false };
  if (c.op === "lte") return { lo: -Infinity, loIn: false, hi: a, hiIn: true };
  if (c.op === "lt") return { lo: -Infinity, loIn: false, hi: a, hiIn: false };
  return null;
}
const inside = (d: Span, c: Span) => (d.lo > c.lo || (d.lo === c.lo && (c.loIn || !d.loIn))) && (d.hi < c.hi || (d.hi === c.hi && (c.hiIn || !d.hiIn)));
const listVals = (v: RouteCond["value"]) => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);
const POSITIVE = new Set<Op>(["is", "one_of", "contains", "starts_with", "gt", "gte", "lt", "lte", "between"]);

/** Whether every lead that meets `d` meets `c` (both on the same question), as far as can be sure. */
function implies(d: RouteCond, c: RouteCond, kind: RouteKind): boolean {
  if (d.field !== c.field) return false;
  if (d.op === c.op && JSON.stringify(d.value ?? null) === JSON.stringify(c.value ?? null)) return true;
  if (c.op === "filled") return POSITIVE.has(d.op) && !isPast(d.field);
  if (kind === "number") { const a = spanOf(d), b = spanOf(c); return !!a && !!b && inside(a, b); }
  if (kind === "days" && d.op === "lte" && c.op === "lte") { const a = toNumber(d.value), b = toNumber(c.value); return a !== null && b !== null && a <= b; }
  if (kind === "choice") {
    const dv = listVals(d.value), cv = listVals(c.value);
    if (d.op === "one_of" && c.op === "one_of") return dv.length > 0 && dv.every((x) => cv.includes(x));
    if (d.op === "not_one_of" && c.op === "not_one_of") return cv.every((x) => dv.includes(x));
  }
  return false;
}

/** Whether every lead meeting all of `branch` meets rule `r`. */
function branchMeets(branch: RouteCond[], r: StudioRoute, qOf: (n: string) => RouteQuestion | undefined): boolean {
  const meets = (c: RouteCond) => branch.some((d) => implies(d, c, routeKind(c.field, qOf(c.field))));
  return r.match === "any" ? condsOf(r).some(meets) : condsOf(r).every(meets);
}

/** For each rule, the earlier rule that catches every lead it would (its index), or -1. */
export function neverRuns(routes: StudioRoute[], questions: RouteQuestion[]): number[] {
  const qOf = (n: string) => questions.find((x) => x.name === n);
  return routes.map((r, j) => {
    const branches = r.match === "any" ? condsOf(r).map((c) => [c]) : [condsOf(r)];
    for (let i = 0; i < j; i++) if (branches.every((b) => branchMeets(b, routes[i]!, qOf))) return i;
    return -1;
  });
}

/** A rule as words: "Locations is at least 50 and Plan is Enterprise". */
export function ruleWords(r: StudioRoute, qOf: (name: string) => RouteQuestion | undefined, labelOf: (field: string) => string): string {
  return condsOf(r).map((c, i) => `${i ? (r.match === "any" ? "or " : "and ") : ""}${routeWords(c, qOf(c.field), labelOf(c.field))}`).join(" ");
}

/** A condition as words: "Locations is less than 5", "Has sent this form before", "Booked in the last 30 days". */
export function routeWords(r: RouteCond, q: RouteQuestion | undefined, label: string): string {
  const kind = routeKind(r.field, q);
  if (kind === "yesno") {
    const p = PAST_ROUTES.find((x) => x.field === r.field)!;
    if (r.value !== "false") return p.label;
    return r.field === "past.sent_form" ? "Hasn't sent this form before" : "Has no meeting booked";
  }
  if (kind === "days") return `Booked in the last ${r.value ?? "?"} days`;
  if (!needsValue(r.op)) return `${label} ${OP_LABEL[r.op]}`;
  const name = (v: string) => q?.options.find((o) => o.value === v)?.label || v;
  const val =
    r.op === "between" && Array.isArray(r.value)
      ? `${r.value[0]} and ${r.value[1]}`
      : Array.isArray(r.value)
        ? r.value.map((v) => name(String(v))).join(" or ")
        : name(String(r.value ?? ""));
  return `${label} ${OP_LABEL[r.op]} ${val || "?"}`;
}
