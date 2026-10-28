// The design system's data (docs/design-system.md Part 2): variables, global styles, classes, and the styles one
// form puts on its own elements. A style rule holds properties per breakpoint and state; keys are "base", "phone",
// "base:hover", "tablet:hover"... Everything read from storage, the editor or the AI goes through `readSystem` or
// `readFormDesign`, which keep only known parts, states and properties with checked values. Runs in the browser and
// on the server.

import { DEFAULT_TOKENS, type Tokens } from "../forms/brand.ts";
import { partDef, PART_KEYS, type PartKey } from "./parts.ts";
import { EMAIL_PART_KEYS, type EmailPartKey } from "./email/parts.ts";
import { isProp, type Prop } from "./props.ts";
import { checkValue, color, VAR_ID } from "./values.ts";

export const BREAKPOINTS = ["base", "tablet", "phone"] as const;
export type Breakpoint = (typeof BREAKPOINTS)[number];
export const STATES = ["hover", "focus", "pressed", "invalid", "disabled", "checked", "dark"] as const;
export type State = (typeof STATES)[number];
export type RuleKey = Breakpoint | `${Breakpoint}:${State}`;
export const RULE_KEYS: RuleKey[] = /* @__PURE__ */ BREAKPOINTS.flatMap((b) => [b, ...STATES.map((s) => `${b}:${s}` as RuleKey)]);

export type Decls = Partial<Record<Prop, string>>;
export type StyleRule = Partial<Record<RuleKey, Decls>>;
/** Styles by part: what a global style, a class or one element sets on each of its parts. */
export type PartStyles = Partial<Record<PartKey, StyleRule>>;

export type VarKind = "color" | "length" | "font" | "number" | "shadow";
export type Variable = { id: string; name: string; kind: VarKind; value: string; dark?: string };

/** A class. `with` makes it a combo: it applies only on an element that also has those classes. */
export type DesignClass = { id: string; name: string; with?: string[]; styles: PartStyles };

export type DesignSystem = {
  v: 1;
  /** Variables beyond the built-in ones (the brand kit's tokens). */
  variables: Variable[];
  globals: PartStyles;
  classes: DesignClass[];
  breakpoints: { tablet: number; phone: number };
  /** Emails: their own global styles and classes (email parts differ from a form's), on the same variables. */
  email?: EmailSystem;
};

export type EmailStyles = Partial<Record<EmailPartKey, StyleRule>>;
export type EmailClass = { id: string; name: string; with?: string[]; styles: EmailStyles };
export type EmailSystem = { globals: EmailStyles; classes: EmailClass[] };

/** The styles one form puts on its own elements, keyed by element id ("form" for the form's own parts). */
export type FormDesign = { classes?: Record<string, string[]>; styles?: Record<string, PartStyles> };

export const LIMITS = { variables: 60, classes: 300, decls: 80, nameLen: 60, formElements: 120 };
export const EMPTY_SYSTEM: DesignSystem = { v: 1, variables: [], globals: {}, classes: [], breakpoints: { tablet: 991, phone: 479 } };

// Built-in variables ------------------------------------------------------------------------------------------------

/** The brand kit's tokens, as variables: their ids, names, kinds and the CSS custom property each one is. */
export const BUILT_IN: { id: string; name: string; kind: VarKind; token: keyof Tokens; css: string }[] = [
  { id: "text", name: "Text", kind: "color", token: "text", css: "--clr-text" },
  { id: "muted", name: "Muted text", kind: "color", token: "muted", css: "--clr-muted" },
  { id: "background", name: "Background", kind: "color", token: "background", css: "--clr-bg" },
  { id: "input-bg", name: "Field background", kind: "color", token: "inputBg", css: "--clr-input-bg" },
  { id: "border", name: "Border", kind: "color", token: "border", css: "--clr-border" },
  { id: "accent", name: "Accent", kind: "color", token: "accent", css: "--clr-accent" },
  { id: "button-bg", name: "Button", kind: "color", token: "buttonBg", css: "--clr-btn-bg" },
  { id: "button-text", name: "Button text", kind: "color", token: "buttonText", css: "--clr-btn-text" },
  { id: "error", name: "Error", kind: "color", token: "error", css: "--clr-error" },
  { id: "body-font", name: "Body font", kind: "font", token: "font", css: "--clr-font" },
  { id: "heading-font", name: "Heading font", kind: "font", token: "headingFont", css: "--clr-heading-font" },
  { id: "font-size", name: "Body size", kind: "length", token: "fontSize", css: "--clr-size" },
  { id: "label-size", name: "Label size", kind: "length", token: "labelSize", css: "--clr-label-size" },
  { id: "label-weight", name: "Label weight", kind: "number", token: "labelWeight", css: "--clr-label-weight" },
  { id: "button-weight", name: "Button weight", kind: "number", token: "buttonWeight", css: "--clr-btn-weight" },
  { id: "border-width", name: "Border width", kind: "length", token: "borderWidth", css: "--clr-border-w" },
  { id: "radius", name: "Field corners", kind: "length", token: "radius", css: "--clr-radius" },
  { id: "button-radius", name: "Button corners", kind: "length", token: "buttonRadius", css: "--clr-btn-radius" },
  { id: "input-height", name: "Field height", kind: "length", token: "inputHeight", css: "--clr-input-h" },
  { id: "gap", name: "Row spacing", kind: "length", token: "gap", css: "--clr-gap" },
];
const isBuiltIn = (id: string) => BUILT_IN.some((b) => b.id === id);

