// Pasted people for a list (src/lib/emails/people.ts): one a line with optional names, any of the usual separators,
// "Name <email>", cleaned the way forms clean addresses; bad, repeated and throwaway emails left out and counted;
// shared inboxes kept and counted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeople } from "../src/lib/emails/people.ts";
import { isRoleAddress } from "../src/lib/emails/role.ts";

test("one person a line; names optional; bad and repeated lines counted", () => {
  const r = parsePeople("ana@acme.io, Ana, Diaz\nBen@Acme.io\tBen\n\nnot an email\nana@ACME.io\n\"Cy Park\" <cy@acme.io>\nd@x;Dee");
  assert.deepEqual(r.rows, [
    { email: "ana@acme.io", email_clean: "ana@acme.io", email_class: "work", first_name: "Ana", last_name: "Diaz" },
    { email: "Ben@Acme.io", email_clean: "ben@acme.io", email_class: "work", first_name: "Ben" },
    { email: "cy@acme.io", email_clean: "cy@acme.io", email_class: "work" },
  ]);
  assert.equal(r.skipped, 3, "the bad line, the repeat and d@x");
});

test("throwaway addresses are left out; shared inboxes stay and are counted; forms' cleaning applies", () => {
  const r = parsePeople("ana@mailinator.com\ninfo@acme.io\nsales+eu@acme.io\nj.doe+news@gmail.com\njdoe@gmail.com\nben@gmail.com");
  assert.equal(r.disposable, 1);
  assert.equal(r.role, 2);
  assert.deepEqual(r.rows.map((x) => [x.email_clean, x.email_class]), [["info@acme.io", "role"], ["sales@acme.io", "role"], ["jdoe@gmail.com", "free"], ["ben@gmail.com", "free"]]);
  assert.equal(r.skipped, 1, "jdoe@gmail.com is the same person as j.doe+news@gmail.com");
  assert.ok(isRoleAddress("Info@acme.io") && isRoleAddress("sales+eu@acme.io") && !isRoleAddress("ana@acme.io"));
});
