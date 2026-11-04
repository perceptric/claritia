import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningCtx } from "../contacts/server.ts";
import { lookCss, needsStudio, studioForm, type KitLook } from "./liveForm.ts";

// Keeping an older form as a Studio page for good (docs/forms-chat-plan.md Part 8). Its draft becomes a page, and its
// live version is published again as the page visitors already get (src/lib/forms/server.ts converts it as it's
// read), in one step in the database (form_to_studio, 123): the draft only while it's still the older kind, the live
// version only while it's still the one that was read. Run when the form opens in the app, and after a visitor loads
// it. Nothing a visitor sees changes; the app's copy catches up.

export type Persisted = { draft: boolean; live: boolean; lost: string[]; error?: string };

type Row = { id: string; workspace_id: string; draft: Record<string, unknown> | null; brand_kit_id: string | null; live_kit_id?: string | null; kind: string | null; version: number };

async function kitLook(db: SupabaseClient, id: string | null | undefined): Promise<KitLook> {
  if (!id) return null;
  const { data } = await db.from("brand_kits").select("studio_css, notes").eq("id", id).maybeSingle();
  return (data as KitLook) ?? null;
}

/** Turn a form's draft and live version into Studio pages, where they aren't yet. Never throws. */
export async function persistStudio(db: SupabaseClient, formId: string): Promise<Persisted> {
  const out: Persisted = { draft: false, live: false, lost: [] };
  try {
    const { data } = await db.from("forms").select("*").eq("id", formId).maybeSingle();
    const row = data as Row | null;
    if (!row || row.kind === "captured") return out;
    const ctx = await cleaningCtx(db, row.workspace_id).catch(() => ({ custom: undefined }));
    let draft: unknown = null;
    if (needsStudio(row.draft)) {
      const r = studioForm(row.draft, lookCss(await kitLook(db, row.brand_kit_id)), { custom: ctx.custom });
      if ("error" in r) return { ...out, error: r.error };
      draft = r.form;
      out.lost = r.lost;
    }
    let body: unknown = null;
    if (row.version > 0) {
      const { data: v } = await db.rpc("form_version_body", { p_form: row.id, p_version: row.version });
      if (needsStudio(v)) {
        // The live version keeps the look it went live with.
        const r = studioForm(v, lookCss(await kitLook(db, row.live_kit_id ?? row.brand_kit_id)));
        if (!("error" in r)) body = r.form;
      }
    }
    if (!draft && !body) return out;
    const { data: res, error } = await db.rpc("form_to_studio", { p_id: row.id, p_version: row.version, p_body: body, p_draft: draft });
    if (error) return { ...out, error: error.message };
    const r = (res ?? {}) as { draft?: boolean; live?: boolean };
    return { ...out, draft: !!r.draft, live: !!r.live };
  } catch (e) {
    return { ...out, error: e instanceof Error ? e.message : "The form couldn't be moved into the Studio." };
  }
}
