// Edits to a routing setup (docs/routing-chat-plan.md Part 2): every change the chat or the Flow editor makes is one
// op, checked before it applies. `applyOp` refuses an op that is malformed or points at something missing (a rep who
// isn't in the workspace, a field that doesn't exist, a team that's gone). `applyStrict`, used by the chat, also
// refuses an op that would leave the setup with a new problem, so the chat can never leave a setup broken. Runs in
// the browser and on the server.

import { BASE_FIELDS, needsValue, opsFor, REGIONS, type FieldDef } from "./conditions.ts";
import { cleanBody, newId, problems, problemWords } from "./check.ts";
import { METHODS, OPS, SLA_MINUTES, type Cond, type Method, type Op, type Queue, type Rule, type RouterBody, type Then, type WhenOut } from "./types.ts";

export type CondInput = { field: string; op: Op; value?: string | number | (string | number)[] };

export type RouterOp =
  | { op: "set_spam"; on?: boolean; disposable?: boolean; fakeName?: boolean; tooMany?: boolean; freeMail?: boolean; maxPerHour?: number }
  | { op: "set_account"; on?: boolean; oppFirst?: boolean; setCompanyOwner?: boolean }
  | { op: "set_keep"; on?: boolean; whenOut?: WhenOut }
  | { op: "set_sla"; on?: boolean; minutes?: number; nudge?: number | null; next?: "route" | "manager" | "nudge"; manager?: string | null }
  | { op: "add_team"; name: string; people: string[]; method?: Method; strict?: boolean; hoursOnly?: boolean; weights?: number[] }
  | { op: "edit_team"; team: string; name?: string; people?: string[]; method?: Method; strict?: boolean; hoursOnly?: boolean; weights?: number[] }
  | { op: "remove_team"; team: string }
  | { op: "add_region"; name: string; countries: string[] }
  | { op: "add_company_type"; name: string; match?: "all" | "any"; conds: CondInput[] }
  | { op: "add_rule"; name?: string; match?: "all" | "any"; conds: CondInput[]; then?: Then; team?: string; person?: string; at?: number }
  | { op: "edit_rule"; rule: string; name?: string; match?: "all" | "any"; conds?: CondInput[]; then?: Then; team?: string; person?: string; on?: boolean }
  | { op: "move_rule"; rule: string; to: number }
  | { op: "remove_rule"; rule: string }
  | { op: "set_everyone_else"; team?: string; person?: string };

export type OpCtx = { members: { id: string; name: string; email?: string }[]; fields?: FieldDef[] };
export type Applied = { body: RouterBody; line: string; id?: string } | { error: string };

const METHOD_IDS = METHODS.map((m) => m.value);
const OP_IDS = OPS.map((o) => o.value);
const METHOD_WORDS: Record<Method, string> = { rr: "taking turns", weighted: "some get more", load: "fewest meetings first" };

/** A member id from an id, an email or a name (first name when it's the only one). Ambiguous or unknown: an error. */
export function findMember(ctx: OpCtx, who: string): { id: string } | { error: string } {
  const w = who.trim().toLowerCase();
  if (!w) return { error: "Name a teammate." };
  const exact = ctx.members.filter((m) => m.id === who || m.email?.toLowerCase() === w || m.name.toLowerCase() === w);
  if (exact.length === 1) return { id: exact[0]!.id };
  const first = ctx.members.filter((m) => m.name.toLowerCase().split(/\s+/)[0] === w);
  if (first.length === 1 && !exact.length) return { id: first[0]!.id };
  const many = exact.length > 1 ? exact : first;
  if (many.length > 1) return { error: `More than one teammate is called ${who}: ${many.map((m) => m.name).join(", ")}. Ask which one.` };
  return { error: `No teammate called ${who}. The team is: ${ctx.members.map((m) => m.name).join(", ")}.` };
}

function people(ctx: OpCtx, list: unknown): { ids: string[] } | { error: string } {
  if (!Array.isArray(list)) return { error: "Pass people as a list." };
  const ids: string[] = [];
  for (const p of list) {
    if (typeof p !== "string") return { error: "Name each person as text." };
    const m = findMember(ctx, p);
    if ("error" in m) return m;
    if (!ids.includes(m.id)) ids.push(m.id);
  }
  return { ids };
}

const fieldsOf = (ctx: OpCtx) => (ctx.fields?.length ? ctx.fields : BASE_FIELDS);

