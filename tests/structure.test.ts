// The new app structure's pure parts (docs/app-structure.md): scheduling words and groups, link states, the calendar's
// spans, routing's company types, Deal 20 leads and Read it back.
import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationWords, daysWords, groupTypes, hostMode, lengthWords, limitsWords, linkState, METHOD_WORDS, nextOff, offWords, priceWords, questionsWords, remindersWords, teamOf, typeSummary, weeklyWords } from "../src/components/app/scheduling/model.ts";
import { outsideBusy, presetSpan } from "../src/components/app/meetings/model.ts";
import { decide } from "../src/lib/router/engine.ts";
import { dealPreview } from "../src/lib/router/deal.ts";
import { readBack } from "../src/lib/router/readback.ts";
import { cleanBody, problems } from "../src/lib/router/check.ts";
import { segmentsOf } from "../src/lib/router/conditions.ts";
import { DEFAULT_SETTINGS } from "../src/lib/meetings/types.ts";
import { emptyBody, type Facts, type Queue, type RouterBody } from "../src/lib/router/types.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

test("scheduling words: a type's summary and a week of hours as Calendly says them", () => {
  assert.equal(typeSummary({ kind: "one", hosts: [{ user_id: A }], settings: { ...DEFAULT_SETTINGS } }), "30 min, Google Meet, One person");
  assert.equal(typeSummary({ kind: "round_robin", hosts: [{ user_id: A }, { user_id: B }, { user_id: C }], settings: { ...DEFAULT_SETTINGS, lengths: [30, 60], location: { kind: "zoom" } } }), "30 min to 1 h, Zoom, Take turns, 3 hosts");
  const week = { mon: [["09:00", "17:00"]], tue: [["09:00", "17:00"]], wed: [["09:00", "17:00"]], thu: [["09:00", "17:00"]], fri: [["09:00", "17:00"]], sat: [], sun: [] } as never;
  assert.equal(weeklyWords({ weekly: week }), "Weekdays, 09:00 to 17:00");
  const split = { mon: [["09:00", "12:00"], ["13:00", "17:00"]], tue: [["09:00", "12:00"], ["13:00", "17:00"]], wed: [["09:00", "12:00"], ["13:00", "17:00"]], thu: [["09:00", "12:00"], ["13:00", "17:00"]], fri: [["10:00", "14:00"]], sat: [], sun: [] } as never;
  assert.equal(weeklyWords({ weekly: split }), "Mon to Thu, 09:00 to 12:00 and 13:00 to 17:00, +1 more time");
  assert.equal(weeklyWords(null), "No hours set");
  assert.equal(daysWords(["sat", "sun"]), "Weekends");
  assert.equal(daysWords(["mon", "wed"]), "Mon, Wed");
});

test("the meeting type panel's one-line summaries stay short and plain", () => {
  assert.equal(lengthWords([30]), "30 min");
  assert.equal(lengthWords([45, 30]), "30, 45 min");
  assert.equal(lengthWords([30, 60]), "30 min, 1 h");
  assert.equal(limitsWords({ bufferBefore: 0, bufferAfter: 10, notice: 240 }), "10 min after, 4 h notice");
  assert.equal(limitsWords({ bufferBefore: 5, bufferAfter: 0, notice: 1440 }), "5 min before, 1 day notice");
  assert.equal(limitsWords({ bufferBefore: 0, bufferAfter: 0, notice: 0 }), "No notice");
  assert.equal(questionsWords([]), "Name, email");
  assert.equal(questionsWords([{}]), "Name, email, 1 more");
  assert.equal(remindersWords([1440, 60]), "Confirmation, 2 reminders");
  assert.equal(remindersWords([60]), "Confirmation, 1 reminder");
  assert.equal(remindersWords([]), "Confirmation only");
  assert.equal(priceWords(undefined), "Off");
  assert.equal(priceWords({ amount: 10000, currency: "usd" }), "$100, Stripe");
  assert.equal(confirmationWords({ kind: "message" }), "Message");
  assert.equal(confirmationWords({ kind: "redirect", url: "https://www.acme.com/thanks" }), "Redirect to acme.com");
  assert.equal(offWords({ from: "2026-11-03", to: "2026-11-05" }), "Off Nov 3 to Nov 5");
  assert.equal(offWords({ from: "2026-11-03", to: "2026-11-03" }), "Off Nov 3");
  assert.deepEqual(nextOff([{ from: "2026-10-01", to: "2026-10-02" }, { from: "2026-12-01", to: "2026-12-02" }, { from: "2026-11-03", to: "2026-11-05" }], "2026-10-30"), { from: "2026-11-03", to: "2026-11-05" });
  assert.equal(nextOff(null, "2026-10-30"), null);
  // Who hosts: one person, a Routing team (the old round robin, owner-first and two-team kinds), or everyone.
  assert.equal(hostMode("one"), "one");
  assert.equal(hostMode("group"), "one");
  assert.equal(hostMode("round_robin"), "team");
  assert.equal(hostMode("owner_first"), "team");
  assert.equal(hostMode("collective"), "everyone");
  assert.equal(teamOf({ team: "q_all" }), "q_all");
  assert.equal(teamOf({}), null);
  assert.equal(METHOD_WORDS.load, "Fewest meetings first");
  for (const s of [limitsWords({ bufferBefore: 15, bufferAfter: 15, notice: 10080 }), remindersWords([1, 2, 3, 4]), lengthWords([15, 30, 45, 60, 90, 120])]) assert.ok(s.length <= 48, s);
});

