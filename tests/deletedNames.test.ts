// Workflow triggers and scoring rules that point at deleted meeting types or forms read as plain English.
import assert from "node:assert/strict";
import { test } from "node:test";
import { triggerWords } from "../src/lib/workflows/explain.ts";

const n = { types: { a: "Intro call", b: "Demo" }, forms: { f: "Contact us" } };
const meeting = (types: string[]) => triggerWords({ kind: "meeting", types, events: ["canceled"] } as never, n);

test("meeting triggers name live types and drop deleted ones", () => {
  assert.equal(meeting([]), "When a meeting is canceled");
  assert.equal(meeting(["a"]), "When an Intro call meeting is canceled");
  assert.equal(meeting(["b", "gone"]), "When a Demo meeting is canceled");
  assert.equal(meeting(["gone"]), "When a meeting of a deleted type is canceled");
});

test("form triggers with only deleted forms say so", () => {
  assert.equal(triggerWords({ kind: "form", forms: ["gone"] } as never, n), "When a deleted form is sent");
  assert.equal(triggerWords({ kind: "form", forms: ["f", "gone"] } as never, n), "When Contact us is sent");
});
