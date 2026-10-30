import { appBase } from "@/lib/billing";
import { readEmailDoc } from "@/lib/design/email/doc";
import { compileWithKit, loadKits } from "@/lib/design/email/server";
import { extractLinks } from "@/lib/email/track";
import { rpcOr } from "@/lib/rpcCompat";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

type Db = NonNullable<ReturnType<typeof serviceClient>>;
type Ready = { from_email: string | null; paused: boolean; verified: boolean };

// Settings › Sending › Send test: one email to the member who asked, through the whole pipeline (guard, tracked
// link, footer, one-click unsubscribe). POST { workspaceId }. The email builder's Test sends the email being built:
// POST { workspaceId, subject, doc }, compiled with its brand kit's draft styles.
//
// Round trips: whether sending is ready (one call, email_test_ready) and the brand kit are read together, then the
// email is made and queued in one call (email_test_send). Both are always read fresh: a pause or a new From address
// counts at once.

/** The From address, the pause, and whether the From domain is verified. */
async function ready(db: Db, ws: string): Promise<Ready> {
  const r = await rpcOr<Ready>((fn, args) => db.rpc(fn, args), "email_test_ready", { p_ws: ws }, async () => {
    const { data: s, error } = await db.from("send_settings").select("from_email, from_name, address, paused").eq("workspace_id", ws).maybeSingle();
    if (error) return { data: null, error };
    if (!s?.from_email) return { data: { from_email: null, paused: false, verified: false }, error: null };
    const { data: domain } = await db.rpc("verified_domain_for", { p_ws: ws, p_email: s.from_email });
    return { data: { from_email: s.from_email as string, paused: !!s.paused, verified: !!(domain as { id?: string } | null)?.id }, error: null };
  }, { anyError: true });
  if (r.error) throw new Error(r.error.message);
  return r.data ?? { from_email: null, paused: false, verified: false };
}

/** Make the test email and queue it to the asker, as one call (or the two old calls before the migration). */
async function send(db: Db, ws: string, user: string, values: Record<string, unknown>) {
  return rpcOr<string>((fn, args) => db.rpc(fn, args), "email_test_send", { p_ws: ws, p_user: user, p_values: values }, async () => {
    const { data: emailId, error: e1 } = await db.rpc("email_create", { p_ws: ws, p_user: user, p_values: values });
    if (e1) return { data: null, error: e1 };
    const { data: messageId, error: e2 } = await db.rpc("email_queue_test", { p_email: emailId, p_user: user });
    return { data: (messageId as string | null) ?? null, error: e2 };
  });
}

const refusal = (s: Ready) =>
  !s.from_email
    ? Response.json({ error: "Add a From address first." }, { status: 409 })
    : s.paused
      ? Response.json({ error: "Sending is paused." }, { status: 409 })
      : !s.verified
        ? Response.json({ error: `${s.from_email.split("@")[1]} isn't a verified sending domain yet.` }, { status: 409 })
        : null;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; subject?: unknown; doc?: unknown };
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : null;
  if (!ws) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const role = await roleIn(auth, ws);
  if (!role) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });

  if (body.doc && typeof body.doc === "object") {
    const doc = readEmailDoc(body.doc, { allowHtml: role === "owner" });
    const [s, kits] = await Promise.all([ready(db, ws), loadKits(db, ws, [doc.kitId])]);
    const no = refusal(s);
    if (no) return no;
    let built;
    try {
      built = compileWithKit(doc, kits, "draft");
    } catch {
      return Response.json({ error: "This email couldn't be built." }, { status: 400 });
    }
    const blocked = built.notes.find((n) => n.level === "block");
    if (blocked) return Response.json({ error: blocked.text }, { status: 400 });
    const subject = typeof body.subject === "string" && body.subject.trim() ? `[Test] ${body.subject.trim().slice(0, 190)}` : "[Test] Email";
    const { data: messageId, error } = await send(db, ws, auth.user.id, { kind: "test", name: "Test", subject, preheader: doc.settings.preheader, html: built.html, text: built.text, links: extractLinks(built.html), marketing: true });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, messageId });
  }

  const s = await ready(db, ws);
  const no = refusal(s);
  if (no) return no;
  const from = s.from_email!;
  const site = appBase();
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fafafa"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;padding:32px;font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#0c0c0b">
<p style="margin:0 0 16px;font-size:20px;font-weight:600">Sending works</p>
<p style="margin:0 0 24px">This test came from ${from} through Claritia. The button below is a tracked link, and the footer has the unsubscribe link mail apps show as a button.</p>
<p style="margin:0"><a href="${site}/settings" style="display:inline-block;background:#266df0;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Open Claritia</a></p>
</div></body></html>`;
  const text = `Sending works\n\nThis test came from ${from} through Claritia.\n\nOpen Claritia: ${site}/settings\n`;
  const { data: messageId, error } = await send(db, ws, auth.user.id, { kind: "test", name: "Test", subject: "Test email from Claritia", preheader: "Sending works.", html, text, links: extractLinks(html), marketing: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, messageId });
}
