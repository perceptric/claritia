// Studio blocks that don't take a typed answer (src/lib/studio/page.ts): a calculation, a payment, a result, a grid,
// a ranking, a hidden value, and scores on choices. Each becomes a real field, so the server works out prices again,
// charges what it worked out, and checks grid and ranking answers the same way it does on every form.

import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, payAmount, withCalcs, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";
import { pageForm } from "../src/lib/studio/page.ts";

const AFTER = { kind: "thanks" as const };
const built = (html: string) => {
  const { form } = pageForm({ html, css: "", brand: "", after: AFTER });
  return checkForm(form);
};
const ok = (html: string): Form => {
  const r = built(html);
  assert.ok("form" in r, "errors" in r ? r.errors.join("; ") : "");
  return (r as { form: Form }).form;
};
const field = (f: Form, id: string) => f.steps.flatMap((s) => s.fields).find((x) => x.id === id)!;

const CATERING = `<div class="page" id="page">
<label for="g">Guests</label><input id="g" name="guests" type="number" data-cl-id="guests" required>
<p>Service</p>
<label class="choice"><input type="radio" name="service" value="buffet" data-cl-id="service" data-cl-score="38"> Buffet</label>
<label class="choice"><input type="radio" name="service" value="plated" data-cl-score="52"> Plated</label>
<div data-cl-field="calc" data-cl-name="total" data-cl-id="total" data-cl-label="Total" data-cl-formula="{guests} * {service}" data-cl-format="money" data-cl-currency="USD"></div>
<div data-cl-field="calc" data-cl-name="deposit" data-cl-id="deposit" data-cl-label="Deposit" data-cl-formula="{total} * 0.2" data-cl-format="money" data-cl-hide></div>
<div data-cl-field="payment" data-cl-name="pay" data-cl-id="pay" data-cl-label="Due now" data-cl-from="deposit" data-cl-currency="usd"></div>
<label for="e">Email</label><input id="e" type="email" name="email" data-cl-save="email" required>
<button type="submit">Send</button></div>`;

test("a calculation reads other questions by name, and the form runs it on their ids", () => {
  const f = ok(CATERING);
  const total = field(f, "total");
  assert.equal(total.type, "calc");
  assert.equal(total.required, false);
  assert.equal(total.calc!.formula, "{guests} * {service}");
  assert.equal(total.calc!.format, "money");
  assert.equal(field(f, "deposit").calc!.show, false, "a hidden calc is worked out but not shown");
  // Choice points come from data-cl-score, so a choice in a formula counts its points.
  assert.deepEqual(field(f, "service").options!.map((o) => o.score), [38, 52]);
  const vals = withCalcs(f, { guests: 40, service: "plated" });
  assert.equal(vals.total, 2080);
  assert.equal(vals.deposit, 416);
});

test("a payment charges the calc it names, worked out again on the server", () => {
  const f = ok(CATERING);
  const pay = field(f, "pay");
  assert.deepEqual(pay.pay, { currency: "USD", field: "deposit" });
  // The browser's own total is never trusted: the server works it out from the answers.
  assert.deepEqual(payAmount(f, { guests: 40, service: "buffet", total: 1, deposit: 1 }), { amount: 30400, currency: "usd" }, "$304 in cents, for Stripe");
  const fixed = ok(`<div data-cl-field="payment" data-cl-name="fee" data-cl-label="Booking fee" data-cl-amount="25" data-cl-currency="EUR"></div><input type="email" name="email" data-cl-save="email">`);
  assert.deepEqual(field(fixed, fixed.page!.ids.fee!).pay, { currency: "EUR", amount: 25 });
});

test("flaky pages: a formula or payment naming a missing question is caught, never published", () => {
  const missing = built(`<div data-cl-field="calc" data-cl-name="total" data-cl-label="Total" data-cl-formula="{guestz} * 38"></div><input type="email" name="email" data-cl-save="email">`);
  assert.ok("errors" in missing && missing.errors.some((e) => /gone/.test(e)), JSON.stringify(missing));
  const broken = built(`<div data-cl-field="calc" data-cl-name="total" data-cl-label="Total" data-cl-formula="{a} * ("></div><input name="a" type="number"><input type="email" name="email" data-cl-save="email">`);
  assert.ok("errors" in broken, "a formula that doesn't parse is an error");
  const pay = built(`<div data-cl-field="payment" data-cl-name="pay" data-cl-label="Pay" data-cl-from="nothing"></div><input type="email" name="email" data-cl-save="email">`);
  assert.ok("errors" in pay, "a payment from a calc that isn't there can't go live");
  const none = built(`<div data-cl-field="payment" data-cl-name="pay" data-cl-label="Pay" data-cl-amount="-5"></div><input type="email" name="email" data-cl-save="email">`);
  assert.ok("errors" in none && none.errors.some((e) => /amount or a calculation/.test(e)), "a payment of nothing is an error");
  // A required calc or result is never required: nobody types into it.
  const req = ok(`<input name="a" type="number"><div data-cl-field="calc" data-cl-name="c" data-cl-label="C" data-cl-formula="{a} + 1" data-cl-required></div><input type="email" name="email" data-cl-save="email">`);
  assert.equal(field(req, req.page!.ids.c!).required, false);
});

