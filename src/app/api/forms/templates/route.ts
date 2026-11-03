import { isMember } from "@/lib/contacts/server";
import { cleanTokens, fixContrast } from "@/lib/forms/brand";
import { templateById, templateTheme } from "@/lib/forms/gallery/catalog";
import { kitBooks, kitMeeting, kitWorkflows } from "@/lib/forms/gallery/kit";
import { styleNote, styleTokens, templateForm } from "@/lib/forms/gallery/convert";
import { isTheme, themeById } from "@/lib/forms/gallery/themes";
import { checkForm, type Form } from "@/lib/forms/schema";
import { templateByKey } from "@/lib/workflows/templates";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Use template (docs/form-templates.md, docs/form-templates-plan.md 5.1): POST { workspaceId, template, theme? } makes
// a draft form from a gallery template in a style, and answers { id, workflows }. The style is a brand kit ("Midnight
// style"), made once per workspace and reused, so the form wears it in the builder, previews and live. The form is
// checked before it's made. A booking template books the workspace's meeting when it has exactly one; its follow-ups
// are made as draft workflows started on the form, every email unapproved. A follow-up that fails leaves the form
// made, and says so.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; template?: unknown; theme?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const t = typeof b.template === "string" ? templateById(b.template) : undefined;
  if (!t) return bad("Template not found.", 404);
  const th = themeById(isTheme(b.theme) ? b.theme : templateTheme(t));
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);

  let draft: Form = templateForm(t, th);
  if (kitBooks(t)) {
    const { data: types } = await db.from("meeting_types").select("id, active").eq("workspace_id", ws);
    const meeting = kitMeeting((types as { id: string; active: boolean }[] | null) ?? []);
    if (meeting) draft = { ...draft, after: { ...draft.after, schedule: { tool: "claritia", url: "", meetingTypeId: meeting, perOwner: false } } };
  }
  const checked = checkForm(draft);
  if ("errors" in checked) return bad(checked.errors[0] ?? "This template can't be used right now.", 500);

  // The style's brand kit: the one made before, or a new one.
  const note = styleNote(th);
  const { data: kits, error: kitErr } = await db.from("brand_kits").select("id, notes").eq("workspace_id", ws);
  if (kitErr) return bad(kitErr.message, 500);
  let kitId = (kits as { id: string; notes: string[] | null }[] | null)?.find((k) => k.notes?.includes(note))?.id ?? null;
  if (!kitId) {
    const fixed = fixContrast(cleanTokens(styleTokens(th)).tokens);
    const { data, error } = await db.rpc("brand_kit_save", {
      p_user: auth.user.id,
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
    if (error) return bad(error.message, 500);
    kitId = data as string;
  }

  // Made as the person, so the workspace check and created_by are theirs.
  const { data: id, error } = await auth.sb.rpc("form_create", { p_ws: ws, p_name: t.name, p_draft: checked.form, p_brand_kit: kitId, p_kind: "built" });
  if (error) return bad(error.message, 500);

  // The follow-ups, as drafts on this form.
  let made = 0;
  let failed = 0;
  for (const key of kitWorkflows(t)) {
    const w = templateByKey(key);
    if (!w) continue;
    const body = w.body();
    if ("forms" in body.trigger) body.trigger = { ...body.trigger, forms: [id as string] };
    const { error: we } = await auth.sb.rpc("workflow_save", { p_ws: ws, p_id: null, p_name: `${t.name} follow-up`, p_draft: body, p_revision: null });
    if (we) failed++;
    else made++;
  }
  return Response.json({ id: id as string, kitId, workflows: made, ...(failed ? { workflowError: "A follow-up couldn't be made. Add it from Workflows." } : {}) });
}
