// A form's If → Then rows (src/lib/routing/formRules.ts): they turn into the router's own rules and back, keep what
// Routing set that the rows don't show, and a half-made row never catches a lead (the flaky case: a value not picked
// yet, or no Then). Which row a test lead matches is the same answer the router's matcher gives.
import assert from "node:assert/strict";
import { test } from "node:test";
import { BASE_FIELDS } from "../src/lib/router/conditions.ts";
import { emptyBody, type RouterBody, type Rule } from "../src/lib/router/types.ts";
import { matchRow, otherwiseOf, rowName, rowProblem, rowsOf, sampleValues, sharedWith, withOtherwise, withRows, type Row } from "../src/lib/routing/formRules.ts";
import type { SourceRow } from "../src/lib/routing/screenModel.ts";

const F = BASE_FIELDS;
const LEE = "0192f3a1-0000-7000-8000-0000000000a1";
const SAM = "0192f3a1-0000-7000-8000-0000000000a2";
const TEAMS = new Set(["q_sales", "q_ent"]);

function body(rules: Rule[]): RouterBody {
  return {
    ...emptyBody(),
    v: 2,
    rules: { on: true, list: rules },
    fallback: { kind: "queue", id: "q_sales", meet: "m1" },
  };
}
const big: Rule = {
  id: "r1",
  name: "x",
  match: "all",
  conds: [{ field: "company.employees", op: "gte", value: 1000 }],
  queue: "q_ent",
  meet: "m_ent",
};
const us: Rule = {
  id: "r2",
  name: "y",
  match: "all",
  conds: [
    { field: "lead.country", op: "is", value: "US" },
    { field: "company.employees", op: "gte", value: 200 },
  ],
  queue: "",
  then: "user",
  user: LEE,
};
const held: Rule = {
  id: "r3",
  name: "Hold students",
  match: "all",
  conds: [{ field: "contact.email_class", op: "is", value: "free" }],
  queue: "",
  then: "hold",
};

test("rows come from the rules and go back the same, named from their conditions", () => {
  const b = body([big, us, held]);
  const rows = rowsOf(b);
  assert.deepEqual(
    rows.map((r) => r.id),
    ["r1", "r2"],
    "a rule held for review has no row",
  );
  assert.deepEqual(rows[0]!.then, { kind: "team", key: "q_ent" });
  assert.deepEqual(rows[1]!.then, { kind: "person", id: LEE });
  const back = withRows(b, rows, F);
  assert.equal(back.rules.list.length, 3);
  assert.equal(back.rules.list[2]!.id, "r3", "Routing's review rule is kept");
  assert.equal(back.rules.list[0]!.meet, "m_ent", "the rule's meeting is kept");
  assert.equal(back.rules.list[0]!.queue, "q_ent");
  assert.equal(back.rules.list[1]!.then, "user");
  assert.equal(back.rules.list[1]!.user, LEE);
  assert.equal(back.rules.list[1]!.queue, "");
  assert.equal(back.rules.list[1]!.name, "Country = United States and Employees ≥ 200");
  assert.equal(back.fallback?.meet, "m1", "Everyone else is untouched");
});

test("a row sent to the company's owner, then to a team: the old person is dropped", () => {
  const rows = rowsOf(body([us]));
  const owner = withRows(body([us]), [{ ...rows[0]!, then: { kind: "owner" } }], F).rules.list[0]!;
  assert.equal(owner.then, "owner");
  assert.equal(owner.user, undefined);
  const team = withRows(body([us]), [{ ...rows[0]!, then: { kind: "team", key: "q_sales" } }], F).rules.list[0]!;
  assert.equal(team.then, undefined);
  assert.equal(team.user, undefined);
  assert.equal(team.queue, "q_sales");
});

test("first finished row wins; nothing matched is Otherwise", () => {
  const b = body([big, us]);
  const rows = rowsOf(b);
  assert.equal(matchRow(b, rows, { "company.employees": "5000", "lead.country": "US" }, F, TEAMS), 0);
  assert.equal(matchRow(b, rows, { "company.employees": "300", "lead.country": "US" }, F, TEAMS), 1);
  assert.equal(matchRow(b, rows, { "company.employees": "300", "lead.country": "DE" }, F, TEAMS), -1);
  assert.equal(matchRow(b, rows, {}, F, TEAMS), -1, "a lead with no answers goes to Otherwise");
});

