import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanEmail, hashOf } from "../src/lib/email/address.ts";

const clean = (s: string, ws = {}) => {
  const c = cleanEmail(s, ws);
  return "rejected" in c ? c.rejected : `${c.clean} ${c.class}`;
};

test("emails: trim, case, wrappers, provider rules", () => {
  assert.equal(clean("  Jane.Doe+news@GoogleMail.com "), "janedoe@gmail.com free");
  assert.equal(clean("j.a.n.e@gmail.com"), "jane@gmail.com free");
  assert.equal(clean("mailto:Bob@Acme.com"), "bob@acme.com work");
  assert.equal(clean("<bob@acme.com>"), "bob@acme.com work");
  assert.equal(clean('"bob@acme.com"'), "bob@acme.com work");
  assert.equal(clean("bob+crm@acme.com"), "bob@acme.com work", "company mail drops +tags");
  assert.equal(clean("b.o.b@acme.com"), "b.o.b@acme.com work", "dots matter outside Gmail");
  assert.equal(clean("me+x@yahoo.com"), "me+x@yahoo.com free", "Yahoo keeps the tag");
  assert.equal(clean("me@me.com"), "me@icloud.com free");
  assert.equal(clean("x@protonmail.com"), "x@proton.me free");
  assert.equal(clean("jane@bücher.de"), "jane@xn--bcher-kva.de work");
  assert.equal(clean("x@acme.com."), "x@acme.com work");
});

test("emails: classes", () => {
  const ws = { own_domains: ["tryclaritia.com"], partner_domains: ["agency.io"] };
  assert.equal(clean("me@tryclaritia.com", ws), "me@tryclaritia.com own");
  assert.equal(clean("me@eu.tryclaritia.com", ws), "me@eu.tryclaritia.com own");
  assert.equal(clean("sam@agency.io", ws), "sam@agency.io partner");
  assert.equal(clean("sales@acme.com", ws), "sales@acme.com role");
  assert.equal(clean("no-reply@acme.com", ws), "no-reply@acme.com role");
  assert.equal(clean("x@mailinator.com"), "disposable");
});

test("emails: invalid", () => {
  for (const s of ["", "a", "a@b", "@acme.com", "a@@acme.com", "a b@acme.com", "a@acme..com", "+@acme.com", "x".repeat(65) + "@acme.com", "a@" + "b".repeat(260) + ".com"]) assert.equal(clean(s), "invalid", s);
  assert.equal(cleanEmail(42).constructor, Object);
});


test("hashes are SHA-256 of the clean value", () => {
  const c = cleanEmail("Jane@Acme.com");
  assert.ok(!("rejected" in c));
  assert.deepEqual(c.hash, hashOf("jane@acme.com"));
  assert.equal(c.hash.length, 32);
});

