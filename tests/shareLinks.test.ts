// Sharing step 2 (docs/sharing-plan.md): the link preview, the form inside an email, and Email the link.
import assert from "node:assert/strict";
import { test } from "node:test";
import { previewTags, hostedFormHtml } from "../src/lib/forms/hosted.ts";
import { applyOp } from "../src/lib/forms/ops.ts";
import { checkForm, cleanShare, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { answerFrom, answerUrl, emailQuestionHtml, firstQuestion } from "../src/lib/share/emailForm.ts";
import { addressesOf, shareEmail } from "../src/lib/share/shareEmail.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const choice = (o: Partial<Field> = {}): Field => ({ id: "plan", key: "q.plan", type: "choice", label: "Which plan?", required: false, options: [{ value: "team", label: "Team" }, { value: "ent", label: "Enterprise" }], ...o }) as Field;
const withFirst = (f: Field, second = true): Form => {
  const base = emptyForm();
  const email = base.steps.flatMap((s) => s.fields).find((x) => x.key === "email")!;
  return { ...base, steps: second ? [{ id: "s1", fields: [f] }, { id: "s2", fields: [email] }] : [{ id: "s1", fields: [f, email] }] };
};

test("the link preview is cleaned: short title and line, an https picture, nothing when empty", () => {
  assert.deepEqual(cleanShare({ title: "  Book a demo ", description: "x".repeat(300), image: "https://cdn.example/p.png" }), { title: "Book a demo", description: "x".repeat(200), image: "https://cdn.example/p.png" });
  assert.equal(cleanShare({ image: "http://cdn.example/p.png" }), undefined, "only https pictures");
  assert.equal(cleanShare({ image: 'https://x.io/a"onerror="b' }), undefined);
  assert.equal(cleanShare({ title: "   " }), undefined);
  const r = checkForm({ ...emptyForm(), share: { title: "Hi" } });
  assert.ok("form" in r && r.form.share?.title === "Hi", "a published form keeps it");
  const set = applyOp(emptyForm(), { op: "set_share", share: { title: "Hi", image: "https://cdn.example/p.png" } });
  assert.ok("form" in set);
  const cleared = applyOp(set.form, { op: "set_share", share: { title: "", image: "" } });
  assert.ok("form" in cleared && cleared.form.share === undefined, "clearing every part removes it");
});

test("the page's preview tags carry the title, line and picture, with text that can't break out", () => {
  const tags = previewTags({ title: `Demo "now"`, description: "<b>Fast</b>", image: "https://cdn.example/p.png", url: "https://app.tryclaritia.com/f/acme/demo" });
  assert.match(tags, /og:title" content="Demo &#34;now&#34;"/);
  assert.match(tags, /og:description" content="&#60;b&#62;Fast/);
  assert.match(tags, /twitter:card" content="summary_large_image"/);
  assert.equal(previewTags({}), "");
  const page = hostedFormHtml(ID, { framed: false, script: "/forms/v1.js", preview: { title: "Book a demo" } });
  assert.match(page, /<title>Book a demo<\/title>/);
  assert.match(hostedFormHtml(ID, { framed: false, script: "/forms/v1.js" }), /<title>Form<\/title>/);
});

test("the form in an email: the first pick list or rating, each answer a button to the form with it filled", () => {
  const q = firstQuestion(withFirst(choice()))!;
  assert.deepEqual(q.answers.map((a) => a.value), ["team", "ent"]);
  const html = emailQuestionHtml(q, { link: `https://app.tryclaritia.com/f/${ID}`, color: "#ff0000" });
  assert.ok(html.includes(`href="https://app.tryclaritia.com/f/${ID}?clr_a=plan%3Aent"`));
  assert.ok(html.includes("background:#ff0000"));
  assert.ok(emailQuestionHtml(q, { link: "https://x.io/f", color: "red;x:y" }).includes("background:#0a0a0a"), "only a hex color goes in");
  const rating = firstQuestion(withFirst({ id: "r", key: "q.r", type: "rating", label: "How likely?", required: false, rating: { scale: 5, style: "numbers" } } as Field))!;
  assert.deepEqual(rating.answers.map((a) => a.value), ["1", "2", "3", "4", "5"]);
  assert.equal(firstQuestion(withFirst({ id: "n", key: "q.n", type: "text", label: "Name", required: false } as Field)), null, "a text question can't be answered by a click");
  assert.equal(firstQuestion(withFirst(choice({ options: Array.from({ length: 11 }, (_, i) => ({ value: `v${i}`, label: `V${i}` })) }))), null, "more than 10 answers don't fit an email");
  const evil = emailQuestionHtml({ fieldId: "plan", label: `<img src=x>`, answers: [{ label: `"><script>`, value: "a&b" }] }, { link: "https://x.io/f" });
  assert.ok(!evil.includes("<img") && !evil.includes("<script>"));
  assert.equal(answerUrl("https://x.io/f?a=1", { fieldId: "p" }, "x y"), "https://x.io/f?a=1&clr_a=p%3Ax%20y");
});

test("a clicked answer fills only the first question, only with one of its answers; a deleted answer fills nothing", () => {
  const form = withFirst(choice());
  assert.deepEqual(answerFrom(form, "plan:ent"), { field: form.steps[0]!.fields[0], value: "ent" });
  assert.equal(answerFrom(form, "plan:gone"), null, "an answer deleted after the email went out");
  assert.equal(answerFrom(form, "email:a@b.co"), null, "never another question");
  assert.equal(answerFrom(form, "plan"), null);
  assert.equal(answerFrom(form, null), null);
  assert.deepEqual(answerFrom(withFirst(choice({ type: "multi" })), "plan:team")?.value, ["team"]);
  assert.equal(answerFrom(withFirst({ id: "r", key: "q.r", type: "rating", label: "How likely?", required: false, rating: { scale: 5, style: "numbers" } } as Field), "r:4")?.value, 4);
});

test("Email the link: each address once, up to 50, every one a real address; the email escapes what's typed", () => {
  assert.deepEqual(addressesOf(["A@acme.com", " a@acme.com ", "b@acme.com"]), ["a@acme.com", "b@acme.com"]);
  assert.equal(addressesOf(["a@acme.com", "not an email"]), null);
  assert.equal(addressesOf(Array.from({ length: 51 }, (_, i) => `p${i}@acme.com`)), null);
  assert.equal(addressesOf([]), null);
  const m = shareEmail({ name: "Book a <demo>", link: "https://app.tryclaritia.com/f/acme/demo", message: "Hi <b>team</b>\nSee below", button: "Open the form" });
  assert.equal(m.subject, "Book a <demo>");
  assert.ok(m.html.includes("Book a &lt;demo&gt;") && m.html.includes("Hi &lt;b&gt;team&lt;/b&gt;") && m.html.includes('href="https://app.tryclaritia.com/f/acme/demo"'));
  assert.ok(m.text.includes("Open the form: https://app.tryclaritia.com/f/acme/demo"));
});
