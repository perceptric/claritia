// The fields plan (docs/fields-plan.md): the server's check of the new answers (points that add up, a range, a
// table, the times that work, products), what products cost and charge, video links, email codes and their proofs,
// and the page's date rules and formats.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, payAmount, productsTotal, videoEmbed, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers } from "../src/lib/forms/values.ts";
import { emailCode, emailCodeOk, missingProofs, proofFor, proofOk } from "../src/lib/forms/codes.ts";
import { holds } from "../src/lib/studio/runtime.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { questionHtml } from "../src/lib/studio/builder.ts";

const form = (html: string): Form => {
  const r = checkForm(pageForm({ html: `<form><input name="email" type="email" data-cl-save="email" aria-label="Email">${html}<button type="submit">Send</button></form>`, css: "", brand: "", after: { kind: "thanks" } }).form);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const idOf = (f: Form, name: string) => f.page!.ids[name]!;

test("points to spread add up to the total, in whole numbers", () => {
  const f = form(questionHtml("sum", "points"));
  const id = idOf(f, "points");
  assert.deepEqual(checkAnswers(f, { [id]: { Price: "60", Quality: "40" } }).errors, {});
  assert.match(checkAnswers(f, { [id]: { Price: "60", Quality: "30" } }).errors[id]!, /add up to 100 \(now 90\)/);
  assert.match(checkAnswers(f, { [id]: { Price: "50.5", Quality: "49.5" } }).errors[id]!, /whole numbers/);
});

test("a range stays inside its limits, lowest first", () => {
  const f = form(questionHtml("range", "budget"));
  const id = idOf(f, "budget");
  assert.deepEqual(checkAnswers(f, { [id]: { from: "100", to: "900" } }).errors, {});
  assert.ok(checkAnswers(f, { [id]: { from: "900", to: "100" } }).errors[id]);
  assert.ok(checkAnswers(f, { [id]: { from: "0", to: "20000" } }).errors[id]);
});

test("a table keeps its cells; the times that work keep only the times shown", () => {
  const f = form(questionHtml("table", "t") + questionHtml("availability", "a"));
  const t = idOf(f, "t"),
    a = idOf(f, "a");
  const r = checkAnswers(f, { [t]: { "Item 1: Quantity": "3", "Nope: Nope": "x" }, [a]: { Monday: ["Morning", "Evening"] } });
  assert.deepEqual(r.errors, {});
  assert.deepEqual(Object.values(r.values).find((v) => typeof v === "object" && v && "Item 1: Quantity" in v), { "Item 1: Quantity": "3" });
  assert.ok(checkAnswers(f, { [a]: { Monday: ["Midnight"] } }).errors[a]);
});

test("products cost their price times how many, and the payment charges it", () => {
  const f = form(`${questionHtml("products", "products")}<div data-cl-field="payment" data-cl-name="pay" data-cl-label="Total" data-cl-from="products" data-cl-currency="USD"></div>`);
  const id = idOf(f, "products");
  const field = f.steps[0]!.fields.find((x) => x.id === id)!;
  assert.equal(productsTotal(field, { "Product A": "2", "Product B": "1" }), 75);
  assert.equal(productsTotal(field, {}), null);
  assert.deepEqual(payAmount(f, { [id]: { "Product A": "2", "Product B": "1" } }), { amount: 7500, currency: "usd" });
  assert.ok(checkAnswers(f, { [id]: { "Product A": "1000" } }).errors[id]);
});

test("a video plays only from YouTube, Vimeo or Loom", () => {
  assert.equal(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbed("https://youtu.be/dQw4w9WgXcQ"), "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  assert.equal(videoEmbed("https://vimeo.com/76979871"), "https://player.vimeo.com/video/76979871");
  assert.equal(videoEmbed("https://www.loom.com/share/0123456789abcdef0123456789abcdef"), "https://www.loom.com/embed/0123456789abcdef0123456789abcdef");
  assert.equal(videoEmbed("https://evil.example/embed/x"), null);
  assert.equal(videoEmbed("http://youtu.be/dQw4w9WgXcQ"), null);
});

test("an email code works for 30 minutes; a proof for its value only, for an hour", () => {
  process.env.FORM_CODE_SECRET = "test-secret";
  process.env.RESEND_API_KEY = "re_test";
  const f = form(`<input name="work" type="email" data-cl-verify aria-label="Work email">`);
  const field = f.steps[0]!.fields.find((x) => x.verify)!;
  const t0 = Date.UTC(2026, 10, 5, 12, 0);
  const code = emailCode("form1", field, "Ana@Acme.com", t0);
  assert.match(code, /^\d{6}$/);
  assert.ok(emailCodeOk("form1", field, "ana@acme.com", code, t0 + 25 * 60_000));
  assert.ok(!emailCodeOk("form1", field, "ana@acme.com", code, t0 + 40 * 60_000));
  assert.ok(!emailCodeOk("form2", field, "ana@acme.com", code, t0));
  const proof = proofFor("form1", field, "ana@acme.com", t0);
  assert.ok(proofOk("form1", field, "ana@acme.com", proof, t0 + 59 * 60_000));
  assert.ok(!proofOk("form1", field, "bob@acme.com", proof, t0));
  assert.ok(!proofOk("form1", field, "ana@acme.com", proof, t0 + 61 * 60_000));
  assert.ok(!proofOk("form1", field, "ana@acme.com", `${proof}x`, t0));
  assert.deepEqual(missingProofs("form1", f, { [field.id]: "ana@acme.com" }, { [field.id]: proof }, t0), {});
  assert.ok(missingProofs("form1", f, { [field.id]: "ana@acme.com" }, {}, t0)[field.id]);
});

test("page rules read dates: before, after and within N days", () => {
  const day = (n: number) => {
    const d = new Date(Date.now() + n * 864e5);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  assert.ok(holds("start within 30 days", { start: day(5) }));
  assert.ok(!holds("start within 30 days", { start: day(45) }));
  assert.ok(!holds("start within 30 days", { start: day(-1) }));
  assert.ok(holds("start < '2026-12-01'", { start: "2026-11-20" }));
  assert.ok(holds("start > '2026-12-01'", { start: "2027-01-02" }));
  assert.ok(!holds("start > '2026-12-01'", { start: "" }));
});
