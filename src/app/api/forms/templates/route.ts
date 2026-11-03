import { isMember } from "@/lib/contacts/server";
import { templateById, templateTheme } from "@/lib/forms/gallery/catalog";
import { makeFromTemplate, ownKit } from "@/lib/forms/gallery/make";
import { isTheme, themeById } from "@/lib/forms/gallery/themes";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Use template (docs/form-templates.md, docs/form-templates-plan.md 5.1): POST { workspaceId, template, theme?, kitId? }
// makes a draft form from a gallery template, in a style or the workspace's own brand kit, with its meeting and
// draft follow-ups (src/lib/forms/gallery/make.ts), and answers { id, kitId, workflows, workflowError? }.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; template?: unknown; theme?: unknown; kitId?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const t = typeof b.template === "string" ? templateById(b.template) : undefined;
  if (!t) return bad("Template not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const kit = await ownKit(db, ws, b.kitId);
  if (kit === "missing") return bad("That brand isn't in this workspace.", 404);
  try {
    const made = await makeFromTemplate({ sb: auth.sb, db, user: auth.user.id, ws, t, th: themeById(isTheme(b.theme) ? b.theme : templateTheme(t)), kitId: kit });
    return Response.json(made);
  } catch (e) {
    return bad(e instanceof Error ? e.message : "This form template can't be used right now.", 500);
  }
}
