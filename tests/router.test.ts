// The router's core (docs/router.md): conditions, spam signals, the engine's every step, the sentences, the checks,
// version changes and the templates, all in memory.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanBody, problems } from "../src/lib/router/check.ts";
import { condWords, holds, ruleWords, toNumber, BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { diffBodies } from "../src/lib/router/diff.ts";
import { blocked, decide, pickInQueue, whyNot } from "../src/lib/router/engine.ts";
import { explain, pathWords, plain } from "../src/lib/router/explain.ts";
import { fakeName, listed, spamSignals } from "../src/lib/router/spam.ts";
import { fromLeadSettings, fromTemplate } from "../src/lib/router/templates.ts";
import { emptyBody, type Facts, type RepFacts, type RouterBody } from "../src/lib/router/types.ts";

const LEE = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222222";
const RAJ = "33333333-3333-4333-8333-333333333333";
const SAM = "44444444-4444-4444-8444-444444444444";
const NOW = Date.UTC(2026, 9, 26, 15, 0);
const DAY = 86_400_000;

const rep = (name: string, o: Partial<RepFacts> = {}): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true, ...o });

function facts(o: Partial<Facts> & { lead?: Partial<Facts["lead"]> } = {}): Facts {
  return {
    now: NOW,
    values: { "lead.country": "US", "company.size": "51-200", "lead.source": "form" },
    owner: null,
    company: null,
    reps: { [LEE]: rep("Lee Park"), [ANA]: rep("Ana Ruiz"), [RAJ]: rep("Raj Shah"), [SAM]: rep("Sam Lee") },
    counts: {},
    lists: { allow: [], block: [] },
    ...o,
    lead: { id: "c1", name: "Dana Lee", email: "dana@acme.com", emailClass: "work", domain: "acme.com", firstName: "Dana", lastName: "Lee", recent: 1, disposable: false, ...o.lead },
  };
}

function body(): RouterBody {
  const b = emptyBody();
  b.territories = [{ id: "t_na", name: "North America", countries: ["US", "CA", "MX"] }];
  b.queues = [
    { id: "q_us", name: "US mid-market", method: "rr", strict: false, hoursOnly: false, members: [{ user: LEE, weight: 1 }, { user: ANA, weight: 1 }, { user: RAJ, weight: 1 }] },
    { id: "q_ent", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: [{ user: SAM, weight: 1 }] },
  ];
  b.rules.list = [
    { id: "r_ent", name: "Enterprise", match: "all", conds: [{ field: "company.size", op: "gt", value: 1000 }], queue: "q_ent" },
    { id: "r_us", name: "US mid-market", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["t:t_na"] }, { field: "company.size", op: "between", value: [51, 200] }], queue: "q_us" },
  ];
  b.fallback = { kind: "user", id: SAM };
  return b;
}

test("conditions: numbers from size ranges, lists with territories, empty values", () => {
  assert.equal(toNumber("51-200"), 51);
  assert.equal(toNumber("10,000+"), 10000);
  assert.equal(toNumber("1,001 to 5,000"), 1001);
  const t = [{ id: "na", name: "North America", countries: ["US", "CA"] }];
  assert.ok(holds({ field: "x", op: "one_of", value: ["t:na", "GB"] }, "ca", t));
  assert.ok(!holds({ field: "x", op: "one_of", value: ["t:na"] }, "DE", t));
  assert.ok(holds({ field: "x", op: "not_one_of", value: ["t:na"] }, null, t), "an empty value isn't in any list");
  assert.ok(holds({ field: "x", op: "between", value: [51, 200] }, "51-200"));
  assert.ok(!holds({ field: "x", op: "gt", value: 1000 }, "51-200"));
  assert.ok(holds({ field: "x", op: "contains", value: ["vp", "head"] }, "Head of Sales"));
  assert.ok(holds({ field: "x", op: "one_of", value: ["pricing"] }, ["demo", "pricing"]), "a multi-choice answer holds when any item does");
  assert.ok(holds({ field: "x", op: "empty" }, ""));
  assert.ok(!holds({ field: "x", op: "is" , value: 5 }, null));
  assert.equal(condWords({ field: "lead.country", op: "one_of", value: ["t:na", "GB"] }, BASE_FIELDS, t), "country is North America or United Kingdom");
  assert.equal(
    ruleWords({ id: "r", name: "r", match: "all", queue: "q", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }, { field: "company.size", op: "between", value: [51, 200] }] }, BASE_FIELDS, []),
    "Country is United States, and company size is between 51 and 200",
  );
});

