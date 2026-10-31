// Routing › Assignment over the saved router body (src/components/app/routing/assignModel.ts): each rule owns its
// team, the Default rule is the fallback, Round robin is the rules off, a team shared by several rules is shown on
// each and is one shared queue: changing one of them points it at a team with exactly those reps, or one new team,
// never a private copy per rule (an untouched body is never sent again), the four safeguards map
// onto the body and the engine honours them, Save saves then publishes (and a failed save publishes nothing), and
// Test a lead is the real engine through the `test` action, with a flaky facts read shown as an error, never an answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resetNewer } from "../src/lib/forms/newer.ts";
import { emailsTimesLater } from "../src/lib/forms/schedule.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import * as A from "../src/lib/router/actions.ts";
import { cleanBody } from "../src/lib/router/check.ts";
import { BASE_FIELDS, holds, opsFor } from "../src/lib/router/conditions.ts";
import { decide } from "../src/lib/router/engine.ts";
import { emptyBody, type Facts, type RepFacts, type RouterBody } from "../src/lib/router/types.ts";
import {
  addRule,
  bookedMeeting,
  changed,
  hitOf,
  issuesOf,
  modeOf,
  ruleColumn,
  rulesByRep,
  safeOf,
  samplesFor,
  saveAndPublish,
  setDefaultMethod,
  setDefaultReps,
  setMeet,
  setMode,
  setRuleMethod,
  setRuleReps,
  setSafe,
  setThen,
  setupBody,
  testResult,
  viewOf,
  whyOf,
} from "../src/components/app/routing/assignModel.ts";

const DAN = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const VIN = "44444444-4444-4444-8444-444444444444";
const DEMO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const INTRO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const NOW = Date.UTC(2026, 9, 30, 15, 0);
const names: Record<string, string> = { [DAN]: "Dan Reyes", [PRIYA]: "Priya Nair", [SAM]: "Sam Lee", [VIN]: "Vincent Nguyen" };
const name = (id: string) => names[id] ?? "Someone";

const rep = (n: string, o: Partial<RepFacts> = {}): RepFacts => ({ name: n, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true, ...o });
function facts(o: Partial<Facts> = {}): Facts {
  return {
    now: NOW,
    lead: { id: "c1", name: "Maya Chen", email: "maya@globex.com", emailClass: "work", domain: "globex.com", firstName: "Maya", lastName: "Chen", recent: 1, disposable: false },
    values: { "company.size": 800, "lead.country": "US" },
    owner: null,
    company: null,
    reps: { [DAN]: rep("Dan Reyes"), [PRIYA]: rep("Priya Nair"), [SAM]: rep("Sam Lee"), [VIN]: rep("Vincent Nguyen") },
    counts: {},
    lists: { allow: [], block: [] },
    ...o,
  };
}

/** The demo's setup: Enterprise (200 or more) to Dan and Priya; everyone else to Sam and Vincent. */
function demo(): RouterBody {
  const b = emptyBody();
  b.queues = [
    { id: "q_ent", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: [{ user: DAN, weight: 1 }, { user: PRIYA, weight: 1 }] },
    { id: "q_def", name: "Default rule", method: "rr", strict: false, hoursOnly: false, members: [{ user: SAM, weight: 1 }, { user: VIN, weight: 1 }] },
  ];
  b.rules.list = [{ id: "r1", name: "Enterprise", match: "all", conds: [{ field: "company.size", op: "gte", value: 200 }], queue: "q_ent", meet: DEMO }];
  b.fallback = { kind: "queue", id: "q_def", meet: INTRO };
  return b;
}

/** An older body: two rules and the fallback sharing one team, the way the Teams tab built them. */
function shared(): RouterBody {
  const b = emptyBody();
  delete b.notify;
  b.queues = [{ id: "q_sales", name: "Sales", method: "load", strict: true, hoursOnly: true, members: [{ user: DAN, weight: 3 }, { user: SAM, weight: 1 }] }];
  b.rules.list = [
    { id: "r_us", name: "US", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "q_sales" },
    { id: "r_de", name: "DE", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], queue: "q_sales" },
  ];
  b.fallback = { kind: "queue", id: "q_sales" };
  return cleanBody(b);
}

