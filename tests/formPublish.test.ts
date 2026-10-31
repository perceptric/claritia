// Publishing a form publishes its routing, on the server, for anyone who may publish the form
// (src/lib/routing/formPublish.ts). The flaky cases: a form that shares its policy with another form or uses the
// default one must get its own, never rewrite the shared one; a staged move counts; saving a meeting republishes only
// the live forms whose live version books it.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Form } from "../src/lib/forms/schema.ts";
import { formsBooking, ownPolicy } from "../src/lib/routing/formPublish.ts";
import type { SourceRow } from "../src/lib/routing/screenModel.ts";

const src = (o: Partial<SourceRow>): SourceRow => ({
  id: "s1",
  kind: "form",
  form_id: "f1",
  name: "Form",
  enabled: true,
  policy_id: "p1",
  follows_default: false,
  outcome: "assign_only",
  meeting_type_id: null,
  mappings: [],
  no_slots: {},
  live_revision: 1,
  draft: null,
  draft_revision: 1,
  ...o,
});
const P = [
  { id: "p0", is_default: true },
  { id: "p1", is_default: false },
  { id: "p2", is_default: false },
];

test("a form alone on its policy keeps it", () => {
  assert.deepEqual(ownPolicy(P, [src({})], "f1"), { row: P[1], own: true });
});

test("flaky: shared with another live form, the default policy, or no policy at all means a new one", () => {
  assert.equal(ownPolicy(P, [src({}), src({ id: "s2", form_id: "f2" })], "f1").own, false, "never rewrite another form's routing");
  assert.equal(ownPolicy(P, [src({ policy_id: "p0" })], "f1").own, false);
  assert.deepEqual(ownPolicy(P, [], "f1"), { row: null, own: false });
  // Another form that's off, or moving away from p1, doesn't share it.
  assert.equal(ownPolicy(P, [src({}), src({ id: "s2", form_id: "f2", enabled: false })], "f1").own, true);
  assert.equal(ownPolicy(P, [src({}), src({ id: "s2", form_id: "f2", draft: { policy_id: "p2" } })], "f1").own, true);
  // This form's staged move to p2 counts.
  assert.deepEqual(ownPolicy(P, [src({ draft: { policy_id: "p2" } })], "f1"), { row: P[2], own: true });
});

const body = (schedule: unknown) => ({ after: { schedule } }) as unknown as Form;
test("saving a meeting republishes only live versions that book it", () => {
  const forms = [
    { id: "a", name: "A", version: 2 },
    { id: "b", name: "B", version: 1 },
    { id: "c", name: "C", version: 1 },
    { id: "d", name: "D", version: 1 },
  ];
  const versions = [
    { form_id: "a", version: 1, body: body({ tool: "claritia", meetingTypeId: "m1", routes: [] }) },
    { form_id: "a", version: 2, body: body({ tool: "claritia", meetingTypeId: "m9", routes: [{ id: "r", conds: [], meet: "m1" }] }) },
    { form_id: "b", version: 1, body: body({ tool: "claritia", meetingTypeId: "m1" }) },
    { form_id: "c", version: 1, body: body({ tool: "claritia", meetingTypeId: "m2", routes: [] }) },
    { form_id: "d", version: 1, body: body({ tool: "calendly", meetingTypeId: "m1", routes: [] }) },
  ];
  assert.deepEqual(formsBooking(forms, versions, "m1").map((f) => f.id), ["a"], "a books it in a condition; b never used routes; c books another; d isn't Claritia");
  assert.deepEqual(formsBooking(forms, versions, "m2").map((f) => f.id), ["c"]);
});
