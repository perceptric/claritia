// A poll's other voters (docs/meetings-scheduler.md 1.8b): every voter gets the invite, reminders and cancel, each once.
import assert from "node:assert/strict";
import { test } from "node:test";
import { otherGuests } from "../worker-intel/jobs/meetings.ts";

test("other guests come from answers.guests, cleaned, without the main guest or repeats", () => {
  assert.deepEqual(otherGuests({ guest_email: "Ann@Acme.com", answers: { guests: " ann@acme.com, bo@acme.com,BO@acme.com, not-an-email, cy@beta.io " } }), ["bo@acme.com", "cy@beta.io"]);
  assert.deepEqual(otherGuests({ guest_email: "ann@acme.com", answers: {} }), []);
  assert.deepEqual(otherGuests({ guest_email: "ann@acme.com", answers: { guests: ["x@y.io"] } }), [], "only the comma-separated text the poll writes");
});
