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
  /**
   * The builder's device frame: that breakpoint's rules (and the larger ones') apply directly, with no media query,
   * so each frame shows its own size whatever the window is. Live forms leave it out and use media queries.
   */
  device?: Breakpoint;
  /**
   * The builder: a state also applies to parts carrying `clr-force-<state>`, so the canvas can show the selected
   * part hovered, focused, checked... while the style panel edits that state.
   */
  preview?: boolean;
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
export function partSelector(part: PartKey, scope: string, state?: State, preview = false): string | null {
  // In the builder a forced state is a class on the part, with the same weight as the pseudo-class it stands for.
  const f = (pseudo: string) => (preview ? `:is(${pseudo}, .clr-force-${state})` : pseudo);
  const d = partDef(part);
  const list = splitSel(d.sel || "");
  const field = d.scope === "field";
  const one = (sel: string): string | null => {
    const base = field ? (sel ? `${scope} ${sel}` : scope) : sel;
    if (!state) return base;
    if (sel.includes("::") || d.plain) return null;
    switch (state) {
      case "hover":
        return `${base}${f(":hover")}`;
      case "focus":
        return `${base}${f(":focus-within")}`;
      case "pressed":
        return `${base}${f(":active")}`;
      case "disabled":
        return `${base}${f(":is(:disabled, :has(:disabled))")}`;
      case "checked":
        if (d.checked) return [field ? `${scope} ${d.checked}` : d.checked, ...(preview ? [`${base}.clr-force-checked`] : [])].join(", ");
        return `${base}${f(":is(:checked, :has(:checked))")}`;
      case "invalid":
        if (!field) return null;
        return sel ? `${scope}${f(':has([aria-invalid="true"])')} ${sel}` : `${scope}${f(':has([aria-invalid="true"])')}`;
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
function levelRules(styles: PartStyles, scope: string, into: Record<Breakpoint, string[]>, preview = false) {
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
        const s = partSelector(part, scope, st, preview);
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
  const media = (bp: Breakpoint) => `@media (max-width: ${bp === "tablet" ? system.breakpoints.tablet : system.breakpoints.phone}px)`;
  const upto = opts.device ? BREAKPOINTS.indexOf(opts.device) : -1;
  const wrap = (bp: "tablet" | "phone", rules: string[]) => {
    if (!rules.length) return "";
    if (!opts.device) return `${media(bp)}{\n${rules.join("\n")}\n}`;
    return BREAKPOINTS.indexOf(bp) <= upto ? rules.join("\n") : "";
  };
  const layer = (name: string, fill: (into: Record<Breakpoint, string[]>) => void) => {
    const into: Record<Breakpoint, string[]> = { base: [], tablet: [], phone: [] };
    fill(into);
    const body = [into.base.join("\n"), wrap("tablet", into.tablet), wrap("phone", into.phone)].filter(Boolean).join("\n");
    return body ? `@layer ${name}{\n${body}\n}` : "";
  };

  const used = new Set(elements.filter((id) => SAFE_ID.test(id)).flatMap((id) => appliedClasses(system, design, id).map((c) => c.id)));
  const classes = system.classes.filter((c) => used.has(c.id) && SAFE_ID.test(c.id));
  const order = `@layer base, g, ${classes.map((c) => `c-${c.id}`).join(", ")}${classes.length ? ", " : ""}e;`;

  const vars = system.variables.map((v) => `${varCss(v.id)}:${v.value}`).join(";");
  const host = vars;

  const parts: string[] = [order];
  if (host) parts.push(`:host{${host}}`);
  parts.push(layer("g", (into) => levelRules(system.globals, ".fl", into, opts.preview)));
  for (const c of classes) {
    const scope = `.fl.c-${c.id}${(c.with ?? []).map((w) => `.c-${w}`).join("")}`;
    parts.push(layer(`c-${c.id}`, (into) => levelRules(c.styles, scope, into, opts.preview)));
  }
  parts.push(
    layer("e", (into) => {
      for (const [id, styles] of Object.entries(design.styles ?? {})) {
        if (id !== "form" && (!SAFE_ID.test(id) || !elements.includes(id))) continue;
        levelRules(styles, id === "form" ? "" : `.fl[data-id="${id}"]`, into, opts.preview);
      }
    }),
  );
  return parts.filter(Boolean).join("\n");
}

/** The classes to put on an element's box: `c-<id>` for each class it has. */
export const classNames = (design: FormDesign, id: string) => (design.classes?.[id] ?? []).filter((c) => SAFE_ID.test(c)).map((c) => `c-${c}`);

export type { RuleKey };
