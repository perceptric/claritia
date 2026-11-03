// Route by answer in Form Studio (docs/on-submission.md): rows of "When <question or past fill> <test> <value>, book
// <meeting>", read top to bottom, and Otherwise the form's meeting. A route only ever picks the meeting type; the
// meeting picks the person (an Individual meeting is its host, a Dynamic meeting runs its own rules). Each row
// compiles to one condition the router runs (src/lib/routing/compile.ts), so the preview and the live form agree.
// Runs in the browser and on the server.

import { holds, isPast, needsValue, toNumber } from "../router/conditions.ts";
import type { Cond, Op } from "../router/types.ts";

/** One row. `field` is a question's name on the page, or a past fill (past.*). */
export type StudioRoute = { field: string; op: Op; value?: string | number | string[] | number[]; meeting: string };

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

/** A row as saved (old rows were { field, value, meeting }: "is" that answer). Null when it can't be read. */
export function cleanRoute(raw: unknown): StudioRoute | null {
  if (!raw || typeof raw !== "object") return null;
  const x = raw as Record<string, unknown>;
  if (typeof x.field !== "string" || !x.field || typeof x.meeting !== "string") return null;
  const op: Op = typeof x.op === "string" && ALL_OPS.has(x.op as Op) ? (x.op as Op) : "is";
  const v = x.value;
  let value: StudioRoute["value"];
  if (Array.isArray(v)) {
    const nums = v.every((n) => typeof n === "number" && Number.isFinite(n));
    value = nums ? (v as number[]).slice(0, 2) : v.filter((s): s is string => typeof s === "string").map((s) => s.slice(0, 200)).slice(0, 50);
  } else if (typeof v === "number" && Number.isFinite(v)) value = v;
  else if (typeof v === "string") value = v.slice(0, 200);
  return { field: x.field.slice(0, 60), op, ...(value !== undefined ? { value } : {}), meeting: x.meeting.slice(0, 40) };
}

const blank = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && (!v.length || v.some((x) => x === "" || x === null)));

/** Whether a row still needs its value (then it never routes anyone). */
export function routeIncomplete(r: StudioRoute, kind: RouteKind): boolean {
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
export function routeCond(r: StudioRoute, field: string, kind: RouteKind): Cond | null {
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
export function routeField(r: StudioRoute, keyOf: (name: string) => string | null | undefined): string | null {
  if (isPast(r.field)) return PAST_ROUTES.some((p) => p.field === r.field) ? r.field : null;
  const key = keyOf(r.field);
  return key ? `answer.${key}` : null;
}

/**
 * Which meeting the answers book: the first row that holds, else the form's meeting. `values` are the answers by
 * question name (a list for pick-many); `past` the past fills when known (the preview has none, so those rows wait).
 */
export function routeMeeting(routes: StudioRoute[], fallback: string, values: Record<string, unknown>, questions: RouteQuestion[], past: Record<string, unknown> = {}): string {
  for (const r of routes) {
    const q = questions.find((x) => x.name === r.field);
    const kind = routeKind(r.field, q);
    const c = routeCond(r, r.field, kind);
    if (!c) continue;
    const actual = isPast(r.field) ? past[r.field] : values[r.field];
    if (isPast(r.field) && actual === undefined) continue;
    if (holds(c, actual, [], "v2")) return r.meeting;
  }
  return fallback;
}

/** A row as words: "Locations is less than 5", "Has sent this form before", "Booked in the last 30 days". */
export function routeWords(r: StudioRoute, q: RouteQuestion | undefined, label: string): string {
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
