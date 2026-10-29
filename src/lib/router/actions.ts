// What the Routing screens ask the server for (docs/router-ux.md 7.3): one `routingAction` per call, after the caller
// is known to be a member (and an owner, for changes). Reads that members can do straight from the database (Log,
// Reps, Held) stay in the screens with row security; everything here needs the service role or the engine.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "../jobs.ts";
import { enqueueJob } from "../jobs.ts";
import { allFields, isContent, type Form } from "../forms/schema.ts";
import { cleanBody, problems } from "./check.ts";
import { BASE_FIELDS, type FieldDef } from "./conditions.ts";
import { diffBodies } from "./diff.ts";
import { decide, whyNot } from "./engine.ts";
import { explain, pathWords, resultWords, type Line } from "./explain.ts";
import { liveRouter, route, testRoute } from "./server.ts";
import { fromLeadSettings, type OldRouting } from "./templates.ts";
import { slackInstallUrl, slackReady } from "../slack/app.ts";
import { signState } from "../sources/oauth.ts";
import { emptyBody, type Decision, type Facts, type RouterBody, type Run } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Caller = { ws: string; user: string; role: "owner" | "member" };

export class Refused extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

type Q = SupabaseClient;

const ownerOnly = (c: Caller) => {
  if (c.role !== "owner") throw new Refused(403, "Only workspace owners can change routing.");
};

export type Member = { id: string; name: string; email: string };

/** The fields rules can test: the base ones, custom contact and company fields, and the answers on live forms. */
export async function fieldsFor(db: Q, ws: string): Promise<{ fields: FieldDef[]; forms: { id: string; name: string }[] }> {
  const fields: FieldDef[] = [...BASE_FIELDS];
  const custom = ((await db.from("fields").select("object, key, label, type, options").eq("workspace_id", ws)).data ?? []) as { object: string; key: string; label: string; type: string; options: unknown[] }[];
  for (const f of custom) {
    const opts = (f.options ?? []).map((o) => (typeof o === "string" ? o : (o as { value?: string; label?: string })?.value ?? (o as { label?: string })?.label ?? "")).filter(Boolean);
    fields.push({
      key: `${f.object}.f.${f.key}`,
      label: f.label,
      group: f.object === "company" ? "Company" : "Contact",
      type: f.type === "number" ? "number" : f.type === "enum" ? "choice" : f.type === "bool" ? "bool" : "text",
      ...(opts.length ? { options: opts } : {}),
    });
  }
  const forms = ((await db.from("forms").select("id, name, status").eq("workspace_id", ws)).data ?? []) as { id: string; name: string; status: string }[];
  const formField = fields.find((f) => f.key === "lead.form");
  if (formField) formField.options = forms.map((f) => f.id);
  const versions = ((await db.from("form_versions").select("form_id, version, body").in("form_id", forms.map((f) => f.id).slice(0, 200)).order("version", { ascending: false })).data ?? []) as { form_id: string; body: Form }[];
  const seen = new Set<string>();
  const latest = versions.filter((v) => !seen.has(v.form_id) && (seen.add(v.form_id), true));
  const answers = new Map<string, FieldDef>();
  for (const v of latest)
    for (const f of allFields(v.body)) {
      if (isContent(f.type) || f.type === "hidden" || f.type === "consent" || ["email", "first_name", "last_name"].includes(f.key)) continue;
      const key = `answer.${f.key}`;
      if (answers.has(key)) continue;
      answers.set(key, {
        key,
        label: f.label || f.key,
        group: "Form answers",
        type: f.type === "number" || f.type === "rating" ? "number" : f.type === "country" ? "country" : f.options?.length ? "choice" : "text",
        ...(f.options?.length ? { options: f.options.map((o) => o.value) } : {}),
      });
    }
  return { fields: [...fields, ...answers.values()], forms: forms.map((f) => ({ id: f.id, name: f.name })) };
}

async function membersOf(rpc: Rpc, db: Q, ws: string): Promise<Member[]> {
  const rows = ((await db.from("workspace_members").select("user_id").eq("workspace_id", ws)).data ?? []) as { user_id: string }[];
  const ids = rows.map((r) => r.user_id);
  const people = (await call<{ id: string; name: string; email: string }[]>(rpc, "meeting_people", { p_ws: ws, p_users: ids })) ?? [];
  return people.map((p) => ({ id: p.id, name: p.name, email: p.email }));
}

