import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// A workspace member opens a file a visitor uploaded: GET → a signed link that lasts 5 minutes. The database says
// whether this person may see it (form_upload_path checks membership).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const { uid } = await params;
  if (!UUID.test(uid)) return Response.json({ error: "File not found." }, { status: 404 });
  const { data: path } = await auth.sb.rpc("form_upload_path", { p_id: uid });
  if (typeof path !== "string") return Response.json({ error: "File not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "Not set up." }, { status: 500 });
  const { data, error } = await db.storage.from("form-uploads").createSignedUrl(path, 300, { download: true });
  if (error || !data) return Response.json({ error: "Try again in a moment." }, { status: 503 });
  return Response.json({ url: data.signedUrl });
}
