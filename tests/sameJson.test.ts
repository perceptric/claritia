import assert from "node:assert/strict";
import test from "node:test";
import { sameJson } from "../src/lib/sameJson.ts";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";

test("the same form with its keys in another order is the same", () => {
  assert.equal(sameJson({ a: 1, b: { c: [1, { d: 2, e: 3 }] } }, { b: { c: [1, { e: 3, d: 2 }] }, a: 1 }), true);
  assert.equal(sameJson({ a: 1, b: undefined }, { a: 1 }), true);
  assert.equal(sameJson({ a: [1, 2] }, { a: [2, 1] }), false, "order inside a list counts");
  assert.equal(sameJson({ a: 1 }, { a: "1" }), false);
});

test("a published form read back from the database (keys reordered) is not 'changed'", () => {
  const r = checkForm(emptyForm(), { custom: [] });
  assert.ok("form" in r);
  // jsonb orders keys by length, then bytes.
  const reorder = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort((x, y) => x.length - y.length || (x < y ? -1 : 1)).map((k) => [k, reorder((v as Record<string, unknown>)[k])])) : v;
  const back = reorder(r.form);
  assert.notEqual(JSON.stringify(back), JSON.stringify(r.form), "the probe really reorders");
  const again = checkForm(back, { custom: [] });
  assert.ok("form" in again);
  assert.equal(sameJson(again.form, back), true);
});
