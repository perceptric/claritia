// The meeting's own booking page inside a form, on a real database (docs/ending-plan.md Part 4,
// src/lib/forms/bookPage.ts): the send answers the page's address when it's on, the same one on a retried send; the
// page books with the fill's email and the type's questions, with Routing's rep even when the owner changed after the
// send; two bookings from the page make one meeting; a lost time gives fresh times; a type that's gone is refused.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { readBooking, type Booking, type Claim } from "../../src/lib/forms/booking.ts";
import { bookPageUrl, claimBook, claimSlots } from "../../src/lib/forms/bookPage.ts";
import type { Schedule } from "../../src/lib/forms/schedule.ts";
import { checkForm, emptyForm } from "../../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../../src/lib/forms/submit.ts";
import type { Rpc } from "../../src/lib/jobs.ts";
import { at } from "../../src/lib/meetings/time.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS, type Kind } from "../../src/lib/meetings/types.ts";
import { ctxFor } from "../../worker-intel/jobs/ctx.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const SECRET = "form-book-page-test-secret-0123456789";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

// Monday 2 November 2026, 06:00 in New York.
const NOW = at("2026-11-02", "06:00", "America/New_York");
const none = async () => new Set<string>();
const live = () => none;

async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, u]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, $5)`, [ws, u, a.tz, a.weekly, JSON.stringify(a.overrides)]);
    await q(`insert into booking_profiles (workspace_id, user_id, slug, name, photo_url) values ($1, $2, $3, $4, $5)`, [ws, u, `p${i}-${u.slice(0, 6)}`, `Host ${i}`, `https://img.acme.com/${i}.png`]);
  }
  return { ws, users };
}

async function meetingType(ws: string, kind: Kind, users: string[], settings: Partial<typeof DEFAULT_SETTINGS> = {}) {
  const hosts = users.map((u) => ({ user_id: u, weight: 1, tier: 0 }));
  const s = { ...DEFAULT_SETTINGS, notice: 0, window: 1, ...settings };
  return (await q(`insert into meeting_types (workspace_id, slug, name, kind, hosts, settings) values ($1, $2, 'Demo', $3, $4, $5) returning id`, [ws, `d-${randomUUID().slice(0, 6)}`, kind, JSON.stringify(hosts), s]))[0].id as string;
}

/** A live form that books with Claritia calendar: email and an optional team size. */
async function liveForm(ws: string, user: string, schedule: Partial<Schedule>): Promise<PublicForm> {
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
    after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "claritia", url: "", perOwner: false, ...schedule } },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Demo', $2) returning id`, [ws, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, r.form]);
  return (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm;
}

const key = () => `k${randomUUID().replace(/-/g, "")}`.slice(0, 32);