test("results: a meter of a score out of its top, from the calcs they name", () => {
  const f = ok(`<label class="choice"><input type="radio" name="q1" value="a" data-cl-score="2"> A</label><label class="choice"><input type="radio" name="q1" value="b" data-cl-score="5"> B</label>
<div data-cl-field="calc" data-cl-name="score" data-cl-label="Score" data-cl-formula="{q1}"></div>
<div data-cl-field="result" data-cl-name="res" data-cl-kind="meter" data-cl-of="score" data-cl-max="10"></div>
<div data-cl-field="result" data-cl-name="odd" data-cl-kind="nonsense" data-cl-of="score"></div>
<input type="email" name="email" data-cl-save="email">`);
  const ids = f.page!.ids;
  assert.deepEqual(field(f, ids.res!).result, { kind: "meter", field: ids.score, max: 10 });
  assert.deepEqual(field(f, ids.odd!).result, { kind: "metric", field: ids.score }, "an unknown kind shows the number");
  assert.equal(withCalcs(f, { [ids.q1!]: "b" })[ids.score!], 5);
});

test("a grid and a ranking are real questions the server checks", () => {
  const f = ok(`<div data-cl-field="grid" data-cl-name="rate" data-cl-label="Rate us" data-cl-rows="Speed|Price|q::Quality" data-cl-cols="Poor|OK|Great" data-cl-required></div>
<div data-cl-field="ranking" data-cl-name="order" data-cl-label="Put these in order" data-cl-options="Price|Speed|Support"></div>
<input type="email" name="email" data-cl-save="email" required>`);
  const ids = f.page!.ids;
  const grid = field(f, ids.rate!);
  assert.equal(grid.type, "grid");
  assert.deepEqual(grid.grid!.rows.map((r) => [r.value, r.label]), [["Speed", "Speed"], ["Price", "Price"], ["q", "Quality"]]);
  assert.equal(grid.required, true);
  assert.deepEqual(field(f, ids.order!).options!.map((o) => o.value), ["Price", "Speed", "Support"]);
  const good = checkAnswers(f, { [ids.rate!]: { Speed: "OK", Price: "Great", q: "Poor" }, [ids.order!]: ["Support", "Price", "Speed"], [ids.email!]: "a@acme.com" });
  assert.ok(!("errors" in good) || !Object.keys((good as { errors: object }).errors).length, JSON.stringify(good));
  const bad = checkAnswers(f, { [ids.rate!]: { Speed: "Amazing" }, [ids.email!]: "a@acme.com" });
  assert.ok("errors" in bad && Object.keys((bad as { errors: object }).errors).length > 0, "a column the grid doesn't have is refused");
});

test("a hidden value comes from the link, and never blocks the send", () => {
  const f = ok(`<div data-cl-field="hidden" data-cl-name="campaign" data-cl-param="utm_campaign" data-cl-required></div><input type="email" name="email" data-cl-save="email">`);
  const h = field(f, f.page!.ids.campaign!);
  assert.equal(h.type, "hidden");
  assert.deepEqual(h.hidden, { from: "param", name: "utm_campaign" });
  assert.equal(h.required, false);
});

test("the Studio's preview shows the same numbers, and a broken formula shows a dash, never a crash", async () => {
  const { pageNumbers } = await import("../src/lib/studio/numbers.ts");
  const n = pageNumbers(CATERING, { guests: "40", service: "plated" });
  assert.equal(n.total!.value, 2080);
  assert.equal(n.total!.text, "$2,080.00");
  assert.equal(n.pay!.text, "$416.00");
  assert.equal(pageNumbers(CATERING, {}).total!.value, null, "no answers yet: no total");
  const bad = pageNumbers(`<div data-cl-field="calc" data-cl-name="t" data-cl-label="T" data-cl-formula="{a} * ("></div><input name="a">`, { a: "3" });
  assert.equal(bad.t!.value, null);
});

test("a > or < inside a quoted value stays in the tag, and a broken quote reads as the browser does", async () => {
  const { cleanPage } = await import("../src/lib/studio/page.ts");
  const { html } = cleanPage(`<p id="big" data-cl-show-if="total >= 3000 and size < 5">Big</p><p>After</p>`);
  assert.match(html, /data-cl-show-if="total &gt;= 3000 and size &lt; 5"/);
  assert.match(html, /<p>After<\/p>/);
  // A broken quote runs on to the next quote, as it does in the browser, so the cleaner reads what the visitor sees.
  const broken = cleanPage(`<p class="a>Oops</p><input name="email" type="email"><p>Still here</p>`);
  assert.equal(broken.questions.length, 0, "the input inside the broken value isn't a question, as in the browser");
  assert.match(broken.html, /Still here/, "the page after it is still read");
});
