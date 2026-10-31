// Visitor names (src/lib/visitors/names.ts): 40,000 fun names, the same device always the same name, no emoji.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NAME_COUNT, persona, VISITOR_TONES } from "../src/lib/visitors/names.ts";

test("40,000 names, stable per device, spread out, no emoji", () => {
  assert.equal(NAME_COUNT, 40_000);
  const a = persona("dev_01HZX3K9");
  assert.deepEqual(persona("dev_01HZX3K9"), a, "the same device always gets the same name");
  assert.match(a.name, /^[A-Z][a-z]+ [A-Z][A-Za-z -]+$/);
  assert.equal(a.initials.length, 2);
  assert.ok(VISITOR_TONES.includes(a.tone));
  const names = new Set(Array.from({ length: 2000 }, (_, i) => persona(`device-${i}`).name));
  assert.ok(names.size > 1900, `2,000 devices share few names (${names.size} distinct)`);
  assert.ok(![...names].some((n) => /\p{Extended_Pictographic}/u.test(n)));
});
