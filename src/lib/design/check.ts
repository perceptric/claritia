// The design check (docs/design-system.md Part 7.4): a fixed list of checks, no AI, run in the builders as people
// work and again before a send or publish. Text that's hard to read (light and dark), images without alt text, more
// than one main button in a section, small text and small tap targets on phones, plain http links and links with
// no words, merge tags without a fallback, and raw colors that are nearly a variable. "block" notes stop a send.

import { contrast } from "../forms/brand.ts";
import type { Tokens } from "../forms/brand.ts";
import { mergeGaps } from "../workflows/merge.ts";
import { literal } from "./cascade.ts";
import { compileEmail, emailText } from "./email/compile.ts";
import { expandComponents } from "./email/components.ts";
import { elements, type EmailDoc } from "./email/doc.ts";
import type { EmailPartKey } from "./email/parts.ts";
import { resolveEmail, type EmailBp, type EmailState } from "./email/style.ts";
import { allVariables, type DesignSystem, type Variable } from "./model.ts";
import type { Prop } from "./props.ts";

export type DesignNote = { level: "block" | "warn"; text: string; id?: string };

/** A color as #rrggbb, when it's one we can read (hex or rgb). */
export function hex(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim().toLowerCase();
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(s)) return s.slice(0, 7);
  if (/^#[0-9a-f]{3,4}$/.test(s)) return `#${[...s.slice(1, 4)].map((c) => c + c).join("")}`;
  const m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(s);
  if (m && (m[4] === undefined || parseFloat(m[4]) >= (m[4].endsWith("%") ? 100 : 1))) return `#${[m[1], m[2], m[3]].map((x) => Math.min(255, Number(x)).toString(16).padStart(2, "0")).join("")}`;
  if (s === "white") return "#ffffff";
  if (s === "black") return "#000000";
  return null;
}

const px = (v: string | undefined, base = 16): number | null => {
  if (!v) return null;
  const m = /^(-?\d+(?:\.\d+)?)(px|em|rem)?$/.exec(v.trim());
  if (!m) return null;
  return m[2] === "em" || m[2] === "rem" ? Number(m[1]) * base : Number(m[1]);
};

/** Large text needs 3:1, the rest 4.5:1 (WCAG). */
const needs = (size: number | null, weight: string | undefined) => ((size ?? 16) >= 24 || ((size ?? 16) >= 18.66 && Number(weight ?? 400) >= 700) ? 3 : 4.5);

/** Raw colors within about 2% of a color variable: the variable should be used instead. */
function nearVariable(value: string, vars: Variable[]): Variable | null {
  const c = hex(value);
  if (!c || value.startsWith("$")) return null;
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r, g, b] = rgb(c);
  for (const v of vars) {
    const vc = v.kind === "color" ? hex(v.value) : null;
    if (!vc || vc === c) continue;
    const [r2, g2, b2] = rgb(vc);
    if (Math.hypot(r! - r2!, g! - g2!, b! - b2!) <= 0.02 * 441.7) return v;
  }
  return null;
}

// Emails ---------------------------------------------------------------------------------------------------------------

const TEXT_PARTS: EmailPartKey[] = ["heading", "text", "list", "quote", "social", "card-title", "muted", "footer", "button"];

