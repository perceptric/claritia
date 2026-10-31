// Routing decides, the form shows the result (docs/inbound.md), on a real database. A form that books with Claritia
// calendar while Routing is live: the lead sees only the times of the rep Routing gave them, whatever the meeting
// type's kind (here a round robin hosted by a Routing team); the confirm books with that rep alone and refuses any
// other host's start; no second queue turn is taken; a rule's own meeting wins; a rep with no free times, a held lead
// and an unassigned one see the message; a slow router and a paused one fall back to the type's own hosts; two guests
// confirming the same start with the same rep make one meeting.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { bookForClaim, readBooking, timesForClaim, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import type { Schedule } from "../../src/lib/forms/schedule.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Rpc } from "../../src/lib/jobs.ts";
import { offer } from "../../src/lib/meetings/server.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type MeetingType } from "../../src/lib/meetings/types.ts";
import { invalidateRouterLive } from "../../src/lib/router/server.ts";
import { emptyBody, type RouterBody } from "../../src/lib/router/types.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const SECRET = "routed-booking-test-secret-0123456789";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const TZ = "America/New_York";
// Monday 2 November 2026, 06:00 in New York. Rep 0 is busy 10:00 to 11:00; the other reps are free all day.
const NOW = at("2026-11-02", "06:00", TZ);
const TEN = at("2026-11-02", "10:00", TZ);
const free = () => async () => new Set<string>();

/**
 * Three reps. Routing: Enterprise (more than 499 people) goes to its own queue with rep 0 alone; a team size of 1 is
 * held; everyone else goes to Sales (all three). The form's meeting is a round robin hosted by the Sales team.
 */
async function setup(o: { meet?: boolean; paused?: boolean; none?: Schedule["none"]; noTimes?: boolean } = {}) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < 3; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY(TZ);
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name) values ($1, $2, $3, $4)`, [ws, u, `p${i}-${u.slice(0, 6)}`, `Rep ${i}`]);
    if (i === 0) await q(`insert into busy_blocks (account_id, calendar_id, start_at, end_at) values ($1, 'primary', $2, $3)`, [acc, new Date(TEN).toISOString(), new Date(TEN + 3_600_000).toISOString()]);
  }
  const settings = { ...DEFAULT_SETTINGS, notice: 0, window: 1, team: "sales" };
  const type = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'demo', 'Demo', 'round_robin', $2, $3) returning id`, [ws, JSON.stringify(users.map((u) => ({ user_id: u, weight: 1 }))), settings]))[0].id as string;
  // The rule's own meeting: hosted by rep 2 on its own, so a booking with rep 0 shows the type's hosts never count.
  const meet = (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, 'ent', 'Enterprise demo', 'one', $2, $3) returning id`, [ws, JSON.stringify([{ user_id: users[2] }]), { ...DEFAULT_SETTINGS, notice: 0, window: 1 }]))[0].id as string;
  const body: RouterBody = {
    ...emptyBody(),
    queues: [
      { id: "ent", name: "Enterprise", method: "rr", strict: false, hoursOnly: false, members: [{ user: users[0]!, weight: 1 }] },
      { id: "sales", name: "Sales", method: "rr", strict: false, hoursOnly: false, members: users.map((user) => ({ user, weight: 1 })) },
    ],
    rules: {
      on: true,
      list: [
        { id: "hold", name: "Test fills", match: "all", conds: [{ field: "answer.q.size", op: "is", value: 1 }], queue: "sales", then: "hold" },
        { id: "ent", name: "Enterprise", match: "all", conds: [{ field: "answer.q.size", op: "gt", value: 499 }], queue: "ent", ...(o.meet ? { meet } : {}) },
      ],
    },
    fallback: { kind: "queue", id: "sales" },
    // Routing › Assignment's "Alert the rep when there is no availability": off unless a test turns it on.
    notify: { noTimes: !!o.noTimes },
  };
  await q(`insert into routers (workspace_id, live_version, paused_at) values ($1, 1, $2)`, [ws, o.paused ? new Date().toISOString() : null]);
  await q(`insert into router_versions (workspace_id, version, body) values ($1, 1, $2)`, [ws, body]);
  invalidateRouterLive(ws);
  const raw = {
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "em", key: "email", type: "email", label: "Email", required: true },
          { id: "fn", key: "first_name", type: "text", label: "First name", required: false },
          { id: "size", key: "q.size", type: "number", label: "Team size", required: false },
        ],
      },
    ],
    spam: { minSeconds: 0, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "claritia", url: "", perOwner: false, meetingTypeId: type, ...(o.none ? { none: o.none } : {}) } },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, users[0], r.form]);
  const form = (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
  const typeRow = (await q(`select * from meeting_types where id = $1`, [type]))[0] as MeetingType;
  return { ws, users, type, meet, form, typeRow };
}

let n = 0;
async function fill(f: PublicForm, size: number, o: { rpc?: Rpc } = {}) {
  const em = `maya${++n}-${randomUUID().slice(0, 6)}@globex.com`;
  const r = await acceptFill(o.rpc ?? rpc, f, { v: 1, version: f.version, key: `k${randomUUID().replace(/-/g, "")}`.slice(0, 32), answers: { em, fn: "Maya", size }, ms: 5000, trap: "" }, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { id: string; booking?: Booking };
}

const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};

test("a routed lead sees only their rep's times on a round-robin team type, and books with them alone", async () => {
  const s = await setup();
  const pool3 = await offer(rpc, { ws: s.ws, type: s.typeRow, length: 30, now: NOW });
  assert.ok(pool3.slots.some((x) => x.start === TEN), "the team has 10:00 free (reps 1 and 2)");
  const b = await fill(s.form, 800);
  assert.ok(b.booking?.slots.length, "times shown");
  const c = claimOf(b.booking!);
  assert.deepEqual([c.owner, c.only, c.type], [s.users[0], true, s.type]);
  assert.deepEqual(b.booking!.host, { name: "Rep 0" });
  assert.ok(!b.booking!.slots.includes(TEN), "rep 0 is busy at 10:00: never shown, though the team is free");
  const mine = await offer(rpc, { ws: s.ws, type: s.typeRow, length: 30, now: NOW, only: s.users[0] });
  assert.deepEqual(b.booking!.slots, mine.slots.map((x) => x.start));
  // The thank-you page's fresh times are the rep's too.
  const again = await timesForClaim(rpc, b.booking!.token, c, { now: NOW });
  assert.deepEqual(again.body.booking?.slots, b.booking!.slots);
  // The confirm refuses another host's start: 10:00 is free for reps 1 and 2, not for rep 0.
  const other = await bookForClaim(rpc, b.booking!.token, c, { start: TEN, now: NOW, liveBusyFor: free });
  assert.equal(other.status, 409);
  assert.equal((await q(`select count(*)::int n from meetings where workspace_id = $1`, [s.ws]))[0].n, 0, "no meeting with someone else");
  const ok = await bookForClaim(rpc, b.booking!.token, c, { start: b.booking!.slots[0]!, now: NOW, liveBusyFor: free });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const m = await q(`select hosts, type_id from meetings where submission_id = $1`, [b.id]);
  assert.deepEqual([m[0].hosts, m[0].type_id], [[s.users[0]], s.type]);
  // The owner's pick isn't a new turn: the lead's one routing run, no booking run and no team-run job.
  const runs = await q(`select reason from router_runs where workspace_id = $1`, [s.ws]);
  assert.deepEqual(runs.map((r) => r.reason), ["form"]);
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'meeting_team_run'`, [s.ws]))[0].n, 0);
  // Book-later knows the times were the rep's only.
  const later = await q(`select payload from jobs where workspace_id = $1 and kind = 'meeting_book_later'`, [s.ws]);
  assert.deepEqual([later[0].payload.owner, later[0].payload.only], [s.users[0], true]);
});

