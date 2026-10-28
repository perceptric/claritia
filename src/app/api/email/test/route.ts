import { appBase } from "@/lib/billing";
import { readEmailDoc } from "@/lib/design/email/doc";
import { compileWithKit, loadKits } from "@/lib/design/email/server";
import { extractLinks } from "@/lib/email/track";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Settings › Sending › Send test: one email to the member who asked, through the whole pipeline (guard, tracked
// link, footer, one-click unsubscribe). POST { workspaceId }. The email builder's Test sends the email being built:
// POST { workspaceId, subject, doc }, compiled with its brand kit's draft styles.
export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const body = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; subject?: unknown; doc?: unknown };
  const ws = typeof body.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(body.workspaceId) ? body.workspaceId : null;
  if (!ws) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const { data: member } = await auth.sb.from("workspace_members").select("role").eq("workspace_id", ws).eq("user_id", auth.user.id).maybeSingle();
  if (!member) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });

  const { data: s } = await db.from("send_settings").select("from_email, from_name, address, paused").eq("workspace_id", ws).maybeSingle();
  if (!s?.from_email) return Response.json({ error: "Add a From address first." }, { status: 409 });
  if (s.paused) return Response.json({ error: "Sending is paused." }, { status: 409 });
  const { data: domain } = await db.rpc("verified_domain_for", { p_ws: ws, p_email: s.from_email });
  if (!(domain as { id?: string } | null)?.id) return Response.json({ error: `${s.from_email.split("@")[1]} isn't a verified sending domain yet.` }, { status: 409 });

  if (body.doc && typeof body.doc === "object") {
    const doc = readEmailDoc(body.doc, { allowHtml: member.role === "owner" });
    let built;
    try {
      built = compileWithKit(doc, await loadKits(db, ws), "draft");
    } catch {
      return Response.json({ error: "This email couldn't be built." }, { status: 400 });
    }
    const blocked = built.notes.find((n) => n.level === "block");
    if (blocked) return Response.json({ error: blocked.text }, { status: 400 });
    const subject = typeof body.subject === "string" && body.subject.trim() ? `[Test] ${body.subject.trim().slice(0, 190)}` : "[Test] Email";
    const { data: emailId, error: e1 } = await db.rpc("email_create", {
      p_ws: ws,
      p_user: auth.user.id,
      p_values: { kind: "test", name: "Test", subject, preheader: doc.settings.preheader, html: built.html, text: built.text, links: extractLinks(built.html), marketing: true },
    });
    if (e1) return Response.json({ error: e1.message }, { status: 500 });
    const { data: messageId, error: e2 } = await db.rpc("email_queue_test", { p_email: emailId, p_user: auth.user.id });
    if (e2) return Response.json({ error: e2.message }, { status: 500 });
    return Response.json({ ok: true, messageId });
  }

  const site = appBase();
  const html = `<!doctype html><html><body style="margin:0;padding:32px 16px;background:#fafafa"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #eaeaea;padding:32px;font:15px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#0c0c0b">
<p style="margin:0 0 16px;font-size:20px;font-weight:600">Sending works</p>
<p style="margin:0 0 24px">This test came from ${s.from_email} through Claritia. The button below is a tracked link, and the footer has the unsubscribe link mail apps show as a button.</p>
<p style="margin:0"><a href="${site}/settings" style="display:inline-block;background:#266df0;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px">Open Claritia</a></p>
</div></body></html>`;
  const text = `Sending works\n\nThis test came from ${s.from_email} through Claritia.\n\nOpen Claritia: ${site}/settings\n`;
  const { data: emailId, error: e1 } = await db.rpc("email_create", {
    p_ws: ws,
    p_user: auth.user.id,
    p_values: { kind: "test", name: "Test", subject: "Test email from Claritia", preheader: "Sending works.", html, text, links: extractLinks(html), marketing: true },
  });
  if (e1) return Response.json({ error: e1.message }, { status: 500 });
  const { data: messageId, error: e2 } = await db.rpc("email_queue_test", { p_email: emailId, p_user: auth.user.id });
  if (e2) return Response.json({ error: e2.message }, { status: 500 });
  return Response.json({ ok: true, messageId });
}
