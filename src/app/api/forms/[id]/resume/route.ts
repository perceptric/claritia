import { randomBytes } from "node:crypto";
import { allowed, clientIp, cors, json, loadPublic } from "@/lib/forms/server";
import { enqueueJob } from "@/lib/jobs";
import { serviceClient } from "@/lib/serviceClient";

// "Save and finish later" (docs/form-kinds-plan.md step 3). POST { email, answers, step, page } saves the fill and
// emails a link (the form_resume job); GET ?t=<token> gives the answers and step back to the form that opens it. Only
// a live form that has "Save and finish later" on takes saves. The answers are checked again when the form is sent.

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY = 64 * 1024;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return json({ error: "Form not found." }, 404);
  const ip = clientIp(request);
  if (!allowed(`resume:${id}:${ip}`, 5) || !allowed(`resume:${id}`, 100)) return json({ error: "Too many tries. Wait a minute." }, 429, { "Retry-After": "60" });
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "That's too much text." }, 413);
  let b: { email?: unknown; answers?: unknown; step?: unknown; page?: unknown };
  try {
    b = JSON.parse(text) as typeof b;
  } catch {
    return json({ error: "Bad request." }, 400);
  }
  const email = typeof b.email === "string" ? b.email.trim().slice(0, 320) : "";
  if (!EMAIL.test(email)) return json({ error: "Enter a valid email." }, 400);
  const answers = b.answers && typeof b.answers === "object" && !Array.isArray(b.answers) ? (b.answers as Record<string, unknown>) : {};
  if (Object.keys(answers).length > 80) return json({ error: "Bad request." }, 400);
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const f = await loadPublic(db, id).catch(() => null);
  if (!f || f.status !== "live" || !f.body.resume) return json({ error: "This form can't be saved for later." }, 410);
  // Only answers to this form's own questions are kept.
  const ids = new Set(f.body.steps.flatMap((s) => s.fields.map((x) => x.id)));
  const kept = Object.fromEntries(Object.entries(answers).filter(([k]) => ids.has(k)));
  let page: string | null = null;
  try {
    const u = typeof b.page === "string" ? new URL(b.page) : null;
    if (u && /^https?:$/.test(u.protocol)) {
      u.searchParams.delete("clr_resume");
      page = u.href.slice(0, 1000);
    }
  } catch {}
  const step = Math.min(Math.max(Math.round(Number(b.step) || 0), 0), Math.max(f.body.steps.length - 1, 0));
  const token = randomBytes(24).toString("base64url");
  const { data, error } = await db.rpc("form_draft_save", { p_form: id, p_token: token, p_email: email, p_answers: kept, p_step: step, p_page: page });
  if (error) return json({ error: /Too many/.test(error.message) ? "Too many saves. Try again later." : "Try again in a moment." }, /Too many/.test(error.message) ? 429 : 503);
  await enqueueJob((fn, args) => db.rpc(fn, args), { workspaceId: f.workspace_id, kind: "form_resume", key: `form_resume:${data as string}`, payload: { draft: data } }).catch(() => undefined);
  return json({ ok: true });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = new URL(request.url).searchParams.get("t") ?? "";
  if (!ID.test(id) || !/^[A-Za-z0-9_-]{24,64}$/.test(t)) return json({ error: "Not found." }, 404);
  if (!allowed(`resume-get:${clientIp(request)}`, 30)) return json({ error: "Too many tries." }, 429, { "Retry-After": "60" });
  const db = serviceClient();
  if (!db) return json({ error: "Not set up." }, 503);
  const { data } = await db.rpc("form_draft_get", { p_form: id, p_token: t });
  const d = data as { answers?: Record<string, unknown>; step?: number } | null;
  if (!d) return json({ error: "This link has run out. Start the form again." }, 404);
  return json({ answers: d.answers ?? {}, step: d.step ?? 0 });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: cors });
}
