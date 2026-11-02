// The form check for studio pages (src/lib/studio/check.ts, docs/studio-v2-plan.md 6.3 and 6.5): broken pages are
// caught before they go live, what a form must never ask for is stopped, and questions keep their field ids.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { checkStudioPage, errorsIn, showIfRefs } from "../src/lib/studio/check.ts";
import { cleanPage, pageForm } from "../src/lib/studio/page.ts";

const M = [{ id: "11111111-1111-4111-8111-111111111111", name: "Intro call" }, { id: "22222222-2222-4222-8222-222222222222", name: "Enterprise" }];
const GOOD = `<div class="page" id="page"><img data-cl-logo alt="Acme" class="logo"><form id="f">
<section data-cl-step id="s1"><label for="em">Work email</label><input id="em" name="email" type="email" data-cl-save="email" required>
<p>Team size</p><label class="choice"><input type="radio" name="size" value="small" required> 1 to 50</label><label class="choice"><input type="radio" name="size" value="big"> 51+</label>
<div data-cl-show-if="size == 'big'"><label for="co">Company</label><input id="co" name="company"></div>
<button type="button" data-cl-next>Next</button></section>
<section data-cl-step id="s2"><label for="nt">Anything else?</label><textarea id="nt" name="notes"></textarea><button type="submit">Send</button></section>
<section data-cl-thanks hidden><h2>Thanks</h2><div data-cl-book id="book"></div></section></form></div>`;
const meeting = { kind: "meeting" as const, meeting: M[0]!.id, routes: [{ field: "size", value: "big", meeting: M[1]!.id }] };
const codes = (html: string, after: Parameters<typeof checkStudioPage>[0]["after"] = meeting, meetings: typeof M | null = M) => checkStudioPage({ html, after, meetings }).map((i) => `${i.level}:${i.code}`);

test("a sound page has no errors", () => {
  assert.deepEqual(errorsIn(checkStudioPage({ html: GOOD, after: meeting, meetings: M })), []);
});

test("contract: no send button, a stuck step, two inputs with one name, no thank-you", () => {
  assert.ok(codes(GOOD.replace('<button type="submit">Send</button>', "")).includes("error:no-send"));
  assert.ok(codes(GOOD.replace('<button type="button" data-cl-next>Next</button>', "")).includes("error:step-stuck"));
  assert.ok(codes(GOOD.replace('name="company"', 'name="email"')).includes("error:same-name"));
  assert.ok(codes(GOOD.replace(/<section data-cl-thanks[\s\S]*?<\/section>/, "")).includes("warning:no-thanks"));
});

test("labels: a question with only a name is an error, a placeholder-only label a warning; real labels win", () => {
  assert.ok(codes(GOOD.replace('<label for="co">Company</label><input id="co" name="company">', '<input name="company">')).includes("error:no-label"));
  assert.ok(codes(GOOD.replace('<label for="co">Company</label><input id="co" name="company">', '<input name="company" placeholder="Company">')).includes("warning:placeholder-label"));
  const q = cleanPage(`<label>Your name<input name="nm" placeholder="Sam"></label>`).questions[0]!;
  assert.equal(q.label, "Your name");
  assert.equal(q.labelFrom, "label");
});

test("conditions and routes must point at real questions, answers and meetings", () => {
  assert.ok(codes(GOOD.replace("size == 'big'", "plan == 'pro'")).includes("error:show-if-gone"));
  assert.ok(codes(GOOD.replace("size == 'big'", "size == 'huge'")).includes("warning:show-if-value"));
  assert.ok(codes(GOOD, { ...meeting, routes: [{ field: "size", value: "huge", meeting: M[1]!.id }] }).includes("error:route-value"));
  assert.ok(codes(GOOD, { ...meeting, routes: [{ field: "plan", value: "x", meeting: M[1]!.id }] }).includes("error:route-gone"));
  assert.ok(codes(GOOD, { ...meeting, meeting: "33333333-3333-4333-8333-333333333333" }).includes("error:meeting-gone"));
  assert.ok(codes(GOOD, meeting, []).includes("error:no-meetings"));
  assert.ok(codes(GOOD, { kind: "page", url: "acme.com/thanks" }).includes("error:page-url"));
  assert.deepEqual(showIfRefs("size in ('a','b') and role != 'x' or notes filled"), [{ name: "size", values: ["a", "b"] }, { name: "role", values: ["x"] }, { name: "notes", values: [] }]);
});

test("what a form never asks for is stopped: passwords, cards, bank and ID numbers, health records", () => {
  const ask = (label: string, extra = "") => codes(GOOD.replace('<label for="nt">Anything else?</label><textarea id="nt" name="notes"></textarea>', `<label for="x">${label}</label><input id="x" name="x"${extra}>`));
  assert.ok(ask("Password").includes("error:password"));
  assert.ok(ask("Code", ' type="password"').includes("error:password"));
  assert.ok(ask("Credit card number").includes("error:card"));
  assert.ok(ask("IBAN").includes("error:bank"));
  assert.ok(ask("Social security number").includes("error:id"));
  assert.ok(ask("Current medications").includes("error:health"));
  assert.ok(ask("Date of birth").includes("warning:protected"));
  assert.ok(!ask("Reason for your visit").some((c) => c.startsWith("error:")));
  assert.ok(!ask("Page you came from").some((c) => c.includes("protected")));
});

