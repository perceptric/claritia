// Lead scoring (docs/scoring-plan.md): the engine, the model check, the first build and the words.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildModel } from "../src/lib/scoring/build.ts";
import { beforeMeeting, fitToCapacity, scoreLead, statsOf, type LeadFacts } from "../src/lib/scoring/engine.ts";
import { cleanBody, emptyBody, fitFields, problems, type ScoreBody, type ScoreRule } from "../src/lib/scoring/model.ts";
import { ruleWords } from "../src/lib/scoring/words.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 29);
const R = (conds: ScoreRule["conds"], points: number, o: Partial<ScoreRule> = {}): ScoreRule => ({ id: `r${Math.random().toString(36).slice(2, 8)}`, match: "all", conds, points, count: "once", cap: 3, fade: "model", on: true, ...o });

function model(): ScoreBody {
  const b = emptyBody();
  b.groups = [
    { id: "company", name: "Company fit", side: "fit", max: 30, rules: [R([{ field: "company.size", op: "between", value: [51, 1000] }], 20), R([{ field: "company.industry", op: "one_of", value: ["Software"] }], 15)] },
    { id: "person", name: "Person fit", side: "fit", max: 30, rules: [R([{ field: "contact.seniority", op: "one_of", value: ["VP", "Director"] }], 30)] },
    { id: "intent", name: "Buying intent", side: "act", max: 50, rules: [R([{ field: "event.form", op: "one_of", value: ["demo"] }], 30), R([{ field: "event.page", op: "contains", value: ["/pricing"] }], 10, { count: "each", cap: 3 }), R([{ field: "event.meeting", op: "filled" }], 35)] },
  ];
  b.minus = [R([{ field: "contact.title", op: "contains", value: ["student"] }], 0, { remove: true }), R([{ field: "event.unsub", op: "filled" }], -20, { fade: "never" })];
  b.mql = ["A1", "A2", "B1"];
  return b;
}
const lead = (values: Record<string, unknown>, events: LeadFacts["events"] = [], met = false): LeadFacts => ({ id: Math.random().toString(36), values, events, met });
const buyer = { "company.size": "201-500", "company.industry": "Software", "contact.seniority": "VP", "contact.title": "VP Marketing" };

test("a good-fit lead who asked for a demo today is A1 and sales-ready; group maxes hold", () => {
  const s = scoreLead(model(), lead(buyer, [{ k: "form", d: "demo", at: NOW }, { k: "page", d: "/pricing", at: NOW }]), NOW);
  assert.equal(s.fit, 100); // 20 + 15 is capped at the group's 30, plus 30: 60 of 60
  assert.ok(s.hits.filter((h) => h.group === "Company fit").every((h) => h.capped));
  assert.equal(s.act, 80); // 30 + 10 of 50
  assert.equal(s.grade, "A1");
  assert.equal(s.band, "hot");
});

test("activity points halve every halfLife days, and a rule that never fades doesn't", () => {
  const b = model();
  const fresh = scoreLead(b, lead(buyer, [{ k: "form", d: "demo", at: NOW }]), NOW).act;
  const old = scoreLead(b, lead(buyer, [{ k: "form", d: "demo", at: NOW - 30 * DAY }]), NOW).act;
  assert.equal(fresh, 60);
  assert.equal(old, 30);
  const unsub = scoreLead(b, lead(buyer, [{ k: "form", d: "demo", at: NOW }, { k: "unsub", at: NOW - 120 * DAY }]), NOW);
  assert.equal(unsub.hits.find((h) => h.group === "Points taken away")!.points, -20);
});

test("each time counts up to the cap; an action matched by two conditions counts once", () => {
  const b = model();
  const many = Array.from({ length: 6 }, (_, i) => ({ k: "page" as const, d: "/pricing", at: NOW - i * 1000 }));
  const s = scoreLead(b, lead(buyer, many), NOW);
  assert.equal(Math.round(s.hits.find((h) => h.rule.conds[0]!.field === "event.page")!.points), 30);
  b.groups[2]!.rules[1]!.conds.push({ field: "event.page", op: "contains", value: ["pricing"] });
  b.groups[2]!.rules[1]!.match = "any";
  const once = scoreLead(b, lead(buyer, [{ k: "page", d: "/pricing", at: NOW }]), NOW);
  assert.equal(Math.round(once.hits.find((h) => h.rule.conds[0]!.field === "event.page")!.points), 10);
});

