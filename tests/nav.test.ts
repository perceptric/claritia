import assert from "node:assert/strict";
import { test } from "node:test";
import { allowedRoute, defaultRoute, navFor, showsProjectPicker } from "../src/lib/nav.ts";

const routes = (f: string[]) => navFor(f).map((n) => n.route);
const TESTING = routes(["testing"]).filter((r) => r !== "settings");
const MARKETING = routes(["marketing"]).filter((r) => r !== "settings");

test("the two products share only Settings, which is last in every sidebar", () => {
  assert.ok(TESTING.length && MARKETING.length);
  assert.deepEqual(TESTING.filter((r) => MARKETING.includes(r)), []);
  for (const f of [["testing"], ["marketing"], ["testing", "marketing"], []]) assert.equal(routes(f).at(-1), "settings", f.join("+"));
});

test("a workspace lands on its product's first screen, and the other product's screens send it there", () => {
  assert.equal(defaultRoute(["testing"]), "tests");
  assert.equal(defaultRoute(["marketing"]), "visitors");
  for (const r of MARKETING) assert.equal(allowedRoute(["testing"], r), "tests", r);
  for (const r of TESTING) assert.equal(allowedRoute(["marketing"], r), "visitors", r);
  for (const r of [...TESTING, ...MARKETING]) assert.equal(allowedRoute(["testing", "marketing"], r), r, r);
});

test("with both, every screen of each is there, and testing comes after marketing under one Testing group", () => {
  const nav = navFor(["testing", "marketing"]);
  assert.deepEqual(nav.map((n) => n.route), [...MARKETING, ...TESTING, "settings"]);
  assert.equal(nav.find((n) => n.route === TESTING[0])!.group, "Testing");
  assert.ok(nav.filter((n) => TESTING.slice(1).includes(n.route)).every((n) => n.group === undefined), "no second testing group");
});

test("the project picker shows on testing screens only", () => {
  for (const r of TESTING) assert.ok(showsProjectPicker(["testing", "marketing"], r), r);
  for (const r of MARKETING) assert.ok(!showsProjectPicker(["testing", "marketing"], r), r);
  assert.ok(!showsProjectPicker(["marketing"], "settings"));
});

test("no features falls back to the testing product", () => {
  assert.deepEqual(routes([]), routes(["testing"]));
  assert.equal(defaultRoute([]), "tests");
});

test("a custom object's page opens from marketing screens only", () => {
  assert.equal(allowedRoute(["marketing"], "objects"), "objects");
  assert.equal(allowedRoute(["testing"], "objects"), "tests");
  assert.ok(!routes(["marketing"]).includes("objects"), "it isn't in the sidebar");
});
