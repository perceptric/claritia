// Book a meeting with the contact's owner (docs/form-studio.md Part 3): which teammate links count as working, who may
// change whose link, and which link a lead gets. A missing, wrong-tool or malformed owner link must fall back to the
// team link, never open a broken scheduler and never block the booking.
import assert from "node:assert/strict";
import { test } from "node:test";
import { bookingBase, canSetLink, cleanLink, firstRule, linkState, linkToSave, ownerRoute, retarget, ruleFields, ruleOps, withOp } from "../src/lib/forms/meeting.ts";
import { showsMeeting, WORK_EMAIL, type Schedule } from "../src/lib/forms/schedule.ts";
import { checkForm, emptyForm, type Form } from "../src/lib/forms/schema.ts";

const TEAM = "https://calendly.com/acme/demo";
const sch = (o: Partial<Schedule> = {}): Schedule => ({ tool: "calendly", url: TEAM, perOwner: true, ...o });

test("a bare address gets https://, anything else is left for the check to name", () => {
  assert.equal(cleanLink("  calendly.com/maya  "), "https://calendly.com/maya");
  assert.equal(cleanLink("cal.com/leo/30min?x=1"), "https://cal.com/leo/30min?x=1");
  assert.equal(cleanLink("http://calendly.com/maya"), "http://calendly.com/maya");
  assert.equal(cleanLink("maya"), "maya");
  assert.equal(cleanLink("   "), "");
});

test("a teammate link works only for the scheduler it was made for", () => {
  assert.deepEqual(linkState("calendly", "https://calendly.com/maya"), { kind: "ok" });
  assert.deepEqual(linkState("calendly", "calendly.com/maya"), { kind: "ok" });
  assert.deepEqual(linkState("calendly", null), { kind: "none" });
  assert.deepEqual(linkState("calendly", " "), { kind: "none" });
  assert.deepEqual(linkState("calendly", "https://cal.com/maya"), { kind: "bad", problem: "That isn't a Calendly link." });
  assert.deepEqual(linkState("calendly", "http://calendly.com/maya"), { kind: "bad", problem: "Booking links need https://." });
  assert.deepEqual(linkState("calendly", "https://maya@calendly.com/x"), { kind: "bad", problem: "Booking links need https://." });
  assert.deepEqual(linkState("calendly", "https://calendly.com.evil.io/maya"), { kind: "bad", problem: "That isn't a Calendly link." });
  assert.equal(linkState("calendly", "not a link").kind, "bad");
  assert.deepEqual(linkState("calcom", "https://acme.cal.com/leo"), { kind: "ok" });
  assert.deepEqual(linkState("hubspot_meetings", "https://meetings-eu1.hubspot.com/leo"), { kind: "ok" });
  assert.deepEqual(linkState("link", "https://book.acme.com/leo"), { kind: "ok" });
});

test("a typed link saves cleaned, an empty one removes it, a bad one never saves", () => {
  assert.deepEqual(linkToSave("calendly", "calendly.com/maya "), { url: "https://calendly.com/maya" });
  assert.deepEqual(linkToSave("calendly", ""), { url: "" });
  assert.deepEqual(linkToSave("calendly", "https://savvycal.com/maya"), { problem: "That isn't a Calendly link." });
});

test("owners set anyone's link, members only their own", () => {
  assert.equal(canSetLink("owner", "me", "other"), true);
  assert.equal(canSetLink("member", "me", "me"), true);
  assert.equal(canSetLink("member", "me", "other"), false);
});

test("the owner's working link wins; a missing, wrong-tool or malformed one falls back to the team link", () => {
  assert.deepEqual(bookingBase(sch(), "https://calendly.com/maya"), { url: "https://calendly.com/maya", from: "owner" });
  assert.deepEqual(bookingBase(sch(), null), { url: TEAM, from: "team" }, "no link for the owner");
  assert.deepEqual(bookingBase(sch(), ""), { url: TEAM, from: "team" });
  assert.deepEqual(bookingBase(sch(), "https://cal.com/maya"), { url: TEAM, from: "team" }, "a link for a different tool");
  assert.deepEqual(bookingBase(sch(), "calendly.com/maya"), { url: TEAM, from: "team" }, "a malformed saved link");
  assert.deepEqual(bookingBase(sch(), "javascript:alert(1)"), { url: TEAM, from: "team" });
});

