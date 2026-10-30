import { cleaningCtx } from "@/lib/contacts/server";
import { allowed, clientIp, cors, edgeCountry, json, loadPublic, turnstileOk } from "@/lib/forms/server";
import { acceptFill, qaOk, type Incoming } from "@/lib/forms/submit";
import { serviceClient } from "@/lib/serviceClient";

// A fill from <claritia-form> (docs/form-builder.md Part 2). Checks everything again, then form_submit saves the
// submission, the contact, the consent and one delivery per destination in one transaction. The same idem key
// sent again answers with the first submission (and, for Claritia calendar, the same booking token).

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
    const r = await acceptFill((fn, args) => db.rpc(fn, args), f, raw, ctx, {
      country: edgeCountry(request),
      turnstileFailed,
      origin: request.headers.get("origin"),
      ownHost: request.headers.get("x-forwarded-host") ?? request.headers.get("host"),
      test: qaOk(id, raw.qa, process.env.SECRETS_KEY),
      // Signs the booking token when the form books with Claritia calendar.
      secret: process.env.SECRETS_KEY,
    });
    return json(r.body, r.status);
  } catch {
    return json({ error: "Try again in a moment." }, 503);
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
