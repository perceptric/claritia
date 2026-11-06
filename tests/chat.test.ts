// Chat alerts beside Slack (docs/integrations-plan.md, Next step 5; src/lib/chat/note.ts, src/lib/sources/chat.ts):
// each tool's message within its limits, the Teams channels to pick, the Discord webhook from Add to Discord, the
// workflow step's checks, and the flaky cases the reliability rule asks for: a deleted channel fails with what to
// do, a Discord 429 waits for its Retry-After (or goes back to the queue when it's long), long answers are cut to
// the tool's limit with the link to the full fill, and nobody is pinged by an answer.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cut, discordBody, teamsHtml, type ChatNote } from "../src/lib/chat/note.ts";
import { discord, isRefusal, teams } from "../src/lib/sources/chat.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { oauthExchange } from "../src/lib/sources/oauth.ts";
import { RateLimited, type Creds, type SourceRow } from "../src/lib/sources/types.ts";
import { cleanBody, stepProblems } from "../src/lib/workflows/check.ts";

const HOOK = `https://discord.com/api/webhooks/123456789012/${"a".repeat(68)}`;
const src = (kind: string): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account: null, status: "active", settings: {}, cursors: {}, push_cursor: null });
type Call = { url: string; method: string; body: string; headers: Headers };
function net(answers: (Response | ((c: Call) => Response))[]) {
  const calls: Call[] = [];
  const list = [...answers];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? "GET", body: String(init.body ?? ""), headers: new Headers(init.headers) };
    calls.push(c);
    const a = list.length > 1 ? list.shift()! : list[0]!;
    return typeof a === "function" ? a(c) : a.clone();
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200, h: Record<string, string> = {}) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json", ...h } });
const ctx = (kind: string, creds: Creds, fetcher: typeof fetch, sleeps: number[] = []) => makeCtx({ source: src(kind), creds, fetcher, sleep: async (ms) => void sleeps.push(ms) });
const note = (rows = 3, long = 0): ChatNote => ({
  title: "New fill on Book a demo: Ada Park",
  rows: Array.from({ length: rows }, (_, i) => ({ label: `Question ${i + 1}`, value: i === 0 && long ? "x".repeat(long) : `Answer ${i + 1} @everyone` })),
  link: "https://app.tryclaritia.com/forms/f1",
});

test("Discord: one embed within its limits, cut answers, the link to the full fill, and no pings", () => {
  const b = discordBody(note(30, 5000));
  assert.deepEqual(b.allowed_mentions, { parse: [] });
  const e = b.embeds[0]!;
  assert.equal(e.url, "https://app.tryclaritia.com/forms/f1");
  assert.ok(e.fields.length <= 25);
  assert.equal(e.fields[0]!.value.length, 1024);
  assert.ok(e.fields[0]!.value.endsWith("…"));
  const total = e.title.length + e.fields.reduce((n, f) => n + f.name.length + f.value.length, 0);
  assert.ok(total <= 6000, `${total} characters`);
  assert.match(e.fields.at(-1)!.value, /more answers in Claritia/);
  assert.equal(cut("short", 10), "short");
});

test("Teams: the alert as HTML, answers escaped and cut, under its size, with the link", () => {
  const h = teamsHtml({ ...note(2, 3000), rows: [{ label: "<b>Name</b>", value: "Ada & <script>" }, { label: "Notes", value: "y".repeat(3000) }] });
  assert.ok(h.includes("&lt;b&gt;Name&lt;/b&gt;"));
  assert.ok(h.includes("Ada &amp; &lt;script&gt;"));
  assert.ok(!h.includes("y".repeat(1001)));
  assert.ok(h.includes('<a href="https://app.tryclaritia.com/forms/f1">Open in Claritia</a>'));
  assert.ok(teamsHtml(note(500)).length < 20_000);
});

test("Teams: the channels to pick as Team / Channel; a post goes to the picked channel", async () => {
  const n = net([
    (c) =>
      c.url.includes("joinedTeams")
        ? json({ value: [{ id: "t1", displayName: "Sales" }] })
        : c.url.includes("/channels?")
          ? json({ value: [{ id: "19:abc@thread.tacv2", displayName: "Leads" }] })
          : json({ id: "m1" }, 201),
  ]);
  const c = ctx("teams", { type: "oauth", access: "tok", refresh: "r", expiresAt: Date.now() + 3600_000 }, n.fetcher);
  const targets = await teams.targets!(c);
  assert.deepEqual(targets, [{ id: "t1/19:abc@thread.tacv2", name: "Sales / Leads" }]);
  await teams.alert!(c, targets[0]!, note());
  const post = n.calls.at(-1)!;
  assert.equal(post.url, "https://graph.microsoft.com/v1.0/teams/t1/channels/19%3Aabc%40thread.tacv2/messages");
  assert.equal(JSON.parse(post.body).body.contentType, "html");
});

