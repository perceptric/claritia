// Document operations B4 adds (src/lib/design/email/ops.ts; docs/email-canvas-b4.md section 17.1), and the empty
// boxes the canvas's own build draws (src/lib/design/email/compile.ts).
import assert from "node:assert/strict";
import { test } from "node:test";
import { compileEmail } from "../src/lib/design/email/compile.ts";
import { newBlock, type Block, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { findEl, freshEl, moveToNewSection } from "../src/lib/design/email/ops.ts";
import { readSystem } from "../src/lib/design/model.ts";

const B = (id: string) => newBlock("text", id) as Block;
const doc = (): EmailDoc => ({
  v: 1,
  settings: { width: 600, align: "center", darkMode: "auto", preheader: "", lang: "en" },
  sections: [{ id: "s1", stackOnPhone: true, columns: [{ id: "c1", width: 100, blocks: [B("a"), B("b")] }] }, { id: "s2", stackOnPhone: true, columns: [{ id: "c2", width: 50, blocks: [B("d")] }, { id: "c3", width: 50, blocks: [] }] }],
  styles: { a: { text: { base: { color: "#111111" } } } },
});

test("a block moves into a new section of its own, keeping its styles", () => {
  const next = moveToNewSection(doc(), "a", 1);
  assert.equal(next.sections.length, 3);
  assert.deepEqual(next.sections[1]!.columns[0]!.blocks.map((b) => b.id), ["a"]);
  assert.deepEqual(next.sections[0]!.columns[0]!.blocks.map((b) => b.id), ["b"]);
  assert.deepEqual(next.styles?.a, { text: { base: { color: "#111111" } } });
  const d = doc();
  assert.equal(moveToNewSection(d, "s1", 0), d, "a section isn't a block: unchanged");
});

test("fresh ids for a section, its columns and blocks, with styles under the new ids", () => {
  const d = doc();
  const styles: Record<string, unknown> = {};
  const classes: Record<string, string[]> = {};
  const c = freshEl(d.sections[0]!, styles, classes, d);
  const ids = [c.id, ...c.columns.flatMap((col) => [col.id, ...col.blocks.map((b) => b.id)])];
  for (const old of ["s1", "c1", "a", "b"]) assert.ok(!ids.includes(old), old);
  const newA = c.columns[0]!.blocks[0]!.id;
  assert.deepEqual(styles[newA], { text: { base: { color: "#111111" } } });
  assert.ok(findEl(d, "a"), "the original is left alone");
});

test("empty columns and empty emails get a dashed box only in the canvas's own build", () => {
  const sys = readSystem({}, {});
  const preview = compileEmail(sys, doc(), { preview: true }).html;
  const send = compileEmail(sys, doc()).html;
  assert.equal((preview.match(/data-empty=""/g) ?? []).length, 1, "the empty column c3");
  assert.ok(!send.includes("data-empty"));
  const empty: EmailDoc = { ...doc(), sections: [] };
  assert.ok(compileEmail(sys, empty, { preview: true }).html.includes('data-empty=""'));
  assert.ok(!compileEmail(sys, empty).html.includes("data-empty"));
});