test("the body as Assignment: each rule's reps and method from its queue, the Default rule from the fallback", () => {
  const v = viewOf(demo(), BASE_FIELDS);
  assert.equal(v.mode, "rules");
  assert.deepEqual(v.rules.map((r) => ({ id: r.id, title: r.title, reps: r.reps, method: r.method, meet: r.meet, shared: r.shared })), [{ id: "r1", title: "Enterprise", reps: [DAN, PRIYA], method: "rr", meet: DEMO, shared: false }]);
  assert.deepEqual(v.def, { kind: "queue", id: "q_def", reps: [SAM, VIN], method: "rr", meet: INTRO, shared: false });
  assert.deepEqual(v.safe, { spam: true, owner: true, skip: true, alert: true });
  assert.deepEqual(Object.fromEntries(rulesByRep(v)), { [DAN]: ["Enterprise"], [PRIYA]: ["Enterprise"], [SAM]: ["Default rule"], [VIN]: ["Default rule"] });
});

test("round robin is the rules off or none: every lead goes to the fallback's reps; the rules are kept", () => {
  const b = setMode(demo(), "rr");
  assert.equal(b.rules.on, false);
  assert.equal(b.rules.list.length, 1, "switching keeps the rules for later");
  assert.equal(modeOf(b), "rr");
  assert.equal(modeOf({ ...emptyBody(), rules: { on: true, list: [] } }), "rr", "no rules reads as Round robin");
  const d = decide(b, facts());
  assert.equal(d.result.kind === "owner" && d.result.by, "fallback", "an Enterprise-sized lead still goes round robin");
  assert.ok(d.result.kind === "owner" && [SAM, VIN].includes(d.result.user));
  assert.equal(hitOf(d), "default");
  assert.equal(whyOf(d, { body: b, fields: BASE_FIELDS, name }), "Round robin across 2 reps");
  assert.equal(setMode(b, "rr"), b, "the same mode is no change");
  assert.deepEqual(Object.fromEntries(rulesByRep(viewOf(b, BASE_FIELDS))), { [SAM]: ["Round robin"], [VIN]: ["Round robin"] });
});

test("a rule assigns from its own reps, by its own method, and books its meeting; the engine decides", () => {
  const b = setRuleMethod(setRuleReps(demo(), "r1", [PRIYA]), "r1", "load");
  const q = b.queues.find((x) => x.id === "q_ent")!;
  assert.deepEqual(q.members, [{ user: PRIYA, weight: 1 }], "the rule's own queue changes in place");
  assert.equal(q.method, "load");
  const d = decide(b, facts());
  assert.deepEqual(d.result, { kind: "owner", user: PRIYA, by: "queue", queue: "q_ent", rule: "r1" });
  assert.equal(hitOf(d), "r1");
  assert.equal(bookedMeeting(b, d), DEMO, "the rule's meeting");
  assert.equal(whyOf(d, { body: b, fields: BASE_FIELDS, name }), "Matches Enterprise: Company size is at least 200");
  const small = decide(b, facts({ values: { "company.size": 12, "lead.country": "DE" } }));
  assert.equal(hitOf(small), "default");
  assert.equal(bookedMeeting(b, small), INTRO, "the Default rule's meeting");
  assert.equal(whyOf(small, { body: b, fields: BASE_FIELDS, name }), "No rule matches, so the Default rule applies");
});

test("is at least: 200 holds for 200 and more, never for a missing size", () => {
  const c = { field: "company.size", op: "gte" as const, value: 200 };
  assert.equal(holds(c, 200), true);
  assert.equal(holds(c, "1,200"), true);
  assert.equal(holds(c, 199), false);
  assert.equal(holds(c, null), false);
  assert.equal(holds(c, "51-200"), false, "a size range reads as its low end");
  assert.ok(opsFor("number").includes("gte"));
  assert.deepEqual(cleanBody({ ...demo() }).rules.list[0]!.conds, [c], "gte survives a save");
});

