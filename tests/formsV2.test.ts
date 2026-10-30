// Forms, the same way as Calendar (docs/forms-plan.md): what the new screens rest on. Choice values mapped to a CRM's
// pick list (and what the send does with them, including when the CRM's fields couldn't be read), the consent box
// that must be ticked, double opt-in, the bot check that always shows, throwaway emails held in Spam, booking for
// every lead Routing gives a rep, the six New form cards, and the builder's model of questions, places to save,
// problems and publish checks.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp, type Op } from "../src/lib/forms/ops.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";
import { REP, routedBooks, type Schedule } from "../src/lib/forms/schedule.ts";
import { STARTERS } from "../src/lib/forms/templates.ts";
import { crmPlan, mapChoices, type CrmProperty } from "../src/lib/sources/properties.ts";
import {
  autoMap,
  choiceRows,
  claritiaDests,
  CONSENT_ID,
  issuesOf,
  kindOf,
  kindPatch,
  knownOp,
  newQuestion,
  publishChecks,
  questionsOf,
  rulesReading,
  saveName,
  showOps,
  showRules,
  splitNameOps,
  whereWords,
  type CrmCtx,
} from "../src/components/app/forms/formModel.ts";

const SRC = "11111111-1111-4111-8111-111111111111";
const ok = (raw: unknown, ctx = {}) => {
  const r = checkForm(raw, ctx);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};
const run = (f: Form, ops: Op[]) =>
  ops.reduce((cur, op) => {
    const r = applyOp(cur, op);
    if ("error" in r) throw new Error(r.error);
    return r.form;
  }, f);
const SIZES = ["1–10", "11–50", "51–200", "201–500", "500+"].map((v) => ({ value: v, label: v }));
const HS_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"].map((v) => ({ value: v, label: v }));
const sizeProp: CrmProperty = { name: "numemployees", label: "Number of employees", kind: "enum", options: HS_SIZES };

/** A form with an email and a company size that also goes to HubSpot. */
function sizeForm(map?: Record<string, string>, type: Field["type"] = "choice"): Form {
  const f = emptyForm();
  f.steps[0]!.fields.push({ id: "size", key: "q.size", type, label: "Company size", required: false, options: SIZES, crm: { source: SRC, property: "numemployees", label: "Number of employees", ...(map ? { map } : {}) } });
  return f;
}

test("a pick list's map to the CRM's values is kept on choice questions and dropped elsewhere", () => {
  const f = ok(sizeForm({ "1–10": "1-10", "500+": "", "": "x" }));
  assert.deepEqual(allFields(f)[1]!.crm!.map, { "1–10": "1-10", "500+": "" }, "an empty choice key goes; an empty value means don't send");
  const text = emptyForm();
  text.steps[0]!.fields.push({ id: "co", key: "q.co", type: "text", label: "Company", required: false, crm: { source: SRC, property: "company", map: { a: "b" } } });
  assert.equal(allFields(ok(text))[1]!.crm!.map, undefined, "text answers have no choices to map");
  assert.equal(allFields(ok(sizeForm({ a: 5 as unknown as string })))[1]!.crm!.map, undefined, "a value that isn't text is dropped");
});

