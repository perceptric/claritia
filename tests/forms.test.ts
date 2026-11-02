// Forms (docs/form-templates.md): every template passes the go-live check, answers are checked the way the server
// checks them, logic hides what it should, answers map onto contacts with the right consent, contact fields are
// planned without writing bad data, and Tailor only ever changes words.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { answerText, checkAnswers, checkOne } from "../src/lib/forms/answers.ts";
import { findTemplates, industryCounts, templateById, templateBySlug, templateSlug, TEMPLATES } from "../src/lib/forms/catalog.ts";
import { consentFor, toContact } from "../src/lib/forms/contact.ts";
import { applyRemap, planFields } from "../src/lib/forms/fields.ts";
import { bandFor, maxScore, score, shown, shownPages } from "../src/lib/forms/logic.ts";
import { qaCheck, sampleAnswers } from "../src/lib/forms/qa.ts";
import { checkSchema, cloneSchema, keyFrom, slugFor, SLUG_RE } from "../src/lib/forms/schema.ts";
import { applyTailor, tailorKey, tailorPrompt } from "../src/lib/forms/tailor.ts";
import { INDUSTRIES, type FormSchema } from "../src/lib/forms/types.ts";

const form = (fields: FormSchema["pages"][0]["fields"], extra: Partial<FormSchema> = {}): FormSchema => ({ v: 1, title: "T", pages: [{ fields }], submit: "Send", end: { title: "Thanks", text: "" }, ...extra });

test("catalog: 150 templates over 24 industries, unique ids and page slugs, 39 featured", () => {
  assert.equal(TEMPLATES.length, 150);
  const counts = industryCounts();
  assert.equal(Object.keys(counts).length, 24);
  for (const i of INDUSTRIES) assert.ok(counts[i.value] >= 3, `${i.label} has templates`);
  assert.equal(new Set(TEMPLATES.map((t) => t.id)).size, 150);
  assert.equal(new Set(TEMPLATES.map(templateSlug)).size, 150);
  assert.equal(TEMPLATES.filter((t) => t.featured).length, 39);
  for (const t of TEMPLATES) {
    assert.equal(templateById(t.id), t);
    assert.equal(templateBySlug(templateSlug(t)), t);
    assert.ok(t.blurb.length > 10 && t.blurb.length < 90, `${t.id} blurb`);
  }
});

test("every template passes the go-live check with a fresh workspace's fields", () => {
  for (const t of TEMPLATES) {
    const plan = planFields(t.schema, []);
    const schema = applyRemap(t.schema, plan.remap);
    const custom = plan.create.map((c) => ({ key: c.key, label: c.label, type: c.type as never, options: c.options }));
    assert.deepEqual(checkSchema(schema), [], t.id);
    assert.deepEqual(qaCheck(schema, { custom }), [], t.id);
  }
});

test("lead and booking templates always reach a contact; internal ones skip consent", () => {
  for (const t of TEMPLATES.filter((x) => (x.tags.includes("lead") || x.tags.includes("booking")) && !x.internal)) {
    const email = t.schema.pages.flatMap((p) => p.fields).find((f) => f.map === "email");
    assert.ok(email, `${t.id} maps an email`);
    assert.ok(email!.required && !email!.show, `${t.id} email is required and always shown`);
  }
  assert.ok(TEMPLATES.some((t) => t.internal));
  assert.ok(TEMPLATES.filter((t) => t.phi).every((t) => ["healthcare", "wellness", "fitness"].includes(t.industry)));
});

test("search: industry, use case and words; featured first in All", () => {
  assert.equal(findTemplates({ industry: "legal" }).length, 5);
  assert.ok(findTemplates({ tag: "quiz" }).every((t) => t.tags.includes("quiz")));
  assert.ok(findTemplates({ text: "solar roof" }).some((t) => t.id === "solar.savings-check"));
  assert.equal(findTemplates({ text: "zzzz-no-match" }).length, 0);
  const all = findTemplates({ industry: "all" });
  assert.ok(all.slice(0, 39).every((t) => t.featured));
});