async function fill(f: PublicForm, answers: Record<string, unknown>, o: { key?: string; rpc?: Rpc } = {}) {
  const r = await acceptFill(o.rpc ?? rpc, f, { v: 1, version: f.version, key: o.key ?? key(), answers, ms: 5000, trap: "" }, await ctxFor(pool, f.workspace_id), { secret: SECRET, now: NOW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body as { id: string; schedule: null; booking?: Booking; bookPage?: string };
}

const claimOf = (b: Booking) => {
  const c = readBooking(b.token, SECRET);
  assert.ok(c && c !== "expired");
  return c as Claim;
};


/** Every lead goes to rep 1 (the type's only host is rep 0). */
async function routeToRep1(ws: string, users: string[]) {
  const body = {
    ...(await import("../../src/lib/router/types.ts")).emptyBody(),
    account: { on: false, oppFirst: true, setCompanyOwner: false },
    queues: [{ id: "q", name: "Rep 1", method: "rr", strict: false, hoursOnly: false, members: [{ user: users[1]!, weight: 1 }] }],
    fallback: { kind: "queue", id: "q" },
  };
  await q(`select router_publish($1, $2, 'test', null)`, [ws, body]);
}

const QUESTION = { id: "goal", label: "Your goal", type: "text" as const, required: true };

test("the send answers the booking page's address where it's on, and the same address on a retried send", async () => {
  const { ws, users } = await team(1);
  const other = await team(1);
  const type = await meetingType(ws, "one", users);
  const otherType = await meetingType(other.ws, "one", other.users);
  process.env.FORM_BOOK_PAGE = ws;
  try {
    const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
    const k = key();
    const all = await Promise.all([1, 2, 3].map(() => fill(f, { em: "ana@acme.com" }, { key: k })));
    const again = await fill(f, { em: "ana@acme.com" }, { key: k });
    const pages = new Set([...all, again].map((r) => r.bookPage));
    assert.equal(pages.size, 1, "one address for the fill, however often the send is retried");
    assert.equal(again.bookPage, bookPageUrl("https://app.tryclaritia.com", again.booking!.token));
    assert.match(again.bookPage!, /^https:\/\/app\.tryclaritia\.com\/book\/f\/[\w.~-]+$/);
    // Off for this workspace: the form's own calendar only.
    const g = await liveForm(other.ws, other.users[0]!, { meetingTypeId: otherType });
    const off = await fill(g, { em: "bo@acme.com" });
    assert.ok(off.booking);
    assert.equal(off.bookPage, undefined);
  } finally {
    delete process.env.FORM_BOOK_PAGE;
  }
});

test("booking from the page: the fill's email, the type's questions, Routing's rep, joined to the fill and contact", async () => {
  const { ws, users } = await team(2);
  const type = await meetingType(ws, "owner_first", [users[0]!], { questions: [QUESTION] });
  await routeToRep1(ws, users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const out = await fill(f, { em: "routed@acme.com", fn: "Ana" });
  const b = out.booking!;
  const c = claimOf(b);
  assert.equal(c.only, true, "Routing named the rep");
  const first = await claimSlots(rpc, b.token, c, 30, NOW);
  assert.deepEqual(first.slots.map((s) => s.start), b.slots, "the page shows the same times as the form");
  // The page's own checks: a required question left out.
  const missing = await claimBook(rpc, b.token, c, { start: b.slots[0], length: 30, name: "Ana", email: "ana@acme.com" }, { now: NOW, liveBusyFor: live });
  assert.deepEqual([missing.status, missing.reply.ok], [400, false]);
  assert.equal((await q(`select count(*)::int n from meetings where submission_id = $1`, [out.id]))[0].n, 0);
  // The owner changes after the send (someone reassigns the lead): the page still books the rep its token names.
  const cid = (await q(`select contact_id from submissions where id = $1`, [out.id]))[0].contact_id;
  await q(`update contacts set owner_user_id = $1 where id = $2`, [users[0], cid]);
  const r = await claimBook(rpc, b.token, c, { start: b.slots[0], length: 30, tz: "Europe/Paris", name: "Someone", email: "someone@else.com", answers: { goal: "Grow" } }, { now: NOW, liveBusyFor: live });
  assert.equal(r.status, 200, JSON.stringify(r.reply));
  assert.ok(r.reply.ok);
  if (r.reply.ok) {
    assert.equal(r.reply.start, b.slots[0]);
    assert.deepEqual(r.reply.hosts, [{ name: "Host 1", photo: "https://img.acme.com/1.png" }]);
    assert.match(r.reply.manage, /^\/book\/m\/[A-Za-z0-9_-]+$/);
  }
  const m = (await q(`select hosts, source, submission_id, contact_id, guest_email, guest_name, guest_tz, answers from meetings where submission_id = $1`, [out.id]))[0];
  assert.deepEqual(m, { hosts: [users[1]], source: "form", submission_id: out.id, contact_id: cid, guest_email: "routed@acme.com", guest_name: "Ana", guest_tz: "Europe/Paris", answers: { goal: "Grow" } });
  // Opened again: no times, since the fill has its meeting.
  assert.deepEqual((await claimSlots(rpc, b.token, c, 30, NOW)).slots, []);
});

test("two bookings from the page at once, or a second one later, give back the one meeting", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const b = (await fill(f, { em: "di@acme.com" })).booking!;
  const c = claimOf(b);
  const two = await Promise.all([b.slots[0]!, b.slots[b.slots.length - 1]!].map((start) => claimBook(rpc, b.token, c, { start, length: 30, name: "Di", email: "di@acme.com" }, { now: NOW, liveBusyFor: live })));
  assert.deepEqual(two.map((r) => r.status), [200, 200]);
  const starts = two.map((r) => (r.reply.ok ? r.reply.start : 0));
  assert.equal(starts[0], starts[1]);
  const later = await claimBook(rpc, b.token, c, { start: b.slots[3], length: 30, name: "Di", email: "di@acme.com" }, { now: NOW, liveBusyFor: live });
  assert.equal(later.status, 200);
  assert.equal(later.reply.ok && later.reply.start, starts[0], "the first meeting, not a second one");
  assert.equal((await q(`select count(*)::int n from meetings where submission_id = $1 and status = 'booked'`, [c.submission]))[0].n, 1);
});

test("a time taken while the page was open gives fresh times; a type that's gone is refused", async () => {
  const { ws, users } = await team(1);
  const type = await meetingType(ws, "one", users);
  const f = await liveForm(ws, users[0]!, { meetingTypeId: type });
  const a = (await fill(f, { em: "ana@acme.com" })).booking!;
  const b = (await fill(f, { em: "bo@acme.com" })).booking!;
  const start = a.slots[2]!;
  const ra = await claimBook(rpc, a.token, claimOf(a), { start, length: 30, name: "Ana", email: "ana@acme.com" }, { now: NOW, liveBusyFor: live });
  assert.equal(ra.status, 200);
  const rb = await claimBook(rpc, b.token, claimOf(b), { start, length: 30, name: "Bo", email: "bo@acme.com" }, { now: NOW, liveBusyFor: live });
  assert.equal(rb.status, 409);
  assert.equal(rb.reply.ok, false);
  if (!rb.reply.ok) {
    assert.equal(rb.reply.code, "slot_taken");
    assert.ok(rb.reply.slots.length > 0 && !rb.reply.slots.some((s) => s.start === start));
  }
  // The calendar says busy at the last moment: fresh times, no meeting.
  const busy = await claimBook(rpc, b.token, claimOf(b), { start: b.slots[0], length: 30, name: "Bo", email: "bo@acme.com" }, { now: NOW, liveBusyFor: () => async (hosts) => new Set(hosts) });
  assert.equal(busy.status, 409);
  assert.equal((await q(`select count(*)::int n from meetings where submission_id = $1`, [claimOf(b).submission]))[0].n, 0);
  await q(`update meeting_types set active = false where id = $1`, [type]);
  const gone = await claimBook(rpc, b.token, claimOf(b), { start: b.slots[0], length: 30, name: "Bo", email: "bo@acme.com" }, { now: NOW, liveBusyFor: live });
  assert.equal(gone.status, 410);
});
