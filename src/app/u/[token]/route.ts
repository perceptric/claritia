import { simplePage } from "@/lib/email/pages";
import { linkKey, readUnsubscribeToken } from "@/lib/email/track";
import { serviceClient } from "@/lib/serviceClient";

// Unsubscribe links (docs/marketing-platform.md M3, RFC 8058). A POST unsubscribes at once: mail apps send
// "List-Unsubscribe=One-Click" from the List-Unsubscribe-Post header, and the page's button posts here too.
// A GET only shows the button, because mail scanners open links and must not unsubscribe anyone.

type Ctx = { params: Promise<{ token: string }> };

async function messageOf(ctx: Ctx) {
  const { token } = await ctx.params;
  try {
    return readUnsubscribeToken(token, linkKey());
  } catch {
    return null;
  }
}

const broken = () => simplePage("This link doesn't work", "Use the unsubscribe link in the latest email you got.", undefined, 404);

export async function GET(request: Request, ctx: Ctx) {
  const id = await messageOf(ctx);
  const db = serviceClient();
  if (!id || !db) return broken();
  const { data } = await db.from("email_messages").select("unsubscribed_at, workspaces(name)").eq("id", id).maybeSingle();
  if (!data) return broken();
  const name = (data.workspaces as { name?: string } | null)?.name ?? "this sender";
  if (data.unsubscribed_at) return simplePage("You're unsubscribed", `You won't get marketing email from ${name}.`);
  return simplePage("Unsubscribe?", `You'll stop getting marketing email from ${name}.`, { action: new URL(request.url).pathname, button: "Unsubscribe" });
}

export async function POST(_request: Request, ctx: Ctx) {
  const id = await messageOf(ctx);
  const db = serviceClient();
  if (!id || !db) return broken();
  const { data, error } = await db.rpc("email_unsubscribe", { p_message: id });
  if (error) return simplePage("Something went wrong", "Try the link again in a minute.", undefined, 500);
  if (!data) return broken();
  return simplePage("You're unsubscribed", `You won't get marketing email from ${(data as { workspace?: string }).workspace ?? "this sender"}.`);
}
