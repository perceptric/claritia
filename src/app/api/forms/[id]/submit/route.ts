import { cleaningCtx } from "@/lib/contacts/server";
import { allowed, clientIp, cors, edgeCountry, json, loadPublic, turnstileOk } from "@/lib/forms/server";
import { prepareSubmit, type Incoming } from "@/lib/forms/submit";
import { serviceClient } from "@/lib/serviceClient";

// A fill from <claritia-form> (docs/form-builder.md Part 2). Checks everything again, then form_submit saves the
// submission, the contact, the consent and one delivery per destination in one transaction. The same idem key
// sent again answers with the first submission.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_BODY = 64 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const ip = clientIp(request);
  if (!allowed(`ip:${id}:${ip}`, 10) || !allowed(`form:${id}`, 600)) return json({ error: "Too many tries. Wait a minute and send again." }, 429, { "Retry-After": "60" });
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "That's too much text." }, 413);
  let raw: Incoming;
  try {
    raw = JSON.parse(text) as Incoming;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  try {
    const f = await loadPublic(db, id, true);
    if (!f || f.status !== "live") return json({ error: "This form isn't taking answers." }, 410);
    const ctx = await cleaningCtx(db, f.workspace_id);
    const turnstileFailed = f.body.spam.turnstile ? !(await turnstileOk(raw.turnstile, ip)) : false;
    const r = prepareSubmit(f.body, f.version, raw, ctx, { country: edgeCountry(request), turnstileFailed });
    if ("errors" in r) return json({ errors: r.errors }, 400);
    if ("error" in r) return json({ error: r.error }, r.status);
    const { data, error } = await db.rpc("form_submit", { p_form: id, ...r.args, p_test: false });
    if (error) {
      if (/isn't taking answers|Unknown form version/.test(error.message)) return json({ error: "This form changed. Refresh the page and try again." }, 409);
      // Retryable: the browser keeps the fill and sends it again with the same key.
      return json({ error: "Try again in a moment." }, 503);
    }
    return json({ id: (data as { id: string }).id });
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