test("a lead from the fallback queue books with the rep Routing gave them, never another member", async () => {
  const s = await setup();
  const b = await fill(s.form, 20);
  const owner = (await q(`select c.owner_user_id from submissions x join contacts c on c.id = x.contact_id where x.id = $1`, [b.id]))[0].owner_user_id;
  const c = claimOf(b.booking!);
  assert.deepEqual([c.owner, c.only], [owner, true]);
  const mine = await offer(rpc, { ws: s.ws, type: s.typeRow, length: 30, now: NOW, only: owner });
  assert.deepEqual(b.booking!.slots, mine.slots.map((x) => x.start));
});

test("a rule's own meeting wins, still with the routed rep only", async () => {
  const s = await setup({ meet: true });
  const b = await fill(s.form, 900);
  const c = claimOf(b.booking!);
  assert.deepEqual([c.type, c.owner], [s.meet, s.users[0]]);
  assert.deepEqual(b.booking!.host, { name: "Rep 0" });
  const ok = await bookForClaim(rpc, b.booking!.token, c, { start: b.booking!.slots[0]!, now: NOW, liveBusyFor: free });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.deepEqual((await q(`select hosts, type_id from meetings where submission_id = $1`, [b.id]))[0], { hosts: [s.users[0]], type_id: s.meet });
});

