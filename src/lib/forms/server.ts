import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleaningCtx } from "../contacts/server.ts";
import { templateById, templateTheme } from "./catalog.ts";
import { isTheme } from "./themes.ts";
import { applyRemap, planFields } from "./fields.ts";
import { qaCheck } from "./qa.ts";
import { blankSchema, checkSchema, checkSettings, cloneSchema, slugFor } from "./schema.ts";
import type { FormSchema, FormSettings } from "./types.ts";

// The member side of forms: make one from a template or blank, save, publish. Every write goes through the
// database functions in 039_forms.sql with the service role, after the route checks membership.

export type FormRow = { id: string; workspace_id: string; name: string; slug: string; status: "draft" | "live" | "closed"; schema: FormSchema; settings: FormSettings; phi: boolean; baa_confirmed_at: string | null };

const call = async <T>(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> => {
  for (let i = 0; ; i++) {
    const { data, error } = await db.rpc(fn, args);
    if (!error) return data as T;
    if (i >= 2 || !/timeout|fetch failed|ECONN|50[234]|429|deadlock/i.test(error.message)) throw new Error(error.message);
    await new Promise((r) => setTimeout(r, 300 * 2 ** i));
  }
};

async function existingFields(db: SupabaseClient, ws: string) {
  const { data, error } = await db.from("fields").select("key, label, type, options").eq("workspace_id", ws).eq("object", "contact");
  if (error) throw new Error(error.message);
  return (data ?? []) as { key: string; label: string; type: string; options: string[] }[];
}

/** A new form from a template (or blank when templateId is null). It goes live at once when it passes the check. */
export async function createForm(db: SupabaseClient, ws: string, user: string, templateId: string | null, theme?: string): Promise<{ id: string; status: string; problems: string[] }> {
  const t = templateId ? templateById(templateId) : null;
  if (templateId && !t) throw new Error("Template not found.");
  const settings: FormSettings = {
    theme: isTheme(theme) ? theme : t ? templateTheme(t) : undefined,
    ...(t?.internal ? { consent_off: true } : {}),
  };
  if (!settings.theme) delete settings.theme;
  let schema = t ? cloneSchema(t.schema) : blankSchema();
  const plan = planFields(schema, (await existingFields(db, ws)) as never);
  schema = applyRemap(schema, plan.remap);
  const ctx = await cleaningCtx(db, ws);
  // The fields this form will make count as existing for the check.
  const custom = [...ctx.custom, ...plan.create.map((c) => ({ key: c.key, label: c.label, type: c.type as never, options: c.options }))];
  const problems = qaCheck(schema, { ...ctx, custom });
  const status = t && !t.phi && !problems.length ? "live" : "draft";
  // The slug is random; a clash (one in a billion) just tries again.
  for (let i = 0; ; i++) {
    try {
      const id = await call<string>(db, "form_create", {
        p_ws: ws, p_user: user, p_name: schema.title, p_slug: slugFor(schema.title), p_schema: schema, p_settings: settings,
        p_template: t?.id ?? null, p_version: t?.version ?? null, p_phi: !!t?.phi, p_status: status, p_fields: plan.create, p_extend: plan.extend,
      });
      return { id, status, problems: t?.phi ? ["Health forms stay drafts until you confirm a BAA in Settings."] : problems };
    } catch (e) {
      if (i < 2 && /forms_slug_key|duplicate key/.test(String(e))) continue;
      throw e;
    }
  }
}

export async function duplicateForm(db: SupabaseClient, f: FormRow, user: string): Promise<string> {
  const plan = planFields(f.schema, (await existingFields(db, f.workspace_id)) as never);
  const schema = applyRemap({ ...cloneSchema(f.schema), title: f.schema.title }, plan.remap);
  return call<string>(db, "form_create", {
    p_ws: f.workspace_id, p_user: user, p_name: `${f.name} (copy)`.slice(0, 200), p_slug: slugFor(f.name), p_schema: schema, p_settings: f.settings,
    p_template: null, p_version: null, p_phi: f.phi, p_status: "draft", p_fields: plan.create, p_extend: plan.extend,
  });
}

/** Save the editor's changes. Errors come back as words for the editor. */
export async function saveForm(db: SupabaseClient, f: FormRow, user: string, name: string, schema: FormSchema, settings: FormSettings): Promise<{ schema: FormSchema } | { errors: string[] }> {
  const errs = [...checkSchema(schema), ...checkSettings(settings)];
  if (!name.trim() || name.length > 200) errs.push("Give the form a name.");
  if (errs.length) return { errors: errs };
  const plan = planFields(schema, (await existingFields(db, f.workspace_id)) as never);
  const next = applyRemap(schema, plan.remap);
  // A live form must keep passing the check, so a save can't break what visitors see.
  if (f.status === "live") {
    const ctx = await cleaningCtx(db, f.workspace_id);
    const custom = [...ctx.custom, ...plan.create.map((c) => ({ key: c.key, label: c.label, type: c.type as never, options: c.options }))];
    const problems = qaCheck(next, { ...ctx, custom });
    if (problems.length) return { errors: problems };
  }
  await call(db, "form_save", { p_form: f.id, p_user: user, p_name: name.trim(), p_schema: next, p_settings: settings, p_fields: plan.create, p_extend: plan.extend });
  return { schema: next };
}

export async function publishForm(db: SupabaseClient, f: FormRow): Promise<string[]> {
  if (f.phi && !f.baa_confirmed_at) return ["Confirm you have a signed BAA in Settings before this form collects health details."];
  const problems = qaCheck(f.schema, await cleaningCtx(db, f.workspace_id));
  if (problems.length) return problems;
  const { error } = await db.from("forms").update({ status: "live", published_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", f.id);
  if (error) throw new Error(error.message);
  return [];
}

/** Remove a form's uploaded files, a page at a time. */
export async function removeFiles(db: SupabaseClient, prefix: string) {
  for (let i = 0; i < 200; i++) {
    const { data } = await db.storage.from("form-files").list(prefix, { limit: 100 });
    if (!data?.length) return;
    const paths: string[] = [];
    for (const item of data) {
      const p = `${prefix}/${item.name}`;
      if (item.id) paths.push(p);
      else await removeFiles(db, p);
    }
    if (paths.length) await db.storage.from("form-files").remove(paths);
    else return;
  }
}