test("flaky: a half-made row never catches a lead", () => {
  const b = body([]);
  const blank: Row = {
    id: "n1",
    conds: [{ field: "lead.country", op: "is_not", value: "" }],
    then: { kind: "person", id: SAM },
  };
  const noThen: Row = {
    id: "n2",
    conds: [{ field: "lead.country", op: "is", value: "US" }],
    then: null,
  };
  const goneTeam: Row = {
    id: "n3",
    conds: [{ field: "lead.country", op: "is", value: "US" }],
    then: { kind: "team", key: "q_deleted" },
  };
  const notNumber: Row = {
    id: "n4",
    conds: [{ field: "company.employees", op: "gte", value: "lots" }],
    then: { kind: "person", id: SAM },
  };
  for (const r of [blank, noThen, goneTeam, notNumber]) {
    assert.ok(rowProblem(r, F, TEAMS), `${r.id} has a problem`);
    assert.equal(matchRow(b, [r], { "lead.country": "US", "company.employees": "900" }, F, TEAMS), -1, `${r.id} never matches`);
  }
  assert.equal(
    rowProblem(
      {
        id: "ok",
        conds: [{ field: "lead.country", op: "is", value: "US" }],
        then: { kind: "owner" },
      },
      F,
      TEAMS,
    ),
    null,
  );
});

test("a row Routing turned off stays off and never matches here", () => {
  const off: Rule = { ...us, on: false };
  const b = body([off]);
  const rows = rowsOf(b);
  assert.equal(matchRow(b, rows, { "lead.country": "US", "company.employees": "900" }, F, TEAMS), -1);
  assert.equal(withRows(b, rows, F).rules.list[0]!.on, false);
});

test("Otherwise takes a person or a team and keeps its meeting; the company's owner clears it", () => {
  const b = body([]);
  assert.deepEqual(otherwiseOf(b), { kind: "team", key: "q_sales" });
  assert.deepEqual(withOtherwise(b, { kind: "person", id: SAM }).fallback, {
    kind: "user",
    id: SAM,
    meet: "m1",
  });
  assert.equal(withOtherwise(b, { kind: "owner" }).fallback, null);
});

test("the sample lead for a publish test matches the first finished row", () => {
  const b = body([]);
  const rows: Row[] = [
    {
      id: "a",
      conds: [{ field: "lead.country", op: "is", value: "" }],
      then: { kind: "owner" },
    },
    {
      id: "b",
      conds: [
        { field: "lead.country", op: "is", value: "GB" },
        { field: "company.employees", op: "lt", value: 50 },
      ],
      then: { kind: "person", id: SAM },
    },
  ];
  const v = sampleValues(rows, F, TEAMS);
  assert.deepEqual(v, { "lead.country": "GB", "company.employees": "49" });
  assert.equal(matchRow(b, rows, v, F, TEAMS), 1);
});

test("a policy is shared when another source routes with it, counting staged moves", () => {
  const src = (id: string, form: string | null, policy: string | null, draft: SourceRow["draft"] = null): SourceRow => ({
    id,
    kind: form ? "form" : "handoff",
    form_id: form,
    name: id,
    enabled: true,
    policy_id: policy,
    follows_default: false,
    outcome: "assign_only",
    meeting_type_id: null,
    mappings: [],
    no_slots: {},
    live_revision: 1,
    draft,
    draft_revision: 1,
  });
  const list = [src("s1", "f1", "p1"), src("s2", "f2", "p1", { policy_id: "p2" }), src("s3", "f3", "p2", { policy_id: "p1" })];
  assert.deepEqual(
    sharedWith(list, "p1", "f1").map((s) => s.id),
    ["s3"],
    "f2 is moving away, f3 is moving in",
  );
  assert.deepEqual(
    sharedWith(list, "p2", "f9").map((s) => s.id),
    ["s2"],
  );
});

test("a long row name is cut to the router's 80 characters", () => {
  const conds = Array.from({ length: 6 }, () => ({
    field: "contact.title",
    op: "contains" as const,
    value: "Vice President of Operations",
  }));
  assert.ok(rowName(conds, F).length <= 80);
});