/** Every variable a system has, built-in ones (with the kit's values) first. */
export function allVariables(system: Pick<DesignSystem, "variables">, tokens: Partial<Tokens> = {}): Variable[] {
  const t = { ...DEFAULT_TOKENS, ...tokens };
  const built: Variable[] = BUILT_IN.map((b) => {
    const raw = t[b.token];
    const value = b.kind === "length" ? `${raw}px` : b.token === "headingFont" && !raw ? t.font : String(raw);
    return { id: b.id, name: b.name, kind: b.kind, value };
  });
  return [...built, ...system.variables];
}

/** The custom property a variable is written as. */
export const varCss = (id: string) => BUILT_IN.find((b) => b.id === id)?.css ?? `--v-${id}`;

/** Variables by id, with their kind, for checking `$id` values. */
export const varKinds = (vars: Variable[]) => new Map(vars.map((v) => [v.id, { kind: v.kind }]));

// Reading ----------------------------------------------------------------------------------------------------------

const ID = /^[a-z0-9]{1,24}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, max) : "");
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function readVariable(raw: unknown): Variable | null {
  const r = obj(raw);
  if (!r) return null;
  const id = str(r.id, 40);
  const kind = (["color", "length", "font", "number", "shadow"] as const).find((k) => k === r.kind);
  if (!VAR_ID.test(id) || isBuiltIn(id) || !kind) return null;
  const prop: Prop = kind === "color" ? "color" : kind === "length" ? "padding-top" : kind === "font" ? "font-family" : kind === "number" ? "opacity" : "box-shadow";
  const value = kind === "number" ? (Number.isFinite(Number(r.value)) ? String(Number(r.value)) : null) : checkValue(prop, r.value);
  if (value === null || value.startsWith("$")) return null;
  const dark = kind === "color" && r.dark !== undefined && r.dark !== "" ? color(str(r.dark, 60)) : undefined;
  return { id, name: str(r.name, LIMITS.nameLen) || id, kind, value, ...(dark && !dark.startsWith("$") ? { dark } : {}) };
}

/** A style rule with only known keys, properties and checked values. */
export function readRule(raw: unknown, vars?: Map<string, { kind: string }>): StyleRule | null {
  const r = obj(raw);
  if (!r) return null;
  const out: StyleRule = {};
  for (const key of RULE_KEYS) {
    const d = obj(r[key]);
    if (!d) continue;
    const decls: Decls = {};
    let n = 0;
    for (const [p, v] of Object.entries(d)) {
      if (!isProp(p) || n >= LIMITS.decls) continue;
      const clean = checkValue(p, v, vars);
      if (clean === null) continue;
      decls[p] = clean;
      n++;
    }
    if (n) out[key] = decls;
  }
  return Object.keys(out).length ? out : null;
}

/** Part styles, made safe. `scope` keeps only the form's own parts or only parts inside a field. */
export function readPartStyles(raw: unknown, vars?: Map<string, { kind: string }>, scope?: "form" | "field"): PartStyles {
  const r = obj(raw);
  const out: PartStyles = {};
  if (!r) return out;
  for (const part of PART_KEYS) {
    if (scope && partDef(part).scope !== scope) continue;
    const rule = readRule(r[part], vars);
    if (rule) out[part] = rule;
  }
  return out;
}

/** Email part styles, made safe. */
export function readEmailStyles(raw: unknown, vars?: Map<string, { kind: string }>): EmailStyles {
  const r = obj(raw);
  const out: EmailStyles = {};
  if (!r) return out;
  for (const part of EMAIL_PART_KEYS) {
    const rule = readRule(r[part], vars);
    if (rule) out[part] = rule;
  }
  return out;
}

