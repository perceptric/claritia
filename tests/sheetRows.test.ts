// Sheets and databases as form destinations (docs/integrations-plan.md step 2): a row per fill in Google Sheets,
// Airtable or Notion. The flaky cases: a delivery run again after a timeout (the row may have landed) finds its row
// and adds no second one; a question added later adds a column at the end and nothing moves; columns the team
// reordered or added stay as they are; an answer that looks like a formula stays text; a fill with no email still
// gets its row; no target picked; the tool down, rate limited or signed out; the sign-in gone.
process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
import assert from "node:assert/strict";
import { test } from "node:test";
import { fillRow } from "../src/lib/delivery/fillRow.ts";
import { NEW_RULES, targetOf } from "../src/lib/delivery/rules.ts";
import { sendDelivery, type Taken } from "../src/lib/delivery/send.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";
import { seal } from "../src/lib/seal.ts";
import { CATALOG } from "../src/lib/sources/catalog.ts";
import { makeCtx } from "../src/lib/sources/ctx.ts";
import { connectorFor } from "../src/lib/sources/registry.ts";
import { colName, FIXED } from "../src/lib/sources/rows.ts";
import type { Creds, FillRow, RowTarget, SourceRow } from "../src/lib/sources/types.ts";

const SRC = "0190a0b0-0000-7000-8000-00000000000c";
const OAUTH: Creds = { type: "oauth", access: "tok", refresh: null, expiresAt: Date.now() + 3_600_000 };
const source = (kind: string): SourceRow => ({ id: SRC, workspace_id: "w", kind, name: kind, account: "a", status: "active", settings: {}, cursors: {}, push_cursor: null });
type Call = { method: string; url: string; body: Record<string, unknown> | null };
/** A tool that answers each call with `answer` (a body, or a status with a body). */
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
    return a === null ? new Response(null, { status: 204 }) : new Response(JSON.stringify(a), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, fetcher };
}
const ctxFor = (kind: string, answer: (c: Call) => unknown) => {
  const t = tool(answer);
  return { ctx: makeCtx({ source: source(kind), creds: OAUTH, fetcher: t.fetcher, sleep: async () => {} }), calls: t.calls };
};
const ROW: FillRow = {
  id: "0190a0b0-0000-7000-8000-0000000000f1",
  at: "2026-11-03T10:15:00.000Z",
  form: "Demo request",
  cells: [
    { name: "Work email", value: "ana@acme.com" },
    { name: "Team size", value: "11-50" },
    { name: "Notes", value: "=IMPORTXML(\"http://x\")" },
  ],
};

test("Google Sheets, Airtable and Notion take a row per fill; Airtable and Notion list where rows can go", () => {
  for (const kind of ["google_sheets", "airtable", "notion"]) {
    const e = CATALOG.find((x) => x.kind === kind)!;
    assert.ok(e.rows && e.pushes && e.group === "sheets", `${kind} is a sheet or database`);
    assert.ok(connectorFor(kind)!.append, `${kind} appends rows`);
  }
  assert.ok(connectorFor("airtable")!.targets && connectorFor("notion")!.targets);
  assert.deepEqual([0, 25, 26, 51, 701, 702].map(colName), ["A", "Z", "AA", "AZ", "ZZ", "AAA"]);
});

test("a fill as a row: questions by label, choices by label, two questions with one label stay two, where it came from only when known", () => {
  const form = checkForm({
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "e", key: "email", type: "email", label: "Work email", required: true },
          { id: "c", key: "q.size", type: "choice", label: "Team size", options: [{ value: "m", label: "11-50" }, { value: "s", label: "1-10" }] },
          { id: "n1", key: "q.notes", type: "textarea", label: "Notes" },
          { id: "n2", key: "q.notes2", type: "textarea", label: "Notes" },
        ],
      },
    ],
  } as Form);
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const r = fillRow({ id: "f1", created_at: "2026-11-03T10:15:00Z", values: { email: "ana@acme.com", "q.size": "m", "q.notes": "Hi" }, hidden: { utm_source: "google", page: " " } }, { name: "Demo", body: form.form });
  assert.equal(r.at, "2026-11-03T10:15:00.000Z");
  assert.deepEqual(r.cells, [
    { name: "Work email", value: "ana@acme.com" },
    { name: "Team size", value: "11-50" },
    { name: "Notes", value: "Hi" },
    { name: "Notes (2)", value: "" },
    { name: "utm_source", value: "google" },
  ]);
  const noBody = fillRow({ id: "f2", created_at: "2026-11-03T10:15:00Z", values: { email: "x@y.co" }, hidden: null }, { name: "Gone", body: null });
  assert.deepEqual(noBody.cells, []);
});

