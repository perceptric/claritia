// A meeting type hosted by a Routing team (docs/scheduling-plan.md Part 12): the hosts come from the live queue, a
// paused rep and a rep's days off take no team times, the confirm takes the queue's turn, the contact's owner goes
// first, and the meeting is written as the queue's run. Flaky cases: the router slow or down at confirm, the pick
// naming someone who just went busy, the run write failing, a member busy between show and confirm, and two confirms
// on one start.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { checkSettings } from "../src/lib/meetings/check.ts";
import { book, offer, withDaysOff } from "../src/lib/meetings/server.ts";
import { pickTeamHost, ROUTER_WAIT_MS, within } from "../src/lib/meetings/team.ts";
import { at } from "../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../src/lib/meetings/types.ts";

const WS = "0192f3a1-0000-7000-8000-000000000001";
const TYPE = "0192f3a1-0000-7000-8000-0000000000aa";
const MEETING = "0192f3a1-0000-7000-8000-0000000000ff";
const ANA = "0192f3a1-0000-7000-8000-00000000000a";
const BEN = "0192f3a1-0000-7000-8000-00000000000b";
const CAL = "0192f3a1-0000-7000-8000-00000000000c";
const OLD = "0192f3a1-0000-7000-8000-00000000000d";
const TZ = "America/New_York";
// Monday 2 November 2026, 6am in New York; the first time is Monday 10am (4 hours' notice).
const NOW = at("2026-11-02", "06:00", TZ);
const TEN = at("2026-11-02", "10:00", TZ);

const type = (o: Partial<MeetingType["settings"]> = {}): MeetingType => ({
  id: TYPE,
  workspace_id: WS,
  slug: "demo",
  name: "Demo",
  kind: "round_robin",
  // Saved with the type: the members seen last time, used when the router can't be read.
  hosts: [{ user_id: OLD, weight: 1 }],
  settings: { ...DEFAULT_SETTINGS, team: "sales", ...o },
  secret: false,
  active: true,
  owner_user_id: null,
  template_id: null,
  locked: [],
});

type Opt = {
  live?: "ok" | "slow" | "down" | "none";
  pick?: string | null | "slow" | "fail";
  paused?: string[];
  out?: Record<string, { from: string; to: string }[]>;
  runFails?: boolean;
  bookFails?: "slot_taken";
};

function db(o: Opt = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args = {}) => {
    calls.push({ fn, args });
    if (fn === "router_live") {
      if (o.live === "slow") await new Promise((r) => setTimeout(r, ROUTER_WAIT_MS + 200));
      if (o.live === "down") return { data: null, error: { message: "connection reset" } };
      if (o.live === "none") return { data: null, error: null };
      return {
        data: { version: 7, body: { queues: [{ id: "sales", name: "Sales", method: "rr", strict: false, hoursOnly: false, members: [ANA, BEN, CAL].map((user) => ({ user, weight: 1 })) }] } },
        error: null,
      };
    }
    if (fn === "meeting_inputs") {
      const users = args.p_users as string[];
      return {
        data: users.map((id) => ({
          id,
          availability: DEFAULT_AVAILABILITY(TZ),
          connected: true,
          reconnect: false,
          busy: [],
          booked: [],
          out_dates: o.out?.[id] ?? [],
          paused_until: o.paused?.includes(id) ? new Date(NOW + 86_400_000).toISOString() : null,
        })),
        error: null,
      };
    }
    if (fn === "rr_turns") return { data: [{ user_id: ANA, n: 5, last: new Date(NOW).toISOString() }], error: null };
    if (fn === "router_pick") {
      if (o.pick === "slow") await new Promise((r) => setTimeout(r, ROUTER_WAIT_MS + 200));
      if (o.pick === "fail") return { data: null, error: { message: "timeout" } };
      const user = o.pick === undefined ? (args.p_pick as { candidates: { user: string }[] }).candidates.at(-1)?.user : o.pick;
      return { data: user ? { user, n: 0, window: 3, rest: {} } : null, error: null };
    }
    if (fn === "meeting_book") return o.bookFails ? { data: null, error: { message: o.bookFails } } : { data: MEETING, error: null };
    if (fn === "meeting_team_run") return o.runFails ? { data: null, error: { message: "deadlock detected" } } : { data: "run-1", error: null };
    if (fn === "meeting_keep_token" || fn === "enqueue_job") return { data: "x", error: null };
    return { data: null, error: null };
  };
  return { rpc, calls, names: () => calls.map((c) => c.fn) };
}

