// Meeting emails' health (src/lib/meetings/mailHealth.ts): a failed email job or an email the provider refused warns
// in Meetings with the worker's own reason, and shows on its meeting. The flaky cases: a failure older than the last
// email that went out (fixed since, no warning), a read that fails (no warning, never a false alarm), and another
// workspace's rows (never shown).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { mailHealth } from "../src/lib/meetings/mailHealth.ts";

type Row = Record<string, unknown>;
const NOW = Date.UTC(2026, 10, 3, 12);
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString().replace("Z", "+00:00");

/** A fake of the few PostgREST reads mailHealth makes: eq, in, gte, order, limit. `fail` makes a table's read fail. */
function fakeDb(tables: { jobs?: Row[]; meeting_mails?: Row[] }, fail: string[] = []): SupabaseClient {
  return {
    from(table: "jobs" | "meeting_mails") {
      const where: ((r: Row) => boolean)[] = [];
      let lim = 1000;
      let by = "";
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (where.push((r) => r[c] === v), q),
        in: (c: string, v: unknown[]) => (where.push((r) => v.includes(r[c])), q),
        gte: (c: string, v: string) => (where.push((r) => Date.parse(String(r[c])) >= Date.parse(v)), q),
        order: (c: string) => ((by = c), q),
        limit: (n: number) => ((lim = n), q),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve(
            fail.includes(table)
              ? { data: null, error: { message: "canceling statement due to statement timeout" } }
              : { data: (tables[table] ?? []).filter((r) => where.every((w) => w(r))).sort((a, b) => (by ? Date.parse(String(b[by])) - Date.parse(String(a[by])) : 0)).slice(0, lim), error: null },
          ).then(res),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

const WS = "11111111-1111-4111-8111-111111111111";
const M1 = "22222222-2222-4222-8222-222222222222";
const job = (minAgo: number, o: Row = {}): Row => ({ workspace_id: WS, kind: "meeting_notify", status: "failed", payload: { meeting: M1, event: "booked" }, error: "Resend isn't set up on the worker (RESEND_API_KEY).", created_at: iso(minAgo + 1), finished_at: iso(minAgo), ...o });
const mail = (minAgo: number, o: Row = {}): Row => ({ workspace_id: WS, meeting_id: M1, kind: "confirm", to_email: "dana@acme.com", status: "failed", error: "Domain not verified", created_at: iso(minAgo), ...o });

test("a failed email job warns with the worker's reason and shows on its meeting", async () => {
  const h = await mailHealth(fakeDb({ jobs: [job(5)] }), WS, NOW);
  assert.equal(h.problem?.error, "Resend isn't set up on the worker (RESEND_API_KEY).");
  assert.equal(h.problem?.count, 1);
  assert.deepEqual(h.meetings[M1]?.map((f) => f.what), ["Confirmation and host note"]);
});

test("an email the provider refused shows who it was to", async () => {
  const h = await mailHealth(fakeDb({ meeting_mails: [mail(3)] }), WS, NOW);
  assert.equal(h.problem?.error, "Domain not verified");
  assert.deepEqual(h.meetings[M1], [{ what: "Confirmation", to: "dana@acme.com", error: "Domain not verified", at: iso(3) }]);
});

test("flaky: a failure older than the last email that went out is over: no warning, the meeting still shows it", async () => {
  const h = await mailHealth(fakeDb({ jobs: [job(120)], meeting_mails: [mail(10, { status: "sent", error: null, kind: "reminder" })] }), WS, NOW);
  assert.equal(h.problem, null);
  assert.equal(h.meetings[M1]?.length, 1);
});

test("flaky: the reads fail: nothing warns", async () => {
  const h = await mailHealth(fakeDb({ jobs: [job(5)], meeting_mails: [mail(3)] }, ["jobs", "meeting_mails"]), WS, NOW);
  assert.deepEqual(h, { problem: null, meetings: {} });
});

test("another workspace's failures, other job kinds, done jobs and week-old ones never show", async () => {
  const h = await mailHealth(fakeDb({ jobs: [job(5, { workspace_id: "33333333-3333-4333-8333-333333333333" }), job(5, { kind: "meeting_sync" }), job(5, { status: "done" }), job(60 * 24 * 8)] }), WS, NOW);
  assert.deepEqual(h, { problem: null, meetings: {} });
});

test("several failures: the newest reason, the count since the last sent email", async () => {
  const h = await mailHealth(fakeDb({ jobs: [job(30), job(4, { kind: "meeting_remind", error: "Rate limited" })], meeting_mails: [mail(50, { status: "sent", error: null })] }), WS, NOW);
  assert.equal(h.problem?.error, "Rate limited");
  assert.equal(h.problem?.count, 2);
  assert.deepEqual(h.meetings[M1]?.map((f) => f.what), ["Reminder", "Confirmation and host note"]);
});