test("keys and slugs", () => {
  const taken = new Set<string>();
  assert.equal(keyFrom("What's this about?", taken), "whats_this_about");
  assert.equal(keyFrom("What's this about?", taken), "whats_this_about_2");
  assert.equal(keyFrom("123 go", new Set()), "go");
  assert.equal(keyFrom("!!!", new Set()), "field");
  let n = 0;
  const s = slugFor("Demo request — Q3!", () => (n++ % 7) / 7);
  assert.match(s, /^demo-request-q3-[a-z2-9]{6}$/);
  assert.ok(SLUG_RE.test(s));
});

test("answers: each kind is checked and cleaned", () => {
  assert.deepEqual(checkOne({ key: "e", kind: "email", label: "E" }, "nope"), { error: "Enter a valid email." });
  assert.deepEqual(checkOne({ key: "u", kind: "url", label: "U" }, "acme.com"), { value: "https://acme.com" });
  assert.deepEqual(checkOne({ key: "n", kind: "number", label: "N", min: 1, max: 10 }, "11"), { error: "Enter 10 or less." });
  assert.deepEqual(checkOne({ key: "m", kind: "money", label: "M" }, "$1,250"), { value: 1250 });
  assert.deepEqual(checkOne({ key: "s", kind: "single", label: "S", options: ["A", "B"] }, "c"), { error: "Pick one of the options." });
  assert.deepEqual(checkOne({ key: "s", kind: "single", label: "S", options: ["A", "B"] }, "a"), { value: "A" });
  assert.deepEqual(checkOne({ key: "s", kind: "single", label: "S", options: ["A"], other: true }, "Something else"), { value: "Something else" });
  assert.deepEqual(checkOne({ key: "m", kind: "multi", label: "M", options: ["A", "B"] }, ["b", "A", "B"]), { value: ["B", "A"] });
  assert.deepEqual(checkOne({ key: "r", kind: "ranking", label: "R", options: ["A", "B"] }, ["B"]), { error: "Put every option in order." });
  assert.deepEqual(checkOne({ key: "d", kind: "date", label: "D" }, "2026-02-30"), { error: "Enter a date." });
  assert.deepEqual(checkOne({ key: "d", kind: "date_range", label: "D" }, { from: "2026-03-02", to: "2026-03-01" }), { error: "The end comes before the start." });
  assert.deepEqual(checkOne({ key: "t", kind: "time", label: "T" }, "24:00"), { error: "Enter a time." });
  assert.deepEqual(checkOne({ key: "p", kind: "phone", label: "P" }, "call me"), { error: "Enter a valid phone number." });
  assert.deepEqual(checkOne({ key: "a", kind: "agree", label: "A" }, false), {});
  assert.deepEqual(checkOne({ key: "x", kind: "nps", label: "X" }, 11), { error: "Pick a value." });
  assert.deepEqual(checkOne({ key: "f", kind: "file", label: "F" }, [{ name: "a", path: "", size: 11 * 1024 * 1024, type: "x" }]), { error: "Files can be up to 10 MB." });
  assert.deepEqual(checkOne({ key: "f", kind: "file", label: "F", maxFiles: 1 }, [{ name: "a", path: "", size: 1, type: "x" }, { name: "b", path: "", size: 1, type: "x" }]), { error: "Add one file." });
  assert.deepEqual(checkOne({ key: "x", kind: "matrix", label: "X", rows: ["R"], options: ["Good"] }, { R: "Bad" }), { error: "Answer each row." });
});

