// The style engine (docs/design-system.md Parts 2 and 3.2): every value is checked against its property's type and
// can't break out of its rule; design systems and form designs keep only what's known; the cascade picks values in
// the order the compiled CSS applies them; and the compiler scopes every rule to its layer and element.
import assert from "node:assert/strict";
import { test } from "node:test";
import { chainKeys, resolve, sourceText } from "../src/lib/design/cascade.ts";
import { allVariables, readFormDesign, readSystem, setDecl, varKinds, type DesignSystem } from "../src/lib/design/model.ts";
import { fieldParts, PART_KEYS } from "../src/lib/design/parts.ts";
import { PROP_NAMES, propDef } from "../src/lib/design/props.ts";
import { checkValue, safeValue } from "../src/lib/design/values.ts";
import { compileWeb, partSelector } from "../src/lib/design/web.ts";
import { addClass, addVariable, classUses, deleteClass, deleteVariable, evalSum, nudgeValue, originOf, ownValue, parseLength, removeClass, renameClass, resetPart, setProp, setsAny, updateVariable, variableUses } from "../src/lib/design/edit.ts";

test("values: each property takes only values of its type, in range", () => {
  assert.equal(checkValue("padding-top", "12"), "12px");
  assert.equal(checkValue("padding-top", "1.5em"), "1.5em");
  assert.equal(checkValue("padding-top", "-4px"), null, "padding can't be negative");
  assert.equal(checkValue("margin-top", "-4px"), "-4px");
  assert.equal(checkValue("margin-top", "auto"), "auto");
  assert.equal(checkValue("padding-top", "auto"), null);
  assert.equal(checkValue("padding-top", "9999px"), null);
  assert.equal(checkValue("padding-top", "12vw"), null, "vw isn't a spacing unit");
  assert.equal(checkValue("width", "50%"), "50%");
  assert.equal(checkValue("width", "150%"), null);
  assert.equal(checkValue("line-height", "1.4"), "1.4");
  assert.equal(checkValue("font-size", "14"), "14px");
  assert.equal(checkValue("font-size", "3px"), null);
  assert.equal(checkValue("color", "#FFF"), "#fff");
  assert.equal(checkValue("color", "rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(checkValue("color", "hsla(10 20% 30% / 0.5)"), "hsla(10 20% 30% / 0.5)");
  assert.equal(checkValue("color", "12px"), null, "a size isn't a color");
  assert.equal(checkValue("width", "#fff"), null, "a color isn't a width");
  assert.equal(checkValue("display", "FLEX"), "flex");
  assert.equal(checkValue("display", "table"), null);
  assert.equal(checkValue("font-weight", "650"), null);
  assert.equal(checkValue("font-weight", "600"), "600");
  assert.equal(checkValue("opacity", "1.5"), null);
  assert.equal(checkValue("z-index", "2.5"), null);
  assert.equal(checkValue("transition-duration", "0.2s"), "200ms");
  assert.equal(checkValue("aspect-ratio", "16 / 9"), "16 / 9");
  assert.equal(checkValue("grid-template-columns", "repeat(3, 1fr)"), "repeat(3, 1fr)");
  assert.equal(checkValue("grid-template-columns", "repeat(99, 1fr)"), null);
  assert.equal(checkValue("grid-column", "span 2"), "span 2");
  assert.equal(checkValue("transform", "scale(1.02) translateY(-2px)"), "scale(1.02) translateY(-2px)");
  assert.equal(checkValue("transform", "matrix(1,0,0,1,0,0)"), null);
  assert.equal(checkValue("box-shadow", "0 4px 12px rgba(0,0,0,.1), inset 0 0 0 1px #eee"), "0 4px 12px rgba(0,0,0,.1), inset 0 0 0 1px #eee");
  assert.equal(checkValue("box-shadow", "0 4px 12px red"), null, "only colors we read");
  assert.equal(checkValue("background-image", "linear-gradient(90deg, #fff 0%, #000 100%)"), "linear-gradient(90deg, #fff 0%, #000 100%)");
  assert.equal(checkValue("background-image", 'url("https://cdn.acme.com/a.png")'), 'url("https://cdn.acme.com/a.png")');
  assert.equal(checkValue("font-family", "Inter, 'Open Sans', sans-serif"), "Inter, 'Open Sans', sans-serif");
  // Every property in the list has a type the checker knows.
  for (const p of PROP_NAMES) assert.ok(propDef(p).kind, p);
});

test("values: nothing can end the rule, import, escape, run a script or load from http", () => {
  for (const bad of [
    "red; background: url(https://evil.com/x)",
    "red}body{display:none",
    "expression(alert(1))",
    "url(javascript:alert(1))",
    'url("http://evil.com/a.png")',
    "url(//evil.com/a.png)",
    "@import 'x'",
    "red /* x */",
    "\\65 xpression(1)",
    "</style><script>alert(1)</script>",
    "rgb(1,2,3",
    "'unclosed",
    "red !important",
    "url(data:text/html,<script>)",
    "image-set('https://x.com/a.png' 1x)",
  ]) {
    assert.equal(checkValue("background-image", bad), null, bad);
    assert.equal(checkValue("color", bad), null, bad);
  }
  assert.equal(safeValue("x".repeat(1001)), null);
});

test("values: a variable fits only a property of its kind", () => {
  const vars = varKinds(allVariables({ variables: [{ id: "brand", name: "Brand", kind: "color", value: "#0055ff" }] }));
  assert.equal(checkValue("color", "$brand", vars), "$brand");
  assert.equal(checkValue("background-color", "$accent", vars), "$accent");
  assert.equal(checkValue("padding-top", "$brand", vars), null, "a color variable isn't a padding");
  assert.equal(checkValue("color", "$gone", vars), null);
  assert.equal(checkValue("font-weight", "$label-weight", vars), "$label-weight");
  assert.equal(checkValue("color", "$Bad Id", vars), null);
});

const SYS: DesignSystem = readSystem({
  variables: [
    { id: "brand", name: "Brand", kind: "color", value: "#0055FF", dark: "#99bbff" },
    { id: "space-4", name: "Space 4", kind: "length", value: "16px" },
  ],
  globals: { label: { base: { "font-weight": "600", color: "$brand" }, phone: { "font-size": "13px" } }, button: { base: { "border-top-left-radius": "999px" }, "base:hover": { opacity: "0.9" } } },
  classes: [
    { id: "boxed", name: "Boxed", styles: { field: { base: { "padding-top": "$space-4" } }, label: { base: { color: "#111111" }, "base:hover": { color: "#222222" } } } },
    { id: "large", name: "is-large", with: ["boxed"], styles: { label: { base: { "font-size": "18px" }, tablet: { color: "#333333" } } } },
  ],
});

test("systems: only known variables, classes and parts, with checked values", () => {
  const s = readSystem({
    variables: [
      { id: "brand", name: "Brand", kind: "color", value: "red" },
      { id: "text", name: "Mine", kind: "color", value: "#000" },
      { id: "ok", name: "OK", kind: "color", value: "#000", dark: "nope" },
      { id: "Bad Id", kind: "color", value: "#000" },
    ],
    globals: { label: { base: { color: "#000", "-moz-binding": "url(x)" } }, nosuchpart: { base: { color: "#000" } } },
    classes: [
      { id: "combo", name: "Combo first", with: ["later"], styles: {} },
      { id: "later", name: "Later", styles: { button: { base: { color: "#000" } }, label: { base: { color: "#000" } } } },
      { id: "dupe", name: "later", styles: {} },
    ],
    breakpoints: { tablet: 5000, phone: 10 },
  });
  assert.deepEqual(
    s.variables.map((v) => v.id),
    ["ok"],
    "red isn't a color we take as hex; built-in ids can't be reused; a bad dark value is dropped, not the variable",
  );
  assert.equal(s.variables[0].dark, undefined);
  assert.deepEqual(s.globals, { label: { base: { color: "#000" } } });
  assert.deepEqual(
    s.classes.map((c) => c.id),
    ["later"],
    "a combo must follow its base; names are unique",
  );
  assert.deepEqual(s.classes[0].styles, { label: { base: { color: "#000" } } }, "a class styles only parts inside a field");
  assert.deepEqual(s.breakpoints, { tablet: 1400, phone: 320 });
});

test("form designs: only the form's elements, a base class first, combos on their base", () => {
  const d = readFormDesign(
    {
      classes: { a: ["large", "boxed"], b: ["boxed", "large", "gone"], c: ["boxed"], zz: ["boxed"] },
      styles: { a: { label: { base: { color: "#000" } }, button: { base: { color: "#000" } } }, form: { button: { base: { color: "#000" } }, label: { base: { color: "#000" } } }, zz: { label: { base: { color: "#000" } } } },
    },
    new Set(["a", "b", "c"]),
    SYS,
  );
  assert.deepEqual(d.classes, { a: ["boxed"], b: ["boxed", "large"], c: ["boxed"] });
  assert.deepEqual(d.styles, { a: { label: { base: { color: "#000" } } }, form: { button: { base: { color: "#000" } } } });
});

test("cascade: defaults, global, class, combo, element; larger breakpoints carry down; a state wins over plain", () => {
  const design = readFormDesign({ classes: { a: ["boxed", "large"] }, styles: { a: { label: { phone: { color: "#444444" } } } } }, new Set(["a"]), SYS);
  const at = (bp: "base" | "tablet" | "phone", state?: "hover") => resolve(SYS, design, { id: "a", part: "label" }, bp, state);
  assert.equal(at("base")["font-size"]?.value, "18px");
  assert.equal(at("base")["font-size"]?.source.classId, "large");
  assert.equal(at("phone")["font-size"]?.value, "18px", "the combo (a later level) beats the global's phone size");
  assert.equal(at("base").color?.value, "#111111");
  assert.equal(at("tablet").color?.value, "#333333");
  assert.equal(at("phone").color?.value, "#444444");
  assert.equal(at("base", "hover").color?.value, "#222222");
  assert.equal(at("tablet", "hover").color?.value, "#333333", "a later level's plain value beats an earlier level's hover");
  assert.equal(at("base")["font-weight"]?.source.level, "global");
  assert.equal(at("base")["font-size"]?.source.level, "class");
  const plain = resolve(SYS, {}, { id: "x", part: "label" }, "base");
  assert.equal(plain["font-weight"]?.value, "600");
  assert.equal(resolve(SYS, {}, { id: "x", part: "input" }, "base")["min-height"]?.source.level, "default");
  assert.deepEqual(chainKeys("tablet", "hover"), ["base", "tablet", "base:hover", "tablet:hover"]);
  assert.equal(sourceText({ level: "class", classId: "large", key: "tablet" }, SYS), "Class is-large, Tablet");
});

test("compiler: layers in order, scoped selectors, variables, breakpoints, states", () => {
  const design = readFormDesign({ classes: { a: ["boxed", "large"] }, styles: { a: { input: { "base:focus": { "border-top-color": "$brand" } } }, form: { button: { phone: { width: "100%" } } } } }, new Set(["a"]), SYS);
  const css = compileWeb(SYS, design, ["a"]);
  assert.ok(css.startsWith("@layer base, g, c-boxed, c-large, e;"), css.slice(0, 80));
  assert.match(css, /:host\{--v-brand:#0055ff;--v-space-4:16px\}/);
  assert.match(css, /@layer g\{\n[^@]*\.fl \.lb\{font-weight:600;color:var\(--v-brand\)\}/);
  assert.match(css, /\.ac \.bt:not\(\.bk\):hover\{opacity:0\.9\}/);
  assert.match(css, /@media \(max-width: 479px\)\{\n\.fl \.lb\{font-size:13px\}/);
  assert.match(css, /@layer c-large\{\n\.fl\.c-large\.c-boxed \.lb\{font-size:18px\}/);
  assert.ok(css.indexOf("@layer c-boxed{") < css.indexOf("@layer c-large{"), "classes in the system's order");
  assert.match(css, /\.fl\[data-id="a"\] :is\(\.in, \.bx\):focus-within\{border-top-color:var\(--v-brand\)\}/);
  assert.match(css, /@layer e\{\n[^@]*@media \(max-width: 479px\)\{\n\.ac \.bt:not\(\.bk\)\{width:100%\}/);
  // Built-in variables keep the names the form's stylesheet already uses.
  assert.match(compileWeb(readSystem({ globals: { label: { base: { color: "$accent" } } } }), {}, []), /color:var\(--clr-accent\)/);
  // The builder's device frames apply their breakpoint's rules directly, larger ones too, smaller ones not at all.
  const tablet = compileWeb(SYS, {}, [], { device: "tablet" });
  assert.ok(!tablet.includes("@media") && !tablet.includes("font-size:13px"), "a tablet frame has no phone rules and no media queries");
  assert.match(compileWeb(SYS, {}, [], { device: "phone" }), /\.fl \.lb\{font-size:13px\}/);
  // A forced state in the builder has the same weight as the real one.
  assert.equal(partSelector("label", ".fl", "hover", true), ".fl .lb:is(:hover, .clr-force-hover)");
  // Unused classes aren't written.
  assert.ok(!compileWeb(SYS, {}, []).includes("c-boxed"));
});

test("compiler: every part has a selector, states only where they apply, and a bad id can't make a selector", () => {
  for (const p of PART_KEYS) assert.ok(partSelector(p, ".fl") !== null, p);
  assert.equal(partSelector("placeholder", ".fl", "hover"), null);
  assert.equal(partSelector("title", ".fl", "invalid"), null);
  assert.equal(partSelector("label", ".fl", "invalid"), '.fl:has([aria-invalid="true"]) .lb');
  assert.equal(partSelector("option", ".fl", "checked"), ".fl .ck:has(:checked)");
  assert.equal(partSelector("placeholder", ".fl"), ".fl .in::placeholder, .fl .bx .ph");
  const evil = readFormDesign({ styles: { 'a"]{}body{x': { label: { base: { color: "#000" } } } } }, new Set(['a"]{}body{x']), SYS);
  assert.ok(!compileWeb(SYS, evil, ['a"]{}body{x']).includes("body"));
  // Every field type's parts are known parts.
  for (const t of ["text", "choice", "checkbox", "rating", "heading", "calc", "dropdown"] as const) assert.ok(fieldParts(t).every((p) => PART_KEYS.includes(p)));
});

test("setDecl sets, replaces and clears, and refuses a bad value", () => {
  let s = setDecl({}, "label", "base", "color", "#000");
  assert.deepEqual(s, { label: { base: { color: "#000" } } });
  s = setDecl(s, "label", "phone:hover", "color", "#111");
  assert.equal(s.label?.["phone:hover"]?.color, "#111");
  assert.deepEqual(setDecl(s, "label", "base", "color", "expression(x)"), { label: { "phone:hover": { color: "#111" } } }, "a bad value clears");
  assert.deepEqual(setDecl(setDecl(s, "label", "phone:hover", "color", ""), "label", "base", "color", ""), {});
});

test("edits: a property lands at its level, breakpoint and state; bad values change nothing", () => {
  const e0 = { system: readSystem({}, {}), design: {} };
  const el = setProp(e0, {}, { kind: "element" }, "a", "label", "tablet", "hover", "color", "#ff0000")!;
  assert.deepEqual(el.design.styles, { a: { label: { "tablet:hover": { color: "#ff0000" } } } });
  assert.equal(setProp(e0, {}, { kind: "element" }, "a", "label", "base", undefined, "color", "red;}body{x"), null);
  assert.equal(setProp(e0, {}, { kind: "element" }, "a", "label", "base", undefined, "color", "$nope"), null, "an unknown variable is refused");
  assert.ok(setProp(e0, {}, { kind: "element" }, "a", "label", "base", undefined, "color", "$accent"));
  const g = setProp(e0, {}, { kind: "global" }, "a", "input", "base", undefined, "padding-top", evalSum("16+8"))!;
  assert.deepEqual(g.system.globals, { input: { base: { "padding-top": "24px" } } });
  // Clearing the last value leaves nothing behind.
  const cleared = setProp(el, {}, { kind: "element" }, "a", "label", "tablet", "hover", "color", "")!;
  assert.equal(cleared.design.styles, undefined);
  // A placeholder has no states: the edit lands on the plain key.
  const ph = setProp(e0, {}, { kind: "element" }, "a", "placeholder", "base", "hover", "color", "#00ff00")!;
  assert.deepEqual(ph.design.styles?.a?.placeholder, { base: { color: "#00ff00" } });
});

test("edits: a border width with no style showing also sets solid, and keeps a style that's there", () => {
  const e0 = { system: readSystem({}, {}), design: {} };
  const w = setProp(e0, {}, { kind: "element" }, "a", "label", "base", undefined, "border-top-width", "2px")!;
  assert.deepEqual(w.design.styles?.a?.label?.base, { "border-top-width": "2px", "border-top-style": "solid" });
  const dashed = { system: readSystem({ globals: { label: { base: { "border-top-style": "dashed" } } } }, {}), design: {} };
  const w2 = setProp(dashed, {}, { kind: "element" }, "a", "label", "base", undefined, "border-top-width", "2px")!;
  assert.deepEqual(w2.design.styles?.a?.label?.base, { "border-top-width": "2px" });
});

test("edits: where a value comes from", () => {
  const system = readSystem({ globals: { label: { base: { color: "#111111" } } }, classes: [{ id: "k1", name: "Big", styles: { label: { base: { "font-size": "20px" } } } }] }, {});
  const e = { system, design: { classes: { a: ["k1"] }, styles: { a: { label: { base: { "letter-spacing": "1px" } } } } } };
  const el = { kind: "element" } as const;
  assert.equal(originOf(e, el, "a", "label", "base", undefined, "letter-spacing"), "here");
  assert.equal(originOf(e, el, "a", "label", "phone", undefined, "letter-spacing"), "inherited");
  assert.equal(originOf(e, el, "a", "label", "base", undefined, "font-size"), "class");
  assert.equal(originOf(e, el, "a", "label", "base", undefined, "color"), "global");
  assert.equal(originOf(e, el, "a", "label", "base", undefined, "font-weight"), "default");
  assert.equal(originOf(e, el, "a", "label", "base", undefined, "opacity"), "none");
  assert.equal(originOf(e, { kind: "class", id: "k1" }, "a", "label", "base", undefined, "font-size"), "here");
  assert.equal(ownValue(e, el, "a", "label", "base", undefined, "letter-spacing"), "1px");
  assert.equal(ownValue(e, el, "a", "label", "tablet", undefined, "letter-spacing"), undefined);
  assert.equal(setsAny(e, el, "a", "label", "phone", undefined, ["letter-spacing"]), true);
  assert.deepEqual(resetPart(e, el, "a", "label").design.styles, undefined);
});

test("edits: classes go on by name, a new second class is a combo, and combos come off with their base", () => {
  const e0 = { system: readSystem({}, {}), design: {} };
  const one = addClass(e0, "a", "Card");
  assert.ok(!("error" in one));
  const card = one.system.classes[0]!;
  assert.deepEqual(one.design.classes, { a: [card.id] });
  const two = addClass(one, "a", "Large");
  assert.ok(!("error" in two));
  const large = two.system.classes[1]!;
  assert.deepEqual(large.with, [card.id]);
  // The same name again reuses the class.
  const again = addClass(two, "b", "card");
  assert.ok(!("error" in again));
  assert.equal(again.system.classes.length, 2);
  assert.deepEqual(again.design.classes?.b, [card.id]);
  // A combo can't go where its base isn't.
  const lone = addClass({ system: two.system, design: {} }, "c", "Large");
  assert.ok("error" in lone);
  assert.deepEqual(removeClass(again, "a", card.id).design.classes, { b: [card.id] });
  assert.equal(classUses(again.design, card.id), 2);
  // What the edits make passes the same checks as a saved design.
  const read = readFormDesign(two.design, new Set(["a"]), readSystem(two.system, {}), {});
  assert.deepEqual(read.classes, two.design.classes);
});

test("numbers: sums, nudges and lengths", () => {
  assert.equal(evalSum("16+8"), "24");
  assert.equal(evalSum("10px*2"), "20px");
  assert.equal(evalSum("1.5em-0.25"), "1.25em");
  assert.equal(evalSum("4px+1em"), "4px+1em");
  assert.equal(evalSum("auto"), "auto");
  assert.deepEqual(parseLength("12.5px"), { n: 12.5, unit: "px" });
  assert.equal(parseLength("$gap"), null);
  assert.equal(nudgeValue("10px", 1, {}, "px", "padding-top"), "11px");
  assert.equal(nudgeValue("10px", 1, { shift: true }, "px", "padding-top"), "20px");
  assert.equal(nudgeValue("10px", -1, { alt: true }, "px", "padding-top"), "9.9px");
  assert.equal(nudgeValue("0px", -3, {}, "px", "padding-top"), "0px", "stays in range");
  assert.equal(nudgeValue(undefined, 2, {}, "px", "margin-top"), "2px");
  assert.equal(nudgeValue("0.5", 1, {}, "", "opacity"), "0.55");
});

test("variables: add, rename and change keep uses; deleting swaps uses for a value", () => {
  let system = readSystem({}, {});
  const a = addVariable(system, "Brand blue", "color", "#3355ff");
  assert.ok(!("error" in a));
  system = a;
  const v = system.variables[0]!;
  assert.equal(v.id, "brand-blue");
  assert.ok("error" in addVariable(system, "brand blue", "color", "#000000"), "names stay unique");
  assert.ok("error" in addVariable(system, "Bad", "color", "red;}x{"), "values are checked");
  assert.ok("error" in addVariable(system, "Text", "color", "#000000"), "built-in names are taken");
  const twice = addVariable(addVariable(system, "Gap 2", "length", "8") as DesignSystem, "Gap-2!", "length", "8");
  assert.ok(!("error" in twice));
  assert.deepEqual(twice.variables.slice(1).map((x) => x.id), ["gap-2", "gap-2-2"], "two names with the same letters get different ids");
  const renamed = updateVariable(system, v.id, { name: "Ocean", value: "#0000ff", dark: "#8899ff" });
  assert.ok(!("error" in renamed));
  assert.deepEqual(renamed.variables[0], { id: "brand-blue", name: "Ocean", kind: "color", value: "#0000ff", dark: "#8899ff" });
  assert.ok("error" in updateVariable(system, "text", { value: "#000000" }), "built-ins change in the theme");
  const used = setProp({ system: renamed, design: {} }, {}, { kind: "element" }, "a", "label", "base", undefined, "color", "$brand-blue")!;
  const g = setProp(used, {}, { kind: "global" }, "a", "input", "base", undefined, "background-color", "$brand-blue")!;
  assert.equal(variableUses(g, "brand-blue"), 2);
  const del = deleteVariable(g, "brand-blue");
  assert.equal(del.system.variables.length, 0);
  assert.equal(del.design.styles?.a?.label?.base?.color, "#0000ff");
  assert.equal(del.system.globals.input?.base?.["background-color"], "#0000ff");
  assert.equal(deleteVariable(g, "brand-blue", "$accent").design.styles?.a?.label?.base?.color, "$accent");
  // What's left passes the saved-design checks.
  assert.deepEqual(readSystem(del.system, {}).globals, del.system.globals);
});

test("classes: rename keeps names unique; delete takes combos and uses with it", () => {
  const e0 = { system: readSystem({}, {}), design: {} };
  const one = addClass(e0, "a", "Card") as { system: DesignSystem; design: object };
  const two = addClass(one as never, "a", "Large") as { system: DesignSystem; design: { classes?: Record<string, string[]> } };
  const [card, large] = two.system.classes;
  assert.ok("error" in renameClass(two.system, large!.id, "card"));
  const r = renameClass(two.system, card!.id, "Panel");
  assert.ok(!("error" in r) && r.classes[0]!.name === "Panel");
  const gone = deleteClass(two as never, card!.id);
  assert.equal(gone.system.classes.length, 0, "the combo goes with its base");
  assert.equal(gone.design.classes, undefined);
});
