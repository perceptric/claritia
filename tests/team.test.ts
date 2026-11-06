// Invite emails (supabase/migrations/133_signup.sql, worker-intel/jobs/team.ts) and the flaky cases the reliability
// rule asks for: a "not now" from the provider goes back to the queue and then sends once, a send with no clear answer
// is never tried again, and an invite canceled before its job runs sends nothing.
import assert from "node:assert/strict";
import { test } from "node:test";
import { SendError } from "../src/lib/email/provider.ts";
import { JobError, type Job, type Rpc } from "../src/lib/jobs.ts";
import { inviteEmail } from "../src/lib/team/invite.ts";
import type { Mail, Mailer } from "../worker-intel/jobs/meetings.ts";
import { inviteSend } from "../worker-intel/jobs/team.ts";

const INVITE = "0190f5a2-1111-7000-8000-000000000001";
const job = (): Job => ({ id: "j1", workspace_id: "ws1", kind: "invite_email", key: `${INVITE}:1`, payload: { invite: INVITE, sent_for: "2026-11-06T04:00:00Z" }, attempts: 1, max_attempts: 5 });
const info = { email: "bo@lead.io", workspace: "Acme & Co", inviter: "Ada Park", inviter_email: "ada@acme.com" };
const rpcOf = (answer: unknown): { rpc: Rpc; args: Record<string, unknown>[] } => {
  const args: Record<string, unknown>[] = [];
  return { args, rpc: (async (_fn: string, a: Record<string, unknown>) => (args.push(a), { data: answer, error: null })) as Rpc };
};
function mailerOf(answers: (Error | string)[]): { mailer: Mailer; sent: Mail[] } {
  const sent: Mail[] = [];
  const list = [...answers];
  return {
    sent,
    mailer: {
      send: async (m) => {
        const a = list.shift() ?? "ok";
        if (a instanceof Error) throw a;
        sent.push(m);
        return a;
      },
    },
  };
}
const opts = (mailer: Mailer | null) => ({ mailer, base: "https://app.tryclaritia.com/", from: "meetings@mail.tryclaritia.com" });

test("the invite email: who, where, the address to sign in with, and the link", () => {
  const e = inviteEmail({ workspace: "Acme & Co", inviter: "Ada Park", email: "bo@lead.io", link: "https://app.tryclaritia.com/forms" });
  assert.equal(e.subject, "Ada Park invited you to Acme & Co on Claritia");
  assert.match(e.html, /Join Acme &amp; Co/);
  assert.match(e.html, /href="https:\/\/app\.tryclaritia\.com\/forms"/);
  assert.match(e.text, /Sign in with bo@lead\.io to join/);
});

test("an invite sends once, from Claritia, with replies to the inviter; a canceled one sends nothing", async () => {
  const r = rpcOf(info);
  const m = mailerOf(["re1"]);
  await inviteSend(r.rpc, opts(m.mailer))(job(), new AbortController().signal);
  assert.equal(m.sent.length, 1);
  assert.equal(m.sent[0]!.to, "bo@lead.io");
  assert.match(m.sent[0]!.raw, /^From: "Claritia" <meetings@mail\.tryclaritia\.com>/m);
  assert.match(m.sent[0]!.raw, /^Reply-To: ada@acme\.com/m);
  assert.deepEqual(r.args[0], { p_id: INVITE, p_sent_for: "2026-11-06T04:00:00Z" });
  const gone = mailerOf([]);
  await inviteSend(rpcOf(null).rpc, opts(gone.mailer))(job(), new AbortController().signal);
  assert.equal(gone.sent.length, 0);
});

test("flaky: a 'not now' goes back to the queue and the next try sends once; no clear answer is never sent again", async () => {
  const m = mailerOf([new SendError("busy", { status: 503, retry: true }), "re2"]);
  const run = inviteSend(rpcOf(info).rpc, opts(m.mailer));
  await assert.rejects(run(job(), new AbortController().signal), (e) => e instanceof JobError && e.retry && e.retryAfterS === 120);
  assert.equal(m.sent.length, 0);
  await run(job(), new AbortController().signal);
  assert.equal(m.sent.length, 1);
  const lost = mailerOf([new SendError("timeout", { unknown: true })]);
  await inviteSend(rpcOf(info).rpc, opts(lost.mailer))(job(), new AbortController().signal);
  assert.equal(lost.sent.length, 0);
  const bad = mailerOf([new SendError("Invalid to", { status: 422 })]);
  await assert.rejects(inviteSend(rpcOf(info).rpc, opts(bad.mailer))(job(), new AbortController().signal), (e) => e instanceof JobError && !e.retry);
  await assert.rejects(inviteSend(rpcOf(info).rpc, opts(null))(job(), new AbortController().signal), (e) => e instanceof JobError && !e.retry);
});
