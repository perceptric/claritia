import { isMember } from "@/lib/contacts/server";
import { fillPdf, loadFill } from "@/lib/forms/pdfServer";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A fill's PDF copy for the team (Submissions, docs/form-kinds-plan.md step 3): members of its workspace only.

export async function GET(request: Request, { params }: { params: Promise<{ sid: string }> }) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const { sid } = await params;
  if (!/^[0-9a-f-]{36}$/.test(sid)) return Response.json({ error: "Not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "Not set up." }, { status: 503 });
  const s = await loadFill(db, sid);
  if (!s || !(await isMember(auth, s.workspace_id))) return Response.json({ error: "Not found." }, { status: 404 });
  const pdf = await fillPdf(db, s);
  if (!pdf) return Response.json({ error: "Not found." }, { status: 404 });
  return new Response(pdf as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="fill-${sid.slice(0, 8)}.pdf"`, "cache-control": "private, no-store" } });
}
