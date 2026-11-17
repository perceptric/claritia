// "Did you mean...?" on the sign-in screen (src/lib/emailTypos.ts). They prove common slips get the right fix and a
// real address is never "fixed": a company's own domain, a short domain, a provider typed right.
import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestEmail } from "../src/lib/emailTypos.ts";

test("common slips get the right fix", () => {
  assert.equal(suggestEmail("ana@gmial.com"), "ana@gmail.com");
  assert.equal(suggestEmail("ana@gmail.con"), "ana@gmail.com");
  assert.equal(suggestEmail("Ana@Hotmial.com "), "ana@hotmail.com");
  assert.equal(suggestEmail("ana@yaho.com"), "ana@yahoo.com");
  assert.equal(suggestEmail("ana@outlok.com"), "ana@outlook.com");
  assert.equal(suggestEmail("ana@acme.con"), "ana@acme.com");
  assert.equal(suggestEmail("ana@acme.cmo"), "ana@acme.com");
});

test("a real address is left alone", () => {
  for (const e of ["ana@gmail.com", "ana@acme.com", "ana@acme.co", "ana@mail.com", "ana@gmx.de", "ana@ibm.com", "ana@hp.com", "ana@yahoo.co.uk", "ana@acme.io", "ana@", "ana", "", "ana@acme"]) {
    assert.equal(suggestEmail(e), "", e);
  }
});
