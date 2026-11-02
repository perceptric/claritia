import { appBase } from "@/lib/billing";
import { notReady, sendReady } from "@/lib/email/ready";
import { extractLinks } from "@/lib/email/track";
import { allowed } from "@/lib/forms/server";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { addressesOf, shareEmail } from "@/lib/share/shareEmail";
import { linkBase } from "@/lib/domains/server";

// Share › Email › Send the link (docs/sharing-plan.md): one short email from the team with the form's link, to up to
// 50 addresses. POST { workspaceId, formId, to: string[], message? }. It goes through the send pipeline like every
// email: the From domain must be verified, a pause stops it, and suppressed or bounced addresses are skipped. The same
// address twice gets it once (email_queue_to, 117).

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; formId?: unknown; to?: unknown; message?: unknown };
  const ws = typeof b.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(b.workspaceId) ? b.workspaceId : null;
  if (!ws || !(await roleIn(auth, ws))) return bad("Workspace not found.", 404);
  if (typeof b.formId !== "string" || !/^[0-9a-f-]{36}$/.test(b.formId)) return bad("Form not found.", 404);
  const to = addressesOf(b.to);
  if (!to) return bad("Add up to 50 email addresses, one per line or separated by commas.");
  // A few sends a minute per workspace, so a mistake can't send hundreds.
  if (!allowed(`share-email:${ws}`, 5)) return bad("Too many sends at once. Try again in a minute.", 429);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const { data: form } = await db.from("forms").select("id, name, status, slug, draft").eq("id", b.formId).eq("workspace_id", ws).maybeSingle();
  const f = form as { id: string; name: string; status: string; slug: string | null; draft: { share?: { title?: string } } | null } | null;
  if (!f) return bad("Form not found.", 404);
  if (f.status !== "live") return bad("Publish the form first.", 409);
  const no = notReady(await sendReady(db, ws));
  if (no) return no;
  const [{ data: wsRow }, base] = await Promise.all([db.from("workspaces").select("booking_slug").eq("id", ws).maybeSingle(), linkBase(db, ws).catch(() => null)]);
  const wsSlug = (wsRow as { booking_slug: string | null } | null)?.booking_slug;
  // The form's ending on the workspace's own domain when it has one, else on Claritia's address; the id link without one.
  const link = f.slug && base ? `${base}/${f.slug}` : f.slug && wsSlug ? `${appBase()}/f/${wsSlug}/${f.slug}` : `${appBase()}/f/${f.id}`;
  const mail = shareEmail({ name: f.draft?.share?.title || f.name, link, message: typeof b.message === "string" ? b.message.slice(0, 1000) : "", button: "Open the form" });
  const { data: emailId, error: e1 } = await db.rpc("email_create", { p_ws: ws, p_user: auth.user.id, p_values: { kind: "one_to_one", name: `Share: ${f.name}`.slice(0, 200), subject: mail.subject, preheader: "", html: mail.html, text: mail.text, links: extractLinks(mail.html), marketing: true } });
  if (e1) return bad(e1.message, 500);
  const { data: queued, error: e2 } = await db.rpc("email_queue_to", { p_email: emailId, p_to: to });
  if (e2) return bad(/function .* does not exist|Could not find the function/i.test(e2.message) ? "This isn't set up on the server yet." : e2.message, 500);
  return Response.json({ ok: true, queued: queued as number });
}
