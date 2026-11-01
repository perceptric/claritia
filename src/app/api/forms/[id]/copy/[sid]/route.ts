import { timingSafeEqual } from "node:crypto";
import { allowed, clientIp } from "@/lib/forms/server";
import { fillPdf, loadFill } from "@/lib/forms/pdfServer";
import { copyKey } from "@/lib/forms/submit";
import { serviceClient } from "@/lib/serviceClient";

// A PDF copy of a fill for the person who sent it (docs/form-kinds-plan.md step 3): the link after the send carries a
// key only that fill's link has (copyKey), so nobody can open another fill's copy by changing the address.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const k = new URL(request.url).searchParams.get("k") ?? "";
  const secret = process.env.SECRETS_KEY;
  if (!ID.test(id) || !ID.test(sid) || !secret) return new Response("Not found.", { status: 404 });
  const want = Buffer.from(copyKey(id, sid, secret));
  const got = Buffer.from(k);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return new Response("Not found.", { status: 404 });
  if (!allowed(`copy:${clientIp(request)}`, 20)) return new Response("Too many tries.", { status: 429, headers: { "Retry-After": "60" } });
  const db = serviceClient();
  if (!db) return new Response("Not set up.", { status: 503 });
  const s = await loadFill(db, sid);
  if (!s || s.form_id !== id) return new Response("Not found.", { status: 404 });
  const pdf = await fillPdf(db, s);
  if (!pdf) return new Response("Not found.", { status: 404 });
  return new Response(pdf as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="copy-${sid.slice(0, 8)}.pdf"`, "cache-control": "private, no-store" } });
}
