// What the style panel changes (docs/design-system.md Part 5.2): one property at one level (this element, one of
// its classes, or the global style every form on the design system shares), at one breakpoint and state. Also
// classes on elements, and the number handling behind scrubbing and typed sums. Pure functions, tested in
// tests/design.test.ts; the panel only calls these.

import { chainKeys, resolve } from "./cascade.ts";
import { allVariables, newClassId, setDecl, varKinds, LIMITS, type Breakpoint, type DesignSystem, type FormDesign, type PartStyles, type RuleKey, type State, type Variable } from "./model.ts";
import { partDef, type PartKey } from "./parts.ts";
import { propDef, type Prop } from "./props.ts";
import { checkValue } from "./values.ts";
import type { Tokens } from "../forms/brand.ts";

/** Where an edit lands: the element itself, one of its classes, or the global style. */
export type Level = { kind: "element" } | { kind: "class"; id: string } | { kind: "global" };
export type Edit = { system: DesignSystem; design: FormDesign };

export const ruleKey = (bp: Breakpoint, state?: State): RuleKey => (state ? `${bp}:${state}` : bp);

/** The styles one level holds. A class only styles parts inside a field, so a form part at class level is empty. */
export function stylesAt(e: Edit, level: Level, id: string): PartStyles {
  if (level.kind === "global") return e.system.globals;
  if (level.kind === "class") return e.system.classes.find((c) => c.id === level.id)?.styles ?? {};
  return e.design.styles?.[id] ?? {};
}

function withStyles(e: Edit, level: Level, id: string, styles: PartStyles): Edit {
  if (level.kind === "global") return { ...e, system: { ...e.system, globals: styles } };
  if (level.kind === "class") return { ...e, system: { ...e.system, classes: e.system.classes.map((c) => (c.id === level.id ? { ...c, styles } : c)) } };
  const all = { ...(e.design.styles ?? {}) };
  if (Object.keys(styles).length) all[id] = styles;
  else delete all[id];
  const { styles: _old, ...rest } = e.design;
  void _old;
  return { ...e, design: Object.keys(all).length ? { ...rest, styles: all } : rest };
}

/** Whether a value can be written, before it's written: the clean value, or null with nothing changed. */
export function checkFor(e: Edit, tokens: Partial<Tokens>, prop: Prop, raw: string): string | null {
  return checkValue(prop, raw, varKinds(allVariables(e.system, tokens)));
}

/**
 * Set (or clear with "") one property. A border width with no border style showing also sets the style to solid,
 * since CSS draws no border without one. Returns null when the value isn't allowed.
 */
export function setProp(e: Edit, tokens: Partial<Tokens>, level: Level, id: string, part: PartKey, bp: Breakpoint, state: State | undefined, prop: Prop, raw: string): Edit | null {
  const vars = varKinds(allVariables(e.system, tokens));
  const value = raw.trim();
  if (value && checkValue(prop, value, vars) === null) return null;
  const key = ruleKey(bp, partDef(part).plain ? undefined : state);
  let styles = setDecl(stylesAt(e, level, id), part, key, prop, value, vars);
  const side = /^border-(top|right|bottom|left)-width$/.exec(prop)?.[1];
  if (side && value && value !== "0" && value !== "0px") {
    const styleProp = `border-${side}-style` as Prop;
    const now = resolve(e.system, e.design, { id, part }, bp, state)[styleProp]?.value;
    if (!now || now === "none") styles = setDecl(styles, part, key, styleProp, "solid", vars);
  }
  if (declTotal(styles) > LIMITS.decls * 20) return null;
  return withStyles(e, level, id, styles);
}

const declTotal = (s: PartStyles) => Object.values(s).reduce((n, r) => n + Object.values(r ?? {}).reduce((m, d) => m + Object.keys(d ?? {}).length, 0), 0);

