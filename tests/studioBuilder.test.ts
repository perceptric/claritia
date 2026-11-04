// The no-code builder (src/lib/studio/builder.ts): every type in the Add list writes a question the page reads back
// with the right kind, name and label, each name once; a page's jumps become show-ifs on the pages they skip (kept
// apart from the page's own condition, with or-conditions kept right); and a text shows the answers in it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { pipeText, QGROUPS, questionHtml, readJumps, stepShowIfs, uniqueName, writeJumps, type QType } from "../src/lib/studio/builder.ts";
import { cleanPage } from "../src/lib/studio/page.ts";
import { holds } from "../src/lib/studio/runtime.ts";

const KIND: Partial<Record<QType, string>> = { short: "text", long: "textarea", email: "email", number: "number", dropdown: "select", choice: "radio", yesno: "radio", checks: "multi" };

test("every type in the Add list writes a question the page reads back", () => {
  const all = QGROUPS.flatMap(([, xs]) => xs.map(([t]) => t));
  assert.equal(new Set(all).size, all.length);
  for (const t of all) {
    const html = questionHtml(t, `n_${t}`, t === "email" ? { save: "email" } : {});
    const { html: kept, questions } = cleanPage(`<form>${html}</form>`);
    if (t === "heading" || t === "text" || t === "divider") {
      assert.equal(questions.length, 0, t);
      continue;
    }
    assert.equal(questions.length, 1, `${t}: ${kept}`);
    const q = questions[0]!;
    assert.equal(q.name, `n_${t}`, t);
    assert.ok(q.label && q.labelFrom !== "name", `${t} has a label`);
    if (KIND[t]) assert.equal(q.type, KIND[t], t);
    if (t === "email") assert.equal(q.save, "email");
    if (t === "choice" || t === "checks" || t === "dropdown") assert.equal(q.options.length, 3, t);
    if (t === "yesno") assert.deepEqual(q.options.map((o) => o.value), ["Yes", "No"]);
    assert.ok(kept.includes(`data-cl-error-for="n_${t}"`) || q.block, `${t} shows its errors or is a block`);
  }
});

test("a new question's name is never one the page has", () => {
  assert.equal(uniqueName("email", []), "email");
  assert.equal(uniqueName("email", ["email"]), "email_2");
  assert.equal(uniqueName("email", ["email", "email_2"]), "email_3");
  assert.equal(uniqueName("Team size!", []), "team_size");
  assert.equal(uniqueName("2nd", []), "q2nd");
  assert.equal(uniqueName("", []), "answer");
});

test("jumps skip the pages in between, kept apart from each page's own condition", () => {
  assert.deepEqual(readJumps(writeJumps([{ value: "More than 50", to: "page-3" }, { value: "It's me", to: "page-4" }])), [{ value: "More than 50", to: "page-3" }, { value: "It's me", to: "page-4" }]);
  assert.deepEqual(readJumps("broken\n=>x\nok=>"), []);
  const steps = [{ own: "" }, { own: "" }, { own: "" }, { own: "" }];
  // From page 1: More than 50 goes to page 4, skipping 2 and 3; It's me goes to page 3, skipping 2.
  const out = stepShowIfs(steps, [
    { name: "size", value: "More than 50", from: 0, to: 3 },
    { name: "size", value: "It's me", from: 0, to: 2 },
  ]);
  assert.deepEqual(out, ["", `size != 'More than 50' and size != "It's me"`, "size != 'More than 50'", ""]);
  const v = (size: string) => ({ size });
  assert.equal(holds(out[1]!, v("1 to 10")), true);
  assert.equal(holds(out[1]!, v("More than 50")), false);
  assert.equal(holds(out[1]!, v("It's me")), false);
  assert.equal(holds(out[2]!, v("It's me")), true);
  // A page's own "or" condition keeps its meaning with a skip on it.
  const own = stepShowIfs([{ own: "" }, { own: "plan == 'team' or plan == 'ent'" }, { own: "" }], [{ name: "size", value: "big", from: 0, to: 2 }])[1]!;
  assert.equal(own, "plan == 'team' and size != 'big' or plan == 'ent' and size != 'big'");
  assert.equal(holds(own, { plan: "ent", size: "small" }), true);
  assert.equal(holds(own, { plan: "ent", size: "big" }), false);
  assert.equal(holds(own, { plan: "solo", size: "small" }), false);
  // No jumps: each page keeps its own condition exactly.
  assert.deepEqual(stepShowIfs([{ own: "a filled" }, { own: "" }], []), ["a filled", ""]);
});

test("a text shows the answers in it, and an empty one leaves no stray comma", () => {
  assert.equal(pipeText("Thanks, {first_name}!", { first_name: "Ana" }), "Thanks, Ana!");
  assert.equal(pipeText("Thanks, {first_name}!", { first_name: "" }), "Thanks!");
  assert.equal(pipeText("What do you want to fix, {name}?", { name: "" }), "What do you want to fix?");
  assert.equal(pipeText("You picked {tools}.", { tools: ["Typeform", "Sheets"] }), "You picked Typeform, Sheets.");
  assert.equal(pipeText("Hi {unknown}", { name: "x" }), "Hi {unknown}", "a name the form doesn't have stays as written");
});
