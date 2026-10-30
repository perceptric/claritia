// The Scoring screens' server side (docs/scoring-plan.md): load the model, build the first one from the workspace's
// data, save drafts, publish, show results on past leads, and the assistant's chat. Every change is cleaned
// (model.ts) and saved as a draft; only Publish changes live scores.

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob, type Rpc } from "../jobs.ts";
import { fieldsFor, Refused, type Caller } from "../router/actions.ts";
import type { Model } from "../forms/chat.ts";
import { buildModel, type Finding } from "./build.ts";
import { beforeMeeting, fitToCapacity, peakOf, rulePoints, statsOf, scoreLead, type LeadFacts, type Stats } from "./engine.ts";
import { ttlCache } from "../roleCache.ts";
import { cleanBody, fitFields, problems, type ScoreBody } from "./model.ts";
import { loadFacts } from "./server.ts";

type Q = SupabaseClient;
const DAYS = 90;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ownerOnly = (c: Caller) => {
  if (c.role !== "owner") throw new Refused(403, "Only workspace owners can change scoring.");
};
async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Refused(/another window/.test(error.message) ? 409 : 400, error.message.replace(/^.*?: /, ""));
  return data as T;
}

type Row = { id: string; name: string; revision: number; live_version: number | null; draft: unknown; built: { findings?: Finding[]; at?: string } | null };

type Context = { fields: ReturnType<typeof fitFields>; forms: { id: string; name: string }[]; reps: number; site: { name: string | null; domain: string | null } };

// The workspace facts every Scoring action reads (fields, forms, brand name, site, team size) change rarely: read side
// by side and kept a minute per workspace. Lead facts for Results, Fit and the chat are kept 3 minutes.
const contextKept = ttlCache<Context>({ ttlMs: 60_000, max: 2000 });
const factsKept = ttlCache<LeadFacts[]>({ ttlMs: 3 * 60_000, max: 200 });

/** Drop what's kept for a workspace (after its fields, forms or scoring data change). */
export function forgetScoring(ws?: string) {
  contextKept.forget(ws);
  factsKept.forget(ws);
}

async function readContext(db: Q, ws: string): Promise<Context> {
  const [{ fields, forms }, kitQ, siteQ, repsQ] = await Promise.all([
    fieldsFor(db, ws),
    db.from("brand_kits").select("name, source_url").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("sites").select("domain").eq("workspace_id", ws).limit(1).maybeSingle(),
    db.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws),
  ]);
  const kit = kitQ.data as { name: string; source_url: string | null } | null;
  const site = siteQ.data as { domain: string } | null;
  const reps = repsQ.count ?? 1;
  const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };
  return { fields: fitFields(fields), forms, reps, site: { name: kit?.name ?? null, domain: site?.domain ?? host(kit?.source_url ?? null) } };
}

const context = (db: Q, ws: string) => contextKept.get(ws, () => readContext(db, ws));

/** The last 90 days of leads, kept a few minutes per workspace (Results, Fit and the chat re-read them often). */
const recentFacts = (rpc: Rpc, ws: string) => factsKept.get(ws, () => loadFacts(rpc, ws, { since: new Date(Date.now() - DAYS * 86_400_000) }));

async function modelRow(db: Q, ws: string, id: string | null): Promise<Row | null> {
  let q = db.from("scoring_models").select("id, name, revision, live_version, draft, built").eq("workspace_id", ws);
  q = id && UUID.test(id) ? q.eq("id", id) : q.order("position").order("created_at");
  return ((await q.limit(1).maybeSingle()).data as Row | null) ?? null;
}

async function liveBody(db: Q, m: Row, fields: ReturnType<typeof fitFields>): Promise<ScoreBody | null> {
  if (!m.live_version) return null;
  const v = (await db.from("scoring_versions").select("body").eq("model_id", m.id).eq("version", m.live_version).maybeSingle()).data as { body: unknown } | null;
  return v ? cleanBody(v.body, fields) : null;
}

export async function load(db: Q, c: Caller, o: { model?: string | null }) {
  // The workspace facts, the model and the list of models side by side; then its live body and versions together.
  const [ctx, m, list] = await Promise.all([
    context(db, c.ws),
    modelRow(db, c.ws, o.model ?? null),
    db.from("scoring_models").select("id, name, live_version").eq("workspace_id", c.ws).order("position").order("created_at"),
  ]);
  const models = (list.data ?? []) as { id: string; name: string; live_version: number | null }[];
  if (!m) return { ...ctx, models, model: null };
  const [live, v] = await Promise.all([liveBody(db, m, ctx.fields), db.from("scoring_versions").select("version, published_at").eq("model_id", m.id).order("version", { ascending: false }).limit(20)]);
  const versions = (v.data ?? []) as { version: number; published_at: string }[];
  return { ...ctx, models, model: { id: m.id, name: m.name, revision: m.revision, liveVersion: m.live_version, draft: m.draft ? cleanBody(m.draft, ctx.fields) : null, live, findings: m.built?.findings ?? [], versions } };
}

