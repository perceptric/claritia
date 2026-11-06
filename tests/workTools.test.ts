// Work tools (docs/integrations-plan.md, Next step 10; src/lib/sources/work.ts): each fill is one item in the place
// picked, with every answer, the fill's id and a link. The flaky cases the reliability rule asks for: a run again
// after a timeout finds the item and makes no second one, a deleted list or board fails with what to do, and a 429
// is tried again.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, FillRow, SourceRow } from "../src/lib/sources/types.ts";
import { clickupWork, fdTag, freshdesk, linear, mondayWork, shortId, smartsuite, trelloWork, workText, workTitle, zendesk, WORK_TOOLS } from "../src/lib/sources/work.ts";

const FILL = "8f1c2d3e-4a5b-4c6d-8e7f-001122334455";
const row: FillRow = { id: FILL, at: "2026-11-06T12:00:00.000Z", form: "Book a demo", cells: [{ name: "Work email", value: "ada@acme.com" }, { name: "Notes", value: "Hi there" }, { name: "Empty", value: "" }] };
const o = { retry: false, person: { email: "ada@acme.com", name: "Ada Park" }, link: "https://app.tryclaritia.com/forms/f1" };
const src = (kind: string, account: string | null = null): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account, status: "active", settings: {}, cursors: {}, push_cursor: null });
type Call = { url: string; method: string; body: string; headers: Headers };
function tool(answer: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? "GET", body: String(init.body ?? ""), headers: new Headers(init.headers) };
    calls.push(c);
    return answer(c);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
const ctx = (kind: string, creds: Creds, fetcher: typeof fetch, account: string | null = null, sleeps: number[] = []) =>
  makeCtx({ source: src(kind, account), creds, fetcher, sleep: async (ms) => void sleeps.push(ms) });
const key = (values: Record<string, string>): Creds => ({ type: "key", values });

test("registered, in the Sync tab as places to pick, each fill's title and text with its id and link", () => {
  for (const c of WORK_TOOLS) {
    assert.equal(connectorFor(c.kind), c);
    const e = CATALOG.find((x) => x.kind === c.kind);
    assert.ok(e?.rows && e.work && e.pushes, c.kind);
  }
  assert.ok(connectorFor("intercom")?.append);
  assert.equal(workTitle(row, o), `Book a demo: Ada Park (#${shortId(FILL)})`);
  const t = workText(row, o);
  assert.match(t, /\*\*Work email\*\*: ada@acme\.com/);
  assert.ok(!t.includes("Empty"));
  assert.match(t, new RegExp(`Fill ID: ${FILL}`));
  assert.match(t, /\[Open in Claritia\]\(https:\/\/app\.tryclaritia\.com\/forms\/f1\)/);
});

test("Linear: the teams to pick; an issue in the team; a run again finds it by its Fill ID and makes none", async () => {
  let made = 0;
  const t = tool((c) => {
    const q = JSON.parse(c.body).query as string;
    if (q.includes("teams")) return json({ data: { teams: { nodes: [{ id: "t1", name: "Support", key: "SUP" }] } } });
    if (q.includes("issues(")) return json({ data: { issues: { nodes: made ? [{ id: "i1", url: "https://linear.app/acme/issue/SUP-1" }] : [] } } });
    made++;
    return json({ data: { issueCreate: { success: true, issue: { id: "i1", url: "https://linear.app/acme/issue/SUP-1" } } } });
  });
  const c = ctx("linear", { type: "oauth", access: "tok", refresh: null, expiresAt: Date.now() + 1e6 }, t.fetcher);
  assert.deepEqual(await linear.targets!(c), [{ id: "t1", name: "Support (SUP)" }]);
  assert.deepEqual(await linear.append!(c, { id: "t1", name: "Support" }, row, o), { externalId: "i1", url: "https://linear.app/acme/issue/SUP-1" });
  const create = JSON.parse(t.calls.at(-1)!.body);
  assert.equal(create.variables.i.teamId, "t1");
  assert.equal(t.calls.at(-1)!.headers.get("authorization"), "Bearer tok");
  assert.deepEqual(await linear.append!(c, { id: "t1", name: "Support" }, row, { ...o, retry: true }), { externalId: "i1", url: "https://linear.app/acme/issue/SUP-1" });
  assert.equal(made, 1, "a run again makes no second issue");
  const keyed = tool(() => json({ data: { issueCreate: { success: true, issue: { id: "i2", url: "u" } } } }));
  await linear.append!(ctx("linear", key({ api_key: "lin_api_x" }), keyed.fetcher), { id: "t1", name: "S" }, row, o);
  assert.equal(keyed.calls[0]!.headers.get("authorization"), "lin_api_x", "a pasted key goes as it is");
});

