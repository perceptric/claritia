// Which value a part ends up with, and where it came from (docs/design-system.md Part 5.3). Levels apply in order,
// later wins: the form's own stylesheet (defaults), global styles, the element's classes (base class, then each
// combo, in the order the design system lists them), then the element's own styles. Inside one level, a property set
// at a larger breakpoint carries down to smaller ones, and a state's values win over plain values. The web compiler
// (web.ts) writes CSS that does exactly this with cascade layers, so the panel and the browser always agree. Runs in
// the browser and on the server.

import { partDef, type PartKey } from "./parts.ts";
import { BREAKPOINTS, type Breakpoint, type DesignClass, type DesignSystem, type FormDesign, type RuleKey, type State, type StyleRule, type Variable } from "./model.ts";
import { isProp, type Prop } from "./props.ts";
import { varRef } from "./values.ts";

export type Level = "default" | "global" | "class" | "element";
export type Source = { level: Level; classId?: string; key?: RuleKey };
export type Resolved = Partial<Record<Prop, { value: string; source: Source }>>;
/** What one element is: its id in the form ("form" for the form's own parts) and the part. */
export type Target = { id: string; part: PartKey };

/** The rule keys that apply at a breakpoint and state, weakest first. */
export function chainKeys(bp: Breakpoint, state?: State): RuleKey[] {
  const upto = BREAKPOINTS.slice(0, BREAKPOINTS.indexOf(bp) + 1);
  return [...upto, ...(state ? upto.map((b) => `${b}:${state}` as RuleKey) : [])];
}

/** The classes that apply to an element: its base class, then each combo whose classes it all has, in system order. */
export function appliedClasses(system: DesignSystem, design: FormDesign, id: string): DesignClass[] {
  const on = new Set(design.classes?.[id] ?? []);
  return system.classes.filter((c) => on.has(c.id) && (c.with ?? []).every((w) => on.has(w)));
}

/** Every level's rule for a target, weakest first. */
export function levelsFor(system: DesignSystem, design: FormDesign, t: Target): { level: Level; classId?: string; rule: StyleRule }[] {
  const out: { level: Level; classId?: string; rule: StyleRule }[] = [];
  const g = system.globals[t.part];
  if (g) out.push({ level: "global", rule: g });
  if (t.id !== "form")
    for (const c of appliedClasses(system, design, t.id)) {
      const r = c.styles[t.part];
      if (r) out.push({ level: "class", classId: c.id, rule: r });
    }
  const own = design.styles?.[t.id]?.[t.part];
  if (own) out.push({ level: "element", rule: own });
  return out;
}

/** Each property's final value for a part at a breakpoint and state, with where it came from. */
export function resolve(system: DesignSystem, design: FormDesign, t: Target, bp: Breakpoint, state?: State): Resolved {
  const out: Resolved = {};
  for (const [p, v] of Object.entries(partDef(t.part).defaults ?? {})) if (isProp(p)) out[p] = { value: v, source: { level: "default" } };
  const keys = chainKeys(bp, partDef(t.part).plain ? undefined : state);
  for (const l of levelsFor(system, design, t))
    for (const key of keys)
      for (const [p, v] of Object.entries(l.rule[key] ?? {}))
        if (isProp(p) && v !== undefined) out[p] = { value: v, source: { level: l.level, ...(l.classId ? { classId: l.classId } : {}), key } };
  return out;
}

/** A value with any `$id` swapped for the variable's value (its dark value when asked). */
export function literal(value: string, vars: Map<string, Variable>, dark = false): string {
  const id = varRef(value);
  if (!id) return value;
  const v = vars.get(id);
  return v ? (dark && v.dark ? v.dark : v.value) : "";
}

/** Words for where a value came from, for the panel's tooltip: "Class Card, Phone", "Global style", "This element". */
export function sourceText(s: Source, system: DesignSystem): string {
  const at = s.key ? s.key.replace("base", "Desktop").replace("tablet", "Tablet").replace("phone", "Phone").replace(":", ", ") : "";
  const where =
    s.level === "default" ? "Form default" : s.level === "global" ? "Global style" : s.level === "class" ? `Class ${system.classes.find((c) => c.id === s.classId)?.name ?? ""}` : "This element";
  return at && s.level !== "default" ? `${where}, ${at}` : where;
}