const free = (busy: string[] = []) => async (hosts: string[]) => new Set(hosts.filter((h) => busy.includes(h)));
const input = (rpc: Rpc, o: { owner?: string | null; busy?: string[]; t?: MeetingType } = {}) =>
  book(rpc, { ws: WS, type: o.t ?? type(), length: 30, start: TEN, guest: { email: "lee@acme.com" }, source: "page", owner: o.owner ?? null, contactId: "0192f3a1-0000-7000-8000-0000000000c1", now: NOW, liveBusy: free(o.busy) });

test("the team setting is kept for round robin and owner first only, with a safe id", () => {
  assert.equal(checkSettings({ team: "sales" }, "round_robin").settings.team, "sales");
  assert.equal(checkSettings({ team: "sales" }, "owner_first").settings.team, "sales");
  assert.equal(checkSettings({ team: "sales" }, "one").settings.team, undefined);
  assert.equal(checkSettings({ team: "sales; drop" }, "round_robin").settings.team, undefined);
  assert.equal(checkSettings({ team: "x".repeat(41) }, "round_robin").settings.team, undefined);
});

test("times are pooled over the live team, without a paused rep", async () => {
  const d = db({ paused: [CAL] });
  const r = await offer(d.rpc, { ws: WS, type: type(), length: 30, now: NOW });
  const first = r.slots.find((s) => s.start === TEN);
  assert.deepEqual(first?.hosts.sort(), [ANA, BEN].sort(), "Cal is paused; the saved host is not asked");
  const users = d.calls.find((c) => c.fn === "meeting_inputs")!.args.p_users as string[];
  assert.ok(!users.includes(OLD));
});

test("a rep's days off from Routing remove their times on those dates only", async () => {
  const d = db({ out: { [ANA]: [{ from: "2026-11-02", to: "2026-11-02" }] } });
  const r = await offer(d.rpc, { ws: WS, type: type(), length: 30, now: NOW });
  assert.ok(!r.slots.find((s) => s.start === TEN)!.hosts.includes(ANA));
  const tue = r.slots.find((s) => s.start === at("2026-11-03", "10:00", TZ));
  assert.ok(tue!.hosts.includes(ANA), "back the next day");
  const a = withDaysOff({ ...DEFAULT_AVAILABILITY(TZ), overrides: [{ date: "2026-11-04", ranges: [["10:00", "12:00"]] }] }, [{ from: "2026-11-03", to: "2026-11-04" }]);
  assert.deepEqual(a.overrides, [{ date: "2026-11-03", ranges: [] }, { date: "2026-11-04", ranges: [] }], "a day off wins over that date's hours");
  assert.equal(withDaysOff(a, [{ from: "nope", to: "2026-11-04" }]), a);
});

test("the confirm takes the queue's turn and is written as the queue's run", async () => {
  const d = db({ pick: BEN });
  const r = await input(d.rpc);
  assert.ok(r.ok);
  assert.deepEqual(r.hosts, [BEN]);
  const pick = d.calls.find((c) => c.fn === "router_pick")!.args.p_pick as { queue: string; candidates: { user: string }[] };
  assert.equal(pick.queue, "sales");
  assert.deepEqual(pick.candidates.map((c) => c.user), [ANA, BEN, CAL], "in the queue's order");
  const run = d.calls.find((c) => c.fn === "meeting_team_run")!.args;
  assert.deepEqual([run.p_meeting, run.p_owner, run.p_queue, run.p_version], [MEETING, BEN, "sales", 7]);
  assert.ok(!d.names().includes("enqueue_job") || d.calls.filter((c) => c.fn === "enqueue_job").every((c) => c.args.p_kind !== "meeting_team_run"));
});

