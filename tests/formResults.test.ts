// The Results tab's helpers (docs/forms-plan.md 1.1): filters cleaned before they reach the database, one column per
// place an answer saves across every version, and the CSV with labels, keys and cells a spreadsheet can't run.
import assert from "node:assert/strict";
import { test } from "node:test";
import { toCsv } from "../src/lib/contacts/csv.ts";
import { answerText, cleanFilters, csvHead, csvRow, fillColumns, fromFor, META_KEYS } from "../src/lib/forms/results.ts";
import { emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";

const f = (x: Partial<Field> & Pick<Field, "id" | "key" | "type">): Field => ({ label: x.id, required: false, ...x }) as Field;
const version = (fields: Field[]): Form => ({ ...emptyForm(), steps: [{ id: "s1", fields }] });

test("filters: unknown keys and bad values are dropped", () => {
  assert.deepEqual(cleanFilters({ kind: "spam", q: "  acme  ", status: "failed", booked: false, key: "q.size", value: "11-50", evil: "x" }), {
    kind: "spam",
    q: "acme",
    status: "failed",
    booked: false,
    key: "q.size",
    value: "11-50",
  });
  assert.deepEqual(cleanFilters({ kind: "all", status: "lost", booked: "yes", key: "values; drop", value: "x", from: "soon" }), {});
  assert.deepEqual(cleanFilters({ q: "   " }), {});
  assert.deepEqual(cleanFilters(null), {});
  assert.equal(cleanFilters({ q: "x".repeat(500) }).q?.length, 200);
  assert.equal(fromFor("all"), undefined);
  assert.equal(fromFor("7", Date.parse("2026-10-27T00:00:00Z")), "2026-10-20T00:00:00.000Z");
});

test("columns: the newest version's fields in order, then older ones, each with its newest label", () => {
  const v1 = version([f({ id: "e", key: "email", type: "email" }), f({ id: "m", key: "q.message", type: "textarea", label: "Message" }), f({ id: "b", key: "q.budget", type: "text", label: "Budget" })]);
  const v2 = version([
    f({ id: "e", key: "email", type: "email", label: "Work email" }),
    f({ id: "b", key: "q.budget", type: "choice", label: "Budget range", options: [{ value: "s", label: "Small" }] }),
    { id: "h", key: "c.h", type: "heading", label: "Heading", required: false },
  ]);
  const cols = fillColumns([
    { version: 1, body: v1 },
    { version: 2, body: v2 },
  ]);
  assert.deepEqual(
    cols.map((c) => [c.key, c.label]),
    [
      ["email", "Work email"],
      ["q.budget", "Budget range"],
      ["q.message", "Message"],
    ],
  );
  assert.equal(answerText(cols[1], "s"), "Small");
  assert.equal(answerText(cols[1], ["s", "gone"]), "Small, gone");
  assert.equal(answerText(undefined, true), "Yes");
  assert.equal(answerText(undefined, null), "");
});

test("the CSV: labels, then keys for importing back, and a formula in an answer is made safe", () => {
  const cols = fillColumns([{ version: 1, body: version([f({ id: "e", key: "email", type: "email", label: "Email" }), f({ id: "n", key: "q.note", type: "text", label: "Note" })]) }]);
  const head = csvHead(cols);
  assert.deepEqual(head[0].slice(0, 4), ["Sent at", "Fill", "Email", "Note"]);
  assert.deepEqual(head[1].slice(0, 4), ["created_at", "id", "email", "q.note"]);
  assert.equal(head[0].length, 4 + META_KEYS.length);
  const row = csvRow(cols, { id: "s1", created_at: "2026-10-27T10:00:00Z", values: { email: "ana@acme.com", "q.note": '=HYPERLINK("http://x")' }, hidden: { utm_source: "google", page: "https://acme.com/pricing" } });
  const text = toCsv([row]);
  assert.match(text, /"'=HYPERLINK\(""http:\/\/x""\)"/);
  assert.ok(text.includes("google"));
  assert.equal(row.length, head[0].length);
});
