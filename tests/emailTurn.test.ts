// One Tia turn on the canvas (src/lib/design/email/turn.ts; docs/email-canvas-b5.md section 9).
import assert from "node:assert/strict";
import { test } from "node:test";
import { addChip, changedMeanwhile, turnTargets } from "../src/lib/design/email/turn.ts";

test("targets: parts gathered per email, an email chip wins, else the picked email", () => {
  assert.deepEqual(turnTargets([], "e1"), [{ email: "e1", scope: { kind: "email" } }]);
  assert.deepEqual(turnTargets([], null), []);
  assert.deepEqual(turnTargets([{ email: "e1", id: "h1" }, { email: "e1", id: "t1" }, { email: "e2", id: null }], "e9"), [
    { email: "e1", scope: { kind: "parts", ids: ["h1", "t1"] } },
    { email: "e2", scope: { kind: "email" } },
  ]);
  assert.deepEqual(turnTargets([{ email: "e1", id: "h1" }, { email: "e1", id: null }, { email: "e1", id: "t1" }], null), [{ email: "e1", scope: { kind: "email" } }]);
});

test("chips: no doubles, and at most 5 emails", () => {
  let chips = [{ email: "e1", id: null as string | null }];
  const same = addChip(chips, { email: "e1", id: null });
  assert.ok("chips" in same && same.chips.length === 1);
  for (const e of ["e2", "e3", "e4", "e5"]) {
    const r = addChip(chips, { email: e, id: null });
    assert.ok("chips" in r);
    chips = r.chips;
  }
  assert.deepEqual(addChip(chips, { email: "e6", id: null }), { error: "Tia works on up to 5 emails at a time" });
  assert.ok("chips" in addChip(chips, { email: "e3", id: "h1" }), "a part of an email already in is fine");
});

test("results whose email changed while Tia worked", () => {
  const rs = [{ email: "a", sent: "1" }, { email: "b", sent: "2" }];
  assert.deepEqual(changedMeanwhile(rs, (e) => (e === "a" ? "1" : "changed")).map((r) => r.email), ["b"]);
});
