// The lead scoring model (docs/scoring-plan.md Part 4): groups of point rules for fit (could they buy?) and activity
// (do they want to buy now?), points taken away, and how points turn into a grade or a score. The editor, the
// engine, the assistant and the worker all read this one shape, so what a person sees is what runs.
//
// A rule's conditions use the router's fields and tests (src/lib/router/conditions.ts) for who the lead is, and the
// event fields below for what they did. Event rules count each matching action, fading by half every `halfLife` days.

import { BASE_FIELDS, needsValue, opsFor, type FieldDef } from "../router/conditions.ts";
import type { Cond, Op } from "../router/types.ts";

export type ScoreRule = {
  id: string;
  /** Shown instead of the sentence made from the conditions. Cleared when the conditions change. */
  name?: string;
  match: "all" | "any";
  conds: Cond[];
  /** Points to add (or take away, when negative). Ignored when `remove` is set. */
  points: number;
  /** Takes the lead out of scoring: no score, never sales-ready. */
  remove?: boolean;
  /** For event rules: count the most recent action once, or each one up to `cap`. */
  count: "once" | "each";
  cap: number;
  /** For event rules: fade with the model, never, or by half every this many days. */
  fade: "model" | "never" | number;
  on: boolean;
};

export type ScoreGroup = { id: string; name: string; side: "fit" | "act"; max: number; rules: ScoreRule[] };

export type Actions = { routing: boolean; slack: boolean; workflow: boolean; crm: boolean };

export type ScoreBody = {
  v: 1;
  /** Grades: a fit grade A to D and an activity level 1 to 4. Points: one score from 0 to 100. */
  style: "grades" | "points";
  halfLife: number;
  /** Activity counts only when the lead did something in this many days. */
  reset: number;
  groups: ScoreGroup[];
  minus: ScoreRule[];
  /** Points style: sales-ready at `ready`, warming up at `warm`. */
  ready: number;
  warm: number;
  /** Grades style: fit percent for A, B and C; activity percent for 1, 2 and 3; the sales-ready cells. */
  fitCuts: [number, number, number];
  actCuts: [number, number, number];
  mql: string[];
  /** Sales-ready leads a week the team can follow up. */
  capacity: number;
  actions: Actions;
};

export const GRADES = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4", "C1", "C2", "C3", "C4", "D1", "D2", "D3", "D4"] as const;

/** What a lead did, as the engine reads it. `d` is the detail an event rule can test: a form id, a page, a name. */
export type EventKind = "form" | "page" | "meeting" | "click" | "unsub" | "product";
export const EVENT_FIELDS: (FieldDef & { event: EventKind; detail?: "choice" | "text" })[] = [
  { key: "event.form", label: "Filled in a form", group: "Source", type: "choice", event: "form", detail: "choice" },
  { key: "event.page", label: "Visited a page", group: "Source", type: "text", event: "page", detail: "text" },
  { key: "event.meeting", label: "Booked a meeting", group: "Source", type: "bool", event: "meeting" },
  { key: "event.click", label: "Clicked an email", group: "Source", type: "bool", event: "click" },
  { key: "event.unsub", label: "Unsubscribed", group: "Source", type: "bool", event: "unsub" },
  { key: "event.product", label: "Did in the product", group: "Source", type: "text", event: "product", detail: "text" },
];
export const isEventField = (k: string) => k.startsWith("event.");
export const eventField = (k: string) => EVENT_FIELDS.find((f) => f.key === k);

/** The fields a fit rule can test: who the lead and their company are. Scores and sources stay out. */
export function fitFields(extra: FieldDef[] = []): FieldDef[] {
  const base = BASE_FIELDS.filter((f) => f.group === "Contact" || f.group === "Company");
  return [...base, ...extra.filter((f) => !base.some((b) => b.key === f.key) && (f.group === "Contact" || f.group === "Company"))];
}

/** The tests a rule's field allows. Event fields: it happened, or it happened with one of these details. */
export function opsForField(key: string, fields: FieldDef[]): Op[] {
  const ev = eventField(key);
  if (ev) return ev.detail === "choice" ? ["filled", "one_of"] : ev.detail === "text" ? ["filled", "contains"] : ["filled"];
  const f = fields.find((x) => x.key === key);
  return f ? opsFor(f.type) : ["is"];
}

export const EMPTY_ACTIONS: Actions = { routing: true, slack: false, workflow: false, crm: true };

export function emptyBody(): ScoreBody {
  return { v: 1, style: "grades", halfLife: 30, reset: 180, groups: [], minus: [], ready: 70, warm: 40, fitCuts: [60, 40, 20], actCuts: [40, 20, 8], mql: ["A1", "A2", "B1"], capacity: 15, actions: { ...EMPTY_ACTIONS } };
}

const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
};
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const idOk = (v: unknown) => typeof v === "string" && /^[a-z0-9_-]{1,40}$/i.test(v);
let seq = 0;
export const newId = (p: string) => `${p}${Date.now().toString(36)}${(seq++ % 1296).toString(36)}`;