/**
 * Build a model from the workspace's data: the leads of the last 90 days and what they did, then the assistant's
 * review through the step cache. Saves it as the draft of `model`, or of a new model when there's none.
 */
export async function build(rpc: Rpc, db: Q, c: Caller, o: { model?: string | null; ai: Model | null }) {
  ownerOnly(c);
  const ctx = await context(db, c.ws);
  const now = Date.now();
  const leads = await loadFacts(rpc, c.ws, { since: new Date(now - DAYS * 86_400_000) });
  const first = buildModel({ leads, forms: ctx.forms, reps: ctx.reps, site: ctx.site, now, days: DAYS });
  let body = first.body;
  let findings = first.findings;
  if (o.ai) {
    const { cachedStep, hashKey } = await import("../ai/cache.ts");
    const { reviewBuild, SCORING_MODEL, SCORING_SYSTEM, BUILD_TOOLS } = await import("./ai.ts");
    const stats = statsOf(body, leads, now, DAYS);
    const aiCtx = { body, fields: ctx.fields, forms: ctx.forms, stats, site: ctx.site, findings };
    const key = hashKey(SCORING_MODEL, SCORING_SYSTEM, BUILD_TOOLS, aiCtx);
    try {
      const r = (await cachedStep(rpc, c.ws, "scoring_build", key, async () => {
        const out = await reviewBuild(o.ai!, aiCtx);
        return { result: { body: out.body, findings: out.findings }, model: SCORING_MODEL, usage: out.usage };
      })).result;
      body = fitToCapacity(cleanBody(r.body, ctx.fields), leads, now, DAYS);
      findings = r.findings;
    } catch {
      // The data-built model stands on its own.
    }
  }
  let m = await modelRow(db, c.ws, o.model ?? null);
  if (!m) {
    const ins = await db.from("scoring_models").insert({ workspace_id: c.ws, name: "Main model" }).select("id, name, revision, live_version, draft, built").single();
    if (ins.error) throw new Refused(400, ins.error.message);
    m = ins.data as Row;
  }
  const revision = await call<number>(rpc, "scoring_save_draft", { p_model: m.id, p_body: body, p_revision: null });
  await db.from("scoring_models").update({ built: { findings, at: new Date().toISOString(), leads: leads.length } }).eq("id", m.id);
  return { model: m.id, revision, body, findings, stats: statsOf(body, leads, now, DAYS) };
}

export async function saveDraft(rpc: Rpc, db: Q, c: Caller, o: { model: string; body: unknown; revision: number | null }) {
  ownerOnly(c);
  // Two round trips: the model check (with the kept workspace facts, read alongside when not kept), then the save.
  if (!UUID.test(o.model)) throw new Refused(404, "Model not found.");
  const [m, { fields }] = await Promise.all([modelId(db, c.ws, o.model), context(db, c.ws)]);
  if (!m) throw new Refused(404, "Model not found.");
  return { revision: await call<number>(rpc, "scoring_save_draft", { p_model: m, p_body: cleanBody(o.body, fields), p_revision: o.revision }) };
}

/** The model's id when it is this workspace's (only the id: the draft body isn't needed to save over it). */
async function modelId(db: Q, ws: string, id: string): Promise<string | null> {
  return ((await db.from("scoring_models").select("id").eq("workspace_id", ws).eq("id", id).maybeSingle()).data as { id: string } | null)?.id ?? null;
}

export async function publish(rpc: Rpc, db: Q, c: Caller, o: { model: string }) {
  ownerOnly(c);
  const [m, { fields }] = await Promise.all([modelRow(db, c.ws, o.model), context(db, c.ws)]);
  if (!m || m.id !== o.model || !m.draft) throw new Refused(400, "There are no changes to publish.");
  const left = problems(cleanBody(m.draft, fields));
  if (left.length) throw new Refused(400, left[0]!);
  const version = await call<number>(rpc, "scoring_publish", { p_model: m.id, p_user: c.user });
  await enqueueJob(rpc, { workspaceId: c.ws, kind: "score_refresh", key: "score_refresh", payload: { model: m.id } });
  return { version };
}

