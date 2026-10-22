import { isMember } from "@/lib/contacts/server";
import { cleanTokens, fixContrast } from "@/lib/forms/brand";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Save a brand kit: POST { workspaceId, id?, name, tokens, logoUrl? }. Every token is checked, and colors that
// visitors couldn't read are moved until they pass WCAG AA; the answer says what changed (docs/form-builder.md 5.2).

const bad = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const b = (await request.json().catch(() => ({}))) as { workspaceId?: unknown; id?: unknown; name?: unknown; tokens?: unknown; logoUrl?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return bad("Workspace not found.", 404);
  const db = serviceClient();
  if (!db) return bad("The server is not set up for this.", 500);
  const clean = cleanTokens(b.tokens);
  const fixed = fixContrast(clean.tokens);
  const logo = typeof b.logoUrl === "string" && /^https:\/\/[^\s]{4,990}$/.test(b.logoUrl.trim()) ? b.logoUrl.trim() : null;
  const { data, error } = await db.rpc("brand_kit_save", {
    p_user: auth.user.id,
    p_ws: b.workspaceId,
    p_id: typeof b.id === "string" && /^[0-9a-f-]{36}$/.test(b.id) ? b.id : null,
    p_name: typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 120) : "Brand",
    p_tokens: fixed.tokens,
    p_logo_url: logo,
    p_source_url: null,
    p_notes: fixed.notes,
    p_site: null,
    p_scanned: false,
  });
  if (error) return bad(error.message);
  return Response.json({ id: data as string, tokens: fixed.tokens, notes: fixed.notes });
}
