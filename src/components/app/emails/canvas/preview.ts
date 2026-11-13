// An email as it would arrive, for the canvas and the group cards (docs/email-canvas-b1.md section 4): a draft built
// from its blocks in its brand with the draft styles (the same build the Email Studio and a send use), or what a sent
// email sent. Merge tags show their fallback. Browser-safe; no server calls.

import { compileEmail } from "@/lib/design/email/compile";
import { readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import { designFonts, fontUrl } from "@/lib/design/fonts";
import { readSystem, type DesignSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";
import { sampleFill } from "@/lib/meetings/systemEmails";

export type CanvasKit = { id: string; tokens: Partial<Tokens> | null; logo_url: string | null; design: unknown };
export type CanvasRow = { id: string; name: string; subject: string; preheader: string | null; status: string; doc: unknown; html: string; group_id: string | null; group_position: number; updated_at: string; /** An automation's email (163): its step. */ step_id?: string | null; /** A System email (164): its key, and when it was turned off. */ system_key?: string | null; paused_at?: string | null };

/** Merge tags as a reader sees them: the fallback, a sample address, a dead unsubscribe link. */
export const filled = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "" : k === "unsubscribe_url" ? "#" : (f ?? "")));

export const docOf = (row: Pick<CanvasRow, "doc">): EmailDoc => readEmailDoc(row.doc ?? {}, { allowHtml: true });

/** The email's own width: the builder's setting, or 600 for an email with no blocks. */
export const widthOf = (row: Pick<CanvasRow, "doc">): number => (row.doc ? docOf(row).settings.width : 600);

/** A document built in its brand: the draft styles (or the given live ones), with the canvas's marks when `marks`. */
export function buildDoc(doc: EmailDoc, kits: CanvasKit[], o: { system?: DesignSystem; tokens?: Partial<Tokens>; marks?: boolean; dark?: boolean } = {}): string {
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0];
  const tokens = o.tokens ?? cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const system = o.system ?? readSystem(kit?.design ?? {}, tokens);
  return compileEmail(system, doc, { tokens, logo: kit?.logo_url ?? null, fontUrl: fontUrl(designFonts(system, doc.styles ?? null)), ...(o.marks ? { preview: true } : {}), ...(o.dark ? { forceDark: true } : {}) }).html;
}

/** The HTML that goes out (no editing marks), for the code view. */
export function sourceHtml(row: Pick<CanvasRow, "doc" | "status" | "html">, kits: CanvasKit[]): string {
  if (row.status !== "draft" && row.html) return row.html;
  return buildDoc(docOf(row), kits);
}

/**
 * What the canvas shows: a sent email as sent; a draft built with the canvas's marks (so a click finds its parts),
 * from its live document and styles while it's being edited. Merge tags show their fallback (a System email's, a sample
 * meeting's values).
 */
export function previewHtml(row: Pick<CanvasRow, "doc" | "status" | "html" | "system_key">, kits: CanvasKit[], live?: { doc: EmailDoc; system: DesignSystem; tokens: Partial<Tokens>; dark?: boolean }): string {
  // A System email shows a sample meeting's values (src/lib/meetings/systemEmails.ts).
  const fill = row.system_key ? (h: string) => sampleFill(h) : filled;
  try {
    if (row.status !== "draft" && row.html) return fill(row.html);
    return fill(live ? buildDoc(live.doc, kits, { system: live.system, tokens: live.tokens, marks: true, dark: live.dark }) : buildDoc(docOf(row), kits, { marks: true }));
  } catch {
    return "";
  }
}
