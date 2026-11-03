// The parts of an email people can style (docs/design-system.md Parts 2.2 and 4.1). Each block, section and column
// has the parts listed for it; `defaults` are the looks an email has when nothing sets them, written with the design
// system's variables so a brand kit restyles every email at once. Emails have two breakpoints (desktop and phone)
// and two states (hover, for Apple Mail, and dark). Runs in the browser and on the server.

export type EmailPartDef = { label: string; defaults?: Record<string, string> };

export const EMAIL_PARTS = {
  body: { label: "Page", defaults: { "background-color": "#f3f3f1", "padding-top": "32px", "padding-bottom": "32px" } },
  content: { label: "Email", defaults: { "background-color": "$background", "border-top-left-radius": "0px" } },
  section: { label: "Section", defaults: { "padding-top": "16px", "padding-bottom": "16px", "padding-left": "32px", "padding-right": "32px" } },
  column: { label: "Column" },
  heading: { label: "Heading", defaults: { "font-family": "$heading-font", color: "$text", "font-size": "26px", "font-weight": "600", "line-height": "1.25" } },
  text: { label: "Text", defaults: { "font-family": "$body-font", color: "$text", "font-size": "16px", "line-height": "1.6" } },
  link: { label: "Link", defaults: { color: "$accent", "text-decoration-line": "underline" } },
  button: {
    label: "Button",
    defaults: {
      "background-color": "$button-bg",
      color: "$button-text",
      "font-family": "$body-font",
      "font-size": "16px",
      "font-weight": "$button-weight",
      "padding-top": "12px",
      "padding-bottom": "12px",
      "padding-left": "24px",
      "padding-right": "24px",
      "border-top-left-radius": "$button-radius",
    },
  },
  image: { label: "Image" },
  divider: { label: "Divider", defaults: { "border-top-width": "1px", "border-top-style": "solid", "border-top-color": "$border" } },
  list: { label: "List", defaults: { "font-family": "$body-font", color: "$text", "font-size": "16px", "line-height": "1.6" } },
  quote: { label: "Quote", defaults: { "font-family": "$body-font", color: "$muted", "font-size": "18px", "font-style": "italic", "line-height": "1.5", "border-left-width": "3px", "border-left-style": "solid", "border-left-color": "$accent", "padding-left": "16px" } },
  social: { label: "Social links", defaults: { "font-family": "$body-font", color: "$muted", "font-size": "14px" } },
  card: { label: "Card", defaults: { "background-color": "$input-bg", "border-top-left-radius": "$radius", "padding-top": "20px", "padding-bottom": "20px", "padding-left": "20px", "padding-right": "20px" } },
  "card-title": { label: "Card title", defaults: { "font-family": "$heading-font", color: "$text", "font-size": "18px", "font-weight": "600", "line-height": "1.3" } },
  muted: { label: "Small text", defaults: { "font-family": "$body-font", color: "$muted", "font-size": "14px", "line-height": "1.5" } },
  footer: { label: "Footer", defaults: { "font-family": "$body-font", color: "$muted", "font-size": "12px", "line-height": "1.6", "text-align": "center" } },
} satisfies Record<string, EmailPartDef>;

export type EmailPartKey = keyof typeof EMAIL_PARTS;
export const EMAIL_PART_KEYS = /* @__PURE__ */ Object.keys(EMAIL_PARTS) as EmailPartKey[];
export const emailPartDef = (p: EmailPartKey): EmailPartDef => EMAIL_PARTS[p] as EmailPartDef;
export const isEmailPart = (p: unknown): p is EmailPartKey => typeof p === "string" && Object.prototype.hasOwnProperty.call(EMAIL_PARTS, p);

/** The block types (Part 4.1): 17 blocks; columns are a section's layout. */
export const BLOCK_TYPES = ["heading", "text", "button", "image", "logo", "divider", "spacer", "list", "quote", "social", "video", "product", "event", "meeting", "signature", "footer", "html"] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** The parts each kind of element has, first the one a click picks. */
export function emailPartsOf(kind: BlockType | "section" | "column" | "email"): EmailPartKey[] {
  switch (kind) {
    case "email":
      return ["content", "body"];
    case "section":
      return ["section"];
    case "column":
      return ["column"];
    case "heading":
      return ["heading", "link"];
    case "text":
      return ["text", "link"];
    case "list":
      return ["list", "link"];
    case "button":
    case "meeting":
      return ["button"];
    case "image":
    case "logo":
    case "video":
      return ["image"];
    case "divider":
      return ["divider"];
    case "spacer":
      return [];
    case "quote":
      return ["quote"];
    case "social":
      return ["social"];
    case "product":
      return ["card", "image", "card-title", "text", "muted", "button"];
    case "event":
      return ["card", "card-title", "muted", "text", "button"];
    case "signature":
      return ["text", "muted", "image"];
    case "footer":
      return ["footer", "link"];
    case "html":
      return [];
  }
}
