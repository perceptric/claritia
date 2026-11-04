import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { styleCssById } from "../../studio/styleCss.ts";
import { templateDraft } from "../../studio/templatePage.ts";
import { templateTheme } from "./catalog.ts";
import { templateByKey } from "../../workflows/templates.ts";
import { kitBooks, kitMeeting, kitWorkflows } from "./kit.ts";
import type { FormTemplate } from "./types.ts";

// Use template on the server (docs/form-templates.md, docs/forms-chat-plan.md Part 8): the template as a Form Studio
// page in the look picked: a style (the one picked on the website, or the template's own), a workspace brand (its
// stylesheet from Add a brand), or plain. It opens in the Studio like every form. The form is checked before it's made. A booking template books the workspace's
// meeting when it has exactly one; its follow-ups are made as draft workflows started on the form, every email
// unapproved. A follow-up that fails leaves the form made, and says so.

export type Made = { id: string; kitId: string | null; workflows: number; workflowError?: string };

/**
 * Make one form from a template. `sb` is the person's own client (the form and workflows are theirs), `db` the
 * service client (meetings and the brand). `kitId` is a brand already in this workspace; without one the form wears
 * `theme` (a style id, else the template's own style), or Claritia's plain look when `plain`.
 */
export async function makeFromTemplate(o: { sb: SupabaseClient; db: SupabaseClient; ws: string; t: FormTemplate; kitId?: string | null; theme?: string | null; plain?: boolean }): Promise<Made> {
  const { sb, db, ws, t } = o;
  let meeting: string | null = null;
  if (kitBooks(t)) {
    const { data: types } = await db.from("meeting_types").select("id, active").eq("workspace_id", ws);
    meeting = kitMeeting((types as { id: string; active: boolean }[] | null) ?? []);
  }
  const kitId = o.kitId ?? null;
  const kitCss = kitId ? ((await db.from("brand_kits").select("studio_css").eq("id", kitId).maybeSingle()).data as { studio_css?: string | null } | null)?.studio_css : null;
  const css = kitId ? (kitCss ?? "") : o.plain ? "" : styleCssById(o.theme || templateTheme(t));
  const draft = templateDraft(t, css, meeting);
  const { data: id, error } = await sb.rpc("form_create", { p_ws: ws, p_name: t.name, p_draft: draft, p_brand_kit: kitId, p_kind: "built" });
  if (error) throw new Error(error.message);
  let made = 0;
  let failed = 0;
  for (const key of kitWorkflows(t)) {
    const w = templateByKey(key);
    if (!w) continue;
    const body = w.body();
    if ("forms" in body.trigger) body.trigger = { ...body.trigger, forms: [id as string] };
    const { error: we } = await sb.rpc("workflow_save", { p_ws: ws, p_id: null, p_name: `${t.name} follow-up`, p_draft: body, p_revision: null });
    if (we) failed++;
    else made++;
  }
  return { id: id as string, kitId, workflows: made, ...(failed ? { workflowError: "A follow-up couldn't be made. Add it from Workflows." } : {}) };
}

/** A brand id from the request, when it's this workspace's. */
export async function ownKit(db: SupabaseClient, ws: string, raw: unknown): Promise<string | null | "missing"> {
  if (typeof raw !== "string" || !/^[0-9a-f-]{36}$/.test(raw)) return null;
  const { data } = await db.from("brand_kits").select("id").eq("id", raw).eq("workspace_id", ws).maybeSingle();
  return data ? raw : "missing";
}
