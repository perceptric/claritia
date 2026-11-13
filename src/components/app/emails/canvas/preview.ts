// An email as it would arrive, for the canvas and the group cards (docs/email-canvas-b1.md section 4): a draft built
// from its blocks in its brand with the draft styles (the same build the Email Studio and a send use), or what a sent
// email sent. Merge tags show their fallback. Browser-safe; no server calls.

import { compileEmail } from "@/lib/design/email/compile";
import { readEmailDoc, type EmailDoc } from "@/lib/design/email/doc";
import { designFonts, fontUrl } from "@/lib/design/fonts";
import { readSystem } from "@/lib/design/model";
import { cleanTokens, type Tokens } from "@/lib/forms/brand";

export type CanvasKit = { id: string; tokens: Partial<Tokens> | null; logo_url: string | null; design: unknown };
export type CanvasRow = { id: string; name: string; subject: string; preheader: string | null; status: string; doc: unknown; html: string; group_id: string | null; group_position: number; updated_at: string };

/** Merge tags as a reader sees them: the fallback, a sample address, a dead unsubscribe link. */
export const filled = (html: string) => html.replace(/\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/g, (_m, k: string, f?: string) => (k === "company_address" ? "" : k === "unsubscribe_url" ? "#" : (f ?? "")));

export const docOf = (row: Pick<CanvasRow, "doc">): EmailDoc => readEmailDoc(row.doc ?? {}, { allowHtml: true });

/** The email's own width: the builder's setting, or 600 for an email with no blocks. */
export const widthOf = (row: Pick<CanvasRow, "doc">): number => (row.doc ? docOf(row).settings.width : 600);

/** The HTML that goes out (no editing marks), for the code view and the preview. */
export function sourceHtml(row: Pick<CanvasRow, "doc" | "status" | "html">, kits: CanvasKit[]): string {
  if (row.status !== "draft" && row.html) return row.html;
  const doc = docOf(row);
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0];
  const tokens = cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const system = readSystem(kit?.design ?? {}, tokens);
  return compileEmail(system, doc, { tokens, logo: kit?.logo_url ?? null, fontUrl: fontUrl(designFonts(system, doc.styles ?? null)) }).html;
}

export function previewHtml(row: Pick<CanvasRow, "doc" | "status" | "html">, kits: CanvasKit[]): string {
  try {
    return filled(sourceHtml(row, kits));
  } catch {
    return "";
  }
}