test("Trello: a card in the list; a run again finds it; a deleted list fails with what to do", async () => {
  let cards: { id: string; desc: string; shortUrl: string }[] = [];
  const t = tool((c) => {
    if (c.url.includes("/lists/gone/")) return new Response("invalid id", { status: 400 });
    if (c.url.includes("/cards?") && c.method === "POST") {
      const p = new URL(c.url).searchParams;
      if (p.get("idList") === "gone") return new Response("model not found", { status: 404 });
      cards = [{ id: "c1", desc: p.get("desc")!, shortUrl: "https://trello.com/c/abc" }];
      return json({ id: "c1", shortUrl: "https://trello.com/c/abc" });
    }
    return json(cards);
  });
  const c = ctx("trello", key({ api_key: "k", token: "tk" }), t.fetcher);
  assert.deepEqual(await trelloWork.append!(c, { id: "l1", name: "Inbox" }, row, o), { externalId: "c1", url: "https://trello.com/c/abc" });
  const u = new URL(t.calls[0]!.url);
  assert.deepEqual([u.searchParams.get("idList"), u.searchParams.get("key"), u.searchParams.get("token")], ["l1", "k", "tk"]);
  assert.deepEqual(await trelloWork.append!(c, { id: "l1", name: "Inbox" }, row, { ...o, retry: true }), { externalId: "c1", url: "https://trello.com/c/abc" });
  assert.equal(t.calls.filter((x) => x.method === "POST").length, 1);
  await assert.rejects(trelloWork.append!(c, { id: "gone", name: "Old" }, row, o), /Trello list is gone\. Pick another one in the form's Sync tab/);
});

test("ClickUp: a task with the answers; its token as it is; a run again finds it by its title", async () => {
  let tasks: { id: string; url: string; name: string }[] = [];
  const t = tool((c) => {
    if (c.method === "POST") {
      tasks = [{ id: "86a1", url: "https://app.clickup.com/t/86a1", name: JSON.parse(c.body).name }];
      return json(tasks[0]);
    }
    return json({ tasks });
  });
  const c = ctx("clickup", key({ api_key: "pk_1" }), t.fetcher);
  assert.deepEqual(await clickupWork.append!(c, { id: "900", name: "Leads" }, row, o), { externalId: "86a1", url: "https://app.clickup.com/t/86a1" });
  assert.equal(t.calls[0]!.headers.get("authorization"), "pk_1");
  assert.match(JSON.parse(t.calls[0]!.body).markdown_description, /Fill ID/);
  await clickupWork.append!(c, { id: "900", name: "Leads" }, row, { ...o, retry: true });
  assert.equal(t.calls.filter((x) => x.method === "POST").length, 1);
});

test("monday.com: an item named for the fill with the answers as its update; a deleted board fails with what to do; the link", async () => {
  let made = false;
  const t = tool((c) => {
    const q = JSON.parse(c.body).query as string;
    if (q.includes("items_page_by_column_values")) return json({ data: { items_page_by_column_values: { items: made ? [{ id: "55" }] : [] } } });
    if (q.includes("create_item")) {
      if (JSON.parse(c.body).variables.b === "404") return json({ errors: [{ message: "Board not found" }] });
      made = true;
      return json({ data: { create_item: { id: "55" } } });
    }
    return json({ data: { create_update: { id: "u1" } } });
  });
  const c = ctx("monday_work", key({ api_key: "k" }), t.fetcher, "acme");
  assert.deepEqual(await mondayWork.append!(c, { id: "77", name: "Requests" }, row, o), { externalId: "77:55" });
  assert.ok(t.calls.some((x) => x.body.includes("create_update")));
  assert.deepEqual(await mondayWork.append!(c, { id: "77", name: "Requests" }, row, { ...o, retry: true }), { externalId: "77:55" });
  assert.equal(t.calls.filter((x) => x.body.includes("create_item")).length, 1);
  await assert.rejects(mondayWork.append!(c, { id: "404", name: "Old" }, row, o), /monday\.com board is gone/);
  assert.equal(mondayWork.link!(src("monday_work", "acme"), "77:55", () => ""), "https://acme.monday.com/boards/77/pulses/55");
});

test("SmartSuite: a record titled for the fill, the answers in the table's long text field", async () => {
  const t = tool((c) => (c.url.endsWith("/records/") ? json({ id: "r1" }) : json({ structure: [{ slug: "s1title", field_type: "textfield" }, { slug: "notes", field_type: "textareafield" }] })));
  const c = ctx("smartsuite", key({ api_key: "k", workspace: "w9" }), t.fetcher);
  assert.deepEqual(await smartsuite.append!(c, { id: "app1", name: "Requests" }, row, o), { externalId: "r1" });
  const made = JSON.parse(t.calls.at(-1)!.body);
  assert.equal(made.title, workTitle(row, o));
  assert.match(made.notes, /Work email: ada@acme\.com/);
  assert.equal(t.calls[0]!.headers.get("account-id"), "w9");
  assert.equal(t.calls[0]!.headers.get("authorization"), "Token k");
});

test("Zendesk: a ticket from the person with the fill as its external id; a run again finds it; the link", async () => {
  let ticket: number | null = null;
  const t = tool((c) => {
    if (c.url.includes("external_id=")) return json({ tickets: ticket ? [{ id: ticket }] : [] });
    ticket = 31;
    return json({ ticket: { id: 31 } }, 201);
  });
  const c = ctx("zendesk", key({ subdomain: "https://Acme.zendesk.com/", email: "agent@acme.com", api_token: "zt" }), t.fetcher, "acme");
  assert.deepEqual(await zendesk.append!(c, { id: "123", name: "Sales" }, row, o), { externalId: "31" });
  const body = JSON.parse(t.calls[0]!.body).ticket;
  assert.deepEqual([body.external_id, body.requester.email, body.group_id], [FILL, "ada@acme.com", 123]);
  assert.equal(t.calls[0]!.url, "https://acme.zendesk.com/api/v2/tickets.json");
  assert.equal(t.calls[0]!.headers.get("authorization"), `Basic ${Buffer.from("agent@acme.com/token:zt").toString("base64")}`);
  assert.deepEqual(await zendesk.append!(c, { id: "123", name: "Sales" }, row, { ...o, retry: true }), { externalId: "31" });
  assert.equal(t.calls.filter((x) => x.method === "POST").length, 1);
  assert.equal(zendesk.link!(src("zendesk", "acme"), "31", () => ""), "https://acme.zendesk.com/agent/tickets/31");
});

test("Freshdesk: a ticket tagged with the fill, found by its tag on a run again; it needs the person's email", async () => {
  let made = false;
  const t = tool((c) => {
    if (c.url.includes("/search/tickets")) return json({ results: made ? [{ id: 9 }] : [] });
    made = true;
    return json({ id: 9 }, 201);
  });
  const c = ctx("freshdesk", key({ domain: "acme.freshdesk.com", api_key: "fk" }), t.fetcher, "acme.freshdesk.com");
  assert.deepEqual(await freshdesk.append!(c, { id: "any", name: "No group" }, row, o), { externalId: "9" });
  const body = JSON.parse(t.calls[0]!.body);
  assert.deepEqual([body.email, body.tags, body.group_id], ["ada@acme.com", [fdTag(FILL)], undefined]);
  assert.deepEqual(await freshdesk.append!(c, { id: "any", name: "No group" }, row, { ...o, retry: true }), { externalId: "9" });
  assert.ok(decodeURIComponent(t.calls.at(-1)!.url).includes(`tag:'${fdTag(FILL)}'`));
  await assert.rejects(freshdesk.append!(c, { id: "any", name: "x" }, row, { ...o, person: null }), /needs the person's email/);
  assert.equal(freshdesk.link!(src("freshdesk", "acme.freshdesk.com"), "9", () => ""), "https://acme.freshdesk.com/a/tickets/9");
});

test("Intercom: the person found by email (or made a lead), and a conversation from them per fill", async () => {
  const t = tool((c) => (c.url.endsWith("/contacts/search") ? json({ data: [] }) : c.url.endsWith("/contacts") ? json({ id: "ct1" }) : json({ conversation_id: "cv1" })));
  const ic = connectorFor("intercom")!;
  const c = ctx("intercom", key({ api_key: "ic" }), t.fetcher, "app9");
  assert.deepEqual(await ic.append!(c, { id: "inbox", name: "Inbox" }, row, o), { externalId: "cv1" });
  assert.equal(JSON.parse(t.calls[1]!.body).role, "lead");
  assert.deepEqual(JSON.parse(t.calls[2]!.body).from, { type: "contact", id: "ct1" });
  assert.equal(ic.link!(src("intercom", "app9"), "cv1", () => ""), "https://app.intercom.com/a/apps/app9/inbox/inbox/conversation/cv1");
});

test("flaky: a 429 waits for Retry-After and the item is made once", async () => {
  const sleeps: number[] = [];
  let tries = 0;
  const t = tool(() => (++tries === 1 ? new Response("{}", { status: 429, headers: { "retry-after": "2" } }) : json({ ticket: { id: 40 } }, 201)));
  const c = ctx("zendesk", key({ subdomain: "acme", email: "a@acme.com", api_token: "t" }), t.fetcher, "acme", sleeps);
  assert.deepEqual(await zendesk.append!(c, { id: "any", name: "No group" }, row, o), { externalId: "40" });
  assert.equal(t.calls.length, 2);
  assert.ok(sleeps.includes(2000));
});