test("a team shared by several rules shows on each; a change points one rule at another team, never a copy of its own", () => {
  const b = shared();
  const before = JSON.stringify(b);
  const v = viewOf(b, BASE_FIELDS);
  assert.deepEqual(v.rules.map((r) => [r.id, r.reps, r.method, r.shared]), [
    ["r_us", [DAN, SAM], "load", true],
    ["r_de", [DAN, SAM], "load", true],
  ]);
  assert.deepEqual(v.def.reps, [DAN, SAM]);
  assert.equal(v.def.shared, true);
  // Showing it changes nothing; picking what's already there is no change either.
  assert.equal(JSON.stringify(b), before);
  assert.equal(setRuleReps(b, "r_us", [DAN, SAM]), b);
  assert.equal(setRuleMethod(b, "r_us", "load"), b);
  assert.equal(setDefaultReps(b, [DAN, SAM]), b);
  assert.equal(changed(b, cleanBody(JSON.parse(before))), false, "an untouched body isn't saved again");

  // Changing one rule's reps points it at one new team (keeping weights and settings); the rest stay as they were.
  const e = setRuleReps(b, "r_us", [SAM, VIN]);
  const own = e.queues.find((q) => q.id === "t_1")!;
  assert.deepEqual(own, { id: "t_1", name: "Team 1", method: "load", strict: true, hoursOnly: true, members: [{ user: SAM, weight: 1 }, { user: VIN, weight: 1 }] });
  assert.equal(e.rules.list.find((r) => r.id === "r_us")!.queue, "t_1");
  assert.ok(!e.queues.some((q) => q.id.startsWith("q_r_")), "no queue per rule");
  // Another rule given the same reps shares that team's queue instead of making a second one.
  const both = setRuleReps(e, "r_de", [SAM, VIN]);
  assert.equal(both.rules.list.find((r) => r.id === "r_de")!.queue, "t_1");
  assert.equal(both.queues.length, e.queues.length);
  assert.equal(e.rules.list.find((r) => r.id === "r_de")!.queue, "q_sales", "the other rule keeps the team");
  assert.deepEqual(e.queues.find((q) => q.id === "q_sales"), b.queues[0], "the shared team is untouched");
  assert.deepEqual(e.fallback, b.fallback);
  assert.deepEqual(cleanBody(e), e, "the split body is a valid body");
  // The engine follows: a US lead goes to the new reps, a German one to the old team.
  const us = decide(e, facts({ values: { "lead.country": "US" } }));
  assert.ok(us.result.kind === "owner" && [SAM, VIN].includes(us.result.user) && us.result.queue === "t_1");
  const de = decide(e, facts({ values: { "lead.country": "DE" } }));
  assert.ok(de.result.kind === "owner" && de.result.queue === "q_sales");

  // The method alone moves it to a team with that method too; the Default rule the same way.
  const m = setRuleMethod(b, "r_de", "rr");
  assert.equal(m.queues.find((q) => q.id === "t_1")?.method, "rr");
  assert.equal(m.queues.find((q) => q.id === "q_sales")?.method, "load");
  const d = setDefaultMethod(b, "rr");
  assert.equal(d.fallback?.kind === "queue" && d.fallback.id, "t_1");
  assert.deepEqual(d.queues.find((q) => q.id === "t_1")?.members, b.queues[0]!.members, "same reps, another team");
  assert.ok(d.rules.list.every((r) => r.queue === "q_sales"));
  // The last one still on the team then changes it in place: no copy is needed.
  const last = setRuleReps(setRuleReps(e, "r_de", [VIN]), "r_de", [VIN, DAN]);
  assert.equal(last.rules.list.find((r) => r.id === "r_de")!.queue, "t_2");
  const inPlace = setDefaultReps(setRuleReps(e, "r_de", [VIN]), [PRIYA]);
  assert.equal(inPlace.fallback?.kind === "queue" && inPlace.fallback.id, "q_sales", "the fallback is now the only one on the team");
  assert.deepEqual(inPlace.queues.find((q) => q.id === "q_sales")?.members, [{ user: PRIYA, weight: 1 }]);
});

