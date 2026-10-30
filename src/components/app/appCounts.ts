"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { must, useQuery } from "./ui";

export type AppCounts = {
  sidebar: Partial<Record<string, number>>;
  start: { calendars: number; types: number; liveForms: number; routing: boolean; members: number; invites: number; sources: number };
};

/**
 * The sidebar counts and Get started's checks, in one call (`app_counts:<workspace>`). Screens that change one of
 * them (a lead marked contacted, a meeting type made) invalidate "app_counts".
 */
export function useAppCounts(sb: SupabaseClient, ws: string | null) {
  return useQuery<AppCounts>(
    ws ? `app_counts:${ws}` : null,
    async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);
      const r = must(await sb.rpc("app_counts", { p_ws: ws, p_day_from: start.toISOString(), p_day_to: end.toISOString() })) as {
        review: number;
        meetings_today: number;
        calendars: number;
        types: number;
        live_forms: number;
        routing: boolean;
        members: number;
        invites: number;
        sources: number;
      };
      return {
        sidebar: { "routing/review": r.review, meetings: r.meetings_today },
        start: { calendars: r.calendars, types: r.types, liveForms: r.live_forms, routing: r.routing, members: r.members, invites: r.invites, sources: r.sources },
      };
    },
    { staleMs: 30_000 },
  );
}
