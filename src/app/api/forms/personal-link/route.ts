import { cleanEmail, isRejected } from "@/lib/identity/clean";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { formLink } from "@/lib/share/formLink";
import { personalLink, personalToken, PERSONAL_DAYS } from "@/lib/share/personal";

// Share › Personal link (docs/sharing-plan.md, Personal links): POST { workspaceId, formId, email } answers { url,
// contact } with the form's link for that one person, good for 90 days. The form fills in what Claritia knows about
// them (their contact, when there is one, else just the email). The link holds a signed token, never their details.

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; formId?: unknown; email?: unknown };
  const ws = typeof b.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(b.workspaceId) ? b.workspaceId : null;
  if (!ws || !(await roleIn(auth, ws))) return bad("Workspace not found.", 404);
  if (typeof b.formId !== "string" || !/^[0-9a-f-]{36}$/.test(b.formId)) return bad("Form not found.", 404);
  const e = cleanEmail(typeof b.email === "string" ? b.email : "");
  if (isRejected(e)) return bad("Enter a valid email.");
  const secret = process.env.SECRETS_KEY;
  if (!secret) return bad("The server is not set up for this.", 500);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: form } = await db.from("forms").select("id, slug").eq("id", b.formId).eq("workspace_id", ws).maybeSingle();
  if (!form) return bad("Form not found.", 404);
  const { data: c } = await db.from("contacts").select("id").eq("workspace_id", ws).eq("email_clean", e.clean).is("deleted_at", null).limit(1).maybeSingle();
  const contact = (c as { id: string } | null)?.id ?? null;
  const token = personalToken({ ws, contact, email: contact ? null : e.clean }, secret);
  return Response.json({ url: personalLink(await formLink(db, ws, form as { id: string; slug: string | null }), token, "personal"), contact: !!contact, days: PERSONAL_DAYS });
}
