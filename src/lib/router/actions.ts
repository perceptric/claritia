// What the Routing screens ask the server for (docs/router-ux.md 7.3): one `routingAction` per call, after the caller
// is known to be a member (and an owner, for changes). Reads that members can do straight from the database (Log,
// Reps, Held) stay in the screens with row security; everything here needs the service role or the engine.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "../jobs.ts";
import { enqueueJob } from "../jobs.ts";
import { ttlCache } from "../roleCache.ts";
import { rpcOr } from "../rpcCompat.ts";
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

type FieldRow = { object: string; key: string; label: string; type: string; options: unknown[] };
type FormRow = { id: string; name: string; status: string };
type Fields = { fields: FieldDef[]; forms: { id: string; name: string }[] };

// Fields and forms change rarely and are read by every Routing and Scoring screen: kept a minute per workspace in
// this process. Writes (publish, a rule check before publish) read fresh; forgetFields clears a workspace at once.
const fieldsKept = ttlCache<Fields>({ ttlMs: 60_000, max: 2000 });
const membersKept = ttlCache<Member[]>({ ttlMs: 60_000, max: 2000 });

/** Drop what's kept for a workspace's fields and forms (call after a form is published or a field changes). */
export function forgetFields(ws?: string) {
  fieldsKept.forget(ws);
}

/** Drop the kept member list of a workspace (call after the team changes). */
export function forgetMembers(ws?: string) {
  membersKept.forget(ws);
}

/** The custom fields, the forms, and each form's latest published body: one call (router_fields_src, 088). */
async function fieldSources(db: Q, ws: string): Promise<{ custom: FieldRow[]; forms: FormRow[]; latest: { form_id: string; version: number; body: Form }[] }> {
  const one = await rpcOr<{ custom: FieldRow[]; forms: FormRow[]; latest: { form_id: string; version: number; body: Form }[] }>(
    (fn, args) => db.rpc(fn, args),
    "router_fields_src",
    { p_ws: ws },
    async () => {
      // Before the migration: fields and forms together, then only the latest version of each form (not every body).
      const [f, fm] = await Promise.all([db.from("fields").select("object, key, label, type, options").eq("workspace_id", ws), db.from("forms").select("id, name, status, version").eq("workspace_id", ws)]);
      if (f.error) return { data: null, error: f.error };
      if (fm.error) return { data: null, error: fm.error };
      const forms = (fm.data ?? []) as (FormRow & { version: number })[];
      const ids = forms.filter((x) => x.version > 0).map((x) => x.id).slice(0, 200);
      const want = new Map(forms.map((x) => [x.id, x.version]));
      const v = ids.length ? await db.from("form_versions").select("form_id, version, body").in("form_id", ids).in("version", [...new Set(ids.map((id) => want.get(id)!))]) : { data: [], error: null };
      if (v.error) return { data: null, error: v.error };
      const latest = ((v.data ?? []) as { form_id: string; version: number; body: Form }[]).filter((x) => want.get(x.form_id) === x.version);
      return { data: { custom: (f.data ?? []) as FieldRow[], forms, latest }, error: null };
    },
    { anyError: true },
  );
  if (one.error || !one.data) throw new Error(`fields: ${one.error?.message ?? "no answer"}`);
  return one.data;
}

/** The fields rules can test: the base ones, custom contact and company fields, and the answers on live forms. */
export async function fieldsFor(db: Q, ws: string, o: { fresh?: boolean } = {}): Promise<Fields> {
  if (o.fresh) {
    fieldsKept.forget(ws);
    return buildFields(db, ws);
  }
  return fieldsKept.get(ws, () => buildFields(db, ws));
}