test("meeting types group like Calendly: yours, the team's, then each teammate's by name", () => {
  const names: Record<string, string> = { [B]: "Zoe", [C]: "Ana" };
  const g = groupTypes([{ owner_user_id: B }, { owner_user_id: null }, { owner_user_id: A }, { owner_user_id: C }, { owner_user_id: A }], A, (id) => names[id]!);
  assert.deepEqual(g.map((x) => [x.key, x.types.length]), [["me", 2], ["team", 1], [C, 1], [B, 1]]);
});

test("a link's state: booked, closed, expired by date or by its times passing, else waiting or voting", () => {
  const now = Date.parse("2026-10-24T12:00:00Z");
  const base = { kind: "single_use" as const, used_at: null, meeting_id: null, closed_at: null, expires_at: null, offered: [] };
  assert.equal(linkState(base, now), "waiting");
  assert.equal(linkState({ ...base, meeting_id: "m" }, now), "booked");
  assert.equal(linkState({ ...base, closed_at: "2026-10-01T00:00:00Z" }, now), "closed");
  assert.equal(linkState({ ...base, expires_at: "2026-10-20T00:00:00Z" }, now), "expired");
  const poll = { ...base, kind: "poll" as const, offered: [{ start: "2026-10-25T10:00:00Z", end: "2026-10-25T10:30:00Z" }] };
  assert.equal(linkState(poll, now), "voting");
  assert.equal(linkState(poll, Date.parse("2026-10-26T00:00:00Z")), "expired");
});

test("the calendar's spans: today, this week from Monday, last week, and one picked day", () => {
  const now = new Date(2026, 9, 24, 15, 30).getTime(); // a Saturday
  const t = presetSpan("today", now);
  assert.equal(new Date(t.from).getDate(), 24);
  assert.equal(new Date(t.to).getDate(), 25);
  const w = presetSpan("week", now);
  assert.equal(new Date(w.from).getDay(), 1, "this week starts Monday");
  assert.equal(new Date(w.from).getDate(), 19);
  assert.equal(new Date(w.to).getDate(), 26);
  const l = presetSpan("last_week", now);
  assert.equal(new Date(l.from).getDate(), 12);
  assert.equal(l.to, w.from);
  const d = presetSpan("day", now, "2026-11-03");
  assert.equal(new Date(d.from).getMonth(), 10);
  assert.equal(new Date(d.from).getDate(), 3);
  const u = presetSpan("upcoming", now);
  assert.equal(u.from, now);
});

test("All meetings: a calendar's busy time that is a Claritia meeting isn't shown twice", () => {
  const meetings = [{ start_at: "2026-10-24T10:00:00Z", end_at: "2026-10-24T10:30:00Z", hosts: [A] }];
  const busy = [
    { start: "2026-10-24T10:00:00Z", end: "2026-10-24T10:30:00Z" },
    { start: "2026-10-24T12:00:00Z", end: "2026-10-24T13:00:00Z" },
  ];
  assert.deepEqual(outsideBusy(busy, meetings, A).map((b) => b.start), ["2026-10-24T12:00:00Z"]);
  assert.equal(outsideBusy(busy, meetings, B).length, 2, "another host's meeting doesn't hide your busy time");
});

function facts(values: Record<string, unknown>): Facts {
  const rep = (name: string) => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true });
  return { now: 0, lead: { id: "c", name: "Dana", email: "d@acme.com", emailClass: "work", domain: "acme.com", firstName: "Dana", lastName: null, recent: 1, disposable: false }, values, owner: null, company: null, reps: { [A]: rep("Ana"), [B]: rep("Ben") }, counts: {}, lists: { allow: [], block: [] } };
}

