import { allFields } from "@/lib/forms/schema";
import { checkSms, codeAsked, e164, emailCode, emailCodeOk, proofFor, sendEmailCode, startSms } from "@/lib/forms/codes";
import { allowed, clientIp, cors, json, loadPublic } from "@/lib/forms/server";
import { serviceClient } from "@/lib/serviceClient";

// Email and phone codes (docs/fields-plan.md Part 3, src/lib/forms/codes.ts). POST { field, to } sends a code to the
// email or phone; POST { field, to, code } checks a typed one and answers { proof } for the send to carry.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const ip = clientIp(request);
  let b: { field?: unknown; to?: unknown; code?: unknown };
  try {
    b = (await request.json()) as typeof b;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const to = typeof b.to === "string" ? b.to.trim().slice(0, 320) : "";
  const checking = typeof b.code === "string";
  // Sending: 3 a minute from one address and 5 to one email or phone; checking: 10 tries a minute.
  if (!allowed(`code${checking ? "-check" : ""}:${id}:${ip}`, checking ? 10 : 3) || (!checking && !allowed(`code-to:${to.toLowerCase()}`, 5))) return json({ error: "Too many tries. Wait a minute." }, 429, { "Retry-After": "60" });
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const f = await loadPublic(db, id).catch(() => null);
  if (!f || f.status !== "live") return json({ error: "This form isn't taking answers." }, 410);
  const field = allFields(f.body).find((x) => x.id === b.field);
  if (!field || !codeAsked(field)) return json({ error: "This question doesn't use a code." }, 400);
  const phone = field.type === "phone" ? e164(to) : null;
  if (field.type === "email" && !EMAIL.test(to)) return json({ error: "Enter a valid email." }, 400);
  if (field.type === "phone" && !phone) return json({ error: "Enter the number with its country code, like +1 555 123 4567." }, 400);
  if (checking) {
    const code = String(b.code).replace(/\D/g, "");
    const ok = code.length === 6 && (field.type === "email" ? emailCodeOk(id, field, to, code) : await checkSms(phone!, code));
    return ok ? json({ proof: proofFor(id, field, to) }) : json({ error: "That code didn't match. Check it, or send a new one." }, 400);
  }
  const sent = field.type === "email" ? await sendEmailCode(to, emailCode(id, field, to), f.body.title || "") : await startSms(phone!);
  return sent ? json({ sent: true }) : json({ error: "The code didn't send. Try again in a moment." }, 503);
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
