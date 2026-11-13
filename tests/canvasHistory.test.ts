// The canvas's undo history (src/lib/canvas/history.ts; docs/email-canvas-b4.md sections 4.3 and 17.1).
import assert from "node:assert/strict";
import { test } from "node:test";
import { dropKit, emptyHistory, isEmpty, MAX_STEPS, push, redo, undo, type Step } from "../src/lib/canvas/history.ts";
import { readEmailDoc, type EmailDoc } from "../src/lib/design/email/doc.ts";
import { readSystem, type DesignSystem } from "../src/lib/design/model.ts";

const doc = (n: number): EmailDoc => readEmailDoc({ settings: { preheader: `v${n}` } });
const sys = (r: number): DesignSystem => ({ ...readSystem({}, {}), tokens: { ...readSystem({}, {}).tokens, radius: `${r}px` } } as DesignSystem);
const snap = (n: number) => ({ doc: doc(n), subject: `s${n}` });
const step = (o: Partial<Step> & { at: number }): Step => ({ label: "Change", emails: {}, kits: {}, ...o });

test("a step over two emails undoes and redoes both", () => {
  let h = push(emptyHistory(), step({ at: 0, label: "Move Heading", emails: { a: { before: snap(1), after: snap(2) }, b: { before: snap(3), after: snap(4) } } }));
  const u = undo(h)!;
  assert.equal(u.restore.emails.a!.subject, "s1");
  assert.equal(u.restore.emails.b!.subject, "s3");
  assert.equal(u.restore.label, "Move Heading");
  h = u.h;
  const r = redo(h)!;
  assert.equal(r.restore.emails.a!.subject, "s2");
  assert.equal(r.restore.emails.b!.subject, "s4");
});

test("a step over an email and a kit undoes both", () => {
  const h = push(emptyHistory(), step({ at: 0, emails: { a: { before: snap(1), after: snap(2) } }, kits: { k: { before: sys(1), after: sys(2) } } }));
  const u = undo(h)!;
  assert.deepEqual(u.restore.kits.k, sys(1));
  assert.equal(u.restore.emails.a!.subject, "s1");
});

test("the same key joins within a second, not after", () => {
  let h = push(emptyHistory(), step({ at: 0, key: "size", emails: { a: { before: snap(1), after: snap(2) } } }));
  h = push(h, step({ at: 1000, key: "size", emails: { a: { before: snap(2), after: snap(3) } } }));
  assert.equal(h.past.length, 1);
  assert.equal(h.past[0]!.emails.a!.before.subject, "s1");
  assert.equal(h.past[0]!.emails.a!.after.subject, "s3");
  h = push(h, step({ at: 2001, key: "size", emails: { a: { before: snap(3), after: snap(4) } } }));
  assert.equal(h.past.length, 2);
});

test("a typing run (~ key) joins however long the pause", () => {
  let h = push(emptyHistory(), step({ at: 0, key: "~type:x", emails: { a: { before: snap(1), after: snap(2) } } }));
  h = push(h, step({ at: 10_000, key: "~type:x", emails: { a: { before: snap(2), after: snap(3) } } }));
  assert.equal(h.past.length, 1);
  assert.equal(h.past[0]!.emails.a!.after.subject, "s3");
});

test("a change to another email never joins, even with the same key", () => {
  let h = push(emptyHistory(), step({ at: 0, key: "size", emails: { a: { before: snap(1), after: snap(2) } } }));
  h = push(h, step({ at: 10, key: "size", emails: { b: { before: snap(1), after: snap(2) } } }));
  assert.equal(h.past.length, 2);
});

test("an empty step isn't pushed, and a join back to the start goes away", () => {
  assert.ok(isEmpty(step({ at: 0, emails: { a: { before: snap(1), after: snap(1) } } })));
  assert.equal(push(emptyHistory(), step({ at: 0, emails: { a: { before: snap(1), after: snap(1) } } })).past.length, 0);
  let h = push(emptyHistory(), step({ at: 0, key: "k", emails: { a: { before: snap(1), after: snap(2) } } }));
  h = push(h, step({ at: 5, key: "k", emails: { a: { before: snap(2), after: snap(1) } } }));
  assert.equal(h.past.length, 0);
});

test("a new step clears redo", () => {
  let h = push(emptyHistory(), step({ at: 0, emails: { a: { before: snap(1), after: snap(2) } } }));
  h = undo(h)!.h;
  assert.equal(h.future.length, 1);
  h = push(h, step({ at: 5, emails: { a: { before: snap(1), after: snap(3) } } }));
  assert.equal(h.future.length, 0);
  assert.equal(redo(h), null);
});

test("at most 100 steps, the oldest goes first", () => {
  let h = emptyHistory();
  for (let i = 0; i <= MAX_STEPS; i++) h = push(h, step({ at: i * 5000, label: `#${i}`, emails: { a: { before: snap(i), after: snap(i + 1) } } }));
  assert.equal(h.past.length, MAX_STEPS);
  assert.equal(h.past[0]!.label, "#1");
});

test("dropping a kit removes its steps and keeps email-only steps", () => {
  let h = push(emptyHistory(), step({ at: 0, label: "email", emails: { a: { before: snap(1), after: snap(2) } } }));
  h = push(h, step({ at: 5000, label: "kit", kits: { k: { before: sys(1), after: sys(2) } } }));
  h = push(h, step({ at: 10_000, label: "both", emails: { a: { before: snap(2), after: snap(3) } }, kits: { k: { before: sys(2), after: sys(3) } } }));
  h = dropKit(h, "k");
  assert.deepEqual(h.past.map((s) => s.label), ["email"]);
});
