// What the email Style panel changes (docs/design-system.md Part 5.2): one property at one level (this element, one
// of its email classes, or every email on the design system), at desktop or phone, plain, hover or dark. The same
// rules as forms (src/lib/design/edit.ts), on the email document and the design system's email styles.

import { chainKeys } from "../cascade.ts";
import type { Level, Origin } from "../edit.ts";
import { allVariables, LIMITS, newClassId, readEmailStyles, varKinds, type DesignSystem, type EmailClass, type EmailStyles, type RuleKey, type StyleRule } from "../model.ts";
import type { Prop } from "../props.ts";
import { checkValue } from "../values.ts";
import type { Tokens } from "../../forms/brand.ts";
import type { EmailDoc } from "./doc.ts";
import type { EmailPartKey } from "./parts.ts";
import { resolveEmail, type EmailBp, type EmailState } from "./style.ts";

export type EmailEdit = { system: DesignSystem; doc: EmailDoc };
const key = (bp: EmailBp, state?: EmailState): RuleKey => (state ? `${bp}:${state}` : bp);
const emailOf = (s: DesignSystem) => s.email ?? { globals: {}, classes: [] };

export function emailStylesAt(e: EmailEdit, level: Level, id: string): EmailStyles {
  if (level.kind === "global") return emailOf(e.system).globals;
  if (level.kind === "class") return emailOf(e.system).classes.find((c) => c.id === level.id)?.styles ?? {};
  return e.doc.styles?.[id] ?? {};
}

function withStyles(e: EmailEdit, level: Level, id: string, styles: EmailStyles): EmailEdit {
  const em = emailOf(e.system);
  if (level.kind === "global") return { ...e, system: { ...e.system, email: { ...em, globals: styles } } };
  if (level.kind === "class") return { ...e, system: { ...e.system, email: { ...em, classes: em.classes.map((c) => (c.id === level.id ? { ...c, styles } : c)) } } };
  const all = { ...(e.doc.styles ?? {}) };
  if (Object.keys(styles).length) all[id] = styles;
  else delete all[id];
  const { styles: _old, ...rest } = e.doc;
  void _old;
  return { ...e, doc: Object.keys(all).length ? { ...rest, styles: all } : rest };
}

/** Set (or clear with "") one property; null when the value isn't allowed. A border width also sets solid when no style shows. */
export function setEmailProp(e: EmailEdit, tokens: Partial<Tokens>, level: Level, id: string, part: EmailPartKey, bp: EmailBp, state: EmailState | undefined, prop: Prop, raw: string): EmailEdit | null {
  const vars = varKinds(allVariables(e.system, tokens));
  const value = raw.trim();
  const clean = value ? checkValue(prop, value, vars) : "";
  if (clean === null) return null;
  const k = key(bp, state);
  const set = (styles: EmailStyles, p: Prop, v: string): EmailStyles => {
    const rule: StyleRule = { ...(styles[part] ?? {}) };
    const decls = { ...(rule[k] ?? {}) };
    if (v) decls[p] = v;
    else delete decls[p];
    if (Object.keys(decls).length) rule[k] = decls;
    else delete rule[k];
    const next = { ...styles };
    if (Object.keys(rule).length) next[part] = rule;
    else delete next[part];
    return next;
  };
  let styles = set(emailStylesAt(e, level, id), prop, clean);
  const side = /^border-(top|right|bottom|left)-width$/.exec(prop)?.[1];
  if (side && clean && clean !== "0" && clean !== "0px") {
    const sp = `border-${side}-style` as Prop;
    const now = resolveEmail(e.system, e.doc, { id, part }, bp, state)[sp]?.value;
    if (!now || now === "none") styles = set(styles, sp, "solid");
  }
  // Read back through the same checks a save runs.
  return withStyles(e, level, id, readEmailStyles(styles, vars));
}

export function resetEmailPart(e: EmailEdit, level: Level, id: string, part: EmailPartKey): EmailEdit {
  const styles = { ...emailStylesAt(e, level, id) };
  delete styles[part];
  return withStyles(e, level, id, styles);
}

export function emailOwnValue(e: EmailEdit, level: Level, id: string, part: EmailPartKey, bp: EmailBp, state: EmailState | undefined, prop: Prop): string | undefined {
  return emailStylesAt(e, level, id)[part]?.[key(bp, state)]?.[prop];
}

export function emailOrigin(e: EmailEdit, level: Level, id: string, part: EmailPartKey, bp: EmailBp, state: EmailState | undefined, prop: Prop): Origin {
  const r = resolveEmail(e.system, e.doc, { id, part }, bp, state)[prop];
  if (!r) return "none";
  const s = r.source;
  if (s.level === level.kind && (level.kind !== "class" || s.classId === level.id)) return s.key === key(bp, state) ? "here" : "inherited";
  return s.level === "element" ? "inherited" : s.level === "class" ? "class" : s.level === "global" ? "global" : "default";
}

export function emailSetsAny(e: EmailEdit, level: Level, id: string, part: EmailPartKey, bp: EmailBp, state: EmailState | undefined, props: Prop[]): boolean {
  const rule = emailStylesAt(e, level, id)[part];
  return !!rule && chainKeys(bp, state).some((k) => props.some((p) => rule[k]?.[p] !== undefined));
}

/** Put an email class on an element by name; a new second class is a combo of the first. */
export function addEmailClass(e: EmailEdit, id: string, name: string): EmailEdit | { error: string } {
  const clean = name.trim().slice(0, LIMITS.nameLen);
  if (!clean) return { error: "Name the class." };
  const on = e.doc.classes?.[id] ?? [];
  if (on.length >= 6) return { error: "An element can have six classes at most." };
  const em = emailOf(e.system);
  let system = e.system;
  let cls: EmailClass | undefined = em.classes.find((c) => c.name.toLowerCase() === clean.toLowerCase());
  if (cls?.with && !cls.with.every((w) => on.includes(w))) return { error: `${cls.name} only goes with ${cls.with.map((w) => em.classes.find((c) => c.id === w)?.name).join(", ")}.` };
  if (!cls) {
    if (em.classes.length >= LIMITS.classes) return { error: "This design system has too many classes." };
    const ids = { ...system, classes: [...system.classes, ...em.classes.map((c) => ({ ...c, styles: {} }))] };
    cls = { id: newClassId(ids), name: clean, ...(on.length ? { with: [on[0]!] } : {}), styles: {} };
    system = { ...system, email: { ...em, classes: [...em.classes, cls] } };
  }
  if (on.includes(cls.id)) return { system, doc: e.doc };
  return { system, doc: { ...e.doc, classes: { ...(e.doc.classes ?? {}), [id]: [...on, cls.id] } } };
}

export function removeEmailClass(e: EmailEdit, id: string, classId: string): EmailEdit {
  const em = emailOf(e.system);
  const on = (e.doc.classes?.[id] ?? []).filter((c) => c !== classId && !em.classes.find((x) => x.id === c)?.with?.includes(classId));
  const classes = { ...(e.doc.classes ?? {}) };
  if (on.length) classes[id] = on;
  else delete classes[id];
  const { classes: _old, ...rest } = e.doc;
  void _old;
  return { system: e.system, doc: Object.keys(classes).length ? { ...rest, classes } : rest };
}
