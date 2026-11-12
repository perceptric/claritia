// Pasted people for a list (src/lib/emails/people.ts): one a line with optional names, any of the usual separators,
// "Name <email>", and bad or repeated emails left out and counted.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePeople } from "../src/lib/emails/people.ts";

test("one person a line; names optional; bad and repeated lines counted", () => {
  const r = parsePeople("ana@acme.io, Ana, Diaz\nBen@Acme.io\tBen\n\nnot an email\nana@ACME.io\n\"Cy Park\" <cy@acme.io>\nd@x;Dee");
  assert.deepEqual(r.rows, [
    { email: "ana@acme.io", email_clean: "ana@acme.io", first_name: "Ana", last_name: "Diaz" },
    { email: "Ben@Acme.io", email_clean: "ben@acme.io", first_name: "Ben" },
    { email: "cy@acme.io", email_clean: "cy@acme.io" },
  ]);
  assert.equal(r.skipped, 3, "the bad line, the repeat and d@x");
});