test("Google Sheets: an empty sheet gets its header, the row goes in as plain text at the end", async () => {
  const s = ctxFor("google_sheets", (c) => (c.url.includes("!1:1") ? {} : c.url.includes(":append") ? { updates: { updatedRange: "Fills!A2:F2" } } : {}));
  const r = await connectorFor("google_sheets")!.append!(s.ctx, { id: "SHEET", name: "Demo", sheet: "Fills" }, ROW, { retry: false });
  assert.equal(r.externalId, "Fills!A2:F2");
  const head = s.calls.find((c) => c.method === "PUT")!;
  assert.match(head.url, /\/SHEET\/values\/'Fills'!A1\?valueInputOption=RAW$/);
  assert.deepEqual(head.body, { values: [[...FIXED, "Work email", "Team size", "Notes"]] });
  const add = s.calls.find((c) => c.url.includes(":append"))!;
  assert.match(add.url, /valueInputOption=RAW&insertDataOption=INSERT_ROWS/, "plain text: a formula stays text");
  assert.deepEqual(add.body, { values: [[ROW.at, ROW.id, "Demo request", "ana@acme.com", "11-50", "=IMPORTXML(\"http://x\")"]] });
  assert.ok(!s.calls.some((c) => c.url.includes("!B:B")), "a first try doesn't look for the row");
});

test("flaky: columns the team moved or added stay put; a new question adds a column at the end", async () => {
  // The team put Form first and added their own Status column; Notes is a question added since.
  const head = ["Form", "Status", "Sent at", "Fill ID", "Work email", "Team size"];
  const s = ctxFor("google_sheets", (c) => (c.url.includes("!1:1") ? { values: [head] } : {}));
  await connectorFor("google_sheets")!.append!(s.ctx, { id: "SHEET", name: "Demo", sheet: "Leads 'Q4'" }, ROW, { retry: false });
  const put = s.calls.find((c) => c.method === "PUT")!;
  assert.match(put.url, /'Leads ''Q4'''!A1/, "the tab's own quotes are doubled");
  assert.deepEqual(put.body, { values: [[...head, "Notes"]] }, "only Notes is added, at the end");
  assert.deepEqual(s.calls.find((c) => c.url.includes(":append"))!.body, { values: [["Demo request", "", ROW.at, ROW.id, "ana@acme.com", "11-50", "=IMPORTXML(\"http://x\")"]] });
  // Nothing new: the header isn't written again.
  const same = ctxFor("google_sheets", (c) => (c.url.includes("!1:1") ? { values: [[...head, "Notes"]] } : {}));
  await connectorFor("google_sheets")!.append!(same.ctx, { id: "SHEET", name: "Demo", sheet: "Fills" }, ROW, { retry: false });
  assert.ok(!same.calls.some((c) => c.method === "PUT"));
});

test("flaky: a run after a timeout finds its row by Fill ID and adds no second one", async () => {
  const head = [...FIXED, "Work email", "Team size", "Notes"];
  const s = ctxFor("google_sheets", (c) => (c.url.includes("!1:1") ? { values: [head] } : c.url.includes("!B:B") ? { values: [["Fill ID"], ["other"], [ROW.id]] } : {}));
  const r = await connectorFor("google_sheets")!.append!(s.ctx, { id: "SHEET", name: "Demo", sheet: "Fills" }, ROW, { retry: true });
  assert.equal(r.externalId, "Fills!A3");
  assert.ok(!s.calls.some((c) => c.url.includes(":append")), "nothing appended");
  // Not there yet: it goes in.
  const miss = ctxFor("google_sheets", (c) => (c.url.includes("!1:1") ? { values: [head] } : c.url.includes("!B:B") ? { values: [["Fill ID"], ["other"]] } : { updates: { updatedRange: "Fills!A3:F3" } }));
  assert.equal((await connectorFor("google_sheets")!.append!(miss.ctx, { id: "SHEET", name: "Demo", sheet: "Fills" }, ROW, { retry: true })).externalId, "Fills!A3:F3");
});

