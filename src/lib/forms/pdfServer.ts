import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makePdf, type PdfLine } from "./pdf.ts";
import { answerText } from "./results.ts";
import { allFields, isContent, type Form } from "./schema.ts";

// A fill's PDF copy (docs/form-kinds-plan.md step 3), for the person who sent it (the link after the send) and for
// the team (Submissions). The service client reads the fill; the routes decide who may ask.

export type FillRow = { id: string; workspace_id: string; form_id: string; form_version: number; created_at: string; values: Record<string, unknown> };

export async function loadFill(db: SupabaseClient, sid: string): Promise<FillRow | null> {
  const { data } = await db.from("submissions").select('id, workspace_id, form_id, form_version, created_at, "values"').eq("id", sid).maybeSingle();
  return (data as FillRow | null) ?? null;
}

export async function fillPdf(db: SupabaseClient, s: FillRow): Promise<Uint8Array | null> {
  const [v, f, w] = await Promise.all([
    db.from("form_versions").select("body").eq("form_id", s.form_id).eq("version", s.form_version).maybeSingle(),
    db.from("forms").select("name").eq("id", s.form_id).maybeSingle(),
    db.from("workspaces").select("name").eq("id", s.workspace_id).maybeSingle(),
  ]);
  const body = (v.data as { body?: Form } | null)?.body;
  if (!body) return null;
  const lines: PdfLine[] = [];
  for (const x of allFields(body)) {
    if (isContent(x.type) || x.type === "hidden") continue;
    const value = s.values[x.key];
    if (value === undefined || value === null || value === "") continue;
    let image: Uint8Array | null = null;
    // A signature is drawn as the picture they signed.
    if (x.type === "signature" && typeof value === "string" && value.startsWith("up_")) {
      const id = value.slice(3, 39);
      const up = (await db.from("form_uploads").select("path").eq("id", id).eq("submission_id", s.id).maybeSingle()).data as { path?: string } | null;
      if (up?.path) {
        const file = await db.storage.from("form-uploads").download(up.path).catch(() => null);
        if (file?.data) image = new Uint8Array(await file.data.arrayBuffer());
      }
    }
    lines.push({ label: x.label || x.key, value: answerText({ key: x.key, label: x.label, field: x }, value), image });
  }
  const when = new Date(s.created_at).toUTCString().replace(/ GMT$/, " UTC");
  return makePdf({ title: ((f.data as { name?: string } | null)?.name ?? "Form").slice(0, 120), sub: `Sent ${when}`, lines, footer: `${(w.data as { name?: string } | null)?.name ?? ""} - copy ${s.id}` });
}
