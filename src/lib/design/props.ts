// The style properties people can set (docs/design-system.md Part 2.3), each with the type of value it takes and,
// for email, the clients that ignore it. A value is checked against its property's type before it's saved, so a
// color can't land on a width and nothing outside the list is ever written. Runs in the browser and on the server.

export type Group = "layout" | "spacing" | "size" | "position" | "typography" | "backgrounds" | "borders" | "effects";
export type Kind = "length" | "color" | "keyword" | "number" | "integer" | "font" | "weight" | "image" | "shadow" | "ratio" | "time" | "transform" | "tracks" | "span";
export type Client = "gmail" | "outlook" | "outlookcom" | "apple" | "yahoo";

export type PropDef = {
  group: Group;
  label: string;
  kind: Kind;
  keywords?: readonly string[];
  /** Lengths: the units allowed, and the range in px (or the bare number for unitless kinds). */
  units?: readonly string[];
  min?: number;
  max?: number;
  /** Lengths: `auto` (and `none` for max sizes) allowed. */
  auto?: boolean;
  /** Lengths: a number with no unit is allowed (line-height). */
  unitless?: boolean;
  /** Email: false when the email builder doesn't offer it; else the clients that ignore it. */
  email: false | Client[];
};

const PX = ["px", "%", "em", "rem", "vw", "vh"] as const;
const SPACE = ["px", "%", "em", "rem"] as const;
const ALIGN = ["flex-start", "center", "flex-end", "stretch", "baseline"] as const;
const BORDER_STYLE = ["none", "solid", "dashed", "dotted"] as const;

const len = (group: Group, label: string, o: Partial<PropDef> = {}): PropDef => ({ group, label, kind: "length", units: PX, min: 0, max: 4000, email: [], ...o });
const col = (group: Group, label: string, o: Partial<PropDef> = {}): PropDef => ({ group, label, kind: "color", email: [], ...o });
const kw = (group: Group, label: string, keywords: readonly string[], o: Partial<PropDef> = {}): PropDef => ({ group, label, kind: "keyword", keywords, email: [], ...o });

type Side = "top" | "right" | "bottom" | "left";
type Corner = "top-left" | "top-right" | "bottom-right" | "bottom-left";
const SIDES: Side[] = ["top", "right", "bottom", "left"];
const CORNERS: Corner[] = ["top-left", "top-right", "bottom-right", "bottom-left"];
const sides = <P extends string>(prefix: P, group: Group, label: string, o: Partial<PropDef>) =>
  Object.fromEntries(SIDES.map((s) => [`${prefix}-${s}`, len(group, `${label} ${s}`, o)])) as Record<`${P}-${Side}`, PropDef>;
const borders = () =>
  Object.fromEntries(
    SIDES.flatMap((s) => [
      [`border-${s}-width`, len("borders", `Border ${s} width`, { units: ["px"], max: 40 })],
      [`border-${s}-style`, kw("borders", `Border ${s} style`, BORDER_STYLE)],
      [`border-${s}-color`, col("borders", `Border ${s} color`)],
    ]),
  ) as Record<`border-${Side}-${"width" | "style" | "color"}`, PropDef>;
const corners = () =>
  Object.fromEntries(CORNERS.map((c) => [`border-${c}-radius`, len("borders", `Corner ${c.replace("-", " ")}`, { units: ["px", "%"], max: 999, email: ["outlook"] })])) as Record<
    `border-${Corner}-radius`,
    PropDef
  >;

