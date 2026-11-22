// Compiling an email on the server with its brand kit (docs/design-system.md Parts 4.5 and 8.2): the kit the document
// names, else the workspace's brand (workspaces.brand_kit_id, src/lib/brand/workspaceKit.ts); its published styles for real sends, its draft for a test send. Callers store
// or send the result as it is.

import type { SupabaseClient } from "@supabase/supabase-js";
import { designFonts, fontUrl, tokenFonts } from "../fonts.ts";
import { cleanTokens } from "../../forms/brand.ts";
import { readSystem } from "../model.ts";
import { brandOf } from "../../brand/workspaceKit.ts";
import { compileEmail, type Compiled } from "./compile.ts";
import type { EmailDoc } from "./doc.ts";

export type KitRow = { id: string; tokens: unknown; logo_url: string | null; design?: unknown; design_live?: unknown; book_name?: string | null; brand_name?: string | null };

const KIT_COLS = "id, tokens, logo_url, design, design_live, book_name:book->>name";
const KIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The workspace's brand kits, its brand first. With `ids` (the kits the emails name), only those and the brand (the
 * fallback in compileWithKit) are kept. Never cached: kits change in the browser, and a send must use what the person
 * just saved.
 */
export async function loadKits(db: SupabaseClient, workspaceId: string, ids?: (string | undefined)[]): Promise<KitRow[]> {
  // The workspace's brand leads, so compileWithKit's kits[0] fallback (a draft that names no kit) is the brand.
  const [w, all] = await Promise.all([
    db.from("workspaces").select("brand_kit_id, name").eq("id", workspaceId).maybeSingle(),
    db.from("brand_kits").select(KIT_COLS).eq("workspace_id", workspaceId).order("created_at"),
  ]);
  const ws = w.data as { brand_kit_id: string | null; name: string | null } | null;
  // The name a logo-less email shows: the brand book's, else the team's.
  const list = ((all.data ?? []) as KitRow[]).map((k) => ({ ...k, brand_name: k.book_name?.trim() || ws?.name?.trim() || null }));
  const head = brandOf(list, ws?.brand_kit_id);
  const named = ids ? new Set(ids.filter((x): x is string => !!x && KIT_ID.test(x))) : null;
  const rest = list.filter((k) => k !== head && (!named || named.has(k.id)));
  return [...(head ? [head] : []), ...rest];
}

/** Compile with the document's kit: `live` styles for sends, `draft` for tests. Throws when the compiler does. */
export function compileWithKit(doc: EmailDoc, kits: KitRow[], styles: "live" | "draft"): Compiled {
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0];
  const tokens = cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const system = readSystem((styles === "live" ? kit?.design_live : kit?.design) ?? {}, tokens);
  return compileEmail(system, doc, { tokens, logo: kit?.logo_url ?? null, brandName: kit?.brand_name ?? null, fontUrl: fontUrl([...designFonts(system, doc.styles ?? null), ...tokenFonts(tokens)]) });
}

export const hasHtmlBlock = (doc: EmailDoc) => doc.sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "html")));