test("the send uses the map: a mapped choice goes as the CRM's value, a 'don't send' choice goes as nothing", () => {
  const f = ok(sizeForm({ "1–10": "1-10", "11–50": "11-50", "500+": "" }));
  const sent = crmPlan(f, { email: "ana@acme.com", "q.size": "11–50" }, SRC, "hubspot", [sizeProp]);
  assert.deepEqual(sent.send.map((s) => [s.property, s.value]), [["numemployees", "11-50"]]);
  assert.deepEqual(sent.skip, []);
  const none = crmPlan(f, { "q.size": "500+" }, SRC, "hubspot", [sizeProp]);
  assert.deepEqual(none, { send: [], skip: [] }, "a choice mapped to don't send is left out, not an error");
  const unmapped = crmPlan(f, { "q.size": "201–500" }, SRC, "hubspot", [sizeProp]);
  assert.equal(unmapped.send.length, 0);
  assert.match(unmapped.skip[0]!.reason, /isn't one of its options/, "an unmapped choice still says why it can't go");
  // The CRM's fields couldn't be read (a slow or failed read): the mapped value still goes, raw, and the CRM decides.
  const blind = crmPlan(f, { "q.size": "1–10" }, SRC, "hubspot", null);
  assert.deepEqual(blind.send.map((s) => s.value), ["1-10"]);
  assert.deepEqual(mapChoices(["1–10", "500+", "Other"], { "1–10": "1-10", "500+": "" }), ["1-10", "Other"], "many picks map one by one; don't send drops one");
  assert.equal(mapChoices("x", undefined), "x");
});

test("the consent box can be required and confirmed by email, only while there's a box", () => {
  const f = run(emptyForm(), [{ op: "set_consent", mode: "by_region", required: true, confirm: true }]);
  assert.deepEqual(ok(f).consent, { mode: "by_region", label: f.consent.label, required: true, confirm: true });
  const off = run(f, [{ op: "set_consent", mode: "off" }]);
  assert.equal(off.consent.required, undefined);
  assert.equal(off.consent.confirm, undefined);
  assert.equal(ok({ ...emptyForm(), consent: { mode: "notice", label: "x", required: true } }).consent.required, undefined, "a notice has no box to tick");
  assert.equal(run(f, [{ op: "set_consent", required: false }]).consent.required, undefined);
});

test("the bot check always shows only with the check on; throwaway emails can be held", () => {
  const f = run(emptyForm(), [{ op: "set_spam", turnstile: true, bot: "always", throwaway: "hold" }]);
  assert.equal(ok(f).spam.bot, "always");
  assert.equal(ok(f).spam.throwaway, "hold");
  assert.equal(run(f, [{ op: "set_spam", turnstile: false }]).spam.bot, undefined, "no check, nothing to show");
  assert.equal(run(f, [{ op: "set_spam", bot: "auto" }]).spam.bot, undefined);
  assert.equal(run(f, [{ op: "set_spam", throwaway: "refuse" }]).spam.throwaway, undefined);
  assert.equal(ok({ ...emptyForm(), spam: { minSeconds: 2, turnstile: false, bot: "always" } }).spam.bot, undefined);
});

const fill = (form: Form, email: string, consent: Record<string, unknown> = {}) => prepareSubmit(form, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { [allFields(form)[0]!.id]: email }, consent, ms: 9000 }, { custom: [] });

test("a throwaway address is refused with a message, or held in Spam when the form says so", () => {
  const refuse = fill(ok(emptyForm()), "x8f2k@mailinator.com");
  assert.ok("errors" in refuse);
  assert.match(Object.values(refuse.errors)[0]!, /keep/);
  const held = fill(ok(run(emptyForm(), [{ op: "set_spam", throwaway: "hold" }])), "x8f2k@mailinator.com");
  assert.ok("args" in held);
  assert.equal(held.args.p_spam, "throwaway");
  assert.equal(held.args.p_contact, null, "held fills make no contact");
  const fine = fill(ok(run(emptyForm(), [{ op: "set_spam", throwaway: "hold" }])), "ana@acme.com");
  assert.ok("args" in fine && fine.args.p_spam === null && fine.args.p_contact, "a real address goes through as before");
});

test("a required consent box must come back ticked wherever it shows, and an unknown country counts as shown", () => {
  const f = ok(run(emptyForm(), [{ op: "set_consent", mode: "by_region", required: true }]));
  const unticked = fill(f, "ana@acme.com", { given: false });
  assert.ok("error" in unticked && unticked.status === 400);
  // The browser sent nothing (an old script, a bot): no country known, so the box showed and wasn't ticked.
  assert.ok("error" in fill(f, "ana@acme.com"));
  assert.ok("args" in fill(f, "ana@acme.com", { given: true }));
  const us = prepareSubmit(f, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { [allFields(f)[0]!.id]: "ana@acme.com" }, consent: {}, ms: 9000 }, { custom: [] }, { country: "US" });
  assert.ok("args" in us, "outside the EU and UK the box doesn't show, so it can't be required");
  const always = ok(run(emptyForm(), [{ op: "set_consent", mode: "always", required: true }]));
  assert.ok("error" in prepareSubmit(always, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { [allFields(always)[0]!.id]: "ana@acme.com" }, consent: {}, ms: 9000 }, { custom: [] }, { country: "US" }));
  // Spam is held before the box matters, so a bot that skips it still lands in Spam, not in an error.
  const bot = prepareSubmit(f, 1, { v: 1, version: 1, key: "k".repeat(20), answers: { [allFields(f)[0]!.id]: "ana@acme.com" }, consent: {}, ms: 10, trap: "" }, { custom: [] });
  assert.ok("args" in bot && bot.args.p_spam === "too_fast");
});

test("booking for every lead Routing gives a rep, and a routing timeout still books", () => {
  const s: Schedule = { tool: "claritia", url: "", perOwner: false, who: "routed", routeRules: [REP] };
  assert.equal(routedBooks(s, { kind: "owner", rule: "r1", by: "queue" }), true);
  assert.equal(routedBooks(s, { kind: "owner", rule: null, by: "keep" }), true, "a rep they already have counts");
  assert.equal(routedBooks(s, { kind: "unassigned" }), false);
  assert.equal(routedBooks(s, { kind: "held" }), false);
  assert.equal(routedBooks(s, null), true, "routing didn't answer in time: a missed booking costs more");
  assert.ok(!("errors" in checkForm({ ...emptyForm(), after: { ...emptyForm().after, schedule: { ...s, meetingTypeId: "0192f3a1-0000-7000-8000-0000000000ee" } } })));
});

