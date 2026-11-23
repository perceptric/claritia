import assert from "node:assert/strict";
import { test } from "node:test";
import { settingsGroups } from "../src/lib/settingsTabs.ts";

const ids = (f: string[], p = true) => settingsGroups(f, p).flatMap((g) => g.tabs.map((t) => t.id));
const TESTING_ONLY = ["project", "github", "test_alerts", "plan"];
const EVERYONE = ["workspace", "keys", "profile"];

test("each product sees its own pages and not the other's, and everyone sees the workspace and their profile", () => {
  const marketing = ids(["marketing"]);
  const testing = ids(["testing"]);
  assert.deepEqual(marketing.filter((t) => TESTING_ONLY.includes(t)), []);
  assert.deepEqual(testing.filter((t) => marketing.includes(t) && !EVERYONE.includes(t)), []);
  for (const t of EVERYONE) assert.ok(marketing.includes(t) && testing.includes(t), t);
  assert.deepEqual(ids(["testing", "marketing"]).sort(), [...new Set([...marketing, ...testing])].sort(), "both: every page of each");
});

test("Profile is last, and a workspace with no project has no project pages", () => {
  for (const f of [["marketing"], ["testing"], ["testing", "marketing"]]) assert.equal(ids(f).at(-1), "profile");
  const none = ids(["testing"], false);
  for (const t of ["project", "github", "test_alerts"]) assert.ok(!none.includes(t), t);
  assert.ok(none.includes("plan"), "the plan doesn't need a project");
});