async function buildFields(db: Q, ws: string): Promise<Fields> {
  const fields: FieldDef[] = [...BASE_FIELDS];
  const src = await fieldSources(db, ws);
  const custom = src.custom;
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
  const forms = src.forms;
  const formField = fields.find((f) => f.key === "lead.form");
  if (formField) formField.options = forms.map((f) => f.id);
  // Newest version first, as before: the first form to name an answer gives its label.
  const latest = [...src.latest].sort((a, b) => b.version - a.version);
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

/** The workspace's people: one call (router_members, 088), kept a minute; `fresh` for checks before a write. */
async function membersOf(rpc: Rpc, db: Q, ws: string, o: { fresh?: boolean } = {}): Promise<Member[]> {
  const read = async () => {
    const r = await rpcOr<{ id: string; name: string; email: string }[]>(
      rpc,
      "router_members",
      { p_ws: ws },
      async () => {
        const rows = await db.from("workspace_members").select("user_id").eq("workspace_id", ws);
        if (rows.error) return { data: null, error: rows.error };
        const ids = ((rows.data ?? []) as { user_id: string }[]).map((x) => x.user_id);
        const people = await rpc("meeting_people", { p_ws: ws, p_users: ids });
        return { data: people.data as { id: string; name: string; email: string }[] | null, error: people.error };
      },
      { anyError: true },
    );
    if (r.error) throw new Error(`meeting_people: ${r.error.message}`);
    return (r.data ?? []).map((p) => ({ id: p.id, name: p.name, email: p.email }));
  };
  if (o.fresh) {
    membersKept.forget(ws);
    return read();
  }
  return membersKept.get(ws, read);
}

type RouterRow = { live_version: number | null; draft: RouterBody | null; draft_base: number | null; draft_revision: number; draft_at: string | null; allow: string[]; block: string[]; alert_label: string | null };

async function routerRow(db: Q, ws: string): Promise<RouterRow | null> {
  return ((await db.from("routers").select("live_version, draft, draft_base, draft_revision, draft_at, allow, block, alert_label").eq("workspace_id", ws).maybeSingle()).data as RouterRow | null) ?? null;
}

/** Today's routing from lead_settings, as a router body, for a workspace with no router yet. */
async function legacyOf(db: Q, ws: string): Promise<{ body: RouterBody; unmapped: string[] } | null> {
  const [ls, links] = await Promise.all([
    db.from("lead_settings").select("routing").eq("workspace_id", ws).maybeSingle(),
    db.from("crm_owner_links").select("crm_owner_id, user_id").eq("workspace_id", ws),
  ]);
  const routing = (ls.data as { routing: OldRouting } | null)?.routing;
  if (!routing?.rules?.length && !routing?.default?.owners?.length) return null;
  const rows = (links.data ?? []) as { crm_owner_id: string; user_id: string | null }[];
  return fromLeadSettings(routing, (crm) => rows.find((l) => l.crm_owner_id === crm)?.user_id ?? null);
}

/** Last 7 days' counts for the editor's lines. */
export const stats = (rpc: Rpc, c: Caller) => call<Record<string, unknown>>(rpc, "router_stats", { p_ws: c.ws, p_days: 7 });

/** Published versions, newest first. */
export async function versions(db: Q, c: Caller): Promise<unknown[]> {
  return ((await db.from("router_versions").select("version, note, published_by, published_at").eq("workspace_id", c.ws).order("version", { ascending: false }).limit(100)).data ?? []) as unknown[];
}

/** The routing chat so far (the last 40 messages). */
export async function chatHistory(db: Q, c: Caller): Promise<ChatMessage[]> {
  return (((await db.from("router_chats").select("messages").eq("workspace_id", c.ws).maybeSingle()).data as { messages?: ChatMessage[] } | null)?.messages ?? []).slice(-40);
}

/**
 * Everything the Router screen opens with, in one round of reads side by side. With `slim`, the stats, versions and
 * chat are left out (null) for the screen to ask for when it shows them ("stats", "versions", "chat_history").
 */
export async function load(rpc: Rpc, db: Q, c: Caller, o: { slim?: boolean } = {}) {
  const slim = !!o.slim;
  const [row, live, members, f, statsOut, slack, chat, meetings, versionsOut] = await Promise.all([
    routerRow(db, c.ws),
    liveRouter(rpc, c.ws),
    membersOf(rpc, db, c.ws),
    fieldsFor(db, c.ws),
    slim ? null : stats(rpc, c),
    db.from("slack_installs").select("team_name, created_at").eq("workspace_id", c.ws).maybeSingle(),
    slim ? null : chatHistory(db, c),
    db.from("meeting_types").select("id, name, settings").eq("workspace_id", c.ws).eq("active", true).is("template_id", null).order("name"),
    slim ? null : versions(db, c),
  ]);
  const legacy = !row?.live_version && !row?.draft ? await legacyOf(db, c.ws) : null;
  const memberSet = new Set(members.map((m) => m.id));
  const draft = row?.draft ? cleanBody(row.draft) : null;
  return {
    live: live ? { version: live.version, body: cleanBody(live.body) } : null,
    paused: !!live?.paused,
    draft,
    draftBase: row?.draft_base ?? null,
    revision: row?.draft_revision ?? 0,
    problems: draft ? problems(draft, { members: memberSet, fields: f.fields }) : [],
    versions: versionsOut,
    members,
    fields: f.fields,
    forms: f.forms,
    // The meeting types a rule can offer (docs/scheduling-plan.md 12.5): name and first length.
    meetings: ((meetings.data ?? []) as { id: string; name: string; settings: { lengths?: number[] } | null }[]).map((m) => ({ id: m.id, name: m.name, minutes: m.settings?.lengths?.[0] ?? null })),
    stats: statsOut,
    lists: { allow: row?.allow ?? [], block: row?.block ?? [] },
    alert: { label: row?.alert_label ?? null },
    slack: { ready: slackReady(), team: slack.data ? ((slack.data as { team_name: string | null }).team_name ?? "Slack") : null },
    legacy,
    chat,
  };
}

/** What the routing chat reads: the setup, the team, fields and the chat so far, without the screen's extras. */
async function chatSetup(rpc: Rpc, db: Q, c: Caller) {
  const [row, live, members, f, chat] = await Promise.all([routerRow(db, c.ws), liveRouter(rpc, c.ws), membersOf(rpc, db, c.ws), fieldsFor(db, c.ws), chatHistory(db, c)]);
  const legacy = !row?.live_version && !row?.draft ? await legacyOf(db, c.ws) : null;
  return {
    revision: row?.draft_revision ?? 0,
    draft: row?.draft ? cleanBody(row.draft) : null,
    live: live ? { version: live.version, body: cleanBody(live.body) } : null,
    legacy,
    members,
    fields: f.fields,
    forms: f.forms,
    chat,
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
  // The draft, the team and the fields side by side; the team and fields read fresh, since this check guards a write.
  const [row, members, f] = await Promise.all([routerRow(db, c.ws), membersOf(rpc, db, c.ws, { fresh: true }), fieldsFor(db, c.ws, { fresh: true })]);
  if (!row?.draft) throw new Refused(400, "There's no draft to publish.");
  const body = cleanBody(row.draft);
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
  // The names and fields are read alongside the router row and the two bodies.
  const [row, members, f] = await Promise.all([routerRow(db, c.ws), membersOf(rpc, db, c.ws), fieldsFor(db, c.ws)]);
  const bodyOf = async (v: number | "draft" | null | undefined): Promise<RouterBody | null> => {
    if (v === "draft") return row?.draft ? cleanBody(row.draft) : null;
    const n = v ?? row?.live_version;
    if (!n) return null;
    const x = (await db.from("router_versions").select("body").eq("workspace_id", c.ws).eq("version", n).maybeSingle()).data as { body: RouterBody } | null;
    return x ? cleanBody(x.body) : null;
  };
  const [a, b] = await Promise.all([bodyOf(o.from ?? null), bodyOf(o.to ?? "draft")]);
  if (!b) return { changes: [] };
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
  const given = o.contact && /^[0-9a-f-]{36}$/.test(o.contact) ? o.contact : null;
  if (!given && !o.email) throw new Refused(400, "Type an email or pick a contact.");
  // The router row, the live version, the fields and (for an email) the contact, side by side. The row is only read
  // when the editor didn't send its draft, and the live version only when it's tested.
  const [row, live, f, found] = await Promise.all([
    o.draft ? null : routerRow(db, c.ws),
    o.which !== "draft" ? liveRouter(rpc, c.ws) : null,
    fieldsFor(db, c.ws),
    !given && o.email ? db.from("contacts").select("id").eq("workspace_id", c.ws).eq("email_clean", o.email.trim().toLowerCase()).is("deleted_at", null).limit(1).maybeSingle() : null,
  ]);
  const contact = given ?? ((found?.data as { id: string } | null)?.id ?? null);
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
  const days = Math.min(90, Math.max(1, Math.round(o.days || 30)));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  // The draft (when the editor didn't send it), the past runs and the fields, side by side. Only the columns the
  // replay reads come back (not the version, key, reason or timing).
  const [row, runRows, f] = await Promise.all([
    o.draft ? null : routerRow(db, c.ws),
    db
      .from("router_runs")
      .select("id, contact_id, kind, owner, by, steps, facts")
      .eq("workspace_id", c.ws)
      .gte("created_at", since)
      .not("reason", "in", "(manual)")
      .order("created_at", { ascending: true })
      .limit(5000),
    fieldsFor(db, c.ws),
  ]);
  const body = o.draft ? cleanBody(o.draft) : row?.draft ? cleanBody(row.draft) : null;
  if (!body) throw new Refused(400, "There's no draft to replay.");
  const runs = (runRows.data ?? []) as (Pick<Run, "id" | "contact_id" | "steps" | "facts"> & { kind: string; owner: string | null; by: string | null })[];
  const sim: Record<string, Record<string, { n: number; last: number }>> = {};
  const fields = f.fields;
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
  // The same lead picked twice is routed once.
  const ids = [...new Set(contacts.filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)).map((x) => x.toLowerCase()))].slice(0, 5000);
  if (!ids.length) throw new Refused(400, "Pick a contact.");
  if (c.role !== "owner" && ids.length > 1) throw new Refused(403, "Only workspace owners can route many at once.");
  const stamp = Date.now();
  if (ids.length === 1) {
    await call(rpc, "router_undo", { p_ws: c.ws, p_contact: ids[0] });
    const r = await route(rpc, { ws: c.ws, contact: ids[0]!, key: `again:${ids[0]}:${stamp}`, reason: "again", byUser: c.user, force: true });
    return r.status === "ok" || r.status === "dup" ? { routed: 1, run: r.run, result: r.result } : { routed: 0, status: r.status };
  }
  const queued = await enqueueMany(
    rpc,
    c.ws,
    "route",
    ids.map((id) => ({ key: `again:${id}:${stamp}`, payload: { contact: id, reason: "again", key: `again:${id}:${stamp}`, undo: true, byUser: c.user } })),
  );
  return { queued };
}

