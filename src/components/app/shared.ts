"use client";

// Data many screens read, each under one cache key so it's fetched once and shared: teammates, the live routing
// version, the workspace's forms. A screen that changes one invalidates its key ("workspace_people", "router_live").

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RouterBody } from "@/lib/router/types";
import { cached, must, useQuery } from "./ui";

export type WsPerson = { id: string; email: string; role: "owner" | "member" };

/** The workspace's members (the workspace_people call), shared by every screen. */
export const workspacePeople = (sb: SupabaseClient, ws: string) =>
  cached(`workspace_people:${ws}`, async () => (must(await sb.rpc("workspace_people", { p_ws: ws })) ?? []) as WsPerson[], 60_000);

export type LiveBody = { version: number; body: RouterBody } | null;

/** The live routing version's number and body, or null when nothing is published (one call, router_live). */
export const liveBody = (sb: SupabaseClient, ws: string) =>
  cached(`router_live:${ws}`, async (): Promise<LiveBody> => (must(await sb.rpc("router_live_screen", { p_ws: ws })) as LiveBody) ?? null);

export function useLiveBody(sb: SupabaseClient, ws: string) {
  return useQuery<LiveBody>(`router_live:${ws}`, async () => (must(await sb.rpc("router_live_screen", { p_ws: ws })) as LiveBody) ?? null);
}

/** Each site's health (site_health), shared by Visitors, Sites and Identity (`site_health:<workspace>`). */
export function useSiteHealth<T>(sb: SupabaseClient, ws: string) {
  return useQuery<T[]>(`site_health:${ws}`, async () => (must(await sb.rpc("site_health", { p_ws: ws })) ?? []) as T[]);
}

/** Form names by id, for the routing log and its run panel. */
export function useFormNames(sb: SupabaseClient, ws: string) {
  return useQuery<Record<string, string>>(`form_names:${ws}`, async () =>
    Object.fromEntries(((must(await sb.from("forms").select("id, name").eq("workspace_id", ws)) ?? []) as { id: string; name: string }[]).map((f) => [f.id, f.name])),
  );
}
