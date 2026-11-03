import { isMember } from "@/lib/contacts/server";
import { createForm, duplicateForm, publishForm, removeFiles, saveForm, type FormRow } from "@/lib/forms/server";
import type { FormSchema, FormSettings } from "@/lib/forms/types";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Forms for members (docs/form-templates.md). POST { workspaceId, action, ... }:
//   import { templateId, theme? } · create · duplicate { id } · save { id, name, schema, settings } · publish { id }
//   close { id } · delete { id } · baa { id } · delete_submission { id, submissionId } · file_url { id, path }

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const UUID = /^[0-9a-f-]{36}$/;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const ws = b.workspaceId as string;
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const user = auth.user.id;

  try {
    if (b.action === "import" || b.action === "create") {
      const r = await createForm(db, ws, user, b.action === "import" ? String(b.templateId ?? "") : null, typeof b.theme === "string" ? b.theme : undefined);
      return Response.json(r);
    }

    if (typeof b.id !== "string" || !UUID.test(b.id)) return bad("Form not found.", 404);
    const { data } = await db.from("forms").select("id, workspace_id, name, slug, status, schema, settings, phi, baa_confirmed_at").eq("id", b.id).eq("workspace_id", ws).maybeSingle();
    const f = data as FormRow | null;
    if (!f) return bad("Form not found.", 404);

    switch (b.action) {
      case "duplicate":
        return Response.json({ id: await duplicateForm(db, f, user) });
      case "save": {
        const r = await saveForm(db, f, user, String(b.name ?? ""), b.schema as FormSchema, (b.settings ?? {}) as FormSettings);
        return "errors" in r ? Response.json({ errors: r.errors }, { status: 400 }) : Response.json(r);
      }
      case "publish": {
        const problems = await publishForm(db, f);
        return problems.length ? Response.json({ errors: problems }, { status: 400 }) : Response.json({ status: "live" });
      }
      case "close": {
        const { error } = await db.from("forms").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", f.id);
        if (error) throw new Error(error.message);
        return Response.json({ status: "closed" });
      }
      case "baa": {
        const { error } = await db.from("forms").update({ baa_confirmed_at: new Date().toISOString() }).eq("id", f.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "delete": {
        await removeFiles(db, `${ws}/${f.id}`);
        const { error } = await db.from("forms").delete().eq("id", f.id);
        if (error) throw new Error(error.message);
        return Response.json({ ok: true });
      }
      case "delete_submission": {
        if (typeof b.submissionId !== "string" || !UUID.test(b.submissionId)) return bad("Answer not found.", 404);
        const { data: s } = await db.from("form_submissions").select("id, answers").eq("id", b.submissionId).eq("form_id", f.id).maybeSingle();
        if (!s) return bad("Answer not found.", 404);
        const paths = Object.values((s.answers ?? {}) as Record<string, unknown>)
          .flatMap((v) => (Array.isArray(v) ? v : []))
          .map((x) => (x && typeof x === "object" && typeof (x as { path?: unknown }).path === "string" ? (x as { path: string }).path : ""))
          .filter((p) => p.startsWith(`${ws}/${f.id}/`));
        if (paths.length) await db.storage.from("form-files").remove(paths);
        const { error } = await db.from("form_submissions").delete().eq("id", s.id);
        if (error) throw new Error(error.message);
        const { count } = await db.from("form_submissions").select("id", { count: "exact", head: true }).eq("form_id", f.id);
        await db.from("forms").update({ submissions: count ?? 0 }).eq("id", f.id);
        return Response.json({ ok: true });
      }
      case "file_url": {
        const path = String(b.path ?? "");
        if (!path.startsWith(`${ws}/${f.id}/`) || path.includes("..")) return bad("File not found.", 404);
        const { data: signed, error } = await db.storage.from("form-files").createSignedUrl(path, 120, { download: true });
        if (error || !signed) return bad("File not found.", 404);
        return Response.json({ url: signed.signedUrl });
      }
      default:
        return bad("Unknown action.");
    }
  } catch (e) {
    console.error("forms api", b.action, e instanceof Error ? e.message : e);
    return bad(e instanceof Error && e.message.length < 200 ? e.message : "Something went wrong. Try again.", 500);
  }
}