test("a removed lead gets no score and is never sales-ready", () => {
  const s = scoreLead(model(), lead({ ...buyer, "contact.title": "Student" }, [{ k: "form", d: "demo", at: NOW }]), NOW);
  assert.equal(s.band, "out");
  assert.equal(s.total, 0);
  assert.equal(s.grade, "Out");
});

test("no activity in `reset` days starts activity over", () => {
  const b = { ...model(), reset: 90 };
  const s = scoreLead(b, lead(buyer, [{ k: "form", d: "demo", at: NOW - 100 * DAY }]), NOW);
  assert.equal(s.act, 0);
});

test("flaky case: scoring the same facts twice gives the same score, and events in any order give the same score", () => {
  const ev: LeadFacts["events"] = [{ k: "page", d: "/pricing", at: NOW - 3 * DAY }, { k: "form", d: "demo", at: NOW - DAY }, { k: "page", d: "/pricing", at: NOW - 2 * DAY }];
  const a = scoreLead(model(), lead(buyer, ev), NOW);
  const b = scoreLead(model(), lead(buyer, [...ev].reverse()), NOW);
  assert.deepEqual({ ...a, hits: a.hits.map((h) => h.points) }, { ...b, hits: b.hits.map((h) => h.points) });
});

test("flaky case: a past lead's meeting can't count toward its own results", () => {
  const b = model();
  const met = lead(buyer, [{ k: "meeting", at: NOW - 5 * DAY }, { k: "page", d: "/pricing", at: NOW - 4 * DAY }], true);
  assert.equal(beforeMeeting(met).events.length, 0);
  const s = statsOf(b, [met], NOW, 90);
  assert.equal(s.met.hot, 0, "without the meeting, fit alone isn't enough for A1/A2/B1");
  const live = scoreLead(b, met, NOW);
  assert.equal(live.band, "hot", "live, the booked meeting does count");
});

test("cleanBody drops unknown fields and keeps numbers in range; problems name what's missing", () => {
  const b = cleanBody({ style: "points", ready: 500, warm: 900, groups: [{ name: "X", side: "fit", max: 999, rules: [{ conds: [{ field: "nope", op: "is", value: 1 }, { field: "company.size", op: "gt", value: 50 }], points: 400 }] }] }, fitFields());
  assert.equal(b.ready, 100);
  assert.equal(b.warm, 99);
  assert.equal(b.groups[0]!.max, 100);
  assert.equal(b.groups[0]!.rules[0]!.conds.length, 1);
  assert.equal(b.groups[0]!.rules[0]!.points, 100);
  assert.deepEqual(problems(b), ["Add at least one activity rule"]);
  assert.deepEqual(problems(model()), []);
});

test("fitting to capacity moves the cut-off toward the team's weekly number", () => {
  const leads: LeadFacts[] = [];
  for (let i = 0; i < 90; i++) leads.push(lead(buyer, [{ k: "form", d: "demo", at: NOW - i * DAY }]));
  for (let i = 0; i < 300; i++) leads.push(lead({ "company.size": "5", "contact.seniority": "Manager" }, [{ k: "page", d: "/blog", at: NOW - (i % 90) * DAY }]));
  const tight = fitToCapacity({ ...model(), capacity: 1 }, leads, NOW, 90);
  const loose = fitToCapacity({ ...model(), capacity: 7 }, leads, NOW, 90);
  assert.ok(statsOf(tight, leads, NOW, 90).perWeek <= statsOf(loose, leads, NOW, 90).perWeek);
  assert.ok(tight.mql.length >= 1);
});

