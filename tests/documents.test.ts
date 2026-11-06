// Documents and signing (docs/integrations-plan.md, Next step 11; src/lib/documents/tags.ts, src/lib/sources/documents.ts):
// the tags filled (missing ones left blank and listed), each tool's requests, and the flaky cases the reliability rule
// asks for: a retry finds the document or envelope an earlier try made instead of making another, PandaDoc's draft
// is waited for before it's sent, and a template that's gone fails with what to do.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fillTags, missingNote, tagValues, type DocFill } from "../src/lib/documents/tags.ts";
import { docRequests, docusign, googleDocs, pandadoc, paragraphsOf, PD_WAIT_S } from "../src/lib/sources/documents.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, SourceRow } from "../src/lib/sources/types.ts";

const FILL: DocFill = {
  id: "11111111-1111-4111-8111-111111111111",
  at: "2026-11-06T10:00:00.000Z",
  form: "Service agreement",
  email: "ada@acme.com",
  name: "Ada Park",
  fields: [
    { label: "Company", key: "company", value: "Acme" },
    { label: "Start date", key: "start", value: "2026-12-01" },
    { label: "Notes", key: "notes", value: "" },
  ],
};
const src = (kind: string): SourceRow => ({ id: "s1", workspace_id: "ws1", kind, name: kind, account: null, status: "active", settings: {}, cursors: {}, push_cursor: null });
const oauth: Creds = { type: "oauth", access: "tok", refresh: "r", expiresAt: Date.now() + 3600_000 };
type Call = { url: string; method: string; body: string; headers: Headers };
function net(route: (c: Call) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init: RequestInit = {}) => {
    const c = { url, method: init.method ?? "GET", body: String(init.body ?? ""), headers: new Headers(init.headers) };
    calls.push(c);
    return route(c);
  }) as unknown as typeof fetch;
  return { calls, fetcher };
}
const json = (j: unknown, status = 200) => new Response(JSON.stringify(j), { status, headers: { "content-type": "application/json" } });
const ctx = (kind: string, creds: Creds, fetcher: typeof fetch) => makeCtx({ source: src(kind), creds, fetcher, sleep: async () => {} });

test("tags: labels and keys, any case and spacing, the three built in; a missing one blank and listed", () => {
  const missing = new Set<string>();
  const out = fillTags("Dear {{ name }}, {{company}} starts {{Start Date}} ({{date}}). {{Notes}} {{Budget}}", tagValues(FILL), missing);
  assert.equal(out, "Dear Ada Park, Acme starts 2026-12-01 (2026-11-06).  ");
  assert.deepEqual([...missing], ["Notes", "Budget"]);
  assert.deepEqual(missingNote(missing), ["No answer for {{Notes}}, {{Budget}}; left blank."]);
  assert.deepEqual(missingNote(new Set()), []);
});

test("the three tools are registered and in Settings › Integrations", () => {
  for (const k of ["google_docs", "docusign", "pandadoc"]) {
    assert.ok(connectorFor(k)?.document, k);
    assert.ok(CATALOG.find((e) => e.kind === k)?.docs, k);
  }
});

const TEMPLATE = {
  documentId: "tpl",
  body: {
    content: [
      { paragraph: { paragraphStyle: { namedStyleType: "HEADING_1" }, elements: [{ textRun: { content: "Agreement for {{company}}\n" } }] } },
      { paragraph: { paragraphStyle: { namedStyleType: "NORMAL_TEXT" }, elements: [{ textRun: { content: "Signed by " } }, { textRun: { content: "{{na", textStyle: { bold: true } } }, { textRun: { content: "me}}", textStyle: { italic: true } } }, { textRun: { content: ".\n" } }] } },
      { table: {} },
    ],
  },
};

