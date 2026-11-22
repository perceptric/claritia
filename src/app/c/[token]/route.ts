import { botRequest } from "@/lib/email/bots";
import { linkKey, readClick } from "@/lib/email/track";
import { serviceClient } from "@/lib/serviceClient";

// Tracked links in email (docs/marketing-platform.md M3 "Tracking"). The signature covers the message and the URL,
// so this never sends anyone to a page the email didn't link to. The person always gets their redirect; a failed
// click write never stops it.

type Ctx = { params: Promise<{ token: string }> };

async function handle(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const url = new URL(request.url).searchParams.get("u") ?? "";
  let id: string | null = null;
  try {
    id = readClick(token, url, linkKey());
  } catch {
    id = null;
  }
  if (!id) return new Response("This link doesn't work.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const db = serviceClient();
  if (db) {
    const ua = request.headers.get("user-agent");
    await Promise.race([
      Promise.resolve(db.rpc("email_click", { p_message: id, p_url: url, p_bot: botRequest(request.method, ua), p_user_agent: ua })).catch(() => null),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  }
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

export const GET = handle;
export const HEAD = handle;
