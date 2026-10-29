import assert from "node:assert/strict";
import { test } from "node:test";
import { afterProblem, buildForm, cleanCopy, cleanExtra, defaults, fillFrom, formName, GOAL_CHOICES, GOALS, PICKS, PLACES, QUESTIONS, readQuestion, readSentence, summaryLine, togglePick, withGoal, type Answers, type Goal } from "../src/lib/forms/interview.ts";
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

test("a new goal takes its own fields, keeps a chosen redirect and the ticked qualifying questions", () => {
  const a = { ...defaults("demo"), after: { kind: "redirect" as const, url: "https://acme.com/x" } };
  const b = withGoal(a, "newsletter");
  assert.deepEqual(b.fields, []);
  assert.deepEqual(b.after, a.after);
  assert.equal(buildForm(b).consent.mode, "always");
  const c = withGoal({ ...defaults("demo"), fields: [...defaults("demo").fields, { pick: "budget", required: false }] }, "contact");
  assert.deepEqual(c.fields.map((f) => f.pick), ["name", "company", "phone", "message", "budget"]);
});

test("five questions, seven goals offered, and the form is named from the goal", () => {
  assert.deepEqual(QUESTIONS.map((q) => q.id), ["goal", "fields", "qualify", "after", "send"]);
  assert.deepEqual(GOAL_CHOICES.map((g) => GOALS[g].label), ["Book demos", "Contact sales", "Free trial", "Newsletter", "Event", "Download", "Other"]);
  assert.equal(formName({ ...defaults("demo"), place: "pricing" }), "Demo request");
  assert.equal(formName(defaults("event")), "Event signup");
});

test("a sentence settles the questions it answers", () => {
  const tools = [{ id: "s1", kind: "hubspot", name: "HubSpot" }];
  const r = readSentence("Demo form for the pricing page with phone and company size, work emails only, two steps, book on Calendly, send to HubSpot", tools);
  assert.deepEqual(r.settled, ["goal", "fields", "after", "send"]);
  assert.equal(r.answers.goal, "demo");
  assert.equal(r.answers.place, "pricing");
  assert.ok(r.answers.fields.some((f) => f.pick === "phone"));
  assert.equal(r.answers.steps, "two");
  assert.equal(r.answers.workOnly, true);
  assert.deepEqual(r.answers.after, { kind: "meeting", tool: "calendly", url: "", perOwner: true });
  assert.deepEqual(r.answers.send.sources, ["s1"]);
  ok(r.answers);
  assert.deepEqual(readSentence("something for my site").settled, []);
  assert.equal(readSentence("newsletter signup").answers.goal, "newsletter");
  assert.deepEqual(readSentence("ask their budget and timeline").settled, ["qualify"]);
  assert.deepEqual(readSentence("just show a thank-you message").found.after, { kind: "message" });
});

test("a sentence laid over answers given keeps what it doesn't mention", () => {
  const given: Answers = { ...defaults("demo"), after: { kind: "message" }, send: { sources: ["s1", "s2"], slack: "", webhook: "" } };
  // A new goal takes its own contact fields, but the next step already answered stays.
  const r = fillFrom(given, readSentence("contact sales form").found, ["goal", "fields", "after"]);
  assert.deepEqual(r.settled, ["goal"]);
  assert.equal(r.answers.goal, "contact");
  assert.deepEqual(r.answers.after, { kind: "message" });
  assert.deepEqual(r.answers.send.sources, ["s1", "s2"]);
  // Without an answer to keep, the goal's usual next step comes with it.
  assert.equal(fillFrom(defaults("contact"), readSentence("demo form").found).answers.after.kind, "meeting");
  // Named fields are added, not swapped, and a split name pushes out a full name.
  const named = fillFrom(defaults("contact"), readSentence("add first name and budget").found);
  assert.deepEqual(named.settled, ["fields", "qualify"]);
  assert.deepEqual(named.answers.fields.map((f) => f.pick), ["company", "phone", "message", "budget", "name_split"]);
  ok(named.answers);
  // The same goal again changes nothing else.
  assert.deepEqual(fillFrom(given, readSentence("a demo form").found, ["after"]).answers, given);
});