test("a rep with no free times: the message; with Email times later, their times by email later", async () => {
  const s = await setup();
  await q(`delete from availability where workspace_id = $1 and user_id = $2`, [s.ws, s.users[0]]);
  const b = await fill(s.form, 700);
  assert.equal(b.booking, undefined, "the team has times, the rep has none: the message");
  assert.equal((await q(`select booking_shown_at from submissions where id = $1`, [b.id]))[0].booking_shown_at, null);
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'meeting_book_later'`, [s.ws]))[0].n, 0, "Show the message: no email");
  const l = await setup({ none: "later" });
  await q(`delete from availability where workspace_id = $1 and user_id = $2`, [l.ws, l.users[0]]);
  const lb = await fill(l.form, 700);
  assert.equal(lb.booking, undefined);
  const jobs = await q(`select payload, run_after > now() + interval '23 hours' as later from jobs where workspace_id = $1 and kind = 'meeting_book_later'`, [l.ws]);
  assert.equal(jobs.length, 1);
  assert.deepEqual([jobs[0].payload.owner, jobs[0].payload.only, jobs[0].later], [l.users[0], true, true]);
  // Routing's own switch does the same for every form, with the form left on "Show the message".
  const r = await setup({ noTimes: true });
  await q(`delete from availability where workspace_id = $1 and user_id = $2`, [r.ws, r.users[0]]);
  const rb = await fill(r.form, 700);
  assert.equal(rb.booking, undefined, "still the message");
  const rj = await q(`select payload from jobs where workspace_id = $1 and kind = 'meeting_book_later'`, [r.ws]);
  assert.deepEqual([rj.length, rj[0]?.payload.owner, rj[0]?.payload.only], [1, r.users[0], true]);
});

test("a held lead sees the message, never times", async () => {
  const s = await setup();
  const b = await fill(s.form, 1);
  assert.equal(b.booking, undefined);
  assert.equal((await q(`select route_status from contacts c join submissions x on x.contact_id = c.id where x.id = $1`, [b.id]))[0].route_status, "held");
  assert.equal((await q(`select booking_shown_at from submissions where id = $1`, [b.id]))[0].booking_shown_at, null);
});

test("routing too slow to answer: the details are saved, the form waits, and the same request again shows the committed owner's times", async () => {
  const s = await setup();
  const slow: Rpc = async (fn, args) => {
    if (fn === "routing_facts" || fn === "router_facts_full" || fn === "router_facts") await new Promise((r) => setTimeout(r, 2600));
    return rpc(fn, args);
  };
  const raw = { v: 1, version: s.form.version, key: `k${randomUUID().replace(/-/g, "")}`.slice(0, 32), answers: { em: `slow-${randomUUID().slice(0, 6)}@globex.com`, fn: "Maya", size: 800 }, ms: 5000, trap: "" };
  const first = await acceptFill(slow, s.form, raw, await ctxFor(pool, s.form.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.pending, first.body.message, first.body.booking], [true, "Your details are saved. We're finishing your request.", undefined], "never another host's times");
  assert.equal((await q(`select count(*)::int n from submissions where id = $1`, [first.body.id]))[0].n, 1, "the fill is saved first");
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'route'`, [s.ws]))[0].n, 1, "a job routes it");
  // The browser sends the same request again (same key): the same submission, the committed owner's times.
  const again = await acceptFill(rpc, s.form, raw, await ctxFor(pool, s.form.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(again.body.id, first.body.id);
  const c = claimOf(again.body.booking as Booking);
  const owner = (await q(`select c.owner_user_id from submissions x join contacts c on c.id = x.contact_id where x.id = $1`, [first.body.id]))[0].owner_user_id;
  assert.deepEqual([c.owner, c.only], [owner, true]);
  await new Promise((r) => setTimeout(r, 2800));
  assert.equal((await q(`select count(*)::int n from router_runs where workspace_id = $1`, [s.ws]))[0].n, 1, "one routing run for the one request");
});

test("Routing paused: everyone books the form's meeting with its hosts", async () => {
  const s = await setup({ paused: true });
  const b = await fill(s.form, 800);
  assert.ok(b.booking?.slots.includes(TEN), "the team's times");
  assert.ok(!claimOf(b.booking!).only);
  const held = await fill(s.form, 1);
  assert.ok(held.booking?.slots.length, "no hold while paused: the lead books");
});

test("two guests confirming the same start with the same rep: one meeting", async () => {
  const s = await setup();
  const [a, b] = await Promise.all([fill(s.form, 600), fill(s.form, 650)]);
  const start = a.booking!.slots.find((x) => b.booking!.slots.includes(x))!;
  assert.ok(start);
  const [ra, rb] = await Promise.all([
    bookForClaim(rpc, a.booking!.token, claimOf(a.booking!), { start, now: NOW, liveBusyFor: free }),
    bookForClaim(rpc, b.booking!.token, claimOf(b.booking!), { start, now: NOW, liveBusyFor: free }),
  ]);
  assert.deepEqual([ra.status, rb.status].sort(), [200, 409]);
  const lost = ra.status === 409 ? ra : rb;
  assert.ok(lost.body.booking && !lost.body.booking.slots.includes(start), "fresh times without the taken start");
  const m = await q(`select hosts from meetings where workspace_id = $1 and start_at = $2`, [s.ws, new Date(start).toISOString()]);
  assert.equal(m.length, 1);
  assert.deepEqual(m[0].hosts, [s.users[0]]);
});
