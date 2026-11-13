// CSV files for Audiences › Import (src/lib/emails/csv.ts), and the people they make (src/lib/emails/people.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { guessFields, parseCsv, peopleFrom } from "../src/lib/emails/csv.ts";
import { cleanPeople } from "../src/lib/emails/people.ts";

test("quotes, commas, quotes in quotes and line breaks inside a value; Excel's mark; semicolons and tabs", () => {
  const c = parseCsv('﻿Email Address,Name,Notes\r\nana@acme.io,"Diaz, Ana","Said ""hi""\nthen left"\r\n\r\nben@acme.io,Ben Okafor,\n');
  assert.deepEqual(c.head, ["Email Address", "Name", "Notes"]);
  assert.deepEqual(c.rows, [["ana@acme.io", "Diaz, Ana", 'Said "hi"\nthen left'], ["ben@acme.io", "Ben Okafor", ""]]);
  assert.deepEqual(parseCsv("email;first name\ncy@acme.io;Cy").rows, [["cy@acme.io", "Cy"]]);
  assert.deepEqual(parseCsv("email\tfirst name\ndee@acme.io\tDee").rows, [["dee@acme.io", "Dee"]]);
});

test("columns match their fields by header; a second email column becomes a custom field", () => {
  assert.deepEqual(guessFields(["E-mail", "First Name", "Surname", "Mobile", "Membership", "Work email", "Email opt-in"]), ["email", "first_name", "last_name", "phone", "custom", "custom", "custom"]);
  assert.deepEqual(guessFields(["Full name", "email"]), ["full_name", "email"]);
});

test("people from the picked fields: full names split, custom fields keyed, then cleaned like any import", () => {
  const c = parseCsv("Name,Email,Membership Type,Phone\nAna Maria Diaz,ana@gmail.com,Unlimited,512-555-0101\n,info@acme.io,,\nJo,jo@mailinator.com,Drop-in,\nAna,a.na@gmail.com,,\nNo email,,,");
  const people = peopleFrom(c, guessFields(c.head));
  assert.deepEqual(people[0], { email: "ana@gmail.com", first_name: "Ana", last_name: "Maria Diaz", phone: "512-555-0101", fields: { membership_type: "Unlimited" } });
  const r = cleanPeople(people);
  assert.deepEqual(r.rows.map((x) => x.email_clean), ["ana@gmail.com", "info@acme.io"]);
  assert.deepEqual([r.disposable, r.role, r.skipped], [1, 1, 2], "a.na@gmail.com is ana@gmail.com; the last row has no email");
  assert.deepEqual(cleanPeople([{ email: "x@acme.io", fields: { ok: "1", "Bad Key": "2", n: 3 } }]).rows[0]!.fields, { ok: "1" });
});