test("Google Docs: the text written once, each style kept, a tag split across runs filled with the first run's style", () => {
  const missing = new Set<string>();
  const reqs = docRequests(paragraphsOf(TEMPLATE as never), tagValues(FILL), missing) as Record<string, { text?: string; range?: { startIndex: number; endIndex: number }; textStyle?: object; paragraphStyle?: object }>[];
  assert.equal(reqs[0]!.insertText!.text, "Agreement for Acme\nSigned by Ada Park.\n");
  const bold = reqs.find((r) => r.updateTextStyle)!.updateTextStyle!;
  assert.deepEqual(bold.range, { startIndex: 30, endIndex: 38 });
  assert.deepEqual(bold.textStyle, { bold: true, italic: false, underline: false });
  assert.deepEqual(reqs.find((r) => r.updateParagraphStyle)!.updateParagraphStyle!.range, { startIndex: 1, endIndex: 20 });
  assert.equal(missing.size, 0);
});

test("Google Docs: a new doc named for the form and person, marked with the fill, written; a retry finds it; a gone template", async () => {
  let made = false;
  const n = net((c) => {
    if (c.url.includes("/documents/tpl")) return json(TEMPLATE);
    if (c.url.startsWith("https://www.googleapis.com/drive/v3/files?")) return json({ files: made ? [{ id: "new1" }] : [] });
    if (c.method === "POST" && c.url === "https://docs.googleapis.com/v1/documents") return (made = true), json({ documentId: "new1" });
    if (c.url.includes("/documents/new1?fields")) return json({ body: { content: [{ endIndex: 40 }] } });
    return json({});
  });
  const c = ctx("google_docs", oauth, n.fetcher);
  const r = await googleDocs.document!(c, { id: "tpl", name: "Template" }, FILL, { retry: false });
  assert.deepEqual(r, { externalId: "new1", url: "https://docs.google.com/document/d/new1/edit", notes: [] });
  assert.equal(JSON.parse(n.calls.find((x) => x.method === "POST" && x.url.endsWith("/documents"))!.body).title, "Service agreement - Ada Park");
  assert.deepEqual(JSON.parse(n.calls.find((x) => x.method === "PATCH")!.body), { appProperties: { claritia_fill: FILL.id } });
  assert.ok(n.calls.some((x) => x.url.endsWith("/documents/new1:batchUpdate")));
  const before = n.calls.length;
  const again = await googleDocs.document!(c, { id: "tpl", name: "Template" }, FILL, { retry: true });
  assert.equal((again as { externalId: string }).externalId, "new1");
  assert.ok(!n.calls.slice(before).some((x) => x.method === "POST"), "no second doc, nothing written twice");
  const gone = net(() => json({ error: { message: "Requested entity was not found." } }, 404));
  await assert.rejects(googleDocs.document!(ctx("google_docs", oauth, gone.fetcher), { id: "tpl", name: "T" }, FILL, { retry: false }), /template doc is gone/);
});

const DS_USER = { accounts: [{ account_id: "acc1", account_name: "Acme", base_uri: "https://na3.docusign.net", is_default: true }] };

test("DocuSign: an envelope from the template to the fill's person, its tabs filled; a retry finds it by the fill", async () => {
  const n = net((c) => {
    if (c.url.includes("/oauth/userinfo")) return json(DS_USER);
    if (c.url.includes("/templates/t1/recipients")) return json({ signers: [{ roleName: "Client" }] });
    if (c.url.includes("/envelopes?")) return json({ envelopes: [{ envelopeId: "env1" }] });
    if (c.method === "POST" && c.url.endsWith("/envelopes")) return json({ envelopeId: "env1" }, 201);
    return json({});
  });
  const c = ctx("docusign", oauth, n.fetcher);
  const r = await docusign.document!(c, { id: "t1", name: "NDA" }, FILL, { retry: false });
  assert.deepEqual(r, { externalId: "env1", url: "https://app.docusign.com/documents/details/env1" });
  const post = n.calls.find((x) => x.method === "POST")!;
  assert.equal(post.url, "https://na3.docusign.net/restapi/v2.1/accounts/acc1/envelopes");
  const b = JSON.parse(post.body);
  assert.deepEqual(b.templateRoles[0], { roleName: "Client", email: "ada@acme.com", name: "Ada Park", tabs: { textTabs: [{ tabLabel: "Company", value: "Acme" }, { tabLabel: "Start date", value: "2026-12-01" }] } });
  assert.deepEqual(b.customFields.textCustomFields[0], { name: "claritia_fill", value: FILL.id, show: "false" });
  const before = n.calls.filter((x) => x.method === "POST").length;
  assert.equal(((await docusign.document!(c, { id: "t1", name: "NDA" }, FILL, { retry: true })) as { externalId: string }).externalId, "env1");
  assert.equal(n.calls.filter((x) => x.method === "POST").length, before, "no second envelope");
  assert.ok(decodeURIComponent(n.calls.find((x) => x.url.includes("/envelopes?"))!.url).includes(`custom_field=claritia_fill=${FILL.id}`));
  await assert.rejects(docusign.document!(c, { id: "t1", name: "NDA" }, { ...FILL, email: null }, { retry: false }), /no email/);
  const gone = net((x) => (x.url.includes("/oauth/userinfo") ? json(DS_USER) : json({ errorCode: "TEMPLATE_ID_INVALID" }, 404)));
  await assert.rejects(docusign.document!(ctx("docusign", oauth, gone.fetcher), { id: "t9", name: "Old" }, FILL, { retry: false }), /template is gone/);
});

