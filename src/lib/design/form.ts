// A form's CSS from its design system (docs/design-system.md Part 3.2): the kit's published design and the form's own
// element styles, read safely and compiled. The public form route sends it with the form; the builder makes the same
// CSS from the draft, with each device frame's breakpoint applied directly. Runs in the browser and on
// the server.

import type { Tokens } from "../forms/brand.ts";
import { allFields, type Form } from "../forms/schema.ts";
import { readFormDesign, readSystem, type DesignSystem } from "./model.ts";
import { compileWeb, type WebOpts } from "./web.ts";

/** The font families a design names (the first of each stack), so the page can load them: fonts can't load inside a shadow root. */
export function designFonts(system: unknown, design: unknown): string[] {
  const out = new Set<string>();
  const walk = (v: unknown, key = "") => {
    if (typeof v === "string") {
      if (key === "font-family" && !v.startsWith("$")) out.add((v.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, ""));
      else if (key === "value" || key === "dark") return;
    } else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, k);
  };
  walk(system);
  walk(design);
  // A font variable's value is a stack too.
  const vars = (system as { variables?: { kind?: string; value?: string }[] } | null)?.variables;
  for (const v of Array.isArray(vars) ? vars : []) if (v?.kind === "font" && typeof v.value === "string") out.add((v.value.split(",")[0] ?? "").trim().replace(/^['"]|['"]$/g, ""));
  out.delete("");
  return [...out];
}

export function formCss(form: Form, tokens: Partial<Tokens>, system: unknown, opts: WebOpts = {}): string {
  const ids = allFields(form).map((f) => f.id);
  const sys: DesignSystem = readSystem(system, tokens);
  const design = readFormDesign(form.design, new Set(ids), sys, tokens);
  if (!sys.variables.length && !Object.keys(sys.globals).length && !design.classes && !design.styles) return "";
  return compileWeb(sys, design, ids, opts);
}