test("the contact's owner gets the meeting when free, and that isn't a new turn", async () => {
  const d = db({ pick: BEN });
  const r = await input(d.rpc, { owner: CAL });
  assert.ok(r.ok);
  assert.deepEqual(r.hosts, [CAL]);
  assert.ok(!d.names().includes("router_pick"));
  assert.ok(!d.names().includes("meeting_team_run"));
  const busy = db({ pick: BEN });
  const r2 = await input(busy.rpc, { owner: CAL, busy: [CAL] });
  assert.ok(r2.ok);
  assert.deepEqual(r2.hosts, [BEN], "owner busy now: the queue's turn");
});

test("a member busy between show and confirm is never picked", async () => {
  const d = db();
  const r = await input(d.rpc, { busy: [CAL] });
  assert.ok(r.ok);
  const pick = d.calls.find((c) => c.fn === "router_pick")!.args.p_pick as { candidates: { user: string }[] };
  assert.deepEqual(pick.candidates.map((c) => c.user), [ANA, BEN]);
  assert.deepEqual(r.hosts, [BEN]);
});

test("the router naming someone not free, or no one, falls back to the type's rotation", async () => {
  for (const p of [OLD, null, "fail", "slow"] as const) {
    const d = db({ pick: p });
    const r = await input(d.rpc, { busy: [CAL] });
    assert.ok(r.ok, String(p));
    // Ana has 5 meetings of this type, so the rotation gives it to Ben.
    assert.deepEqual(r.hosts, [BEN], String(p));
    const run = d.calls.find((c) => c.fn === "meeting_team_run")!.args;
    assert.equal(run.p_owner, BEN, "still the queue's run, so counts stay true");
  }
});

test("the router slow or down at confirm: the saved members are booked, never a refusal", async () => {
  for (const live of ["slow", "down", "none"] as const) {
    const d = db({ live });
    const t0 = Date.now();
    const r = await input(d.rpc);
    assert.ok(r.ok, live);
    assert.deepEqual(r.hosts, [OLD], live);
    assert.ok(!d.names().includes("router_pick"), "no queue to ask");
    assert.ok(Date.now() - t0 < ROUTER_WAIT_MS * 4, "the guest never waits long on the router");
  }
});

test("the run write failing goes to a job with the meeting's key", async () => {
  const d = db({ pick: BEN, runFails: true });
  const r = await input(d.rpc);
  assert.ok(r.ok, "the meeting stands");
  const job = d.calls.find((c) => c.fn === "enqueue_job" && c.args.p_kind === "meeting_team_run")!.args;
  assert.equal(job.p_key, `booking:${MEETING}`);
  assert.equal((job.p_payload as Record<string, unknown>).p_owner, BEN);
});

test("two confirms on one start: the second gets fresh times and no run", async () => {
  const d = db({ pick: BEN, bookFails: "slot_taken" });
  const r = await input(d.rpc);
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.error === "slot_taken" && r.slots.every((s) => s.start !== TEN));
  assert.ok(!d.names().includes("meeting_team_run"));
});

test("within: a value in time, null when late or failing", async () => {
  assert.deepEqual(await within(Promise.resolve(3), 50), { value: 3 });
  assert.equal(await within(new Promise((r) => setTimeout(() => r(1), 100)), 10), null);
  assert.equal(await within(Promise.reject(new Error("x")), 50), null);
  const d = db();
  assert.equal(await pickTeamHost(d.rpc, { ws: WS, team: null, type: type(), free: [], turns: async () => ({}) }), null);
});

