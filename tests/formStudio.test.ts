// The form studio's schema (docs/form-studio.md 2.4 and Part 3): content blocks, field checks, CRM links, field
// looks, and who sees the calendar after the submit.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp } from "../src/lib/forms/ops.ts";
import { WORK_EMAIL, showsMeeting, type Schedule } from "../src/lib/forms/schedule.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { checkAnswers, OTHER } from "../src/lib/forms/values.ts";

const EMAIL: Field = { id: "e", key: "email", type: "email", label: "Work email", required: true };
const withFields = (fields: unknown[], extra: Partial<Form> = {}) => ({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL, ...fields] }], ...extra });
const ok = (raw: unknown) => {
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const errs = (raw: unknown) => {
  const r = checkForm(raw);
  return "errors" in r ? r.errors.join(" ") : "";
};
const field = (form: Form, id: string) => allFields(form).find((f) => f.id === id)!;

test("content blocks keep their text, save nothing and can't be required", () => {
  const f = ok(withFields([
    { id: "h", type: "heading", label: "", key: "q.whatever", required: true, content: { text: "Talk to sales", level: 1 } },
    { id: "p", type: "paragraph", label: "", content: { text: "We reply in a day." } },
    { id: "d", type: "divider", label: "" },
    { id: "i", type: "image", label: "", content: { src: "https://cdn.acme.com/a.png", alt: "Team" } },
  ]));
  assert.deepEqual(field(f, "h"), { id: "h", key: "c.h", type: "heading", label: "Heading", required: false, content: { text: "Talk to sales", level: 1 } });
  assert.equal(field(f, "i").content?.src, "https://cdn.acme.com/a.png");
  assert.match(errs(withFields([{ id: "h", type: "heading", label: "" }])), /heading is empty/);
  assert.match(errs(withFields([{ id: "i", type: "image", label: "", content: { src: "http://x.com/a.png" } }])), /https/);
  // A step of only content still needs a real field.
  assert.match(errs({ ...emptyForm(), steps: [{ id: "s1", fields: [EMAIL] }, { id: "s2", fields: [{ id: "h", type: "heading", label: "", content: { text: "Hi" } }] }] }), /Step 2 has no fields/);
  // Content never shows up in the answers.
  assert.deepEqual(checkAnswers(f, { e: "a@acme.com", h: "x" }).values, { email: "a@acme.com" });
});

test("rules can show a heading but never depend on or require one", () => {
  const base = withFields([{ id: "q", key: "q.size", type: "text", label: "Size" }, { id: "h", type: "heading", label: "", content: { text: "Big team" } }]);
  assert.equal(errs({ ...base, rules: [{ id: "r1", when: { field: "q", op: "filled" }, then: { action: "show", field: "h" } }] }), "");
  assert.match(errs({ ...base, rules: [{ id: "r1", when: { field: "h", op: "filled" }, then: { action: "show", field: "q" } }] }), /can't depend on a heading/);
  assert.match(errs({ ...base, rules: [{ id: "r1", when: { field: "q", op: "filled" }, then: { action: "require", field: "h" } }] }), /can't be required/);
});

test("field checks are cleaned by type, and impossible ones are errors", () => {
  const f = ok({ ...emptyForm(), steps: [{ id: "s1", fields: [{ ...EMAIL, valid: { domains: ["@Acme.com", "bad domain", "acme.com"] } }] }] });
  assert.deepEqual(field(f, "e").valid, { domains: ["acme.com"] });
  const g = ok(withFields([
    { id: "t", key: "q.why", type: "text", label: "Why", valid: { min: "3", max: 10.4, domains: ["x.com"], step: 2 } },
    { id: "n", key: "q.seats", type: "number", label: "Seats", valid: { min: 1, max: 500, step: 5 } },
    { id: "d", key: "q.when", type: "date", label: "When", valid: { earliest: "2026-01-01", latest: "nope", weekdays: true } },
  ]));
  assert.deepEqual(field(g, "t").valid, { min: 3, max: 10 });
  assert.deepEqual(field(g, "n").valid, { min: 1, max: 500, step: 5 });
  assert.deepEqual(field(g, "d").valid, { earliest: "2026-01-01", weekdays: true });
  assert.match(errs(withFields([{ id: "t", key: "q.why", type: "text", label: "Why", valid: { min: 9, max: 2 } }])), /lowest is above the highest/);
});

test("answers meet each field's checks, with the field's own words for errors", () => {
  const form = ok({
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { ...EMAIL, valid: { domains: ["acme.com"] } },
          { id: "t", key: "q.why", type: "text", label: "Why", valid: { min: 3, max: 8, message: "Say a bit more." } },
          { id: "n", key: "q.seats", type: "number", label: "Seats", valid: { min: 1, max: 500, step: 5 } },
          { id: "d", key: "q.when", type: "date", label: "When", valid: { earliest: "2026-01-01", weekdays: true } },
          { id: "m", key: "q.tools", type: "multi", label: "Tools", options: ["A", "B", "C"], valid: { min: 2, max: 2 } },
          { id: "r", key: "q.fit", type: "rating", label: "Fit", rating: { scale: 4 } },
          { id: "q", key: "q.role", type: "dropdown", label: "Role", options: ["Sales", "Ops"], other: true, required: true, valid: { requiredMessage: "Pick your role." } },
        ],
      },
    ],
  });
  const bad = checkAnswers(form, { e: "jo@gmail.com", t: "no", n: "7", d: "2026-01-03", m: ["A"], r: "5" }).errors;
  assert.equal(bad.e, "Use an email at an allowed company domain.");
  assert.equal(bad.t, "Say a bit more.");
  assert.equal(bad.n, "Use steps of 5.");
  assert.equal(bad.d, "Pick a weekday.");
  assert.equal(bad.m, "Pick at least 2.");
  assert.equal(bad.r, "Pick 1 to 4.");
  assert.equal(bad.q, "Pick your role.");
  const good = checkAnswers(form, { e: "jo@eu.acme.com", t: "growth", n: "10", d: "2026-01-05", m: ["A", "C"], r: 4, q: `${OTHER}Founder` });
  assert.deepEqual(good.errors, {});
  assert.equal(good.values["q.role"], "Other: Founder");
  // "Other" only counts on a field that offers it.
  const noOther = ok(withFields([{ id: "q", key: "q.role", type: "choice", label: "Role", options: ["Sales"] }]));
  assert.equal(checkAnswers(noOther, { e: "a@b.co", q: `${OTHER}Founder` }).errors.q, "Pick from the list.");
});