type RouterRow = { live_version: number | null; draft: RouterBody | null; draft_base: number | null; draft_revision: number; draft_at: string | null; allow: string[]; block: string[]; alert_label: string | null };

async function routerRow(db: Q, ws: string): Promise<RouterRow | null> {
  return ((await db.from("routers").select("live_version, draft, draft_base, draft_revision, draft_at, allow, block, alert_label").eq("workspace_id", ws).maybeSingle()).data as RouterRow | null) ?? null;
}

/** Everything the Router screen opens with. */
export async function load(rpc: Rpc, db: Q, c: Caller) {
  const [row, live, members, f, stats, slack, chatRow] = await Promise.all([
    routerRow(db, c.ws),
    liveRouter(rpc, c.ws),
    membersOf(rpc, db, c.ws),
    fieldsFor(db, c.ws),
    call<Record<string, unknown>>(rpc, "router_stats", { p_ws: c.ws, p_days: 7 }),
    db.from("slack_installs").select("team_name, created_at").eq("workspace_id", c.ws).maybeSingle(),
    db.from("router_chats").select("messages").eq("workspace_id", c.ws).maybeSingle(),
  ]);
  const versions = ((await db.from("router_versions").select("version, note, published_by, published_at").eq("workspace_id", c.ws).order("version", { ascending: false }).limit(100)).data ?? []) as unknown[];
  let legacy: { body: RouterBody; unmapped: string[] } | null = null;
  if (!row?.live_version && !row?.draft) {
    const ls = ((await db.from("lead_settings").select("routing").eq("workspace_id", c.ws).maybeSingle()).data as { routing: OldRouting } | null) ?? null;
    if (ls?.routing?.rules?.length || ls?.routing?.default?.owners?.length) {
      const links = ((await db.from("crm_owner_links").select("crm_owner_id, user_id").eq("workspace_id", c.ws)).data ?? []) as { crm_owner_id: string; user_id: string | null }[];
      legacy = fromLeadSettings(ls.routing, (crm) => links.find((l) => l.crm_owner_id === crm)?.user_id ?? null);
    }
  }
  const memberSet = new Set(members.map((m) => m.id));
  const draft = row?.draft ? cleanBody(row.draft) : null;
  return {
    live: live ? { version: live.version, body: cleanBody(live.body) } : null,
    paused: !!live?.paused,
    draft,
    draftBase: row?.draft_base ?? null,
    revision: row?.draft_revision ?? 0,
    problems: draft ? problems(draft, { members: memberSet, fields: f.fields }) : [],
    versions,
    members,
    fields: f.fields,
    forms: f.forms,
    stats,
    lists: { allow: row?.allow ?? [], block: row?.block ?? [] },
    alert: { label: row?.alert_label ?? null },
    slack: { ready: slackReady(), team: slack.data ? ((slack.data as { team_name: string | null }).team_name ?? "Slack") : null },
    legacy,
    chat: ((chatRow.data as { messages?: ChatMessage[] } | null)?.messages ?? []).slice(-40),
  };
}

/** One message in the routing chat, as router_chats keeps it. */
export type ChatMessage = { role: "user" | "assistant"; text: string; lines?: string[]; ask?: { question: string; choices: string[] }; at: string };

export async function saveDraft(rpc: Rpc, c: Caller, body: unknown, revision: number | null) {
  ownerOnly(c);
  const clean = cleanBody(body);
  const { data, error } = await rpc("router_draft_save", { p_ws: c.ws, p_body: clean, p_revision: revision, p_user: c.user });
  if (error) {
    if (error.message.includes("conflict")) throw new Refused(409, "Someone else changed the draft.");
    throw new Error(error.message);
  }
  return { revision: data as number, body: clean };
}

export async function dropDraft(rpc: Rpc, c: Caller) {
  ownerOnly(c);
  await call(rpc, "router_draft_drop", { p_ws: c.ws });
  return { ok: true };
}

