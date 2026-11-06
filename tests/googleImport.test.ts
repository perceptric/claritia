// Import from Google Forms (docs/integrations-plan.md, Next step 13; src/lib/forms/googleImport.ts): a forms.get
// answer with every item type becomes a Studio page whose questions read back with the right type, options, required
// and pages; what has no match is named in the notes; and the links and Google's refusals read clearly.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkForm, type Form } from "../src/lib/forms/schema.ts";
import { googleError, googleFormId, importGoogleForm, type GoogleForm } from "../src/lib/forms/googleImport.ts";
import { pageForm } from "../src/lib/studio/page.ts";
import { DEFAULT_BRAND_CSS } from "../src/lib/studio/brandDefault.ts";

const FIXTURE: GoogleForm = {
  formId: "1FAIpQLSf_abcdefghijklmnopqrstuvwxyz0123",
  info: { title: "Event sign-up", description: "Tell us about you." },
  settings: { emailCollectionType: "RESPONDER_INPUT", quizSettings: { isQuiz: true } },
  items: [
    { title: "Your name", questionItem: { question: { required: true, textQuestion: {} } } },
    { title: "Anything else?", description: "Optional notes", questionItem: { question: { textQuestion: { paragraph: true } } } },
    { title: "Ticket", questionItem: { question: { required: true, choiceQuestion: { type: "RADIO", options: [{ value: "General" }, { value: "VIP" }, { isOther: true }] } } } },
    { title: "Sessions", questionItem: { question: { choiceQuestion: { type: "CHECKBOX", options: [{ value: "Morning" }, { value: "Afternoon" }] } } } },
    { title: "Shirt size", questionItem: { question: { choiceQuestion: { type: "DROP_DOWN", options: [{ value: "S" }, { value: "M" }, { value: "L" }] } } } },
    { pageBreakItem: {}, title: "About the event", description: "A few more questions." },
    { title: "How likely are you to come back?", questionItem: { question: { scaleQuestion: { low: 0, high: 10, lowLabel: "Not likely", highLabel: "Very likely" } } } },
    { title: "Rate the venue", questionItem: { question: { ratingQuestion: { ratingScaleLevel: 5, iconType: "STAR" } } } },
    { title: "Arrival day", questionItem: { question: { dateQuestion: { includeYear: true } } } },
    { title: "Arrival time", questionItem: { question: { timeQuestion: {} } } },
    { title: "Rate each part", questionGroupItem: { questions: [{ required: true, rowQuestion: { title: "Talks" } }, { rowQuestion: { title: "Food" } }], grid: { columns: { type: "RADIO", options: [{ value: "Poor" }, { value: "Good" }, { value: "Great" }] } } } },
    { title: "Your CV", questionItem: { question: { fileUploadQuestion: {} } } },
    { title: "House rules", description: "Be kind.", textItem: {} },
    { title: "Welcome video", videoItem: { video: { youtubeUri: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } } },
    { title: "Venue map", imageItem: { image: { contentUri: "https://lh3.googleusercontent.com/x", altText: "Map" } } },
    { title: "Mystery question", questionItem: { question: {} } },
  ],
};

const fieldsOf = (html: string, css: string) => {
  const r = checkForm(pageForm({ html, css, brand: DEFAULT_BRAND_CSS, after: { kind: "thanks" } }).form);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return (r.form as Form).steps.flatMap((s) => s.fields);
};

test("every Google item type becomes its Studio question, with its options and required kept", () => {
  const r = importGoogleForm(FIXTURE);
  assert.equal(r.name, "Event sign-up");
  assert.equal(r.pages, 2);
  assert.equal((r.html.match(/<section data-cl-step/g) ?? []).length, 2);
  assert.match(r.html, /data-cl-next/);
  assert.match(r.html, /data-cl-back/);
  const f = fieldsOf(r.html, r.css);
  const by = (label: string) => f.find((x) => x.label === label)!;
  assert.equal(by("Email").key, "email");
  assert.equal(by("Email").required, true);
  assert.deepEqual([by("Your name").type, by("Your name").required], ["text", true]);
  assert.equal(by("Anything else?").type, "textarea");
  assert.deepEqual([by("Ticket").type, by("Ticket").options?.map((o) => o.label), by("Ticket").required], ["choice", ["General", "VIP", "Other"], true]);
  assert.deepEqual([by("Sessions").type, by("Sessions").options?.length], ["multi", 2]);
  assert.deepEqual([by("Shirt size").type, by("Shirt size").options?.map((o) => o.label)], ["dropdown", ["S", "M", "L"]]);
  const scale = by("How likely are you to come back?");
  assert.deepEqual([scale.type, scale.rating?.scale, scale.rating?.style, scale.rating?.zero, scale.rating?.low, scale.rating?.high], ["rating", 10, "numbers", true, "Not likely", "Very likely"]);
  assert.deepEqual([by("Rate the venue").type, by("Rate the venue").rating?.scale], ["rating", 5]);
  assert.equal(by("Arrival day").type, "date");
  assert.equal(by("Arrival time").type, "time");
  const grid = by("Rate each part");
  assert.equal(grid.type, "grid");
  assert.equal(grid.required, true);
  assert.equal(by("Your CV").type, "file");
  assert.equal(by("Mystery question").type, "text");
  assert.match(r.html, /<h3 class="heading">House rules<\/h3><p class="text">Be kind\.<\/p>/);
  assert.match(r.html, /data-cl-field="video"[^>]*data-cl-src="https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ"/);
  assert.equal(r.questions, 13);
});

test("what has no match, and what changed on the way, is named in the notes", () => {
  const r = importGoogleForm(FIXTURE);
  assert.ok(r.notes.some((n) => /quiz/i.test(n)));
  assert.ok(r.notes.some((n) => /"Mystery question" had no match/.test(n)));
  assert.ok(r.notes.some((n) => /image "Venue map" wasn't copied/.test(n)));
  const odd = importGoogleForm({ info: { title: "T" }, items: [{ title: "When", questionItem: { question: { dateQuestion: { includeTime: true } } } }, { title: "Grid", questionGroupItem: { questions: [{ rowQuestion: { title: "A" } }], grid: { columns: { type: "CHECKBOX", options: [{ value: "x" }] } } } }] });
  assert.ok(odd.notes.some((n) => /date and a time/.test(n)));
  assert.ok(odd.notes.some((n) => /several per row/.test(n)));
  assert.equal(odd.pages, 1);
  assert.doesNotMatch(odd.html, /data-cl-step/);
});

test("a form with no email asks none; labels with markup stay text", () => {
  const r = importGoogleForm({ info: { title: "<b>Poll</b>" }, items: [{ title: 'Pick "one" <i>now</i>', questionItem: { question: { choiceQuestion: { type: "RADIO", options: [{ value: "A & B" }] } } } }] });
  assert.doesNotMatch(r.html, /type="email"/);
  assert.match(r.html, /&lt;b&gt;Poll&lt;\/b&gt;/);
  assert.match(r.html, /value="A &amp; B"/);
  assert.doesNotMatch(r.html, /<i>now<\/i>/);
});

test("the link: the edit link or its id; the fill-in link and Google's refusals say what to do", () => {
  assert.equal(googleFormId("https://docs.google.com/forms/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit"), "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
  assert.equal(googleFormId(" 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 "), "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
  assert.equal(googleFormId("https://docs.google.com/forms/d/e/1FAIpQLSe_x/viewform"), null);
  assert.equal(googleFormId("not a link"), null);
  assert.match(googleError(403), /can't open that form/);
  assert.match(googleError(404), /isn't there/);
  assert.match(googleError(500, "Backend"), /500: Backend/);
});
