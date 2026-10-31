// A form's own routing, as On Submission edits it: a list of If → Then rows and Otherwise. Each row is one router
// rule whose conditions all have to hold, named from its conditions (people never name them), sent to a person, a
// team (members take turns) or the company's owner. Otherwise is the policy's Everyone else. Rows map onto the same
// RouterBody the router runs; every other part of the policy (checks, ownership, backup, review) stays as it is.
// Runs in the browser and on the server.

import { incomplete, needsValue, ruleMatches, toNumber, type FieldDef } from "../router/conditions.ts";
import { newId } from "../router/check.ts";
import type { Cond, Rule, RouterBody } from "../router/types.ts";
import { condText, effectiveSource, fieldOf, type SourceRow } from "./screenModel.ts";

export type Then = { kind: "person"; id: string } | { kind: "team"; key: string } | { kind: "owner" } | null;

/** One row. `base` is the rule it came from, so what the row doesn't show (its meeting, on or off) is kept. */
export type Row = { id: string; conds: Cond[]; then: Then; base?: Rule };

export function thenOf(r: Rule): Then {
  const t = r.then ?? "queue";
  if (t === "owner") return { kind: "owner" };
  if (t === "user") return r.user ? { kind: "person", id: r.user } : null;
  if (t === "queue") return r.queue ? { kind: "team", key: r.queue } : null;
  return null;
}

/** The rows a policy's rules make. Rules held for review have no row here: Routing shows and keeps them. */
export const rowsOf = (b: RouterBody | null): Row[] => (b ? b.rules.list.filter((r) => r.then !== "hold").map((r) => ({ id: r.id, conds: r.conds, then: thenOf(r), base: r })) : []);

export const otherwiseOf = (b: RouterBody | null): Then => (!b?.fallback ? null : b.fallback.kind === "user" ? { kind: "person", id: b.fallback.id } : { kind: "team", key: b.fallback.id });

/** The row's name in Routing and the history: its conditions in words ("Country = US and Employees ≥ 201"). */
export function rowName(conds: Cond[], fields: FieldDef[]): string {
  const words = conds.map((c) => condText(c, fields)).join(" and ") || "New rule";
  return words.length > 80 ? `${words.slice(0, 79).trimEnd()}…` : words;
}

function ruleOf(row: Row, fields: FieldDef[]): Rule {
  const { then: _t, user: _u, queue: _q, ...kept } = row.base ?? ({} as Partial<Rule>);
  void _t;
  void _u;
  void _q;
  const base: Rule = {
    ...kept,
    id: row.id,
    name: rowName(row.conds, fields),
    match: "all",
    conds: row.conds,
    queue: "",
  };
  const t = row.then;
  if (!t) return base;
  if (t.kind === "owner") return { ...base, then: "owner" };
  if (t.kind === "person") return { ...base, then: "user", user: t.id };
  return { ...base, queue: t.key };
}

/**
 * The policy with these rows as its rules, in this order, and rules turned on. Rules held for review keep their
 * place after the rows before them, so Routing's own review rules are never dropped by an edit here.
 */
export function withRows(b: RouterBody, rows: Row[], fields: FieldDef[]): RouterBody {
  const held = b.rules.list.filter((r) => r.then === "hold");
  const list = [...rows.map((r) => ruleOf(r, fields)), ...held];
  return { ...b, rules: { ...b.rules, on: true, list } };
}

/** Otherwise: a person or a team. The company's owner can't be Otherwise (a lead may have none). */
export function withOtherwise(b: RouterBody, t: Then): RouterBody {
  const meet = b.fallback?.meet;
  if (!t || t.kind === "owner") return { ...b, fallback: null };
  return {
    ...b,
    fallback: {
      kind: t.kind === "person" ? "user" : "queue",
      id: t.kind === "person" ? t.id : t.key,
      ...(meet ? { meet } : {}),
    },
  };
}

export const newRow = (field: FieldDef): Row => ({
  id: newId("rule"),
  conds: [blankCond(field)],
  then: null,
});

/** A new condition: the field's first test and no value, so it matches nothing until it's filled. */
export function blankCond(f: FieldDef): Cond {
  if (f.type === "number") return { field: f.key, op: "gte", value: "" };
  if (f.type === "text") return { field: f.key, op: "contains", value: "" };
  return { field: f.key, op: "is", value: "" };
}

/** The tests a row offers for a field, in plain words. */
export function testsFor(f: FieldDef): { value: Cond["op"]; label: string }[] {
  if (f.type === "number")
    return [
      { value: "gte", label: "is at least" },
      { value: "lt", label: "is less than" },
      { value: "is", label: "is" },
    ];
  if (f.type === "text")
    return [
      { value: "contains", label: "contains" },
      { value: "is", label: "is" },
      { value: "is_not", label: "is not" },
    ];
  if (f.type === "bool") return [{ value: "is", label: "is" }];
  return [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
  ];
}

/** What's missing before a row can go live, or null. */
export function rowProblem(row: Row, fields: FieldDef[], teamKeys: Set<string>): string | null {
  if (!row.conds.length) return "Add an If";
  for (const c of row.conds) {
    if (incomplete(c)) return "Pick a value";
    const f = fieldOf(c.field, fields);
    if (f.type === "number" && needsValue(c.op) && toNumber(c.value) === null) return `${f.label} needs a number`;
  }
  if (!row.then) return "Pick who they meet";
  if (row.then.kind === "team" && !teamKeys.has(row.then.key)) return "That team is gone";
  return null;
}

/**
 * The row a lead with these answers matches, top to bottom, or -1 for Otherwise. A row with a missing value or no
 * Then never matches, so a half-made row can't catch everyone. `values` are keyed by field (`contact.country`...).
 */
export function matchRow(b: RouterBody, rows: Row[], values: Record<string, unknown>, fields: FieldDef[], teamKeys: Set<string>): number {
  const typed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === "" || v === null || v === undefined) continue;
    typed[k] = fieldOf(k, fields).type === "number" ? toNumber(v) : v;
  }
  return rows.findIndex((r) => r.base?.on !== false && !rowProblem(r, fields, teamKeys) && ruleMatches({ ...ruleOf(r, fields), match: "all" }, typed, b.territories ?? [], "v2").ok);
}

/** The other sources (forms, the handoff) that route with this policy once its draft is live. */
export function sharedWith(sources: SourceRow[], policy: string, formId: string): SourceRow[] {
  return sources.filter((s) => s.form_id !== formId && effectiveSource(s, policy).connected && effectiveSource(s, policy).enabled);
}

/** The policy a form routes with now, counting a staged move. */
export const policyOf = (s: SourceRow | null): string | null => (s ? ((s.draft?.policy_id as string | undefined) ?? s.policy_id) : null);

/** Answers for a test lead that match the first finished row, so the test a publish needs exercises a real rule. */
export function sampleValues(rows: Row[], fields: FieldDef[], teamKeys: Set<string>): Record<string, string> {
  const row = rows.find((r) => !rowProblem(r, fields, teamKeys));
  const out: Record<string, string> = {};
  for (const c of row?.conds ?? []) {
    if (!needsValue(c.op)) continue;
    const v = Array.isArray(c.value) ? c.value[0] : c.value;
    if (v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : toNumber(v);
    out[c.field] = c.op === "lt" && n !== null ? String(Math.max(0, n - 1)) : c.op === "is_not" ? "" : String(v);
  }
  return out;
}
