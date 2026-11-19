// Plan locks (docs/pricing.md Part 4; src/lib/plans.ts, src/lib/planGate.ts, 171_plan_locks.sql): which plan each
// feature is on, the one line that says so (the same words in the app and the database), the plan read that retries a
// hiccup and lets the work through when it can't tell, links and polls that close on a lower plan, deliveries that
// skip instead of sending, publishing that holds signatures and payments, and routing that drops its rules below Pro,
// on a database that answers slowly or not at all.
import assert from "node:assert/strict";
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { seal } from "../src/lib/seal.ts";
import { formFeatures, publishLocks } from "../src/lib/forms/planLocks.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { forgetPlan, linkLocked, lockFor, planCached, planLets, planRefusal, readPlan } from "../src/lib/planGate.ts";
import { allows, destinationFeature, FEATURES, FREE_TOOLS, linkFeature, lockLine, planFor, toolFeature, type Feature } from "../src/lib/plans.ts";
import { route, rulesOff } from "../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../src/lib/router/types.ts";

const WS = "0192f3a1-0000-7000-8000-000000000001";
const now = () => Promise.resolve();

/** A database whose workspace_plan answers from `script` in turn (an Error throws), then the last one for good. */
function planDb(script: (string | { error: string } | Error)[]) {
  let i = 0;
  const calls: string[] = [];
  const rpc: Rpc = async (fn) => {
    calls.push(fn);
    if (fn !== "workspace_plan") return { data: null, error: { message: `unexpected ${fn}` } };
    const step = script[Math.min(i++, script.length - 1)]!;
    if (step instanceof Error) throw step;
    return typeof step === "string" ? { data: step, error: null } : { data: null, error: { message: step.error } };
  };
  return { rpc, calls: () => calls.filter((f) => f === "workspace_plan").length };
}

// Which plan --------------------------------------------------------------------------------------------------------

test("each lock sits on the plan docs/pricing.md names", () => {
  const on = (f: Feature) => FEATURES[f];
  assert.deepEqual([on("polls"), on("one_off"), on("single_use"), on("signatures"), on("form_payments"), on("integrations")], ["starter", "starter", "starter", "starter", "starter", "starter"]);
  assert.equal(on("routing"), "pro");
  assert.equal(on("salesforce"), "business");
  assert.equal(allows("free", "integrations"), false);
  assert.equal(allows("starter", "integrations"), true);
  assert.equal(allows("starter", "routing"), false);
  assert.equal(allows("pro", "routing"), true);
  assert.equal(allows("team", "routing"), true, "old Team workspaces keep Pro's features");
  assert.equal(allows("pro", "salesforce"), false);
  assert.equal(allows("business", "salesforce"), true);
  assert.equal(planFor("routing").name, "Pro");
});

test("the line says where the feature is, in plain words", () => {
  assert.equal(lockLine("polls"), "Meeting polls are on Starter and up.");
  assert.equal(lockLine("single_use"), "Single-use links are on Starter and up.");
  assert.equal(lockLine("routing"), "Routing by answer is on Pro and up.");
  assert.equal(lockLine("salesforce"), "Salesforce is on Business.");
  assert.equal(lockLine("integrations"), "Integrations are on Starter and up.");
});

test("the database says the same line and holds the same plans (171_plan_locks.sql)", () => {
  const sql = readFileSync(new URL("../supabase/migrations/171_plan_locks.sql", import.meta.url), "utf8");
  const rank = { starter: 1, pro: 2, business: 3 } as const;
  for (const f of ["polls", "one_off", "single_use", "integrations", "signatures", "form_payments", "routing", "salesforce"] as Feature[]) {
    assert.ok(sql.includes(`when '${f}' then '${lockLine(f).replace(/'/g, "''")}'`), `plan_line says ${lockLine(f)}`);
    assert.match(sql, new RegExp(`when '${f}' then ${rank[FEATURES[f] as keyof typeof rank]}\\b`), `plan_feature_rank holds ${f} on ${FEATURES[f]}`);
  }
  for (const k of FREE_TOOLS) assert.ok(sql.includes(`'${k}'`), `plan_tool keeps ${k} on every plan`);
});

test("links, tools and destinations map to their feature", () => {
  assert.deepEqual(["poll", "one_off", "single_use", "page"].map(linkFeature), ["polls", "one_off", "single_use", null]);
  assert.equal(toolFeature("hubspot"), "integrations");
  assert.equal(toolFeature("google_sheets"), "integrations");
  assert.equal(toolFeature("salesforce"), "salesforce");
  assert.equal(toolFeature("api"), null, "the webhook is on every plan");
  assert.equal(toolFeature("google_forms"), null, "Google Forms import is on every plan");
  assert.equal(destinationFeature("webhook"), null);
  assert.equal(destinationFeature("slack"), "integrations");
  assert.equal(destinationFeature("source", "salesforce"), "salesforce");
  assert.equal(destinationFeature("source", null), "integrations", "a tool that can't be read is still a tool");
});