test("questions keep their field ids: data-cl-id first, then last time's id by name", () => {
  const a = cleanPage(`<label for="a">Size</label><input id="a" name="team_size" data-cl-id="size1">`).questions[0]!;
  assert.equal(a.id, "size1");
  // Renamed in the Studio: the name changes, the data-cl-id doesn't.
  const b = cleanPage(`<label for="a">Size</label><input id="a" name="headcount" data-cl-id="size1">`).questions[0]!;
  assert.equal(b.id, "size1");
  // A page with no data-cl-id keeps the id its name had in the published form.
  const c = cleanPage(`<label for="a">Size</label><input id="a" name="team_size">`, { team_size: "older1" }).questions[0]!;
  assert.equal(c.id, "older1");
  // Two pages can't both claim one id.
  const d = cleanPage(`<label for="a">A</label><input id="a" name="a" data-cl-id="same"><label for="b">B</label><input id="b" name="b" data-cl-id="same">`).questions;
  assert.notEqual(d[0]!.id, d[1]!.id);
});

test("a published studio form asks for consent by region and keeps its ids", () => {
  const { form } = pageForm({ html: GOOD.replace('name="email"', 'name="email" data-cl-id="mail"'), css: "", brand: "", after: meeting, turnstile: true });
  const r = checkForm(form);
  assert.ok("form" in r, JSON.stringify("errors" in r ? r.errors : null));
  const f = (r as { form: Form }).form;
  assert.equal(f.consent.mode, "by_region");
  assert.ok(f.consent.label.length > 10);
  assert.equal(f.spam.turnstile, true);
  assert.equal(f.page!.ids.email, "mail");
});

test("Claritia blocks publish as the form's own inputs: file, address, phone and the rest", () => {
  const page = `<form><label for="em">Email</label><input id="em" name="email" type="email" required>
<div data-cl-field="file" data-cl-name="brief" data-cl-label="Your brief" data-cl-kinds="pdf office" data-cl-max="15" data-cl-required id="brief"></div>
<div data-cl-field="address" data-cl-name="site" data-cl-label="Job address" id="addr"></div>
<div data-cl-field="phone" data-cl-name="tel" data-cl-label="Phone" data-cl-save="phone" id="tel"></div>
<div data-cl-field="rating" data-cl-name="score" data-cl-label="How likely?" data-cl-scale="10" data-cl-style="numbers" id="score"></div>
<label for="co">Company</label><select id="co" name="co" data-cl-save="company"><option>Acme</option><option>Other</option></select>
<button type="submit">Send</button><section data-cl-thanks hidden>Thanks</section></form>`;
  assert.deepEqual(errorsIn(checkStudioPage({ html: page, after: { kind: "thanks" }, meetings: null })), []);
  const { form } = pageForm({ html: page, css: "", brand: "", after: { kind: "thanks" } });
  const r = checkForm(form);
  assert.ok("form" in r, JSON.stringify("errors" in r ? r.errors : null));
  const by = Object.fromEntries((r as { form: Form }).form.steps[0]!.fields.map((f) => [f.label, f]));
  assert.equal(by["Your brief"]!.type, "file");
  assert.deepEqual(by["Your brief"]!.file, { maxMb: 15, kinds: ["pdf", "office"] });
  assert.equal(by["Your brief"]!.required, true);
  assert.equal(by["Job address"]!.type, "address");
  assert.ok(by["Job address"]!.key.startsWith("q."));
  assert.equal(by["Phone"]!.key, "phone");
  assert.equal(by["Phone"]!.type, "phone");
  assert.deepEqual(by["How likely?"]!.rating, { scale: 10, style: "numbers" });
  // Company can't be a dropdown on the contact, so the answer stays on the form.
  assert.ok(by["Company"]!.key.startsWith("q."));
});

test("a block needs a label, and a file box of the page's own is stopped", () => {
  const base = `<form><label for="em">Email</label><input id="em" name="email" type="email">BLOCK<button type="submit">Send</button><section data-cl-thanks hidden>t</section></form>`;
  const run = (b: string) => checkStudioPage({ html: base.replace("BLOCK", b), after: { kind: "thanks" }, meetings: null }).map((i) => `${i.level}:${i.code}`);
  assert.ok(run('<div data-cl-field="file" data-cl-name="cv"></div>').includes("error:no-label"));
  assert.ok(run('<label for="f">CV</label><input id="f" type="file" name="cv">').includes("error:file-input"));
});