export async function publish(rpc: Rpc, db: Q, c: Caller, note: string | null) {
  ownerOnly(c);
  const row = await routerRow(db, c.ws);
  if (!row?.draft) throw new Refused(400, "There's no draft to publish.");
  const body = cleanBody(row.draft);
  const members = await membersOf(rpc, db, c.ws);
  const f = await fieldsFor(db, c.ws);
  const ps = problems(body, { members: new Set(members.map((m) => m.id)), fields: f.fields });
  if (ps.length) throw new Refused(400, ps.map((p) => p.text).join(". "));
  const version = await call<number>(rpc, "router_publish", { p_ws: c.ws, p_body: body, p_note: note?.trim().slice(0, 300) || null, p_user: c.user, p_clear_draft: true });
  return { version };
}

export async function rollback(rpc: Rpc, db: Q, c: Caller, version: number) {
  ownerOnly(c);
  const v = (await db.from("router_versions").select("body").eq("workspace_id", c.ws).eq("version", version).maybeSingle()).data as { body: RouterBody } | null;
  if (!v) throw new Refused(404, "That version is gone.");
  const out = await call<number>(rpc, "router_publish", { p_ws: c.ws, p_body: cleanBody(v.body), p_note: `Rolled back to v${version}`, p_user: c.user, p_clear_draft: false });
  return { version: out };
}

/** Changes between two bodies (or the draft and live), for Publish and Compare. */
export async function changes(rpc: Rpc, db: Q, c: Caller, o: { from?: number | null; to?: number | "draft" }) {
  const row = await routerRow(db, c.ws);
  const bodyOf = async (v: number | "draft" | null | undefined): Promise<RouterBody | null> => {
    if (v === "draft") return row?.draft ? cleanBody(row.draft) : null;
    const n = v ?? row?.live_version;
    if (!n) return null;
    const x = (await db.from("router_versions").select("body").eq("workspace_id", c.ws).eq("version", n).maybeSingle()).data as { body: RouterBody } | null;
    return x ? cleanBody(x.body) : null;
  };
  const [a, b] = await Promise.all([bodyOf(o.from ?? null), bodyOf(o.to ?? "draft")]);
  if (!b) return { changes: [] };
  const members = await membersOf(rpc, db, c.ws);
  const f = await fieldsFor(db, c.ws);
  return { changes: diffBodies(a, b, { names: Object.fromEntries(members.map((m) => [m.id, m.name])), fields: f.fields }) };
}

type Tested = { result: Decision["result"]; owner: string; path: string; lines: Line[]; whyNot?: ReturnType<typeof whyNot> & { words: string } };

function shown(d: Decision, f: Facts, body: RouterBody, fields: FieldDef[], why?: string | null): Tested {
  const out: Tested = { result: d.result, owner: resultWords(d, f), path: pathWords(d), lines: explain(d, f, { fields, territories: body.territories }) };
  if (why) {
    const w = whyNot(body, f, d, why);
    const name = f.reps[why]?.name ?? "They";
    const words: Record<string, string> = {
      picked: `${name} got it.`,
      held: "It was held, so no one got it.",
      owner_kept: "It stayed with its owner.",
      not_in_queue: `${name} isn't in ${w.queue ?? "that queue"}.`,
      not_their_turn: `It wasn't ${name}'s turn in ${w.queue ?? "the queue"}.`,
    };
    out.whyNot = { ...w, words: words[w.why] ?? `${name} ${explainWhy(w.why, w.until, f, why)}.` };
  }
  return out;
}

function explainWhy(why: string, until: number | null | undefined, f: Facts, user: string): string {
  const r = f.reps[user];
  switch (why) {
    case "paused":
      return until ? `is paused until ${new Date(until).toDateString()}` : "is paused";
    case "out":
      return until ? `is out of office until ${new Date(until).toDateString()}` : "is out of office";
    case "cap_day":
      return `is at their daily cap of ${r?.capDay ?? "?"}`;
    case "cap_week":
      return `is at their weekly cap of ${r?.capWeek ?? "?"}`;
    case "hours":
      return "is outside their working hours";
    case "not_member":
      return "is no longer in the workspace";
    default:
      return "can't take it";
  }
}