test("a database refusal reads back as its line; other errors don't", () => {
  assert.equal(planRefusal("Meeting polls are on Starter and up."), "Meeting polls are on Starter and up.");
  assert.equal(planRefusal("ERROR: Salesforce is on Business."), "Salesforce is on Business.");
  assert.equal(planRefusal("duplicate key value violates unique constraint"), null);
  assert.equal(planRefusal(null), null);
});

// Reading the plan ----------------------------------------------------------------------------------------------------

test("flaky: a plan read that times out twice is tried again with growing waits, then holds the line", async () => {
  const waits: number[] = [];
  const db = planDb([{ error: "canceling statement due to statement timeout" }, new Error("fetch failed"), "free"]);
  assert.equal(await readPlan(db.rpc, WS, { wait: async (ms) => void waits.push(ms) }), "free");
  assert.equal(db.calls(), 3);
  assert.deepEqual(waits, [150, 450], "growing waits");
  assert.equal(await lockFor(planDb([{ error: "503 Service Unavailable" }, "free"]).rpc, WS, "polls", { wait: now }), "Meeting polls are on Starter and up.");
});

test("flaky: a plan that never comes back lets the work through, and a refusal that isn't a hiccup isn't tried again", async () => {
  const down = planDb([{ error: "connection terminated unexpectedly" }]);
  assert.equal(await readPlan(down.rpc, WS, { wait: now }), null);
  assert.equal(down.calls(), 3, "three tries, then it stops");
  assert.equal(await lockFor(down.rpc, WS, "integrations", { wait: now }), null, "unknown lets it run");
  const odd = planDb([{ error: "permission denied for function workspace_plan" }]);
  assert.equal(await readPlan(odd.rpc, WS, { wait: now }), null);
  assert.equal(odd.calls(), 1);
  const before = planDb([{ error: "Could not find the function public.workspace_plan(p_ws) in the schema cache" }]);
  assert.equal(await readPlan(before.rpc, WS, { wait: now }), null, "a database before 120 has no plans: everything stays open");
  assert.equal(planLets(null, "salesforce"), true);
  assert.equal(await lockFor(down.rpc, WS, null), null, "a feature on every plan never reads");
});

test("the visitor's path keeps the plan a minute, shares one read, and never keeps a failed one", async () => {
  forgetPlan();
  const db = planDb(["starter"]);
  const [a, b] = await Promise.all([planCached(db.rpc, WS, { now: 1000 }), planCached(db.rpc, WS, { now: 1000 })]);
  assert.deepEqual([a, b, db.calls()], ["starter", "starter", 1]);
  assert.equal(await planCached(db.rpc, WS, { now: 50_000 }), "starter");
  assert.equal(db.calls(), 1);
  await planCached(db.rpc, WS, { now: 70_000 });
  assert.equal(db.calls(), 2, "read again after a minute");
  forgetPlan();
  const flaky = planDb([{ error: "timeout" }, { error: "timeout" }, { error: "timeout" }, "pro"]);
  assert.equal(await planCached(flaky.rpc, WS, { now: 1000, wait: now }), null);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await planCached(flaky.rpc, WS, { now: 1001, wait: now }), "pro", "the failed read wasn't kept");
  forgetPlan();
});

test("a link on a lower plan is closed to guests; on Starter, or when the plan can't be read, it stays open", async () => {
  forgetPlan();
  assert.equal(await linkLocked(planDb(["free"]).rpc, { workspace_id: WS, kind: "poll" }), true);
  forgetPlan();
  assert.equal(await linkLocked(planDb(["starter"]).rpc, { workspace_id: WS, kind: "single_use" }), false);
  forgetPlan();
  assert.equal(await linkLocked(planDb([{ error: "ECONNRESET" }]).rpc, { workspace_id: WS, kind: "one_off" }, { wait: now }), false);
  forgetPlan();
});

// Deliveries -----------------------------------------------------------------------------------------------------------

function taken(kind: Taken["destination"]["kind"]): Taken {
  return {
    delivery: { id: "d1", attempts: 1, external_id: null },
    destination: { id: "x1", workspace_id: WS, kind, source_id: kind === "source" ? "s1" : null, name: kind === "slack" ? "Slack" : "Hook", config: { host: "example.com" }, mode: "upsert" },
    sealed: null,
    submission: { id: "sub1", created_at: "2026-11-19T10:00:00Z", values: { email: "ana@acme.com" }, hidden: {}, test: false, form_version: 1, contact_id: null },
    form: { id: "f1", name: "Demo", body: null },
    contact: null,
  };
}

