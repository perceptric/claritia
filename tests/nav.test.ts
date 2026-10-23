import assert from "node:assert/strict";
import { test } from "node:test";
import { NAV, resolveRoute } from "../src/lib/nav.ts";

test("the sidebar is Site, CRM, Email, Ads and Settings, in that order", () => {
  const groups: [string, string[]][] = [];
  for (const n of NAV) {
    if (n.group !== undefined) groups.push([n.group, []]);
    groups[groups.length - 1][1].push(n.route);
  }
  assert.deepEqual(groups, [
    ["Site", ["forms", "pages"]],
    ["CRM", ["contacts", "companies", "opportunities"]],
    ["Email", ["segments", "templates", "workflows", "analytics"]],
    ["", ["ads"]],
    ["", ["settings"]],
  ]);
});

test("old addresses open their new home", () => {
  assert.deepEqual(resolveRoute("leads", ""), { route: "contacts", id: "" });
  assert.deepEqual(resolveRoute("leads", "abc"), {
    route: "contacts",
    id: "abc",
  });
  assert.deepEqual(resolveRoute("accounts", ""), {
    route: "companies",
    id: "",
  });
  assert.deepEqual(resolveRoute("accounts", "abc"), {
    route: "companies",
    id: "account/abc",
  });
  assert.deepEqual(resolveRoute("visitors", ""), {
    route: "companies",
    id: "visits",
  });
  assert.deepEqual(resolveRoute("journeys", ""), {
    route: "workflows",
    id: "",
  });
  assert.deepEqual(resolveRoute("reports", ""), { route: "analytics", id: "" });
});

test("the testing screens and unknown addresses open Forms", () => {
  for (const old of ["tests", "blocks", "map", "runs", "environments", "schedules", "approvals", "insights", "nope", ""])
    assert.deepEqual(resolveRoute(old, "x"), { route: "forms", id: "" });
});

test("current addresses keep their record", () => {
  assert.deepEqual(resolveRoute("opportunities", "abc"), {
    route: "opportunities",
    id: "abc",
  });
  assert.deepEqual(resolveRoute("objects", "deal/abc"), {
    route: "objects",
    id: "deal/abc",
  });
});
