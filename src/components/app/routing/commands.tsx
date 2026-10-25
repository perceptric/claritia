"use client";

// Routing's entries for the command bar (⌘K, docs/router-ux.md 4.10): pause or resume my new leads, test a route,
// open the log, and Held. ClientApp spreads these into its commands.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { Branch, ListIcon, Pause, Play, Inbox } from "../../Icons";
import type { Command } from "../CommandBar";
import { tell } from "../Dialogs";
import { announceChange, errorText, type ViewProps } from "../ui";
import { routingApi } from "./api";
import { ROUTING } from "./screenParts";
import { pausedMs } from "./screensModel";

export function useRoutingCommands({ sb, session, ws, navigate }: { sb: SupabaseClient; session: Session | null | undefined; ws: string | null; navigate: ViewProps["navigate"] }): Command[] {
  const me = session?.user.id ?? "";
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!ws || !me) return;
    const load = () =>
      void sb
        .from("router_reps")
        .select("paused_until")
        .eq("workspace_id", ws)
        .eq("user_id", me)
        .maybeSingle()
        .then(({ data }) => {
          const p = pausedMs((data as { paused_until: string | null } | null)?.paused_until);
          setPaused(p !== null && p > Date.now());
        });
    load();
    window.addEventListener("claritia:changed", load);
    return () => window.removeEventListener("claritia:changed", load);
  }, [sb, ws, me]);

  if (!ws || !session) return [];
  const pause = async () => {
    try {
      await routingApi(session, ws, "rep", { user: me, patch: { paused_until: paused ? "" : "infinity" } });
      setPaused(!paused);
      announceChange();
    } catch (e) {
      await tell("Couldn't change it", errorText(e));
    }
  };
  return [
    { id: "routing-pause", label: paused ? "Resume my new leads" : "Pause my new leads", group: "Routing", icon: paused ? <Play size={15} /> : <Pause size={15} />, run: () => void pause() },
    { id: "routing-test", label: "Try a contact", group: "Routing", icon: <Branch size={15} />, run: () => navigate(ROUTING, "rules", "test=") },
    { id: "routing-log", label: "Routing history", group: "Routing", icon: <ListIcon size={15} />, run: () => navigate(ROUTING, "history") },
    { id: "routing-held", label: "Leads that need review", group: "Routing", icon: <Inbox size={15} />, run: () => navigate(ROUTING, "review") },
  ];
}