test("on Free a fill to Slack or a tool is skipped with the line, and the fill itself is never touched", async () => {
  forgetPlan();
  const free = planDb(["free"]);
  const r = await sendDelivery(taken("slack"), { run: { rpc: free.rpc, clean: async () => ({}) as never }, plan: { wait: now } });
  assert.deepEqual(r, { status: "skipped", reason: "Integrations are on Starter and up." });
  forgetPlan();
  // A tool on Free: skipped before the tool is even read.
  const calls: string[] = [];
  const tool = (plan: string, kind: string): Rpc => async (fn, args) => {
    calls.push(fn);
    if (fn === "workspace_plan") return { data: plan, error: null };
    if (fn === "source_load") return { data: { source: { id: args.p_id, workspace_id: WS, kind, name: kind, status: "active", settings: {}, cursors: {} }, sealed: seal(JSON.stringify({ type: "key", values: { api_key: "k" } })) }, error: null };
    return { data: null, error: { message: `unexpected ${fn}` } };
  };
  assert.deepEqual(await sendDelivery(taken("source"), { run: { rpc: tool("free", "hubspot"), clean: async () => ({}) as never } }), { status: "skipped", reason: "Integrations are on Starter and up." });
  assert.deepEqual(calls, ["workspace_plan"], "nothing is read or sent");
  forgetPlan();
  // Salesforce on Starter: the tool is read, then the plan says no before anything is sent.
  assert.deepEqual(await sendDelivery(taken("source"), { run: { rpc: tool("starter", "salesforce"), clean: async () => ({}) as never } }), { status: "skipped", reason: "Salesforce is on Business." });
  forgetPlan();
  // HubSpot on Starter goes on to send (here: no contact on the fill, so nothing to send, as before).
  assert.deepEqual(await sendDelivery(taken("source"), { run: { rpc: tool("starter", "hubspot"), clean: async () => ({}) as never } }), { status: "skipped", reason: "No contact to send." });
  forgetPlan();
});

test("flaky: a delivery whose plan can't be read is sent as before", async () => {
  forgetPlan();
  const down = planDb([{ error: "timeout" }]);
  const r = await sendDelivery(taken("slack"), { run: { rpc: down.rpc, clean: async () => ({}) as never }, plan: { wait: now } });
  assert.notEqual(r.status, "skipped", "not skipped for the plan");
  forgetPlan();
});

// Publishing ----------------------------------------------------------------------------------------------------------

function formWith(fields: { type: string; extra?: Record<string, unknown> }[], schedule?: Record<string, unknown>): Form {
  const f = emptyForm();
  const step = f.steps[0]!;
  step.fields = [...step.fields, ...fields.map((x, i) => ({ ...(step.fields[0] ?? {}), id: `x${i}`, key: `x${i}`, label: `X${i}`, type: x.type, required: false, ...(x.extra ?? {}) }))] as never;
  if (schedule) (f as { after: Record<string, unknown> }).after = { ...f.after, kind: "schedule", schedule } as never;
  return f;
}

test("a form with a signature or a payment doesn't publish below Starter; routing by answer goes without its rules below Pro", () => {
  const signed = formWith([{ type: "signature" }]);
  assert.deepEqual(formFeatures(signed), ["signatures"]);
  assert.deepEqual(publishLocks(signed, "free"), { refuse: ["Signatures are on Starter and up."], routing: true, note: null });
  assert.deepEqual(publishLocks(signed, "starter").refuse, []);
  const paid = formWith([{ type: "payment", extra: { pay: { amount: 1000, currency: "usd" } } }]);
  assert.deepEqual(publishLocks(paid, "free").refuse, ["Payments on forms are on Starter and up."]);
  const routed = formWith([], { tool: "claritia", url: "", perOwner: false, meetingTypeId: "t1", routes: [{ when: [], meet: "t2" }] });
  assert.deepEqual(formFeatures(routed), ["routing"]);
  assert.deepEqual(publishLocks(routed, "starter"), { refuse: [], routing: false, note: "Routing by answer is on Pro and up." });
  assert.deepEqual(publishLocks(routed, "pro"), { refuse: [], routing: true, note: null });
  assert.deepEqual(publishLocks(signed, null).refuse, [], "a plan that can't be read holds nothing back");
  const plain = checkForm(emptyForm());
  assert.ok(!("errors" in plain) && formFeatures(plain.form).length === 0, "a plain form uses nothing on a higher plan");
});

