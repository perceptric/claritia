// Import a form pasted from ChatGPT (src/lib/forms/pasteImport.ts): the shapes ChatGPT writes forms in, each one
// read into the right questions and passing the same page checks a Studio form does. Flaky cases: the chat around the
// form, emphasis and emoji, check-box marks on options, options on the question's own line, a rating written as its
// two ends, Step headings, a table, JSON in a code fence, words with HTML in them, and a paste with no questions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { importPasted, PASTE_MAX } from "../src/lib/forms/pasteImport.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";

type Got = { label: string; type: string; required?: boolean; save?: string; options: { label: string }[] };
function read(text: string) {
  const r = importPasted(text);
  const { form, questions } = pageForm({ html: r.html, css: r.css, brand: DEFAULT_BRAND_CSS, after: { kind: "thanks" }, title: r.name });
  const c = checkForm(form);
  assert.ok(!("errors" in c), "errors" in c ? c.errors.join(" ") : "");
  const qs = questions as unknown as Got[];
  const by = (label: string) => {
    const q = qs.find((x) => x.label === label);
    assert.ok(q, `no question "${label}" in: ${qs.map((x) => x.label).join(" | ")}`);
    return q;
  };
  const opts = (label: string) => by(label).options.map((o) => o.label);
  return { r, qs, by, opts };
}

const CHATGPT = `Sure! Here's a simple roof estimate request form you can use:

---

### **Free Roof Estimate Request**

Thanks for your interest! Fill out the form below and we'll get back to you within 24 hours.

**Section 1: Contact Information**

1. **Full Name** *
2. **Email Address** *
3. **Phone Number** *
4. **Property Address**

**Section 2: Project Details**

5. **What type of service do you need?** (Select one)
   - Roof repair
   - Full roof replacement
   - Storm damage
   - Other (please specify)
6. **Which issues have you noticed?** (Select all that apply)
   - ☐ Leaks
   - ☐ Missing shingles
7. **Describe the problem**
8. **Upload photos of the damage** (optional)
9. **Preferred date for an inspection**
10. **How did you hear about us?** Google / Facebook / Referral / Other
11. **How satisfied were you with your last contractor?** (1 = Very unhappy, 5 = Very happy)
12. **I agree to be contacted about my request.** *

**Submit button:** Get my free estimate

**Thank-you message:** Thanks! A roofing specialist will contact you within one business day.

---

Let me know if you'd like me to add logic or make it multi-step!`;

test("ChatGPT's usual answer: title, intro, sections, every question type, button and thank-you; the chat is left out", () => {
  const { r, qs, by, opts } = read(CHATGPT);
  assert.equal(r.name, "Free Roof Estimate Request");
  assert.equal(qs.length, 12);
  assert.equal(by("Full Name").required, true, "a trailing * is required");
  assert.equal(by("Email Address").save, "email", "the first email is the contact's");
  assert.ok(r.html.includes('data-cl-field="phone"') && r.html.includes('data-cl-field="address"'));
  assert.equal(by("What type of service do you need?").type, "radio");
  assert.deepEqual(opts("What type of service do you need?"), ["Roof repair", "Full roof replacement", "Storm damage", "Other"], "(please specify) comes off");
  assert.equal(by("Which issues have you noticed?").type, "multi");
  assert.deepEqual(opts("Which issues have you noticed?"), ["Leaks", "Missing shingles"], "check-box marks come off");
  assert.equal(by("Describe the problem").type, "textarea");
  assert.equal(by("Upload photos of the damage").required, false);
  assert.ok(r.html.includes('data-cl-field="file"') && r.html.includes('data-cl-field="date"'));
  assert.deepEqual(opts("How did you hear about us?"), ["Google", "Facebook", "Referral", "Other"], "options on the question's own line");
  assert.match(r.html, /data-cl-label="How satisfied were you with your last contractor\?"[^>]*data-cl-scale="5" data-cl-style="numbers" data-cl-low="Very unhappy" data-cl-high="Very happy"/, "a rating written as its two ends");
  assert.equal(by("I agree to be contacted about my request.").required, true);
  assert.match(r.html, /<h3 class="heading">Contact Information<\/h3>[\s\S]*<h3 class="heading">Project Details<\/h3>/);
  assert.ok(r.html.includes("<p class=\"text\">Thanks for your interest!"), "the intro is kept");
  assert.ok(r.html.includes('<button class="btn" type="submit">Get my free estimate</button>'));
  assert.ok(r.html.includes("A roofing specialist will contact you within one business day."));
  for (const chat of ["Sure!", "Let me know", "---"]) assert.ok(!r.html.includes(chat), chat);
});

