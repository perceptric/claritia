// Compiling an email on the server with its brand kit (docs/design-system.md Parts 4.5 and 8.2): the kit the document
// names, else the workspace's first; its published styles for real sends, its draft for a test send. Callers store
// or send the result as it is.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fontUrl } from "../../../components/app/forms/editorModel.ts";
import { cleanTokens } from "../../forms/brand.ts";
import { designFonts } from "../form.ts";
import { readSystem } from "../model.ts";
import { compileEmail, type Compiled } from "./compile.ts";
import type { EmailDoc } from "./doc.ts";

export type KitRow = { id: string; tokens: unknown; logo_url: string | null; design?: unknown; design_live?: unknown };

const KIT_COLS = "id, tokens, logo_url, design, design_live";
const KIT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The workspace's brand kits, in order. With `ids` (the kits the emails name), only those and the workspace's first
 * kit (the fallback in compileWithKit) are read, in one round trip, instead of every kit's styles. Never cached:
 * kits change in the browser, and a send must use what the person just saved.
 */
export async function loadKits(db: SupabaseClient, workspaceId: string, ids?: (string | undefined)[]): Promise<KitRow[]> {
  if (!ids) return ((await db.from("brand_kits").select(KIT_COLS).eq("workspace_id", workspaceId).order("created_at")).data ?? []) as KitRow[];
  const named = [...new Set(ids.filter((x): x is string => !!x && KIT_ID.test(x)))];
  const [first, rows] = await Promise.all([
    db.from("brand_kits").select(KIT_COLS).eq("workspace_id", workspaceId).order("created_at").limit(1),
    named.length ? db.from("brand_kits").select(KIT_COLS).eq("workspace_id", workspaceId).in("id", named) : Promise.resolve({ data: [] }),
  ]);
  const head = ((first.data ?? []) as KitRow[])[0];
  // The first kit leads, so compileWithKit's kits[0] fallback is the same as with every kit read.
  return [...(head ? [head] : []), ...((rows.data ?? []) as KitRow[]).filter((k) => k.id !== head?.id)];
}

/** Compile with the document's kit: `live` styles for sends, `draft` for tests. Throws when the compiler does. */
export function compileWithKit(doc: EmailDoc, kits: KitRow[], styles: "live" | "draft"): Compiled {
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0];
  const tokens = cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const system = readSystem((styles === "live" ? kit?.design_live : kit?.design) ?? {}, tokens);
  return compileEmail(system, doc, { tokens, logo: kit?.logo_url ?? null, fontUrl: fontUrl(designFonts(system, doc.styles ?? null)) });
}

export const hasHtmlBlock = (doc: EmailDoc) => doc.sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "html")));