test("spam: fake names are caught and real short names never are", () => {
  for (const [f, l] of [["asdf", "asdf"], ["Test", "Test"], ["sdfghjk", ""], ["Bob", "http://spam.ru"], ["aaaa", "b"], ["John", "12345"], ["test", "user"]]) assert.ok(fakeName(f, l), `${f} ${l}`);
  for (const [f, l] of [["Al", "Wu"], ["Bo", "Ng"], ["Mkhitaryan", ""], ["Krzysztof", "Brzęczyszczykiewicz"], ["Lý", "Xu"], ["李", "伟"], ["Anne-Marie", "O'Neil"], ["John", "Test"], ["Ty", "Ly"], ["", ""]]) assert.ok(!fakeName(f, l), `${f} ${l}`);
  assert.ok(listed(["acme.com"], "x@eu.acme.com", null));
  assert.ok(!listed(["acme.com"], "x@notacme.com", null));
  assert.ok(listed(["qa@acme.com"], "QA@acme.com", null));
  const b = emptyBody();
  b.spam.freeMail = true;
  const s = spamSignals(b, facts({ lead: { disposable: true, emailClass: "free", recent: 9, firstName: "asdf", lastName: "asdf" }, lists: { allow: [], block: ["acme.com"] } }));
  assert.deepEqual(s.signals.sort(), ["blocked", "disposable", "fake_name", "free_mail", "too_many"]);
  assert.deepEqual(spamSignals(b, facts({ lead: { disposable: true }, lists: { allow: ["acme.com"], block: ["acme.com"] } })).signals, [], "the allow list wins");
});

test("engine: spam holds; the step off still holds blocked addresses", () => {
  const b = body();
  const d = decide(b, facts({ lead: { disposable: true } }));
  assert.deepEqual(d.result, { kind: "held", signals: ["disposable"] });
  b.spam.on = false;
  assert.equal(decide(b, facts({ lead: { disposable: true } })).result.kind, "owner");
  assert.equal(decide(b, facts({ lists: { allow: [], block: ["acme.com"] } })).result.kind, "held");
});