/** One condition, checked against the fields and the tests that fit each. Region names open into countries. */
function checkCond(body: RouterBody, ctx: OpCtx, c: CondInput): { cond: Cond } | { error: string } {
  const f = fieldsOf(ctx).find((x) => x.key === c.field);
  if (!f && !/^(answer|contact\.f|company\.f)\./.test(c.field)) return { error: `No field ${c.field}. Pick one of: ${fieldsOf(ctx).map((x) => x.key).join(", ")}.` };
  if (!OP_IDS.includes(c.op)) return { error: `Unknown test ${c.op}.` };
  if (f && !opsFor(f.type).includes(c.op)) return { error: `${f.label} takes these tests: ${opsFor(f.type).join(", ")}.` };
  if (!needsValue(c.op)) return { cond: { field: c.field, op: c.op } };
  const v = c.value;
  if (v === undefined || v === "" || (Array.isArray(v) && !v.length)) return { error: `The condition on ${f?.label ?? c.field} needs a value.` };
  if (c.op === "between" && (!Array.isArray(v) || v.length !== 2 || v.some((x) => typeof x !== "number"))) return { error: "Between takes two numbers." };
  if ((c.op === "gt" || c.op === "lt") && typeof (Array.isArray(v) ? v[0] : v) !== "number") return { error: `${f?.label ?? c.field} needs a number.` };
  if (f?.type === "country") {
    const list = (Array.isArray(v) ? v : [v]).map(String);
    const out: string[] = [];
    for (const x of list) {
      if (/^t:/.test(x)) {
        if (!body.territories.some((t) => t.id === x.slice(2))) return { error: `No region ${x}.` };
        out.push(x);
      } else if (/^[A-Za-z]{2}$/.test(x)) out.push(x.toUpperCase());
      else {
        const t = body.territories.find((y) => y.name.toLowerCase() === x.toLowerCase());
        if (!t) return { error: `${x} isn't a country code or a region. Call add_region first, or use two-letter codes.` };
        out.push(`t:${t.id}`);
      }
    }
    return { cond: { field: c.field, op: c.op, value: out } };
  }
  if (f?.type === "choice" && f.options?.length) {
    const list = (Array.isArray(v) ? v : [v]).map(String);
    const bad = list.find((x) => !f.options!.some((o) => o.toLowerCase() === x.toLowerCase()));
    if (bad && c.field !== "company.type" && c.field !== "lead.form") return { error: `${bad} isn't a ${f.label.toLowerCase()}. Pick from: ${f.options.join(", ")}.` };
  }
  if (c.field === "company.type") {
    const list = (Array.isArray(v) ? v : [v]).map(String);
    const missing = list.find((x) => !(body.segments ?? []).some((sg) => sg.name.toLowerCase() === x.toLowerCase()));
    if (missing) return { error: `No company type called ${missing}. Call add_company_type first.` };
  }
  return { cond: { field: c.field, op: c.op, value: v } };
}

function checkConds(body: RouterBody, ctx: OpCtx, list: unknown): { conds: Cond[] } | { error: string } {
  if (!Array.isArray(list)) return { error: "Pass conditions as a list." };
  const out: Cond[] = [];
  for (const c of list) {
    const r = checkCond(body, ctx, c as CondInput);
    if ("error" in r) return r;
    out.push(r.cond);
  }
  return { conds: out.slice(0, 30) };
}

/** A team of one for a person, reused when one already exists. */
function soloTeam(b: RouterBody, ctx: OpCtx, user: string): Queue {
  const name = ctx.members.find((m) => m.id === user)?.name ?? "Rep";
  const found = b.queues.find((q) => q.members.length === 1 && q.members[0]!.user === user && q.name === name);
  if (found) return found;
  const q: Queue = { id: newId("q_"), name, method: "rr", strict: false, hoursOnly: false, members: [{ user, weight: 1 }] };
  b.queues.push(q);
  return q;
}

/** Where a rule sends leads: a team by id or name, or one person (a team of one is made for them). */
function target(b: RouterBody, ctx: OpCtx, o: { team?: string; person?: string }): { queue: string } | { error: string } {
  if (o.person) {
    const m = findMember(ctx, o.person);
    if ("error" in m) return m;
    return { queue: soloTeam(b, ctx, m.id).id };
  }
  if (o.team) {
    const q = b.queues.find((x) => x.id === o.team || x.name.toLowerCase() === o.team!.toLowerCase());
    if (!q) return { error: `No team called ${o.team}. Teams: ${b.queues.map((x) => x.name).join(", ") || "none yet"}. Call add_team first.` };
    return { queue: q.id };
  }
  return { error: "Say which team or person gets these leads." };
}

