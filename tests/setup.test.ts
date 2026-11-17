// The guided setup after sign-up (src/lib/setup.ts). They prove: only a new workspace's owner sees it, a step in
// progress comes back after the calendar sign-in, and "done" ends it for good; the team guessed from the email; the
// first forms point at real templates; invites are clean.
import { test } from "node:test";
import assert from "node:assert/strict";
import { FIRST_FORMS, guessTeam, nextStep, parseInvites, setupStep } from "../src/lib/setup.ts";
import { templateById as formTemplate } from "../src/lib/forms/gallery/catalog.ts";
import { templateById as meetingTemplate } from "../src/lib/meetings/templates.ts";

test("only a new workspace's owner starts it, a step in progress comes back, and done ends it", () => {
  assert.equal(setupStep({ named: false, role: "owner", stored: null }), "team");
  assert.equal(setupStep({ named: false, role: "member", stored: null }), null);
  assert.equal(setupStep({ named: true, role: "owner", stored: null }), null);
  assert.equal(setupStep({ named: undefined, role: "owner", stored: null }), null);
  // Back from Google Calendar: the workspace is named now, the step stays.
  assert.equal(setupStep({ named: true, role: "owner", stored: "calendar" }), "calendar");
  assert.equal(setupStep({ named: false, role: "owner", stored: "done" }), null);
  assert.equal(setupStep({ named: false, role: "owner", stored: "junk" }), "team");
  assert.equal(nextStep("team"), "calendar");
  assert.equal(nextStep("invite"), null);
});

test("a work email gives the team's name and site; free mail gives nothing", () => {
  assert.deepEqual(guessTeam("ana@acme.com"), { name: "Acme", site: "acme.com" });
  assert.deepEqual(guessTeam("ana@mail.acme-labs.co.uk"), { name: "Acme Labs", site: "acme-labs.co.uk" });
  assert.deepEqual(guessTeam("Ana@Sub.Acme.IO"), { name: "Acme", site: "acme.io" });
  assert.deepEqual(guessTeam("ana@gmail.com"), { name: "", site: "" });
  assert.deepEqual(guessTeam("ana@localhost"), { name: "", site: "" });
  assert.deepEqual(guessTeam(""), { name: "", site: "" });
});

test("every first form is a real booking template with a real meeting template", () => {
  for (const f of FIRST_FORMS) {
    assert.ok(formTemplate(f.template), `form template ${f.template}`);
    const m = meetingTemplate(f.meeting);
    assert.ok(m, `meeting template ${f.meeting}`);
    // One host: the free plan's single meeting type, booked by the form.
    assert.equal(m.kind, "one", f.meeting);
  }
});

test("invites are clean, once each, never your own", () => {
  assert.deepEqual(parseInvites(" Sam@Acme.com, ana@acme.com\nlee@acme.com; sam@acme.com bad", "ana@acme.com"), ["sam@acme.com", "lee@acme.com"]);
  assert.deepEqual(parseInvites("", "a@b.co"), []);
  assert.equal(parseInvites(Array.from({ length: 20 }, (_, i) => `p${i}@acme.com`).join(","), "").length, 10);
});
