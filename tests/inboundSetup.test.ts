// Inbound set up like a sales team (Reps, Meetings, Routing's Rules, Teams and History): "Try a lead" through the
// real engine with who the lead already works with (including a flaky facts read and an away rep with a backup),
// where a lead stops on the five steps and why, a team's next leads, who hosts a meeting, the Reps words, and the
// sidebar's dots.
import assert from "node:assert/strict";
import { test } from "node:test";
import { resetNewer } from "../src/lib/forms/newer.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { decide } from "../src/lib/router/engine.ts";
import { testRoute, withTryOwners } from "../src/lib/router/server.ts";
import { emptyBody, type Facts, type RepFacts, type RouterBody } from "../src/lib/router/types.ts";
import { DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";
import { becauseWords, bookedMeeting, nextLeads, readyChecks, stopOf, teamOfResult, whyLines } from "../src/components/app/routing/setupModel.ts";
import { bookedBy, hostChoice, withHostChoice } from "../src/components/app/scheduling/hosts.ts";
import { capOptions, hoursWords, HOUR_PRESETS, repState, teamLine, withoutToday } from "../src/components/app/reps/model.ts";
import { inboundDots } from "../src/lib/nav.ts";

const DAN = "11111111-1111-4111-8111-111111111111";
const PRIYA = "22222222-2222-4222-8222-222222222222";
const SAM = "33333333-3333-4333-8333-333333333333";
const VIN = "44444444-4444-4444-8444-444444444444";
const NOW = Date.UTC(2026, 9, 30, 15, 0);
const DAY = 86_400_000;
const MEET_DEMO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const MEET_INTRO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

const rep = (name: string, o: Partial<RepFacts> = {}): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: null, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true, ...o });
const names: Record<string, string> = { [DAN]: "Dan Reyes", [PRIYA]: "Priya Nair", [SAM]: "Sam Lee", [VIN]: "Vincent Nguyen" };
const name = (id: string) => names[id] ?? "Someone";

function body(): RouterBody {
  const b = emptyBody();
  b.queues = [
    { id: "q_smb", name: "SMB team", method: "rr", strict: false, hoursOnly: false, members: [{ user: PRIYA, weight: 1 }, { user: SAM, weight: 1 }, { user: DAN, weight: 1 }] },
    { id: "q_ent", name: "Enterprise team", method: "load", strict: false, hoursOnly: false, members: [{ user: DAN, weight: 1 }, { user: VIN, weight: 1 }] },
  ];
  b.rules.list = [
    { id: "r1", name: "Big", match: "all", conds: [{ field: "company.size", op: "gt", value: 199 }], queue: "q_ent", meet: MEET_DEMO },
    { id: "r2", name: "US", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }], queue: "q_smb", meet: MEET_INTRO },
  ];
  b.fallback = { kind: "queue", id: "q_smb", meet: MEET_INTRO };
  return b;
}

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

// Try a lead --------------------------------------------------------------------------------------------------------

test("try a lead: who the company works with is tried as typed, and left out it stays as read", () => {
  const f = facts();
  assert.equal(withTryOwners(f, undefined), f, "nothing typed: the facts as read");
  const made = withTryOwners(f, { company: SAM });
  assert.deepEqual(made.company, { id: "try", name: "globex.com", domain: "globex.com", owner: SAM, ownerCrm: null, oppOwner: null, oppName: null }, "a company not in the CRM yet is made from the domain");
  assert.equal(f.company, null, "the read facts aren't changed");
  const d = decide(body(), made);
  assert.deepEqual(d.result, { kind: "owner", user: SAM, by: "account" });
  // A real company's own owner and its open deal's rep give way to the one typed; "Nobody yet" clears them.
  const real = facts({ company: { id: "co", name: "Globex", domain: "globex.com", owner: DAN, ownerCrm: "crm1", oppOwner: PRIYA, oppName: "Deal" }, owner: { user: DAN, crm: null } });
  const cleared = withTryOwners(real, { company: null, contact: null });
  assert.equal(cleared.company?.owner, null);
  assert.equal(cleared.company?.oppOwner, null);
  assert.equal(cleared.owner?.user, null);
  assert.equal(decide(body(), cleared).result.kind === "owner" && (decide(body(), cleared).result as { rule?: string }).rule, "r1", "with nobody, the rules decide");
  // A bad id is never a rep.
  assert.equal(withTryOwners(f, { company: "nope" }).company, null);
  // No domain and no company: nothing to match.
  assert.equal(withTryOwners(facts({ lead: { ...f.lead, domain: null, email: null } }), { company: SAM }).company, null);
});