test("engine: the account's owner, the opportunity's first, and what happens when they're out", () => {
  const b = body();
  const company = { id: "co1", name: "Acme", domain: "acme.com", owner: SAM, ownerCrm: null, oppOwner: LEE, oppName: "Acme rollout" };
  let d = decide(b, facts({ company }));
  assert.deepEqual(d.result, { kind: "owner", user: LEE, by: "account" });
  assert.match(plain(d, facts({ company })), /Acme's open opportunity "Acme rollout" is owned by Lee Park/);
  b.account.oppFirst = false;
  assert.equal((decide(b, facts({ company })).result as { user: string }).user, SAM);
  // Sam is out: his backup takes it.
  const out = facts({ company, reps: { ...facts().reps, [SAM]: rep("Sam Lee", { outUntil: NOW + 3 * DAY, backup: ANA }) } });
  d = decide(b, out);
  assert.deepEqual(d.result, { kind: "owner", user: ANA, by: "account" });
  assert.match(plain(d, out), /Sam Lee is out of office until .*Backup: Ana Ruiz/);
  // Route on instead.
  b.keep.whenOut = "route";
  d = decide(b, out);
  assert.equal(d.result.kind === "owner" && d.result.by, "queue");
  // Free mail never matches an account.
  assert.equal(decide(body(), facts({ company, lead: { emailClass: "free" } })).result.kind === "owner" && decide(body(), facts({ company, lead: { emailClass: "free" } })).steps[1]!.step, "account");
  // An owner who left the workspace: the lead goes on.
  const gone = facts({ company: { ...company, oppOwner: null }, reps: { ...facts().reps, [SAM]: rep("Sam Lee", { member: false }) } });
  assert.notEqual((decide(body(), gone).result as { user: string }).user, SAM);
});

test("engine: keep the owner; caps don't apply to leads they already own", () => {
  const f = facts({ owner: { user: RAJ, crm: null }, reps: { ...facts().reps, [RAJ]: rep("Raj Shah", { capDay: 1, today: 5 }) } });
  assert.deepEqual(decide(body(), f).result, { kind: "owner", user: RAJ, by: "keep" });
  const unmapped = decide(body(), facts({ owner: { user: null, crm: "hs-77" } }));
  assert.equal(unmapped.steps.find((s) => s.step === "keep")!.ok, false);
  assert.match(plain(unmapped, facts()), /CRM owner isn't linked/);
});

test("engine: the first matching rule picks the queue; round robin by count, then who waited longest", () => {
  const f = facts({ counts: { q_us: { [LEE]: { n: 3, last: NOW - 3 * DAY }, [ANA]: { n: 3, last: NOW - DAY }, [RAJ]: { n: 4, last: NOW - 5 * DAY } } } });
  const d = decide(body(), f);
  assert.deepEqual(d.result, { kind: "owner", user: LEE, by: "queue", queue: "q_us", rule: "r_us" });
  const text = plain(d, f);
  assert.match(text, /Skipped "Enterprise": company size is more than 1000 \(it's 51-200\)/);
  assert.match(text, /"US mid-market" matched/);
  assert.match(text, /US mid-market, take turns\. Lee Park had 3 of the last 10\./);
  assert.equal(pathWords(d), "Rule: US mid-market → take turns");
  assert.match(plain(decide(body(), facts()), facts()), /Lee Park takes the queue's first lead\./, "a new queue reads plainly");
});

test("engine: paused, out, caps and hours are skipped, with the reason kept", () => {
  const reps = { ...facts().reps, [LEE]: rep("Lee Park", { pausedUntil: Infinity }), [ANA]: rep("Ana Ruiz", { capDay: 8, today: 8 }), [RAJ]: rep("Raj Shah", { inHours: false }) };
  const b = body();
  b.queues[0]!.hoursOnly = true;
  let d = decide(b, facts({ reps }));
  assert.deepEqual(d.result, { kind: "owner", user: SAM, by: "fallback" }, "everyone in the queue is skipped");
  const q = d.steps.find((s) => s.step === "queue");
  assert.ok(q && q.step === "queue" && !q.ok);
  assert.deepEqual(q.others.map((o) => o.why), ["paused", "cap_day", "hours"]);
  assert.match(plain(d, facts({ reps })), /Ana Ruiz is at their daily cap of 8/);
  // Strict keeps the order outside working hours.
  b.queues[0]!.strict = true;
  d = decide(b, facts({ reps }));
  assert.equal((d.result as { user: string }).user, RAJ);
  assert.deepEqual(whyNot(b, facts({ reps }), d, LEE), { why: "paused", until: null });
  assert.deepEqual(whyNot(b, facts({ reps }), d, SAM), { why: "not_in_queue", queue: "US mid-market" });
});

test("engine: weighted shares by weight; by load picks the fewest meetings", () => {
  const b = body();
  b.queues[0] = { ...b.queues[0]!, method: "weighted", members: [{ user: LEE, weight: 2 }, { user: ANA, weight: 1 }] };
  const counts: Record<string, { n: number; last: number }> = {};
  const got: Record<string, number> = { [LEE]: 0, [ANA]: 0 };
  for (let i = 0; i < 300; i++) {
    const p = pickInQueue(b.queues[0]!, facts({ counts: { q_us: counts } })).picked!;
    got[p.user]!++;
    counts[p.user] = { n: (counts[p.user]?.n ?? 0) + 1, last: i };
  }
  assert.equal(got[LEE], 200);
  assert.equal(got[ANA], 100);
  b.queues[0] = { ...b.queues[0]!, method: "load" };
  const reps = { ...facts().reps, [LEE]: rep("Lee Park", { meetingsWeek: 9 }), [ANA]: rep("Ana Ruiz", { meetingsWeek: 4 }) };
  assert.equal(pickInQueue(b.queues[0]!, facts({ reps })).picked!.user, ANA);
});

test("engine: no rule, a paused fallback, or no fallback ends Unassigned", () => {
  const b = body();
  const f = facts({ values: { "lead.country": "DE", "company.size": "10", "lead.source": "form" } });
  assert.deepEqual(decide(b, f).result, { kind: "owner", user: SAM, by: "fallback" });
  const paused = facts({ values: f.values, reps: { ...f.reps, [SAM]: rep("Sam Lee", { pausedUntil: NOW + DAY }) } });
  assert.deepEqual(decide(b, paused).result, { kind: "unassigned" });
  // The fallback takes leads over its caps.
  const capped = facts({ values: f.values, reps: { ...f.reps, [SAM]: rep("Sam Lee", { capDay: 1, today: 3 }) } });
  assert.deepEqual(decide(b, capped).result, { kind: "owner", user: SAM, by: "fallback" });
  b.fallback = null;
  assert.deepEqual(decide(b, f).result, { kind: "unassigned" });
  assert.match(plain(decide(b, f), f), /No fallback set\. Unassigned\./);
});

test("engine: the same facts give the same answer", () => {
  const f = facts({ counts: { q_us: { [LEE]: { n: 1, last: 5 }, [ANA]: { n: 1, last: 5 } } } });
  const a = JSON.stringify(decide(body(), f));
  for (let i = 0; i < 20; i++) assert.equal(JSON.stringify(decide(body(), f)), a);
});

test("explain: every step reads as a sentence, with links for names", () => {
  const company = { id: "co1", name: "Acme", domain: "acme.com", owner: null, ownerCrm: null, oppOwner: null, oppName: null };
  const f = facts({ company });
  const lines = explain(decide(body(), f), f);
  assert.deepEqual(lines.map((l) => [l.title, l.mark]), [["Filter out junk", "ok"], ["Same company, same rep", "skip"], ["Keep their rep", "skip"], ["Who gets which leads", "ok"], ["Team", "ok"]]);
  assert.ok(lines[3]!.parts.some((p) => typeof p !== "string" && p.kind === "rule" && p.id === "r_us"));
  assert.ok(lines[4]!.more?.length === 2, "the other reps fold under the queue line");
});

test("check: any input becomes a valid body; problems point at their cards", () => {
  const clean = cleanBody({ spam: { maxPerHour: 999 }, rules: { list: [{ id: "r1", name: "X", conds: [{ field: "lead.country", op: "nope" }, { field: "lead.country", op: "one_of", value: ["US", 5, {}] }], queue: "q1" }] }, queues: [{ id: "q1", members: [{ user: LEE, weight: 50 }, { user: LEE }, { user: "bad" }] }], fallback: { kind: "queue", id: "missing" } });
  assert.equal(clean.spam.maxPerHour, 100);
  assert.deepEqual(clean.rules.list[0]!.conds, [{ field: "lead.country", op: "one_of", value: ["US", 5] }]);
  assert.deepEqual(clean.queues[0]!.members, [{ user: LEE, weight: 10 }]);
  assert.equal(clean.fallback, null);
  const members = new Set([LEE, ANA]);
  const ps = problems(clean, { members });
  assert.deepEqual(ps.map((p) => p.text), ["Pick a fallback"]);
  const b = body();
  b.queues[1]!.members = [];
  b.rules.list[1]!.conds.push({ field: "company.size", op: "gt" });
  const texts = problems(b, { members: new Set([LEE, ANA, SAM]) }).map((p) => `${p.where.kind}:${p.where.id ?? ""} ${p.text}`);
  assert.ok(texts.includes("rule:r_us \"US mid-market\" has a condition with no value"));
  assert.ok(texts.includes("queue:q_ent Enterprise has no reps"));
  assert.ok(texts.includes("queue:q_us US mid-market has a rep no longer in the workspace"));
});

test("diff: changes between versions in words", () => {
  const a = body();
  const b = structuredClone(a);
  b.rules.list.push({ id: "r_emea", name: "EMEA", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], queue: "q_ent" });
  b.queues[0]!.method = "weighted";
  b.queues[0]!.members[0]!.weight = 2;
  b.fallback = { kind: "user", id: LEE };
  const names = { [LEE]: "Lee Park", [SAM]: "Sam Lee" };
  const t = diffBodies(a, b, { names }).map((c) => `${c.sign} ${c.text}`);
  assert.ok(t.includes(`+ Rule "EMEA" (3rd) → Enterprise`));
  assert.ok(t.includes("~ US mid-market: take turns → some get more"));
  assert.ok(t.includes("~ Lee Park weight 1 → 2 in US mid-market"));
  assert.ok(t.includes("~ Everyone else goes to Sam Lee → Lee Park"));
  assert.deepEqual(diffBodies(a, structuredClone(a)), []);
});

test("templates: each one is valid once reps and a fallback are set; today's routing moves over", () => {
  const tr = fromTemplate("territories", { regions: ["North America", "DACH"] });
  assert.deepEqual(tr.rules.list.map((r) => r.name), ["North America", "DACH"]);
  assert.deepEqual(problems(tr, { members: new Set() }).map((p) => p.text), ["North America has no reps", "DACH has no reps", "Pick a fallback"]);
  const rr = fromTemplate("round_robin", { reps: [LEE, ANA] });
  assert.deepEqual(problems(rr, { members: new Set([LEE, ANA]) }), []);
  const d = decide(rr, facts());
  assert.equal(d.result.kind === "owner" && d.result.by, "fallback");
  const { body: moved, unmapped } = fromLeadSettings(
    {
      respect_owner: true,
      rules: [
        { name: "DACH", countries: ["de", "at"], owners: [{ user_id: LEE }, { crm_owner_id: "hs-1", label: "Ana" }, { crm_owner_id: "hs-9", label: "Old rep" }] },
        { name: "No owners", countries: ["fr"], owners: [] },
        { name: "Rest", owners: [{ user_id: RAJ }] },
      ],
      default: { owners: [{ user_id: SAM }] },
    },
    (crm) => (crm === "hs-1" ? ANA : null),
  );
  assert.deepEqual(moved.rules.list.map((r) => r.name), ["DACH", "Rest"]);
  assert.deepEqual(moved.queues[0]!.members.map((m) => m.user), [LEE, ANA]);
  assert.deepEqual(unmapped, ["Old rep"]);
  assert.deepEqual(moved.fallback, { kind: "queue", id: "q_default" });
  const de = facts({ values: { "lead.country": "DE", "lead.source": "form" } });
  assert.equal(decide(moved, de).result.kind === "owner" && (decide(moved, de).result as { rule?: string }).rule, "r1");
  const us = facts({ values: { "lead.country": "US", "lead.source": "form" } });
  assert.equal((decide(moved, us).result as { user: string }).user, RAJ, "a rule with nothing to test takes every lead, as before");
});

test("blocked: owners skip caps and hours", () => {
  const r = rep("X", { capDay: 1, today: 2, inHours: false });
  assert.deepEqual(blocked(r, NOW), { why: "cap_day" });
  assert.equal(blocked(r, NOW, { forOwner: true }), null);
  assert.deepEqual(blocked(rep("X", { outUntil: NOW - 1 }), NOW), null, "an out-of-office that ended");
});

// Response times (docs/router.md Part 17) ------------------------------------------------------------------------

test("response time: a rep who let the lead wait is skipped everywhere, and never kept", async () => {
  const { cleanSla } = await import("../src/lib/router/check.ts");
  const b = body();
  // The owner who missed is never kept, even with "keep them" when out; their backup takes it.
  b.keep.whenOut = "keep";
  const f = facts({ owner: { user: LEE, crm: null }, passed: [LEE], reps: { [LEE]: rep("Lee Park", { backup: ANA }), [ANA]: rep("Ana Ruiz"), [RAJ]: rep("Raj Shah"), [SAM]: rep("Sam Lee") } });
  const d = decide(b, f);
  assert.deepEqual(d.result, { kind: "owner", user: ANA, by: "keep" });
  // No backup: the queue picks someone else.
  const f2 = facts({ owner: { user: LEE, crm: null }, passed: [LEE] });
  const d2 = decide(b, f2);
  assert.equal(d2.result.kind, "owner");
  assert.notEqual((d2.result as { user: string }).user, LEE);
  const q = d2.steps.find((s) => s.step === "queue") as Extract<(typeof d2.steps)[number], { step: "queue" }>;
  assert.deepEqual(q.others.find((o) => o.user === LEE), { user: LEE, n: 0, why: "passed" });
  // Every queue member and the fallback passed: Unassigned.
  const f3 = facts({ passed: [LEE, ANA, RAJ, SAM] });
  assert.equal(decide(b, f3).result.kind, "unassigned");
  // The line that says why the lead moved reads first.
  const lines = plain({ ...d2, steps: [{ step: "sla", ok: false, user: LEE, minutes: 60 }, ...d2.steps] }, f2);
  assert.match(lines.split("\n")[0]!, /^✗ Follow-up time: Lee Park didn't act within 1 hour\. Passed on\.$/);
  assert.match(pathWords({ ...d2, steps: [{ step: "sla", ok: false, user: LEE, minutes: 60 }, ...d2.steps] }), /^Passed on\. Rule: /);
  assert.equal(whyNot(b, f2, d2, LEE).why, "passed");
  // Settings kept in range; a nudge at or after the deadline is dropped.
  assert.deepEqual(cleanSla({ on: true, minutes: 2, nudge: 10, next: "x" }), { on: true, minutes: 5, nudge: null, next: "route", manager: null });
  assert.deepEqual(cleanSla({ on: true, minutes: 60, nudge: 30, next: "manager", manager: SAM }), { on: true, minutes: 60, nudge: 30, next: "manager", manager: SAM });
  assert.equal(cleanBody({}).sla?.on, false);
  // Manager missing or gone stops publishing.
  const m = { ...body(), sla: { on: true, minutes: 60, nudge: null, next: "manager" as const, manager: null } };
  assert.ok(problems(m, { members: new Set([LEE, ANA, RAJ, SAM]) }).some((p) => p.where.kind === "sla"));
  assert.deepEqual(diffBodies(body(), { ...body(), sla: { on: true, minutes: 30, nudge: 10, next: "route", manager: null } }).at(-1), { sign: "~", text: "Follow-up time off → 30 minutes, then someone else, reminder at 10 minutes" });
});

test("/book: the email and type words, Slack's mailto wrapping, and the type picked by name", async () => {
  const { parseBook, pickType } = await import("../src/lib/slack/book.ts");
  assert.deepEqual(parseBook("<mailto:Dana@Acme.com|Dana@Acme.com> demo"), { email: "dana@acme.com", words: ["demo"] });
  assert.deepEqual(parseBook("intro dana@acme.com"), { email: "dana@acme.com", words: ["intro"] });
  assert.deepEqual(parseBook("  "), { email: null, words: [] });
  const types = [{ name: "Demo call" }, { name: "Intro call" }];
  assert.equal(pickType(types, [])?.name, "Demo call");
  assert.equal(pickType(types, ["intro"])?.name, "Intro call");
  assert.equal(pickType(types, ["pricing"]), null);
});
