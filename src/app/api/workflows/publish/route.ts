import { stepEmail } from "@/lib/nurture/email";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { cleanBody, problems } from "@/lib/workflows/check";
import { walk } from "@/lib/workflows/tree";
import type { Step } from "@/lib/workflows/types";

// Make live (docs/enrich-workflows-reports.md 2.4): POST { workflowId, note } checks the saved draft, renders each
// email, and publishes a new version. Refused with the problems listed while any is left. Runs already going stay on
// the version they started on.

const bad = (error: string, status = 400, extra: object = {}) => Response.json({ error, ...extra }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workflowId?: unknown; note?: unknown };
  const id = typeof b.workflowId === "string" && /^[0-9a-f-]{36}$/.test(b.workflowId) ? b.workflowId : "";
  // Read through the person's own client: no row means not their workspace.
  const { data: w } = await auth.sb.from("workflows").select("id, workspace_id, draft").eq("id", id).maybeSingle();
  if (!w) return bad("Workflow not found.", 404);
  const body = cleanBody(w.draft);
  const left = problems(body);
  if (left.length) return bad(`Fix this first: ${left[0]!.text}`, 400, { problems: left });
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const emails: object[] = [];
  walk(body.steps, (s: Step) => {
    if (s.kind !== "email") return;
    const r = stepEmail({ paragraphs: s.email.paragraphs.filter((p) => p.trim()), cta_label: s.email.cta_label, cta_url: s.email.cta_url });
    emails.push({ step: s.id, subject: s.email.subject, preheader: s.email.preheader, html: r.html, text: r.text, links: r.links });
  });
  const { data, error } = await db.rpc("workflow_publish", { p_id: id, p_user: auth.user.id, p_body: body, p_emails: emails, p_note: typeof b.note === "string" ? b.note.slice(0, 300) : null });
  if (error) return bad(error.message, 500);
  return Response.json({ version: data });
}