test("try a lead through testRoute: the reps typed are read too (with their backups), a flaky read fails loudly, nothing is written", async () => {
  resetNewer();
  const calls: { fn: string; users?: unknown }[] = [];
  let fail = 1;
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, users: args.p_users });
    if (fn === "router_facts_full") {
      if (fail-- > 0) return { data: null, error: { message: "connection reset" } };
      const r = (n: string, o: Record<string, unknown> = {}) => ({ name: n, member: true, tz: "UTC", availability: null, paused_until: null, out_dates: [], calendar_out_until: null, backup: null, cap_day: null, cap_week: null, today: 0, week: 0, meetings_week: 0, ...o });
      return {
        data: {
          contact: { id: null, email: "maya@globex.com", email_clean: "maya@globex.com", email_class: "work", fields: {} },
          domain: "globex.com",
          owner: { user: null, crm: null },
          company: null,
          submission: null,
          recent: 0,
          // Vincent is out until tomorrow; his backup Priya is in.
          reps: { [DAN]: r("Dan Reyes"), [PRIYA]: r("Priya Nair"), [SAM]: r("Sam Lee"), [VIN]: r("Vincent Nguyen", { out_dates: [{ from: "2026-10-29", to: "2026-10-31" }], backup: PRIYA }) },
          counts: {},
          lists: { allow: [], block: [] },
          more: {},
        },
        error: null,
      };
    }
    return { data: null, error: null };
  };
  const b = body();
  b.queues = b.queues.filter((q) => q.id === "q_smb");
  const o = { ws: "w1", email: "maya@globex.com", body: b, owners: { company: VIN }, now: NOW };
  await assert.rejects(() => testRoute(rpc, o), /connection reset/, "a failed read is an error, never a made-up answer");
  const r = await testRoute(rpc, o);
  assert.ok(r);
  assert.ok((calls.at(-1)!.users as string[]).includes(VIN), "the rep typed is read with the team's");
  assert.deepEqual(r!.decision.result, { kind: "owner", user: PRIYA, by: "account" }, "away, so their backup takes it");
  assert.deepEqual(whyLines(r!.decision, { body: b, fields: BASE_FIELDS, name }), ["Passed the spam check", "Their company already works with Vincent Nguyen", "Vincent is away, so their backup Priya Nair takes it"]);
  assert.ok(!calls.some((c) => c.fn === "router_commit" || c.fn === "enqueue_job"), "trying writes nothing");
});

test("where a lead stops on the five steps, what it books, and why", () => {
  const b = body();
  // Step 4: a big company goes to the Enterprise team, fewest meetings first, and books the demo.
  const big = decide(b, facts({ reps: { ...facts().reps, [DAN]: rep("Dan Reyes", { meetingsWeek: 3 }) } }));
  assert.deepEqual(stopOf(big), { stop: "rule", rule: "r1" });
  assert.equal(bookedMeeting(b, big), MEET_DEMO);
  assert.equal(teamOfResult(b, big)?.name, "Enterprise team");
  assert.deepEqual(whyLines(big, { body: b, fields: BASE_FIELDS, name }), [
    "Passed the spam check",
    "Their company has no rep yet",
    "They have no rep yet",
    "Company size is more than 199, so they go to the Enterprise team",
    "Vincent Nguyen has the fewest meetings this week",
  ]);
  // Junk stops at step 1 and books nothing.
  const junk = decide(b, facts({ lead: { ...facts().lead, email: "test@mailinator.com", domain: "mailinator.com", disposable: true } }));
  assert.equal(stopOf(junk).stop, "spam");
  assert.equal(bookedMeeting(b, junk), null);
  assert.match(whyLines(junk, { body: b, fields: BASE_FIELDS, name })[0]!, /^Looks like junk/);
  // A rule whose whole team is away goes on to step 5, like the engine.
  const away = { ...facts().reps, [DAN]: rep("Dan Reyes", { outUntil: NOW + DAY }), [VIN]: rep("Vincent Nguyen", { pausedUntil: Infinity }) };
  const on = decide(b, facts({ reps: away }));
  assert.deepEqual(stopOf(on), { stop: "fallback", rule: null });
  assert.equal(bookedMeeting(b, on), MEET_INTRO, "no rule fit: the fallback's meeting");
  assert.ok(whyLines(on, { body: b, fields: BASE_FIELDS, name }).includes("Nobody in the Enterprise team can take it right now"));
  // A returning lead stays with their rep at step 3 and books the form's own meeting.
  const back = decide(b, facts({ owner: { user: SAM, crm: null } }));
  assert.equal(stopOf(back).stop, "person");
  assert.equal(bookedMeeting(b, back), null);
  // Nobody at all: unassigned stops at step 5.
  const none = decide({ ...b, fallback: null, rules: { on: true, list: [] } }, facts());
  assert.equal(stopOf(none).stop, "fallback");
  assert.equal(becauseWords(none, { body: b, fields: BASE_FIELDS }), "Nobody could take it");
  assert.equal(becauseWords(big, { body: b, fields: BASE_FIELDS }), "Company size is more than 199");
  assert.equal(becauseWords(junk, { body: b, fields: BASE_FIELDS }), "Stop junk");
  assert.equal(becauseWords(back, { body: b, fields: BASE_FIELDS }), "Returning lead, same rep");
  // A rule that holds stops at step 4, held.
  const hold = { ...b, rules: { on: true, list: [{ id: "rh", name: "Students", match: "all" as const, conds: [{ field: "lead.country", op: "one_of" as const, value: ["US"] }], queue: "", then: "hold" as const }] } };
  assert.deepEqual(stopOf(decide(hold, facts())), { stop: "rule", rule: "rh" });
});

