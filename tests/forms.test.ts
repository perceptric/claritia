// Forms (docs/form-builder.md): the schema checker, edits with their checks, answer checks, rules and brand tokens.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanColor, cleanFontUrl, cleanTokens, contrast, DEFAULT_TOKENS, fixContrast, tokensCss } from "../src/lib/forms/brand.ts";
import { applyOp, applyStrict, describeOp, keyFor } from "../src/lib/forms/ops.ts";
import { allFields, checkForm, emptyForm, safeUrl, visibility, type Form } from "../src/lib/forms/schema.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";
import { checkAnswers, cleanWebsite, contactParts } from "../src/lib/forms/values.ts";

const ok = (raw: unknown, ctx = {}) => {
  const r = checkForm(raw, ctx);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const errs = (raw: unknown, ctx = {}) => {
  const r = checkForm(raw, ctx);
  return "errors" in r ? r.errors : [];
};

test("every template passes the checker", () => {
  for (const t of TEMPLATES) assert.deepEqual(errs(t.form()), [], t.name);
});

test("a form needs an email field, labels, known types and unique keys", () => {
  const f = emptyForm();
  assert.deepEqual(errs(f), []);
  assert.match(errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "q.x", type: "text", label: "Name" }] }] }).join(), /Add an email field/);
  assert.match(errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "email", type: "email", label: "" }] }] }).join(), /needs a label/);
  assert.match(errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "email", type: "email", label: "E" }, { id: "b", key: "q.x", type: "script", label: "X" }] }] }).join(), /unknown type/);
  assert.match(
    errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "email", type: "email", label: "E" }, { id: "b", key: "email", type: "email", label: "E2" }] }] }).join(),
    /same place|repeated/,
  );
  assert.match(errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "email", type: "text", label: "E" }] }] }).join(), /can't be a short answer/);
  assert.match(errs({ ...f, steps: [{ id: "s1", fields: [{ id: "a", key: "email", type: "email", label: "E" }, { id: "b", key: "drop table", type: "text", label: "X" }] }] }).join(), /bad key/);
});

test("custom field keys must exist in the workspace", () => {
  const f = ok(TEMPLATES[0].form());
  const withCustom = applyOp(f, { op: "add_field", field: { type: "text", label: "Budget", key: "f.budget" } });
  assert.ok("form" in withCustom);
  assert.match(errs(withCustom.form, { custom: [{ key: "industry" }] }).join(), /no longer exists/);
  assert.deepEqual(errs(withCustom.form, { custom: [{ key: "budget" }] }), []);
});

test("text is cut to its limits, unknown keys are dropped, and a script in a label stays plain text", () => {
  const f = emptyForm();
  f.steps[0].fields[0].label = "<script>alert(1)</script>" + "x".repeat(500);
  const out = ok({ ...f, evil: true, steps: [{ ...f.steps[0], fields: [{ ...f.steps[0].fields[0], onclick: "x" }] }] });
  assert.equal((out as unknown as Record<string, unknown>).evil, undefined);
  assert.equal(out.steps[0].fields[0].label.length, 300);
  assert.ok(out.steps[0].fields[0].label.startsWith("<script>"));
  assert.equal((out.steps[0].fields[0] as unknown as Record<string, unknown>).onclick, undefined);
});

test("a redirect after the submit needs https", () => {
  const f = emptyForm();
  assert.match(errs({ ...f, after: { end: { kind: "redirect", url: "javascript:alert(1)" } } }).join(), /https/);
  assert.match(errs({ ...f, after: { end: { kind: "redirect", url: "http://evil.com" } } }).join(), /https/);
  assert.deepEqual(errs({ ...f, after: { end: { kind: "redirect", url: "https://acme.com/thanks" } } }), []);
  assert.equal(safeUrl("https://user:pw@acme.com"), false);
});

