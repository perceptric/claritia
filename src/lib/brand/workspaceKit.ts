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

type Rows<T> = { data: T[] | null; error: { message: string } | null };

/** The workspace's brand among its kits: the one it set, else the oldest with a look, else the oldest. */
export function brandOf<T extends { id: string; tokens?: unknown }>(list: T[], set: string | null | undefined): T | undefined {
  return list.find((k) => k.id === set) ?? list.find((k) => !!k.tokens && typeof k.tokens === "object" && Object.keys(k.tokens).length > 0) ?? list[0];
}

/** Every kit the workspace has, its brand first, so screens that fall back to "the first kit" all show the brand. */
export async function kitsBrandFirst<T = Record<string, unknown>>(sb: SupabaseClient, ws: string, cols: string): Promise<Rows<T>> {
  const select = /(^|,\s*)id(\s*,|$)/.test(cols) ? cols : `id, ${cols}`;
  const [w, kits] = await Promise.all([sb.from("workspaces").select("brand_kit_id").eq("id", ws).maybeSingle(), sb.from("brand_kits").select(select).eq("workspace_id", ws).order("created_at")]);
  if (kits.error) return { data: null, error: kits.error };
  const list = (kits.data ?? []) as unknown as { id: string; tokens?: unknown }[];
  const head = brandOf(list, (w.data as { brand_kit_id: string | null } | null)?.brand_kit_id);
  return { data: (head ? [head, ...list.filter((k) => k !== head)] : list) as unknown as T[], error: null };
}
