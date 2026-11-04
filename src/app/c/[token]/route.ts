import { looksLikeScanner, readToken } from "@/lib/email/track";
import { serviceClient } from "@/lib/serviceClient";
import { appBase } from "@/lib/billing";
import { linkBase } from "@/lib/domains/server";
import { isFormLink, personalLink, personalToken } from "@/lib/share/personal";
import type { SupabaseClient } from "@supabase/supabase-js";

// A tracked link in an email: log the click, then send the reader on. A bad token or a missing link goes to the
// marketing site rather than an error page. A link to one of the workspace's forms opens as the reader's personal link
// (docs/sharing-plan.md): the form fills in what's known about them, and the fill counts as Email. Anything that goes
// wrong there sends them to the plain link.
async function go(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const home = `https://${process.env.SITE_HOST?.trim() || "tryclaritia.com"}`;
  let t: ReturnType<typeof readToken> = null;
  try {
    t = readToken(token);
  } catch {
    t = null;
  }
  const db = serviceClient();
  if (!t || t.kind !== "click" || !db) return Response.redirect(home, 302);
  const ua = request.headers.get("user-agent");
  const { data } = await db.rpc("email_click", { p_message: t.message, p_link: t.link, p_human: !looksLikeScanner(request.method, ua), p_data: { ua: (ua ?? "").slice(0, 200) } });
  const plain = typeof data === "string" && /^https?:\/\//i.test(data) ? data : home;
  const url = plain === home ? home : await personal(db, t.message, plain).catch(() => plain);
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

/** The link made personal for the message's reader when it goes to one of their workspace's forms. */
async function personal(db: SupabaseClient, message: string, url: string): Promise<string> {
  const secret = process.env.SECRETS_KEY;
  if (!secret) return url;
  const appHost = new URL(appBase()).hostname;
  // Cheap first: only a Claritia address, or another host that could be the workspace's own link domain.
  const host = new URL(url).hostname;
  if (host === appHost && !isFormLink(url, { appHost })) return url;
  const { data } = await db.from("email_messages").select("workspace_id, contact_id, to_email").eq("id", message).maybeSingle();
  const m = data as { workspace_id: string; contact_id: string | null; to_email: string } | null;
  if (!m) return url;
  const own = host === appHost ? null : ((await linkBase(db, m.workspace_id).catch(() => null)) ?? "").replace(/^https?:\/\//, "") || null;
  if (!isFormLink(url, { appHost, ownHost: own })) return url;
  return personalLink(url, personalToken({ ws: m.workspace_id, contact: m.contact_id, email: m.to_email }, secret), "email");
}

export const GET = go;
export const HEAD = go;