/** The Test panel: an email or a contact, with changed fields, against the draft, live or both. Writes nothing. */
export async function test(rpc: Rpc, db: Q, c: Caller, o: { email?: string | null; contact?: string | null; changes?: Record<string, unknown>; which: "draft" | "live" | "both"; whyNot?: string | null; draft?: unknown }) {
  const row = await routerRow(db, c.ws);
  const live = await liveRouter(rpc, c.ws);
  const f = await fieldsFor(db, c.ws);
  let contact = o.contact && /^[0-9a-f-]{36}$/.test(o.contact) ? o.contact : null;
  if (!contact && o.email) {
    const e = o.email.trim().toLowerCase();
    contact = ((await db.from("contacts").select("id").eq("workspace_id", c.ws).eq("email_clean", e).is("deleted_at", null).limit(1).maybeSingle()).data as { id: string } | null)?.id ?? null;
  }
  if (!contact && !o.email) throw new Refused(400, "Type an email or pick a contact.");
  const run = async (body: RouterBody | null) => {
    if (!body) return null;
    const r = await testRoute(rpc, { ws: c.ws, contact, email: contact ? null : o.email, body, changes: o.changes });
    return r ? shown(r.decision, r.facts, body, f.fields, o.whyNot) : null;
  };
  // The editor sends its unsaved draft so the test follows every edit at once.
  const draftBody = o.draft ? cleanBody(o.draft) : row?.draft ? cleanBody(row.draft) : null;
  const [draft, liveOut] = await Promise.all([o.which !== "live" ? run(draftBody) : null, o.which !== "draft" ? run(live ? cleanBody(live.body) : null) : null]);
  return { contact, draft, live: liveOut };
}

type ReplayGroup = { from: string; to: string; fromName: string; toName: string; count: number; runs: { run: string; contact: string | null; name: string; before: Line[]; after: Line[] }[] };

/**
 * Replay (docs/router-ux.md 4.4): the draft on past runs, in time order, with each run's own facts and the turns the
 * draft's queues would have had. Writes nothing.
 */