/** Classes as saved, made safe: unique ids and names, combos only on classes listed before them. */
function readClasses<S>(raw: unknown, read: (styles: unknown) => S): { id: string; name: string; with?: string[]; styles: S }[] {
  const classes: { id: string; name: string; with?: string[]; styles: S }[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const bases = new Set<string>();
  for (const c of Array.isArray(raw) ? raw.slice(0, LIMITS.classes) : []) {
    const co = obj(c);
    if (!co) continue;
    const id = str(co.id, 24);
    const name = str(co.name, LIMITS.nameLen);
    if (!ID.test(id) || ids.has(id) || !name || names.has(name.toLowerCase())) continue;
    // A combo builds on classes defined before it that aren't combos themselves.
    const withIds = Array.isArray(co.with) ? [...new Set(co.with.filter((x): x is string => typeof x === "string" && bases.has(x)))].slice(0, 3) : [];
    if (Array.isArray(co.with) && co.with.length && !withIds.length) continue;
    ids.add(id);
    names.add(name.toLowerCase());
    if (!withIds.length) bases.add(id);
    classes.push({ id, name, ...(withIds.length ? { with: withIds } : {}), styles: read(co.styles) });
  }
  return classes;
}

/** A design system as saved or edited, made safe. `tokens` gives the built-in variables' values for `$id` checks. */
export function readSystem(raw: unknown, tokens: Partial<Tokens> = {}): DesignSystem {
  const r = obj(raw) ?? {};
  const variables: Variable[] = [];
  const seen = new Set<string>();
  for (const v of Array.isArray(r.variables) ? r.variables.slice(0, LIMITS.variables) : []) {
    const x = readVariable(v);
    if (x && !seen.has(x.id)) {
      seen.add(x.id);
      variables.push(x);
    }
  }
  const vars = varKinds(allVariables({ variables }, tokens));
  // A class goes on a field, so it styles only parts inside a field.
  const classes: DesignClass[] = readClasses(r.classes, (st) => readPartStyles(st, vars, "field"));
  const em = obj(r.email);
  const email: EmailSystem | null = em ? { globals: readEmailStyles(em.globals, vars), classes: readClasses(em.classes, (st) => readEmailStyles(st, vars)) } : null;
  const bp = obj(r.breakpoints) ?? {};
  const clamp = (v: unknown, lo: number, hi: number, d: number) => (Number.isFinite(Number(v)) ? Math.round(Math.min(hi, Math.max(lo, Number(v)))) : d);
  const tablet = clamp(bp.tablet, 600, 1400, 991);
  const phone = clamp(bp.phone, 320, tablet - 1, 479);
  return {
    v: 1,
    variables,
    globals: readPartStyles(r.globals, vars),
    classes,
    breakpoints: { tablet, phone },
    ...(email && (Object.keys(email.globals).length || email.classes.length) ? { email } : {}),
  };
}

/**
 * A form's own styles, made safe: only elements the form has (and "form" for its own parts), classes the system has,
 * a base class first and combos only on top of their base.
 */
export function readFormDesign(raw: unknown, elementIds: Set<string>, system?: DesignSystem, tokens: Partial<Tokens> = {}): FormDesign {
  const r = obj(raw) ?? {};
  const vars = system ? varKinds(allVariables(system, tokens)) : undefined;
  const byId = system ? new Map(system.classes.map((c) => [c.id, c])) : null;
  const classes: Record<string, string[]> = {};
  for (const [el, list] of Object.entries(obj(r.classes) ?? {})) {
    if (!elementIds.has(el) || !Array.isArray(list)) continue;
    const picked: string[] = [];
    for (const c of list.slice(0, 6)) {
      if (typeof c !== "string" || !ID.test(c) || picked.includes(c)) continue;
      const def = byId?.get(c);
      if (byId && !def) continue;
      if (!picked.length ? def?.with : def && !(def.with ?? []).every((w) => picked.includes(w))) continue;
      picked.push(c);
    }
    if (picked.length) classes[el] = picked;
  }
  const styles: Record<string, PartStyles> = {};
  let n = 0;
  for (const [el, ps] of Object.entries(obj(r.styles) ?? {})) {
    if ((el !== "form" && !elementIds.has(el)) || n >= LIMITS.formElements) continue;
    const clean = readPartStyles(ps, vars, el === "form" ? "form" : "field");
    if (Object.keys(clean).length) {
      styles[el] = clean;
      n++;
    }
  }
  return { ...(Object.keys(classes).length ? { classes } : {}), ...(Object.keys(styles).length ? { styles } : {}) };
}

// Editing ----------------------------------------------------------------------------------------------------------

/** One property set (or cleared with "") in a part's rule. Returns new part styles; the input isn't changed. */
export function setDecl(styles: PartStyles, part: PartKey, key: RuleKey, prop: Prop, value: string, vars?: Map<string, { kind: string }>): PartStyles {
  const next: PartStyles = JSON.parse(JSON.stringify(styles)) as PartStyles;
  const rule: StyleRule = { ...(next[part] ?? {}) };
  const decls: Decls = { ...(rule[key] ?? {}) };
  const clean = value.trim() ? checkValue(prop, value, vars) : null;
  if (clean !== null) decls[prop] = clean;
  else delete decls[prop];
  if (Object.keys(decls).length) rule[key] = decls;
  else delete rule[key];
  if (Object.keys(rule).length) next[part] = rule;
  else delete next[part];
  return next;
}

/** How many properties a part's styles hold, across every breakpoint and state. */
export const declCount = (s: PartStyles | undefined) => Object.values(s ?? {}).reduce((n, r) => n + Object.values(r ?? {}).reduce((m, d) => m + Object.keys(d ?? {}).length, 0), 0);

/** A class id that isn't taken. */
export function newClassId(system: DesignSystem): string {
  for (;;) {
    const id = Math.random().toString(36).slice(2, 10);
    if (!system.classes.some((c) => c.id === id)) return id;
  }
}