test("flaky: a deleted Teams channel or Discord webhook fails with what to do; no channel picked never posts", async () => {
  const gone = net([json({ error: { code: "NotFound", message: "Channel not found" } }, 404)]);
  const t = ctx("teams", { type: "oauth", access: "tok", refresh: "r", expiresAt: Date.now() + 3600_000 }, gone.fetcher);
  await assert.rejects(teams.alert!(t, { id: "t1/c1", name: "Sales / Leads" }, note()), (e) => isRefusal(e) && /Sales \/ Leads is gone/.test((e as Error).message));
  await assert.rejects(teams.alert!(t, null, note()), (e) => isRefusal(e));
  assert.equal(gone.calls.length, 1);
  const d = net([json({ message: "Unknown Webhook", code: 10015 }, 404)]);
  await assert.rejects(discord.alert!(ctx("discord", { type: "key", values: { url: HOOK } }, d.fetcher), null, note()), (e) => isRefusal(e) && /Connect the channel again/.test((e as Error).message));
  await assert.rejects(discord.alert!(ctx("discord", { type: "key", values: { url: "https://evil.example/api/webhooks/1/x" } }, d.fetcher), null, note()), (e) => isRefusal(e));
});

test("flaky: a Discord 429 waits for its Retry-After and posts once; a long one goes back to the jobs queue", async () => {
  const sleeps: number[] = [];
  const n = net([json({ message: "You are being rate limited.", retry_after: 2.5 }, 429, { "retry-after": "3" }), json({ id: "m1" })]);
  await discord.alert!(ctx("discord", { type: "key", values: { url: HOOK } }, n.fetcher, sleeps), null, note());
  assert.equal(n.calls.length, 2);
  assert.ok(sleeps.includes(3000), `waited ${sleeps.join(", ")} ms`);
  assert.ok(n.calls[1]!.url.endsWith("?wait=true"));
  const long = net([json({ retry_after: 600 }, 429, { "retry-after": "600" })]);
  await assert.rejects(discord.alert!(ctx("discord", { type: "key", values: { url: HOOK } }, long.fetcher), null, note()), (e) => e instanceof RateLimited && e.retryAfterS === 600);
});

test("Add to Discord: the channel's webhook comes back with the sign-in and is kept", async () => {
  process.env.DISCORD_CLIENT_ID = "did";
  process.env.DISCORD_CLIENT_SECRET = "dsecret";
  const n = net([json({ access_token: "a", refresh_token: "r", expires_in: 604800, webhook: { id: "1", url: HOOK, channel_id: "555", guild_id: "777", name: "Claritia" } })]);
  const t = await oauthExchange("discord", "code1", "https://app.tryclaritia.com/api/sources/callback", undefined, n.fetcher);
  assert.deepEqual(t.extra, { webhook_url: HOOK, channel_id: "555", guild_id: "777", webhook_name: "Claritia" });
  const who = net([json({ id: "1", channel_id: "555", name: "Claritia" })]);
  assert.deepEqual(await discord.account(ctx("discord", { type: "oauth", access: "a", refresh: "r", expiresAt: Date.now() + 1e6, extra: t.extra }, who.fetcher)), { id: "555", label: "Claritia (Discord)" });
});

test("the workflow step: needs a connection and words, and survives a save", () => {
  assert.deepEqual(stepProblems({ id: "c1", kind: "chat", source: "", text: "" }), ["Pick Teams or Discord", "Write the message"]);
  assert.deepEqual(stepProblems({ id: "c1", kind: "chat", source: "s1", text: "Booked" }), []);
  const b = cleanBody({ trigger: { kind: "form", forms: [] }, steps: [{ id: "c1", kind: "chat", source: "s1", target: { id: "t1/c1", name: "Sales / Leads" }, text: "Booked" }], goals: [], entry: { mode: "once", gapDays: 30 } });
  assert.deepEqual(b.steps[0], { id: "c1", kind: "chat", source: "s1", target: { id: "t1/c1", name: "Sales / Leads" }, text: "Booked" });
});
