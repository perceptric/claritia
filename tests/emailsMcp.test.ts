// The email tools on the MCP server (src/lib/emails/mcp.ts, docs/email-studio-plan.md Part 9), with a stand-in
// database: a send needs an owner's key and stops at 500 people; a sent email can't change; the send carries the key
// owner, the list, the topic and the time; a database refusal comes back as words.
import assert from "node:assert/strict";
import { test } from "node:test";
import { newBlock, newSection, readEmailDoc, type Block } from "../src/lib/design/email/doc.ts";

const { emailTools } = await import("../src/lib/emails/mcp.ts");

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const L1 = "11111111-1111-4111-8111-111111111111";
const E1 = "22222222-2222-4222-8222-222222222222";
const E2 = "33333333-3333-4333-8333-333333333333";
const OWNER = "44444444-4444-4444-8444-444444444444";
const ADMIN = "55555555-5555-4555-8555-555555555555";

/** A filled email: words, a button with a real link, the footer. */
const filled = () => {
  const text = { ...newBlock("text"), html: "<p>Spring is here and the workshop opens next week. Bring a laptop and your questions about the garden.</p>" } as Block;
  const button = { ...newBlock("button"), label: "Book a time", url: "https://acme.com/book" } as Block;
  return { ...readEmailDoc({}), sections: [newSection([text, button]), newSection([newBlock("footer")])] };
};

function world(o: { ready?: number; refuse?: string } = {}) {
  const db: Record<string, Row[]> = {
    api_keys: [{ id: "k-owner", created_by: OWNER }, { id: "k-admin", created_by: ADMIN }],
    workspace_members: [{ workspace_id: "ws1", user_id: OWNER, role: "owner" }, { workspace_id: "ws1", user_id: ADMIN, role: "admin" }],
    emails: [
      { id: E1, workspace_id: "ws1", kind: "broadcast", name: "Spring", subject: "Spring reset", status: "draft", doc: filled() },
      { id: E2, workspace_id: "ws1", kind: "broadcast", name: "Winter", subject: "Winter", status: "sent", doc: null },
      { id: "e-other", workspace_id: "ws2", kind: "broadcast", name: "Secret", subject: "x", status: "draft", doc: null },
    ],
    lists: [{ id: L1, workspace_id: "ws1", name: "Workshop" }],
    topics: [],
    brand_kits: [],
    send_settings: [{ workspace_id: "ws1", from_email: "news@acme.com", paused: false }],
  };
  const calls: { fn: string; args: Row }[] = [];
  function query(table: string) {
    const filters: ((r: Row) => boolean)[] = [];
    let single = false;
    const q: Row = {
      select: () => q,
      order: () => q,
      limit: () => q,
      neq: (k: string, v: unknown) => (filters.push((r) => r[k] !== v), q),
      eq: (k: string, v: unknown) => (filters.push((r) => r[k] === v), q),
      in: (k: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[k])), q),
      ilike: (k: string, v: string) => (filters.push((r) => String(r[k]).toLowerCase() === v.replace(/\\(.)/g, "$1").toLowerCase()), q),
      maybeSingle: () => ((single = true), q),
      then: (ok: (v: unknown) => unknown) => {
        const rows = (db[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve({ data: single ? (rows[0] ?? null) : rows, error: null }).then(ok);
      },
    };
    return q;
  }
  const sb = {
    from: query,
    rpc: async (fn: string, args: Row) => {
      calls.push({ fn, args });
      if (fn === "email_audience_counts") return { data: { total: (o.ready ?? 40) + 2, ready: o.ready ?? 40 }, error: null };
      if (fn === "email_test_ready") return { data: { from_email: "news@acme.com", paused: false, verified: true }, error: null };
      if (fn === "email_campaign_send") return o.refuse ? { data: null, error: { message: `P0001: ${o.refuse}` } } : { data: { queued: o.ready ?? 40, status: args.p_values.send_at ? "scheduled" : "sending" }, error: null };
      return { data: null, error: { message: `unexpected ${fn}` } };
    },
  };
  const ctx = (key: string) => ({ sb, workspaceId: "ws1", keyId: key }) as never;
  return { calls, ctx, emails: db.emails! };
}
const tool = (name: string) => emailTools.find((t) => t.name === name)!;
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return (e as Error).message;
  }
  assert.fail("expected a refusal");
};

test("a send needs an owner's key and stops at 500 people for a person to confirm", async () => {
  const w = world();
  assert.match(await refusal(tool("schedule_campaign").run(w.ctx("k-admin"), { email: "Spring" })), /owner/);
  const big = world({ ready: 501 });
  assert.match(await refusal(tool("schedule_campaign").run(big.ctx("k-owner"), { email: "Spring" })), /501 people.*confirms it in the app: https:\/\/app\.tryclaritia\.com\/emails\/campaigns\//);
  assert.ok(!w.calls.concat(big.calls).some((c) => c.fn === "email_campaign_send"), "nothing queued");
});

test("an owner's send goes to the list on time, as the key's owner, with the built email", async () => {
  const w = world();
  const r = await tool("schedule_campaign").run(w.ctx("k-owner"), { email: "spring", list: "Workshop", send_at: "2099-01-01T10:00:00Z" }).catch((e) => e);
  // A year out is refused before anything is read.
  assert.match((r as Error).message, /within a year/);
  const at = new Date(Date.now() + 86_400_000).toISOString();
  const ok = await tool("schedule_campaign").run(w.ctx("k-owner"), { email: E1, list: L1, send_at: at });
  const send = w.calls.find((c) => c.fn === "email_campaign_send")!;
  assert.equal(send.args.p_user, OWNER);
  assert.equal(send.args.p_email, E1);
  assert.deepEqual([send.args.p_values.lists, send.args.p_values.everyone, send.args.p_values.send_at], [[L1], false, at]);
  assert.match(send.args.p_values.html, /<html/i);
  assert.equal(send.args.p_values.subject, "Spring reset");
  assert.match(ok.text, /scheduled/);
});

test("a sent email can't change or send again; another workspace's email isn't found; a database refusal reads as words", async () => {
  const w = world();
  assert.match(await refusal(tool("change_email").run(w.ctx("k-owner"), { email: "Winter", change: "Shorter" })), /was sent/);
  assert.match(await refusal(tool("schedule_campaign").run(w.ctx("k-owner"), { email: "Winter" })), /isn't a draft/);
  assert.match(await refusal(tool("schedule_campaign").run(w.ctx("k-owner"), { email: "Secret" })), /not found/);
  assert.match(await refusal(tool("schedule_campaign").run(w.ctx("k-owner"), { email: "Spring", list: "Nope" })), /List Nope not found/);
  // A template sent as it comes stops at the send check: its links aren't filled in.
  const raw = world();
  raw.emails[0]!.doc = (await import("../src/lib/design/email/library.ts")).EMAIL_TEMPLATES[0]!.make();
  assert.match(await refusal(tool("schedule_campaign").run(raw.ctx("k-owner"), { email: "Spring" })), /Fill in|working link/);
  const r = world({ refuse: "Pick who gets it" });
  assert.equal(await refusal(tool("schedule_campaign").run(r.ctx("k-owner"), { email: "Spring" })), "Pick who gets it");
});
