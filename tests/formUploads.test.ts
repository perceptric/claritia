// File uploads (docs/forms-plan.md 3.1): a file is judged by its bytes, never its name alone; a file answer is only
// ever an upload token; names are cleaned; and a fill links only its own uploads.
import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanName, sniffFile, uploadIds } from "../src/lib/forms/files.ts";
import { checkForm, emptyForm, type Field } from "../src/lib/forms/schema.ts";
import { prepareSubmit } from "../src/lib/forms/submit.ts";

const bytes = (...xs: number[]) => new Uint8Array([...xs, ...new Array(40).fill(0)]);
const ID = "0192f3a1-0000-7000-8000-0000000000ab";

test("files are judged by their bytes: a PDF, an Office file, and a renamed script refused", () => {
  assert.equal(sniffFile(bytes(0x25, 0x50, 0x44, 0x46, 0x2d), "x.bin")?.kind, "pdf");
  assert.equal(sniffFile(bytes(0x50, 0x4b, 0x03, 0x04), "plan.docx")?.kind, "office");
  assert.equal(sniffFile(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), "old.xls")?.kind, "office");
  assert.equal(sniffFile(bytes(0x50, 0x4b, 0x03, 0x04), "archive.zip"), null, "a zip that isn't Office");
  assert.equal(sniffFile(bytes(0x23, 0x21, 0x2f, 0x62), "resume.pdf"), null, "a script named .pdf");
  assert.equal(sniffFile(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), "new.docx"), null, "old bytes, new name");
});

test("names lose paths, line breaks and odd characters; upload ids come out of answers", () => {
  assert.equal(cleanName("C:\\\\Users\\\\ana\\\\cv final.pdf"), "cv final.pdf");
  assert.equal(cleanName("../../etc/passwd"), "passwd");
  assert.equal(cleanName("a\nb<script>.pdf"), "a bscript.pdf");
  assert.equal(cleanName("###"), "file");
  assert.deepEqual(uploadIds([`up_${ID}:cv.pdf`, "hello", 3, [`up_${ID}:x`]]), [ID]);
});

test("a file answer must be an upload token; a made-up path is refused", () => {
  const file: Field = { id: "cv", key: "q.cv", type: "file", label: "CV", required: true, file: { maxMb: 5, kinds: ["pdf"] } };
  const r = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Email", required: true }, file] }] });
  assert.ok("form" in r, "errors" in r ? r.errors.join(" ") : "");
  assert.deepEqual(r.form.steps[0]!.fields[1]!.file, { maxMb: 5, kinds: ["pdf"] });
  const send = (cv: unknown) => prepareSubmit(r.form, 1, { v: 1, version: 1, key: "u".repeat(20), answers: { e: "ana@acme.com", cv }, ms: 9000 }, { custom: [] });
  const ok = send(`up_${ID}:cv.pdf`);
  assert.ok("args" in ok);
  assert.equal(ok.args.p_values["q.cv"], `up_${ID}:cv.pdf`);
  for (const bad of ["/etc/passwd", `up_${ID}:a/b.pdf`, "up_nope:cv.pdf", ""]) assert.ok("errors" in send(bad), String(bad));
  // A size over 20 MB is held to 20; no kinds means all three.
  const big = checkForm({ ...emptyForm(), steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Email", required: true }, { ...file, file: { maxMb: 500, kinds: [] } }] }] });
  assert.ok("form" in big);
  assert.deepEqual(big.form.steps[0]!.fields[1]!.file, { maxMb: 20, kinds: ["pdf", "image", "office"] });
});
