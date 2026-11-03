// The fonts the email builder offers: stacks and links the brand checker accepts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fontStack, fontUrl } from "../src/lib/design/fonts.ts";
import { cleanFont, cleanFontUrl } from "../src/lib/forms/brand.ts";

test("fonts: stacks and links the brand checker accepts, never a weight a family lacks", () => {
  for (const n of ["Inter", "DM Sans", "Playfair Display", "Space Mono"]) assert.ok(cleanFont(fontStack(n)), n);
  const url = fontUrl(["DM Sans", "Lato", "Unknown Font", "DM Sans"]);
  assert.equal(url, "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lato:wght@400;700&display=swap");
  assert.equal(cleanFontUrl(url), url);
  assert.equal(fontUrl(["Unknown"]), "");
});