test("Airtable: missing fields made as long text once, the record made with typecast; a run again finds it", async () => {
  const table = { id: "tblA", name: "Leads", fields: [{ id: "f1", name: "Fill ID", type: "singleLineText" }, { id: "f2", name: "Work email", type: "email" }] };
  const a = ctxFor("airtable", (c) =>
    c.url.endsWith("/meta/bases/appX/tables") ? { tables: [table] } : c.url.endsWith("/fields") ? (c.body?.name === "Form" ? { status: 422, body: { error: { type: "DUPLICATE_OR_EMPTY_FIELD_NAME", message: "Field exists" } } } : { id: "fNew" }) : { records: [{ id: "recNew" }] },
  );
  const r = await connectorFor("airtable")!.append!(a.ctx, { id: "appX/tblA", name: "CRM / Leads" }, ROW, { retry: false });
  assert.equal(r.externalId, "recNew");
  const made = a.calls.filter((c) => c.url.endsWith("/fields")).map((c) => c.body);
  assert.deepEqual(made.map((b) => b!.name), ["Sent at", "Form", "Team size", "Notes"], "only the missing ones; one made by another fill at the same time is fine");
  assert.ok(made.every((b) => b!.type === "multilineText"));
  const rec = a.calls.find((c) => c.method === "POST" && c.url.endsWith("/appX/tblA"))!;
  assert.equal(rec.body!.typecast, true);
  assert.deepEqual((rec.body!.records as { fields: Record<string, string> }[])[0]!.fields, { "Sent at": ROW.at, "Fill ID": ROW.id, Form: "Demo request", "Work email": "ana@acme.com", "Team size": "11-50", Notes: "=IMPORTXML(\"http://x\")" });

  const all = { ...table, fields: ["Sent at", "Fill ID", "Form", "Work email", "Team size", "Notes"].map((n, i) => ({ id: `f${i}`, name: n, type: "multilineText" })) };
  const again = ctxFor("airtable", (c) => (c.url.includes("/meta/") ? { tables: [all] } : c.method === "GET" ? { records: [{ id: "recOld" }] } : { records: [{ id: "recDup" }] }));
  assert.equal((await connectorFor("airtable")!.append!(again.ctx, { id: "appX/tblA", name: "CRM / Leads" }, ROW, { retry: true })).externalId, "recOld");
  assert.match(again.calls.find((c) => c.method === "GET" && !c.url.includes("/meta/"))!.url, /filterByFormula=\{Fill ID\}='0190a0b0-0000-7000-8000-0000000000f1'/);
  assert.ok(!again.calls.some((c) => c.method === "POST"), "no second record, no fields made");

  const gone = ctxFor("airtable", () => ({ tables: [] }));
  await assert.rejects(connectorFor("airtable")!.append!(gone.ctx, { id: "appX/tblA", name: "CRM / Leads" }, ROW, { retry: false }), /That table is gone from Airtable/);
  const signedOut = ctxFor("airtable", (c) => (c.url.includes("/meta/") ? { tables: [table] } : { status: 403, body: { error: { message: "Invalid permissions" } } }));
  await assert.rejects(connectorFor("airtable")!.append!(signedOut.ctx, { id: "appX/tblA", name: "CRM / Leads" }, ROW, { retry: false }), (e: Error) => e.name === "AuthError" || /permissions/.test(e.message));
});

test("Airtable lists the tables of bases it can write to", async () => {
  const a = ctxFor("airtable", (c) =>
    c.url.endsWith("/meta/bases") ? { bases: [{ id: "app1", name: "CRM", permissionLevel: "create" }, { id: "app2", name: "Read only", permissionLevel: "read" }] } : { tables: [{ id: "tbl1", name: "Leads", fields: [] }] },
  );
  assert.deepEqual(await connectorFor("airtable")!.targets!(a.ctx), [{ id: "app1/tbl1", name: "CRM / Leads", url: "https://airtable.com/app1/tbl1" }]);
});

