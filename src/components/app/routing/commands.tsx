"use client";

// Routing's entries for the command bar (⌘K, docs/router-ux.md 4.10): pause or resume my new leads, test a route,
// open the log, and Held. ClientApp spreads these into its commands.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useState } from "react";
import { Branch, ListIcon, Pause, Play, Inbox } from "../../Icons";
import type { Command } from "../CommandBar";
import { tell } from "../Dialogs";
import { errorText, invalidate, useQuery, type ViewProps } from "../ui";
import { routingApi } from "./api";
import { ROUTING } from "./screenParts";
import { pausedMs } from "./screensModel";

export function useRoutingCommands({ sb, session, ws, navigate }: { sb: SupabaseClient; session: Session | null | undefined; ws: string | null; navigate: ViewProps["navigate"] }): Command[] {
  const me = session?.user.id ?? "";
  const rep = useQuery<string | null>(
    ws && me ? `routing_reps:${ws}:me:${me}` : null,
    async () => ((await sb.from("router_reps").select("paused_until").eq("workspace_id", ws!).eq("user_id", me).maybeSingle()).data as { paused_until: string | null } | null)?.paused_until ?? null,
    { staleMs: 60_000 },
  );
  const p = pausedMs(rep.data);
  const [now] = useState(() => Date.now());
  const paused = p !== null && p > now;

  if (!ws || !session) return [];
  const pause = async () => {
    try {
      await rep.mutate(
        () => (paused ? null : "infinity"),
        () => routingApi(session, ws, "rep", { user: me, patch: { paused_until: paused ? "" : "infinity" } }),
      );
      invalidate("routing_reps");
    } catch (e) {
      await tell("Couldn't change it", errorText(e));
    }
  };
  return [
    { id: "routing-pause", label: paused ? "Resume my new leads" : "Pause my new leads", group: "Routing", icon: paused ? <Play size={15} /> : <Pause size={15} />, run: () => void pause() },
    { id: "routing-test", label: "Routing policies", group: "Routing", icon: <Branch size={15} />, run: () => navigate(ROUTING, "") },
    { id: "routing-log", label: "Routing activity", group: "Routing", icon: <ListIcon size={15} />, run: () => navigate(ROUTING, "activity") },
    { id: "routing-held", label: "Leads that need review", group: "Routing", icon: <Inbox size={15} />, run: () => navigate(ROUTING, "activity/review") },
  ];
}