export function checkEmailDesign(system: DesignSystem, given: EmailDoc, tokens: Partial<Tokens> = {}, opts: { marketing?: boolean } = {}): DesignNote[] {
  const doc = expandComponents(given, system);
  const out: DesignNote[] = [];
  const vars = allVariables(system, tokens);
  const varMap = new Map(vars.map((v) => [v.id, v]));
  const val = (id: string, part: EmailPartKey, prop: Prop, bp: EmailBp = "base", state?: EmailState) => {
    const r = resolveEmail(system, doc, { id, part }, bp, state)[prop];
    return r ? literal(r.value, varMap, state === "dark") : undefined;
  };
  const modes: (EmailState | undefined)[] = doc.settings.darkMode === "auto" ? [undefined, "dark"] : [undefined];
  const seenNear = new Set<string>();
  for (const el of elements(doc)) {
    if (!el.block) continue;
    const b = el.block;
    const parts = (TEXT_PARTS as string[]).filter((p) => partOf(b.type).includes(p as EmailPartKey)) as EmailPartKey[];
    for (const mode of modes) {
      // What's behind the text: the part's own background, a card's, the section's, the email's, the page's.
      const behind = (part: EmailPartKey) =>
        hex(val(b.id, part, "background-color", "base", mode)) ??
        (part === "card-title" || part === "muted" || ((b.type === "product" || b.type === "event") && part === "text") ? hex(val(b.id, "card", "background-color", "base", mode)) : null) ??
        hex(val(el.section.id, "section", "background-color", "base", mode)) ??
        hex(val("email", "content", "background-color", "base", mode)) ??
        hex(val("email", "body", "background-color", "base", mode)) ??
        "#ffffff";
      for (const part of parts) {
        const fg = hex(val(b.id, part, "color", "base", mode));
        if (!fg) continue;
        const bg = behind(part);
        const ratio = contrast(fg, bg);
        const need = needs(px(val(b.id, part, "font-size")), val(b.id, part, "font-weight"));
        if (ratio < need) out.push({ level: "warn", id: b.id, text: `Text is hard to read${mode === "dark" ? " in dark mode" : ""} (${ratio.toFixed(1)}:1, needs ${need}:1).` });
      }
    }
    for (const part of parts) {
      for (const prop of ["color", "background-color"] as Prop[]) {
        const own = doc.styles?.[b.id]?.[part]?.base?.[prop];
        const near = own ? nearVariable(own, vars) : null;
        if (near && !seenNear.has(`${b.id}:${near.id}`)) {
          seenNear.add(`${b.id}:${near.id}`);
          out.push({ level: "warn", id: b.id, text: `${own} is nearly ${near.name}. Use the variable.` });
        }
      }
    }
    if ((b.type === "image" || b.type === "video") && !b.alt.trim()) out.push({ level: "warn", id: b.id, text: "An image has no alt text." });
    if (b.type === "text" || b.type === "list") {
      const size = px(val(b.id, b.type, "font-size", "phone"));
      if (size !== null && size < 14) out.push({ level: "warn", id: b.id, text: `Text is ${size}px on phones; 14px or more reads well.` });
    }
    if (b.type === "button" || b.type === "meeting") {
      const h = (px(val(b.id, "button", "font-size", "phone")) ?? 16) * 1.25 + (px(val(b.id, "button", "padding-top", "phone")) ?? 0) + (px(val(b.id, "button", "padding-bottom", "phone")) ?? 0);
      if (h < 44) out.push({ level: "warn", id: b.id, text: `The button is ${Math.round(h)}px tall on phones; 44px is easy to tap.` });
      if (/^http:\/\//i.test(b.url)) out.push({ level: "warn", id: b.id, text: "A link starts with http://. Use https://." });
    }
    if (b.type === "text" || b.type === "html") {
      if (/href="http:\/\//i.test(b.html)) out.push({ level: "warn", id: b.id, text: "A link starts with http://. Use https://." });
      if (/<a\b[^>]*>\s*<\/a>/i.test(b.html)) out.push({ level: "warn", id: b.id, text: "A link has no words." });
    }
  }
  // Side-by-side columns can each have their own button; one column with two competes with itself.
  for (const s of doc.sections)
    for (const c of s.columns) {
      const buttons = c.blocks.filter((b) => b.type === "button" || b.type === "meeting");
      if (buttons.length > 1) out.push({ level: "warn", id: s.id, text: "A section has more than one main button." });
    }
  for (const gap of new Set(mergeGaps(`${doc.settings.preheader}\n${emailText(doc)}`))) {
    if (!/unsubscribe_url|company_address/.test(gap)) out.push({ level: "warn", text: `Give ${gap} a fallback, like {{first_name|there}}.` });
  }
  const blocks = doc.sections.flatMap((s) => s.columns.flatMap((c) => c.blocks));
  if (opts.marketing !== false && !blocks.some((b) => b.type === "footer")) out.push({ level: "block", text: "Marketing email needs the Footer block." });
  const built = compileEmail(system, doc, { tokens });
  for (const n of built.notes) if (n.level === "block") out.push({ level: "block", text: n.text });
  return out;
}

function partOf(type: string): EmailPartKey[] {
  switch (type) {
    case "heading":
      return ["heading"];
    case "text":
      return ["text"];
    case "list":
      return ["list"];
    case "quote":
      return ["quote"];
    case "social":
      return ["social"];
    case "button":
    case "meeting":
      return ["button"];
    case "product":
      return ["card-title", "text", "muted", "button"];
    case "event":
      return ["card-title", "muted", "button"];
    case "signature":
      return ["text", "muted"];
    case "footer":
      return ["footer"];
    default:
      return [];
  }
}
