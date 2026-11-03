import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanTokens, fixContrast } from "../brand.ts";
import { checkForm, type Form } from "../schema.ts";
import { templateByKey } from "../../workflows/templates.ts";
import { styleNote, styleTokens, templateForm } from "./convert.ts";
import { kitBooks, kitMeeting, kitWorkflows } from "./kit.ts";
import type { Theme } from "./themes.ts";
import type { FormTemplate } from "./types.ts";

// Use template on the server (docs/form-templates.md, docs/form-templates-plan.md 5.1): the template as a draft form
// in a style's brand kit ("Midnight style", made once per workspace and reused) or the workspace's own kit. The form
// is checked before it's made. A booking template books the workspace's meeting when it has exactly one; its
// follow-ups are made as draft workflows started on the form, every email unapproved. A follow-up that fails leaves the
// form made, and says so.

export type Made = { id: string; kitId: string; workflows: number; workflowError?: string };

/** The style's brand kit in this workspace: the one made before, or a new one. */
export async function styleKit(db: SupabaseClient, user: string, ws: string, th: Theme): Promise<string> {
  const note = styleNote(th);
  const { data: kits, error } = await db.from("brand_kits").select("id, notes").eq("workspace_id", ws);
  if (error) throw new Error(error.message);
  const found = (kits as { id: string; notes: string[] | null }[] | null)?.find((k) => k.notes?.includes(note))?.id;
  if (found) return found;
  const fixed = fixContrast(cleanTokens(styleTokens(th)).tokens);
  const { data, error: e } = await db.rpc("brand_kit_save", {
    p_user: user,
    p_ws: ws,
    p_id: null,
    p_name: `${th.name} style`,
    p_tokens: fixed.tokens,
    p_logo_url: null,
    p_source_url: null,
    p_notes: [note, ...fixed.notes].slice(0, 20),
    p_site: null,
    p_scanned: false,
  });
  if (e) throw new Error(e.message);
  return data as string;
}

/**
 * Make one form from a template. `sb` is the person's own client (the form and workflows are theirs), `db` the
 * service client (meetings and brand kits). `kitId` is a brand kit already in this workspace; otherwise `th`'s kit.
 */
export async function makeFromTemplate(o: { sb: SupabaseClient; db: SupabaseClient; user: string; ws: string; t: FormTemplate; th: Theme; kitId?: string | null }): Promise<Made> {
  const { sb, db, user, ws, t, th } = o;
  let draft: Form = templateForm(t, o.kitId ? undefined : th);
  if (kitBooks(t)) {
    const { data: types } = await db.from("meeting_types").select("id, active").eq("workspace_id", ws);
    const meeting = kitMeeting((types as { id: string; active: boolean }[] | null) ?? []);
    if (meeting) draft = { ...draft, after: { ...draft.after, schedule: { tool: "claritia", url: "", meetingTypeId: meeting, perOwner: false } } };
  }
  const checked = checkForm(draft);
  if ("errors" in checked) throw new Error(checked.errors[0] ?? "This form template can't be used right now.");
  const kitId = o.kitId ?? (await styleKit(db, user, ws, th));
  const { data: id, error } = await sb.rpc("form_create", { p_ws: ws, p_name: t.name, p_draft: checked.form, p_brand_kit: kitId, p_kind: "built" });
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

/** A brand kit id from the request, when it's this workspace's. */
export async function ownKit(db: SupabaseClient, ws: string, raw: unknown): Promise<string | null | "missing"> {
  if (typeof raw !== "string" || !/^[0-9a-f-]{36}$/.test(raw)) return null;
  const { data } = await db.from("brand_kits").select("id").eq("id", raw).eq("workspace_id", ws).maybeSingle();
  return data ? raw : "missing";
}
