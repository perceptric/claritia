// A meeting type's Description (src/lib/meetings/types.ts): cleaned on the server (plain text, line breaks kept, no
// runs of blank lines, 2,000 characters), on the booking page's type, and left out when empty.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSettings, cleanDescription } from "../src/lib/meetings/check.ts";
import { toGuestType } from "../src/lib/meetings/guest.ts";
import { DEFAULT_SETTINGS } from "../src/lib/meetings/types.ts";

test("the Description is cleaned: line breaks kept, control characters out, at most one blank line, 2,000 characters", () => {
  assert.equal(cleanDescription("  Bring your numbers.\r\n\r\n\r\n\r\nWe'll look at pricing.\u0007  "), "Bring your numbers.\n\nWe'll look at pricing.");
  assert.equal(cleanDescription("a  \nb"), "a\nb");
  assert.equal(cleanDescription(42), "");
  assert.equal(cleanDescription("x".repeat(5000)).length, 2000);
});

test("a type keeps its Description; an empty one is left out", () => {
  const kept = checkSettings({ ...DEFAULT_SETTINGS, description: " What it's for \n\n\nWhat to bring " }, "one");
  assert.deepEqual(kept.errors, []);
  assert.equal(kept.settings.description, "What it's for\n\nWhat to bring");
  assert.equal("description" in checkSettings({ ...DEFAULT_SETTINGS, description: "   " }, "one").settings, false);
});

test("the booking page's type carries the Description, or null", () => {
  const t = (description?: string) => toGuestType({ slug: "intro", name: "Intro call", kind: "one", hosts: [], settings: { ...DEFAULT_SETTINGS, ...(description !== undefined ? { description } : {}) } }, []);
  assert.equal(t("Bring your numbers.").description, "Bring your numbers.");
  assert.equal(t().description, null);
  assert.equal(t("  ").description, null);
});
