// Booking questions (src/lib/meetings/questions.ts, checkGuest in guest.ts, checkSettings in check.ts): every kind
// is checked and cleaned the same way on the page and the server. The flaky cases: junk answers, a multi with a
// choice that isn't offered, a date that doesn't exist, a required checkbox left unticked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkGuest } from "../src/lib/meetings/guest.ts";
import { checkAnswer, QUESTION_TYPES } from "../src/lib/meetings/questions.ts";
import type { QuestionType } from "../src/lib/meetings/types.ts";

const q = (type: QuestionType, options?: string[]) => ({ label: "Q", type, options });
const ok = (type: QuestionType, raw: unknown, want: string, options?: string[]) => assert.deepEqual(checkAnswer(q(type, options), raw), { value: want }, `${type} ${JSON.stringify(raw)}`);
const bad = (type: QuestionType, raw: unknown, options?: string[]) => assert.ok("error" in checkAnswer(q(type, options), raw), `${type} ${JSON.stringify(raw)} should be refused`);

test("thirteen kinds, each with a label", () => {
  assert.equal(QUESTION_TYPES.length, 13);
  assert.ok(QUESTION_TYPES.every((t) => t.label));
});

test("each kind cleans a good answer and refuses a bad one", () => {
  ok("text", "  hi ", "hi");
  ok("email", "Dana@Acme.com", "dana@acme.com");
  bad("email", "dana@");
  ok("phone", "+1 (415) 555-0100", "+1 (415) 555-0100");
  bad("phone", "call me");
  ok("number", "1,5", "1.5");
  bad("number", "lots");
  ok("url", "acme.com", "https://acme.com/");
  bad("url", "not a site");
  ok("date", "2026-11-05", "2026-11-05");
  bad("date", "2026-02-30");
  ok("choice", "B", "B", ["A", "B"]);
  bad("choice", "C", ["A", "B"]);
  ok("multi", "C\nA", "A, C", ["A", "B", "C"]);
  ok("multi", ["B"], "B", ["A", "B"]);
  bad("multi", "A\nZ", ["A", "B"]);
  ok("yesno", "No", "No");
  bad("yesno", "Maybe");
  ok("rating", "4", "4");
  bad("rating", "9");
  ok("country", "vn", "VN");
  bad("country", "Atlantis");
  ok("checkbox", "Yes", "Yes");
  ok("checkbox", "nope", "");
  ok("textarea", "x".repeat(3000), "x".repeat(2000));
});

test("flaky: the server refuses a missing required answer and an unticked required checkbox", () => {
  const questions = [
    { id: "size", label: "Company size", type: "choice" as const, required: true, options: ["1-10", "11-50"] },
    { id: "terms", label: "the terms", type: "checkbox" as const, required: true },
  ];
  const base = { name: "Dana", email: "dana@acme.com" };
  assert.deepEqual(checkGuest({ ...base, answers: { terms: "Yes" } }, questions), { error: "Company size is required.", field: "size" });
  assert.deepEqual(checkGuest({ ...base, answers: { size: "11-50" } }, questions), { error: "Tick the terms.", field: "terms" });
  const g = checkGuest({ ...base, answers: { size: "11-50", terms: "Yes", extra: "dropped" } }, questions);
  assert.ok("guest" in g && g.guest.answers.size === "11-50" && g.guest.answers.terms === "Yes" && !("extra" in g.guest.answers));
});
