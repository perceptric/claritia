// A booking page's look (docs/scheduling-plan.md 11.3, Styling): Claritia's look or the brand kit, an accent, the
// button shape, the welcome line, whether "Built by Claritia" shows, and the order of the meetings. Saved on the
// person's booking profile (booking_profiles.page) or on the workspace for the team page (workspaces.booking_page).
// Every value is cleaned here before it is saved or drawn. Runs in the browser and on the server.
// A page without a brand kit can wear one of the designs (src/lib/meetings/designs.ts); Claritia's own is the default.

import { DESIGNS, isDesign, type DesignId } from "./designs.ts";
import { cleanWelcome } from "./welcome.ts";

export type Accent = "ink" | "emerald" | "sky" | "lilac" | "rose" | "butter";

/** The accents, as the page draws them (the public page can't read the app's tokens). */
export const ACCENTS: Record<Accent, string> = { ink: "#0A0A0A", emerald: "#059669", sky: "#0B62B0", lilac: "#5230C2", rose: "#B23A26", butter: "#B25A09" };

export type PageLook = {
  /** Claritia's look, or the workspace's brand kit. Unset: the kit when there is one. */
  look?: "claritia" | "brand";
  /** The imported brand this page uses (a brand kit id). Unset: the workspace's brand. */
  brand?: string;
  /** A design from the gallery, when the page doesn't use a brand kit. Unset: Claritia's own look. */
  design?: Exclude<DesignId, "claritia">;
  accent: Accent;
  /** Unset: the look's own (pills for Claritia, the kit's corners for a kit). */
  buttons?: "round" | "soft";
  /** Rich text, cleaned (src/lib/meetings/welcome.ts); older pages hold plain text. */
  welcome: string;
  badge: boolean;
  /** Meeting type ids, first to last; types not named follow in name order. */
  order: string[];
};

export const DEFAULT_LOOK: PageLook = { accent: "emerald", welcome: "", badge: true, order: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cleanLook(raw: unknown): PageLook {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    ...(r.look === "claritia" || r.look === "brand" ? { look: r.look } : {}),
    ...(typeof r.brand === "string" && UUID.test(r.brand) ? { brand: r.brand } : {}),
    ...(isDesign(r.design) && r.design !== "claritia" ? { design: r.design } : {}),
    accent: typeof r.accent === "string" && r.accent in ACCENTS ? (r.accent as Accent) : DEFAULT_LOOK.accent,
    ...(r.buttons === "round" || r.buttons === "soft" ? { buttons: r.buttons } : {}),
    welcome: cleanWelcome(r.welcome),
    badge: r.badge !== false,
    order: [...new Set(Array.isArray(r.order) ? r.order.filter((x): x is string => typeof x === "string" && UUID.test(x)) : [])].slice(0, 100),
  };
}

/** Whether the page uses the brand kit: picked, or unset with a kit there. */
export const usesKit = (l: PageLook, hasKit: boolean) => (l.look ? l.look === "brand" && hasKit : hasKit);

/** The tokens the page is drawn with, and the overrides on top of them. */
export function lookTokens(l: PageLook, kit: Record<string, unknown> | null): { tokens: Record<string, unknown>; vars: Record<string, string> } {
  const kitOn = usesKit(l, !!kit && Object.keys(kit).length > 0);
  const vars: Record<string, string> = {};
  // A design brings its own colors, fonts and corners; only a picked button shape goes on top.
  if (!kitOn && l.design) {
    const d = DESIGNS[l.design];
    if (l.buttons) vars["--clr-btn-radius"] = l.buttons === "round" ? "999px" : "10px";
    return { tokens: { ...d.tokens }, vars: { ...d.vars, ...vars } };
  }
  if (!kitOn || l.accent !== DEFAULT_LOOK.accent) vars["--cb-dot"] = ACCENTS[l.accent];
  if (l.buttons) vars["--clr-btn-radius"] = l.buttons === "round" ? "999px" : "10px";
  return { tokens: kitOn ? kit! : {}, vars };
}

/** Types in the page's order. */
export function ordered<T extends { id: string; name: string }>(types: T[], order: string[]): T[] {
  const at = new Map(order.map((id, i) => [id, i]));
  return [...types].sort((a, b) => (at.get(a.id) ?? 1e6) - (at.get(b.id) ?? 1e6) || a.name.localeCompare(b.name));
}

/** Styling's summary line: the brand's name, the design's, or Claritia. */
export function lookWords(l: PageLook, hasKit: boolean, brandName?: string | null): string {
  return usesKit(l, hasKit) ? brandName || "Your brand" : l.design ? DESIGNS[l.design].name : "Claritia";
}
