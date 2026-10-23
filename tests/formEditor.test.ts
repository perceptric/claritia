// The Design tab's logic (docs/form-studio.md Part 2): tabs from the address, rows on the 6-column grid, what a drop
// or a nudge turns into, copies, options, logic modes, fonts and how typing joins one undo step.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyOp, type Op } from "../src/lib/forms/ops.ts";
import { allFields, checkForm, emptyForm, type Field, type Form } from "../src/lib/forms/schema.ts";
import {
  addOp,
  duplicateOp,
  ELEMENTS,
  fontStack,
  fontUrl,
  linesToOptions,
  mergeKey,
  nextOption,
  nudge,
  pickTab,
  planDrop,
  rowsOf,
  setShownOps,
  shownMode,
  spanOf,
} from "../src/components/app/forms/editorModel.ts";
import { cleanFont, cleanFontUrl } from "../src/lib/forms/brand.ts";

const F = (id: string, extra: Partial<Field> = {}): Field => ({ id, key: `q.${id}`, type: "text", label: id.toUpperCase(), required: false, ...extra });
const form = (...steps: Field[][]): Form => ({ ...emptyForm(), steps: steps.map((fields, i) => ({ id: `s${i}`, fields })) });
const run = (f: Form, ops: Op[]) =>
  ops.reduce((cur, op) => {
    const r = applyOp(cur, op);
    if ("error" in r) throw new Error(r.error);
    return r.form;
  }, f);
const order = (f: Form) => f.steps.map((s) => s.fields.map((x) => x.id).join(",")).join(" | ");
const widths = (f: Form) =>
  allFields(f)
    .map((x) => `${x.id}:${x.width ?? "full"}`)
    .join(",");

test("the tab comes from the address, old names land, anything else opens Design", () => {
  assert.equal(pickTab("?tab=settings"), "settings");
  assert.equal(pickTab("?tab=results&x=1"), "results");
  assert.equal(pickTab("?tab=build"), "design");
  assert.equal(pickTab("?tab=connect"), "settings");
  assert.equal(pickTab("?tab=<script>"), "design");
  assert.equal(pickTab(""), "design");
});

test("rows fill the 6-column grid left to right, and a phone stacks everything", () => {
  assert.deepEqual(rowsOf([3, 3, 6, 2, 2, 2, 4, 3]), [[0, 1], [2], [3, 4, 5], [6], [7]]);
  assert.deepEqual(rowsOf([]), []);
  const half = F("a", { width: "half" });
  assert.equal(spanOf(half), 3);
  assert.equal(spanOf(half, true), 6);
  // Content and hidden fields are always a whole row, whatever width they carry.
  assert.equal(spanOf({ ...F("h"), type: "heading", width: "half" }), 6);
  assert.equal(spanOf({ ...F("x"), type: "hidden", width: "third" }), 6);
});

test("a drop at an index adds or moves to exactly there, also within its own step", () => {
  const f = form([F("a"), F("b"), F("c")], [F("d")]);
  // Moving a down in its own step: the index counts the field still in place.
  assert.equal(order(run(f, planDrop(f, { kind: "move", id: "a" }, { step: 0, index: 2 }))), "b,a,c | d");
  assert.equal(order(run(f, planDrop(f, { kind: "move", id: "c" }, { step: 0, index: 0 }))), "c,a,b | d");
  // Dropping where it already is changes nothing.
  assert.deepEqual(planDrop(f, { kind: "move", id: "b" }, { step: 0, index: 1 }), []);
  assert.deepEqual(planDrop(f, { kind: "move", id: "b" }, { step: 0, index: 2 }), []);
  // Across steps.
  assert.equal(order(run(f, planDrop(f, { kind: "move", id: "d" }, { step: 0, index: 1 }))), "a,d,b,c | ");
  // A new element at the top, in the middle and at the end (indexes past the end are the end).
  const n = { kind: "new" as const, id: "n", input: { type: "text" as const, label: "New" } };
  assert.equal(order(run(f, planDrop(f, n, { step: 0, index: 0 }))), "n,a,b,c | d");
  assert.equal(order(run(f, planDrop(f, n, { step: 1, index: 9 }))), "a,b,c | d,n");
  assert.deepEqual(planDrop(f, n, { step: 5, index: 0 }), []);
});

