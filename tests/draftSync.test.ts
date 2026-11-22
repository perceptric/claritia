// The workflow editor's copy of the draft (src/lib/workflows/draftSync.ts): a newer revision is taken only when nothing
// on screen is unsaved, so reopening a workflow from an old saved copy never reads as someone else's change.
import assert from "node:assert/strict";
import { test } from "node:test";
import { draftSync } from "../src/lib/workflows/draftSync.ts";

test("reopened from an old saved copy: the newer revision is taken before any edit", () => {
  assert.equal(draftSync({ server: 6, editor: 5, unsaved: false, saving: false }), "take");
});

test("unsaved edits or a save on its way are never thrown away", () => {
  assert.equal(draftSync({ server: 6, editor: 5, unsaved: true, saving: false }), "keep");
  assert.equal(draftSync({ server: 6, editor: 5, unsaved: false, saving: true }), "keep");
});

test("the editor's own save, or an older copy arriving late, changes nothing", () => {
  assert.equal(draftSync({ server: 6, editor: 6, unsaved: false, saving: false }), "keep");
  assert.equal(draftSync({ server: 5, editor: 6, unsaved: false, saving: false }), "keep", "a slow fetch that returns after a save");
});
