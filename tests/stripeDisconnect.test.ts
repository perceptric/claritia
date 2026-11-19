// Stripe › Disconnect (Settings › Integrations; src/lib/meetings/payDisconnect.ts, payment_account_disconnect in
// 170_plan_locks.sql): one call forgets the account and turns off the paid meeting types, tried again on a hiccup and
// safe to repeat; a checkout already open when the team disconnects still confirms its meeting or fill, on the
// account it was opened on, and nothing else does.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { handleFormPayEvent } from "../src/lib/forms/pay.ts";
import type { Rpc } from "../src/lib/jobs.ts";
import { disconnectStripe } from "../src/lib/meetings/payDisconnect.ts";
import { handlePayEvent, type PayStripe } from "../src/lib/meetings/pay.ts";

const WS = "0192f3a1-0000-7000-8000-0000000000aa";
const T1 = "0192f3a1-0000-7000-8000-0000000000c1";
const now = () => Promise.resolve();

test("disconnect forgets the account and answers the types it turned off; a second call finds nothing", async () => {
  let acct: string | null = "acct_1";
  const calls: Record<string, unknown>[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, ...args });
    const was = acct;
    acct = null;
    return { data: { account: was, types: was ? [T1] : [] }, error: null };
  };
  assert.deepEqual(await disconnectStripe(rpc, WS), { account: "acct_1", types: [T1] });
  assert.deepEqual(await disconnectStripe(rpc, WS), { account: null, types: [] });
  assert.deepEqual(calls[0], { fn: "payment_account_disconnect", p_ws: WS });
});

test("flaky: a timeout and a dropped connection are tried again with growing waits, and the third try lands", async () => {
  const waits: number[] = [];
  let n = 0;
  const rpc: Rpc = async () => {
    n++;
    if (n === 1) return { data: null, error: { message: "canceling statement due to statement timeout" } };
    if (n === 2) throw new Error("fetch failed");
    return { data: { account: "acct_1", types: [] }, error: null };
  };
  assert.deepEqual(await disconnectStripe(rpc, WS, { wait: async (ms) => void waits.push(ms) }), { account: "acct_1", types: [] });
  assert.equal(n, 3);
  assert.deepEqual(waits, [250, 750]);
});

test("a refusal that isn't a hiccup isn't tried again, and one that stays down gives up after four tries", async () => {
  let n = 0;
  const denied: Rpc = async () => (n++, { data: null, error: { message: "permission denied for function payment_account_disconnect" } });
  await assert.rejects(disconnectStripe(denied, WS, { wait: now }), /permission denied/);
  assert.equal(n, 1);
  let m = 0;
  const down: Rpc = async () => (m++, { data: null, error: { message: "503 Service Unavailable" } });
  await assert.rejects(disconnectStripe(down, WS, { wait: now }), /503/);
  assert.equal(m, 4);
});

test("the database turns off only active Stripe-paid types, leaves PayPal and Square, and keeps booked meetings", () => {
  const sql = readFileSync(new URL("../supabase/migrations/170_plan_locks.sql", import.meta.url), "utf8");
  const fn = sql.slice(sql.indexOf("function public.payment_account_disconnect"));
  assert.match(fn, /delete from payment_accounts where workspace_id = p_ws/);
  assert.match(fn, /update meeting_types set active = false/);
  assert.match(fn, /coalesce\(settings -> 'price' ->> 'provider', 'stripe'\) = 'stripe'/);
  assert.doesNotMatch(fn, /update meetings|delete from meetings|meeting_status/, "no meeting is touched");
});

// A checkout open as the team disconnects ----------------------------------------------------------------------------

const MID = "0192f3a1-0000-7000-8000-0000000000d1";
const noStripe: PayStripe = { checkout: async () => ({ id: "x", url: "x" }), refund: async () => "re_1" };

function meetingDb(o: { wsAccount: string | null; session: string; account: string }) {
  const done: string[] = [];
  const rpc: Rpc = async (fn) => {
    done.push(fn);
    if (fn === "book_meeting")
      return {
        data: {
          meeting: { id: MID, workspace_id: WS, status: "pending_payment", guest_email: "ana@acme.com", guest_name: "Ana", guest_tz: "UTC", payment: { session: o.session, account: o.account, status: "open" } },
          ws: { id: WS, pay: o.wsAccount ? { account: o.wsAccount, ready: true } : null },
          type: null,
        },
        error: null,
      };
    if (fn === "meeting_pay") return { data: "booked", error: null };
    return { data: null, error: null };
  };
  return { rpc, done };
}
const paidEvent = (account: string, session = "cs_1") => ({ type: "checkout.session.completed", account, data: { object: { id: session, payment_status: "paid", payment_intent: "pi_1", metadata: { meeting_id: MID, workspace_id: WS } } } });

test("a guest who paid as the team disconnected still gets the meeting, on the account the checkout was opened on", async () => {
  const db = meetingDb({ wsAccount: null, session: "cs_1", account: "acct_1" });
  const r = await handlePayEvent(db.rpc, noStripe, paidEvent("acct_1") as never);
  assert.deepEqual(r, { ok: true, did: "booked" });
  assert.ok(db.done.includes("meeting_pay"));
});

test("with Stripe disconnected, an event from another account or another session books nothing", async () => {
  const other = meetingDb({ wsAccount: null, session: "cs_1", account: "acct_1" });
  assert.equal((await handlePayEvent(other.rpc, noStripe, paidEvent("acct_2") as never)).ok, false);
  assert.ok(!other.done.includes("meeting_pay"));
  const stale = meetingDb({ wsAccount: null, session: "cs_1", account: "acct_1" });
  assert.equal((await handlePayEvent(stale.rpc, noStripe, paidEvent("acct_1", "cs_old") as never)).ok, false);
  assert.ok(!stale.done.includes("meeting_pay"));
  const connected = meetingDb({ wsAccount: "acct_2", session: "cs_1", account: "acct_1" });
  assert.equal((await handlePayEvent(connected.rpc, noStripe, paidEvent("acct_1") as never)).ok, false, "a newly connected account wins over an old checkout's");
});

test("a form fill paid as the team disconnected is marked paid only for its own checkout", async () => {
  const sid = "0192f3a1-0000-7000-8000-0000000000bb";
  let payment: Record<string, unknown> = { status: "open", session: "cs_9", account: "acct_1" };
  const rpc: Rpc = async (fn, args) => {
    if (fn === "submission_payment") payment = { ...payment, ...(args.p_patch as object) };
    return { data: payment, error: null };
  };
  const ev = (account: string, session = "cs_9") => ({ type: "checkout.session.completed", account, data: { object: { id: session, payment_status: "paid", payment_intent: "pi_9", metadata: { submission_id: sid, workspace_id: WS } } } });
  const gone = async () => null;
  assert.equal(await handleFormPayEvent(rpc, ev("acct_2"), gone), "skipped");
  assert.equal(await handleFormPayEvent(rpc, ev("acct_1", "cs_other"), gone), "skipped");
  assert.equal(payment.status, "open");
  assert.equal(await handleFormPayEvent(rpc, ev("acct_1"), gone), "paid");
  assert.equal(payment.status, "paid");
});
