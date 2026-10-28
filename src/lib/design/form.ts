// A form's CSS from its design system (docs/design-system.md Part 3.2): the kit's published design and the form's own
// element styles, read safely and compiled. The public form route sends it with the form; the builder makes the same
// CSS from the draft, with each device frame's breakpoint applied directly. Runs in the browser and on
// the server.

import type { Tokens } from "../forms/brand.ts";
import { allFields, type Form } from "../forms/schema.ts";
import { readFormDesign, readSystem, type DesignSystem } from "./model.ts";
import { compileWeb, type WebOpts } from "./web.ts";

export function formCss(form: Form, tokens: Partial<Tokens>, system: unknown, opts: WebOpts = {}): string {
  const ids = allFields(form).map((f) => f.id);
  const sys: DesignSystem = readSystem(system, tokens);
  const design = readFormDesign(form.design, new Set(ids), sys, tokens);
  if (!sys.variables.length && !Object.keys(sys.globals).length && !design.classes && !design.styles) return "";
  return compileWeb(sys, design, ids, opts);
}