function cleanCond(c: unknown, fields: FieldDef[]): Cond | null {
  if (!c || typeof c !== "object") return null;
  const x = c as Record<string, unknown>;
  const field = str(x.field, 80);
  if (!field || (!isEventField(field) && !fields.some((f) => f.key === field) && !/^(contact|company)\.f\.[a-z0-9_]{1,40}$/.test(field))) return null;
  if (isEventField(field) && !eventField(field)) return null;
  const ops = opsForField(field, fields);
  const op = ops.includes(x.op as Op) ? (x.op as Op) : ops[0]!;
  if (!needsValue(op)) return { field, op };
  const raw = Array.isArray(x.value) ? x.value : x.value === undefined || x.value === null ? [] : [x.value];
  const value = raw.slice(0, 50).map((v) => (typeof v === "number" ? v : String(v).slice(0, 200))).filter((v) => v !== "");
  if (op === "between") return { field, op, value: value.slice(0, 2) };
  if (op === "gt" || op === "lt" || op === "is" || op === "is_not") return { field, op, value: value[0] ?? "" };
  return { field, op, value };
}

function cleanRule(r: unknown, fields: FieldDef[]): ScoreRule | null {
  if (!r || typeof r !== "object") return null;
  const x = r as Record<string, unknown>;
  const conds = (Array.isArray(x.conds) ? x.conds : []).slice(0, 10).map((c) => cleanCond(c, fields)).filter((c): c is Cond => !!c);
  const fade = x.fade === "never" ? "never" : typeof x.fade === "number" ? int(x.fade, 1, 365, 30) : "model";
  return {
    id: idOk(x.id) ? (x.id as string) : newId("r"),
    ...(str(x.name, 120) ? { name: str(x.name, 120) } : {}),
    match: x.match === "any" ? "any" : "all",
    conds,
    points: int(x.points, -100, 100, 10),
    ...(x.remove === true ? { remove: true } : {}),
    count: x.count === "each" ? "each" : "once",
    cap: int(x.cap, 1, 20, 3),
    fade,
    on: x.on !== false,
  };
}

/** Make any input a valid model: unknown fields and broken rules drop out, numbers stay in range. */
export function cleanBody(input: unknown, fields: FieldDef[] = fitFields()): ScoreBody {
  const b = emptyBody();
  if (!input || typeof input !== "object") return b;
  const x = input as Record<string, unknown>;
  const groups = (Array.isArray(x.groups) ? x.groups : []).slice(0, 12).map((g): ScoreGroup | null => {
    if (!g || typeof g !== "object") return null;
    const y = g as Record<string, unknown>;
    return {
      id: idOk(y.id) ? (y.id as string) : newId("g"),
      name: str(y.name, 60) || "Group",
      side: y.side === "act" ? "act" : "fit",
      max: int(y.max, 1, 100, 30),
      rules: (Array.isArray(y.rules) ? y.rules : []).slice(0, 40).map((r) => cleanRule(r, fields)).filter((r): r is ScoreRule => !!r),
    };
  });
  const cuts = (v: unknown, d: [number, number, number]): [number, number, number] => {
    const a = Array.isArray(v) ? v.map((n, i) => int(n, 1, 100, d[i]!)) : d;
    const s = [a[0] ?? d[0], a[1] ?? d[1], a[2] ?? d[2]].sort((p, q) => q - p) as [number, number, number];
    return s;
  };
  const ready = int(x.ready, 2, 100, b.ready);
  const a = (x.actions && typeof x.actions === "object" ? x.actions : {}) as Record<string, unknown>;
  return {
    v: 1,
    style: x.style === "points" ? "points" : "grades",
    halfLife: int(x.halfLife, 1, 365, b.halfLife),
    reset: int(x.reset, 7, 730, b.reset),
    groups: groups.filter((g): g is ScoreGroup => !!g),
    minus: (Array.isArray(x.minus) ? x.minus : []).slice(0, 40).map((r) => cleanRule(r, fields)).filter((r): r is ScoreRule => !!r),
    ready,
    warm: Math.min(ready - 1, int(x.warm, 1, 99, b.warm)),
    fitCuts: cuts(x.fitCuts, b.fitCuts),
    actCuts: cuts(x.actCuts, b.actCuts),
    mql: Array.isArray(x.mql) ? [...new Set(x.mql.filter((g): g is string => typeof g === "string" && (GRADES as readonly string[]).includes(g)))] : b.mql,
    capacity: int(x.capacity, 1, 5000, b.capacity),
    actions: { routing: a.routing !== false, slack: a.slack === true, workflow: a.workflow === true, crm: a.crm !== false },
  };
}

/** What stops a model from going live, in plain words. Empty when it can. */
export function problems(b: ScoreBody): string[] {
  const out: string[] = [];
  if (!b.groups.some((g) => g.side === "fit" && g.rules.some((r) => r.on && r.conds.length))) out.push("Add at least one fit rule");
  if (!b.groups.some((g) => g.side === "act" && g.rules.some((r) => r.on && r.conds.length))) out.push("Add at least one activity rule");
  for (const r of [...b.groups.flatMap((g) => g.rules), ...b.minus]) {
    if (r.on && !r.conds.length) out.push("A rule has no condition");
    else if (r.on && r.conds.some((c) => needsValue(c.op) && (c.value === undefined || c.value === "" || (Array.isArray(c.value) && !c.value.length)))) out.push("A rule has a condition with no value");
  }
  if (b.style === "grades" && !b.mql.length) out.push("Pick at least one sales-ready grade");
  return [...new Set(out)];
}
