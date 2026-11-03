// Step 2 of docs/form-kinds-plan.md: answers with parts. Each is checked on the server the same way the browser
// checks it, and shown as one line in Submissions, the CSV and team emails.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp } from "../src/lib/forms/ops.ts";
import { answerText } from "../src/lib/forms/results.ts";
import { checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Email", required: true };
const ok = (fields: Field[]): Form => {
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }] });
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const opt = (v: string) => ({ value: v, label: v });
const check = (f: Field, v: unknown) => checkAnswers(ok([f]), { e: "a@acme.com", [f.id]: v });
const col = (f: Field) => ({ key: f.key, label: f.label, field: f });

test("ranking: every choice once, in an order", () => {
  const f: Field = { id: "rk", key: "q.rk", type: "ranking", label: "Order", required: true, options: [opt("a"), opt("b"), opt("c")] };
  assert.deepEqual(check(f, ["c", "a", "b"]).values["q.rk"], ["c", "a", "b"]);
  assert.ok(check(f, ["c", "a"]).errors.rk);
  assert.ok(check(f, ["c", "a", "a"]).errors.rk);
  assert.ok(check(f, undefined).errors.rk, "required");
  assert.equal(answerText(col(f), ["c", "a", "b"]), "1. c, 2. a, 3. b");
  assert.ok("errors" in checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { ...f, options: [opt("a")] }] }] }));
});

test("address: street, city and country, the rest optional", () => {
  const f: Field = { id: "ad", key: "q.ad", type: "address", label: "Address", required: true };
  const v = { line1: "1 Main St", city: "Austin", country: "US", postal: "73301" };
  assert.deepEqual(check(f, v).values["q.ad"], v);
  assert.ok(check(f, { line1: "1 Main St" }).errors.ad);
  assert.ok(check(f, {}).errors.ad, "required");
  assert.equal(answerText(col(f), v), "1 Main St, Austin, 73301, US");
  // Only a question key: an address never lands on a contact field by mistake.
  assert.ok("errors" in checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, { ...f, key: "company" }] }] }));
});

test("grid: one column per row, every row answered", () => {
  const f: Field = { id: "gd", key: "q.gd", type: "grid", label: "Rate", required: false, grid: { rows: [opt("Price"), opt("Support")], cols: [opt("Poor"), opt("Good")] } };
  assert.deepEqual(check(f, { Price: "Good", Support: "Poor" }).values["q.gd"], { Price: "Good", Support: "Poor" });
  assert.ok(check(f, { Price: "Good" }).errors.gd);
  assert.ok(check(f, { Price: "Great", Support: "Poor" }).errors.gd);
  assert.equal(check(f, undefined).values["q.gd"], undefined);
  assert.equal(answerText(col(f), { Price: "Good", Support: "Poor" }), "Price: Good; Support: Poor");
});

test("time and date range", () => {
  const t: Field = { id: "tm", key: "q.tm", type: "time", label: "Time", required: false };
  assert.equal(check(t, "09:30").values["q.tm"], "09:30");
  assert.ok(check(t, "25:00").errors.tm);
  const d: Field = { id: "dr", key: "q.dr", type: "daterange", label: "Dates", required: false };
  assert.deepEqual(check(d, { from: "2026-12-01", to: "2026-12-05" }).values["q.dr"], { from: "2026-12-01", to: "2026-12-05" });
  assert.ok(check(d, { from: "2026-12-05", to: "2026-12-01" }).errors.dr);
  assert.ok(check(d, { from: "2026-12-05" }).errors.dr);
  assert.equal(answerText(col(d), { from: "2026-12-01", to: "2026-12-05" }), "2026-12-01 to 2026-12-05");
});

test("group: rows of small questions, required ones on every row, up to the most", () => {
  const f: Field = { id: "gp", key: "q.gp", type: "group", label: "Guests", required: true, group: { fields: [{ id: "nm", key: "q.nm", type: "text", label: "Name", required: true }, { id: "em", key: "q.em", type: "email", label: "Email", required: false }], max: 2 } };
  const fm = ok([f]);
  assert.equal(fm.steps[0]!.fields[1]!.group!.fields.length, 2);
  assert.deepEqual(check(f, [{ nm: "Ana" }, { nm: "Bo", em: "bo@acme.com" }]).values["q.gp"], [{ nm: "Ana" }, { nm: "Bo", em: "bo@acme.com" }]);
  assert.ok(check(f, [{ em: "bo@acme.com" }]).errors.gp, "a row with no name");
  assert.ok(check(f, [{ nm: "A" }, { nm: "B" }, { nm: "C" }]).errors.gp, "more rows than allowed");
  assert.ok(check(f, [{ nm: "Ana", em: "nope" }]).errors.gp);
  assert.ok(check(f, [{}]).errors.gp, "required");
  assert.equal(answerText(col(f), [{ nm: "Ana" }, { nm: "Bo", em: "bo@acme.com" }]), "Ana; Bo, bo@acme.com");
});

test("signature: an upload token, shown as Signed", () => {
  const f: Field = { id: "sg", key: "q.sg", type: "signature", label: "Signature", required: true };
  const tok = "up_0192f3a1-0000-7000-8000-0000000000aa:signature.png";
  assert.equal(check(f, tok).values["q.sg"], tok);
  assert.ok(check(f, "data:image/png;base64,xx").errors.sg);
  assert.ok(check(f, undefined).errors.sg);
  assert.equal(answerText(col(f), tok), "Signed");
});

test("NPS: a 0 to 10 scale takes 0", () => {
  const f: Field = { id: "np", key: "q.np", type: "rating", label: "Recommend?", required: true, rating: { scale: 10, style: "numbers", zero: true } };
  assert.equal(ok([f]).steps[0]!.fields[1]!.rating?.zero, true);
  assert.equal(check(f, "0").values["q.np"], 0);
  assert.ok(check(f, "11").errors.np);
  const stars: Field = { ...f, id: "st", key: "q.st", rating: { scale: 5, style: "stars" } };
  assert.ok(check(stars, "0").errors.st);
});

test("changing a question to another type gives the new type what it needs", () => {
  const fm = ok([{ id: "q1", key: "q.q1", type: "text", label: "Q", required: false }]);
  const r = applyOp(fm, { op: "update_field", id: "q1", patch: { type: "grid" } });
  assert.ok("form" in r);
  const g = r.form.steps[0]!.fields[1]!;
  assert.ok(g.grid && g.grid.cols.length >= 2);
  assert.ok(!("errors" in checkForm(r.form)));
  const back = applyOp(r.form, { op: "update_field", id: "q1", patch: { type: "text" } });
  assert.ok("form" in back && !back.form.steps[0]!.fields[1]!.grid);
});