test("Notion: missing columns made as text, values as each column's type, titled by who sent it; a run again finds it", async () => {
  const props = { Name: { type: "title" }, "Fill ID": { type: "rich_text" }, "Work email": { type: "email" }, "Team size": { type: "select" } };
  const n = ctxFor("notion", (c) => (c.method === "GET" ? { properties: props } : c.method === "PATCH" ? {} : { id: "page-1" }));
  const r = await connectorFor("notion")!.append!(n.ctx, { id: "db1", name: "Leads" }, ROW, { retry: false });
  assert.equal(r.externalId, "page-1");
  const patch = n.calls.find((c) => c.method === "PATCH")!;
  assert.deepEqual(Object.keys(patch.body!.properties as object), ["Sent at", "Form", "Notes"]);
  const page = n.calls.find((c) => c.url.endsWith("/pages"))!.body!;
  assert.deepEqual(page.parent, { database_id: "db1" });
  const p = page.properties as Record<string, unknown>;
  assert.deepEqual(p.Name, { title: [{ type: "text", text: { content: "ana@acme.com" } }] });
  assert.deepEqual(p["Work email"], { email: "ana@acme.com" });
  assert.deepEqual(p["Team size"], { select: { name: "11-50" } });
  assert.deepEqual(p.Notes, { rich_text: [{ type: "text", text: { content: "=IMPORTXML(\"http://x\")" } }] });
  assert.ok(!n.calls.some((c) => c.url.endsWith("/query")), "a first try doesn't look");

  // A value the column can't hold is left out, never sent wrong.
  const odd = ctxFor("notion", (c) => (c.method === "GET" ? { properties: { Title: { type: "title" }, "Sent at": { type: "rich_text" }, "Fill ID": { type: "rich_text" }, Form: { type: "rich_text" }, "Work email": { type: "email" }, "Team size": { type: "number" }, Notes: { type: "people" } } } : { id: "page-2" }));
  await connectorFor("notion")!.append!(odd.ctx, { id: "db1", name: "Leads" }, { ...ROW, cells: [{ name: "Work email", value: "not an email" }, { name: "Team size", value: "11-50" }, { name: "Notes", value: "x" }] }, { retry: false });
  const op = odd.calls.find((c) => c.url.endsWith("/pages"))!.body!.properties as Record<string, unknown>;
  assert.ok(!("Work email" in op) && !("Team size" in op) && !("Notes" in op));
  assert.deepEqual(op.Title, { title: [{ type: "text", text: { content: "Demo request, 2026-11-03 10:15" } }] }, "no email or name: the form and when");

  const again = ctxFor("notion", (c) => (c.method === "GET" ? { properties: { ...props, "Sent at": { type: "rich_text" }, Form: { type: "rich_text" }, Notes: { type: "rich_text" } } } : c.url.endsWith("/query") ? { results: [{ id: "page-old" }] } : { id: "page-dup" }));
  assert.equal((await connectorFor("notion")!.append!(again.ctx, { id: "db1", name: "Leads" }, ROW, { retry: true })).externalId, "page-old");
  assert.ok(!again.calls.some((c) => c.url.endsWith("/pages")), "no second page");
});

// A whole delivery, through the jobs queue's sendDelivery.
function delivery(kind: string, o: { config: Record<string, unknown>; contact?: boolean; attempts?: number; connected?: boolean; answer: (c: Call) => unknown }) {
  const t0 = tool(o.answer);
  const rpc = async (fn: string) => {
    if (fn === "source_load") return { data: o.connected === false ? null : { source: source(kind), sealed: seal(JSON.stringify(OAUTH)), hook_sealed: null, mappings: [] }, error: null };
    return { data: null, error: null };
  };
  const form = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email" }, { id: "n", key: "q.notes", type: "textarea", label: "Notes", required: true }] }] });
  if ("errors" in form) throw new Error(form.errors.join(" "));
  const contact = { id: "0190a0b0-0000-7000-8000-0000000000c3", email: "ana@acme.com", first_name: "Ana", last_name: null, title: null, phone: null, country: null, company: null, company_domain: null };
  const t: Taken = {
    delivery: { id: "d1", attempts: o.attempts ?? 1, external_id: null, allow_duplicate: false },
    destination: { id: "x", kind: "source", source_id: SRC, name: "Google Sheets", config: o.config, mode: "upsert" },
    sealed: null,
    submission: { id: ROW.id, created_at: ROW.at, values: { "q.notes": "No email on this form" }, hidden: {}, consent: null, test: false, form_version: 1, contact_id: o.contact === false ? null : contact.id },
    form: { id: "f1", name: "Feedback", body: form.form },
    contact: o.contact === false ? null : contact,
  };
  return { run: () => sendDelivery(t, { run: { rpc: rpc as never, clean: async () => ({ custom: [] }), sleep: async () => {}, fetcher: t0.fetcher } }), calls: t0.calls };
}
const TARGET: RowTarget = { id: "SHEET", name: "Feedback", url: "https://docs.google.com/spreadsheets/d/SHEET/edit", sheet: "Fills" };
const sheetAnswer = (c: Call) => (c.url.includes("!1:1") ? { values: [[...FIXED, "Work email", "Notes"]] } : c.url.includes("!B:B") ? { values: [["Fill ID"], [ROW.id]] } : { updates: { updatedRange: "Fills!A2:D2" } });

