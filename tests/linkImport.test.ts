// Import from Typeform and Tally (src/lib/forms/linkImport.ts): which links are which, every question kind each tool
// has, the welcome and thank-you screens, and the notes for what can't come along. Each import must pass the same
// page checks a form made in the Studio does. Flaky cases: a link from another site that looks like one, words with
// HTML in them, recalled answers, options with no text, a matrix with no columns, a question with no title.
import assert from "node:assert/strict";
import { test } from "node:test";
import { formLink, importTally, importTypeform, tallyFromHtml, tallyText, tfText, type TallyBlock, type TypeformForm } from "../src/lib/forms/linkImport.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";

const checked = (r: { name: string; html: string; css: string }) => {
  const { form, questions } = pageForm({ html: r.html, css: r.css, brand: DEFAULT_BRAND_CSS, after: { kind: "thanks" }, title: r.name });
  const c = checkForm(form);
  assert.ok(!("errors" in c), "errors" in c ? c.errors.join(" ") : "");
  return questions;
};

test("links: Typeform, Tally and Google Forms, each with its id; look-alikes and other sites are refused", () => {
  assert.deepEqual(formLink("https://acme.typeform.com/to/AbC123x"), { tool: "typeform", id: "AbC123x" });
  assert.deepEqual(formLink("form.typeform.com/to/AbC123x?utm_source=x"), { tool: "typeform", id: "AbC123x" });
  assert.deepEqual(formLink("https://admin.typeform.com/form/AbC123x/create"), { tool: "typeform", id: "AbC123x" });
  assert.deepEqual(formLink("https://tally.so/r/3qDpEY"), { tool: "tally", id: "3qDpEY" });
  assert.deepEqual(formLink("https://tally.so/forms/3qDpEY/edit"), { tool: "tally", id: "3qDpEY" });
  assert.deepEqual(formLink("https://tally.so/embed/3qDpEY?alignLeft=1"), { tool: "tally", id: "3qDpEY" });
  assert.equal(formLink("https://docs.google.com/forms/d/abc/edit")?.tool, "google");
  for (const bad of ["https://typeform.com.evil.io/to/AbC123", "https://eviltypeform.com/to/AbC123", "https://tally.so.evil.io/r/3qDpEY", "https://tally.so/templates/x", "https://acme.typeform.com/", "not a link", "javascript:alert(1)", "https://acme.typeform.com/to/../../x"])
    assert.equal(formLink(bad), null, bad);
});

const TF: TypeformForm = {
  title: "Client **intake**",
  welcome_screens: [{ title: "Welcome!", properties: { description: "Takes 2 minutes.", button_text: "Let's go" } }],
  fields: [
    { type: "short_text", title: "First name", validations: { required: true } },
    { type: "email", title: "Work email", validations: { required: true } },
    { type: "email", title: "Second email" },
    { type: "phone_number", title: "Phone" },
    { type: "long_text", title: "Tell us about {{field:abc}} your project", properties: { description: "A few lines" } },
    { type: "number", title: "Budget" },
    { type: "website", title: "Site" },
    { type: "date", title: "Start date" },
    { type: "dropdown", title: "Country", properties: { choices: [{ label: "Belgium" }, { label: "India" }] } },
    { type: "multiple_choice", title: "Services", properties: { allow_multiple_selection: true, allow_other_choice: true, choices: [{ label: "Design" }, { label: "Build" }, { label: "" }] } },
    { type: "multiple_choice", title: "Size", validations: { required: true }, properties: { choices: [{ label: "1-10" }, { label: "11+" }] } },
    { type: "picture_choice", title: "Style", properties: { choices: [{ label: "Bold", attachment: { href: "https://images.typeform.com/a.png" } }, { label: "Calm", attachment: { href: "http://insecure/b.png" } }] } },
    { type: "yes_no", title: "Existing client?" },
    { type: "legal", title: "I accept the terms", validations: { required: true } },
    { type: "opinion_scale", title: "How urgent?", properties: { steps: 5, start_at_one: true, labels: { left: "Low", right: "High" } } },
    { type: "nps", title: "Recommend us?" },
    { type: "rating", title: "Rate us", properties: { steps: 5 } },
    { type: "ranking", title: "Rank these", properties: { choices: [{ label: "Price" }, { label: "Speed" }] } },
    { type: "matrix", title: "Grid", properties: { fields: [{ title: "Quality", properties: { choices: [{ label: "Bad" }, { label: "Good" }] } }, { title: "Support" }] } },
    { type: "file_upload", title: "Brief" },
    { type: "statement", title: "Almost done" },
    { type: "group", title: "About you", properties: { fields: [{ type: "short_text", title: "Job title" }] } },
    { type: "contact_info", title: "", properties: { fields: [{ type: "short_text", title: "Company" }] } },
    { type: "payment", title: "Deposit" },
    { type: "calendly", title: "Book a call" },
    { type: "something_new", title: "<script>alert(1)</script>" },
  ],
  hidden: ["utm_source", "bad name!"],
  logic: [{}, {}],
  thankyou_screens: [{ ref: "default_tys", title: "Done" }, { ref: "t1", title: "Thanks, *Ada*", properties: { description: "We'll write soon." } }],
};

