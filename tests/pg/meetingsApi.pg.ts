// The signed-in Meetings routes on a real database (docs/meetings-scheduler.md 1.2, 1.4, 1.7 and 1.8b): only members
// act, hosts must be members, managed types keep their locked settings in step, a host's action is a valid status
// change that queues its job exactly once (even when clicked twice at once), and held or no-show wait for the start.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import pg from "pg";
import { copyTimes, deleteType, duplicateType, freeStarts, hostAction, hostLink, pushType, Refused, saveAvailability, saveProfile, saveType, workspaceSlug, type Actor } from "../../src/app/api/meetings/_lib/host.ts";
import { tokenHash } from "../../src/lib/meetings/server.ts";
import { seal } from "../../src/lib/seal.ts";
import { DEFAULT_AVAILABILITY, DEFAULT_SETTINGS } from "../../src/lib/meetings/types.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 8 });
const rpc = pgRpc(pool);
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

/** A workspace with an owner and members; each gets a calendar and hours so times can be offered. */
async function team(n: number) {
  const ws = randomUUID();
  await q(`insert into workspaces (id, name) values ($1, 'Acme Inc')`, [ws]);
  const users: string[] = [];
  for (let i = 0; i < n; i++) {
    const u = randomUUID();
    users.push(u);
    await q(`insert into auth.users (id, email) values ($1, $2)`, [u, `${u}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, u, i === 0 ? "owner" : "member"]);
    const acc = (await q(`insert into calendar_accounts (workspace_id, user_id, provider, account_email) values ($1, $2, 'fake', $3) returning id`, [ws, u, `${u}@t.io`]))[0].id;
    await q(`insert into calendar_lists (account_id, calendar_id, name, busy, write) values ($1, 'primary', 'Work', true, true)`, [acc]);
    const a = DEFAULT_AVAILABILITY("America/New_York");
    await q(`insert into availability (workspace_id, user_id, tz, weekly, overrides) values ($1, $2, $3, $4, '[]')`, [ws, u, a.tz, a.weekly]);
  }
  const as = (i: number): Actor => ({ ws, user: users[i]! });
  return { ws, users, as };
}

const typeBody = (hosts: string[], over: Record<string, unknown> = {}) => ({
  name: "Intro call",
  slug: `intro-${randomUUID().slice(0, 6)}`,
  kind: "one",
  hosts: hosts.map((user_id) => ({ user_id })),
  settings: { ...DEFAULT_SETTINGS, notice: 0 },
  ...over,
});

async function refused(p: Promise<unknown>, status: number) {
  await assert.rejects(p, (e: unknown) => e instanceof Refused && e.status === status);
}

async function meeting(ws: string, hosts: string[], startOffsetMin: number, status = "booked") {
  const start = Date.now() + startOffsetMin * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString();
  return (
    await q(
      `insert into meetings (workspace_id, hosts, guest_email, start_at, end_at, block_start, block_end, status, source, token_hash)
       values ($1, $2, 'dana@lead.io', $3, $4, $3, $4, $5, 'page', $6) returning id`,
      [ws, hosts, iso(start), iso(start + 30 * 60_000), status, randomUUID()],
    )
  )[0].id as string;
}

const jobs = async (meeting: string, kind: string) => (await q(`select payload from jobs where kind = $1 and payload->>'meeting' = $2`, [kind, meeting])).map((r) => r.payload);

test("only members save types, and only members can be hosts", async () => {
  const { ws, users, as } = await team(2);
  const other = await team(1);
  await refused(saveType(rpc, { ws, user: other.users[0]! }, typeBody([users[1]!]), null), 404);
  await refused(saveType(rpc, as(1), typeBody([other.users[0]!]), null), 400);
  const { id } = await saveType(rpc, as(1), typeBody([users[1]!]), null);
  const row = (await q(`select name, kind, hosts, created_by, locked from meeting_types where id = $1`, [id]))[0];
  assert.equal(row.created_by, users[1]);
  assert.deepEqual(row.hosts, [{ user_id: users[1] }]);
});

test("a member changes only their own types; owners change any; a taken link name is refused", async () => {
  const { users, as } = await team(3);
  const mine = await saveType(rpc, as(1), typeBody([users[1]!], { slug: "sam-intro" }), null);
  await refused(saveType(rpc, as(2), typeBody([users[1]!], { slug: "sam-intro", name: "Hijack" }), mine.id), 403);
  await saveType(rpc, as(0), typeBody([users[1]!], { slug: "sam-intro", name: "Renamed by owner" }), mine.id);
  assert.equal((await q(`select name from meeting_types where id = $1`, [mine.id]))[0].name, "Renamed by owner");
  await refused(saveType(rpc, as(2), typeBody([users[2]!], { slug: "sam-intro" }), null), 409);
  // A member can't lock settings; their lock list is dropped.
  const t = await saveType(rpc, as(2), typeBody([users[2]!], { locked: ["lengths"] }), null);
  assert.deepEqual((await q(`select locked from meeting_types where id = $1`, [t.id]))[0].locked, []);
});

test("managed types: copies for each person, locked settings kept in step, people dropped lose theirs", async () => {
  const { ws, users, as } = await team(3);
  const tpl = await saveType(rpc, as(0), typeBody([users[0]!], { slug: "demo", locked: ["lengths", "location", "name"] }), null);
  await refused(pushType(rpc, as(1), tpl.id, [users[1], users[2]]), 403);
  assert.deepEqual(await pushType(rpc, as(0), tpl.id, [users[1], users[2]]), { made: 2, kept: 0, removed: 0 });
  const copies = await q(`select id, slug, hosts, owner_user_id, locked from meeting_types where template_id = $1 order by slug`, [tpl.id]);
  assert.equal(copies.length, 2);
  for (const c of copies) {
    assert.deepEqual(c.hosts, [{ user_id: c.owner_user_id }]);
    assert.deepEqual(c.locked, ["lengths", "location", "name"]);
    assert.match(c.slug, /^demo-/);
  }
  const sams = copies.find((c) => c.owner_user_id === users[1])!;
  // The person changes their copy: unlocked settings stick, locked ones and the host don't move.
  await saveType(rpc, as(1), typeBody([users[2]!], { slug: sams.slug, name: "Mine now", settings: { ...DEFAULT_SETTINGS, lengths: [60], bufferAfter: 15 } }), sams.id);
  let row = (await q(`select name, hosts, settings from meeting_types where id = $1`, [sams.id]))[0];
  assert.equal(row.name, "Intro call");
  assert.deepEqual(row.settings.lengths, [30]);
  assert.equal(row.settings.bufferAfter, 15);
  assert.deepEqual(row.hosts, [{ user_id: users[1] }]);
  // The owner changes the template: the copies follow on locked settings only.
  await saveType(rpc, as(0), typeBody([users[0]!], { slug: "demo", name: "Product demo", locked: ["lengths", "location", "name"], settings: { ...DEFAULT_SETTINGS, lengths: [45], bufferAfter: 5 } }), tpl.id);
  row = (await q(`select name, settings from meeting_types where id = $1`, [sams.id]))[0];
  assert.equal(row.name, "Product demo");
  assert.deepEqual(row.settings.lengths, [45]);
  assert.equal(row.settings.bufferAfter, 15);
  // Pushed again to one person: the other's copy goes, the kept one isn't remade.
  assert.deepEqual(await pushType(rpc, as(0), tpl.id, [users[1]]), { made: 0, kept: 1, removed: 1 });
  // The person can't delete what an owner gave them; deleting the template leaves the copy theirs, unlocked.
  await refused(deleteType(rpc, as(1), sams.id), 403);
  await deleteType(rpc, as(0), tpl.id);
  row = (await q(`select template_id, locked from meeting_types where id = $1`, [sams.id]))[0];
  assert.equal(row.template_id, null);
  assert.deepEqual(row.locked, []);
  assert.equal((await q(`select count(*)::int n from meeting_types where workspace_id = $1`, [ws]))[0].n, 1);
  // Group and one-person types only.
  const rr = await saveType(rpc, as(0), typeBody([users[0]!, users[1]!], { kind: "round_robin" }), null);
  await refused(pushType(rpc, as(0), rr.id, [users[1]]), 400);
});

test("duplicate finds a free link name", async () => {
  const { users, as } = await team(1);
  const t = await saveType(rpc, as(0), typeBody([users[0]!], { slug: "call" }), null);
  const a = await duplicateType(rpc, as(0), t.id);
  const b = await duplicateType(rpc, as(0), t.id);
  const slugs = (await q(`select slug from meeting_types where id = any($1) order by slug`, [[a.id, b.id]])).map((r) => r.slug);
  assert.deepEqual(slugs, ["call-copy", "call-copy-2"]);
});

test("hours: your own, or anyone's for owners, checked first", async () => {
  const { ws, users, as } = await team(2);
  const hours = { ...DEFAULT_AVAILABILITY("Europe/Paris"), overrides: [{ date: "2026-12-24", ranges: [] }] };
  await saveAvailability(rpc, as(1), null, hours);
  await refused(saveAvailability(rpc, as(1), users[0], hours), 403);
  await saveAvailability(rpc, as(0), users[1], { ...hours, tz: "Asia/Tokyo" });
  await refused(saveAvailability(rpc, as(1), null, { ...hours, weekly: { ...hours.weekly, mon: [["17:00", "09:00"]] } }), 400);
  const row = (await q(`select tz, overrides from availability where workspace_id = $1 and user_id = $2`, [ws, users[1]]))[0];
  assert.equal(row.tz, "Asia/Tokyo");
  assert.deepEqual(row.overrides, [{ date: "2026-12-24", ranges: [] }]);
});

test("booking profiles: one link name per person in a workspace; the workspace gets its address once", async () => {
  const { as } = await team(2);
  await saveProfile(rpc, as(0), { slug: "sam", name: "Sam Lee", headline: "Sales", photo_url: "" });
  await refused(saveProfile(rpc, as(1), { slug: "sam", name: "Sam Two" }), 409);
  await refused(saveProfile(rpc, as(1), { slug: "x", name: "" }), 400);
  await saveProfile(rpc, as(0), { slug: "sam-lee", name: "Sam Lee" });
  const a = await workspaceSlug(rpc, as(0));
  assert.match(a, /^acme-inc(-\d+)?$/);
  assert.equal(await workspaceSlug(rpc, as(1)), a);
});

test("host actions: members only, held and no-show only after the start, refused changes queue nothing", async () => {
  const { ws, users, as } = await team(2);
  const other = await team(1);
  const soon = await meeting(ws, [users[1]!], 60);
  await refused(hostAction(rpc, { ws, user: other.users[0]! }, soon, "cancel"), 404);
  await refused(hostAction(rpc, other.as(0), soon, "cancel"), 404);
  await refused(hostAction(rpc, as(1), soon, "held"), 409);
  await refused(hostAction(rpc, as(1), soon, "reopen"), 400);
  await refused(hostAction(rpc, as(1), randomUUID(), "cancel"), 404);
  assert.equal((await jobs(soon, "meeting_notify")).length + (await jobs(soon, "meeting_sync")).length, 0);
  assert.equal((await q(`select status from meetings where id = $1`, [soon]))[0].status, "booked");

  const done = await meeting(ws, [users[1]!], -90);
  assert.equal((await hostAction(rpc, as(1), done, "held")).status, "held");
  assert.equal((await hostAction(rpc, as(0), done, "no_show")).status, "no_show");
  assert.deepEqual((await jobs(done, "meeting_notify")).map((p) => p.event).sort(), ["held", "no_show"]);
  await refused(hostAction(rpc, as(1), done, "cancel"), 409);
  assert.equal((await jobs(done, "meeting_sync")).length, 0);
  const history = (await q(`select kind, detail from meeting_events where meeting_id = $1 order by id`, [done])).map((r) => r.kind);
  assert.deepEqual(history, ["held", "no_show"]);
});

test("a cancel clicked many times at once cancels once and queues one calendar cancel", async () => {
  const { ws, users, as } = await team(2);
  const m = await meeting(ws, [users[1]!], 120);
  const results = await Promise.allSettled(Array.from({ length: 6 }, (_, i) => hostAction(rpc, as(i % 2), m, "cancel", "Out sick")));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  for (const r of results) if (r.status === "rejected") assert.ok(r.reason instanceof Refused && r.reason.status === 409);
  assert.deepEqual(await jobs(m, "meeting_sync"), [{ meeting: m, action: "cancel" }]);
  assert.equal((await jobs(m, "meeting_notify")).length, 0, "meeting_sync sends the emails after the calendar work");
  const row = (await q(`select status, cancel_reason from meetings where id = $1`, [m]))[0];
  assert.deepEqual(row, { status: "canceled", cancel_reason: "Out sick" });
  // A paid meeting comes back with its payment, so the route refunds it.
  const paid = await meeting(ws, [users[1]!], 240);
  await q(`update meetings set payment = '{"intent": "pi_1", "amount": 5000}' where id = $1`, [paid]);
  assert.deepEqual((await hostAction(rpc, as(1), paid, "cancel")).payment, { intent: "pi_1", amount: 5000 });
});

test("copy times: the next free times as lines, each with its own booking link", async () => {
  const { users, as } = await team(1);
  const t = await saveType(rpc, as(0), typeBody([users[0]!], { slug: "chat", name: "Chat", settings: { ...DEFAULT_SETTINGS, notice: 0, window: 14 } }), null);
  const r = await copyTimes(rpc, as(0), { type: t.id, tz: "America/New_York", origin: "https://app.example.com", max: 5 });
  assert.equal(r.count, 5);
  const lines = r.text.split("\n");
  assert.equal(lines[0], "Chat, 30 min (times in New York)");
  const links = lines.filter((l) => l.includes("https://"));
  assert.equal(links.length, 5);
  for (const l of links) assert.match(l, /^\d{1,2}:\d{2} https:\/\/app\.example\.com\/book\/acme-inc(-\d+)?\/chat\?start=\d{4}-\d{2}-\d{2}T.*&length=30$/);
  await refused(copyTimes(rpc, as(0), { type: randomUUID(), origin: "https://x.io" }), 404);
});

test("the reschedule link is the guest's own link, from its sealed copy, for meetings still to come", async () => {
  const { ws, users, as } = await team(2);
  const secret = "k".repeat(40);
  const m = await meeting(ws, [users[1]!], 120);
  const token = "guest-token-abc";
  await q(`update meetings set token_hash = $2, token_sealed = $3 where id = $1`, [m, tokenHash(token), seal(token, secret)]);
  assert.deepEqual(await hostLink(rpc, as(0), m, "https://app.x.io/", secret), { url: `https://app.x.io/book/m/${token}` });
  assert.equal((await q(`select token_hash from meetings where id = $1`, [m]))[0].token_hash, tokenHash(token), "the guest's link keeps working");
  const done = await meeting(ws, [users[1]!], -120);
  await refused(hostLink(rpc, as(0), done, "https://app.x.io", secret), 409);
  await refused(hostLink(rpc, { ws, user: (await team(1)).users[0]! }, m, "https://app.x.io", secret), 404);
});

test("free times to pick for a one-off or a poll: a type's, or your own for a length", async () => {
  const { ws, users, as } = await team(2);
  const now = Date.now();
  const mine = await freeStarts(rpc, as(1), { length: 45, now });
  assert.equal(mine.length, 45);
  assert.ok(mine.starts.length > 0 && mine.starts.every((s) => s >= now + 60 * 60_000));
  // A meeting already booked takes its time out.
  const taken = mine.starts[0]!;
  await q(
    `insert into meetings (workspace_id, hosts, guest_email, start_at, end_at, block_start, block_end, source, token_hash) values ($1, $2, 'x@y.io', $3, $4, $3, $4, 'page', $5)`,
    [ws, [users[1]], new Date(taken).toISOString(), new Date(taken + 45 * 60_000).toISOString(), randomUUID()],
  );
  assert.ok(!(await freeStarts(rpc, as(1), { length: 45, now })).starts.includes(taken));
  await refused(freeStarts(rpc, as(1), { length: 2 }), 400);
  await q(`delete from availability where workspace_id = $1 and user_id = $2`, [ws, users[0]]);
  await refused(freeStarts(rpc, as(0), { length: 30 }), 409);
  const t = await saveType(rpc, as(1), typeBody([users[1]!], { settings: { ...DEFAULT_SETTINGS, lengths: [15, 30], notice: 0 } }), null);
  const typed = await freeStarts(rpc, as(1), { type: t.id, length: 15, now });
  assert.equal(typed.length, 15);
  assert.ok(typed.starts.length > mine.starts.length / 2);
});
