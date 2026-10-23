import assert from "node:assert/strict";
import { test } from "node:test";
import { buildForm, cleanCopy, cleanExtra, defaults, GOALS, PICKS, PLACES, readQuestion, readSentence, withGoal, type Answers, type Goal } from "../src/lib/forms/interview.ts";
import { allFields, checkForm } from "../src/lib/forms/schema.ts";

const ok = (a: Answers, copy = {}) => {
  const f = buildForm(a, copy);
  const r = checkForm(f);
  assert.ok("form" in r, `${JSON.stringify(a)}: ${"errors" in r ? r.errors.join(" ") : ""}`);
  assert.deepEqual(r.form, f, "the built form is already clean");
  return f;
};

test("every goal, place, step choice and next step builds a form that passes the check unchanged", () => {
  const afters: Answers["after"][] = [
    { kind: "message" },
    { kind: "redirect", url: "https://acme.com/thanks" },
    { kind: "meeting", tool: "calendly", url: "", perOwner: true },
    { kind: "meeting", tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false },
    { kind: "meeting", tool: "calcom", url: "https://cal.com/acme", perOwner: false },
  ];
  for (const goal of Object.keys(GOALS) as Goal[])
    for (const { value: place } of PLACES)
      for (const steps of ["one", "two"] as const)
        for (const after of afters)
          for (const workOnly of [true, false]) ok({ ...defaults(goal), place, steps, after, workOnly });
});

test("every field at once, required or not, with written questions, still passes", () => {
  for (const required of [true, false]) {
    const a: Answers = {
      ...defaults("other"),
      fields: PICKS.map((p) => ({ pick: p.value, required })),
      extra: [
        { label: "Which CRM do you use?", type: "choice", options: ["HubSpot", "Salesforce", "HubSpot"], required },
        { label: "Which CRM do you use?", type: "multi", options: [], required },
        { label: "Tell us more", type: "textarea", required },
        { label: "Seats", type: "number", required },
        { label: "Launch date", type: "date", required },
        { label: "Agree to the terms", type: "checkbox", required },
      ],
      steps: "two",
    };
    const f = ok(a);
    assert.equal(f.steps[0].fields[0].key, "email", "email comes first");
    assert.ok(!allFields(f).some((x) => x.key === "name"), "a split name wins over a full name");
    assert.equal(new Set(allFields(f).map((x) => x.key)).size, allFields(f).length, "no two fields save to the same place");
  }
});

test("the same answers always build the same form", () => {
  const a = { ...defaults("demo"), steps: "two" as const };
  assert.deepEqual(buildForm(a), buildForm(structuredClone(a)));
});

test("a new goal takes its own fields and keeps a chosen redirect", () => {
  const a = { ...defaults("demo"), after: { kind: "redirect" as const, url: "https://acme.com/x" } };
  const b = withGoal(a, "newsletter");
  assert.deepEqual(b.fields, []);
  assert.deepEqual(b.after, a.after);
  assert.equal(buildForm(b).consent.mode, "always");
});

test("a first sentence settles the questions it answers", () => {
  const tools = [{ id: "s1", kind: "hubspot", name: "HubSpot" }];
  const r = readSentence("Demo form for the pricing page with phone and company size, work emails only, two steps, book on Calendly, send to HubSpot", tools);
  assert.deepEqual(r.settled, ["goal", "place", "fields", "work", "steps", "after", "send"]);
  assert.equal(r.answers.goal, "demo");
  assert.equal(r.answers.place, "pricing");
  assert.ok(r.answers.fields.some((f) => f.pick === "phone"));
  assert.equal(r.answers.steps, "two");
  assert.deepEqual(r.answers.after, { kind: "meeting", tool: "calendly", url: "", perOwner: true });
  assert.deepEqual(r.answers.send.sources, ["s1"]);
  ok(r.answers);
  assert.deepEqual(readSentence("something for my site").settled, []);
  assert.equal(readSentence("newsletter signup").answers.goal, "newsletter");
});

test("a written question becomes the right kind of field", () => {
  assert.deepEqual(readQuestion("Which CRM do you use? (HubSpot, Salesforce, Other)"), { label: "Which CRM do you use?", type: "choice", options: ["HubSpot", "Salesforce", "Other"], required: false });
  assert.equal(readQuestion("Tell us about your team").type, "textarea");
  assert.equal(readQuestion("How many seats do you need?").type, "number");
  assert.deepEqual(readQuestion("Do you use Slack?").options, ["Yes", "No"]);
  assert.equal(readQuestion("What's your role").type, "text");
});

test("AI output is cleaned before it touches the form", () => {
  assert.equal(cleanExtra({ type: "choice", label: "Pick", options: ["A"] }, "x")?.type, "text");
  assert.equal(cleanExtra({ type: "nope", label: "x" }, "x"), null);
  const f = buildForm(defaults("demo"));
  const c = cleanCopy({ submit: "x".repeat(99), labels: [{ id: "email", label: "Your work email" }, { id: "ghost", label: "Nope" }] }, f);
  assert.equal(c.submit?.length, 40);
  assert.deepEqual(c.labels, { email: "Your work email" });
  assert.equal(allFields(ok(defaults("demo"), c)).find((x) => x.id === "email")?.label, "Your work email");
});