/** Clear every property a level sets on a part (at one breakpoint and state, or all of them). */
export function resetPart(e: Edit, level: Level, id: string, part: PartKey, key?: RuleKey): Edit {
  const styles: PartStyles = { ...stylesAt(e, level, id) };
  if (!key) delete styles[part];
  else {
    const rule = { ...(styles[part] ?? {}) };
    delete rule[key];
    if (Object.keys(rule).length) styles[part] = rule;
    else delete styles[part];
  }
  return withStyles(e, level, id, styles);
}

/** Where a property's value comes from, for the label's color: set here, inherited at this level, or another level. */
export type Origin = "here" | "inherited" | "class" | "global" | "default" | "none";
export function originOf(e: Edit, level: Level, id: string, part: PartKey, bp: Breakpoint, state: State | undefined, prop: Prop): Origin {
  const r = resolve(e.system, e.design, { id, part }, bp, state)[prop];
  if (!r) return "none";
  const s = r.source;
  const same = s.level === level.kind && (level.kind !== "class" || s.classId === level.id);
  if (same) return s.key === ruleKey(bp, partDef(part).plain ? undefined : state) ? "here" : "inherited";
  return s.level === "element" ? "inherited" : s.level === "class" ? "class" : s.level === "global" ? "global" : "default";
}

/** The value a level itself sets for the current breakpoint and state, if any. */
export function ownValue(e: Edit, level: Level, id: string, part: PartKey, bp: Breakpoint, state: State | undefined, prop: Prop): string | undefined {
  return stylesAt(e, level, id)[part]?.[ruleKey(bp, partDef(part).plain ? undefined : state)]?.[prop];
}

/** Whether a level sets anything a breakpoint and state would show, for a section's dot. */
export function setsAny(e: Edit, level: Level, id: string, part: PartKey, bp: Breakpoint, state: State | undefined, props: Prop[]): boolean {
  const rule = stylesAt(e, level, id)[part];
  return !!rule && chainKeys(bp, state).some((k) => props.some((p) => rule[k]?.[p] !== undefined));
}

// Classes ----------------------------------------------------------------------------------------------------------

/**
 * Put a class on an element by name. An existing class is reused; a new one is made. On an element that already
 * has a class, a new class is a combo of the first (it styles only elements with both, as in Webflow).
 */
export function addClass(e: Edit, id: string, name: string): Edit | { error: string } {
  const clean = name.trim().slice(0, LIMITS.nameLen);
  if (!clean) return { error: "Name the class." };
  const on = e.design.classes?.[id] ?? [];
  if (on.length >= 6) return { error: "An element can have six classes at most." };
  let system = e.system;
  let cls = system.classes.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (cls?.with && !cls.with.every((w) => on.includes(w))) return { error: `${cls.name} only goes with ${cls.with.map((w) => system.classes.find((c) => c.id === w)?.name).join(", ")}.` };
  if (!cls) {
    if (system.classes.length >= LIMITS.classes) return { error: "This design system has too many classes." };
    cls = { id: newClassId(system), name: clean, ...(on.length ? { with: [on[0]!] } : {}), styles: {} };
    system = { ...system, classes: [...system.classes, cls] };
  }
  if (on.includes(cls.id)) return { system, design: e.design };
  return { system, design: { ...e.design, classes: { ...(e.design.classes ?? {}), [id]: [...on, cls.id] } } };
}

/** Take a class off an element, and the combos that needed it. */
export function removeClass(e: Edit, id: string, classId: string): Edit {
  const on = (e.design.classes?.[id] ?? []).filter((c) => c !== classId && !e.system.classes.find((x) => x.id === c)?.with?.includes(classId));
  const classes = { ...(e.design.classes ?? {}) };
  if (on.length) classes[id] = on;
  else delete classes[id];
  const { classes: _old, ...rest } = e.design;
  void _old;
  return { system: e.system, design: Object.keys(classes).length ? { ...rest, classes } : rest };
}

/** How many elements use each class, in one form's design. */
export const classUses = (design: FormDesign, classId: string) => Object.values(design.classes ?? {}).filter((l) => l.includes(classId)).length;

// Numbers ----------------------------------------------------------------------------------------------------------

