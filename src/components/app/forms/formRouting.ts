"use client";

// What the form's and the meeting's routing editors need (docs/on-submission.md). Publishing happens on the server,
// with the form (src/lib/routing/formPublish.ts).

import type { Session } from "@supabase/supabase-js";
import { useScreen } from "../routing/rt/api";

/** What the routing editor needs: the fields conditions test, the people and teams meetings route to. */
export function useRoutingFacts(session: Session, ws: string) {
  const screen = useScreen(session, ws);
  const d = screen.data;
  return {
    ready: !!d,
    error: screen.error,
    fields: d?.fields ?? [],
    people: d?.people ?? [],
    teams: d?.teams ?? [],
    teamKeys: new Set(d?.teams.flatMap((t) => t.keys) ?? []),
    owner: d?.role === "owner",
  };
}
export type RoutingFacts = ReturnType<typeof useRoutingFacts>;
