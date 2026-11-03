import { isMember } from "@/lib/contacts/server";
import { readSystem } from "@/lib/design/model";
import { cleanTokens } from "@/lib/forms/brand";
import { requireUser } from "@/lib/serverAuth";
import { serviceClient } from "@/lib/serviceClient";

// Save a design system's draft (docs/design-system.md Part 8). POST { workspaceId, kitId, design, rev } →
// { rev, design } with the design as it was saved (checked by readSystem), or 409 { error, rev, design } when someone
// saved since `rev`, so the editor can show their change instead of overwriting it.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX = 400_000;

export async function POST(request: Request) {
  const auth = await requireUser(request);
  if ("denied" in auth) return auth.denied;
  const text = await request.text();
  if (text.length > MAX + 2000) return Response.json({ error: "That design is too big." }, { status: 413 });
  const b = (JSON.parse(text || "{}") ?? {}) as { workspaceId?: unknown; kitId?: unknown; design?: unknown; rev?: unknown };
  if (!(await isMember(auth, b.workspaceId))) return Response.json({ error: "Workspace not found." }, { status: 404 });
  if (typeof b.kitId !== "string" || !UUID.test(b.kitId) || !Number.isInteger(b.rev)) return Response.json({ error: "Bad request." }, { status: 400 });
  const db = serviceClient();
  if (!db) return Response.json({ error: "The server is not set up for this." }, { status: 500 });
  const { data: kit } = await db.from("brand_kits").select("id, tokens, design, design_rev").eq("id", b.kitId).eq("workspace_id", b.workspaceId as string).maybeSingle();
  if (!kit) return Response.json({ error: "Design system not found." }, { status: 404 });
  const design = readSystem(b.design, cleanTokens(kit.tokens).tokens);
  if (JSON.stringify(design).length > MAX) return Response.json({ error: "That design is too big." }, { status: 413 });
  const { data, error } = await db.rpc("brand_kit_design_save", { p_user: auth.user.id, p_id: kit.id, p_design: design, p_rev: b.rev });
  if (error) {
    if (/Changed elsewhere/.test(error.message)) return Response.json({ error: "Someone else changed these styles. Their version is loaded.", rev: kit.design_rev, design: readSystem(kit.design, cleanTokens(kit.tokens).tokens) }, { status: 409 });
    return Response.json({ error: "Try again in a moment." }, { status: 503 });
  }
  return Response.json({ rev: data as number, design });
}