test("a fallback to one rep, or none, becomes a team when its reps change", () => {
  const b = { ...demo(), fallback: { kind: "user" as const, id: SAM, meet: INTRO } };
  assert.deepEqual(viewOf(b, BASE_FIELDS).def.reps, [SAM]);
  assert.equal(setDefaultReps(b, [SAM]), b);
  const e = setDefaultReps(b, [SAM, VIN]);
  assert.deepEqual(e.fallback, { kind: "queue", id: "q_def", meet: INTRO }, "the team that already has Sam and Vincent");
  const f = setDefaultReps(b, [SAM, PRIYA]);
  assert.deepEqual(f.fallback, { kind: "queue", id: "t_1", meet: INTRO });
  assert.deepEqual(f.queues.find((q) => q.id === "t_1")?.members, [{ user: SAM, weight: 1 }, { user: PRIYA, weight: 1 }]);
  const none = setMeet({ ...demo(), fallback: null }, "default", INTRO);
  assert.equal(none.fallback?.meet, INTRO);
  const same = demo();
  assert.equal(setMeet(same, "default", INTRO), same, "the same meeting is no change");
  assert.equal(setMeet(demo(), "default", null).fallback?.meet, undefined);
});

test("rules that hold or go to the owner stay, and picking reps turns them back into assigning", () => {
  const b = setThen(demo(), "r1", "hold");
  assert.equal(b.rules.list[0]!.then, "hold");
  assert.equal(b.rules.list[0]!.meet, undefined, "a held lead books nothing");
  assert.equal(viewOf(b, BASE_FIELDS).rules[0]!.then, "hold");
  assert.deepEqual(decide(b, facts()).result, { kind: "held", signals: ["rule"] });
  const o = setThen(demo(), "r1", "owner");
  assert.equal(o.rules.list[0]!.then, "owner");
  const back = setRuleReps(o, "r1", [DAN]);
  assert.equal(back.rules.list[0]!.then, undefined);
  assert.deepEqual(back.queues.find((q) => q.id === "q_ent")!.members, [{ user: DAN, weight: 1 }]);
});

test("a new rule waits for its reps: it can't go live until they're picked, and it says so", () => {
  const b = addRule(demo(), "r_new");
  const r = b.rules.list.at(-1)!;
  assert.deepEqual(r, { id: "r_new", name: "Rule 2", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "", meet: INTRO }, "it books the Default rule's meeting");
  const v = viewOf(b, BASE_FIELDS);
  const issues = issuesOf(v, { calendar: (u) => u !== VIN, name });
  assert.deepEqual(
    issues.map((x) => x.title),
    ["Vincent Nguyen has no calendar connected", "Rule 2 has no reps"],
  );
  const picked = setRuleReps(b, "r_new", [DAN]);
  assert.equal(picked.rules.list.at(-1)!.queue, "t_1");
  assert.deepEqual(issuesOf(viewOf(picked, BASE_FIELDS), { calendar: () => true, name }), []);
});

test("safeguards map onto the body, and the engine does what each says", () => {
  const b = demo();
  assert.deepEqual(setSafe(b, "spam", false).spam.on, false);
  // Known leads: both owner steps together; a saved body where they differ shows on and keeps both until toggled.
  const mixed = { ...b, account: { ...b.account, on: false } };
  assert.equal(safeOf(mixed).owner, true);
  const off = setSafe(mixed, "owner", false);
  assert.deepEqual([off.account.on, off.keep.on], [false, false]);
  const on = setSafe(off, "owner", true);
  assert.deepEqual([on.account.on, on.keep.on, on.account.oppFirst], [true, true, true], "the other account settings stay");
  // Skip reps who are away: an away owner's lead goes to their backup; off, it stays with them.
  const away = facts({ owner: { user: PRIYA, crm: null }, reps: { ...facts().reps, [PRIYA]: rep("Priya Nair", { outUntil: NOW + 86_400_000, backup: DAN }) } });
  assert.deepEqual(decide(b, away).result, { kind: "owner", user: DAN, by: "keep" });
  assert.equal(whyOf(decide(b, away), { body: b, fields: BASE_FIELDS, name }), "Known lead, assigned to their owner Priya Nair. Priya is away, so the backup Dan Reyes takes it");
  const keep = setSafe(b, "skip", false);
  assert.equal(keep.keep.whenOut, "keep");
  assert.equal(safeOf(keep).skip, false);
  assert.deepEqual(decide(keep, away).result, { kind: "owner", user: PRIYA, by: "keep" });
  assert.equal(setSafe(keep, "skip", true).keep.whenOut, "backup");
  assert.equal(safeOf({ ...b, keep: { ...b.keep, whenOut: "route" } }).skip, true, "routing on also skips them");
  // Queues always skip reps who are away or full, whatever the switch says.
  const full = facts({ reps: { ...facts().reps, [DAN]: rep("Dan Reyes", { capDay: 3, today: 3 }) } });
  for (const x of [b, keep]) assert.deepEqual(decide(x, full).result, { kind: "owner", user: PRIYA, by: "queue", queue: "q_ent", rule: "r1" });
  // No availability: the flag the form send reads.
  const alertOff = setSafe(b, "alert", false);
  assert.deepEqual(alertOff.notify, { noTimes: false });
  assert.equal(emailsTimesLater({}, { body: b }), true);
  assert.equal(emailsTimesLater({}, { body: alertOff }), false);
  assert.equal(emailsTimesLater({ none: "later" }, { body: alertOff }), true, "a form's own choice still holds");
  assert.equal(emailsTimesLater({}, null), false, "routing not live: the form decides");
  // An older body without the flag stays without it through a save, and reads as off.
  const old = shared();
  assert.equal("notify" in old, false);
  assert.equal(safeOf(old).alert, false);
  assert.equal(setSafe(old, "alert", false), old);
});