/** The draft (or `body`) on the last 90 days of leads, and how many would change status against the live version. */
export async function results(rpc: Rpc, db: Q, c: Caller, o: { model: string | null; body?: unknown }) {
  // The workspace facts, the model and the leads side by side (the leads kept a few minutes); then the live body once.
  const [ctx, m, leads] = await Promise.all([context(db, c.ws), modelRow(db, c.ws, o.model), recentFacts(rpc, c.ws)]);
  const live = m ? await liveBody(db, m, ctx.fields) : null;
  const body = o.body ? cleanBody(o.body, ctx.fields) : m?.draft ? cleanBody(m.draft, ctx.fields) : live;
  if (!body) throw new Refused(400, "There's no model yet.");
  const now = Date.now();
  const stats = statsOf(body, leads, now, DAYS);
  const moved = live ? leads.filter((f) => scoreLead(body, beforeMeeting(f), peakOf(f, now)).band !== scoreLead(live, beforeMeeting(f), peakOf(f, now)).band).length : null;
  // Each rule on its own: how many past leads it matched (before they met), and how often those went on to meet.
  const before = leads.map((f) => ({ f: beforeMeeting(f), at: peakOf(f, now) }));
  const rules: Record<string, { n: number; rate: number }> = {};
  for (const r of [...body.groups.flatMap((g) => g.rules), ...body.minus]) {
    let n = 0;
    let met = 0;
    for (const { f, at } of before) if (rulePoints({ ...r, on: true, remove: false }, f, body, at)) { n++; if (f.met) met++; }
    rules[r.id] = { n, rate: n ? Math.round((met / n) * 100) : 0 };
  }
  return { stats, moved, rules };
}

/** Set the cut-off so past leads give the team about `capacity` sales-ready leads a week. */
export async function fit(rpc: Rpc, db: Q, c: Caller, o: { body: unknown }) {
  ownerOnly(c);
  const [{ fields }, leads] = await Promise.all([context(db, c.ws), recentFacts(rpc, c.ws)]);
  const now = Date.now();
  const body = fitToCapacity(cleanBody(o.body, fields), leads, now, DAYS);
  return { body, stats: statsOf(body, leads, now, DAYS) };
}

export async function chat(rpc: Rpc, db: Q, c: Caller, o: { model: string; message: string; body: unknown; revision: number | null; history: unknown; ai: Model | null }) {
  ownerOnly(c);
  const message = o.message.trim().slice(0, 4000);
  if (!message) throw new Refused(400, "Say what to change.");
  if (!o.ai) throw new Refused(503, "The assistant isn't set up on the server (ANTHROPIC_API_KEY).");
  const [ctx, leads] = await Promise.all([context(db, c.ws), recentFacts(rpc, c.ws)]);
  const body = cleanBody(o.body, ctx.fields);
  const now = Date.now();
  const stats: Stats | null = leads.length ? statsOf(body, leads, now, DAYS) : null;
  const history = (Array.isArray(o.history) ? o.history : []).filter((h): h is { role: "user" | "assistant"; text: string } => !!h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string").slice(-8);
  const { cachedStep, hashKey } = await import("../ai/cache.ts");
  const { chatTurn, SCORING_MODEL, SCORING_SYSTEM, CHAT_TOOLS } = await import("./ai.ts");
  const aiCtx = { body, fields: ctx.fields, forms: ctx.forms, stats, site: ctx.site, history };
  const key = hashKey(SCORING_MODEL, SCORING_SYSTEM, CHAT_TOOLS, aiCtx, message);
  const out = (await cachedStep(rpc, c.ws, "scoring_chat", key, async () => {
    const r = await chatTurn(o.ai!, message, aiCtx);
    const { usage, ...result } = r;
    return { result, model: SCORING_MODEL, usage, keep: !!result.body };
  })).result;
  if (!out.body) return { reply: out.reply, lines: [], body: null, revision: o.revision };
  const next = /capacity|a week|per week/i.test(message) ? fitToCapacity(out.body, leads, now, DAYS) : out.body;
  const revision = await call<number>(rpc, "scoring_save_draft", { p_model: o.model, p_body: next, p_revision: o.revision });
  return { reply: out.reply, lines: out.lines, body: next, revision };
}

export async function rename(db: Q, c: Caller, o: { model: string; name: string }) {
  ownerOnly(c);
  const name = o.name.trim().slice(0, 60);
  if (!name) throw new Refused(400, "Give the model a name.");
  await db.from("scoring_models").update({ name, updated_at: new Date().toISOString() }).eq("workspace_id", c.ws).eq("id", o.model);
  return { ok: true };
}
