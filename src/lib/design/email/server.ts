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

export async function loadKits(db: SupabaseClient, workspaceId: string): Promise<KitRow[]> {
  return ((await db.from("brand_kits").select("id, tokens, logo_url, design, design_live").eq("workspace_id", workspaceId).order("created_at")).data ?? []) as KitRow[];
}

/** Compile with the document's kit: `live` styles for sends, `draft` for tests. Throws when the compiler does. */
export function compileWithKit(doc: EmailDoc, kits: KitRow[], styles: "live" | "draft"): Compiled {
  const kit = kits.find((k) => k.id === doc.kitId) ?? kits[0];
  const tokens = cleanTokens((kit?.tokens ?? {}) as object).tokens;
  const system = readSystem((styles === "live" ? kit?.design_live : kit?.design) ?? {}, tokens);
  return compileEmail(system, doc, { tokens, logo: kit?.logo_url ?? null, fontUrl: fontUrl(designFonts(system, doc.styles ?? null)) });
}

export const hasHtmlBlock = (doc: EmailDoc) => doc.sections.some((s) => s.columns.some((c) => c.blocks.some((b) => b.type === "html")));