test("dropping beside a field makes a row: halves, then thirds, and a fourth goes under", () => {
  const f = form([F("a"), F("b"), F("c")]);
  const two = run(f, planDrop(f, { kind: "move", id: "c" }, { step: 0, beside: "a", side: "right" }));
  assert.equal(order(two), "a,c,b");
  assert.equal(widths(two), "a:half,c:half,b:full");
  const three = run(two, planDrop(two, { kind: "move", id: "b" }, { step: 0, beside: "a", side: "left" }));
  assert.equal(order(three), "b,a,c");
  assert.equal(widths(three), "b:third,a:third,c:third");
  // A new field beside a full row of three lands under the row instead.
  const four = run(three, planDrop(three, { kind: "new", id: "n", input: { type: "text", label: "N" } }, { step: 0, beside: "c", side: "right" }));
  assert.equal(order(four), "b,a,c,n");
  assert.equal(allFields(four).find((x) => x.id === "n")?.width, undefined);
  // Re-dropping a row mate on its own row keeps the halves and does nothing else.
  assert.deepEqual(planDrop(two, { kind: "move", id: "c" }, { step: 0, beside: "a", side: "right" }), []);
  // Beside itself is nothing.
  assert.deepEqual(planDrop(two, { kind: "move", id: "a" }, { step: 0, beside: "a", side: "left" }), []);
  // A new element beside a field comes in at the row's width.
  const added = run(f, planDrop(f, { kind: "new", id: "n", input: { type: "email", label: "E" } }, { step: 0, beside: "b", side: "left" }));
  assert.equal(order(added), "a,n,b,c");
  assert.equal(widths(added), "a:full,n:half,b:half,c:full");
});

test("a field moved out of another step beside a field keeps the steps whole", () => {
  const f = form([F("a")], [F("b"), F("c")]);
  const r = run(f, planDrop(f, { kind: "move", id: "c" }, { step: 0, beside: "a", side: "right" }));
  assert.equal(order(r), "a,c | b");
  assert.equal(widths(r), "a:half,c:half,b:full");
});

test("nudging moves one place, crosses into the next step at the ends, and stops at the edges", () => {
  const f = form([F("a"), F("b")], [F("c")]);
  assert.equal(order(run(f, [nudge(f, "b", -1)!])), "b,a | c");
  assert.equal(order(run(f, [nudge(f, "b", 1)!])), "a | b,c");
  assert.equal(order(run(f, [nudge(f, "c", -1)!])), "a,b,c | ");
  assert.equal(nudge(f, "a", -1), null);
  assert.equal(nudge(f, "c", 1), null);
  assert.equal(nudge(f, "gone", 1), null);
});

test("a copy sits right after its field, saves to its own place and keeps the form valid", () => {
  const base = emptyForm();
  const email = base.steps[0].fields[0];
  const withName = run(base, [{ op: "add_field", id: "fn", field: { key: "first_name", type: "text", label: "First name", width: "half", required: true } }]);
  const copied = run(withName, [duplicateOp(allFields(withName)[1], "cp"), duplicateOp(email, "ce")]);
  const all = allFields(copied);
  assert.deepEqual(
    all.map((x) => x.id),
    [email.id, "ce", "fn", "cp"],
  );
  const cp = all.find((x) => x.id === "cp")!;
  assert.equal(cp.label, "First name copy");
  assert.notEqual(cp.key, "first_name");
  assert.equal(cp.width, "half");
  assert.equal(cp.required, true);
  assert.notEqual(all.find((x) => x.id === "ce")!.key, "email");
  assert.ok("form" in checkForm(copied));
  // Content copies keep their words.
  const h = run(base, [{ op: "add_field", id: "h", field: { type: "heading", label: "Heading", content: { text: "Hi", level: 1 } } }]);
  const hc = run(h, [duplicateOp(allFields(h)[1], "h2")]);
  assert.deepEqual(allFields(hc)[2].content, { text: "Hi", level: 1 });
  assert.equal(allFields(hc)[2].key, "c.h2");
});

test("a clicked element goes under the selected field, else at the end of the last step", () => {
  const f = form([F("a"), F("b")], [F("c")]);
  assert.equal(order(run(f, [addOp(f, { type: "text", label: "N" }, "n", "a")])), "a,n,b | c");
  assert.equal(order(run(f, [addOp(f, { type: "text", label: "N" }, "n", null)])), "a,b | c,n");
  assert.equal(order(run(f, [addOp(f, { type: "text", label: "N" }, "n", "gone")])), "a,b | c,n");
});