test("answers: required, logic and pages", () => {
  const s: FormSchema = {
    v: 1,
    title: "T",
    pages: [
      { fields: [{ key: "pets", kind: "yes_no", label: "Pets?", required: true }, { key: "which", kind: "short_text", label: "Which?", required: true, show: { key: "pets", op: "is", value: true } }] },
      { fields: [{ key: "name", kind: "name", label: "Name", required: true }, { key: "rate", kind: "matrix", label: "Rate", rows: ["A", "B"], options: ["1", "2"], required: true }] },
    ],
    submit: "Send",
    end: { title: "Thanks", text: "" },
  };
  assert.deepEqual(checkAnswers(s, {}, { page: 0 }).errors, { pets: "Pick yes or no." });
  assert.deepEqual(checkAnswers(s, { pets: true }, { page: 0 }).errors, { which: "Fill this in." });
  const off = checkAnswers(s, { pets: false, which: "a cat", name: { first: "A" }, rate: { A: "1", B: "2" } });
  assert.deepEqual(off.errors, {});
  assert.equal(off.answers.which, undefined, "a hidden field's answer is dropped");
  assert.deepEqual(checkAnswers(s, { pets: false, name: { last: "B" }, rate: { A: "1" } }).errors, { name: "Fill this in.", rate: "Answer each row." });
  assert.deepEqual(checkAnswers(s, { pets: false, nope: "x", name: { first: "A" }, rate: { A: "1", B: "1" } }).answers.nope, undefined, "unknown keys go");
  // A chain: c shows on b, which shows on a. Hiding b hides c too.
  const chain = form([
    { key: "a", kind: "yes_no", label: "A" },
    { key: "b", kind: "short_text", label: "B", show: { key: "a", op: "is", value: true } },
    { key: "c", kind: "short_text", label: "C", show: { key: "b", op: "answered" } },
  ]);
  assert.deepEqual([...shown(chain, { a: false, b: "x", c: "y" }).keys], ["a"]);
  assert.deepEqual([...shown(chain, { a: true, b: "x" }).keys], ["a", "b", "c"]);
  // A page whose fields are all hidden is skipped.
  const two: FormSchema = { ...chain, pages: [{ fields: [chain.pages[0]!.fields[0]!] }, { fields: chain.pages[0]!.fields.slice(1) }] };
  assert.deepEqual(shownPages(two, { a: false }), [0]);
  assert.deepEqual(shownPages(two, { a: true }), [0, 1]);
});

test("quiz scores and bands", () => {
  const t = templateById("finance.risk-quiz")!;
  const keys = t.schema.pages[0]!.fields.filter((f) => f.points).map((f) => f.key);
  const top = Object.fromEntries(keys.map((k) => [k, t.schema.pages[0]!.fields.find((f) => f.key === k)!.options!.at(-1)!]));
  assert.equal(score(t.schema, top), maxScore(t.schema));
  assert.equal(bandFor(t.schema, maxScore(t.schema))?.title, "Growth investor");
  assert.equal(bandFor(t.schema, 0)?.title, "Careful investor");
  const it = templateById("it.security-quiz")!;
  const yes = Object.fromEntries(it.schema.pages[0]!.fields.filter((f) => f.kind === "yes_no").map((f) => [f.key, true]));
  assert.equal(score(it.schema, yes), 5);
  assert.equal(score(form([{ key: "a", kind: "short_text", label: "A" }]), {}), null);
});