test("Save saves the draft, then publishes; a failed save publishes nothing; nothing changed sends nothing", async () => {
  const sent: string[] = [];
  const ok = async <T,>(action: string): Promise<T> => {
    sent.push(action);
    return (action === "publish" ? { version: 4 } : { revision: 2 }) as T;
  };
  const b = setRuleReps(demo(), "r1", [DAN]);
  assert.deepEqual(await saveAndPublish(ok, b, { revision: 1, saved: demo() }), { version: 4 });
  assert.deepEqual(sent, ["save_draft", "publish"]);
  sent.length = 0;
  assert.equal(await saveAndPublish(ok, demo(), { revision: 1, saved: demo() }), null);
  assert.deepEqual(sent, [], "an untouched body is never sent");
  let tries = 0;
  const flaky = async <T,>(action: string): Promise<T> => {
    sent.push(action);
    if (action === "save_draft" && tries++ === 0) throw new Error("Someone else changed the draft.");
    return (action === "publish" ? { version: 5 } : { revision: 3 }) as T;
  };
  await assert.rejects(() => saveAndPublish(flaky, b, { revision: 1, saved: demo() }), /changed the draft/);
  assert.deepEqual(sent, ["save_draft"], "nothing is published after a failed save");
});

test("first-time setup: the reps, the mode and the meeting type, the rest of the body as it was", () => {
  const b = emptyBody();
  const out = setupBody(b, { reps: [DAN, SAM], mode: "rr", meet: INTRO });
  assert.equal(out.rules.on, false);
  assert.deepEqual(out.fallback, { kind: "queue", id: "t_1", meet: INTRO });
  assert.deepEqual(out.queues[0]?.members.map((m) => m.user), [DAN, SAM]);
  assert.deepEqual(out.spam, b.spam);
  assert.deepEqual(cleanBody(out), cleanBody(cleanBody(out)));
  assert.deepEqual([cleanBody(out).fallback, cleanBody(out).queues], [out.fallback, out.queues], "a valid body");
  assert.equal(setupBody(b, { reps: [DAN], mode: "rules", meet: null }).rules.on, true);
});