test("a team's next five leads: the engine's pick from real turns, skipping who's away or full today", () => {
  const q = body().queues[0]!;
  const reps = new Map([
    [PRIYA, { pausedUntil: null, outUntil: NOW + 3 * DAY, capDay: 8, today: 0 }],
    [SAM, { pausedUntil: null, outUntil: null, capDay: 8, today: 5 }],
    [DAN, { pausedUntil: null, outUntil: null, capDay: 8, today: 3 }],
  ]);
  const turns = new Map([
    [SAM, 4],
    [DAN, 5],
  ]);
  assert.deepEqual(nextLeads(q, { turns, reps, now: NOW }, 5), [SAM, DAN, SAM, DAN, SAM], "Priya is away; Sam had fewer turns");
  // Sam fills up at 8 today: the rest go to Dan.
  assert.deepEqual(nextLeads(q, { turns, reps: new Map(reps).set(SAM, { pausedUntil: null, outUntil: null, capDay: 6, today: 5 }), now: NOW }, 4), [SAM, DAN, DAN, DAN]);
  // Everyone away: nobody next.
  assert.deepEqual(nextLeads(q, { reps: new Map([...reps].map(([k, v]) => [k, { ...v, pausedUntil: Infinity }])), now: NOW }), []);
  // Fewest meetings first goes by this week's meetings.
  const load = { ...q, method: "load" as const };
  assert.equal(nextLeads(load, { reps: new Map([[PRIYA, { pausedUntil: null, outUntil: null, capDay: null, today: 0, meetingsWeek: 9 }], [SAM, { pausedUntil: null, outUntil: null, capDay: null, today: 0, meetingsWeek: 2 }], [DAN, { pausedUntil: null, outUntil: null, capDay: null, today: 0, meetingsWeek: 4 }]]), now: NOW }, 1)[0], SAM);
});

test("get ready to take bookings: four checks", () => {
  const c = readyChecks({ noCalendar: ["Vincent Nguyen"], meetings: 3, body: body(), live: false, draft: true });
  assert.deepEqual(c.map((x) => x.ok), [false, true, true, false]);
  assert.equal(c[0].line, "Vincent still needs to connect");
  assert.equal(c[3].line, "Your changes aren't live yet");
  const done = readyChecks({ noCalendar: [], meetings: 1, body: body(), live: true, draft: false });
  assert.ok(done.every((x) => x.ok));
  assert.equal(readyChecks({ noCalendar: [], meetings: 1, body: { queues: [{ ...body().queues[0]!, members: [] }] }, live: true, draft: false })[2].ok, false, "a team with nobody isn't ready");
});

// Meetings ----------------------------------------------------------------------------------------------------------

const mt = (o: Partial<MeetingType>): MeetingType => ({ id: "t1", workspace_id: "w1", slug: "intro", name: "Intro call", kind: "one", hosts: [{ user_id: VIN }], settings: { ...DEFAULT_SETTINGS }, secret: false, active: true, locked: [], owner_user_id: null, template_id: null, ...o }) as MeetingType;