test("every element adds cleanly, twice, and only the image waits for its address", () => {
  let f = emptyForm();
  for (const pass of [1, 2])
    for (const e of ELEMENTS) {
      const r = applyOp(f, { op: "add_field", id: `${e.id.replace(/_/g, "")}${pass}`, field: e.make(f) });
      assert.ok("form" in r, `${e.name}: ${"error" in r ? r.error : ""}`);
      f = r.form;
    }
  const keys = allFields(f)
    .filter((x) => !x.key.startsWith("c."))
    .map((x) => x.key);
  assert.equal(new Set(keys).size, keys.length, "no two fields save to the same place");
  const r = checkForm(f);
  assert.ok("errors" in r);
  assert.deepEqual(
    r.errors.filter((e) => !/picture address|Up to 40 fields/.test(e)),
    [],
  );
  // "Link" never takes the contact's website.
  assert.match(allFields(f).find((x) => x.label === "Link")!.key, /^q\./);
});

test("pasted options: trimmed, bullets gone, no repeats, a known label keeps its value, at most 100", () => {
  const was = [{ value: "pro", label: "Pro" }];
  assert.deepEqual(linesToOptions(" Free \n\n- Pro\n• Team\nFree\n", was), [
    { value: "Free", label: "Free" },
    { value: "pro", label: "Pro" },
    { value: "Team", label: "Team" },
  ]);
  assert.equal(linesToOptions(Array.from({ length: 150 }, (_, i) => `O${i}`).join("\n")).length, 100);
  assert.deepEqual(linesToOptions("\r\n  \n"), []);
  assert.equal(nextOption([{ value: "Option 1" }, { value: "Option 3" }]), "Option 4");
  assert.equal(nextOption([{ value: "Option 2" }, { value: "x" }]), "Option 3");
});

test("show this field: Always drops its rules, Show and Hide turn them over or add a first one", () => {
  const f = form([F("a"), F("b")]);
  assert.equal(shownMode(f, "b"), "always");
  const shown = run(f, setShownOps(f, "b", "show", "r1"));
  assert.equal(shownMode(shown, "b"), "show");
  assert.deepEqual(shown.rules[0], { id: "r1", when: { field: "a", op: "filled" }, then: { action: "show", field: "b" } });
  const hidden = run(shown, setShownOps(shown, "b", "hide", "r2"));
  assert.equal(hidden.rules.length, 1);
  assert.equal(hidden.rules[0].then.action, "hide");
  // A require rule stays when visibility goes back to Always.
  const req = run(hidden, [{ op: "set_rule", rule: { id: "rq", when: { field: "a", op: "empty" }, then: { action: "require", field: "b" } } }]);
  const always = run(req, setShownOps(req, "b", "always", "x"));
  assert.deepEqual(
    always.rules.map((r) => r.id),
    ["rq"],
  );
  // With no other field to listen to, nothing is added.
  const lone = form([F("a")]);
  assert.deepEqual(setShownOps(lone, "a", "show", "r"), []);
});

test("fonts: stacks and links the brand checker accepts, never a weight a family lacks", () => {
  for (const n of ["Inter", "DM Sans", "Playfair Display", "Space Mono"]) assert.ok(cleanFont(fontStack(n)), n);
  const url = fontUrl(["DM Sans", "Lato", "Unknown Font", "DM Sans"]);
  assert.equal(url, "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lato:wght@400;700&display=swap");
  assert.equal(cleanFontUrl(url), url);
  assert.equal(fontUrl(["Unknown"]), "");
});

test("typing in one box joins one undo step; picks, toggles and moves never do", () => {
  const k = (op: Op) => mergeKey(op);
  assert.equal(k({ op: "update_field", id: "a", patch: { label: "x" } }), k({ op: "update_field", id: "a", patch: { label: "xy" } }));
  assert.notEqual(k({ op: "update_field", id: "a", patch: { label: "x" } }), k({ op: "update_field", id: "b", patch: { label: "x" } }));
  assert.notEqual(k({ op: "update_field", id: "a", patch: { label: "x" } }), k({ op: "update_field", id: "a", patch: { help: "x" } }));
  assert.equal(k({ op: "update_field", id: "a", patch: { required: true } }), "");
  assert.equal(k({ op: "update_field", id: "a", patch: { width: "half" } }), "");
  assert.equal(k({ op: "update_field", id: "a", patch: { label: "x", required: true } }), "");
  assert.equal(k({ op: "move_field", id: "a", step: 0, index: 1 }), "");
  assert.equal(k({ op: "set_copy", title: "a" }), k({ op: "set_copy", title: "ab" }));
  assert.notEqual(k({ op: "set_copy", title: "a" }), k({ op: "set_copy", submit: "a" }));
  assert.equal(k({ op: "set_layout", maxWidth: 500 }), "l:max");
  assert.equal(k({ op: "set_layout", width: "wide", maxWidth: null }), "");
});