test("company types: worked out before the rules, tested by name, checked and renamed with care", () => {
  const b = emptyBody();
  b.account.on = false;
  b.keep.on = false;
  b.segments = [
    { id: "s_ent", name: "Enterprise", match: "all", conds: [{ field: "company.size", op: "gt", value: 1000 }] },
    { id: "s_fin", name: "Finance", match: "all", conds: [{ field: "company.industry", op: "contains", value: ["bank", "finance"] }] },
  ];
  b.queues = [
    { id: "q_ent", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: [{ user: A, weight: 1 }] },
    { id: "q_all", name: "Everyone", method: "rr", strict: false, hoursOnly: false, members: [{ user: B, weight: 1 }] },
  ];
  b.rules.list = [{ id: "r1", name: "Big", match: "all", conds: [{ field: "company.type", op: "one_of", value: ["Enterprise"] }], queue: "q_ent" }];
  b.fallback = { kind: "queue", id: "q_all" };
  assert.deepEqual(segmentsOf(b.segments, { "company.size": "5,001-10,000", "company.industry": "Banking" }, []), ["Enterprise", "Finance"]);
  const big = decide(b, facts({ "company.size": "5,001-10,000" }));
  assert.deepEqual(big.result, { kind: "owner", user: A, by: "queue", queue: "q_ent", rule: "r1" });
  const small = decide(b, facts({ "company.size": "51-200" }));
  assert.equal(small.result.kind === "owner" && small.result.user, B);
  const skipped = small.steps.find((s) => s.step === "rules") as Extract<(typeof small.steps)[number], { step: "rules" }>;
  assert.deepEqual(skipped.skipped[0]?.failed?.actual, [], "the run shows the lead had no company type");
  // A rule naming a type that's gone, and a type with no conditions, stop Make live.
  const broken: RouterBody = { ...b, segments: [{ id: "s_x", name: "Empty", match: "all", conds: [] }] };
  assert.deepEqual(problems(broken, { members: new Set([A, B]) }).map((p) => p.text), ["Empty has no conditions", `"Big" uses a company type that's gone`]);
  // Names are unique; a type can't test company types.
  const clean = cleanBody({ ...b, segments: [...b.segments, { id: "s_dup", name: "enterprise", match: "all", conds: [{ field: "company.type", op: "filled" }] }] });
  assert.deepEqual(clean.segments?.map((s) => s.name), ["Enterprise", "Finance"]);
});

test("Deal 20 leads: take turns ends even, some get more follows the shares, away reps get none", () => {
  const q: Queue = { id: "q", name: "Team", method: "rr", strict: false, hoursOnly: false, members: [{ user: A, weight: 1 }, { user: B, weight: 1 }, { user: C, weight: 1 }] };
  const tally = (xs: string[]) => xs.reduce<Record<string, number>>((m, u) => ({ ...m, [u]: (m[u] ?? 0) + 1 }), {});
  assert.deepEqual(tally(dealPreview(q, 21)), { [A]: 7, [B]: 7, [C]: 7 });
  const weighted = tally(dealPreview({ ...q, method: "weighted", members: [{ user: A, weight: 2 }, { user: B, weight: 1 }] }, 21));
  assert.deepEqual(weighted, { [A]: 14, [B]: 7 });
  assert.equal(tally(dealPreview(q, 20, { away: [C] }))[C], undefined);
  const load = tally(dealPreview({ ...q, method: "load" }, 15, { meetings: { [A]: 6, [B]: 0, [C]: 0 } }));
  assert.deepEqual(load, { [B]: 7, [C]: 7, [A]: 1 }, "the rep with a full week waits until the others catch up");
});

test("Read it back: the whole setup as a paragraph", () => {
  const b = emptyBody();
  b.queues = [{ id: "q", name: "US", method: "rr", strict: false, hoursOnly: false, members: [{ user: A, weight: 1 }] }];
  b.rules.list = [{ id: "r", name: "US", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "q" }];
  b.fallback = { kind: "user", id: B };
  b.sla = { on: true, minutes: 60, nudge: 30, next: "route", manager: null };
  const text = readBack(b, { names: { [B]: "Ben" } });
  assert.match(text, /^Leads with throwaway emails, made-up names or too many forms from one person wait for you to review\./);
  assert.match(text, /A lead from a company you already work with goes to the rep on its open deal, or else the company's owner\./);
  assert.match(text, /When country is United States, it goes to the US team, who take turns\./);
  assert.match(text, /Fallback: assign to Ben\. Reps must reach out within 1 hour, or it goes to someone else\.$/);
});