test("who hosts: Team is a Routing team, Individual is one rep, and other set-ups are kept until a pick", () => {
  const queues = body().queues;
  const people = new Set([DAN, PRIYA, SAM, VIN]);
  const one = mt({});
  assert.equal(hostChoice(one), `rep:${VIN}`);
  const team = withHostChoice(one, "team:q_smb", queues, people);
  assert.equal(team.kind, "round_robin");
  assert.deepEqual(team.hosts.map((h) => h.user_id), [PRIYA, SAM, DAN], "the team's people take turns on its plain link");
  assert.equal((team.settings as { team?: string }).team, "q_smb");
  assert.equal(hostChoice(team), "team:q_smb");
  const back = withHostChoice(team, `rep:${SAM}`, queues, people);
  assert.equal(back.kind, "one");
  assert.deepEqual(back.hosts, [{ user_id: SAM }]);
  assert.equal("team" in back.settings, false, "Individual drops the team");
  // Everyone and hand-picked hosts stay as they are until someone picks.
  const everyone = mt({ kind: "collective", hosts: [{ user_id: DAN }, { user_id: SAM }] });
  assert.equal(hostChoice(everyone), "everyone");
  assert.equal(withHostChoice(everyone, "everyone", queues, people), everyone);
  const own = mt({ kind: "round_robin", hosts: [{ user_id: DAN }, { user_id: SAM }] });
  assert.equal(hostChoice(own), "own");
  assert.equal(withHostChoice(own, "own", queues, people), own);
  // A group event stays a group with one host; owner first stays owner first with a team.
  assert.equal(withHostChoice(mt({ kind: "group" }), `rep:${DAN}`, queues, people).kind, "group");
  assert.equal(withHostChoice(mt({ kind: "owner_first", hosts: [{ user_id: DAN }] }), "team:q_ent", queues, people).kind, "owner_first");
  // A team with nobody in it (or nobody still here) keeps the hosts the type had.
  assert.deepEqual(withHostChoice(one, "team:q_x", [{ id: "q_x", name: "Empty", method: "rr", strict: false, hoursOnly: false, members: [] }], people).hosts, one.hosts);
  assert.equal(withHostChoice(one, "team:gone", queues, people), one, "a team that's gone changes nothing");
});

test("booked by leads from: the live rules and fallback that name a meeting", () => {
  const b = body();
  assert.deepEqual(bookedBy(b, MEET_INTRO), ["Country is United States", "When no rule fits"]);
  assert.deepEqual(bookedBy(b, MEET_DEMO), ["Company size is more than 199"]);
  assert.deepEqual(bookedBy({ ...b, rules: { on: false, list: b.rules.list } }, MEET_DEMO), [], "rules turned off book nothing");
  assert.deepEqual(bookedBy(null, MEET_DEMO), [], "nothing live");
});

// Reps --------------------------------------------------------------------------------------------------------------

test("reps: hours in a few words, In, Away or Paused, and the daily limits offered", () => {
  for (const h of HOUR_PRESETS) assert.equal(hoursWords(h.weekly), h.key, "each preset reads as itself");
  assert.equal(hoursWords(null), "No hours set");
  assert.equal(hoursWords({ mon: [["09:30", "17:30"]], wed: [["09:30", "17:30"]], fri: [["09:30", "17:30"]], tue: [], thu: [], sat: [], sun: [] }), "Mon, Wed, Fri, 9:30–5:30");
  assert.equal(hoursWords({ mon: [["09:00", "12:00"], ["13:00", "17:00"]], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }), "Custom hours");
  const today = "2026-10-30";
  const now = Date.parse(`${today}T12:00:00`);
  assert.equal(repState({ paused_until: null, out_dates: [] }, now).state, "in");
  assert.equal(repState({ paused_until: "infinity", out_dates: [] }, now).state, "paused");
  assert.equal(repState({ paused_until: null, out_dates: [{ from: "2026-10-29", to: "2026-11-02" }] }, now).state, "away");
  assert.equal(teamLine({ state: "in", until: null, today: 8, cap: 8 }), "Full for today, skipped");
  assert.equal(teamLine({ state: "in", until: null, today: 3, cap: 8 }), "Taking leads");
  assert.equal(teamLine({ state: "paused", until: Infinity, today: 0, cap: null }), "Paused, skipped");
  assert.match(teamLine({ state: "away", until: Date.parse("2026-11-02T23:59:59"), today: 0, cap: null }), /^Away until Mon, Nov 2, skipped$/);
  assert.deepEqual(capOptions(null), [null, 5, 8, 10, 15]);
  assert.deepEqual(capOptions(12), [null, 5, 8, 10, 12, 15], "a limit set elsewhere shows too");
  assert.deepEqual(withoutToday([{ from: "2026-10-29", to: "2026-10-31" }, { from: "2026-11-10", to: "2026-11-11" }], today), [{ from: "2026-11-10", to: "2026-11-11" }]);
});

test("the sidebar's dots: Reps with someone missing a calendar, Routing not live, paused or with a draft", () => {
  assert.deepEqual(inboundDots({ routing: true, no_calendar: 0, routing_draft: false, routing_paused: false }), { reps: false, routing: false });
  assert.deepEqual(inboundDots({ routing: true, no_calendar: 1 }), { reps: true, routing: false });
  assert.equal(inboundDots({ routing: false }).routing, true, "never published");
  assert.equal(inboundDots({ routing: true, routing_draft: true }).routing, true, "changes that aren't live");
  assert.equal(inboundDots({ routing: true, routing_paused: true }).routing, true, "paused");
  assert.equal(inboundDots({ routing: true }).reps, false, "before the migration: no dot rather than a wrong one");
});