test("contact: names, company from website or work email, custom fields, temporary emails refused", () => {
  const t = templateById("saas.contact-sales")!;
  const plan = planFields(t.schema, []);
  const custom = plan.create.map((c) => ({ key: c.key, label: c.label, type: c.type as never, options: c.options }));
  const r = toContact(t.schema, { name: { first: " Ada ", last: "L" }, email: "Ada@Analytical.io", company: "Analytical", how_many_seats: 12, timeline: "within a month", budget_per_year: "nope" }, { custom });
  assert.ok(r && "contact" in r);
  assert.equal(r.contact.first_name, "Ada");
  assert.equal(r.contact.email_clean, "ada@analytical.io");
  assert.equal(r.contact.company_name, "Analytical");
  assert.equal(r.contact.company_domain, "analytical.io");
  assert.deepEqual(r.contact.fields, { seats: 12, timeline: "Within a month" }, "a value that isn't an option is left out");
  const free = toContact(t.schema, { email: "ada@gmail.com" }, { custom });
  assert.ok(free && "contact" in free && free.contact.company_domain === undefined, "a free email names no company");
  const site = toContact(form([{ key: "e", kind: "email", label: "E", map: "email" }, { key: "w", kind: "url", label: "W", map: "website" }]), { e: "a@gmail.com", w: "https://www.Acme.com/about" }, { custom: [] });
  assert.ok(site && "contact" in site && site.contact.company_domain === "acme.com");
  const temp = toContact(t.schema, { email: "x@mailinator.com" }, { custom });
  assert.deepEqual(temp, { field: "email", error: "Use an email you'll keep. Temporary addresses can't be used." });
  assert.equal(toContact(form([{ key: "a", kind: "short_text", label: "A" }]), { a: "x" }, { custom: [] }), null, "no email question, no contact");
});

test("consent: the opt-in box in strict regions, the notice elsewhere, nothing when off", () => {
  assert.deepEqual(consentFor({}, "strict", false, "DE")?.basis, "none");
  assert.deepEqual(consentFor({}, "strict", true, "DE")?.basis, "opt_in");
  assert.equal(consentFor({}, "strict", true, "DE")?.explicit, true);
  assert.equal(consentFor({}, "notice", false, "US")?.basis, "legitimate_interest");
  assert.equal(consentFor({}, "notice", false, "FR")?.basis, "none", "a contact who says they're in France gets the strict rule");
  assert.equal(consentFor({ consent_text: "Yes, email me." }, "strict", true, "DE")?.wording, "Yes, email me.");
  assert.equal(consentFor({ consent_off: true }, "notice", false, "US"), null);
});

test("contact fields: make missing ones, extend pick lists, never write into another type", () => {
  const t = templateById("saas.demo-request")!;
  const fresh = planFields(t.schema, []);
  assert.deepEqual(fresh.create.map((c) => c.key).sort(), ["current_tool", "team_size", "timeline"]);
  const extend = planFields(t.schema, [{ key: "team_size", label: "Team size", type: "select", options: ["Just me", "2–10"] }]);
  assert.deepEqual(extend.extend, [{ key: "team_size", options: ["11–50", "51–200", "201–1,000", "1,000+"] }]);
  const clash = planFields(t.schema, [{ key: "team_size", label: "Team size", type: "number", options: [] }]);
  assert.equal(clash.remap["f.team_size"], "f.team_size_2");
  assert.equal(clash.create.find((c) => c.key === "team_size_2")?.type, "select");
  const again = planFields(t.schema, [{ key: "team_size", label: "Team size", type: "number", options: [] }, { key: "team_size_2", label: "Team size", type: "select", options: [] }]);
  assert.equal(again.remap["f.team_size"], "f.team_size_2");
  assert.ok(!again.create.some((c) => c.key.startsWith("team_size")), "the moved field is reused");
  assert.ok(planFields(form([{ key: "e", kind: "email", label: "Email", map: "f.email" }]), []).create.length === 0 || planFields(form([{ key: "e", kind: "email", label: "Email", map: "f.email" }]), []).remap["f.email"] !== "f.email", "a built-in key is never made as a custom field");
  assert.ok(JSON.stringify(applyRemap(t.schema, clash.remap)).includes('"f.team_size_2"'));
});

