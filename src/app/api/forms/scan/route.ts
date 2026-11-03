import { isMember } from "@/lib/contacts/server";
import { after } from "next/server";
import { writeKitBook } from "@/lib/brand/bookServer";
import { fetchHome, quickFrom } from "@/lib/brand/fetchSite";
import { hostIsPrivate } from "@/lib/privateNet";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Read a site's brand into a brand kit: POST { workspaceId, url, kitId?, formId? } (docs/brand-capture.md). The quick
// read fills the kit within seconds; the deep read and the brand book follow in the background, then the runner's
// browser scan fills anything left. A form with no kit yet takes the new one; the workspace's first kit is its brand.

export const maxDuration = 300;
const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; url?: unknown; kitId?: unknown; formId?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const raw = typeof b.url === "string" ? b.url.trim() : "";
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return bad("Enter the site's address, like acme.com.");
  }
  if (!/^https?:$/.test(u.protocol) || u.username || !u.hostname.includes(".")) return bad("Enter the site's address, like acme.com.");
  if (await hostIsPrivate(u.hostname)) return bad("That address is on a private network.");
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);
  const { data, error } = await db.rpc("brand_scan_start", { p_user: auth.user.id, p_ws: b.workspaceId, p_url: u.href, p_kit: uuid(b.kitId), p_form: uuid(b.formId) });
  if (error) return bad(error.message);
  const kitId = data as string;
  // 1. The quick read (docs/brand-capture.md): the look from the home page and its stylesheets now, so the kit is
  // ready in seconds whatever the runner is doing.
  const home = await fetchHome(u.href).catch(() => null);
  const quick = home ? quickFrom(home) : null;
  if (quick && quick.found.length) {
    const saved = await db.rpc("brand_kit_quick", { p_kit: kitId, p_tokens: quick.tokens, p_logo_url: quick.logo });
    // Before 107 the function isn't there: save the look straight onto the kit, so it's never lost.
    if (saved.error) await db.from("brand_kits").update({ tokens: quick.tokens, ...(quick.logo ? { logo_url: quick.logo } : {}), scan_status: "done", updated_at: new Date().toISOString() }).eq("id", kitId);
  }
  // 2. The deep read and the brand book, after this answers: the rest of the site, every color, font, button and
  // word, and Claude's book from them. The runner's browser scan still follows and fills what the book left out.
  if (home) after(() => writeKitBook(db, b.workspaceId as string, kitId, home).then(() => undefined, () => undefined));
  return Response.json({ kitId, reading: !!home, ...(quick?.found.length ? { tokens: quick.tokens, found: quick.found } : {}), ...(quick?.logo ? { logo: quick.logo } : {}) });
}