test("one team link ignores owners; no working link at all shows the message", () => {
  assert.deepEqual(bookingBase(sch({ perOwner: false }), "https://calendly.com/maya"), { url: TEAM, from: "team" });
  assert.equal(bookingBase(sch({ url: "" }), null), null);
  assert.equal(bookingBase(sch({ url: "" }), "https://cal.com/maya"), null);
  assert.equal(bookingBase(sch({ url: "https://evil.com/x", perOwner: false }), null), null, "a bad team link never opens");
  assert.deepEqual(bookingBase(sch({ url: "" }), "https://calendly.com/maya"), { url: "https://calendly.com/maya", from: "owner" });
});

test("the teammate table says where each owner's leads book", () => {
  assert.equal(ownerRoute(sch(), "https://calendly.com/maya"), "own");
  assert.equal(ownerRoute(sch(), undefined), "team");
  assert.equal(ownerRoute(sch(), "https://cal.com/maya"), "team");
  assert.equal(ownerRoute(sch({ url: "" }), undefined), "message");
  assert.equal(ownerRoute(sch({ tool: "calcom", url: "" }), "https://calendly.com/maya"), "message");
});

const FORM: Form = {
  ...emptyForm(),
  steps: [
    {
      id: "s1",
      fields: [
        { id: "e", key: "email", type: "email", label: "Work email", required: true },
        { id: "size", key: "q.size", type: "number", label: "Team size", required: false },
        { id: "plan", key: "q.plan", type: "choice", label: "Plan", required: false, options: [{ value: "pro", label: "Pro" }, { value: "team", label: "Team" }] },
        { id: "ok", key: "q.ok", type: "checkbox", label: "Call me", required: false },
        { id: "h", key: "c.h", type: "heading", label: "Heading", required: false, content: { text: "Hi" } },
      ],
    },
  ],
};
const F = Object.fromEntries(ruleFields(FORM).map((f) => [f.value, f]));

test("rules read answer fields and work email, never content blocks", () => {
  assert.deepEqual(ruleFields(FORM).map((f) => f.value), [WORK_EMAIL, "e", "size", "plan", "ok"]);
  assert.deepEqual(ruleOps("work").map((o) => o.value), ["is", "is_not"]);
  assert.deepEqual(ruleOps("checkbox").map((o) => o.value), ["filled", "empty"]);
  assert.equal(ruleOps("rating")[0].value, "gte");
  assert.equal(ruleOps("dropdown")[0].takes, "option");
});

test("a rule moved to another field keeps only what still fits", () => {
  assert.deepEqual(retarget(firstRule(), F.plan), { field: "plan", op: "is", value: "pro" }, "picks the first option");
  assert.deepEqual(retarget({ field: "plan", op: "is", value: "team" }, F.size), { field: "size", op: "is", value: "" }, "an option isn't a number");
  assert.deepEqual(retarget({ field: "size", op: "gte", value: "50" }, F.ok), { field: "ok", op: "filled" });
  assert.deepEqual(retarget({ field: "size", op: "gte", value: "50" }, F[WORK_EMAIL]), { field: WORK_EMAIL, op: "is" });
  assert.deepEqual(retarget({ field: "plan", op: "is_not", value: "gone" }, F.plan), { field: "plan", op: "is_not", value: "pro" }, "a removed option");
  assert.deepEqual(withOp({ field: "size", op: "gte", value: "50" }, "lte", F.size), { field: "size", op: "lte", value: "50" });
  assert.deepEqual(withOp({ field: "size", op: "gte", value: "50" }, "filled", F.size), { field: "size", op: "filled" });
  assert.deepEqual(withOp({ field: "size", op: "filled" }, "gte", F.size), { field: "size", op: "gte", value: "" });
});

test("rules the builder makes pass the form check and decide who books", () => {
  const rules = [retarget(firstRule(), F[WORK_EMAIL]), { ...withOp({ field: "size", op: "filled" }, "gte", F.size), value: "50" }];
  const raw = { ...FORM, after: { end: FORM.after.end, schedule: { tool: "calendly", url: TEAM, perOwner: false, who: "match", rules } } };
  const r = checkForm(raw);
  assert.ok(!("errors" in r), "errors" in r ? r.errors.join() : "");
  const s = (r as { form: Form }).form.after.schedule!;
  assert.equal(showsMeeting(s, { size: "120" }, true), true);
  assert.equal(showsMeeting(s, { size: "12" }, true), false);
  assert.equal(showsMeeting(s, {}, true), false, "a skipped size never books");
  assert.equal(showsMeeting(s, { size: "120" }, false), false, "free mail doesn't book");
  assert.equal(showsMeeting({ ...s, any: true }, { size: "120" }, false), true);
});