const BATCH = 1000;

/**
 * Queue many jobs of one kind: a call per 1,000 (enqueue_jobs, 088), each all or none, where it was a call per job.
 * Keys keep their meaning: a key already waiting is joined, not doubled. Returns how many were asked for.
 */
export async function enqueueMany(rpc: Rpc, ws: string, kind: string, jobs: { key: string; payload: object }[]): Promise<number> {
  for (let i = 0; i < jobs.length; i += BATCH) {
    const part = jobs.slice(i, i + BATCH);
    const r = await rpcOr<number>(rpc, "enqueue_jobs", { p_workspace: ws, p_kind: kind, p_jobs: part, p_max_attempts: 5 }, async () => {
      for (const j of part) await enqueueJob(rpc, { workspaceId: ws, kind, key: j.key, payload: j.payload });
      return { data: part.length, error: null };
    });
    if (r.error) throw new Error(`enqueue_jobs: ${r.error.message}`);
  }
  return jobs.length;
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

/** Let through: up to this many are routed while the person waits; more are queued. */
export const LET_INLINE = 25;
const LET_PARALLEL = 5;

/** Run `fn` on each item, `size` at a time, keeping the order of the answers. */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

/** Held and Unassigned (docs/router-ux.md 4.9). */
export async function heldAction(rpc: Rpc, db: Q, c: Caller, o: { op: string; contacts?: string[]; domain?: string; user?: string; moveMeetings?: boolean }) {
  ownerOnly(c);
  const ids = [...new Set((o.contacts ?? []).filter((x) => typeof x === "string" && /^[0-9a-f-]{36}$/.test(x)))].slice(0, 1000);
  const stamp = Date.now();
  switch (o.op) {
    case "let_through": {
      // Up to LET_INLINE leads are routed here, a few at a time (the database keeps each queue's turns fair under
      // concurrency), so the screen shows where each went. More than that are queued in one batch: the route job
      // routes each with the spam check off (payload skipSpam), and the screen shows them as they land.
      if (ids.length > LET_INLINE) {
        const queued = await enqueueMany(
          rpc,
          c.ws,
          "route",
          ids.map((id) => ({ key: `let:${id}:${stamp}`, payload: { contact: id, reason: "let_through", key: `let:${id}:${stamp}`, undo: true, skipSpam: true, byUser: c.user } })),
        );
        return { done: [], queued };
      }
      const out = await inBatches(ids, LET_PARALLEL, async (id) => {
        await call(rpc, "router_undo", { p_ws: c.ws, p_contact: id });
        const r = await route(rpc, { ws: c.ws, contact: id, key: `let:${id}:${stamp}`, reason: "let_through", byUser: c.user, force: true, skipSpam: true });
        return { contact: id, kind: "result" in r ? r.result.kind : r.status, owner: "result" in r && r.result.kind === "owner" ? r.result.user : null };
      });
      return { done: out };
    }
    case "spam":
      return { done: await call<number>(rpc, "router_spam", { p_ws: c.ws, p_contacts: ids }) };
    case "allow_domain":
    case "block_domain": {
      const d = domainOf(o.domain ?? "");
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Refused(400, "That isn't a domain.");
      const row = await routerRow(db, c.ws);
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
        // Every held lead from that domain goes through now. The database picks them (the address ends in @domain or
        // .domain); the domain is checked above to hold only letters, digits, dashes and dots, so it can't widen the match.
        const held = await db
          .from("contacts")
          .select("id, email_clean")
          .eq("workspace_id", c.ws)
          .eq("route_status", "held")
          .or(`email_clean.like.*@${d},email_clean.like.*.${d}`)
          .limit(1000);
        // The same test as before on what comes back, so the list can never be wider than it was.
        const match = ((held.data ?? []) as { id: string; email_clean: string | null }[]).filter((h) => (h.email_clean ?? "").endsWith(`@${d}`) || (h.email_clean ?? "").endsWith(`.${d}`)).map((h) => h.id);
        if (match.length) return heldAction(rpc, db, c, { op: "let_through", contacts: match });
      }
      return { ok: true };
    }
    case "assign": {
      if (!o.user || !/^[0-9a-f-]{36}$/.test(o.user)) throw new Refused(400, "Pick a rep.");
      // One call for all of them (router_assign_many, 088): each lead in its own step, in a fixed order.
      const owner = o.user;
      const r = await rpcOr<number>(rpc, "router_assign_many", { p_ws: c.ws, p_contacts: ids, p_owner: owner, p_by: c.user }, async () => {
        for (const id of ids) {
          const x = await rpc("router_assign", { p_ws: c.ws, p_contact: id, p_owner: owner, p_by: c.user });
          if (x.error) return { data: null, error: x.error };
        }
        return { data: ids.length, error: null };
      });
      if (r.error) throw new Error(`router_assign: ${r.error.message}`);
      // "Move their upcoming meeting too?" (docs/scheduling-plan.md 12.6): only when the person said yes.
      if (!o.moveMeetings) return { done: ids.length };
      const { handOffMeetings } = await import("../meetings/team.ts");
      const { liveBusyFor } = await import("../meetings/live.ts");
      const liveBusy = liveBusyFor(rpc, c.ws);
      let moved = 0;
      let kept = 0;
      for (const id of ids) {
        const r = await handOffMeetings(rpc, { ws: c.ws, contact: id, user: o.user, liveBusy });
        moved += r.moved;
        kept += r.kept;
      }
      return { done: ids.length, moved, kept };
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
  // The secret and the label are separate rows: written side by side.
  if (!u) {
    await Promise.all([db.from("router_secrets").delete().eq("workspace_id", c.ws), db.from("routers").upsert({ workspace_id: c.ws, alert_label: null }, { onConflict: "workspace_id" })]);
    return { ok: true };
  }
  if (!/^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+$/.test(u)) throw new Refused(400, "Paste a Slack incoming webhook address.");
  const sealed = seal(JSON.stringify({ url: u }));
  await Promise.all([
    db.from("router_secrets").upsert({ workspace_id: c.ws, sealed, updated_at: new Date().toISOString() }, { onConflict: "workspace_id" }),
    db.from("routers").upsert({ workspace_id: c.ws, alert_label: (label ?? "").trim().slice(0, 120) || "Slack" }, { onConflict: "workspace_id" }),
  ]);
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
  const list = (Array.isArray(rows) ? rows : []).slice(0, 500) as ({ source_id?: unknown; crm_owner_id?: unknown; label?: unknown; user_id?: unknown } | null)[];
  const asked = [...new Set(list.map((x) => x?.source_id).filter((s): s is string => typeof s === "string" && UUID.test(s)))];
  if (!asked.length) return { ok: true };
  // The workspace's own sources among those named, in one read; then every link in one write.
  const { data: srcs, error } = await db.from("sources").select("id").eq("workspace_id", c.ws).in("id", asked);
  if (error) throw new Error(error.message);
  const mine = new Set(((srcs ?? []) as { id: string }[]).map((s) => s.id));
  const at = new Date().toISOString();
  // The same owner named twice keeps its last row, as when they were saved one by one.
  const byKey = new Map<string, object>();
  for (const x of list) {
    if (!x || typeof x.source_id !== "string" || typeof x.crm_owner_id !== "string" || !mine.has(x.source_id)) continue;
    const crm = x.crm_owner_id.slice(0, 100);
    byKey.set(`${x.source_id}|${crm}`, {
      workspace_id: c.ws,
      source_id: x.source_id,
      crm_owner_id: crm,
      label: typeof x.label === "string" ? x.label.slice(0, 200) : null,
      user_id: typeof x.user_id === "string" && /^[0-9a-f-]{36}$/.test(x.user_id) ? x.user_id : null,
      updated_at: at,
    });
  }
  if (byKey.size) {
    const up = await db.from("crm_owner_links").upsert([...byKey.values()], { onConflict: "source_id,crm_owner_id" });
    if (up.error) throw new Error(up.error.message);
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
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  // The setup (not the screen's stats, versions or meeting types) and the recent runs, side by side.
  const [loaded, runs] = await Promise.all([
    chatSetup(rpc, db, c),
    db.from("router_runs").select("kind, owner, by, rule_id, created_at, lead:facts->lead, values:facts->values").eq("workspace_id", c.ws).gte("created_at", since).is("undone_at", null).order("created_at", { ascending: false }).limit(2000),
  ]);
  if (o.revision !== null && o.revision !== loaded.revision) throw new Refused(409, "The setup changed in another window. Reload to see the latest.");
  const body = loaded.draft ?? loaded.live?.body ?? loaded.legacy?.body ?? emptyBody();
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
  // Each rep's changes in order; different reps side by side.
  const byRep = new Map<string, (typeof out.reps)[number][]>();
  for (const r of out.reps) byRep.set(r.user, [...(byRep.get(r.user) ?? []), r]);
  await Promise.all(
    [...byRep.values()].map(async (list) => {
      for (const r of list) {
        const patch: Record<string, unknown> = { ...r.patch };
        if (r.patch.out_dates) {
          const had = ((await db.from("router_reps").select("out_dates").eq("workspace_id", c.ws).eq("user_id", r.user).maybeSingle()).data as { out_dates?: { from: string; to: string }[] } | null)?.out_dates ?? [];
          patch.out_dates = [...had.filter((d) => d.to >= ctx.today), ...r.patch.out_dates];
        }
        await saveRep(rpc, c, r.user, patch);
      }
    }),
  );
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

