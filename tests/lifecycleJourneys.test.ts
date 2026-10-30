// Lifecycle journeys (src/lib/workflows/lifecycle.ts, voice.ts, journeys.ts): signals found by event name, journeys
// left out when their signal never comes, every built body clean and waiting on approval, the voice rewrite checked,
// and the build keeping its own words when the AI fails or answers badly, adding only what's missing on a second run.
import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { cleanBody, problems } from "../src/lib/workflows/check.ts";
import { journeyEmails, pickSignals, planJourneys, type Facts } from "../src/lib/workflows/lifecycle.ts";
import { cleanRewrite } from "../src/lib/workflows/voice.ts";
import { build } from "../src/lib/workflows/journeys.ts";
import type { Model } from "../src/lib/forms/chat.ts";

const facts = (events: string[], journeys: Facts["journeys"] = []): Facts => ({ events: events.map((name, i) => ({ name, people: 100 - i })), stages: {}, contacts: 10, meetings: 2, journeys });
const opts = { brand: "Lumen", site: "https://lumen.io", booking: "https://app.tryclaritia.com/booking/lumen" };

test("signals come from event names, most used first, each name used once", () => {
  assert.deepEqual(pickSignals([{ name: "Signed Up" }, { name: "connected_data_source" }, { name: "invited_teammate" }, { name: "subscription_canceled" }]), { start: "Signed Up", activate: "connected_data_source", invite: "invited_teammate", cancel: "subscription_canceled" });
  assert.deepEqual(pickSignals([{ name: "page_scrolled" }]), {});
});

test("a journey whose signal never comes is left out; the pipeline ones always come", () => {
  const none = planJourneys(facts([]), opts).map((j) => j.key);
  assert.deepEqual(none, ["ready_for_sales", "missed_demo", "form_not_booked"]);
  const all = planJourneys(facts(["trial_started", "connected_data", "invited_teammate", "seat_limit_reached", "canceled"]), { ...opts, trialEnd: "f.trial_ends" }).map((j) => j.key);
  assert.deepEqual(all, ["trial_onboarding", "trial_ending", "ready_for_sales", "missed_demo", "form_not_booked", "expansion", "win_back"]);
});

test("every built journey reads back the same and only waits on approval", () => {
  for (const j of planJourneys(facts(["trial_started", "connected_data", "invited_teammate", "usage_limit", "churned"]), { ...opts, trialEnd: "f.trial_ends" })) {
    assert.deepEqual(cleanBody(j.body), j.body, `${j.key} reads back`);
    const left = problems(j.body).map((p) => p.text).filter((t) => t !== "Approve the email");
    assert.deepEqual(left, [], `${j.key} has nothing else to fix`);
    for (const e of journeyEmails(j.body.steps)) assert.equal(e.approved, false, `${j.key}: emails start unapproved`);
  }
  const onb = planJourneys(facts(["trial_started", "connected_data"]), opts)[0]!;
  const wait = onb.body.steps.find((s) => s.kind === "wait_until");
  assert.ok(wait && wait.kind === "wait_until" && wait.event === "product.used" && wait.name === "connected_data", "waits for the activation event by name");
  assert.deepEqual(onb.body.trigger, { kind: "product", events: ["trial_started"] });
});

test("a rewrite is kept only when it holds up", () => {
  const was = { subject: "a", preheader: "b", paragraphs: ["c"], cta_label: "Start", cta_url: "https://lumen.io" };
  assert.deepEqual(cleanRewrite({ subject: "Your Lumen account is ready", preheader: "Two minutes", paragraphs: ["Hi {{first_name|there}},", "Connect a source."], cta_label: "Connect" }, was), { ...was, subject: "Your Lumen account is ready", preheader: "Two minutes", paragraphs: ["Hi {{first_name|there}},", "Connect a source."], cta_label: "Connect" });
  assert.equal(cleanRewrite({ subject: "Hi {{first_name}}", paragraphs: ["x"] }, was), null, "a merge tag with no fallback");
  assert.equal(cleanRewrite({ subject: "Big news!", paragraphs: ["x"] }, was), null, "an exclamation mark");
  assert.equal(cleanRewrite({ subject: "See https://evil.io", paragraphs: ["x"] }, was), null, "a link in the words");
  assert.equal(cleanRewrite({ subject: "", paragraphs: [] }, was), null);
  assert.equal(cleanRewrite({ subject: "Fine", preheader: "", paragraphs: ["x"], cta_label: "Go" }, { ...was, cta_label: "" })!.cta_label, "", "no button where there was none");
});

