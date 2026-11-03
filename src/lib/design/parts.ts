// The parts of a form people can style (docs/design-system.md Parts 2.2 and 3.1), and where each one is in the form's
// markup (src/lib/forms/element.ts). Form parts are the form's own (title, button, progress...); field parts are inside
// one field (label, input, help...). `sel` is relative to the form (form parts) or to the field's box (field parts);
// "" is the box itself, and a list joined by ", " stands for each of them. `defaults` are the looks the form's own stylesheet gives, shown in the style panel as where a
// value comes from when nothing sets it. Runs in the browser and on the server.

import type { FieldType } from "../forms/schema.ts";

export type PartDef = {
  label: string;
  scope: "form" | "field";
  sel: string;
  /** The selector for the checked state, when it isn't the part itself with :checked. */
  checked?: string;
  /** No states (a placeholder is a pseudo-element). */
  plain?: boolean;
  defaults?: Record<string, string>;
};

export const PARTS = {
  // The form's own parts.
  form: { label: "Form", scope: "form", sel: ".f", defaults: { "background-color": "$background", gap: "$gap", "font-family": "$body-font", "font-size": "$font-size", color: "$text" } },
  title: { label: "Title", scope: "form", sel: ".f > .h", defaults: { "font-family": "$heading-font", "font-size": "1.45em", "font-weight": "600", "line-height": "1.2" } },
  intro: { label: "Intro", scope: "form", sel: ".f > .i:not(.nt)", defaults: { color: "$muted" } },
  progress: { label: "Progress bar", scope: "form", sel: ".pb", defaults: { height: "4px", "border-top-left-radius": "4px" } },
  "progress-fill": { label: "Progress fill", scope: "form", sel: ".pb i", defaults: { "background-color": "$accent" } },
  "step-title": { label: "Step", scope: "form", sel: ".st", defaults: { "font-size": "0.85em", color: "$muted" } },
  button: { label: "Button", scope: "form", sel: ".ac .bt:not(.bk)", defaults: { height: "$input-height", "padding-left": "22px", "padding-right": "22px", "background-color": "$button-bg", color: "$button-text", "font-weight": "$button-weight", "border-top-left-radius": "$button-radius" } },
  back: { label: "Back button", scope: "form", sel: ".bt.bk", defaults: { "background-color": "transparent", color: "$text", "border-top-width": "$border-width", "border-top-color": "$border" } },
  consent: { label: "Consent", scope: "form", sel: ".ck.cs" },
  notice: { label: "Notice", scope: "form", sel: ".nt", defaults: { "font-size": "0.85em", color: "$muted" } },
  alert: { label: "Form error", scope: "form", sel: ".al", defaults: { color: "$error" } },
  thanks: { label: "Thank-you", scope: "form", sel: ".dn" },
  "thanks-title": { label: "Thank-you title", scope: "form", sel: ".dn > .h" },
  popup: { label: "Popup", scope: "form", sel: ".pbox", defaults: { "background-color": "$background", "padding-top": "28px" } },
  overlay: { label: "Popup overlay", scope: "form", sel: ".pop" },
  time: { label: "Time", scope: "form", sel: ".tm .pl", checked: '.tm .pl[aria-pressed="true"]' },
  day: { label: "Day", scope: "form", sel: ".dy .pl", checked: '.dy .pl[aria-pressed="true"]' },

  // Inside one field.
  field: { label: "Field", scope: "field", sel: "" },
  label: { label: "Label", scope: "field", sel: ".lb", defaults: { "font-size": "$label-size", "font-weight": "$label-weight" } },
  required: { label: "Required mark", scope: "field", sel: ".rq", defaults: { color: "$muted" } },
  input: {
    label: "Input",
    scope: "field",
    sel: ":is(.in, .bx)",
    defaults: { "min-height": "$input-height", "padding-left": "12px", "padding-right": "12px", "background-color": "$input-bg", "border-top-width": "$border-width", "border-top-color": "$border", "border-top-left-radius": "$radius" },
  },
  placeholder: { label: "Placeholder", scope: "field", sel: ".in::placeholder, .bx .ph", plain: true, defaults: { color: "$muted" } },
  help: { label: "Help text", scope: "field", sel: ".hp", defaults: { "font-size": "0.85em", color: "$muted" } },
  error: { label: "Error text", scope: "field", sel: ".er", defaults: { "font-size": "0.85em", color: "$error" } },
  option: { label: "Option", scope: "field", sel: ".ck", checked: ".ck:has(:checked)" },
  "option-box": { label: "Option box", scope: "field", sel: ".ck input", checked: ".ck input:checked" },
  "option-text": { label: "Option text", scope: "field", sel: ".ck span", checked: ".ck:has(:checked) span" },
  menu: { label: "Menu", scope: "field", sel: ".ls", plain: true },
  "menu-item": { label: "Menu item", scope: "field", sel: ".op", checked: '.op[aria-selected="true"]' },
  rating: { label: "Rating", scope: "field", sel: ".rt span", checked: ".rt label:has(:checked) span" },
  heading: { label: "Heading", scope: "field", sel: ":is(.k1, .k2, .k3)", defaults: { "font-family": "$heading-font", "font-weight": "600", "line-height": "1.2" } },
  text: { label: "Text", scope: "field", sel: ".tx" },
  divider: { label: "Divider", scope: "field", sel: ".dv", defaults: { "border-top-width": "$border-width", "border-top-color": "$border" } },
  image: { label: "Image", scope: "field", sel: ".im", defaults: { "border-top-left-radius": "$radius" } },
} satisfies Record<string, PartDef>;

export type PartKey = keyof typeof PARTS;
export const PART_KEYS = /* @__PURE__ */ Object.keys(PARTS) as PartKey[];
export const partDef = (p: PartKey): PartDef => PARTS[p] as PartDef;
export const FORM_PARTS = /* @__PURE__ */ PART_KEYS.filter((p) => partDef(p).scope === "form");

const TEXTY: PartKey[] = ["field", "label", "required", "input", "placeholder", "help", "error"];

/** The parts a field of this type has, in the order the panel lists them. */
export function fieldParts(type: FieldType): PartKey[] {
  switch (type) {
    case "dropdown":
    case "country":
      return [...TEXTY, "menu", "menu-item"];
    case "choice":
    case "multi":
      return ["field", "label", "required", "option", "option-box", "option-text", "input", "help", "error"];
    case "checkbox":
      return ["field", "option", "option-box", "option-text", "required", "help", "error"];
    case "rating":
      return ["field", "label", "required", "rating", "help", "error"];
    case "heading":
      return ["field", "heading"];
    case "paragraph":
      return ["field", "text"];
    case "divider":
      return ["field", "divider"];
    case "image":
      return ["field", "image"];
    case "calc":
      return ["field", "label", "input", "help"];
    case "hidden":
      return [];
    default:
      return TEXTY;
  }
}

/** The part a click picked, walking up from what was clicked to the field's box (or the form). */
export function partAt(target: Element | null, root: Element | null, parts: PartKey[]): PartKey | null {
  if (!target || !root?.contains(target)) return null;
  for (let n: Element | null = target; n && n !== root.parentElement; n = n.parentElement) {
    for (const k of parts) {
      const d = partDef(k);
      const sel = d.sel;
      if (k === "placeholder" || k === "field" || !sel) continue;
      if (d.scope === "field" ? n.matches(sel) && root.contains(n) : n.matches(sel)) return k;
    }
    if (n === root) break;
  }
  return parts.includes("field") ? "field" : null;
}
