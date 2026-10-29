"use client";

// The top of Routing › Leads (docs/routing-chat-plan.md Part 6): this week's numbers, from router_stats.

import { Stat, useLoad, type ViewProps } from "../ui";
import { routingApi, type Loaded } from "./api";
import { fmt } from "./parts";

export function LeadNumbers({ session, ws }: Pick<ViewProps, "session" | "ws">) {
  const r = useLoad(() => routingApi<Loaded>(session, ws.id, "load"), ws.id);
  const s = r.data?.stats;
  if (!s) return null;
  const routed = Math.max(0, s.total - s.held - s.unassigned);
  return (
    <div className="flex flex-wrap gap-x-10 gap-y-4 border-b border-line px-4 py-4 md:px-5">
      <Stat value={fmt(routed)} label="Routed this week" />
      <Stat value={fmt(s.held)} label="Held" />
      <Stat value={fmt(s.unassigned)} label="No rep" />
      {s.p95_ms !== null ? <Stat value={s.p95_ms < 1000 ? "<1s" : `${Math.round(s.p95_ms / 1000)}s`} label="Time to route" /> : null}
    </div>
  );
}
