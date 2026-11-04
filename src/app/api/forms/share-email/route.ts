import { notReady, sendReady } from "@/lib/email/ready";
import { extractLinks } from "@/lib/email/track";
import { allowed } from "@/lib/forms/server";
import { requireUser, roleIn } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";
import { addressesOf, MAX_TO, shareEmail } from "@/lib/share/shareEmail";
import { formLink } from "@/lib/share/formLink";
import { viaLink } from "@/lib/share/channels";

// Share › Email › Send the link (docs/sharing-plan.md): one short email with the form's link, to up to 200 addresses,
// from the team or from the person sending it (their name on the team's address). POST { workspaceId, formId,
// to: string[], message?, subject?, from?: "me" | "team" }. The email remembers its form (125) so Share shows where
// each person is. It goes through the send pipeline like every
// email: the From domain must be verified, a pause stops it, and suppressed or bounced addresses are skipped. The same
// address twice gets it once (email_queue_to, 117).

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; formId?: unknown; to?: unknown; message?: unknown; subject?: unknown; from?: unknown };
  const ws = typeof b.workspaceId === "string" && /^[0-9a-f-]{36}$/.test(b.workspaceId) ? b.workspaceId : null;
  if (!ws || !(await roleIn(auth, ws))) return bad("Workspace not found.", 404);
  if (typeof b.formId !== "string" || !/^[0-9a-f-]{36}$/.test(b.formId)) return bad("Form not found.", 404);
  const to = addressesOf(b.to);
  if (!to) return bad(`Add up to ${MAX_TO} email addresses.`);
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
  // Tagged Email; each reader's click opens it as their own personal link (src/app/c/[token]/route.ts).
  const link = viaLink(await formLink(db, ws, f), "email");
  const mail = shareEmail({ name: f.draft?.share?.title || f.name, link, message: typeof b.message === "string" ? b.message.slice(0, 1000) : "", button: "Open the form", subject: typeof b.subject === "string" ? b.subject : "" });
  // From me: the sender's own name on the team's verified address; else the team's name as Settings has it.
  const fromName = b.from === "me" ? senderName(auth.user) : "";
  const { data: emailId, error: e1 } = await db.rpc("email_create", { p_ws: ws, p_user: auth.user.id, p_values: { kind: "one_to_one", name: `Share: ${f.name}`.slice(0, 200), subject: mail.subject, preheader: "", html: mail.html, text: mail.text, links: extractLinks(mail.html), marketing: true, from_name: fromName } });
  if (e1) return bad(e1.message, 500);
  // Before 125 there's no form_id: the email still goes, Share just can't follow it.
  await db.from("emails").update({ form_id: f.id }).eq("id", emailId as string).then(() => null, () => null);
  const { data: queued, error: e2 } = await db.rpc("email_queue_to", { p_email: emailId, p_to: to });
  if (e2) return bad(/function .* does not exist|Could not find the function/i.test(e2.message) ? "This isn't set up on the server yet." : e2.message, 500);
  return Response.json({ ok: true, queued: queued as number });
}

/** The sender's name for From: their profile's full name, else the part of their email before the @. */
function senderName(u: { email?: string | null; user_metadata?: Record<string, unknown> }): string {
  const m = u.user_metadata ?? {};
  const full = [m.full_name, m.name].find((x): x is string => typeof x === "string" && !!x.trim());
  return (full ?? (u.email ?? "").split("@")[0] ?? "").replace(/[\r\n<>"]/g, "").trim().slice(0, 80);
}