test("the first build finds buyers' company size and seniority and the forms that come before meetings", () => {
  const leads: LeadFacts[] = [];
  for (let i = 0; i < 60; i++) leads.push(lead({ "company.size": "250", "company.industry": "Software", "contact.seniority": "VP", "contact.email_class": "work", "lead.country": "US" }, [{ k: "form", d: "f-demo", at: NOW - (i + 2) * DAY }, { k: "meeting", at: NOW - (i + 1) * DAY }], i % 2 === 0));
  for (let i = 0; i < 240; i++) leads.push(lead({ "company.size": "5", "company.industry": "Retail", "contact.seniority": "Individual", "contact.email_class": "free", "lead.country": "US" }, [{ k: "form", d: "f-news", at: NOW - (i % 90) * DAY }], i % 40 === 0));
  const { body, findings } = buildModel({ leads, forms: [{ id: "f-demo", name: "Demo request" }, { id: "f-news", name: "Newsletter" }], reps: 3, site: { name: "Lumen", domain: "lumen.io" }, now: NOW, days: 90 });
  const all = body.groups.flatMap((g) => g.rules);
  assert.ok(all.some((r) => r.conds[0]!.field === "company.size"));
  assert.ok(all.some((r) => r.conds[0]!.field === "contact.seniority" && (r.conds[0]!.value as string[]).includes("VP")));
  const demo = all.find((r) => r.conds[0]!.field === "event.form" && (r.conds[0]!.value as string[]).includes("f-demo"))!;
  const news = all.find((r) => r.conds[0]!.field === "event.form" && (r.conds[0]!.value as string[]).includes("f-news"))!;
  assert.ok(demo.points > news.points);
  assert.ok(findings.some((f) => f.source === "site" && f.text.includes("lumen.io")));
  assert.deepEqual(problems(body), []);
  assert.equal(body.capacity, 15);
});

test("rules read as plain sentences", () => {
  const w = { fields: fitFields(), forms: { "f-demo": "Demo request" } };
  assert.equal(ruleWords(R([{ field: "event.form", op: "one_of", value: ["f-demo"] }], 30), w), "Filled in the Demo request form");
  assert.equal(ruleWords(R([{ field: "event.page", op: "contains", value: ["/pricing"] }], 10), w), "Visited /pricing");
  assert.equal(ruleWords(R([{ field: "company.size", op: "between", value: [51, 1000] }], 10), w), "Company size is between 51 and 1000");
  assert.equal(ruleWords(R([{ field: "contact.seniority", op: "one_of", value: ["VP"] }, { field: "event.meeting", op: "filled" }], 10), w), "Seniority is VP and booked a meeting");
});

test("Results score each past lead at its own best moment, so old activity doesn't fade to nothing", () => {
  const b = model();
  const old = lead(buyer, [{ k: "form", d: "demo", at: NOW - 80 * DAY }]);
  const s = statsOf({ ...b, mql: ["A1"] }, [old], NOW, 90);
  assert.equal(s.bands.hot, 1, "scored right after the demo, it was A1");
  assert.equal(scoreLead({ ...b, mql: ["A1"] }, old, NOW).band, "warm", "scored today, the demo has faded");
});

test("flaky case: the worker's pass pages through leads and writes the same rows on a second run", async () => {
  const { scoreAll } = await import("../src/lib/scoring/server.ts");
  const raw = Array.from({ length: 1200 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, created: new Date(NOW - DAY).toISOString(), values: buyer, events: [{ k: "form", d: "demo", at: new Date(NOW - DAY).toISOString() }], met: false }));
  const writes: unknown[][] = [];
  const rpc = async (fn: string, a: Record<string, unknown>) => {
    if (fn === "scoring_facts") {
      const ids = a.p_ids as string[] | null;
      const rows = ids ? raw.filter((r) => ids.includes(r.id)) : raw.filter((r) => !a.p_after || r.id > (a.p_after as string)).slice(0, a.p_limit as number);
      return { data: rows, error: null };
    }
    if (fn === "scoring_write") { writes.push(a.p_rows as unknown[]); return { data: (a.p_rows as unknown[]).length, error: null }; }
    return { data: null, error: { message: fn } };
  };
  const words = { fields: fitFields(), forms: { demo: "Demo request" } };
  const one = await scoreAll(rpc, "ws", { id: "m", body: model() }, words, { now: NOW });
  assert.equal(one.scored, 1200);
  const first = JSON.stringify(writes);
  writes.length = 0;
  await scoreAll(rpc, "ws", { id: "m", body: model() }, words, { now: NOW });
  assert.equal(JSON.stringify(writes), first);
  writes.length = 0;
  const quick = await scoreAll(rpc, "ws", { id: "m", body: model() }, words, { now: NOW, ids: [raw[3]!.id, raw[700]!.id] });
  assert.equal(quick.scored, 2);
});