// Routing -------------------------------------------------------------------------------------------------------------

const A = "0192f3a1-0000-7000-8000-00000000000a";
const B = "0192f3a1-0000-7000-8000-00000000000b";
const rep = (name: string) => ({ name, member: true, tz: "UTC", availability: null, paused_until: null, out_dates: [], calendar_out_until: null, backup: null, cap_day: null, cap_week: null, today: 0, week: 0, meetings_week: 0 });

function routerBody(): RouterBody {
  const b = emptyBody();
  return {
    ...b,
    spam: { ...b.spam, on: false },
    account: { ...b.account, on: false },
    keep: { ...b.keep, on: false },
    queues: [{ id: "q1", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: [{ user: A, weight: 1 }] }],
    rules: { on: true, list: [{ id: "r1", name: "Enterprise", match: "all", conds: [{ field: "answer.plan", op: "is", value: "ent" }], queue: "q1" }] },
    fallback: { kind: "user", id: B },
  };
}

/** A routing database: the plan from `plan`, one lead who answered Enterprise, and a committer that writes the pick. */
function routingDb(plan: (string | { error: string })[]) {
  const p = planDb(plan);
  const commits: { user: string | null; rule: string | null }[] = [];
  const rpc: Rpc = async (fn, args) => {
    if (fn === "workspace_plan") return p.rpc(fn, args);
    if (fn === "routing_facts")
      return {
        data: {
          contact: { id: "c1", email: "ana@acme.com", email_clean: "ana@acme.com", email_class: "work", first_name: "Ana", last_name: "Diaz", title: null, country: null, region: null, lifecycle: null, lead_status: null, score: null, score_band: null, fields: {}, route_status: null },
          domain: "acme.com",
          owner: { user: null, crm: null },
          company: null,
          submission: { id: "s1", form_id: "f1", values: { plan: "ent" }, hidden: {} },
          recent: 0,
          reps: { [A]: rep("Ann"), [B]: rep("Ben") },
          counts: {},
          lists: { allow: [], block: [] },
        },
        error: null,
      };
    if (fn === "routing_commit") {
      const d = (args.p as { decision: { kind: string; user?: string; rule?: string }; pick?: { candidates: { user: string }[] } }).decision;
      const owner = (args.p as { pick?: { candidates: { user: string }[] } }).pick?.candidates[0]?.user ?? d.user ?? null;
      commits.push({ user: owner, rule: d.rule ?? null });
      return { data: { status: "ok", id: `run${commits.length}`, owner }, error: null };
    }
    return { data: null, error: { message: `Could not find the function public.${fn}` } };
  };
  return { rpc, commits, planCalls: p.calls };
}

const routeOnce = (db: ReturnType<typeof routingDb>) => route(db.rpc, { ws: WS, contact: "c1", key: `k-${Math.random()}`, reason: "form", live: { version: 1, body: routerBody() }, plan: { wait: now } });

test("on Pro a lead routes by its answer; on Starter the rules don't run and the lead takes the default", async () => {
  forgetPlan();
  const pro = routingDb(["pro"]);
  const a = await routeOnce(pro);
  assert.equal(a.status, "ok");
  assert.deepEqual(pro.commits, [{ user: A, rule: "r1" }], "Enterprise answer, Enterprise team");
  forgetPlan();
  const starter = routingDb(["starter"]);
  const b = await routeOnce(starter);
  assert.equal(b.status, "ok");
  assert.equal(starter.commits[0]!.user, B, "everyone takes the default path");
  assert.equal(starter.commits[0]!.rule, null);
  forgetPlan();
});

test("flaky: routing whose plan read hiccups twice still holds the plan; one that can't be read routes as set", async () => {
  forgetPlan();
  const flaky = routingDb([{ error: "statement timeout" }, { error: "ECONNRESET" }, "free"]);
  await routeOnce(flaky);
  assert.equal(flaky.planCalls(), 3);
  assert.equal(flaky.commits[0]!.user, B, "Free: the default, once the plan came back");
  forgetPlan();
  const down = routingDb([{ error: "connection terminated" }]);
  const r = await routeOnce(down);
  assert.equal(r.status, "ok", "the lead is still routed, never dropped");
  assert.equal(down.commits[0]!.user, A, "the rules run when the plan can't be told");
  forgetPlan();
});

test("rulesOff leaves the rest of the policy as it was", () => {
  const b = routerBody();
  const off = rulesOff(b);
  assert.equal(off.rules.on, false);
  assert.deepEqual(off.rules.list, b.rules.list, "the rules are kept, only not run");
  assert.deepEqual({ ...off, rules: b.rules }, b);
  assert.equal(b.rules.on, true, "the live body isn't changed");
});