/** A length as its number and unit ("16px" → 16, "px"); null for auto, variables and the rest. */
export function parseLength(v: string | undefined): { n: number; unit: string } | null {
  const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))([a-z%]*)$/.exec((v ?? "").trim());
  return m ? { n: Number(m[1]), unit: m[2]! } : null;
}

/** Typed sums: "16+8" is 24px, "10*2" is 20px, "1.5em-0.25" is 1.25em. Anything else comes back as typed. */
export function evalSum(raw: string): string {
  const m = /^\s*(-?\d+(?:\.\d+)?)([a-z%]*)\s*([-+*/])\s*(-?\d+(?:\.\d+)?)([a-z%]*)\s*$/.exec(raw);
  if (!m) return raw.trim();
  const unit = m[2] || m[5] || "";
  if (m[2] && m[5] && m[2] !== m[5]) return raw.trim();
  const a = Number(m[1]);
  const b = Number(m[4]);
  const n = m[3] === "+" ? a + b : m[3] === "-" ? a - b : m[3] === "*" ? a * b : b ? a / b : a;
  return `${+n.toFixed(4)}${unit}`;
}

/** A number nudged by arrow keys or a drag: 1 a step, 10 with Shift, 0.1 with Alt. Keeps the unit. */
export function nudgeValue(v: string | undefined, steps: number, mod: { shift?: boolean; alt?: boolean }, fallbackUnit: string, prop: Prop): string | null {
  const d = propDef(prop);
  const p = parseLength(v) ?? { n: 0, unit: fallbackUnit };
  const size = mod.alt ? 0.1 : mod.shift ? 10 : d.kind === "number" && (d.max ?? 10) <= 1 ? 0.05 : 1;
  let n = +(p.n + steps * size).toFixed(4);
  if (d.min !== undefined && n < d.min && p.unit !== "%") n = d.min;
  if (d.max !== undefined && n > d.max && p.unit !== "%") n = d.max;
  return `${n}${p.unit}`;
}

// Classes and variables in the design system ----------------------------------------------------------------------

/** Rename a class; names stay unique. */
export function renameClass(system: DesignSystem, classId: string, name: string): DesignSystem | { error: string } {
  const clean = name.trim().slice(0, LIMITS.nameLen);
  if (!clean) return { error: "Name the class." };
  if (system.classes.some((c) => c.id !== classId && c.name.toLowerCase() === clean.toLowerCase())) return { error: "Another class has that name." };
  return { ...system, classes: system.classes.map((c) => (c.id === classId ? { ...c, name: clean } : c)) };
}

/** Delete a class, its combos, and their places on this form's elements. */
export function deleteClass(e: Edit, classId: string): Edit {
  const gone = new Set([classId, ...e.system.classes.filter((c) => c.with?.includes(classId)).map((c) => c.id)]);
  const system = { ...e.system, classes: e.system.classes.filter((c) => !gone.has(c.id)) };
  const classes = Object.fromEntries(Object.entries(e.design.classes ?? {}).map(([el, l]) => [el, l.filter((c) => !gone.has(c))] as const).filter(([, l]) => l.length));
  const { classes: _old, ...rest } = e.design;
  void _old;
  return { system, design: Object.keys(classes).length ? { ...rest, classes } : rest };
}

const VAR_KINDS = ["color", "length", "font", "number", "shadow"] as const;
const PROBE: Record<Variable["kind"], Prop> = { color: "color", length: "padding-top", font: "font-family", number: "opacity", shadow: "box-shadow" };

/** Add a variable. Its id comes from its name and never changes, so renaming keeps every use. */
export function addVariable(system: DesignSystem, name: string, kind: Variable["kind"], value: string): DesignSystem | { error: string } {
  const clean = name.trim().slice(0, LIMITS.nameLen);
  if (!clean) return { error: "Name the variable." };
  if (!VAR_KINDS.includes(kind)) return { error: "Pick a kind." };
  if (system.variables.length >= LIMITS.variables) return { error: "This design system has too many variables." };
  if (allVariables(system).some((v) => v.name.toLowerCase() === clean.toLowerCase())) return { error: "Another variable has that name." };
  const base = (clean.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/^[^a-z]+/, "") || "var").slice(0, 32);
  let id = base;
  for (let n = 2; allVariables(system).some((v) => v.id === id); n++) id = `${base}-${n}`;
  const checked = kind === "number" ? (Number.isFinite(Number(value)) && value.trim() !== "" ? String(Number(value)) : null) : checkValue(PROBE[kind], value);
  if (checked === null || checked.startsWith("$")) return { error: "That value doesn't fit." };
  return { ...system, variables: [...system.variables, { id, name: clean, kind, value: checked }] };
}

