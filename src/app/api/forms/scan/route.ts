import { isMember } from "@/lib/contacts/server";
import { hostIsPrivate } from "@/lib/privateNet";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Scan a site into a brand kit: POST { workspaceId, url, kitId?, formId? } (docs/form-builder.md 5.1). The runner
// picks the job up; the app watches the kit's scan_status. A form with no kit yet takes the new one.

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
  return Response.json({ kitId: data as string });
}