test("a default must be one of a list's choices", () => {
  assert.equal(field(ok(withFields([{ id: "q", key: "q.role", type: "dropdown", label: "Role", options: ["Sales", "Ops"], default: "Ops" }])), "q").default, "Ops");
  assert.match(errs(withFields([{ id: "q", key: "q.role", type: "dropdown", label: "Role", options: ["Sales"], default: "CEO" }])), /starts on a choice/);
});

test("CRM links and overwrite rules are checked", () => {
  const src = "5e7c1d2a-0000-4000-8000-000000000001";
  const f = ok(withFields([{ id: "c", key: "company", type: "text", label: "Company", overwrite: "never", crm: { source: src, property: "company", label: "Company name", type: "string" } }]));
  assert.deepEqual(field(f, "c").crm, { source: src, property: "company", label: "Company name", type: "string" });
  assert.equal(field(f, "c").overwrite, "never");
  assert.match(errs(withFields([{ id: "c", key: "q.notes", type: "text", label: "Notes", overwrite: "always" }])), /nothing to overwrite/);
  assert.match(errs(withFields([{ id: "c", key: "company", type: "text", label: "Company", crm: { source: "x", property: "company" } }])), /CRM field that can't be read/);
  assert.match(errs(withFields([{ id: "c", key: "company", type: "text", label: "Company", crm: { source: src, property: "drop table;" } }])), /CRM field that can't be read/);
});

test("look settings and widths survive the checker", () => {
  const f = ok(withFields([{ id: "a", key: "first_name", type: "text", label: "First", width: "third", hideLabel: true, labels: "inside", size: "lg", hideOnPhone: true }, { id: "b", key: "q.x", type: "text", label: "X", width: "wide" }]));
  assert.deepEqual(
    (({ width, hideLabel, labels, size, hideOnPhone }) => ({ width, hideLabel, labels, size, hideOnPhone }))(field(f, "a")),
    { width: "third", hideLabel: true, labels: "inside", size: "lg", hideOnPhone: true },
  );
  assert.equal(field(f, "b").width, undefined);
  const l = ok({ ...withFields([]), layout: { labels: "above", width: "wide", progress: "dots", maxWidth: 99999 } });
  assert.deepEqual(l.layout, { labels: "above", width: "wide", progress: "dots", maxWidth: 1200 });
});

test("adding and retyping content through ops keeps keys right", () => {
  let f = ok(withFields([{ id: "q", key: "q.why", type: "text", label: "Why" }]));
  const added = applyOp(f, { op: "add_field", field: { type: "heading", label: "Heading", content: { text: "Hi" } }, id: "hh" });
  assert.ok("form" in added);
  f = added.form;
  assert.equal(field(f, "hh").key, "c.hh");
  const back = applyOp(f, { op: "update_field", id: "hh", patch: { type: "text", label: "Team size" } });
  assert.ok("form" in back);
  assert.equal(field(back.form, "hh").key, "q.team_size");
  const dd = applyOp(f, { op: "add_field", field: { type: "dropdown", label: "Role" } });
  assert.ok("form" in dd);
  assert.deepEqual(allFields(dd.form).at(-1)!.options, [{ value: "Option 1", label: "Option 1" }]);
});

test("who sees the calendar: rules match on answers, and a skipped question never books", () => {
  const s: Schedule = { tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, who: "match", rules: [{ field: "size", op: "gte", value: "50" }, { field: WORK_EMAIL, op: "is" }] };
  assert.equal(showsMeeting(s, { size: "120" }, true), true);
  assert.equal(showsMeeting(s, { size: "120" }, false), false, "free mail with a big team");
  assert.equal(showsMeeting(s, { size: "10" }, true), false);
  assert.equal(showsMeeting(s, {}, true), false, "the size was skipped");
  assert.equal(showsMeeting(s, { size: "lots" }, true), false, "an answer that isn't a number");
  assert.equal(showsMeeting({ ...s, any: true }, { size: "10" }, true), true);
  assert.equal(showsMeeting({ ...s, rules: [{ field: "role", op: "is_not", value: "Student" }] }, {}, true), false, "is_not on a skipped answer");
  assert.equal(showsMeeting({ ...s, rules: [{ field: "role", op: "empty" }] }, {}, true), true);
  assert.equal(showsMeeting({ ...s, who: "all" }, {}, false), true);
  assert.equal(showsMeeting({ ...s, rules: [] }, {}, false), true, "match with no rules shows to everyone");
});

test("booking rules are checked against the form's fields", () => {
  const sched = (rules: unknown[]) => ({ ...withFields([{ id: "sz", key: "q.size", type: "number", label: "Size" }]), after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, who: "match", rules, heading: "Pick a time", prefill: false } } });
  const f = ok(sched([{ field: "sz", op: "gte", value: "50" }, { field: WORK_EMAIL, op: "is" }]));
  assert.deepEqual(f.after.schedule, { tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, who: "match", rules: [{ field: "sz", op: "gte", value: "50" }, { field: WORK_EMAIL, op: "is" }], heading: "Pick a time", prefill: false });
  assert.match(errs(sched([{ field: "gone", op: "filled" }])), /field that's gone/);
  assert.match(errs(sched([{ field: "sz", op: "gte", value: "many" }])), /number that isn't one/);
  assert.match(errs(sched([])), /add a rule/);
});
