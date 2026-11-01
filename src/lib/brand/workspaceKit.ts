import type { SupabaseClient } from "@supabase/supabase-js";

// The workspace's brand kit (docs/brand-capture.md): the one it set as its brand (workspaces.brand_kit_id), else its
// oldest kit with a look. Booking pages, the meeting editor and new forms all read it here, so they match.

export async function workspaceKit<T extends { tokens: Record<string, unknown> | null }>(sb: SupabaseClient, ws: string, cols: string): Promise<{ data: T[]; error: null }> {
  const [w, kits] = await Promise.all([sb.from("workspaces").select("brand_kit_id").eq("id", ws).maybeSingle(), sb.from("brand_kits").select(`id, ${cols}`).eq("workspace_id", ws).order("created_at")]);
  const list = (kits.data ?? []) as unknown as (T & { id: string })[];
  const set = (w.data as { brand_kit_id: string | null } | null)?.brand_kit_id;
  const kit = list.find((k) => k.id === set) ?? list.find((k) => k.tokens && Object.keys(k.tokens).length) ?? list[0];
  return { data: kit ? [kit] : [], error: null };
}