test("Typeform: every question kind comes in, in the page's own classes, and passes the form check", () => {
  const r = importTypeform(TF);
  assert.equal(r.name, "Client intake");
  const qs = checked(r);
  const by = (label: string) => qs.find((q) => q.label === label);
  assert.equal(by("Work email")?.save, "email", "the first email is the contact's");
  assert.equal(by("Second email")?.save, undefined);
  assert.equal(by("First name")?.required, true);
  assert.equal(by("Tell us about your project")?.type, "textarea", "recalled answers are taken out");
  assert.equal(by("Services")?.type, "multi");
  assert.deepEqual(by("Services")?.options.map((o) => o.label), ["Design", "Build", "Other"], "empty options dropped, Other kept");
  assert.equal(by("Size")?.type, "radio");
  assert.equal(by("Country")?.type, "select");
  assert.equal(by("I accept the terms")?.required, true);
  assert.ok(by("Job title") && by("Company"), "groups and contact info bring their questions");
  assert.ok(qs.some((q) => q.name === "utm_source"), "hidden fields come in");
  for (const kind of ['data-cl-field="phone"', 'data-cl-field="date"', 'data-cl-field="pictures"', 'data-cl-field="ranking"', 'data-cl-field="grid"', 'data-cl-field="file"', 'data-cl-scale="10" data-cl-style="numbers" data-cl-zero'])
    assert.ok(r.html.includes(kind), kind);
  assert.ok(r.html.includes('data-cl-images="https://images.typeform.com/a.png|"'), "only https pictures are kept");
  assert.match(r.html, /<section data-cl-cover id="cover"><h1 class="heading">Welcome!<\/h1><p class="text">Takes 2 minutes.<\/p><button class="btn" type="button" data-cl-start>Let&#39;s go|Let's go<\/button>/);
  assert.equal(r.pages, 3, "a question group is its own page");
  assert.match(importTypeform({ title: "x", fields: [{ type: "short_text", title: "Q" }] }).html, /<form data-cl-one>/, "one question at a time, as it was on Typeform");
  assert.match(r.html, /data-cl-thanks hidden id="thanks"><h2 class="heading">Thanks, Ada<\/h2><p class="text">We'll write soon.<\/p>/);
  assert.ok(!r.html.includes("<script>"), "words are escaped");
  assert.ok(r.html.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
  assert.ok(!r.html.includes("bad name!"));
  const notes = r.notes.join(" ");
  for (const w of ["Deposit", "Book a call", "2 logic rules", "repeated an earlier answer", "no match"]) assert.ok(notes.includes(w), w);
});

test("Typeform: a form with only a statement still passes as long as it asks something; markdown and recall come out", () => {
  assert.equal(tfText("Hi **{{field:x}}**, _welcome_\\!"), "Hi , welcome!");
  const r = importTypeform({ title: "", fields: [{ type: "short_text", title: "Q" }] });
  assert.equal(r.name, "Imported form");
  checked(r);
});

const blk = (type: string, payload: Record<string, unknown> = {}, groupUuid = type): TallyBlock => ({ uuid: Math.random().toString(36), type, groupUuid, groupType: type, payload });
const T = (s: string) => ({ safeHTMLSchema: [[s]] });

const TALLY: TallyBlock[] = [
  blk("FORM_TITLE", { safeHTMLSchema: [["Event sign-up"]] }),
  blk("HEADING_1", T("Welcome")),
  blk("TITLE", T("Your name")),
  blk("INPUT_TEXT", { isRequired: true, placeholder: "Ada" }),
  blk("TITLE", T("Email")),
  blk("INPUT_EMAIL", { isRequired: true }),
  blk("TITLE", T("Phone")),
  blk("INPUT_PHONE_NUMBER", {}),
  blk("TITLE", T("Website")),
  blk("INPUT_LINK", {}),
  blk("TITLE", T("Guests")),
  blk("INPUT_NUMBER", {}),
  blk("TITLE", T("Day")),
  blk("INPUT_DATE", {}),
  blk("TITLE", T("Arrival")),
  blk("INPUT_TIME", {}),
  blk("TITLE", T("Notes")),
  blk("TEXT", T("Anything we should know")),
  blk("TEXTAREA", {}),
  blk("PAGE_BREAK", { index: 0 }),
  blk("TITLE", T("Meal")),
  blk("MULTIPLE_CHOICE_OPTION", { isRequired: true, text: "Fish" }, "g1"),
  blk("MULTIPLE_CHOICE_OPTION", { isRequired: true, text: "Veg" }, "g1"),
  blk("MULTIPLE_CHOICE_OPTION", { isRequired: true, text: "", isOtherOption: true }, "g1"),
  blk("TITLE", T("Workshops")),
  blk("CHECKBOX", { text: "AM" }, "g2"),
  blk("CHECKBOX", { text: "PM" }, "g2"),
  blk("TITLE", T("Size")),
  blk("DROPDOWN_OPTION", { text: "S" }, "g3"),
  blk("DROPDOWN_OPTION", { text: "M" }, "g3"),
  blk("TITLE", T("Topics")),
  blk("MULTI_SELECT_OPTION", { text: "AI" }, "g4"),
  blk("MULTI_SELECT_OPTION", { text: "Design" }, "g4"),
  blk("TITLE", T("Rank")),
  blk("RANKING_OPTION", { text: "Food" }, "g5"),
  blk("RANKING_OPTION", { text: "Talks" }, "g5"),
  blk("TITLE", T("How likely?")),
  blk("LINEAR_SCALE", { start: 0, end: 10, leftLabel: "No", rightLabel: "Yes" }),
  blk("TITLE", T("Stars")),
  blk("RATING", { stars: 5 }),
  blk("TITLE", T("Grid")),
  blk("MATRIX", {}),
  blk("MATRIX_ROW", T("Venue")),
  blk("MATRIX_ROW", T("Food")),
  blk("MATRIX_COLUMN", T("Bad")),
  blk("MATRIX_COLUMN", T("Good")),
  blk("TITLE", T("CV")),
  blk("FILE_UPLOAD", {}),
  blk("TITLE", T("Sign here")),
  blk("SIGNATURE", { isRequired: true }),
  blk("TITLE", T("Pay")),
  blk("PAYMENT", {}),
  blk("HIDDEN_FIELDS", { hiddenFields: [{ name: "ref" }, { name: "x y" }] }),
  blk("CONDITIONAL_LOGIC", {}),
  blk("TEXT", { isHidden: true, ...T("Only for VIPs") }),
  blk("TITLE", T("<b>Bold</b> & co")),
  blk("INPUT_TEXT", {}),
  blk("PAGE_BREAK", { isThankYouPage: true }),
  blk("HEADING_1", T("See you there")),
  blk("TEXT", T("Check your inbox.")),
];

test("Tally: every block kind comes in, pages and thank-you page kept, and it passes the form check", () => {
  const r = importTally({ name: "internal name", blocks: TALLY });
  assert.equal(r.name, "Event sign-up", "the title people see");
  assert.equal(r.pages, 2);
  const qs = checked(r);
  const by = (label: string) => qs.find((q) => q.label === label);
  assert.equal(by("Your name")?.required, true);
  assert.equal(by("Email")?.save, "email");
  assert.equal(by("Meal")?.type, "radio");
  assert.equal(by("Meal")?.required, true);
  assert.deepEqual(by("Meal")?.options.map((o) => o.label), ["Fish", "Veg", "Other"]);
  assert.equal(by("Workshops")?.type, "multi");
  assert.equal(by("Topics")?.type, "multi");
  assert.equal(by("Size")?.type, "select");
  assert.equal(by("Notes")?.type, "textarea");
  assert.ok(r.html.includes('<p class="text">Anything we should know</p>'), "the text under a title is its help line");
  for (const kind of ['data-cl-field="phone"', 'data-cl-field="date"', 'data-cl-field="time"', 'data-cl-field="ranking"', 'data-cl-rows="Venue|Food" data-cl-cols="Bad|Good"', 'data-cl-field="file"', 'data-cl-field="signature"', 'data-cl-param="ref"'])
    assert.ok(r.html.includes(kind), kind);
  assert.ok(!r.html.includes("x y"));
  assert.match(r.html, /data-cl-thanks hidden id="thanks"><h2 class="heading">See you there<\/h2><p class="text">Check your inbox.<\/p>/);
  assert.ok(!r.html.includes("Only for VIPs"), "text shown only by logic stays out");
  assert.ok(r.html.includes("&lt;b&gt;Bold&lt;/b&gt; &amp; co"), "words are escaped");
  const notes = r.notes.join(" ");
  for (const w of ["Pay", "1 logic rule", "shown only by logic"]) assert.ok(notes.includes(w), w);
});

test("Tally: a question with no title takes the heading over it; its page data and rich text are read", () => {
  const r = importTally({ blocks: [blk("HEADING_1", T("Wanna play?")), blk("MULTIPLE_CHOICE_OPTION", { text: "Yes" }, "a"), blk("MULTIPLE_CHOICE_OPTION", { text: "No" }, "a")] });
  const qs = checked(r);
  assert.equal(qs[0]?.label, "Wanna play?");
  assert.ok(!r.html.includes('<h2 class="heading">Wanna play?</h2>'), "the heading became the label");
  assert.equal(tallyText([[[["Score: "], ["@score", [["tag", "span"], ["mention", "x"]]], ["/3"]], [["font-weight", "bold"]]]]), "Score: /3");
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { name: "N", blocks: [blk("TITLE", T("Q")), blk("INPUT_TEXT", {})] } } })}</script></html>`;
  assert.equal(tallyFromHtml(html)?.blocks?.length, 2);
  assert.equal(tallyFromHtml("<html>no data</html>"), null);
  assert.equal(tallyFromHtml('<script id="__NEXT_DATA__">{broken</script>'), null);
});
