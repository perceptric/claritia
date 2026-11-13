// Picking on the canvas (docs/email-canvas-b2.md section 9): the part from a class list, padding zones, and the
// heading levels and image loading B2 adds to the document.
import { test } from "node:test";
import assert from "node:assert/strict";
import { paddingZones, partFromClasses } from "../src/lib/design/email/pick.ts";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { readEmailDoc } from "../src/lib/design/email/doc.ts";
import { readSystem } from "../src/lib/design/model.ts";

test("the part comes from the element's own class", () => {
  assert.equal(partFromClasses(["x", "cab12-button"], "ab12"), "button");
  assert.equal(partFromClasses(["cab12-card-title"], "ab12"), "card-title");
  assert.equal(partFromClasses(["czz99-text"], "ab12"), null, "another element's class");
  assert.equal(partFromClasses(["cab12-nothing"], "ab12"), null, "not a part");
});

test("padding zones: one per side with padding, inside the box", () => {
  const z = paddingZones({ x: 10, y: 20, w: 200, h: 100 }, { top: 48, right: 24, bottom: 32, left: 0 });
  assert.deepEqual(
    z.map((x) => [x.side, x.value]),
    [["top", 48], ["bottom", 32], ["right", 24]],
  );
  const right = z.find((x) => x.side === "right")!;
  assert.deepEqual([right.x, right.y, right.w, right.h], [186, 68, 24, 20]);
  assert.deepEqual(paddingZones({ x: 0, y: 0, w: 10, h: 10 }, { top: 40, right: 0, bottom: 0, left: 0 })[0]!.h, 10, "never past the box");
});

test("heading levels 4 to 6 and image loading read and build", () => {
  const doc = readEmailDoc({
    sections: [{ id: "s1", columns: [{ id: "c1", width: 100, blocks: [{ id: "h1", type: "heading", text: "Hi", level: 5 }, { id: "i1", type: "image", src: "https://x.test/a.png", alt: "A", align: "center", loading: "lazy" }, { id: "i2", type: "image", src: "https://x.test/b.png", alt: "B", align: "center", loading: "soon" }] }] }],
  });
  const b = doc.sections[0]!.columns[0]!.blocks;
  assert.equal((b[0] as { level: number }).level, 5);
  assert.equal((b[1] as { loading?: string }).loading, "lazy");
  assert.equal((b[2] as { loading?: string }).loading, undefined, "an unknown value is dropped");
  const html = compileEmail(readSystem({}, {}), doc, { tokens: {} }).html;
  assert.match(html, /<h5[\s>]/);
  assert.match(html, /loading="lazy"/);
  assert.equal(html.match(/loading=/g)?.length, 1);
});