test("a Markdown table: question, type, options and required columns", () => {
  const { qs, by, opts, r } = read(`| # | Question | Type | Options | Required |
|---|---|---|---|---|
| 1 | Your name | Short text | — | Yes |
| 2 | Email | Email | — | Yes |
| 3 | Will you attend? | Multiple choice | Yes; No; Maybe | Yes |
| 4 | Meal preference | Dropdown | Chicken; Fish; Vegetarian | No |
| 5 | How excited are you? | Rating | 1–10 | No |
| 6 | Dietary notes | Long text | | No |`);
  assert.equal(qs.length, 6);
  assert.equal(by("Your name").required, true);
  assert.equal(by("Will you attend?").type, "radio");
  assert.deepEqual(opts("Will you attend?"), ["Yes", "No", "Maybe"]);
  assert.equal(by("Meal preference").type, "select");
  assert.equal(by("Meal preference").required, false);
  assert.match(r.html, /data-cl-label="How excited are you\?"[^>]*data-cl-scale="10"/);
  assert.equal(by("Dietary notes").type, "textarea");
});

test("JSON in a code fence: title, fields with types and options, the button", () => {
  const { r, by, opts } = read('```json\n{"title":"Customer Feedback","description":"Help us improve.","fields":[{"label":"Name","type":"text","required":true},{"label":"How likely are you to recommend us?","type":"rating","min":0,"max":10},{"label":"Which features do you use?","type":"checkbox","options":["Forms","Meetings"]},{"label":"Plan","type":"select","options":[{"label":"Free"},{"label":"Pro"}]}],"submit_text":"Send feedback"}\n```');
  assert.equal(r.name, "Customer Feedback");
  assert.equal(by("Name").required, true);
  assert.match(r.html, /data-cl-scale="10" data-cl-style="numbers" data-cl-zero/, "0 to 10");
  assert.equal(by("Which features do you use?").type, "multi");
  assert.deepEqual(opts("Plan"), ["Free", "Pro"]);
  assert.equal(by("Plan").type, "select");
  assert.ok(r.html.includes("Help us improve.") && r.html.includes(">Send feedback</button>"));
});

test("fields listed as bullets under bold sections; types read from their words", () => {
  const { by, opts, r } = read(`**Job Application**

**Personal Details**
- Full name (required)
- Email address (required)
- Phone
- LinkedIn profile

**Experience**
- Position applying for: Designer / Developer / Marketer
- Years of experience (number)
- Upload your resume
- Why do you want to work with us?`);
  assert.equal(r.name, "Job Application");
  assert.equal(by("Full name").required, true);
  assert.ok(r.html.includes('type="url"'), "LinkedIn is a link");
  assert.deepEqual(opts("Position applying for"), ["Designer", "Developer", "Marketer"]);
  assert.ok(r.html.includes('type="number"'));
  assert.ok(r.html.includes('data-cl-field="file"'));
  assert.equal(by("Why do you want to work with us?").type, "textarea");
});

test("Q1: style with Type, Required and Options lines; Step headings make pages; a) b) options", () => {
  const { r, by, opts } = read(`Workshop Sign-Up

Step 1: About you
Q1: What's your first name?
Type: Short answer
Required: Yes
Q2: Which session would you like to join?
Options: Morning, Afternoon, Evening

Step 2: Preferences
Q3: Pick the topics you care about (check all that apply)
a) Design
b) Growth
Q4: Preferred start time`);
  assert.equal(r.name, "Workshop Sign-Up");
  assert.equal(r.pages, 2);
  assert.equal(by("What's your first name?").required, true);
  assert.deepEqual(opts("Which session would you like to join?"), ["Morning", "Afternoon", "Evening"]);
  assert.equal(by("Pick the topics you care about").type, "multi");
  assert.ok(r.html.includes('data-cl-field="time"'));
});

test("plain questions, one per line, with Yes/No and a 1 to 5 list read as a rating", () => {
  const { by, opts, r } = read(`What's your name?
Have you used Claritia before? (Yes/No)
How would you rate us?
1 - Poor
2
3
4
5 - Great`);
  assert.equal(by("What's your name?").type, "text");
  assert.deepEqual(opts("Have you used Claritia before?"), ["Yes", "No"]);
  assert.match(r.html, /data-cl-label="How would you rate us\?"[^>]*data-cl-scale="5" data-cl-style="numbers" data-cl-low="Poor" data-cl-high="Great"/);
  const pets = read("1. Favorite pet?\n1. Cats\n2. Dogs\n3. Birds\n2. Your email");
  assert.deepEqual(pets.opts("Favorite pet?"), ["Cats", "Dogs", "Birds"], "numbered choices keep their words and lose their numbers");
  assert.equal(pets.by("Your email").save, "email", "the next numbered question still starts a question");
});

test("words with HTML stay words; a paste with no questions, or too many, says so", () => {
  const { r } = read("1. Your <script>alert(1)</script> name\n2. Email");
  assert.ok(!r.html.includes("<script>"));
  assert.ok(r.html.includes("&lt;script&gt;"));
  assert.throws(() => importPasted("Sure! I can help with that.\n\nLet me know what kind of form you want."), /No questions found/);
  assert.throws(() => importPasted(""), /No questions found/);
  assert.throws(() => importPasted(Array.from({ length: 201 }, (_, i) => `${i + 1}. Question ${i + 1}?`).join("\n")), /more than 200/);
  // Past the limit, the rest is cut off rather than read.
  const long = `1. Name\n${"x".repeat(PASTE_MAX)}\n2. Never read?`;
  assert.ok(!importPasted(long).html.includes("Never read"));
});