/** The database side of a build, in memory. */
function fake(o: { journeys?: Facts["journeys"] } = {}) {
  const made: { name: string; stage: string; journey: string; draft: { steps: unknown[] } }[] = [];
  const cache = new Map<string, unknown>();
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    if (fn === "lifecycle_facts") return { data: facts(["trial_started", "connected_data"], o.journeys ?? []), error: null };
    if (fn === "journey_create") {
      made.push({ name: String(args.p_name), stage: String(args.p_stage), journey: String(args.p_journey), draft: args.p_draft as { steps: unknown[] } });
      return { data: `id-${made.length}`, error: null };
    }
    if (fn === "ai_cache_get") return { data: cache.get(String(args.p_key)) ?? null, error: null };
    if (fn === "ai_cache_put") {
      cache.set(String(args.p_key), args.p_output);
      return { data: null, error: null };
    }
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  const rows: Record<string, unknown[]> = { brand_kits: [{ name: "Lumen", logo_url: null, tokens: { buttonBg: "#4f46e5" }, notes: [], brief: "Lumen turns spreadsheets into reports for finance teams." }], sites: [{ domain: "lumen.io" }], fields: [], workspaces: [{ name: "Lumen", booking_slug: "lumen" }] };
  const q = (t: string) => {
    const p: Record<string, unknown> = {};
    for (const k of ["select", "eq", "order", "limit"]) p[k] = () => p;
    p.maybeSingle = () => Promise.resolve({ data: rows[t]?.[0] ?? null, error: null });
    p.then = (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[t] ?? [], error: null }).then(res);
    return p;
  };
  const db = { from: q } as never;
  return { rpc, db, made };
}
const reply = (emails: unknown[]): Anthropic.Beta.BetaMessage => ({ id: "m", type: "message", role: "assistant", model: "x", content: [{ type: "tool_use", id: "t", name: "save_emails", input: { emails }, caller: { type: "direct" } } as never], stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } as never, container: null, context_management: null } as never);
const owner = { ws: "w", user: "u", role: "owner" as const };

test("build: emails rewritten in the brand's voice, the rest left as built", async () => {
  const f = fake();
  let calls = 0;
  const ai: Model = async () => {
    calls++;
    return reply([{ id: "trial_onboarding:0", subject: "Your Lumen workspace is ready", preheader: "Connect a spreadsheet", paragraphs: ["Hi {{first_name|there}},", "Connect your first spreadsheet and Lumen builds the report."], cta_label: "Connect a spreadsheet" }, { id: "trial_onboarding:1", subject: "Bad!", paragraphs: ["x"] }]);
  };
  const r = await build(f.rpc, f.db, owner, { base: "https://app.tryclaritia.com", ai });
  assert.equal(calls, 1);
  assert.equal(r.rewritten, 1, "the bad rewrite was dropped");
  assert.deepEqual(f.made.map((m) => m.journey), ["trial_onboarding", "ready_for_sales", "missed_demo", "form_not_booked"]);
  const first = journeyEmails(cleanBody(f.made[0]!.draft).steps)[0]!;
  assert.equal(first.email.subject, "Your Lumen workspace is ready");
  assert.equal(first.email.cta_url, "https://lumen.io", "links stay as built");
  assert.equal(first.approved, false);
  // The same build again replays from the cache: the model isn't called a second time.
  await build(f.rpc, f.db, owner, { base: "https://app.tryclaritia.com", ai });
  assert.equal(calls, 1);
});

test("build: when the AI fails, the journeys are still made with their own words", async () => {
  const f = fake();
  const r = await build(f.rpc, f.db, owner, { base: "https://app.tryclaritia.com", ai: async () => Promise.reject(new Error("overloaded")) });
  assert.equal(r.rewritten, 0);
  assert.equal(f.made.length, 4);
  assert.match(journeyEmails(cleanBody(f.made[0]!.draft).steps)[0]!.email.subject, /Lumen account is ready/);
});

test("build: a second run adds only what's missing, and members can't build", async () => {
  const f = fake({ journeys: [{ id: "x", journey: "trial_onboarding", stage: "trial" }, { id: "y", journey: "missed_demo", stage: "pipeline" }] });
  await build(f.rpc, f.db, owner, { base: "https://app.tryclaritia.com", ai: null });
  assert.deepEqual(f.made.map((m) => m.journey), ["ready_for_sales", "form_not_booked"]);
  await assert.rejects(build(f.rpc, f.db, { ...owner, role: "member" }, { base: "", ai: null }), /owners/);
});
