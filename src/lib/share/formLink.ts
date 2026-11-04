import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appBase } from "../billing.ts";
import { linkBase } from "../domains/server.ts";

// A form's link as Share gives it out (docs/sharing-plan.md): its ending on the workspace's own domain when it has
// one, else on Claritia's address, and the id link without an ending.

export async function formLink(db: SupabaseClient, ws: string, form: { id: string; slug: string | null }): Promise<string> {
  const [{ data: wsRow }, base] = await Promise.all([db.from("workspaces").select("booking_slug").eq("id", ws).maybeSingle(), linkBase(db, ws).catch(() => null)]);
  const wsSlug = (wsRow as { booking_slug: string | null } | null)?.booking_slug;
  return form.slug && base ? `${base}/${form.slug}` : form.slug && wsSlug ? `${appBase()}/f/${wsSlug}/${form.slug}` : `${appBase()}/f/${form.id}`;
}
