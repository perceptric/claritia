import { readToken } from "@/lib/email/track";
import { serviceClient } from "@/lib/serviceClient";

// An email's open pixel (152): count the message's first open, then answer a 1x1 clear GIF whatever happens, so a bad
// or old token never shows a broken image. HEAD (link checkers) counts nothing.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const gif = () => new Response(GIF, { status: 200, headers: { "Content-Type": "image/gif", "Content-Length": String(GIF.length), "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer" } });

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let t: ReturnType<typeof readToken> = null;
  try {
    t = readToken(token);
  } catch {
    t = null;
  }
  const db = serviceClient();
  if (t?.kind === "open" && db) await db.rpc("email_open", { p_message: t.message }).then(() => null, () => null);
  return gif();
}

export const HEAD = () => gif();
