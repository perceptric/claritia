// A form's own page must open the app on reload, while the form script keeps its address (src/lib/appPaths.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { appShellPath } from "../src/lib/appPaths.ts";

test("a form's page goes to the app; the script and everything else stay", () => {
  const id = "d1569387-1b2c-4d3e-8f90-a1b2c3d4e5f6";
  assert.equal(appShellPath(`/forms/${id}`), `/app-shell/forms/${id}`);
  assert.equal(appShellPath("/forms/new"), "/app-shell/forms/new");
  assert.equal(appShellPath("/forms/overview"), "/app-shell/forms/overview");
  assert.equal(appShellPath(`/forms/${id}/share`), `/app-shell/forms/${id}/share`);
  assert.equal(appShellPath("/forms/v1.js"), null, "the script customers paste");
  assert.equal(appShellPath("/forms/v1.3f9a2c.js"), null, "the hashed copy");
  assert.equal(appShellPath("/forms"), null);
  assert.equal(appShellPath("/contacts/abc"), null);
});
