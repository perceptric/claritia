// The form visitors fill (docs/form-studio.md 2.1, 2.2, 2.4 and Part 3): the runtime helpers <claritia-form> draws
// with, and who gets the calendar after the submit. Booking is under the reliability rule, so the gating is proved on
// the flaky cases: a skipped answer, free mail, an answer that isn't a number, a field a rule hid, prefill off.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Rpc } from "../src/lib/jobs.ts";
import { fromText, inputAttrs, shuffled, SPAN } from "../src/lib/forms/element.ts";
import { bookingUrl, WORK_EMAIL, type Schedule } from "../src/lib/forms/schedule.ts";
import { checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import { acceptFill, type PublicForm } from "../src/lib/forms/submit.ts";

const SID = "0192f3a1-0000-7000-8000-000000000001";
const f = (x: Partial<Field> & Pick<Field, "id" | "type">): Field => ({ key: `q.${x.id}`, label: x.id, required: false, ...x }) as Field;

test("width takes columns on a six-column grid", () => {
  assert.deepEqual(SPAN, { full: 6, half: 3, third: 2, two_thirds: 4 });
  assert.equal(SPAN.third + SPAN.two_thirds, 6);
  assert.equal(SPAN.half * 2, 6);
});

test("shuffle keeps every option and one order per page load, whatever order they were saved in", () => {
  const opts = ["a", "b", "c", "d", "e", "f", "g"].map((v) => ({ value: v, label: v }));
  const one = shuffled(opts, 42);
  assert.deepEqual(one.map((o) => o.value).sort(), opts.map((o) => o.value));
  assert.deepEqual(shuffled(opts, 42), one, "same load, same order");
  assert.deepEqual(shuffled([...opts].reverse(), 42), one, "saved order doesn't matter");
  const orders = new Set(Array.from({ length: 20 }, (_, i) => shuffled(opts, i).map((o) => o.value).join("")));
  assert.ok(orders.size > 1, "other loads get other orders");
  assert.notEqual(opts, one, "the saved list isn't changed");
});

test("input attributes match the field's checks", () => {
  assert.deepEqual(inputAttrs(f({ id: "t", type: "text", valid: { min: 3, max: 40 } })), { maxlength: "40", minlength: "3" });
  assert.deepEqual(inputAttrs(f({ id: "t", type: "text" })), { maxlength: "1000" });
  assert.deepEqual(inputAttrs(f({ id: "l", type: "textarea" })), { maxlength: "5000" });
  assert.deepEqual(inputAttrs(f({ id: "n", type: "number", valid: { min: 1, max: 500, step: 1 } })), { min: "1", max: "500", step: "1", inputmode: "numeric" });
  assert.equal(inputAttrs(f({ id: "n", type: "number", valid: { min: -5, step: 1 } })).inputmode, "decimal", "negatives need the minus key");
  assert.equal(inputAttrs(f({ id: "n", type: "number", valid: { step: 0.5, min: 0 } })).inputmode, "decimal");
  assert.equal(inputAttrs(f({ id: "n", type: "number" })).inputmode, "decimal");
  assert.deepEqual(inputAttrs(f({ id: "d", type: "date", valid: { earliest: "2026-01-01", latest: "2026-12-31" } })), { min: "2026-01-01", max: "2026-12-31" });
  assert.deepEqual(inputAttrs(f({ id: "e", key: "email", type: "email" })), { maxlength: "320" });
});

test("defaults and values from the address take the field's shape", () => {
  assert.deepEqual(fromText(f({ id: "m", type: "multi" }), "A, B,,C"), ["A", "B", "C"]);
  assert.equal(fromText(f({ id: "r", type: "rating" }), "4"), 4);
  assert.equal(fromText(f({ id: "r", type: "rating" }), "lots"), "lots", "left for the check to refuse");
  assert.equal(fromText(f({ id: "t", type: "text" }), "Hi"), "Hi");
});

test("prefill off leaves name and email out of the booking link but keeps the tracking id", () => {
  const lead = { first: "Ana", last: "Diaz", email: "ana@acme.com" };
  for (const [tool, base, track] of [
    ["calendly", "https://calendly.com/acme/demo", "utm_content"],
    ["calcom", "https://cal.com/acme/30min", "metadata[clr]"],
  ] as const) {
    const off = new URL(bookingUrl(tool, base, lead, SID, "acme.com", false)!);
    assert.equal(off.searchParams.get("name"), null, tool);
    assert.equal(off.searchParams.get("email"), null, tool);
    assert.equal(off.searchParams.get(track), `clr_${SID}`, tool);
    const on = new URL(bookingUrl(tool, base, lead, SID, "acme.com")!);
    assert.equal(on.searchParams.get("email"), "ana@acme.com", `${tool} prefills by default`);
  }
  const hs = new URL(bookingUrl("hubspot_meetings", "https://meetings.hubspot.com/ana", lead, SID, undefined, false)!);
  assert.deepEqual([...hs.searchParams.keys()], ["embed"]);
  const sv = new URL(bookingUrl("savvycal", "https://savvycal.com/acme/demo", lead, SID, undefined, false)!);
  assert.deepEqual([...sv.searchParams.keys()], []);
});

// A demo form: email, an optional team size (a number), an optional role pick, a size band pick, a "student?" box
// whose answer hides the role, and the booking settings under test.
function demo(schedule: Partial<Schedule>): Form {
  const raw = {
    ...emptyForm(),
    steps: [
      {
        id: "s1",
        fields: [
          { id: "em", key: "email", type: "email", label: "Email", required: true },
          { id: "fn", key: "first_name", type: "text", label: "First name", required: false },
          { id: "size", key: "q.size", type: "number", label: "Team size", required: false },
          { id: "band", key: "q.band", type: "choice", label: "Company size", required: false, options: ["1-10", "201-1,000"] },
          { id: "role", key: "q.role", type: "choice", label: "Role", required: false, options: ["Buyer", "Student"], other: true },
          { id: "stu", key: "q.student", type: "checkbox", label: "I'm a student", required: false },
        ],
      },
    ],
    rules: [{ id: "r1", when: { field: "stu", op: "is", value: "true" }, then: { action: "hide", field: "role" } }],
    spam: { minSeconds: 0, turnstile: false },
    after: { end: { kind: "message", title: "Thanks" }, schedule: { tool: "calendly", url: "https://calendly.com/acme/demo", perOwner: false, ...schedule } },
  };
  const r = checkForm(raw);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
}

async function fill(form: Form, answers: Record<string, unknown>) {
  const calls: string[] = [];
  const rpc: Rpc = async (fn) => {
    calls.push(fn);
    if (fn === "form_submit_all") return { data: { id: SID, notified: true }, error: null };
    return { data: null, error: null };
  };
  const pub: PublicForm = { id: "0192f3a1-0000-7000-8000-0000000000ff", workspace_id: "w", version: 1, status: "live", body: form, tokens: {}, logo_url: null };
  const r = await acceptFill(rpc, pub, { v: 1, version: 1, key: "k".repeat(20), answers, ms: 5000, trap: "" }, { custom: [] }, { origin: "https://acme.com" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const s = r.body.schedule as { tool: string; url: string } | null;
  return { url: s ? new URL(s.url) : null, calls };
}

test("everyone books when the form shows the calendar to all", async () => {
  const { url } = await fill(demo({}), { em: "ana@gmail.com", fn: "Ana" });
  assert.ok(url);
  assert.equal(url.searchParams.get("email"), "ana@gmail.com");
  assert.equal(url.searchParams.get("utm_content"), `clr_${SID}`);
});

test("work email rule: free mail gets the message, a work or role address books", async () => {
  const form = demo({ who: "match", rules: [{ field: WORK_EMAIL, op: "is" }] });
  assert.equal((await fill(form, { em: "ana@gmail.com" })).url, null);
  assert.equal((await fill(form, { em: "ana@outlook.com" })).url, null);
  assert.ok((await fill(form, { em: "ana@acme.com" })).url);
  assert.ok((await fill(form, { em: "sales@acme.com" })).url, "a role address isn't free mail");
  const notWork = demo({ who: "match", rules: [{ field: WORK_EMAIL, op: "is_not" }] });
  assert.ok((await fill(notWork, { em: "ana@gmail.com" })).url);
  assert.equal((await fill(notWork, { em: "ana@acme.com" })).url, null);
});

test("a skipped answer never books: the rule's field left empty", async () => {
  const form = demo({ who: "match", rules: [{ field: "size", op: "gte", value: "50" }] });
  assert.equal((await fill(form, { em: "ana@acme.com" })).url, null, "skipped");
  assert.equal((await fill(form, { em: "ana@acme.com", size: "" })).url, null, "sent empty");
  assert.equal((await fill(form, { em: "ana@acme.com", size: "10" })).url, null, "too small");
  assert.ok((await fill(form, { em: "ana@acme.com", size: "120" })).url);
  assert.ok((await fill(form, { em: "ana@acme.com", size: "1,200" })).url, "a number with a thousands comma");
  const isNot = demo({ who: "match", rules: [{ field: "role", op: "is_not", value: "Student" }] });
  assert.equal((await fill(isNot, { em: "ana@acme.com" })).url, null, "is_not on a skipped answer");
  assert.ok((await fill(isNot, { em: "ana@acme.com", role: "Buyer" })).url);
});

test("a number rule on an answer that isn't a number doesn't book", async () => {
  const form = demo({ who: "match", rules: [{ field: "band", op: "gte", value: "200" }] });
  assert.equal((await fill(form, { em: "ana@acme.com", band: "201-1,000" })).url, null);
  const other = demo({ who: "match", rules: [{ field: "role", op: "lte", value: "5" }] });
  assert.equal((await fill(other, { em: "ana@acme.com", role: "Other: 3 people" })).url, null, "an Other answer");
});

test("an answer a rule hid doesn't count, whatever the browser sent", async () => {
  const form = demo({ who: "match", rules: [{ field: "role", op: "is", value: "Buyer" }] });
  assert.ok((await fill(form, { em: "ana@acme.com", role: "Buyer" })).url);
  assert.equal((await fill(form, { em: "ana@acme.com", role: "Buyer", stu: true })).url, null);
});

test("any or all rules, and the owner's link is only looked up for leads that book", async () => {
  const rules = [
    { field: WORK_EMAIL, op: "is" as const },
    { field: "size", op: "gte" as const, value: "50" },
  ];
  assert.equal((await fill(demo({ who: "match", rules }), { em: "ana@acme.com", size: "10" })).url, null);
  assert.ok((await fill(demo({ who: "match", rules, any: true }), { em: "ana@acme.com", size: "10" })).url);
  const owner = demo({ who: "match", rules, perOwner: true });
  const no = await fill(owner, { em: "ana@gmail.com", size: "500" });
  assert.equal(no.url, null);
  assert.ok(!no.calls.includes("scheduler_for"));
  const yes = await fill(owner, { em: "ana@acme.com", size: "500" });
  assert.ok(yes.url, "falls back to the team link when the owner has none");
  assert.ok(yes.calls.includes("scheduler_for"));
});

test("prefill off reaches the link the server returns", async () => {
  const { url } = await fill(demo({ prefill: false }), { em: "ana@acme.com", fn: "Ana" });
  assert.ok(url);
  assert.equal(url.searchParams.get("email"), null);
  assert.equal(url.searchParams.get("name"), null);
  assert.equal(url.searchParams.get("utm_content"), `clr_${SID}`);
  assert.equal(url.searchParams.get("embed_domain"), "acme.com");
});
