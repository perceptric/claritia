// Which value an email part ends up with, and where it came from (docs/design-system.md Parts 4.2 and 5.3): the
// part's defaults, the design system's email global styles, the element's email classes (base, then combos, in the
// system's order), then the element's own styles. Desktop carries to phone; hover and dark beat plain values. The
// compiler inlines the desktop values and writes the rest as rules, so the panel and the email agree.

import { chainKeys, type Resolved } from "../cascade.ts";
import type { DesignSystem, EmailClass, StyleRule } from "../model.ts";
import { isProp, type Prop } from "../props.ts";
import type { EmailDoc } from "./doc.ts";
import { emailPartDef, type EmailPartKey } from "./parts.ts";

export type EmailBp = "base" | "phone";
export type EmailState = "hover" | "dark";
export type EmailTarget = { id: string; part: EmailPartKey };

/** The email classes on an element: each of its classes, and each combo whose classes it all has, in system order. */
export function emailClassesOn(system: DesignSystem, doc: EmailDoc, id: string): EmailClass[] {
  const on = new Set(doc.classes?.[id] ?? []);
  return (system.email?.classes ?? []).filter((c) => on.has(c.id) && (c.with ?? []).every((w) => on.has(w)));
}

export function emailLevels(system: DesignSystem, doc: EmailDoc, t: EmailTarget): { level: "global" | "class" | "element"; classId?: string; rule: StyleRule }[] {
  const out: { level: "global" | "class" | "element"; classId?: string; rule: StyleRule }[] = [];
  const g = system.email?.globals[t.part];
  if (g) out.push({ level: "global", rule: g });
  for (const c of emailClassesOn(system, doc, t.id)) {
    const r = c.styles[t.part];
    if (r) out.push({ level: "class", classId: c.id, rule: r });
  }
  const own = doc.styles?.[t.id]?.[t.part];
  if (own) out.push({ level: "element", rule: own });
  return out;
}

export function resolveEmail(system: DesignSystem, doc: EmailDoc, t: EmailTarget, bp: EmailBp, state?: EmailState): Resolved {
  const out: Resolved = {};
  for (const [p, v] of Object.entries(emailPartDef(t.part).defaults ?? {})) if (isProp(p)) out[p] = { value: v, source: { level: "default" } };
  const keys = chainKeys(bp, state);
  for (const l of emailLevels(system, doc, t))
    for (const key of keys)
      for (const [p, v] of Object.entries(l.rule[key] ?? {}))
        if (isProp(p) && v !== undefined) out[p as Prop] = { value: v, source: { level: l.level, ...(l.classId ? { classId: l.classId } : {}), key } };
  return out;
}