/** Change a variable's name, value or dark value. Built-in variables are the brand kit's tokens and change there. */
export function updateVariable(system: DesignSystem, id: string, patch: { name?: string; value?: string; dark?: string }): DesignSystem | { error: string } {
  const v = system.variables.find((x) => x.id === id);
  if (!v) return { error: "Change this one in the theme." };
  const name = patch.name === undefined ? v.name : patch.name.trim().slice(0, LIMITS.nameLen);
  if (!name) return { error: "Name the variable." };
  if (allVariables(system).some((x) => x.id !== id && x.name.toLowerCase() === name.toLowerCase())) return { error: "Another variable has that name." };
  let value = v.value;
  if (patch.value !== undefined) {
    const c = v.kind === "number" ? (Number.isFinite(Number(patch.value)) && patch.value.trim() !== "" ? String(Number(patch.value)) : null) : checkValue(PROBE[v.kind], patch.value);
    if (c === null || c.startsWith("$")) return { error: "That value doesn't fit." };
    value = c;
  }
  let dark = v.dark;
  if (patch.dark !== undefined) {
    if (!patch.dark.trim()) dark = undefined;
    else {
      const c = v.kind === "color" ? checkValue("color", patch.dark) : null;
      if (c === null || c.startsWith("$")) return { error: "That value doesn't fit." };
      dark = c;
    }
  }
  const next: Variable = { id, name, kind: v.kind, value, ...(dark ? { dark } : {}) };
  return { ...system, variables: system.variables.map((x) => (x.id === id ? next : x)) };
}

const swapRefs = (styles: PartStyles, ref: string, to: string): PartStyles =>
  Object.fromEntries(
    Object.entries(styles).map(([part, rule]) => [
      part,
      Object.fromEntries(Object.entries(rule ?? {}).map(([k, d]) => [k, Object.fromEntries(Object.entries(d ?? {}).map(([p, v]) => [p, v === ref ? to : v]))])),
    ]),
  ) as PartStyles;

/** Where a variable is used: in the system's styles and this form's. */
export function variableUses(e: Edit, id: string): number {
  const ref = `$${id}`;
  const count = (s: PartStyles) => Object.values(s).reduce((n, r) => n + Object.values(r ?? {}).reduce((m, d) => m + Object.values(d ?? {}).filter((v) => v === ref).length, 0), 0);
  return count(e.system.globals) + e.system.classes.reduce((n, c) => n + count(c.styles), 0) + Object.values(e.design.styles ?? {}).reduce((n, s) => n + count(s), 0);
}

/** Delete a variable: each use takes `replacement` (another variable as `$id`, or a value), or the variable's own value. */
export function deleteVariable(e: Edit, id: string, replacement?: string): Edit {
  const v = e.system.variables.find((x) => x.id === id);
  if (!v) return e;
  const ref = `$${id}`;
  const to = replacement && replacement !== ref ? replacement : v.value;
  const system: DesignSystem = {
    ...e.system,
    variables: e.system.variables.filter((x) => x.id !== id),
    globals: swapRefs(e.system.globals, ref, to),
    classes: e.system.classes.map((c) => ({ ...c, styles: swapRefs(c.styles, ref, to) })),
  };
  const styles = e.design.styles ? Object.fromEntries(Object.entries(e.design.styles).map(([el, s]) => [el, swapRefs(s, ref, to)])) : undefined;
  return { system, design: styles ? { ...e.design, styles } : e.design };
}