test("flaky: PandaDoc's draft is waited for, then sent once; a retry finds the document by the fill", async () => {
  let status = "document.uploaded";
  let made = false;
  const n = net((c) => {
    if (c.url.includes("/documents?metadata_claritia_fill=")) return json({ results: made ? [{ id: "pd1", status }] : [] });
    if (c.url.includes("/templates/tp1/details")) return json({ roles: [{ name: "Client" }] });
    if (c.method === "POST" && c.url.endsWith("/documents")) return (made = true), json({ id: "pd1", status: "document.uploaded" }, 201);
    if (c.method === "GET" && c.url.endsWith("/documents/pd1")) return json({ id: "pd1", status });
    if (c.url.endsWith("/documents/pd1/send")) return (status = "document.sent"), json({ id: "pd1", status });
    return json({});
  });
  const c = ctx("pandadoc", { type: "key", values: { api_key: "k" } }, n.fetcher);
  assert.deepEqual(await pandadoc.document!(c, { id: "tp1", name: "Quote" }, FILL, { retry: false }), { wait: PD_WAIT_S, reason: "PandaDoc is still making the document." });
  const body = JSON.parse(n.calls.find((x) => x.method === "POST" && x.url.endsWith("/documents"))!.body);
  assert.deepEqual(body.recipients, [{ email: "ada@acme.com", first_name: "Ada", last_name: "Park", role: "Client" }]);
  assert.deepEqual(body.metadata, { claritia_fill: FILL.id });
  assert.deepEqual(body.tokens, [{ name: "Company", value: "Acme" }, { name: "Start date", value: "2026-12-01" }]);
  assert.equal(n.calls[0]!.headers.get("authorization"), "API-Key k");
  status = "document.draft";
  assert.deepEqual(await pandadoc.document!(c, { id: "tp1", name: "Quote" }, FILL, { retry: true }), { externalId: "pd1", url: "https://app.pandadoc.com/a/#/documents/pd1" });
  assert.equal(n.calls.filter((x) => x.method === "POST" && x.url.endsWith("/documents")).length, 1, "made once");
  assert.equal(n.calls.filter((x) => x.url.endsWith("/send")).length, 1, "sent once");
  await pandadoc.document!(c, { id: "tp1", name: "Quote" }, FILL, { retry: true });
  assert.equal(n.calls.filter((x) => x.url.endsWith("/send")).length, 1, "a sent document isn't sent again");
  const gone = net((x) => (x.url.includes("metadata_claritia_fill") ? json({ results: [] }) : json({ detail: "Not found" }, 404)));
  await assert.rejects(pandadoc.document!(ctx("pandadoc", { type: "key", values: { api_key: "k" } }, gone.fetcher), { id: "tp9", name: "Old" }, FILL, { retry: false }), /template is gone/);
});