test("a new rep takes the lead's meeting only when free at that time; else it stays", async () => {
  const { handOffMeetings } = await import("../src/lib/meetings/team.ts");
  const m = (id: string, day: string, time: string) => {
    const start = at(day, time, TZ);
    return { id, host: ANA, start: new Date(start).toISOString(), end: new Date(start + 1_800_000).toISOString(), block_start: new Date(start).toISOString(), block_end: new Date(start + 1_800_000).toISOString() };
  };
  const list = [m("m-ok", "2026-11-03", "10:00"), m("m-night", "2026-11-03", "20:00"), m("m-busy", "2026-11-04", "10:00"), m("m-race", "2026-11-05", "10:00"), { ...m("m-mine", "2026-11-06", "10:00"), host: BEN }];
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args = {}) => {
    calls.push({ fn, args });
    if (fn === "meeting_upcoming_for") return { data: list, error: null };
    if (fn === "meeting_inputs") return { data: [{ id: BEN, availability: DEFAULT_AVAILABILITY(TZ), connected: true, reconnect: false, busy: [], booked: [] }], error: null };
    if (fn === "meeting_move") return args.p_id === "m-race" ? { data: null, error: { message: "slot_taken" } } : { data: null, error: null };
    return { data: "x", error: null };
  };
  const busyWed = async (hosts: string[], from: number) => new Set(new Date(from).toISOString().startsWith("2026-11-04") ? hosts : []);
  const r = await handOffMeetings(rpc, { ws: WS, contact: "c", user: BEN, liveBusy: busyWed, now: NOW });
  assert.deepEqual(r, { moved: 1, kept: 3 }, "outside hours, busy on the calendar, taken in a race; their own meeting is left alone");
  const moves = calls.filter((c) => c.fn === "meeting_move").map((c) => c.args.p_id);
  assert.deepEqual(moves, ["m-ok", "m-race"]);
  assert.deepEqual(calls.find((c) => c.fn === "meeting_move")!.args.p_hosts, [BEN]);
  const sync = calls.filter((c) => c.fn === "enqueue_job" && c.args.p_kind === "meeting_sync");
  assert.equal(sync.length, 1, "the calendar event moves for the moved one only");
});

test("a rule and the fallback can name the meeting to offer; a held rule can't", async () => {
  const { cleanBody } = await import("../src/lib/router/check.ts");
  const M = "0192f3a1-0000-7000-8000-0000000000ee";
  const b = cleanBody({
    queues: [{ id: "q1", name: "AEs", method: "rr", members: [{ user: ANA, weight: 1 }] }],
    rules: { on: true, list: [{ id: "r1", name: "Big", conds: [], queue: "q1", meet: M }, { id: "r2", name: "Hold", conds: [], queue: "", then: "hold", meet: M }, { id: "r3", name: "Bad", conds: [], queue: "q1", meet: "nope" }] },
    fallback: { kind: "queue", id: "q1", meet: M },
  });
  assert.equal(b.rules.list[0]!.meet, M);
  assert.equal(b.rules.list[1]!.meet, undefined);
  assert.equal(b.rules.list[2]!.meet, undefined);
  assert.deepEqual(b.fallback, { kind: "queue", id: "q1", meet: M });
});

test("a form offers the meeting its routing rule names, and the router slow gives none", async () => {
  const { routeFill } = await import("../src/lib/forms/submit.ts");
  const M = "0192f3a1-0000-7000-8000-0000000000ee";
  const body = {
    queues: [{ id: "q1", name: "AEs", method: "rr", strict: false, hoursOnly: false, members: [{ user: ANA, weight: 1 }] }],
    rules: { on: true, list: [{ id: "r1", name: "Big", match: "all", conds: [], queue: "q1", meet: M }] },
    fallback: { kind: "queue", id: "q1", meet: "0192f3a1-0000-7000-8000-0000000000ef" },
  };
  const make = (existing: Record<string, unknown>, slow = false): Rpc => async (fn) => {
    if (fn === "router_live") {
      if (slow) await new Promise((r) => setTimeout(r, 500));
      return { data: { version: 1, body }, error: null };
    }
    if (fn === "router_facts") return { data: { existing }, error: null };
    return { data: "x", error: null };
  };
  const byRule = await routeFill(make({ id: "run", kind: "owner", owner: ANA, by: "queue", queue: "q1", rule: "r1" }), WS, "c", "s");
  assert.equal(byRule?.meet, M);
  const byFallback = await routeFill(make({ id: "run", kind: "owner", owner: ANA, by: "fallback", queue: "q1", rule: null }), WS, "c", "s");
  assert.equal(byFallback?.meet, "0192f3a1-0000-7000-8000-0000000000ef");
  assert.equal(await routeFill(make({ id: "run", kind: "owner", owner: ANA, by: "queue" }, true), WS, "c", "s"), null, "slow: the form's own meeting");
});