export async function replay(db: Q, c: Caller, o: { days: number; draft?: unknown }) {
  ownerOnly(c);
  const row = await routerRow(db, c.ws);
  const body = o.draft ? cleanBody(o.draft) : row?.draft ? cleanBody(row.draft) : null;
  if (!body) throw new Refused(400, "There's no draft to replay.");
  const days = Math.min(90, Math.max(1, Math.round(o.days || 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const runs = ((await db
    .from("router_runs")
    .select("id, contact_id, key, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, created_at")
    .eq("workspace_id", c.ws)
    .gte("created_at", since)
    .not("reason", "in", "(manual)")
    .order("created_at", { ascending: true })
    .limit(5000)).data ?? []) as (Omit<Run, "result"> & { kind: string; owner: string | null; by: string | null })[];
  const sim: Record<string, Record<string, { n: number; last: number }>> = {};
  const fields = (await fieldsFor(db, c.ws)).fields;
  const groups = new Map<string, ReplayGroup>();
  let same = 0;
  let held = 0;
  let unassigned = 0;
  // Where every lead would go under the draft, for the plan card's split (docs/routing-chat-plan.md 1.2).
  const split: Record<string, number> = {};
  for (const r of runs) {
    const f = r.facts as Facts;
    if (!f?.lead || !f.reps) continue;
    // Turns as the draft's queues would have had them: what the first run saw, then the draft's own picks.
    for (const q of body.queues) if (!sim[q.id]) sim[q.id] = structuredClone(f.counts?.[q.id] ?? {});
    const d = decide(body, { ...f, counts: sim });
    if (d.result.kind === "owner" && d.result.queue) {
      const m = sim[d.result.queue]!;
      m[d.result.user] = { n: (m[d.result.user]?.n ?? 0) + 1, last: f.now };
    }
    const before = r.kind === "owner" ? (r.owner ?? "") : r.kind;
    const after = d.result.kind === "owner" ? d.result.user : d.result.kind;
    split[after] = (split[after] ?? 0) + 1;
    if (d.result.kind === "held") held++;
    if (d.result.kind === "unassigned") unassigned++;
    if (before === after) {
      same++;
      continue;
    }
    const name = (x: string) => (x === "held" ? "Held" : x === "unassigned" ? "Unassigned" : (f.reps[x]?.name ?? "Someone"));
    const k = `${before}>${after}`;
    const g = groups.get(k) ?? { from: before, to: after, fromName: name(before), toName: name(after), count: 0, runs: [] };
    g.count++;
    if (g.runs.length < 50) {
      const old: Decision = { result: r.kind === "owner" ? { kind: "owner", user: r.owner ?? "", by: (r.by ?? "queue") as "queue" } : r.kind === "held" ? { kind: "held", signals: [] } : { kind: "unassigned" }, steps: r.steps };
      g.runs.push({ run: r.id, contact: r.contact_id, name: f.lead.name || f.lead.email || "A lead", before: explain(old, f, { fields, territories: body.territories }), after: explain(d, f, { fields, territories: body.territories }) });
    }
    groups.set(k, g);
  }
  const list = [...groups.values()].sort((a, b) => b.count - a.count);
  return { total: runs.length, same, changed: runs.length - same, held, unassigned, groups: list, days, split };
}

/** Route again: one lead now, or many by a job each. The lead's earlier runs give their turns back. */
export async function routeAgain(rpc: Rpc, c: Caller, contacts: string[]) {
  const ids = contacts.filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 5000);
  if (!ids.length) throw new Refused(400, "Pick a contact.");
  if (c.role !== "owner" && ids.length > 1) throw new Refused(403, "Only workspace owners can route many at once.");
  const stamp = Date.now();
  if (ids.length === 1) {
    await call(rpc, "router_undo", { p_ws: c.ws, p_contact: ids[0] });
    const r = await route(rpc, { ws: c.ws, contact: ids[0]!, key: `again:${ids[0]}:${stamp}`, reason: "again", byUser: c.user, force: true });
    return r.status === "ok" || r.status === "dup" ? { routed: 1, run: r.run, result: r.result } : { routed: 0, status: r.status };
  }
  for (const id of ids) await enqueueJob(rpc, { workspaceId: c.ws, kind: "route", key: `again:${id}:${stamp}`, payload: { contact: id, reason: "again", key: `again:${id}:${stamp}`, undo: true, byUser: c.user } });
  return { queued: ids.length };
}

/** Change a rep's pause, out-of-office dates, backup or caps. A rep changes their own; owners change anyone's. */
export async function saveRep(rpc: Rpc, c: Caller, user: string, patch: Record<string, unknown>) {
  if (user !== c.user) ownerOnly(c);
  const clean: Record<string, unknown> = {};
  if ("paused_until" in patch) {
    const v = patch.paused_until;
    clean.paused_until = v === null || v === "" ? "" : v === "infinity" ? "infinity" : typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : "";
  }
  if ("out_dates" in patch && Array.isArray(patch.out_dates)) {
    clean.out_dates = patch.out_dates
      .filter((d): d is { from: string; to: string } => !!d && typeof d === "object" && /^\d{4}-\d{2}-\d{2}$/.test(String((d as { from?: unknown }).from)) && /^\d{4}-\d{2}-\d{2}$/.test(String((d as { to?: unknown }).to)))
      .map((d) => (d.from <= d.to ? { from: d.from, to: d.to } : { from: d.to, to: d.from }))
      .slice(0, 50);
  }
  if ("backup" in patch) {
    if (c.role !== "owner" && user === c.user && patch.backup !== undefined) ownerOnly(c);
    clean.backup = typeof patch.backup === "string" && /^[0-9a-f-]{36}$/.test(patch.backup) && patch.backup !== user ? patch.backup : "";
  }
  for (const k of ["cap_day", "cap_week"] as const) {
    if (!(k in patch)) continue;
    if (c.role !== "owner") ownerOnly(c);
    const n = typeof patch[k] === "number" ? Math.round(patch[k] as number) : null;
    clean[k] = n && n > 0 ? Math.min(k === "cap_day" ? 1000 : 5000, n) : "";
  }
  await call(rpc, "router_rep_save", { p_ws: c.ws, p_user: user, p_patch: clean });
  return { ok: true };
}

const domainOf = (s: string) => s.trim().toLowerCase().replace(/^@/, "").split("@").pop()!;

/** Held and Unassigned (docs/router-ux.md 4.9). */
export async function heldAction(rpc: Rpc, db: Q, c: Caller, o: { op: string; contacts?: string[]; domain?: string; user?: string }) {
  ownerOnly(c);
  const ids = (o.contacts ?? []).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 1000);
  const row = await routerRow(db, c.ws);
  const stamp = Date.now();
  switch (o.op) {
    case "let_through": {
      const out: { contact: string; owner: string | null; kind: string }[] = [];
      for (const id of ids) {
        await call(rpc, "router_undo", { p_ws: c.ws, p_contact: id });
        const r = await route(rpc, { ws: c.ws, contact: id, key: `let:${id}:${stamp}`, reason: "let_through", byUser: c.user, force: true, skipSpam: true });
        out.push({ contact: id, kind: "result" in r ? r.result.kind : r.status, owner: "result" in r && r.result.kind === "owner" ? r.result.user : null });
      }
      return { done: out };
    }
    case "spam":
      return { done: await call<number>(rpc, "router_spam", { p_ws: c.ws, p_contacts: ids }) };
    case "allow_domain":
    case "block_domain": {
      const d = domainOf(o.domain ?? "");
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Refused(400, "That isn't a domain.");
      const allow = new Set(row?.allow ?? []);
      const block = new Set(row?.block ?? []);
      if (o.op === "allow_domain") {
        allow.add(d);
        block.delete(d);
      } else {
        block.add(d);
        allow.delete(d);
      }
      await call(rpc, "router_lists_save", { p_ws: c.ws, p_allow: [...allow], p_block: [...block] });
      if (o.op === "allow_domain") {
        // Every held lead from that domain goes through now.
        const held = ((await db.from("contacts").select("id, email_clean").eq("workspace_id", c.ws).eq("route_status", "held")).data ?? []) as { id: string; email_clean: string | null }[];
        const match = held.filter((h) => (h.email_clean ?? "").endsWith(`@${d}`) || (h.email_clean ?? "").endsWith(`.${d}`)).map((h) => h.id);
        if (match.length) return heldAction(rpc, db, c, { op: "let_through", contacts: match });
      }
      return { ok: true };
    }
    case "assign": {
      if (!o.user || !/^[0-9a-f-]{36}$/.test(o.user)) throw new Refused(400, "Pick a rep.");
      for (const id of ids) await call(rpc, "router_assign", { p_ws: c.ws, p_contact: id, p_owner: o.user, p_by: c.user });
      return { done: ids.length };
    }
  }
  throw new Refused(400, "Unknown action.");
}

/** The allow and block lists, as typed (one domain or email per line). */
export async function saveLists(rpc: Rpc, c: Caller, allow: unknown, block: unknown) {
  ownerOnly(c);
  const clean = (v: unknown) =>
    Array.isArray(v)
      ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().toLowerCase().replace(/^@/, "")).filter((x) => /^([^\s@]+@)?[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(x)))].slice(0, 2000)
      : null;
  await call(rpc, "router_lists_save", { p_ws: c.ws, p_allow: clean(allow), p_block: clean(block) });
  return { ok: true };
}

