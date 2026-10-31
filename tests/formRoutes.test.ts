// The form's routing rows as the draft saves them (src/lib/forms/schema.ts): each row keeps its id, its meeting and
// its checked conditions. Rows with a bad id or meeting are dropped; a row with a value missing is kept for editing
// (the compile leaves it out, tests/routingCompile.test.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, emptyForm } from "../src/lib/forms/schema.ts";

const MEET = "0192f3a1-0000-7000-8000-0000000000aa";
const OTHER = "0192f3a1-0000-7000-8000-0000000000ab";

test("routing rows keep their meeting and checked conditions; bad rows are dropped", () => {
  const f = emptyForm();
  (f.after as Record<string, unknown>).schedule = {
    tool: "claritia",
    url: "",
    perOwner: false,
    meetingTypeId: MEET,
    routes: [
      { id: "r1", meet: OTHER, conds: [{ field: "company.employees", op: "lt", value: 50 }, { field: "bad field", op: "is", value: "x" }] },
      { id: "r2", meet: OTHER, conds: [{ field: "lead.country", op: "is", value: "" }] },
      { id: "bad id!", meet: OTHER, conds: [] },
      { id: "r3", meet: "not-a-meeting", conds: [] },
    ],
  };
  const out = checkForm(f);
  assert.ok("form" in out, JSON.stringify("errors" in out ? out.errors : []));
  const s = out.form.after.schedule!;
  assert.equal(s.meetingTypeId, MEET);
  assert.deepEqual(s.routes!.map((r) => r.id), ["r1", "r2"]);
  assert.deepEqual(s.routes![0]!.conds, [{ field: "company.employees", op: "lt", value: 50 }]);
  assert.deepEqual(s.routes![1]!.conds, [{ field: "lead.country", op: "is", value: "" }], "kept for editing");
});

test("a form that never used the new routing has no rows (its policy is left alone)", () => {
  const f = emptyForm();
  (f.after as Record<string, unknown>).schedule = { tool: "claritia", url: "", perOwner: false, meetingTypeId: MEET };
  const out = checkForm(f);
  assert.ok("form" in out);
  assert.equal(out.form.after.schedule!.routes, undefined);
});
