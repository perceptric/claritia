// The Claritia embed for a site app (docs/integrations-plan.md, Next step 7): the same code as the form's Share tab
// (src/lib/share/embed.ts), from a form link or id, a mode and the button or tab text. tests/siteApps.test.ts checks
// it against the Share tab's own. Plain JS, no build step.

export const ORIGIN = "https://app.tryclaritia.com";
export const MODES = ["inline", "full", "popup", "slider", "popover", "sidetab"];
const ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** The form's id from an id or any Claritia link that holds one, or "" when there isn't one. */
export function formId(form) {
  const m = ID.exec(String(form ?? ""));
  return m ? m[1].toLowerCase() : "";
}

/** Text safe inside a double-quoted attribute or between tags, as the Share tab makes it. */
export function safe(s, max = 60) {
  return String(s ?? "")
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * The element's attributes as name and value pairs (a null value is a bare attribute), and the button's text for a
 * popup or slider. Null when the form link or id isn't one.
 */
export function embedParts(form, mode = "inline", text = "") {
  const id = formId(form);
  if (!id) return null;
  const m = MODES.includes(mode) ? mode : "inline";
  const t = String(text ?? "").trim();
  const attrs = [["form-id", id]];
  if (m === "full") attrs.push(["full", null]);
  if (m === "popup") attrs.push(["popup", "click"], ["size", "m"]);
  if (m === "slider") attrs.push(["slider", "right"], ["popup", "click"]);
  if (m === "popover") attrs.push(["popover", null], ["icon", "chat"]);
  if (m === "sidetab") attrs.push(["side-tab", t || "Contact us"]);
  return { id, mode: m, attrs, button: m === "popup" || m === "slider" ? t || "Open the form" : null };
}

/** The whole embed code, as the Share tab gives it, or "" for a link or id that isn't one. */
export function embedCode(form, mode = "inline", text = "") {
  const p = embedParts(form, mode, text);
  if (!p) return "";
  const attrs = p.attrs.map(([k, v]) => (v === null ? k : `${k}="${safe(v, k === "side-tab" ? 40 : 80)}"`)).join(" ");
  const button = p.button === null ? "" : `\n<button data-claritia-open="${p.id}">${safe(p.button)}</button>`;
  return `<script src="${ORIGIN}/forms/v1.js" async></script>\n<claritia-form ${attrs}></claritia-form>${button}`;
}