/** Where alerts go: a Slack incoming webhook (sealed), with a label for the screens. An empty url removes it. */
export async function saveAlert(db: SupabaseClient, c: Caller, url: string | null, label: string | null, seal: (s: string) => string) {
  ownerOnly(c);
  const u = (url ?? "").trim();
  if (!u) {
    await db.from("router_secrets").delete().eq("workspace_id", c.ws);
    await db.from("routers").upsert({ workspace_id: c.ws, alert_label: null }, { onConflict: "workspace_id" });
    return { ok: true };
  }
  if (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(u)) throw new Refused(400, "Paste a Slack incoming webhook address.");
  await db.from("router_secrets").upsert({ workspace_id: c.ws, sealed: seal(JSON.stringify({ url: u })), updated_at: new Date().toISOString() }, { onConflict: "workspace_id" });
  await db.from("routers").upsert({ workspace_id: c.ws, alert_label: (label ?? "").trim().slice(0, 120) || "Slack" }, { onConflict: "workspace_id" });
  return { ok: true };
}

/** Pause routing (new leads keep the owner they come with), or turn it back on. Owners only. */
export async function setPaused(rpc: Rpc, c: Caller, paused: boolean) {
  ownerOnly(c);
  await call(rpc, "router_pause", { p_ws: c.ws, p_paused: paused, p_user: c.user });
  return { paused };
}

