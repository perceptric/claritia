// The web compiler (docs/design-system.md Part 3.2): a design system plus one form's styles, as CSS for the form's
// shadow root. Each level is a cascade layer, so a later level wins whatever its selectors are: the form's own
// stylesheet sits in `base` (element.ts), then `g` for global styles, one layer per class in the system's order, and
// `e` for the form's own element styles. Inside a layer, breakpoints come in order and a state adds one pseudo-class,
// which is how cascade.ts resolves values too. Every value has been checked (values.ts) before it gets here, and
// ids are checked again, so nothing written can leave its rule. Runs in the browser (the builder) and on the server.

import { partDef, PART_KEYS, type PartKey } from "./parts.ts";
import { BREAKPOINTS, varCss, type Breakpoint, type DesignSystem, type FormDesign, type PartStyles, type RuleKey, type State, type StyleRule } from "./model.ts";
import { cssName, isProp } from "./props.ts";
import { varRef } from "./values.ts";
import { appliedClasses } from "./cascade.ts";

export type WebOpts = {
  /** media: the visitor's screen (live forms). container: the box the form sits in (the builder's device frames). */
  queries?: "media" | "container";
};

const SAFE_ID = /^[a-z0-9]{1,24}$/;

/** Split a selector list on its top-level commas. */
const splitSel = (s: string) => {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && !depth) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
};

/** The selectors for a part inside a scope, in a state; null when the state doesn't apply to that part. */
export function partSelector(part: PartKey, scope: string, state?: State): string | null {
  const d = partDef(part);
  const list = splitSel(d.sel || "");
  const field = d.scope === "field";
  const one = (sel: string): string | null => {
    const base = field ? (sel ? `${scope} ${sel}` : scope) : sel;
    if (!state) return base;
    if (sel.includes("::") || d.plain) return null;
    switch (state) {
      case "hover":
        return `${base}:hover`;
      case "focus":
        return `${base}:focus-within`;
      case "pressed":
        return `${base}:active`;
      case "disabled":
        return `${base}:is(:disabled, :has(:disabled))`;
      case "checked":
        if (d.checked) return field ? `${scope} ${d.checked}` : d.checked;
        return `${base}:is(:checked, :has(:checked))`;
      case "invalid":
        if (!field) return null;
        return sel ? `${scope}:has([aria-invalid="true"]) ${sel}` : `${scope}:has([aria-invalid="true"])`;
      case "dark":
        return null;
    }
  };
  const sels = (list.length ? list : [""]).map(one).filter((x): x is string => !!x);
  return sels.length ? sels.join(", ") : null;
}

/** A checked value as CSS: a variable becomes var(). */
const cssValue = (v: string) => {
  const id = varRef(v);
  return id ? `var(${varCss(id)})` : v;
};

const declsCss = (d: Record<string, string> | undefined) =>
  Object.entries(d ?? {})
    .filter(([p]) => isProp(p))
    .map(([p, v]) => `${cssName(p as Parameters<typeof cssName>[0])}:${cssValue(v)}`)
    .join(";");

/** One level's rules for one scope (every part it styles), grouped by breakpoint. */
function levelRules(styles: PartStyles, scope: string, into: Record<Breakpoint, string[]>) {
  for (const part of PART_KEYS) {
    const rule: StyleRule | undefined = styles[part];
    if (!rule) continue;
    for (const bp of BREAKPOINTS) {
      const plain = declsCss(rule[bp]);
      const sel = partSelector(part, scope);
      if (plain && sel) into[bp].push(`${sel}{${plain}}`);
      for (const [key, decls] of Object.entries(rule)) {
        const [b, st] = key.split(":") as [Breakpoint, State | undefined];
        if (b !== bp || !st) continue;
        const body = declsCss(decls);
        const s = partSelector(part, scope, st);
        if (body && s) into[bp].push(`${s}{${body}}`);
      }
    }
  }
}

/**
 * The CSS for a form: the layer order, the system's own variables, then global styles, classes and the form's
 * element styles. `elements` are the form's element ids (fields and blocks).
 */
export function compileWeb(system: DesignSystem, design: FormDesign, elements: string[], opts: WebOpts = {}): string {
  const media = (bp: Breakpoint) => {
    const w = bp === "tablet" ? system.breakpoints.tablet : system.breakpoints.phone;
    return opts.queries === "container" ? `@container clr (max-width: ${w}px)` : `@media (max-width: ${w}px)`;
  };
  const layer = (name: string, fill: (into: Record<Breakpoint, string[]>) => void) => {
    const into: Record<Breakpoint, string[]> = { base: [], tablet: [], phone: [] };
    fill(into);
    const body = [into.base.join("\n"), ...(["tablet", "phone"] as const).map((bp) => (into[bp].length ? `${media(bp)}{\n${into[bp].join("\n")}\n}` : ""))].filter(Boolean).join("\n");
    return body ? `@layer ${name}{\n${body}\n}` : "";
  };

  const used = new Set(elements.filter((id) => SAFE_ID.test(id)).flatMap((id) => appliedClasses(system, design, id).map((c) => c.id)));
  const classes = system.classes.filter((c) => used.has(c.id) && SAFE_ID.test(c.id));
  const order = `@layer base, g, ${classes.map((c) => `c-${c.id}`).join(", ")}${classes.length ? ", " : ""}e;`;

  const vars = system.variables.map((v) => `${varCss(v.id)}:${v.value}`).join(";");
  const host = [opts.queries === "container" ? "container:clr / inline-size" : "", vars].filter(Boolean).join(";");

  const parts: string[] = [order];
  if (host) parts.push(`:host{${host}}`);
  parts.push(layer("g", (into) => levelRules(system.globals, ".fl", into)));
  for (const c of classes) {
    const scope = `.fl.c-${c.id}${(c.with ?? []).map((w) => `.c-${w}`).join("")}`;
    parts.push(layer(`c-${c.id}`, (into) => levelRules(c.styles, scope, into)));
  }
  parts.push(
    layer("e", (into) => {
      for (const [id, styles] of Object.entries(design.styles ?? {})) {
        if (id !== "form" && (!SAFE_ID.test(id) || !elements.includes(id))) continue;
        levelRules(styles, id === "form" ? "" : `.fl[data-id="${id}"]`, into);
      }
    }),
  );
  return parts.filter(Boolean).join("\n");
}

/** The classes to put on an element's box: `c-<id>` for each class it has. */
export const classNames = (design: FormDesign, id: string) => (design.classes?.[id] ?? []).filter((c) => SAFE_ID.test(c)).map((c) => `c-${c}`);

export type { RuleKey };
