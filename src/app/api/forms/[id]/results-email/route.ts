import { allowed, clientIp, cors, json } from "@/lib/forms/server";
import { serviceClient } from "@/lib/serviceClient";

// "Email my results" from <claritia-form> (docs/interactive-forms-plan.md Part 4): POST { submission, key }. Only the
// browser that sent the fill has its key; the result goes to the contact's own address, once (form_results_request).

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = /^[A-Za-z0-9_-]{16,64}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  if (!allowed(`results:${clientIp(request)}`, 5)) return json({ error: "Too many tries. Wait a minute." }, 429, { "Retry-After": "60" });
  const b = (await request.json().catch(() => ({}))) as { submission?: unknown; key?: unknown };
  if (typeof b.submission !== "string" || !ID.test(b.submission) || typeof b.key !== "string" || !KEY.test(b.key)) return json({ error: "Bad request." }, 400);
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const { data, error } = await db.rpc("form_results_request", { p_form: id, p_sid: b.submission, p_key: b.key });
  if (error) return json({ error: "Try again in a moment." }, 503);
  if (data === "queued") return json({ ok: true });
  return json({ error: data === "no_email" ? "We don't have an email for this." : "Couldn't find your result." }, data === "not_found" ? 404 : 409);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
