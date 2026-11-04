import { isMember } from "@/lib/contacts/server";
import { templateById } from "@/lib/forms/gallery/catalog";
import { kitById } from "@/lib/forms/gallery/kits";
import { makeFromTemplate, ownKit } from "@/lib/forms/gallery/make";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A starter kit (docs/form-templates-plan.md 5.2): POST { workspaceId, kit, kitId? } makes every template in the kit
// as a Form Studio form, in a workspace brand or each in its own style, and answers { ids, failed }. One form that fails never stops the rest; the ones made stay.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; kit?: unknown; kitId?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const k = typeof b.kit === "string" ? kitById(b.kit) : undefined;
  if (!k) return bad("Kit not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const brand = await ownKit(db, ws, b.kitId);
  if (brand === "missing") return bad("That brand isn't in this workspace.", 404);
  const list = k.templates.map((id) => templateById(id)).filter((t) => !!t);
  const ids: string[] = [];
  const failed: string[] = [];
  for (const t of list) {
    // A hiccup is tried once more before the form counts as failed.
    let done = false;
    for (let attempt = 0; attempt < 2 && !done; attempt++) {
      try {
        ids.push((await makeFromTemplate({ sb: auth.sb, db, ws, t: t!, kitId: brand })).id);
        done = true;
      } catch {
        if (attempt === 1) failed.push(t!.name);
      }
    }
  }
  if (!ids.length) return bad("The kit couldn't be made. Try again in a moment.", 500);
  return Response.json({ ids, failed });
}