test("preview samples come from the workspace's own rules and reps; History names the rule", () => {
  const b = demo();
  const s = samplesFor(b, { fields: BASE_FIELDS, reps: [{ id: PRIYA, name: "Priya Nair" }] });
  assert.deepEqual(
    s.map((x) => [x.label, x.line, x.changes, x.owner]),
    [
      ["Maya, Globex", "Company size is at least 200", { "company.size": 200, "company.employees": 200 }, null],
      ["Kai, TinyCo", "New lead", {}, null],
      ["Ana, Initech", "Owner: Priya", {}, PRIYA],
      ["test@mailinator.com", "Spam", {}, null],
    ],
  );
  const d = decide(b, facts());
  assert.equal(ruleColumn(d, { body: b, fields: BASE_FIELDS }), "Enterprise");
  assert.equal(ruleColumn(decide(b, facts({ values: {} })), { body: b, fields: BASE_FIELDS }), "Default rule");
  assert.equal(ruleColumn(decide(b, facts({ owner: { user: SAM, crm: null } })), { body: b, fields: BASE_FIELDS }), "Owner");
  assert.equal(ruleColumn(decide(b, facts({ lead: { ...facts().lead, disposable: true } })), { body: b, fields: BASE_FIELDS }), "Spam");
  assert.equal(ruleColumn(decide(setMode(b, "rr"), facts()), { body: setMode(b, "rr"), fields: BASE_FIELDS }), "Round robin");
});

// Test a lead: the real `test` action ---------------------------------------------------------------------------------

/** A Supabase client that answers every read with nothing (no contact, no custom fields). */
function emptyDb() {
  const answer = { data: null, error: null };
  const chain: unknown = new Proxy(function () {}, {
    get: (_t, k) => (k === "then" ? (res: (v: unknown) => void) => res(answer) : chain),
    apply: () => chain,
  });
  return { from: () => chain, rpc: async () => ({ data: null, error: { message: "Could not find the function" } }) } as never;
}

test("Test a lead runs the body on screen through the real engine, writes nothing, and a flaky facts read is an error", async () => {
  resetNewer();
  A.forgetFields?.();
  const calls: string[] = [];
  let fail = 1;
  const rpc: Rpc = async (fn) => {
    calls.push(fn);
    if (fn === "routing_facts" || fn === "router_facts_full") {
      if (fail-- > 0) return { data: null, error: { message: "connection reset" } };
      const r = (n: string) => ({ name: n, member: true, tz: "UTC", availability: null, paused_until: null, out_dates: [], calendar_out_until: null, backup: null, cap_day: null, cap_week: null, today: 0, week: 0, meetings_week: 0 });
      return {
        data: {
          contact: { id: null, email: "maya@globex.com", email_clean: "maya@globex.com", email_class: "work", fields: {} },
          domain: "globex.com",
          owner: { user: null, crm: null },
          company: null,
          submission: null,
          recent: 0,
          reps: { [DAN]: r("Dan Reyes"), [PRIYA]: r("Priya Nair"), [SAM]: r("Sam Lee"), [VIN]: r("Vincent Nguyen") },
          counts: {},
          lists: { allow: [], block: [] },
          more: {},
        },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  const c: A.Caller = { ws: "11111111-0000-4000-8000-000000000000", user: DAN, role: "owner" };
  // The edit on screen, not saved: Enterprise goes to Priya alone.
  const draft = setRuleReps(demo(), "r1", [PRIYA]);
  const o = { email: "maya@globex.com", changes: { "company.size": 800 }, owners: { company: null, contact: null }, which: "draft" as const, draft };
  const flaky = await A.test(rpc, emptyDb(), c, o).then(
    (out) => ({ ok: true as const, out }),
    (e: Error) => ({ ok: false as const, error: e.message }),
  );
  assert.equal(flaky.ok, false, "a failed read throws");
  assert.deepEqual(testResult(flaky as never), { out: null, error: (flaky as { error: string }).error }, "the screen shows the error and no answer");
  assert.match((flaky as { error: string }).error, /connection reset/);
  const out = await A.test(rpc, emptyDb(), c, o);
  assert.deepEqual(out.draft?.result, { kind: "owner", user: PRIYA, by: "queue", queue: "q_ent", rule: "r1" }, "the unsaved edit decides");
  assert.equal(hitOf(out.draft as never), "r1");
  assert.deepEqual(testResult({ ok: true, out }), { out: out.draft, error: "" });
  assert.ok(!calls.some((f) => f === "router_commit" || f === "routing_commit" || f === "enqueue_job" || f === "router_draft_save" || f === "router_publish"), "testing writes nothing");
  assert.deepEqual(testResult({ ok: true, out: { draft: null } }), { out: null, error: "Couldn't test this lead." }, "no lead found is an error too");
});
