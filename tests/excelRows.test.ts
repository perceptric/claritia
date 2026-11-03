// Excel Online as a form destination (docs/integrations-plan.md step 2c): a row per fill in the ClaritiaFills table on
// its own sheet. The flaky cases: two first fills making the table at once; another fill adding the same column at
// the same moment; an Excel that names a new column Column4; a run again after a timeout; a value that looks like a
// formula; the tool down, rate limited or signed out.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { test } from "node:test";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { cell, excel, shareId, workbookFromLink } from "../src/lib/sources/excel.ts";
import { OAUTH } from "../src/lib/sources/oauth.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import type { Creds, FillRow, RowTarget, SourceRow } from "../src/lib/sources/types.ts";

const SRC = "0190a0b0-0000-7000-8000-00000000000e";
const OAUTH_CREDS: Creds = { type: "oauth", access: "tok", refresh: null, expiresAt: Date.now() + 3_600_000 };
const source: SourceRow = { id: SRC, workspace_id: "w", kind: "excel", name: "Excel Online", account: "a", status: "active", settings: {}, cursors: {}, push_cursor: null };
type Call = { method: string; url: string; body: Record<string, unknown> | null };
function tool(answer: (c: Call) => unknown) {
  const calls: Call[] = [];
  const fetcher = (async (url: string, init?: RequestInit) => {
    const c = { method: init?.method ?? "GET", url: decodeURIComponent(String(url)), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null };
    calls.push(c);
    const a = answer(c);
    if (a && typeof a === "object" && "status" in (a as object) && typeof (a as { status: unknown }).status === "number") {
      const { status, body } = a as { status: number; body?: unknown };
      return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(a ?? {}), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}
const ctxFor = (answer: (c: Call) => unknown) => {
  const t = tool(answer);
  return { ctx: makeCtx({ source, creds: OAUTH_CREDS, fetcher: t.fetcher, sleep: async () => {} }), calls: t.calls };
};
const T: RowTarget = { id: "b!01ABC", name: "Leads", url: "https://acme-my.sharepoint.com/:x:/g/personal/leads.xlsx" };
const BASE = "https://graph.microsoft.com/v1.0/drives/b/items/01ABC/workbook";
const ROW: FillRow = { id: "0190a0b0-0000-7000-8000-0000000000f3", at: "2026-11-03T10:15:00.000Z", form: "Demo request", cells: [{ name: "Work email", value: "ana@acme.com" }, { name: "Notes", value: "=HYPERLINK(\"http://x\")" }] };
const HEAD = ["Sent at", "Fill ID", "Form", "Work email", "Notes"];
const notFound = { status: 404, body: { error: { code: "ItemNotFound", message: "The requested resource doesn't exist." } } };

test("Excel Online takes a row per fill on the Microsoft app meetings use, with the Files scope", () => {
  const e = CATALOG.find((x) => x.kind === "excel")!;
  assert.ok(e.rows && e.pushes && e.oauth && e.group === "sheets");
  assert.ok(connectorFor("excel")!.append && connectorFor("excel")!.targets);
  assert.equal(OAUTH.excel!.env, OAUTH.microsoft_calendar!.env);
  assert.match(OAUTH.excel!.scope!, /Files\.ReadWrite/);
  assert.equal(shareId("https://1drv.ms/x/s!abc"), `u!${Buffer.from("https://1drv.ms/x/s!abc").toString("base64url")}`);
  assert.deepEqual(["=1+1", "+1 415", "-5", "@sum", "ana", ""].map(cell), ["'=1+1", "'+1 415", "'-5", "'@sum", "ana", ""]);
});

test("a row goes into the table with the table's own add, in header order, a formula kept as text", async () => {
  const x = ctxFor((c) => (c.url.endsWith("headerRowRange?$select=values") ? { values: [["Fill ID", "Sent at", "Form", "Status", "Work email", "Notes"]] } : c.url.endsWith("rows/add") ? { index: 4 } : {}));
  const r = await excel.append!(x.ctx, T, ROW, { retry: false });
  assert.equal(r.externalId, "ClaritiaFills!4");
  const add = x.calls.find((c) => c.url.endsWith("/rows/add"))!;
  assert.equal(add.url, `${BASE}/tables/ClaritiaFills/rows/add`);
  assert.deepEqual(add.body, { index: null, values: [[ROW.id, ROW.at, "Demo request", "", "ana@acme.com", "'=HYPERLINK(\"http://x\")"]] }, "the team's Status column is left empty");
  assert.ok(!x.calls.some((c) => c.url.includes("columns/add") || c.url.includes("worksheets/add")), "nothing made");
  assert.ok(!x.calls.some((c) => c.url.includes("dataBodyRange")), "a first try doesn't look");
});

test("the first fill makes the sheet and the table; the team's own sheets are never touched", async () => {
  let made = false;
  const x = ctxFor((c) => {
    if (c.url.endsWith("headerRowRange?$select=values")) return made ? { values: [HEAD.slice(0, 3)] } : notFound;
    if (c.url.endsWith("/tables/add")) return (made = true), { id: "{T1}", name: "Table1" };
    return { index: 0, name: (c.body as { name?: string })?.name };
  });
  await excel.append!(x.ctx, T, ROW, { retry: false });
  const seq = x.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.url.replace(BASE, "")}`);
  assert.deepEqual(seq, [
    "POST /worksheets/add",
    "POST /worksheets/'Claritia fills'/tables/add",
    "PATCH /tables/{T1}",
    "PATCH /tables/ClaritiaFills/headerRowRange",
    "POST /tables/ClaritiaFills/columns/add",
    "POST /tables/ClaritiaFills/columns/add",
    "POST /tables/ClaritiaFills/rows/add",
  ]);
  assert.deepEqual(x.calls.find((c) => c.url.endsWith("/worksheets/add"))!.body, { name: "Claritia fills" });
  assert.deepEqual(x.calls.find((c) => c.url.endsWith("/tables/add"))!.body, { address: "'Claritia fills'!A1:C1", hasHeaders: true });
  assert.deepEqual(x.calls.find((c) => c.url.endsWith("/tables/{T1}"))!.body, { name: "ClaritiaFills" });
});

test("flaky: two first fills at once: the second finds the table the first made; if it isn't there yet, it tries again", async () => {
  let reads = 0;
  const x = ctxFor((c) => {
    if (c.url.endsWith("headerRowRange?$select=values")) return ++reads === 1 ? notFound : { values: [HEAD] };
    if (c.url.endsWith("/worksheets/add")) return { status: 409, body: { error: { code: "ItemAlreadyExists", message: "A sheet with that name already exists." } } };
    if (c.url.endsWith("/tables/add")) return { status: 400, body: { error: { code: "InvalidArgument", message: "A table can't overlap another table." } } };
    return { index: 1 };
  });
  assert.equal((await excel.append!(x.ctx, T, ROW, { retry: false })).externalId, "ClaritiaFills!1");
  // Not there yet: this run is tried again, never failed.
  const y = ctxFor((c) => (c.url.endsWith("headerRowRange?$select=values") ? notFound : c.url.endsWith("/tables/add") ? { status: 400, body: { error: { message: "A table can't overlap another table." } } } : {}));
  await assert.rejects(excel.append!(y.ctx, T, ROW, { retry: false }), /trying again later/);
});

test("flaky: a column another fill added a moment ago is fine; an Excel that names it Column4 gets the header written", async () => {
  let head = HEAD.slice(0, 4);
  const x = ctxFor((c) => {
    if (c.url.endsWith("headerRowRange?$select=values")) return { values: [head] };
    if (c.url.endsWith("columns/add")) return (head = [...head, "Notes"]), { status: 400, body: { error: { message: "The column name already exists." } } };
    return { index: 2 };
  });
  await excel.append!(x.ctx, T, ROW, { retry: false });
  assert.deepEqual((x.calls.find((c) => c.url.endsWith("rows/add"))!.body!.values as string[][])[0]!.length, 5);
  const y = ctxFor((c) => (c.url.endsWith("headerRowRange?$select=values") ? { values: [HEAD.slice(0, 3)] } : c.url.endsWith("columns/add") ? { name: "Column4" } : { index: 0 }));
  await excel.append!(y.ctx, T, ROW, { retry: false });
  assert.deepEqual(y.calls.find((c) => c.method === "PATCH" && c.url.endsWith("headerRowRange"))!.body, { values: [HEAD] });
});

test("flaky: a run after a timeout finds its row by Fill ID and adds no second one", async () => {
  const x = ctxFor((c) => (c.url.endsWith("headerRowRange?$select=values") ? { values: [HEAD] } : c.url.includes("columns/Fill ID/dataBodyRange") ? { values: [["other"], [ROW.id]] } : { index: 9 }));
  assert.equal((await excel.append!(x.ctx, T, ROW, { retry: true })).externalId, "ClaritiaFills!1");
  assert.ok(!x.calls.some((c) => c.url.endsWith("rows/add")));
});

test("a workbook from its link: only Microsoft links, only .xlsx", async () => {
  const x = ctxFor(() => ({ id: "01XYZ", name: "Leads 2026.xlsx", webUrl: "https://acme-my.sharepoint.com/x", parentReference: { driveId: "b!drive" } }));
  assert.deepEqual(await workbookFromLink(x.ctx, " https://acme-my.sharepoint.com/:x:/g/personal/ana/EAbc?e=1 "), { id: "b!drive!01XYZ", name: "Leads 2026", url: "https://acme-my.sharepoint.com/x" });
  assert.match(x.calls[0]!.url, /\/shares\/u!/);
  await assert.rejects(workbookFromLink(x.ctx, "https://evil.example.com/sharepoint.com/x"), /Excel's Share button/);
  const doc = ctxFor(() => ({ id: "1", name: "Notes.docx", parentReference: { driveId: "d" } }));
  await assert.rejects(workbookFromLink(doc.ctx, "https://1drv.ms/w/s!abc"), /isn't an Excel workbook/);
});

// A whole delivery, through the jobs queue's sendDelivery.
function delivery(answer: (c: Call) => unknown) {
  const t0 = tool(answer);
  const rpc = async (fn: string) => (fn === "source_load" ? { data: { source, sealed: seal(JSON.stringify(OAUTH_CREDS)), hook_sealed: null, mappings: [] }, error: null } : { data: null, error: null });
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email" }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const t: Taken = {
    delivery: { id: "d1", attempts: 1, external_id: null, allow_duplicate: false },
    destination: { id: "x", kind: "source", source_id: SRC, name: "Excel Online", config: { target: T }, mode: "upsert" },
    sealed: null,
    submission: { id: ROW.id, created_at: ROW.at, values: {}, hidden: {}, consent: null, test: false, form_version: 1, contact_id: null },
    form: { id: "f1", name: "Feedback", body: form.form },
    contact: null,
  };
  return sendDelivery(t, { run: { rpc: rpc as never, clean: async () => ({ custom: [] }), sleep: async () => {}, fetcher: t0.fetcher } });
}

test("flaky: a fill with no email gets its row; down, rate limited or a table not made yet tries again; signed out says sign in again", async () => {
  assert.deepEqual(await delivery((c) => (c.url.endsWith("headerRowRange?$select=values") ? { values: [HEAD.slice(0, 4)] } : { index: 3 })), { status: "done", externalId: "ClaritiaFills!3", externalUrl: T.url });
  assert.equal((await delivery(() => ({ status: 503, body: {} }))).status, "retry");
  assert.equal((await delivery(() => ({ status: 429, body: {} }))).status, "retry");
  assert.equal((await delivery((c) => (c.url.endsWith("headerRowRange?$select=values") ? notFound : c.url.endsWith("/tables/add") ? { status: 400, body: { error: { message: "Busy" } } } : {}))).status, "retry");
  const out = await delivery(() => ({ status: 401, body: { error: { code: "InvalidAuthenticationToken", message: "Access token has expired." } } }));
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.error : "", /^Sign in to Excel Online again/);
  assert.deepEqual(await delivery(() => notFound), { status: "failed", error: "That workbook is gone from OneDrive. Pick another in the form's Sync tab." }, "a deleted workbook isn't tried forever");
});