test("the go-live check catches broken forms", () => {
  assert.deepEqual(qaCheck(form([{ key: "a", kind: "single", label: "A", options: [] }])), ["“A” needs options."]);
  assert.ok(qaCheck(form([{ key: "b", kind: "short_text", label: "B", show: { key: "zzz", op: "answered" } }])).some((e) => /isn't before it/.test(e)));
  assert.ok(qaCheck(form([{ key: "e", kind: "email", label: "E", map: "email" }, { key: "f", kind: "email", label: "F", map: "email" }])).length > 0);
  assert.ok(checkSchema(form([{ key: "n", kind: "name", label: "N", map: "email" }])).some((e) => /can't fill Email/.test(e)));
  assert.ok(checkSchema(form([{ key: "s", kind: "statement", label: "S" }])).includes("Add a question."));
  assert.ok(checkSchema({ ...form([{ key: "a", kind: "short_text", label: "A" }]), end: { title: "T", text: "", redirect: "http://x.com" } }).some((e) => /https/.test(e)));
  const all = sampleAnswers(templateById("real_estate.rental-application")!.schema);
  assert.ok(all.tell_us_about_your_pets, "sample answers follow conditions");
});

test("tailor: words change, keys, kinds, maps and points don't; conditions follow renamed options", () => {
  const t = templateById("saas.churn-survey")!;
  const reasons = t.schema.pages[0]!.fields.find((f) => f.key === "main_reason_for_leaving")!;
  const out = {
    title: "Why you're leaving Bloom",
    submit: "Send",
    end_title: "Thanks",
    end_text: "We hear you.",
    fields: [{ key: "main_reason_for_leaving", label: "Main reason", options: reasons.options!.map((o) => `${o} (Bloom)`) }, { key: "email", label: "Your email" }, { key: "made_up", label: "Ignored" }],
  };
  const next = applyTailor(t.schema, out);
  assert.equal(next.title, "Why you're leaving Bloom");
  const r2 = next.pages[0]!.fields.find((f) => f.key === "main_reason_for_leaving")!;
  assert.equal(r2.options![3], "Switched tools (Bloom)");
  const follow = next.pages[0]!.fields.find((f) => f.show?.key === "main_reason_for_leaving" && f.label.startsWith("Which tool"))!;
  assert.equal(follow.show!.value, "Switched tools (Bloom)");
  assert.deepEqual(next.pages.flatMap((p) => p.fields.map((f) => [f.key, f.kind, f.map])), t.schema.pages.flatMap((p) => p.fields.map((f) => [f.key, f.kind, f.map])));
  assert.equal(next.pages.flatMap((p) => p.fields).length, t.schema.pages.flatMap((p) => p.fields).length);
  // Options of the wrong count or with repeats are ignored.
  const bad = applyTailor(t.schema, { ...out, fields: [{ key: "main_reason_for_leaving", label: "X", options: ["A", "A", "B", "C", "D", "E"] }] });
  assert.deepEqual(bad.pages[0]!.fields[1]!.options, reasons.options);
  // The template itself never changes.
  assert.equal(templateById("saas.churn-survey")!.schema.title, "Churn survey");
  assert.equal(tailorKey(t.schema, "A florist"), tailorKey(cloneSchema(t.schema), "A florist"));
  assert.notEqual(tailorKey(t.schema, "A florist"), tailorKey(t.schema, "A baker"));
  assert.ok(!tailorPrompt(t.schema, "x").includes("f.churn_reason"), "Claude never sees the mapping");
});

test("answers as text", () => {
  assert.equal(answerText({ kind: "name" }, { first: "Ada", last: "L" }), "Ada L");
  assert.equal(answerText({ kind: "ranking" }, ["A", "B"]), "A > B");
  assert.equal(answerText({ kind: "yes_no" }, false), "No");
  assert.equal(answerText({ kind: "file" }, [{ name: "cv.pdf", path: "p", size: 1, type: "x" }]), "cv.pdf");
});

test("forms use the app's own dropdowns and dialogs", () => {
  for (const dir of ["src/components/forms", "src/components/app/views"]) {
    for (const f of readdirSync(dir).filter((x) => /^(Form|Gallery|Dropdown|Signature|FieldInput|Hosted)/.test(x))) {
      const src = readFileSync(`${dir}/${f}`, "utf8");
      assert.ok(!/<select[\s>]/.test(src), `${f} uses <select>`);
      assert.ok(!/window\.(prompt|confirm|alert)\(/.test(src), `${f} uses a browser pop-up`);
    }
  }
});
