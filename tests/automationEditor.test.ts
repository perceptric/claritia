import { test } from "node:test";
import assert from "node:assert/strict";
import { columnView } from "../src/lib/canvas/view.ts";
import { stepDetail } from "../src/lib/workflows/explain.ts";
import { STEP_KINDS, STEP_LINE, type Step } from "../src/lib/workflows/types.ts";

// The Zapier-style automation editor (docs/email-unify-plan.md, E4): the flow's first view, the cards' one-line
// summaries, and a line for every kind of step in the add menu and the panel.

test("a tall flow opens as wide as fits, from the top; a wide one never under 40%", () => {
  const v = { w: 1000, h: 700 };
  const tall = columnView({ x: 0, y: 0, r: 500, b: 3000 }, v);
  assert.equal(tall.z, 1);
  assert.equal(tall.x, 250);
  assert.equal(tall.y, 64);
  const wide = columnView({ x: 0, y: 0, r: 1744, b: 900 }, v);
  assert.equal(wide.z, 0.5);
  assert.equal(columnView({ x: 0, y: 0, r: 9000, b: 900 }, v).z, 0.4);
});

test("a Delay's card says every setting in one line", () => {
  const w = (o: Partial<Extract<Step, { kind: "wait" }>>) => stepDetail({ id: "w", kind: "wait", days: 2, hours: 0, ...o } as Step);
  assert.equal(w({ weekday: [2, 4], at: "09:00" }), "2 days, then Tue or Thu at 9:00 AM");
  assert.equal(w({ weekday: [1, 2, 3, 4, 5] }), "2 days, then a weekday");
  assert.equal(w({ weekday: [1, 3, 5] }), "2 days, then Mon, Wed or Fri");
  assert.equal(w({ at: "14:30" }), "2 days, then at 2:30 PM");
  assert.equal(w({ days: 0, hours: 3 }), "3 hours");
  assert.equal(w({ before: "meeting", days: 1 }), "1 day before meeting");
});

test("every kind of step has its one line", () => {
  for (const k of STEP_KINDS) assert.ok(STEP_LINE[k.kind]?.length > 5, k.kind);
});