test("ticking a name swaps the other kind of name", () => {
  const f = togglePick([{ pick: "name", required: true }, { pick: "company", required: false }], "name_split");
  assert.deepEqual(f.map((x) => x.pick), ["company", "name_split"]);
  assert.deepEqual(togglePick(f, "name_split").map((x) => x.pick), ["company"]);
  assert.deepEqual(togglePick(f, "name").map((x) => x.pick), ["company", "name"]);
});

test("after the submit: a page needs a working address, a booking link can wait but must fit the tool", () => {
  assert.equal(afterProblem({ kind: "message" }), null);
  assert.ok(afterProblem({ kind: "redirect", url: "" }));
  assert.ok(afterProblem({ kind: "redirect", url: "  " }));
  assert.ok(afterProblem({ kind: "redirect", url: "acme.com/thanks" }));
  assert.ok(afterProblem({ kind: "redirect", url: "http://acme.com/thanks" }));
  assert.equal(afterProblem({ kind: "redirect", url: " https://acme.com/thanks " }), null);
  assert.equal(afterProblem({ kind: "meeting", tool: "calendly", url: "", perOwner: true }), null);
  assert.equal(afterProblem({ kind: "meeting", tool: "calendly", url: "https://cal.com/acme", perOwner: false }), "That isn't a Calendly link.");
  assert.ok(afterProblem({ kind: "meeting", tool: "calendly", url: "calendly.com/acme", perOwner: false }));
  assert.equal(afterProblem({ kind: "meeting", tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false }), null);
  assert.equal(afterProblem({ kind: "meeting", tool: "link", url: "https://acme.com/book", perOwner: false }), null);
});

test("the summary line counts the fields the form really has", () => {
  const names = { s1: "HubSpot", s2: "Salesforce" };
  assert.equal(summaryLine({ ...defaults("demo"), send: { sources: ["s1"], slack: "", webhook: "" } }, names), "Demo request: 6 fields, books on Calendly, sends to HubSpot");
  assert.equal(summaryLine(defaults("newsletter"), names), "Newsletter: 1 field, shows a message, saves to Claritia");
  // A full name and a split name ticked together count once, as the form builds them.
  const both: Answers = { ...defaults("contact"), fields: [{ pick: "name", required: false }, { pick: "name_split", required: false }], after: { kind: "redirect", url: "https://www.acme.com/thanks" }, send: { sources: ["s1", "s2", "s3"], slack: "", webhook: "" } };
  assert.equal(summaryLine(both, names), "Contact sales: 3 fields, goes to acme.com, sends to HubSpot, Salesforce and a tool");
  assert.equal(summaryLine({ ...defaults("demo"), after: { kind: "meeting", tool: "link", url: "", perOwner: true } }), "Demo request: 6 fields, books a meeting, saves to Claritia");
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

test("book on Claritia's calendar for picked routing rules: the form gets a routed Claritia booking that passes the check", async () => {
  const { afterProblem, buildForm, defaults } = await import("../src/lib/forms/interview.ts");
  const { checkForm } = await import("../src/lib/forms/schema.ts");
  const type = "0192f3a1-0000-7000-8000-0000000000aa";
  const after = { kind: "meeting" as const, tool: "claritia" as const, url: "", perOwner: false, meetingTypeId: type, routeRules: ["r_ent", "fallback"] };
  assert.equal(afterProblem(after), null);
  assert.equal(afterProblem({ ...after, meetingTypeId: undefined }), "Pick a meeting type.");
  const f = buildForm({ ...defaults("demo"), after });
  assert.deepEqual(f.after.schedule, { tool: "claritia", url: "", perOwner: false, meetingTypeId: type, who: "routed", routeRules: ["r_ent", "fallback"] });
  const r = checkForm(f);
  assert.ok("form" in r, "errors" in r ? r.errors.join(" ") : "");
  // No rules picked: everyone books.
  assert.equal(buildForm({ ...defaults("demo"), after: { ...after, routeRules: [] } }).after.schedule?.who, undefined);
});
