// A form's routing and its meetings, compiled into the form's routing policy (docs/on-submission.md). The form picks
// the meeting: a Default meeting and conditions that send some leads to another one. The meeting picks the rep: an
// Individual meeting is always its host; a Dynamic meeting has its own rules (conditions → a rep or a team that takes
// turns) and Otherwise. Compiled, each path is one router rule that names its rep or team and the meeting it books
// (`meet`), in order; the Default meeting's Otherwise is Everyone else. The router runs it as it runs any policy, so
// spam checks, existing owners, away, caps and turns all work as before. Runs in the browser and on the server.

import { incomplete, ruleMatches, toNumber, type FieldDef } from "../router/conditions.ts";
import type { Cond, Rule, RouterBody } from "../router/types.ts";
import { fieldOf } from "./screenModel.ts";

/** One condition row of the form: when all its conditions hold, the lead books `meet`. */
export type FormRoute = { id: string; conds: Cond[]; meet: string };
/** Where a Dynamic meeting sends a lead: one rep, or a team whose members take turns (a team key). */
export type Dest = { kind: "user"; id: string } | { kind: "team"; id: string };
export type DynamicRule = { id: string; conds: Cond[]; to: Dest };
/** A Dynamic meeting's routing, kept in its settings. */
export type Dynamic = { rules: DynamicRule[]; otherwise: Dest | null };
/** What the compile needs of a meeting type. */
export type MeetingLite = { id: string; name: string; active: boolean; hosts: { user_id: string }[]; settings: { dynamic?: Dynamic } };

export const isDynamic = (t: Pick<MeetingLite, "settings">) => !!t.settings?.dynamic;

const NAME_MAX = 80;
const short = (s: string) => (s.length > NAME_MAX ? `${s.slice(0, NAME_MAX - 1).trimEnd()}…` : s);
const complete = (conds: Cond[]) => conds.length > 0 && !conds.some(incomplete);

function withDest(r: Omit<Rule, "queue" | "then" | "user">, d: Dest): Rule {
  return d.kind === "user" ? { ...r, queue: "", then: "user", user: d.id } : { ...r, queue: d.id };
}

/**
 * The form's routing as rules and Everyone else, over the policy it replaces (its checks, ownership, backup and review
 * stay). Paths that can't route are left out and named in `problems`: a meeting that's gone or off, a condition with a
 * value missing, a team that's gone. A half-made row never catches a lead. With no Default meeting, leads no condition
 * matched have nowhere to go (Everyone else is empty), so the form shows its message.
 */
export function compileRouting(base: RouterBody, o: { def: string | null | undefined; routes: FormRoute[]; types: MeetingLite[]; teamKeys: Set<string> }): { body: RouterBody; problems: string[] } {
  const problems: string[] = [];
  const list: Rule[] = [];
  const meeting = (id: string | null | undefined) => (id ? o.types.find((t) => t.id === id && t.active) : undefined);
  const destOk = (d: Dest | null | undefined): d is Dest => !!d && (d.kind === "user" ? !!d.id : o.teamKeys.has(d.id));

  /** The rules one meeting makes under `when` (the form row's conditions, or none for the Default meeting). */
  const expand = (t: MeetingLite, when: Cond[], id: string, label: string): { rules: Rule[]; rest: Dest | null } => {
    const dyn = t.settings.dynamic;
    if (!dyn) {
      const host = t.hosts[0]?.user_id;
      if (!host) problems.push(`${t.name} has no host`);
      return { rules: [], rest: host ? { kind: "user", id: host } : null };
    }
    const rules: Rule[] = [];
    for (const r of dyn.rules) {
      if (!complete(r.conds)) {
        problems.push(`${t.name}: a rule has a value missing`);
        continue;
      }
      if (!destOk(r.to)) {
        problems.push(`${t.name}: a rule's team is gone`);
        continue;
      }
      rules.push(withDest({ id: `${id}_${r.id}`.slice(0, 40), name: short(`${label}, ${t.name}`), match: "all", conds: [...when, ...r.conds], meet: t.id }, r.to));
    }
    if (dyn.otherwise && !destOk(dyn.otherwise)) problems.push(`${t.name}: Otherwise's team is gone`);
    return { rules, rest: destOk(dyn.otherwise) ? dyn.otherwise : null };
  };

  for (const row of o.routes) {
    if (!complete(row.conds)) {
      problems.push("A condition has a value missing");
      continue;
    }
    const t = meeting(row.meet);
    if (!t) {
      problems.push("A condition's meeting is gone or off");
      continue;
    }
    const { rules, rest } = expand(t, row.conds, `f_${row.id}`, "Condition");
    list.push(...rules);
    if (rest) list.push(withDest({ id: `f_${row.id}`.slice(0, 40), name: short(`Condition, ${t.name}`), match: "all", conds: row.conds, meet: t.id }, rest));
  }

  let fallback: RouterBody["fallback"] = null;
  const def = meeting(o.def);
  if (o.def && !def) problems.push("The Default meeting is gone or off");
  if (def) {
    const { rules, rest } = expand(def, [], "d", "Default");
    list.push(...rules);
    if (rest) fallback = { kind: rest.kind === "user" ? "user" : "queue", id: rest.id, meet: def.id };
  }
  return { body: { ...base, rules: { ...base.rules, on: true, list }, fallback }, problems };
}

/** What a compiled body does with a lead's answers (Try a lead): the rule that matched (or Everyone else) and its meeting and destination. */
export function traceLead(body: RouterBody, values: Record<string, unknown>, fields: FieldDef[]): { rule: Rule | null; meet: string | null; dest: Dest | null } {
  const typed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v === "" || v === null || v === undefined) continue;
    typed[k] = fieldOf(k, fields).type === "number" ? toNumber(v) : v;
  }
  const rule = body.rules.list.find((r) => r.on !== false && ruleMatches(r, typed, body.territories ?? [], "v2").ok) ?? null;
  if (rule) return { rule, meet: rule.meet ?? null, dest: rule.then === "user" && rule.user ? { kind: "user", id: rule.user } : rule.queue ? { kind: "team", id: rule.queue } : null };
  const f = body.fallback;
  return { rule: null, meet: f?.meet ?? null, dest: f ? (f.kind === "user" ? { kind: "user", id: f.id } : { kind: "team", id: f.id }) : null };
}

/** Answers that match the first compiled rule, else none: the lead the publish test sends, so it exercises a real path. */
export function sampleLead(body: RouterBody): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of body.rules.list[0]?.conds ?? []) {
    const v = Array.isArray(c.value) ? c.value[0] : c.value;
    if (v === undefined || v === "") continue;
    const n = toNumber(v);
    if (c.op === "is_not" || c.op === "not_one_of") continue;
    out[c.field] = c.op === "lt" && n !== null ? String(n - 1) : c.op === "gt" && n !== null ? String(n + 1) : String(v);
  }
  return out;
}