test("flaky: a fill with no email still gets its row, linked to the sheet", async () => {
  const d = delivery("google_sheets", { config: { rules: NEW_RULES, target: TARGET }, contact: false, answer: sheetAnswer });
  assert.deepEqual(await d.run(), { status: "done", externalId: "Fills!A2:D2", externalUrl: TARGET.url });
  assert.deepEqual(d.calls.find((c) => c.url.includes(":append"))!.body, { values: [[ROW.at, ROW.id, "Feedback", "", "No email on this form"]] });
});

test("flaky: the job's second try finds the row the first one wrote before it timed out", async () => {
  const d = delivery("google_sheets", { config: { target: TARGET }, attempts: 2, answer: sheetAnswer });
  assert.deepEqual(await d.run(), { status: "done", externalId: "Fills!A2", externalUrl: TARGET.url });
  assert.ok(!d.calls.some((c) => c.url.includes(":append")));
});

test("flaky: no target picked says what to do; the sign-in gone says connect again, with or without a contact", async () => {
  assert.deepEqual(await delivery("google_sheets", { config: { rules: NEW_RULES }, answer: sheetAnswer }).run(), { status: "failed", error: "Pick where rows go in the form's Sync tab." });
  assert.deepEqual(await delivery("google_sheets", { config: { target: TARGET }, contact: false, connected: false, answer: sheetAnswer }).run(), { status: "failed", error: "Connect Google Sheets again." });
  assert.deepEqual(await delivery("google_sheets", { config: {}, contact: false, connected: false, answer: sheetAnswer }).run(), { status: "skipped", reason: "No contact to send." }, "a CRM with no contact is still skipped");
});

test("flaky: the tool down or rate limited is tried again; signed out says sign in again", async () => {
  const down = await delivery("google_sheets", { config: { target: TARGET }, answer: () => ({ status: 503, body: {} }) }).run();
  assert.equal(down.status, "retry");
  const limited = await delivery("google_sheets", { config: { target: TARGET }, answer: () => ({ status: 429, body: {} }) }).run();
  assert.equal(limited.status, "retry");
  const out = await delivery("google_sheets", { config: { target: TARGET }, answer: () => ({ status: 403, body: { error: { message: "The caller does not have permission" } } }) }).run();
  assert.equal(out.status, "failed");
  assert.match(out.status === "failed" ? out.error : "", /^Sign in to Google Sheets again/);
  const gone = await delivery("google_sheets", { config: { target: TARGET }, answer: () => ({ status: 404, body: { error: { message: "Requested entity was not found." } } }) }).run();
  assert.deepEqual(gone, { status: "failed", error: "Requested entity was not found." }, "a deleted sheet isn't tried forever");
});

test("the target reads back cleaned: only an https link is kept", () => {
  assert.deepEqual(targetOf({ target: { id: " SHEET ", name: "Leads", url: "javascript:alert(1)", sheet: "Fills" } }), { id: "SHEET", name: "Leads", sheet: "Fills" });
  assert.deepEqual(targetOf({ target: { id: "db1", url: "https://notion.so/db1" } }), { id: "db1", name: "db1", url: "https://notion.so/db1" });
  assert.equal(targetOf({ target: { id: "" } }), null);
  assert.equal(targetOf({}), null);
});
