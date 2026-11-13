import { test } from "node:test";
import assert from "node:assert/strict";
import { clockLabel, timeOptions } from "../src/lib/workflows/times.ts";
import { goneProblems } from "../src/lib/workflows/check.ts";
import { emptyBody } from "../src/lib/workflows/types.ts";
import { guessFields, parseCsv, peopleFrom } from "../src/lib/emails/csv.ts";
import { cleanPeople } from "../src/lib/emails/people.ts";

// Email round 3, E1 and E2 (docs/email-unify-plan.md): the Delay's time picker, the deleted-form check, and Title and
// Country in imports.

test("the Delay's times run every 15 minutes, on either clock", () => {
  const twelve = timeOptions(true);
  assert.equal(twelve.length, 96);
  assert.deepEqual(twelve[0], { value: "00:00", label: "12:00 AM" });
  assert.deepEqual(twelve[37], { value: "09:15", label: "9:15 AM" });
  assert.deepEqual(twelve.at(-1), { value: "23:45", label: "11:45 PM" });
  assert.equal(timeOptions(false)[52]!.label, "13:00");
  // An older value the list doesn't have stays, in order.
  const kept = timeOptions(true, "09:10").map((o) => o.value);
  assert.equal(kept.length, 97);
  assert.equal(kept[kept.indexOf("09:10") - 1], "09:00");
  assert.equal(clockLabel("12:30", true), "12:30 PM");
  assert.equal(clockLabel("bad", true), "bad");
});

test("a trigger pointing at a deleted form or meeting type is a problem; known ones aren't", () => {
  const b = emptyBody();
  const forms = { f1: "Contact us" };
  assert.deepEqual(goneProblems({ ...b, trigger: { kind: "form", forms: ["f1"] } }, { forms }), []);
  assert.match(goneProblems({ ...b, trigger: { kind: "form", forms: ["gone"] } }, { forms })[0]!.text, /was deleted\. Pick a form/);
  assert.match(goneProblems({ ...b, trigger: { kind: "not_booked", forms: ["f1", "gone"] } }, { forms })[0]!.text, /A form this starts from was deleted/);
  assert.match(goneProblems({ ...b, trigger: { kind: "meeting", events: ["booked"], types: ["t9"] } }, { types: {} })[0]!.text, /meeting type/);
  // "Any form" (none picked) is fine, and without the names nothing is called deleted.
  assert.deepEqual(goneProblems({ ...b, trigger: { kind: "form", forms: [] } }, { forms }), []);
  assert.deepEqual(goneProblems({ ...b, trigger: { kind: "form", forms: ["x"] } }, {}), []);
});

test("imports read Title and Country, and keep only two-letter country codes", () => {
  const csv = parseCsv("Email,First,Job Title,Country\nana@northwind.io,Ana,Founder,es\nben@ortiz.dev,Ben,,Mexico");
  const fields = guessFields(csv.head);
  assert.deepEqual(fields, ["email", "first_name", "title", "country"]);
  const people = peopleFrom(csv, fields);
  assert.deepEqual(people[0], { email: "ana@northwind.io", first_name: "Ana", title: "Founder", country: "es" });
  const { rows } = cleanPeople(people);
  assert.equal(rows[0]!.country, "ES");
  assert.equal(rows[0]!.title, "Founder");
  assert.equal(rows[1]!.country, undefined);
});
