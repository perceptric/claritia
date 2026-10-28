// Booking pages on the design system (docs/design-system.md Part 3.5): the same variables as forms and emails, and
// global styles for the booking pages' own parts (the card, headings, days, times, the host, the button). The pages
// keep their own stylesheet (src/components/book/styles.ts) and their layout; these rules sit on top, scoped to
// `.cb-root.cb-ds` so they win over it and never reach the page around. Phones are a container query on the card,
// like the pages' own layout. Runs in the browser and on the server.

import { literal } from "./cascade.ts";
import { allVariables, varCss, varKinds, type BookStyles, type DesignSystem, type RuleKey, type StyleRule } from "./model.ts";
import { cssName, isProp, type Prop } from "./props.ts";
import { checkValue, varRef } from "./values.ts";
import type { Tokens } from "../forms/brand.ts";

export type BookPartDef = { label: string; sel: string; selected?: string; defaults?: Record<string, string> };

export const BOOK_PARTS = {
  page: { label: "Page", sel: ".cb-page" },
  card: { label: "Card", sel: ".cb-card" },
  heading: { label: "Heading", sel: ".cb-h", defaults: { "font-family": "$heading-font", "font-weight": "600" } },
  text: { label: "Small text", sel: ".cb-muted", defaults: { color: "$muted" } },
  host: { label: "Host", sel: ".cb-av" },
  day: { label: "Day", sel: ".cb-day.cb-has", selected: '.cb-day[aria-pressed="true"]', defaults: { color: "$accent" } },
  time: { label: "Time", sel: ".cb-time", selected: ".cb-time.cb-on", defaults: { color: "$accent", "border-top-left-radius": "$button-radius" } },
  button: { label: "Button", sel: ".cb-btn:not(.cb-ghost):not(.cb-danger)", defaults: { "background-color": "$button-bg", color: "$button-text", "border-top-left-radius": "$button-radius" } },
} satisfies Record<string, BookPartDef>;

export type BookPartKey = keyof typeof BOOK_PARTS;
export const BOOK_PART_KEYS = /* @__PURE__ */ Object.keys(BOOK_PARTS) as BookPartKey[];
export const bookPartDef = (p: BookPartKey): BookPartDef => BOOK_PARTS[p] as BookPartDef;

const SCOPE = ".cb-root.cb-ds";
const PHONE = 640;

/** Where each value comes from for the panel: the part's default, or the global style (desktop, then phone, then the state). */
export function resolveBook(system: DesignSystem, part: BookPartKey, bp: "base" | "phone", state?: "hover" | "checked") {
  const out: Partial<Record<Prop, { value: string; source: { level: "default" | "global"; key?: string } }>> = {};
  for (const [p, v] of Object.entries(bookPartDef(part).defaults ?? {})) if (isProp(p)) out[p] = { value: v, source: { level: "default" } };
  const rule = system.book?.globals[part] ?? {};
  const keys = [bp === "phone" ? ["base", "phone"] : ["base"], state ? (bp === "phone" ? [`base:${state}`, `phone:${state}`] : [`base:${state}`]) : []].flat();
  for (const k of keys) for (const [p, v] of Object.entries(rule[k as keyof typeof rule] ?? {})) if (isProp(p) && v) out[p] = { value: v, source: { level: "global", key: k } };
  return out;
}

const cssValue = (v: string) => {
  const id = varRef(v);
  return id ? `var(${varCss(id)})` : v;
};
const decls = (d: Partial<Record<string, string>> | undefined) =>
  Object.entries(d ?? {})
    .filter(([p, v]) => isProp(p) && v)
    .map(([p, v]) => `${cssName(p as Prop)}:${cssValue(v!)}`)
    .join(";");

/** The booking pages' CSS from a design system: its own variables, then each part's rules. "" when there are none. */
export function compileBook(system: DesignSystem, tokens: Partial<Tokens> = {}): string {
  const styles: BookStyles = system.book?.globals ?? {};
  const own = system.variables.map((v) => `${varCss(v.id)}:${v.value}`).join(";");
  const base: string[] = [];
  const phone: string[] = [];
  for (const part of BOOK_PART_KEYS) {
    const r = styles[part];
    if (!r) continue;
    const def = bookPartDef(part);
    const sel = `${SCOPE} ${def.sel}`;
    const hover = `${SCOPE} ${def.sel}:hover`;
    const picked = def.selected ? `${SCOPE} ${def.selected}` : null;
    const put = (into: string[], s: string | null, body: string) => body && s && into.push(`${s}{${body}}`);
    put(base, sel, decls(r.base));
    put(base, hover, decls(r["base:hover"]));
    put(base, picked, decls(r["base:checked"]));
    put(phone, sel, decls(r.phone));
    put(phone, hover, decls(r["phone:hover"]));
    put(phone, picked, decls(r["phone:checked"]));
  }
  if (!own && !base.length && !phone.length) return "";
  // The built-in variables come from the kit's tokens (theme.ts); this only adds the system's own.
  void tokens;
  return [own ? `${SCOPE}{${own}}` : "", base.join("\n"), phone.length ? `@container (max-width:${PHONE}px){${phone.join("")}}` : ""].filter(Boolean).join("\n");
}

/** A value as it shows, with variables filled in (for the panel's placeholders). */
export const bookLiteral = (system: DesignSystem, tokens: Partial<Tokens>, v: string) => literal(v, new Map(allVariables(system, tokens).map((x) => [x.id, x])));

/** Set (or clear with "") one booking style; null when the value isn't allowed. States: hover, and checked for the picked day or time. */
export function setBookProp(system: DesignSystem, tokens: Partial<Tokens>, part: BookPartKey, bp: "base" | "phone", state: "hover" | "checked" | undefined, prop: Prop, raw: string): DesignSystem | null {
  const value = raw.trim();
  const clean = value ? checkValue(prop, value, varKinds(allVariables(system, tokens))) : "";
  if (clean === null) return null;
  const key = (state ? `${bp}:${state}` : bp) as RuleKey;
  const globals: BookStyles = JSON.parse(JSON.stringify(system.book?.globals ?? {}));
  const rule: StyleRule = { ...(globals[part] ?? {}) };
  const d = { ...(rule[key] ?? {}) };
  if (clean) d[prop] = clean;
  else delete d[prop];
  if (Object.keys(d).length) rule[key] = d;
  else delete rule[key];
  if (Object.keys(rule).length) globals[part] = rule;
  else delete globals[part];
  const { book: _b, ...rest } = system;
  void _b;
  return Object.keys(globals).length ? { ...rest, book: { globals } } : rest;
}
