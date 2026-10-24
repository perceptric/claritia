import { allowed, clientIp, cors, json, loadPublic } from "@/lib/forms/server";
import { allFields, hideKeyOf } from "@/lib/forms/schema";
import { knownForEmail } from "@/lib/enrich/server";
import { serviceClient } from "@/lib/serviceClient";

// Fill before submit (docs/enrich-workflows-reports.md 1.2 B). <claritia-form> asks when the visitor leaves the
// email field: which of the fields the owner chose does enrichment already know? The answer is field ids only, never
// a value, so nobody can use a form to look people up. Only live forms with the setting on; 10 a minute per visitor
// and 5 a minute per form at most (300 an hour). Slow or failing, it answers with none and the form stays whole.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ known: [] }, 404);
  const ip = clientIp(request);
  if (!allowed(`known:ip:${id}:${ip}`, 10) || !allowed(`known:form:${id}`, 5)) return json({ known: [] }, 429, { "Retry-After": "60" });
  const b = (await request.json().catch(() => ({}))) as { email?: unknown };
  const email = typeof b.email === "string" ? b.email.trim().slice(0, 254) : "";
  const db = serviceClient();
  if (!email || !db) return json({ known: [] });
  try {
    const f = await loadPublic(db, id, true);
    const e = f?.body.enrich;
    if (!f || f.status !== "live" || !e?.hideKnown || !e.fields.length) return json({ known: [] });
    const fields = allFields(f.body).filter((x) => e.fields.includes(hideKeyOf(x.key)));
    if (!fields.length) return json({ known: [] });
    const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args);
    const keys = await knownForEmail(rpc, f.workspace_id, email, [...new Set(fields.map((x) => hideKeyOf(x.key)))], { budgetMs: 1500 });
    return json({ known: fields.filter((x) => keys.includes(hideKeyOf(x.key))).map((x) => x.id) });
  } catch {
    return json({ known: [] });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