test("the six New form cards pass the checker and say how many questions they have", () => {
  assert.deepEqual(STARTERS.map((s) => s.key), ["demo", "contact", "audit", "newsletter", "event", "blank"]);
  for (const s of STARTERS) {
    const f = ok(s.form());
    // Counted as the card draws them: the questions, with the consent box when it always shows.
    assert.equal(allFields(f).length + (f.consent.mode === "always" ? 1 : 0), s.questions, s.name);
  }
});

test("questions as the builder shows them: a first and last name are one, and the consent box is one", () => {
  const f = emptyForm();
  f.steps[0]!.fields.push({ id: "fn", key: "first_name", type: "text", label: "First name", required: true, width: "half" }, { id: "ln", key: "last_name", type: "text", label: "Last name", required: true, width: "half" }, { id: "co", key: "company", type: "text", label: "Company", required: false });
  const qs = questionsOf(f);
  assert.deepEqual(qs.map((q) => [q.id, q.kind]), [[allFields(f)[0]!.id, "email"], ["fn", "name"], ["co", "company"], [CONSENT_ID, "consent"]]);
  assert.equal(qs[1]!.pair?.id, "ln");
  assert.equal(kindOf({ type: "textarea", key: "q.x" }), "long");
  assert.equal(kindOf({ type: "rating", key: "q.x" }), "other");
  // Joined back into one box, then apart again: the same keys each time.
  const joined = run(f, splitNameOps(f, qs[1]!, false));
  assert.deepEqual(allFields(joined).map((x) => x.key), ["email", "name", "company"]);
  const apart = run(joined, splitNameOps(joined, questionsOf(joined)[1]!, true));
  assert.deepEqual(allFields(apart).map((x) => x.key), ["email", "first_name", "last_name", "company"]);
  assert.equal(newQuestion("email", f), null, "one email question");
  assert.equal(newQuestion("company", f)!.key, undefined, "Company is taken, so a new one keeps its own key");
});

test("changing a question's type keeps its key when it still fits, and email stays one", () => {
  const f = sizeForm();
  const size = allFields(f)[1]!;
  assert.deepEqual(kindPatch(f, size, "dropdown"), { type: "dropdown", key: "q.size", options: SIZES });
  assert.equal(kindPatch(f, size, "email"), null, "the form has its email");
  const name = { id: "n", key: "name", type: "text", label: "Full name", required: false } as Field;
  f.steps[0]!.fields.push(name);
  assert.equal(kindPatch(f, name, "number")!.key, "q.full_name", "a name key can't hold a number");
});

test("where an answer can save, and why a place can't take it", () => {
  const f = sizeForm();
  const size = allFields(f)[1]!;
  const custom = [{ key: "budget", label: "Monthly budget", type: "number" as const }, { key: "size", label: "Company size", type: "select" as const }];
  const d = claritiaDests(f, size, custom);
  assert.equal(d.find((x) => x.id === "email")!.why, "Takes an email");
  assert.equal(d.find((x) => x.id === "f.budget")!.why, "Takes a number");
  assert.equal(d.find((x) => x.id === "f.size")!.why, null);
  const company = { id: "c2", key: "q.c", type: "text", label: "Org", required: false } as Field;
  f.steps[0]!.fields.push({ id: "c1", key: "company", type: "text", label: "Company", required: false }, company);
  assert.equal(claritiaDests(f, company, custom).find((x) => x.id === "company")!.why, "Company saves here");
  assert.equal(saveName({ key: "f.size" }, custom), "Contact, Company size");
  assert.equal(saveName({ key: "q.x" }, custom), "Only this submission");
});

test("choices match the CRM as the send does; Match them for me fills the rest", () => {
  const f = allFields(sizeForm())[1]!;
  assert.equal(choiceRows(f, sizeProp).missing, 5, "an en dash isn't the CRM's hyphen, so nothing matches by itself");
  const map = autoMap(f, sizeProp);
  assert.deepEqual(map, { "1–10": "1-10", "11–50": "11-50", "51–200": "51-200", "201–500": "201-1000", "500+": "201-1000" });
  assert.equal(choiceRows({ ...f, crm: { ...f.crm!, map } }, sizeProp).missing, 0);
  const decided = { ...f, crm: { ...f.crm!, map: { ...map, "500+": "" } } };
  assert.equal(choiceRows(decided, sizeProp).missing, 0, "Don't send is a decision");
  // Whatever the map says, the send agrees with the screen.
  const plan = crmPlan(sizeForm(map), { "q.size": "11–50" }, SRC, "hubspot", [sizeProp]);
  assert.deepEqual(plan.send.map((s) => s.value), ["11-50"]);
});