test("rules: show, hide and require follow the answers, and hidden fields drop out", () => {
  let f = ok(TEMPLATES[0].form());
  const size = allFields(f).find((x) => x.key === "q.company_size")!;
  const need = allFields(f).find((x) => x.key === "q.looking_for")!;
  const r = applyStrict(f, { op: "set_rule", rule: { when: { field: size.id, op: "is", value: "1,000+" }, then: { action: "show", field: need.id } } });
  assert.ok("form" in r);
  f = r.form;
  assert.equal(visibility(f, {}).shown.has(need.id), false);
  assert.equal(visibility(f, { [size.id]: "1,000+" }).shown.has(need.id), true);
  const req = applyOp(f, { op: "set_rule", rule: { when: { field: size.id, op: "filled" }, then: { action: "require", field: need.id } } });
  assert.ok("form" in req);
  const email = allFields(f).find((x) => x.key === "email")!;
  const answers = { [email.id]: "ana@acme.com", [allFields(f)[1].id]: "Ana", [allFields(f)[2].id]: "Diaz", [need.id]: "secret" };
  // Hidden by the rule: the answer is dropped, not saved.
  assert.equal(checkAnswers(f, answers).values["q.looking_for"], undefined);
  assert.equal(checkAnswers(req.form, { ...answers, [size.id]: "1,000+", [need.id]: "" }).errors[need.id], "Fill this in.");
  assert.match(errs({ ...f, rules: [{ id: "r1", when: { field: email.id, op: "filled" }, then: { action: "hide", field: email.id } }] }).join(), /own field|can't be hidden/);
});

test("answers: types, required, choices and step-by-step checks", () => {
  const f = ok(TEMPLATES[1].form());
  const [name, email, phone, company, msg] = allFields(f);
  const r = checkAnswers(f, { [name.id]: "Ana Diaz", [email.id]: "nope", [phone.id]: "abc", [company.id]: "" });
  assert.equal(r.errors[email.id], "Enter a valid email.");
  assert.equal(r.errors[phone.id], "Enter a valid phone number.");
  assert.equal(r.errors[company.id], "Fill this in.");
  assert.equal(r.errors[msg.id], "Fill this in.");
  const good = checkAnswers(f, { [name.id]: " Ana  Diaz ", [email.id]: "ana@acme.com", [phone.id]: "+1 (415) 555-0132", [company.id]: "Acme", [msg.id]: "Hi" });
  assert.deepEqual(good.errors, {});
  const parts = contactParts(good.values);
  assert.equal(parts.first_name, "Ana");
  assert.equal(parts.last_name, "Diaz");
  assert.equal(parts.company_name, "Acme");

  const partner = ok(TEMPLATES.find((t) => t.key === "partner")!.form());
  const type = allFields(partner).find((x) => x.type === "choice")!;
  assert.equal(checkAnswers(partner, { [type.id]: "Hacker" }).errors[type.id], "Pick from the list.");

  const event = ok(TEMPLATES.find((t) => t.key === "event")!.form());
  const firstStepOnly = checkAnswers(event, { [event.steps[0].fields[0].id]: "a@b.co", [event.steps[0].fields[1].id]: "A B" }, { steps: [0] });
  assert.deepEqual(firstStepOnly.errors, {});
  assert.ok(Object.keys(checkAnswers(event, {}, { steps: [1] }).errors).length === 1);
});

test("websites and hidden fields", () => {
  assert.equal(cleanWebsite("acme.com"), "https://acme.com/");
  assert.equal(cleanWebsite("javascript:alert(1)"), null);
  assert.equal(cleanWebsite("not a site"), null);
  const f = emptyForm();
  const r = applyOp(f, { op: "add_field", field: { type: "hidden", label: "Source", key: "q.src", hidden: { from: "param", name: "utm_source" } } });
  assert.ok("form" in r);
  const hidden = allFields(r.form).find((x) => x.type === "hidden")!;
  assert.equal(checkAnswers(r.form, { [hidden.id]: "typed by a bot" }, { hidden: { [hidden.id]: "linkedin" } }).values["q.src"], "linkedin");
});

test("ops: keys follow labels and types, the email stays, a removed field takes its rules", () => {
  const f = emptyForm();
  assert.equal(keyFor({ type: "text", label: "First name" }, f), "first_name");
  assert.equal(keyFor({ type: "phone", label: "Mobile" }, f), "phone");
  assert.equal(keyFor({ type: "text", label: "What's your budget?" }, f), "q.what_s_your_budget");
  assert.equal(keyFor({ type: "email", label: "Other email" }, f), "q.other_email");
  const email = f.steps[0].fields[0];
  assert.deepEqual(applyOp(f, { op: "remove_field", id: email.id }), { error: "The email field stays, so each answer reaches a contact." });
  const a = applyOp(f, { op: "add_field", field: { type: "text", label: "Company" } });
  assert.ok("form" in a);
  const company = allFields(a.form)[1];
  const b = applyOp(a.form, { op: "set_rule", rule: { when: { field: email.id, op: "filled" }, then: { action: "show", field: company.id } } });
  assert.ok("form" in b);
  const c = applyOp(b.form, { op: "remove_field", id: company.id });
  assert.ok("form" in c);
  assert.equal(c.form.rules.length, 0);
  // The input form is never changed.
  assert.equal(allFields(a.form).length, 2);
  assert.equal(describeOp({ op: "update_field", id: company.id, patch: { required: true } }, a.form), "Made Company required");
});

test("strict ops refuse changes that break the form, and allow ones that leave it no worse", () => {
  const f: Form = emptyForm();
  const bad = applyStrict(f, { op: "add_field", field: { type: "choice", label: "", options: [] } });
  assert.ok("error" in bad);
  const unknown = applyStrict(f, { op: "set_after", end: { kind: "redirect", url: "ftp://x" } });
  assert.ok("error" in unknown);
  const fine = applyStrict(f, { op: "add_field", field: { type: "choice", label: "Plan", options: ["Free", "Pro"] } });
  assert.ok("form" in fine);
  assert.deepEqual(allFields(fine.form)[1].options, [{ value: "Free", label: "Free" }, { value: "Pro", label: "Pro" }]);
});

test("brand tokens: only colors, sizes, weights and safe font names get through", () => {
  assert.equal(cleanColor("#ABC"), "#aabbcc");
  assert.equal(cleanColor("#aabbccff"), "#aabbcc");
  assert.equal(cleanColor("rgb(17, 34, 51)"), "#112233");
  assert.equal(cleanColor("rgba(17,34,51,0.5)"), "#11223380");
  assert.equal(cleanColor("red; } body { display:none"), null);
  assert.equal(cleanColor("url(javascript:1)"), null);
  assert.equal(cleanFontUrl("https://fonts.googleapis.com/css2?family=Inter:wght@400;600"), "https://fonts.googleapis.com/css2?family=Inter:wght@400;600");
  assert.equal(cleanFontUrl("https://evil.com/css2"), null);
  const { tokens, dropped } = cleanTokens({ text: "expression(alert(1))", font: "Inter;}*{x:y", radius: "999px", buttonWeight: 650, buttonBg: "#0055FF" });
  assert.equal(tokens.text, DEFAULT_TOKENS.text);
  assert.equal(tokens.font, DEFAULT_TOKENS.font);
  assert.equal(tokens.radius, 32);
  assert.equal(tokens.buttonWeight, 700);
  assert.equal(tokens.buttonBg, "#0055ff");
  assert.deepEqual(dropped.sort(), ["font", "text"]);
  const css = tokensCss({ text: "red;}", buttonBg: "#0055ff" });
  assert.ok(!css.includes("red;}"));
  assert.ok(css.includes("--clr-btn-bg:#0055ff;"));
});

test("contrast: unreadable pairs are fixed to WCAG AA and noted", () => {
  assert.ok(contrast("#000000", "#ffffff") > 20);
  const { tokens, notes } = fixContrast({ ...DEFAULT_TOKENS, text: "#dddddd", buttonBg: "#ffee00", buttonText: "#ffffff" });
  assert.ok(contrast(tokens.text, tokens.background) >= 4.5);
  assert.ok(contrast(tokens.buttonText, tokens.buttonBg) >= 4.5);
  assert.equal(notes.length, 2);
  const dark = fixContrast({ ...DEFAULT_TOKENS, background: "#0b0b0b", text: "#333333", muted: "#444444", error: "#c4320a" });
  assert.ok(contrast(dark.tokens.text, "#0b0b0b") >= 4.5);
});
