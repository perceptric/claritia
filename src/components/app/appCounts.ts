"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { inboundDots } from "@/lib/nav";
import { must, useQuery } from "./ui";

export type AppCounts = {
  sidebar: Partial<Record<string, number>>;
  /** The small amber dot on Routing while Assignment's Action required has something. */
  dots: Partial<Record<string, boolean>>;
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
        /** From 093: teammates with no working calendar, and the routing draft and pause. */
        no_calendar?: number;
        routing_draft?: boolean;
        routing_paused?: boolean;
        /** From 094: what Routing › Assignment lists under Action required. */
        routing_action?: number;
      };
      return {
        sidebar: { "routing/review": r.review, scheduling: r.meetings_today },
        dots: inboundDots(r),
        start: { calendars: r.calendars, types: r.types, liveForms: r.live_forms, routing: r.routing, members: r.members, invites: r.invites, sources: r.sources },
      };
    },
    { staleMs: 30_000 },
  );
}

