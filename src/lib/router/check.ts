// Checking a router before it's saved or published (docs/router-ux.md 4.2): `cleanBody` turns anything sent in into a
// valid body (bad parts dropped or fixed, so a draft always saves), and `problems` lists what stops it from going
// live, each tied to the card it belongs to. Both run in the browser and on the server.

import { BASE_FIELDS, needsValue, opsFor, type FieldDef } from "./conditions.ts";
import { defaultSla, emptyBody, METHODS, OPS, type Cond, type Member, type Queue, type Rule, type RouterBody, type Segment, type Sla, type Territory, type WhenOut } from "./types.ts";

const ID = /^[a-z0-9_-]{1,40}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const b = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 10)}`;

function cleanCond(raw: unknown): Cond | null {
  const r = obj(raw);
  const field = s(r.field, 80);
  const op = OPS.find((o) => o.value === r.op)?.value;
  if (!/^[a-z]+\.[a-z0-9_.]{1,60}$/i.test(field) || !op) return null;
  if (!needsValue(op)) return { field, op };
  const v = r.value;
  if (Array.isArray(v)) return { field, op, value: v.filter((x) => typeof x === "string" || typeof x === "number").map((x) => (typeof x === "string" ? x.trim().slice(0, 200) : x)).slice(0, 300) };
  if (typeof v === "number" && Number.isFinite(v)) return { field, op, value: v };
  if (typeof v === "string") return { field, op, value: v.trim().slice(0, 200) };
  return { field, op };
}

function cleanQueue(raw: unknown): Queue | null {
  const r = obj(raw);
  const id = s(r.id, 40);
  if (!ID.test(id)) return null;
  const seen = new Set<string>();
  const members: Member[] = [];
  for (const m of arr(r.members)) {
    const x = obj(m);
    const user = s(x.user, 36);
    if (!UUID.test(user) || seen.has(user)) continue;
    seen.add(user);
    const w = typeof x.weight === "number" ? Math.round(x.weight) : 1;
    members.push({ user, weight: Math.min(10, Math.max(1, w)) });
  }
  return {
    id,
    name: s(r.name, 80) || "Queue",
    method: METHODS.find((m) => m.value === r.method)?.value ?? "rr",
    strict: b(r.strict, false),
    hoursOnly: b(r.hoursOnly, false),
    members: members.slice(0, 100),
  };
}

function cleanTerritory(raw: unknown): Territory | null {
  const r = obj(raw);
  const id = s(r.id, 40);
  if (!ID.test(id)) return null;
  const countries = [...new Set(arr(r.countries).filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()).filter((x) => /^[A-Z]{2}$/.test(x)))];
  return { id, name: s(r.name, 60) || "Territory", countries };
}

function cleanSegment(raw: unknown): Segment | null {
  const r = obj(raw);
  const id = s(r.id, 40);
  const name = s(r.name, 60);
  if (!ID.test(id) || !name) return null;
  return { id, name, match: r.match === "any" ? "any" : "all", conds: arr(r.conds).map(cleanCond).filter((c): c is Cond => !!c && c.field !== "company.type").slice(0, 20) };
}

/** A response time kept in range: 5 minutes to 7 days, the nudge before the deadline. */
export function cleanSla(raw: unknown): Sla {
  const r = obj(raw);
  const d = defaultSla();
  const minutes = typeof r.minutes === "number" && Number.isFinite(r.minutes) ? Math.min(10080, Math.max(5, Math.round(r.minutes))) : d.minutes;
  const n = typeof r.nudge === "number" && Number.isFinite(r.nudge) ? Math.round(r.nudge) : r.nudge === null ? null : d.nudge;
  const nudge = n !== null && n >= 1 && n < minutes ? n : null;
  const next = r.next === "manager" || r.next === "nudge" ? r.next : "route";
  const manager = s(r.manager, 36);
  return { on: b(r.on, false), minutes, nudge, next, manager: UUID.test(manager) ? manager : null };
}

/** Any input to a valid body. Unknown parts are dropped; numbers are kept in range. */
export function cleanBody(raw: unknown): RouterBody {
  const r = obj(raw);
  const d = emptyBody();
  const spam = obj(r.spam);
  const account = obj(r.account);
  const keep = obj(r.keep);
  const rules = obj(r.rules);
  const queues = arr(r.queues).map(cleanQueue).filter((q): q is Queue => !!q);
  const qids = new Set(queues.map((q) => q.id));
  const territories = arr(r.territories).map(cleanTerritory).filter((t): t is Territory => !!t);
  const list: Rule[] = [];
  for (const x of arr(rules.list)) {
    const o = obj(x);
    const id = s(o.id, 40);
    if (!ID.test(id) || list.some((y) => y.id === id)) continue;
    list.push({
      id,
      name: s(o.name, 80) || "Rule",
      match: o.match === "any" ? "any" : "all",
      conds: arr(o.conds).map(cleanCond).filter((c): c is Cond => !!c).slice(0, 30),
      queue: s(o.queue, 40),
      ...(o.on === false ? { on: false } : {}),
      ...(o.then === "owner" || o.then === "hold" ? { then: o.then } : {}),
    });
  }
  const fb = obj(r.fallback);
  const fbId = s(fb.id, 40);
  const fallback =
    fb.kind === "user" && UUID.test(fbId) ? ({ kind: "user", id: fbId } as const) : fb.kind === "queue" && qids.has(fbId) ? ({ kind: "queue", id: fbId } as const) : null;
  const max = typeof spam.maxPerHour === "number" ? Math.round(spam.maxPerHour) : d.spam.maxPerHour;
  return {
    v: 1,
    spam: {
      on: b(spam.on, d.spam.on),
      disposable: b(spam.disposable, d.spam.disposable),
      fakeName: b(spam.fakeName, d.spam.fakeName),
      tooMany: b(spam.tooMany, d.spam.tooMany),
      freeMail: b(spam.freeMail, d.spam.freeMail),
      maxPerHour: Math.min(100, Math.max(1, max)),
    },
    account: { on: b(account.on, d.account.on), oppFirst: b(account.oppFirst, d.account.oppFirst), setCompanyOwner: b(account.setCompanyOwner, d.account.setCompanyOwner) },
    keep: { on: b(keep.on, d.keep.on), whenOut: (["keep", "backup", "route"] as WhenOut[]).includes(keep.whenOut as WhenOut) ? (keep.whenOut as WhenOut) : d.keep.whenOut },
    rules: { on: b(rules.on, true), list: list.slice(0, 100) },
    queues: queues.slice(0, 50),
    fallback,
    territories: territories.slice(0, 50),
    segments: arr(r.segments)
      .map(cleanSegment)
      .filter((x, i, all): x is Segment => !!x && all.findIndex((y) => y?.name.toLowerCase() === x.name.toLowerCase()) === i)
      .slice(0, 50),
    sla: r.sla === undefined ? defaultSla() : cleanSla(r.sla),
  };
}

/** Where a problem is: a step, a rule, a queue or the fallback. The editor puts it on that card. */
export type Where = { kind: "rule" | "queue" | "fallback" | "spam" | "account" | "keep" | "sla" | "segment"; id?: string };
export type Problem = { where: Where; text: string };

/** What stops a body from going live. `members`: workspace members' ids. `fields`: every field a rule may test. */
export function problems(body: RouterBody, o: { members: Set<string>; fields?: FieldDef[] }): Problem[] {
  const out: Problem[] = [];
  const fields = o.fields ?? BASE_FIELDS;
  const known = (key: string) => fields.some((f) => f.key === key) || /^(answer|contact\.f|company\.f)\./.test(key);
  const qById = new Map(body.queues.map((q) => [q.id, q]));
  for (const r of body.rules.on ? body.rules.list : []) {
    if (r.on === false) continue;
    const where: Where = { kind: "rule", id: r.id };
    if (!r.conds.length) out.push({ where, text: `"${r.name}" has no conditions` });
    if ((r.then ?? "queue") === "queue" && !qById.has(r.queue)) out.push({ where, text: `"${r.name}" has no team` });
    for (const c of r.conds) {
      const f = fields.find((x) => x.key === c.field);
      if (!known(c.field)) out.push({ where, text: `"${r.name}" tests a field that's gone` });
      else if (f && !opsFor(f.type).includes(c.op)) out.push({ where, text: `"${r.name}" uses a test that doesn't fit ${f.label.toLowerCase()}` });
      if (needsValue(c.op) && (c.value === undefined || c.value === "" || (Array.isArray(c.value) && !c.value.length))) out.push({ where, text: `"${r.name}" has a condition with no value` });
      if (c.op === "between" && (!Array.isArray(c.value) || c.value.length !== 2)) out.push({ where, text: `"${r.name}" needs two numbers for "between"` });
      const list = Array.isArray(c.value) ? c.value : [c.value];
      for (const v of list) if (typeof v === "string" && v.startsWith("t:") && !body.territories.some((t) => t.id === v.slice(2))) out.push({ where, text: `"${r.name}" uses a territory that's gone` });
    }
  }
  const used = new Set([...body.rules.list.filter((r) => r.on !== false && (r.then ?? "queue") === "queue").map((r) => r.queue), ...(body.fallback?.kind === "queue" ? [body.fallback.id] : [])]);
  for (const q of body.queues) {
    const where: Where = { kind: "queue", id: q.id };
    if (!used.has(q.id)) continue;
    if (!q.members.length) out.push({ where, text: `${q.name} has no reps` });
    const gone = q.members.filter((m) => !o.members.has(m.user)).length;
    if (gone) out.push({ where, text: `${q.name} has ${gone === 1 ? "a rep" : `${gone} reps`} no longer in the workspace` });
  }
  if (!body.fallback) out.push({ where: { kind: "fallback" }, text: "Pick a fallback" });
  else if (body.fallback.kind === "user" && !o.members.has(body.fallback.id)) out.push({ where: { kind: "fallback" }, text: "The fallback is no longer in the workspace" });
  const types = new Set((body.segments ?? []).map((x) => x.name.toLowerCase()));
  for (const seg of body.segments ?? []) if (!seg.conds.length) out.push({ where: { kind: "segment", id: seg.id }, text: `${seg.name} has no conditions` });
  for (const r of body.rules.on ? body.rules.list : []) {
    if (r.on === false) continue;
    for (const c of r.conds) {
      if (c.field !== "company.type" || !needsValue(c.op)) continue;
      const list = Array.isArray(c.value) ? c.value : [c.value];
      if (list.some((v) => typeof v === "string" && !types.has(v.toLowerCase()))) out.push({ where: { kind: "rule", id: r.id }, text: `"${r.name}" uses a company type that's gone` });
    }
  }
  const sla = body.sla;
  if (sla?.on && sla.next === "manager") {
    if (!sla.manager) out.push({ where: { kind: "sla" }, text: "Pick a manager for missed response times" });
    else if (!o.members.has(sla.manager)) out.push({ where: { kind: "sla" }, text: "The manager is no longer in the workspace" });
  }
  return out;
}