export const PROPS = /* @__PURE__ */ (() => ({
  // Layout
  display: kw("layout", "Display", ["block", "flex", "grid", "inline-block", "inline", "none"], { email: false }),
  "flex-direction": kw("layout", "Direction", ["row", "column", "row-reverse", "column-reverse"], { email: false }),
  "flex-wrap": kw("layout", "Wrap", ["nowrap", "wrap"], { email: false }),
  "justify-content": kw("layout", "Justify", ["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"], { email: false }),
  "align-items": kw("layout", "Align", ALIGN, { email: false }),
  "align-self": kw("layout", "Align self", ["auto", ...ALIGN], { email: false }),
  gap: len("layout", "Gap", { units: SPACE, max: 400, email: false }),
  "row-gap": len("layout", "Row gap", { units: SPACE, max: 400, email: false }),
  "column-gap": len("layout", "Column gap", { units: SPACE, max: 400, email: false }),
  "grid-template-columns": { group: "layout", label: "Columns", kind: "tracks", email: false },
  "grid-column": { group: "layout", label: "Column span", kind: "span", email: false },
  order: { group: "layout", label: "Order", kind: "integer", min: -99, max: 99, email: false },
  "flex-grow": { group: "layout", label: "Grow", kind: "number", min: 0, max: 99, email: false },
  "flex-shrink": { group: "layout", label: "Shrink", kind: "number", min: 0, max: 99, email: false },
  "flex-basis": len("layout", "Basis", { auto: true, email: false }),
  "vertical-align": kw("layout", "Vertical align", ["top", "middle", "bottom", "baseline"]),

  // Spacing
  ...sides("margin", "spacing", "Margin", { units: SPACE, min: -400, max: 400, auto: true, email: ["outlook"] }),
  ...sides("padding", "spacing", "Padding", { units: SPACE, max: 400 }),

  // Size
  width: len("size", "Width", { auto: true }),
  "min-width": len("size", "Min width", { auto: true, email: ["outlook"] }),
  "max-width": len("size", "Max width", { auto: true, email: ["outlook"] }),
  height: len("size", "Height", { auto: true }),
  "min-height": len("size", "Min height", { auto: true, email: ["outlook"] }),
  "max-height": len("size", "Max height", { auto: true, email: false }),
  "aspect-ratio": { group: "size", label: "Ratio", kind: "ratio", email: false },
  "object-fit": kw("size", "Fit", ["fill", "contain", "cover", "none", "scale-down"], { email: ["outlook", "gmail"] }),
  overflow: kw("size", "Overflow", ["visible", "hidden", "auto"], { email: false }),

  // Position (forms only)
  position: kw("position", "Position", ["static", "relative", "sticky"], { email: false }),
  ...sides("inset", "position", "Inset", { units: SPACE, min: -2000, max: 2000, auto: true, email: false }),
  "z-index": { group: "position", label: "Z index", kind: "integer", min: 0, max: 999, email: false },

  // Typography
  "font-family": { group: "typography", label: "Font", kind: "font", email: ["gmail", "outlook", "outlookcom", "yahoo"] },
  "font-weight": { group: "typography", label: "Weight", kind: "weight", email: [] },
  "font-size": len("typography", "Size", { units: ["px", "em", "rem", "%"], min: 6, max: 200 }),
  "line-height": len("typography", "Line height", { units: ["px", "em", "%"], unitless: true, max: 300 }),
  "letter-spacing": len("typography", "Letter spacing", { units: ["px", "em"], min: -20, max: 40 }),
  color: col("typography", "Color"),
  "text-align": kw("typography", "Align", ["left", "center", "right", "justify"]),
  "text-transform": kw("typography", "Case", ["none", "uppercase", "lowercase", "capitalize"]),
  "text-decoration-line": kw("typography", "Decoration", ["none", "underline", "line-through"]),
  "font-style": kw("typography", "Style", ["normal", "italic"]),
  "white-space": kw("typography", "White space", ["normal", "nowrap", "pre-line", "pre-wrap"], { email: ["outlook"] }),
  "text-shadow": { group: "typography", label: "Text shadow", kind: "shadow", email: ["gmail", "outlook", "yahoo"] },

  // Backgrounds
  "background-color": col("backgrounds", "Color"),
  "background-image": { group: "backgrounds", label: "Image", kind: "image", email: ["outlook"] },
  "background-size": kw("backgrounds", "Size", ["auto", "cover", "contain"], { email: ["outlook"] }),
  "background-position": kw("backgrounds", "Position", ["center", "top", "bottom", "left", "right", "top left", "top right", "bottom left", "bottom right"], { email: ["outlook"] }),
  "background-repeat": kw("backgrounds", "Repeat", ["no-repeat", "repeat", "repeat-x", "repeat-y"], { email: ["outlook"] }),

  // Borders
  ...borders(),
  ...corners(),

  // Effects
  opacity: { group: "effects", label: "Opacity", kind: "number", min: 0, max: 1, email: ["outlook"] },
  "box-shadow": { group: "effects", label: "Shadow", kind: "shadow", email: ["gmail", "outlook", "yahoo"] },
  "outline-width": len("effects", "Outline width", { units: ["px"], max: 20, email: false }),
  "outline-style": kw("effects", "Outline style", BORDER_STYLE, { email: false }),
  "outline-color": col("effects", "Outline color", { email: false }),
  "outline-offset": len("effects", "Outline offset", { units: ["px"], min: -20, max: 20, email: false }),
  cursor: kw("effects", "Cursor", ["auto", "default", "pointer", "text", "not-allowed"], { email: false }),
  "transition-duration": { group: "effects", label: "Transition", kind: "time", min: 0, max: 2000, email: false },
  "transition-timing-function": kw("effects", "Easing", ["ease", "ease-in", "ease-out", "ease-in-out", "linear"], { email: false }),
  transform: { group: "effects", label: "Transform", kind: "transform", email: false },
}) satisfies Record<string, PropDef>)();

export type Prop = keyof typeof PROPS;
export const PROP_NAMES = /* @__PURE__ */ Object.keys(PROPS) as Prop[];
export const isProp = (p: unknown): p is Prop => typeof p === "string" && Object.prototype.hasOwnProperty.call(PROPS, p);
export const propDef = (p: Prop): PropDef => PROPS[p] as PropDef;

/** The CSS name a property is written as: logical `inset-*` keys become `top`, `right`… */
export const cssName = (p: Prop): string => (p.startsWith("inset-") ? p.slice(6) : p);

export const GROUPS: { id: Group; label: string }[] = [
  { id: "layout", label: "Layout" },
  { id: "spacing", label: "Spacing" },
  { id: "size", label: "Size" },
  { id: "position", label: "Position" },
  { id: "typography", label: "Typography" },
  { id: "backgrounds", label: "Backgrounds" },
  { id: "borders", label: "Borders" },
  { id: "effects", label: "Effects" },
];

export const CLIENT_LABEL: Record<Client, string> = { gmail: "Gmail", outlook: "Outlook for Windows", outlookcom: "Outlook.com", apple: "Apple Mail", yahoo: "Yahoo" };
