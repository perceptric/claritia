// The Claritia embed for Framer (docs/integrations-plan.md, Next step 7): the same element as the form's Share tab
// (src/lib/share/embed.ts), from a form link or id, a mode and the button or tab text. tests/siteApps.test.ts checks
// it against the Share tab's own code. No imports, so it runs in Framer and in the tests.

export const ORIGIN = "https://app.tryclaritia.com";
export const SCRIPT = `${ORIGIN}/forms/v1.js`;
export const MODES = ["inline", "full", "popup", "slider", "popover", "sidetab"] as const;
export type Mode = (typeof MODES)[number];

const ID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

export const formId = (form: unknown): string => ID.exec(String(form ?? ""))?.[1]?.toLowerCase() ?? "";

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);

/** The element's attributes (React sets and escapes them) and the popup or slider's button text. Null for no form. */
export function framerParts(form: unknown, mode: string = "inline", text = ""): { id: string; attrs: Record<string, string>; button: string | null } | null {
  const id = formId(form);
  if (!id) return null;
  const m: Mode = (MODES as readonly string[]).includes(mode) ? (mode as Mode) : "inline";
  const t = String(text ?? "").trim();
  const attrs: Record<string, string> = { "form-id": id };
  if (m === "full") attrs.full = "";
  if (m === "popup") Object.assign(attrs, { popup: "click", size: "m" });
  if (m === "slider") Object.assign(attrs, { slider: "right", popup: "click" });
  if (m === "popover") Object.assign(attrs, { popover: "", icon: "chat" });
  if (m === "sidetab") attrs["side-tab"] = clean(t || "Contact us", 40);
  return { id, attrs, button: m === "popup" || m === "slider" ? clean(t || "Open the form", 60) : null };
}
