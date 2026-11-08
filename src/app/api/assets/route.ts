import { isMember } from "@/lib/contacts/server";
import { MAX_ASSET_BYTES, photoWidths, sniffImage, stripImageMeta } from "@/lib/design/assets";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Images for emails and forms (docs/design-system.md Part 6). POST multipart { workspaceId, file } → { id, url,
// width, height }: the file is checked by its bytes (PNG, JPEG, GIF or WebP, up to 5 MB), photo metadata is taken
// out, and it's stored in the public "assets" bucket, with WebP copies at 640, 1280 and 1920 wide for forms' photos
// (docs/forms-media-plan.md). DELETE ?id= removes one from the list, its file and its copies.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const len = Number(request.headers.get("content-length") ?? 0);
  if (len > MAX_ASSET_BYTES + 100_000) return bad("Images can be up to 5 MB.", 413);
  const form = await request.formData().catch(() => null);
  const ws = form?.get("workspaceId");
  const file = form?.get("file");
  if (!(await isMember(auth, ws))) return bad("Workspace not found.", 404);
  if (!(file instanceof Blob) || !file.size) return bad("Pick an image.");
  if (file.size > MAX_ASSET_BYTES) return bad("Images can be up to 5 MB.", 413);
  const raw = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(raw);
  if (!kind) return bad("Use a PNG, JPEG, GIF or WebP image.");
  const bytes = stripImageMeta(raw);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const id = crypto.randomUUID();
  const path = `${ws}/${id}.${kind.ext}`;
  const up = await db.storage.from("assets").upload(path, bytes, { contentType: kind.type, cacheControl: "31536000", upsert: false });
  if (up.error) return bad("Try again in a moment.", 503);
  const url = db.storage.from("assets").getPublicUrl(path).data.publicUrl;
  // The widths a form loads: a copy that fails is left out, so the form uses the ones there are.
  const sizes: number[] = [];
  const widths = photoWidths(kind);
  if (widths.length) {
    const sharp = (await import("sharp")).default;
    for (const w of widths) {
      try {
        const out = await sharp(bytes, { limitInputPixels: 50_000_000 }).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
        const r = await db.storage.from("assets").upload(`${ws}/${id}-${w}.webp`, out, { contentType: "image/webp", cacheControl: "31536000", upsert: false });
        if (!r.error) sizes.push(w);
      } catch {}
    }
  }
  const name = (file instanceof File ? file.name : "").replace(/[^\w .-]/g, "").slice(0, 200);
  const { data, error } = await db.rpc("design_asset_add", { p_ws: ws, p_user: auth.user.id, p_path: path, p_url: url, p_name: name, p_type: kind.type, p_width: kind.width, p_height: kind.height, p_bytes: bytes.length });
  if (error) {
    await db.storage.from("assets").remove([path, ...sizes.map((w) => `${ws}/${id}-${w}.webp`)]);
    return bad(error.message.includes("Up to") ? error.message : "Try again in a moment.", 400);
  }
  if (sizes.length) await db.from("design_assets").update({ sizes }).eq("id", data);
  return Response.json({ id: data, url, width: kind.width, height: kind.height, sizes });
}

export async function DELETE(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID.test(id)) return bad("Image not found.", 404);
  // Through the person's own client: the function checks membership.
  const { data: path, error } = await auth.sb.rpc("design_asset_delete", { p_id: id });
  if (error) return bad("Image not found.", 404);
  const db = serviceClient();
  if (db && typeof path === "string") await db.storage.from("assets").remove([path, ...[640, 1280, 1920].map((w) => path.replace(/\.[a-z]+$/, `-${w}.webp`))]);
  return Response.json({ ok: true });
}