/** "Add to Slack": the sign-in link, for workspace owners. */
export function slackInstall(c: Caller, redirect: string) {
  ownerOnly(c);
  if (!slackReady()) throw new Refused(400, "Slack isn't set up on the server yet.");
  return { url: slackInstallUrl(redirect, signState({ ws: c.ws, user: c.user, kind: "slack" })) };
}

export async function slackRemove(db: SupabaseClient, c: Caller) {
  ownerOnly(c);
  await db.from("slack_installs").delete().eq("workspace_id", c.ws);
  return { ok: true };
}

/** Mark contacted: the lead's owner (or a workspace owner) says they reached out, which meets the response time. */
export async function markContacted(rpc: Rpc, c: Caller, contact: string | null) {
  if (!contact || !UUID.test(contact)) throw new Refused(400, "Pick a lead.");
  const { data, error } = await rpc("router_sla_mark", { p_ws: c.ws, p_contact: contact, p_user: c.user });
  if (error) {
    if (error.message.includes("not_owner")) throw new Refused(403, "Only the lead's owner can mark it contacted.");
    if (error.message.includes("not_found")) throw new Refused(404, "Lead not found.");
    throw new Error(error.message);
  }
  return { met: data === true };
}

/** CRM owners and the teammates they're linked to (Settings › Sources), and owner ids seen with no link yet. */
export async function crmOwners(db: Q, c: Caller) {
  const links = ((await db.from("crm_owner_links").select("source_id, crm_owner_id, label, user_id").eq("workspace_id", c.ws)).data ?? []) as unknown[];
  return { links };
}

export async function saveCrmOwners(db: SupabaseClient, c: Caller, rows: unknown) {
  ownerOnly(c);
  const list = Array.isArray(rows) ? rows : [];
  for (const r of list.slice(0, 500)) {
    const x = r as { source_id?: unknown; crm_owner_id?: unknown; label?: unknown; user_id?: unknown };
    if (typeof x.source_id !== "string" || typeof x.crm_owner_id !== "string") continue;
    const src = (await db.from("sources").select("id").eq("id", x.source_id).eq("workspace_id", c.ws).maybeSingle()).data;
    if (!src) continue;
    await db.from("crm_owner_links").upsert(
      {
        workspace_id: c.ws,
        source_id: x.source_id,
        crm_owner_id: x.crm_owner_id.slice(0, 100),
        label: typeof x.label === "string" ? x.label.slice(0, 200) : null,
        user_id: typeof x.user_id === "string" && /^[0-9a-f-]{36}$/.test(x.user_id) ? x.user_id : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_id,crm_owner_id" },
    );
  }
  return { ok: true };
}

// Routing by chat (docs/routing-chat-plan.md) ---------------------------------------------------------------------

type RunRow = { kind: string; owner: string | null; by: string | null; rule_id: string | null; created_at: string; lead: { name?: string; email?: string } | null; values: Record<string, unknown> | null };

const bucketSize = (v: unknown): string | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "").match(/\d+/)?.[0]) : NaN;
  if (!Number.isFinite(n)) return null;
  return n <= 50 ? "1 to 50" : n <= 200 ? "51 to 200" : n <= 500 ? "201 to 500" : n <= 1000 ? "501 to 1,000" : "over 1,000";
};

/**
 * One chat turn (docs/routing-chat-plan.md Part 2): read the setup, the team, recent leads and the chat so far, run
 * the chat through the step cache, save what it changed as the draft (refused if someone saved since), save rep
 * changes, and keep both messages. Never publishes.
 */
