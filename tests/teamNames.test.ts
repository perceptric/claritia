// Team names on Meetings › Availability › Team (src/lib/routing/teamNames.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { closeName, teamMeetings, teamName } from "../src/lib/routing/teamNames.ts";

const teams = [{ id: "1", name: "Enterprise" }, { id: "2", name: "Support" }, { id: "3", name: "EMEA" }];

test("a name too close to a team that exists is caught; different names pass", () => {
  assert.equal(closeName("Enterprise 2", teams), "Enterprise");
  assert.equal(closeName("enterprise team", teams), "Enterprise");
  assert.equal(closeName("Enterprize", teams), "Enterprise", "one letter apart");
  assert.equal(closeName("Support copy", teams), "Support");
  assert.equal(closeName("Enterprise West", teams), null);
  assert.equal(closeName("APAC", teams), null);
  assert.equal(closeName("EMEA", teams), "EMEA");
  assert.equal(closeName("EMEB", teams), null, "short names must match exactly");
  assert.equal(closeName("Enterprise", teams, "1"), null, "renaming a team to its own name is fine");
  assert.equal(closeName("  ", teams), null);
});

test("the starting team reads Whole team until it's renamed in the database; others keep their name", () => {
  assert.equal(teamName({ name: "All reps", keys: ["q_everyone"] }), "Whole team");
  assert.equal(teamName({ name: "Everyone", keys: ["q_everyone"] }), "Whole team");
  assert.equal(teamName({ name: "Closers", keys: ["q_everyone"] }), "Closers");
  assert.equal(teamName({ name: "All reps", keys: ["t_abc"] }), "All reps", "only the starting team is renamed");
});

test("the meetings that send to a team: old whole-team types, Dynamic rules and where no rule matches", () => {
  const types = [
    { id: "a", name: "Old demo", settings: { team: "t_ent" } },
    { id: "b", name: "Dynamic otherwise", settings: { dynamic: { rules: [], otherwise: { kind: "team" as const, id: "t_ent" } } } },
    { id: "c", name: "Dynamic rule", settings: { dynamic: { rules: [{ id: "r", conds: [], to: { kind: "team" as const, id: "t_ent" } }], otherwise: { kind: "user" as const, id: "u" } } } },
    { id: "d", name: "Someone else", settings: { dynamic: { rules: [], otherwise: { kind: "team" as const, id: "t_other" } } } },
    { id: "e", name: "Individual", settings: {} },
  ];
  assert.deepEqual(teamMeetings(["t_ent"], types).map((t) => t.id), ["a", "b", "c"]);
  assert.deepEqual(teamMeetings(["nope"], types), []);
});