const findRule = (b: RouterBody, id: string) => b.rules.list.find((r) => r.id === id || r.name.toLowerCase() === id.toLowerCase());
const findTeam = (b: RouterBody, id: string) => b.queues.find((q) => q.id === id || q.name.toLowerCase() === id.toLowerCase());

function ruleName(b: RouterBody, conds: Cond[], fields: FieldDef[]): string {
  const c = conds[0];
  const f = c ? fields.find((x) => x.key === c.field) : undefined;
  const v = c && Array.isArray(c.value) ? c.value.map((x) => (typeof x === "string" && x.startsWith("t:") ? (b.territories.find((t) => t.id === x.slice(2))?.name ?? x) : String(x))).join(", ") : c?.value;
  const base = c ? `${f?.label ?? c.field}${v !== undefined ? ` ${v}` : ""}` : "Rule";
  let name = base.slice(0, 60);
  for (let i = 2; b.rules.list.some((r) => r.name === name); i++) name = `${base.slice(0, 55)} ${i}`;
  return name;
}

/** Apply one op. The body that comes back is always clean (cleanBody); the line says what changed, in plain words. */
export function applyOp(body: RouterBody, op: RouterOp, ctx: OpCtx): Applied {
  const b = structuredClone(body);
  const fields = fieldsOf(ctx);
  const done = (line: string, id?: string): Applied => ({ body: cleanBody(b), line, ...(id ? { id } : {}) });
  switch (op.op) {
    case "set_spam": {
      for (const k of ["on", "disposable", "fakeName", "tooMany", "freeMail"] as const) if (typeof op[k] === "boolean") b.spam[k] = op[k]!;
      if (typeof op.maxPerHour === "number") b.spam.maxPerHour = Math.min(100, Math.max(1, Math.round(op.maxPerHour)));
      return done(b.spam.on ? "Changed what counts as junk" : "Turned off the junk check");
    }
    case "set_account": {
      for (const k of ["on", "oppFirst", "setCompanyOwner"] as const) if (typeof op[k] === "boolean") b.account[k] = op[k]!;
      return done(b.account.on ? "Leads from known companies go to their rep" : "Turned off same company, same rep");
    }
    case "set_keep": {
      if (typeof op.on === "boolean") b.keep.on = op.on;
      if (op.whenOut) {
        if (!["keep", "backup", "route"].includes(op.whenOut)) return { error: "whenOut is keep, backup or route." };
        b.keep.whenOut = op.whenOut;
      }
      return done(b.keep.on ? "Leads keep the rep they have" : "Turned off keep their rep");
    }
    case "set_sla": {
      const sla = { ...(b.sla ?? { on: false, minutes: 60, nudge: 30, next: "route" as const, manager: null }) };
      if (typeof op.on === "boolean") sla.on = op.on;
      if (typeof op.minutes === "number") {
        if (op.minutes < 5 || op.minutes > 10080) return { error: "Response time is 5 minutes to 7 days." };
        sla.minutes = Math.round(op.minutes);
        if (sla.nudge !== null && sla.nudge >= sla.minutes) sla.nudge = SLA_MINUTES.filter((m) => m < sla.minutes).pop() ?? null;
      }
      if (op.nudge !== undefined) sla.nudge = op.nudge === null ? null : Math.round(op.nudge);
      if (op.next) sla.next = op.next;
      if (op.manager !== undefined) {
        if (op.manager === null) sla.manager = null;
        else {
          const m = findMember(ctx, op.manager);
          if ("error" in m) return m;
          sla.manager = m.id;
        }
      }
      b.sla = sla;
      return done(sla.on ? "Set the response time" : "Turned off the response time");
    }
    case "add_team": {
      const name = (op.name ?? "").trim().slice(0, 80);
      if (!name) return { error: "Name the team." };
      if (findTeam(b, name)) return { error: `There's already a team called ${name}. Use edit_team.` };
      const p = people(ctx, op.people);
      if ("error" in p) return p;
      if (!p.ids.length) return { error: "A team needs at least one person." };
      if (op.method && !METHOD_IDS.includes(op.method)) return { error: "method is rr, weighted or load." };
      const q: Queue = { id: newId("q_"), name, method: op.method ?? "rr", strict: op.strict === true, hoursOnly: op.hoursOnly === true, members: p.ids.map((user, i) => ({ user, weight: Math.min(10, Math.max(1, Math.round(op.weights?.[i] ?? 1))) })) };
      b.queues.push(q);
      return done(`Made the ${name} team, ${METHOD_WORDS[q.method]}`, q.id);
    }
    case "edit_team": {
      const q = findTeam(b, op.team);
      if (!q) return { error: `No team ${op.team}.` };
      if (op.name !== undefined) {
        const n = op.name.trim().slice(0, 80);
        if (!n) return { error: "Name the team." };
        if (b.queues.some((x) => x !== q && x.name.toLowerCase() === n.toLowerCase())) return { error: `There's already a team called ${n}.` };
        q.name = n;
      }
      if (op.people) {
        const p = people(ctx, op.people);
        if ("error" in p) return p;
        q.members = p.ids.map((user, i) => ({ user, weight: Math.min(10, Math.max(1, Math.round(op.weights?.[i] ?? q.members.find((m) => m.user === user)?.weight ?? 1))) }));
      } else if (op.weights) q.members = q.members.map((m, i) => ({ ...m, weight: Math.min(10, Math.max(1, Math.round(op.weights![i] ?? m.weight))) }));
      if (op.method) {
        if (!METHOD_IDS.includes(op.method)) return { error: "method is rr, weighted or load." };
        q.method = op.method;
      }
      if (typeof op.strict === "boolean") q.strict = op.strict;
      if (typeof op.hoursOnly === "boolean") q.hoursOnly = op.hoursOnly;
      return done(`Changed the ${q.name} team`);
    }
    case "remove_team": {
      const q = findTeam(b, op.team);
      if (!q) return { error: `No team ${op.team}.` };
      if (b.rules.list.some((r) => r.queue === q.id && (r.then ?? "queue") === "queue")) return { error: `A rule still sends leads to ${q.name}. Change or remove that rule first.` };
      if (b.fallback?.kind === "queue" && b.fallback.id === q.id) return { error: `${q.name} gets everyone else. Pick someone else for that first.` };
      b.queues = b.queues.filter((x) => x !== q);
      return done(`Removed the ${q.name} team`);
    }
    case "add_region": {
      const name = (op.name ?? "").trim().slice(0, 60);
      if (!name) return { error: "Name the region." };
      const known = REGIONS.find((r) => r.name.toLowerCase() === name.toLowerCase());
      const countries = [...new Set((op.countries?.length ? op.countries : (known?.countries ?? [])).map((c) => String(c).trim().toUpperCase()))];
      if (!countries.length || countries.some((c) => !/^[A-Z]{2}$/.test(c))) return { error: "Pass the region's countries as two-letter codes." };
      const had = b.territories.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (had) {
        had.countries = countries;
        return done(`Changed ${had.name}`, had.id);
      }
      const t = { id: newId("t_"), name, countries };
      b.territories.push(t);
      return done(`Made the region ${name}`, t.id);
    }
    case "add_company_type": {
      const name = (op.name ?? "").trim().slice(0, 60);
      if (!name) return { error: "Name the company type." };
      if ((b.segments ?? []).some((sg) => sg.name.toLowerCase() === name.toLowerCase())) return { error: `There's already a company type called ${name}.` };
      const c = checkConds(b, ctx, op.conds);
      if ("error" in c) return c;
      if (!c.conds.length) return { error: "A company type needs at least one condition." };
      if (c.conds.some((x) => x.field === "company.type")) return { error: "A company type can't test company type." };
      const sg = { id: newId("s_"), name, match: op.match === "any" ? ("any" as const) : ("all" as const), conds: c.conds };
      b.segments = [...(b.segments ?? []), sg];
      return done(`Made the company type ${name}`, sg.id);
    }
    case "add_rule": {
      const c = checkConds(b, ctx, op.conds);
      if ("error" in c) return c;
      if (!c.conds.length) return { error: "A rule needs at least one condition." };
      const then: Then = op.then ?? "queue";
      if (!["queue", "owner", "hold"].includes(then)) return { error: "then is queue, owner or hold." };
      let queue = "";
      if (then === "queue") {
        const t = target(b, ctx, op);
        if ("error" in t) return t;
        queue = t.queue;
      }
      const rule: Rule = { id: newId("r_"), name: (op.name ?? "").trim().slice(0, 80) || ruleName(b, c.conds, fields), match: op.match === "any" ? "any" : "all", conds: c.conds, queue, ...(then !== "queue" ? { then } : {}) };
      const at = typeof op.at === "number" ? Math.max(0, Math.min(b.rules.list.length, Math.round(op.at))) : b.rules.list.length;
      b.rules.list.splice(at, 0, rule);
      b.rules.on = true;
      return done(`Added the rule "${rule.name}"`, rule.id);
    }
    case "edit_rule": {
      const r = findRule(b, op.rule);
      if (!r) return { error: `No rule ${op.rule}.` };
      if (op.name !== undefined) r.name = op.name.trim().slice(0, 80) || r.name;
      if (op.match) r.match = op.match === "any" ? "any" : "all";
      if (op.conds) {
        const c = checkConds(b, ctx, op.conds);
        if ("error" in c) return c;
        if (!c.conds.length) return { error: "A rule needs at least one condition." };
        r.conds = c.conds;
      }
      if (op.then) {
        if (!["queue", "owner", "hold"].includes(op.then)) return { error: "then is queue, owner or hold." };
        if (op.then === "queue") delete r.then;
        else r.then = op.then;
      }
      if (op.team || op.person) {
        const t = target(b, ctx, op);
        if ("error" in t) return t;
        r.queue = t.queue;
        delete r.then;
      }
      if (typeof op.on === "boolean") {
        if (op.on) delete r.on;
        else r.on = false;
      }
      return done(`Changed the rule "${r.name}"`, r.id);
    }
    case "move_rule": {
      const i = b.rules.list.findIndex((r) => r.id === op.rule || r.name.toLowerCase() === op.rule.toLowerCase());
      if (i < 0) return { error: `No rule ${op.rule}.` };
      const to = Math.max(0, Math.min(b.rules.list.length - 1, Math.round(op.to)));
      const [r] = b.rules.list.splice(i, 1);
      b.rules.list.splice(to, 0, r!);
      return done(`Moved "${r!.name}" to place ${to + 1}`);
    }
    case "remove_rule": {
      const r = findRule(b, op.rule);
      if (!r) return { error: `No rule ${op.rule}.` };
      b.rules.list = b.rules.list.filter((x) => x !== r);
      return done(`Removed the rule "${r.name}"`);
    }
    case "set_everyone_else": {
      if (op.person) {
        const m = findMember(ctx, op.person);
        if ("error" in m) return m;
        b.fallback = { kind: "user", id: m.id };
        return done(`Fallback set to ${ctx.members.find((x) => x.id === m.id)?.name ?? "them"}`);
      }
      if (op.team) {
        const q = findTeam(b, op.team);
        if (!q) return { error: `No team ${op.team}. Call add_team first.` };
        b.fallback = { kind: "queue", id: q.id };
        return done(`Fallback set to the ${q.name} team`);
      }
      return { error: "Say which team or person gets everyone else." };
    }
  }
  return { error: "Unknown change." };
}

const problemKeys = (body: RouterBody, ctx: OpCtx) => problems(body, { members: new Set(ctx.members.map((m) => m.id)), fields: ctx.fields }).map((p) => p.text);

/**
 * Apply one op for the chat: refused when it would add a problem the setup didn't have. "Pick a fallback" is allowed
 * while the setup is still being built (no fallback yet), so the chat can add rules before it sets everyone else.
 */
export function applyStrict(body: RouterBody, op: RouterOp, ctx: OpCtx): Applied {
  const r = applyOp(body, op, ctx);
  if ("error" in r) return r;
  const before = new Set(problemKeys(body, ctx));
  const added = problemKeys(r.body, ctx).filter((p) => !before.has(p) && p !== "Pick a fallback");
  if (added.length) return { error: `That would leave a problem: ${added.join("; ")}. Fix it in the same change.` };
  return r;
}

/** What stops a setup from going live, as one short line for the Publish button. Empty when it can go live. */
export function firstProblem(body: RouterBody, ctx: OpCtx): string {
  const p = problems(body, { members: new Set(ctx.members.map((m) => m.id)), fields: ctx.fields });
  if (!p.length) return "";
  return problemWords(p[0]!.text);
}
