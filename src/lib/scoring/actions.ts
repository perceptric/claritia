// The Scoring screens' server side (docs/scoring-plan.md): load the model, build the first one from the workspace's
// data, save drafts, publish, show results on past leads, and the assistant's chat. Every change is cleaned
// (model.ts) and saved as a draft; only Publish changes live scores.

import type { SupabaseClient } from "@supabase/supabase-js";
import { enqueueJob, type Rpc } from "../jobs.ts";
import { fieldsFor, Refused, type Caller } from "../router/actions.ts";
import type { Model } from "../forms/chat.ts";
import { buildModel, type Finding } from "./build.ts";
import { beforeMeeting, fitToCapacity, peakOf, rulePoints, statsOf, scoreLead, type Stats } from "./engine.ts";
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

async function context(db: Q, ws: string) {
  const { fields, forms } = await fieldsFor(db, ws);
  const kit = (await db.from("brand_kits").select("name, source_url").eq("workspace_id", ws).order("updated_at", { ascending: false }).limit(1).maybeSingle()).data as { name: string; source_url: string | null } | null;
  const site = (await db.from("sites").select("domain").eq("workspace_id", ws).limit(1).maybeSingle()).data as { domain: string } | null;
  const reps = (await db.from("workspace_members").select("user_id", { count: "exact", head: true }).eq("workspace_id", ws)).count ?? 1;
  const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : null; } catch { return null; } };
  return { fields: fitFields(fields), forms, reps, site: { name: kit?.name ?? null, domain: site?.domain ?? host(kit?.source_url ?? null) } };
}

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
  const ctx = await context(db, c.ws);
  const m = await modelRow(db, c.ws, o.model ?? null);
  const models = ((await db.from("scoring_models").select("id, name, live_version").eq("workspace_id", c.ws).order("position").order("created_at")).data ?? []) as { id: string; name: string; live_version: number | null }[];
  if (!m) return { ...ctx, models, model: null };
  const live = await liveBody(db, m, ctx.fields);
  const versions = ((await db.from("scoring_versions").select("version, published_at").eq("model_id", m.id).order("version", { ascending: false }).limit(20)).data ?? []) as { version: number; published_at: string }[];
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
  const m = await modelRow(db, c.ws, o.model);
  if (!m || m.id !== o.model) throw new Refused(404, "Model not found.");
  const { fields } = await context(db, c.ws);
  return { revision: await call<number>(rpc, "scoring_save_draft", { p_model: m.id, p_body: cleanBody(o.body, fields), p_revision: o.revision }) };
}

export async function publish(rpc: Rpc, db: Q, c: Caller, o: { model: string }) {
  ownerOnly(c);
  const m = await modelRow(db, c.ws, o.model);
  if (!m || m.id !== o.model || !m.draft) throw new Refused(400, "There are no changes to publish.");
  const { fields } = await context(db, c.ws);
  const left = problems(cleanBody(m.draft, fields));
  if (left.length) throw new Refused(400, left[0]!);
  const version = await call<number>(rpc, "scoring_publish", { p_model: m.id, p_user: c.user });
  await enqueueJob(rpc, { workspaceId: c.ws, kind: "score_refresh", key: "score_refresh", payload: { model: m.id } });
  return { version };
}

/** The draft (or `body`) on the last 90 days of leads, and how many would change status against the live version. */
export async function results(rpc: Rpc, db: Q, c: Caller, o: { model: string | null; body?: unknown }) {
  const ctx = await context(db, c.ws);
  const m = await modelRow(db, c.ws, o.model);
  const body = o.body ? cleanBody(o.body, ctx.fields) : m?.draft ? cleanBody(m.draft, ctx.fields) : m ? await liveBody(db, m, ctx.fields) : null;
  if (!body) throw new Refused(400, "There's no model yet.");
  const now = Date.now();
  const leads = await loadFacts(rpc, c.ws, { since: new Date(now - DAYS * 86_400_000) });
  const stats = statsOf(body, leads, now, DAYS);
  const live = m ? await liveBody(db, m, ctx.fields) : null;
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
  const { fields } = await context(db, c.ws);
  const now = Date.now();
  const leads = await loadFacts(rpc, c.ws, { since: new Date(now - DAYS * 86_400_000) });
  const body = fitToCapacity(cleanBody(o.body, fields), leads, now, DAYS);
  return { body, stats: statsOf(body, leads, now, DAYS) };
}

export async function chat(rpc: Rpc, db: Q, c: Caller, o: { model: string; message: string; body: unknown; revision: number | null; history: unknown; ai: Model | null }) {
  ownerOnly(c);
  const message = o.message.trim().slice(0, 4000);
  if (!message) throw new Refused(400, "Say what to change.");
  if (!o.ai) throw new Refused(503, "The assistant isn't set up on the server (ANTHROPIC_API_KEY).");
  const ctx = await context(db, c.ws);
  const body = cleanBody(o.body, ctx.fields);
  const now = Date.now();
  const leads = await loadFacts(rpc, c.ws, { since: new Date(now - DAYS * 86_400_000) });
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
