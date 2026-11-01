import { cleanName, sniffFile } from "@/lib/forms/files";
import { allowed, clientIp, cors, json, loadPublic } from "@/lib/forms/server";
import { allFields } from "@/lib/forms/schema";
import { serviceClient } from "@/lib/serviceClient";

// A visitor's file for a form's upload field (docs/forms-plan.md 3.1): POST multipart { field, file } → { token }.
// The file is checked by its bytes against the field's kinds and size, stored in the private form-uploads bucket, and
// the token is the answer the form sends. Uploads no fill links to are removed after a day (form_uploads_stale).

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MB = 1024 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const ip = clientIp(request);
  if (!allowed(`upload:${id}:${ip}`, 10) || !allowed(`upload:${id}`, 300)) return json({ error: "Too many uploads. Wait a minute." }, 429, { "Retry-After": "60" });
  if (Number(request.headers.get("content-length") ?? 0) > 20 * MB + 100_000) return json({ error: "That file is too big." }, 413);
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const f = await loadPublic(db, id).catch(() => null);
  if (!f || f.status !== "live") return json({ error: "This form isn't taking answers." }, 410);
  const body = await request.formData().catch(() => null);
  const field = allFields(f.body).find((x) => x.id === body?.get("field") && x.type === "file");
  const file = body?.get("file");
  if (!field?.file) return json({ error: "Field not found." }, 404);
  if (!(file instanceof Blob) || !file.size) return json({ error: "Pick a file." }, 400);
  if (file.size > field.file.maxMb * MB) return json({ error: `Files can be up to ${field.file.maxMb} MB.` }, 413);
  const name = cleanName(file instanceof File ? file.name : "file");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffFile(bytes, name);
  if (!kind || !field.file.kinds.includes(kind.kind)) return json({ error: "That kind of file isn't taken here." }, 415);
  const path = `${f.workspace_id}/${id}/${crypto.randomUUID()}`;
  const up = await db.storage.from("form-uploads").upload(path, bytes, { contentType: kind.type, upsert: false });
  if (up.error) return json({ error: "Try again in a moment." }, 503);
  const { data, error } = await db.rpc("form_upload_add", { p_form: id, p_field: field.id, p_path: path, p_name: name, p_kind: kind.type, p_bytes: bytes.length });
  if (error) {
    await db.storage.from("form-uploads").remove([path]);
    return json({ error: "Try again in a moment." }, 503);
  }
  // Now and then, clear uploads no fill ever used.
  if (Math.random() < 0.05)
    void db.rpc("form_uploads_stale").then(({ data: stale }) => (Array.isArray(stale) && stale.length ? db.storage.from("form-uploads").remove(stale as string[]) : null));
  return json({ token: `up_${data as string}:${name}` });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