export async function chat(rpc: Rpc, db: Q, c: Caller, o: { message: string; revision: number | null; model: import("./chat.ts").Model | null; clear?: boolean }) {
  ownerOnly(c);
  if (o.clear) {
    await call(rpc, "router_chat_clear", { p_ws: c.ws });
    return { cleared: true };
  }
  const message = o.message.trim().slice(0, 4000);
  if (!message) throw new Refused(400, "Say who should get which leads.");
  if (!o.model) throw new Refused(503, "The chat isn't set up on the server (ANTHROPIC_API_KEY).");
  const { runRouterChat, ROUTER_CHAT_MODEL, ROUTER_SYSTEM, ROUTER_TOOLS } = await import("./chat.ts");
  const { cachedStep, hashKey } = await import("../ai/cache.ts");
  const loaded = await load(rpc, db, c);
  if (o.revision !== null && o.revision !== loaded.revision) throw new Refused(409, "The setup changed in another window. Reload to see the latest.");
  const body = loaded.draft ?? loaded.live?.body ?? loaded.legacy?.body ?? emptyBody();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const runs = await db.from("router_runs").select("kind, owner, by, rule_id, created_at, lead:facts->lead, values:facts->values").eq("workspace_id", c.ws).gte("created_at", since).is("undone_at", null).order("created_at", { ascending: false }).limit(2000);
  const rows = (runs.data ?? []) as unknown as RunRow[];
  const names = Object.fromEntries(loaded.members.map((m) => [m.id, m.name]));
  const tally = (key: (r: RunRow) => string | null) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = key(r);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
  const ruleName = (id: string | null) => body.rules.list.find((r) => r.id === id)?.name ?? "a rule";
  const ctx = {
    body,
    members: loaded.members,
    fields: loaded.fields,
    forms: loaded.forms,
    summary: rows.length ? { leads: rows.length, days: 90, countries: tally((r) => (r.values?.["lead.country"] as string) ?? null), sizes: tally((r) => bucketSize(r.values?.["company.size"])), withOwner: rows.filter((r) => r.by === "account" || r.by === "keep").length } : undefined,
    recent: rows.slice(0, 40).map((r) => ({
      name: r.lead?.name || r.lead?.email || "A lead",
      company: (r.values?.["company.name"] as string) ?? null,
      country: (r.values?.["lead.country"] as string) ?? null,
      size: (r.values?.["company.size"] as string | number) ?? null,
      went: r.kind === "owner" ? (names[r.owner ?? ""] ?? "a former teammate") : r.kind === "held" ? "review" : "no one",
      path: r.by === "account" ? (r.rule_id ? `rule ${ruleName(r.rule_id)}, the owner` : "same company, same rep") : r.by === "keep" ? "kept their rep" : r.by === "queue" ? `rule ${ruleName(r.rule_id)}` : r.by === "fallback" ? "everyone else" : r.kind === "held" ? "held" : "no one could take it",
      at: r.created_at.slice(0, 16).replace("T", " "),
    })),
    history: loaded.chat.filter((m) => m.text).slice(-10).map((m) => ({ role: m.role, text: m.text })),
    today: new Date().toISOString().slice(0, 10),
  };
  const key = hashKey(ROUTER_CHAT_MODEL, ROUTER_SYSTEM, ROUTER_TOOLS, ctx, message);
  const out = (
    await cachedStep(rpc, c.ws, "router_chat", key, async () => {
      const r = await runRouterChat(o.model!, message, ctx);
      const { usage, ...result } = r;
      return { result, model: ROUTER_CHAT_MODEL, usage, keep: !!result.reply && !result.reps.length };
    })
  ).result;
  let revision = loaded.revision;
  if (out.changed) revision = (await saveDraft(rpc, c, out.body, loaded.revision)).revision;
  for (const r of out.reps) {
    const patch: Record<string, unknown> = { ...r.patch };
    if (r.patch.out_dates) {
      const had = ((await db.from("router_reps").select("out_dates").eq("workspace_id", c.ws).eq("user_id", r.user).maybeSingle()).data as { out_dates?: { from: string; to: string }[] } | null)?.out_dates ?? [];
      patch.out_dates = [...had.filter((d) => d.to >= ctx.today), ...r.patch.out_dates];
    }
    await saveRep(rpc, c, r.user, patch);
  }
  const at = new Date().toISOString();
  await call(rpc, "router_chat_add", {
    p_ws: c.ws,
    p_messages: [
      { role: "user", text: message, at },
      { role: "assistant", text: out.reply, ...(out.lines.length ? { lines: out.lines } : {}), ...(out.ask ? { ask: out.ask } : {}), at },
    ],
  });
  return { reply: out.reply, lines: out.lines, ask: out.ask ?? null, revision, changed: out.changed, reps: out.reps.length };
}