test("what's wrong with a question: a removed CRM field, a field that can't take it, choices that don't match", () => {
  const f = allFields(sizeForm())[1]!;
  const ctx = (props: CrmProperty[] | null): { custom: never[]; crm: CrmCtx } => ({ custom: [], crm: new Map([[SRC, { name: "HubSpot", props }]]) });
  assert.deepEqual(issuesOf(f, ctx([])), [{ lvl: "bad", where: "save", t: "Number of employees was removed in HubSpot" }]);
  assert.deepEqual(issuesOf(f, ctx(null)), [], "while the fields load nothing is called removed");
  assert.deepEqual(issuesOf(f, ctx([sizeProp])), [{ lvl: "warn", where: "save", t: "5 choices don't match HubSpot" }]);
  assert.match(issuesOf({ ...f, crm: { ...f.crm!, property: "rev" } }, ctx([{ name: "rev", label: "Annual revenue", kind: "number" }]))[0]!.t, /HubSpot Annual revenue: takes a number/);
  assert.equal(issuesOf({ ...f, options: [SIZES[0]!] }, ctx([sizeProp])).find((i) => i.where === "opts")!.t, "Add at least two choices");
  assert.equal(issuesOf({ ...f, label: "" }, ctx(null)).find((i) => i.where === "q")!.t, "Add a question");
});

test("publish checks: no email blocks; answers that can't reach a field only warn; a ready form says so", () => {
  const noEmail = { ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "a", key: "q.x", type: "text", label: "X", required: false } as Field] }] };
  const c = checkForm(noEmail);
  const checks = publishChecks(noEmail, "errors" in c ? c.errors : [], { custom: [], crm: new Map() }, 0);
  assert.equal(checks[0]!.t, "Add an email question");
  assert.ok(checks[0]!.blocks);
  const warn = publishChecks(sizeForm(), [], { custom: [], crm: new Map([[SRC, { name: "HubSpot", props: [sizeProp] }]]) }, 3);
  assert.equal(warn.length, 1);
  assert.equal(warn[0]!.lvl, "warn");
  assert.equal(warn[0]!.q, "size");
  assert.ok(!warn.some((x) => x.blocks));
  assert.deepEqual(publishChecks(emptyForm(), [], { custom: [], crm: new Map() }, 3), [{ lvl: "ok", t: "Ready to publish", s: "3 pages show this form. They update within a minute." }]);
});

test("Show when edits one rule, and Always takes every show rule away", () => {
  const f = sizeForm();
  f.steps[0]!.fields.push({ id: "rv", key: "q.rv", type: "text", label: "Rivals", required: false });
  const on = run(f, showOps(f, "rv", { field: "size", op: "is_not", value: "1–10" }));
  assert.equal(showRules(on, "rv").simple!.when.value, "1–10");
  const moved = run(on, showOps(on, "rv", { field: "size", op: "is", value: "500+" }));
  assert.equal(moved.rules.length, 1, "the same rule changes");
  assert.equal(moved.rules[0]!.id, on.rules[0]!.id);
  assert.equal(run(moved, showOps(moved, "rv", null)).rules.length, 0);
});

test("Routing rules that read a question, skip when known, and where a form lives", () => {
  const body = { rules: { on: true, list: [{ id: "r1", name: "Enterprise", match: "all", conds: [{ field: "answer.q.size", op: "one_of", value: ["500+"] }], queue: "q" }, { id: "r2", name: "Europe", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["DE"] }], queue: "q" }] } } as never;
  assert.deepEqual(rulesReading(body, { key: "q.size" }), ["Enterprise"]);
  assert.deepEqual(rulesReading(body, { key: "country" }), ["Europe"]);
  assert.deepEqual(rulesReading(null, { key: "q.size" }), []);
  const f = emptyForm();
  const co = { id: "co", key: "company", type: "text", label: "Company", required: false } as Field;
  assert.deepEqual(knownOp(f, co, true), { op: "set_enrich", hideKnown: true, fields: ["company"] });
  assert.deepEqual(knownOp({ ...f, enrich: { hideKnown: true, fields: ["company"] } }, co, false), { op: "set_enrich", hideKnown: false, fields: [] });
  assert.equal(whereWords({ status: "draft", version: 0, pages: 0, page: null, hosted: false }), "Not on any page yet");
  assert.equal(whereWords({ status: "live", version: 2, pages: 3, page: null, hosted: true }), "Hosted page and 3 pages");
  assert.equal(whereWords({ status: "live", version: 2, pages: 1, page: "https://www.acme.com/pricing", hosted: false }), "acme.com/pricing");
  assert.equal(whereWords({ status: "live", version: 2, pages: 0, page: null, hosted: false }), "Hosted page");
});
