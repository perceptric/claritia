"use client";

// Routing (docs/router-ux.md Part 3): CRM › Routing, with the tabs Router · Reps · Log · Held. The Held tab carries a
// count of the leads waiting there (held or unassigned). Addresses: /routing, /routing/reps, /routing/log,
// /routing/log/<run>, /routing/held and /routing/versions/<n>.

import { useLayoutEffect, useRef, useState } from "react";
import { routingPage, type RoutingTab } from "@/lib/nav";
import { Badge, must, Page, useLoad, type ViewProps } from "../ui";
import { HeldTab } from "./Held";
import { LogTab } from "./Log";
import { RepsTab } from "./Reps";
import { RouterTab } from "./Router";
import { ToastHost } from "./Toast";

const TABS: { value: RoutingTab; label: string }[] = [
  { value: "router", label: "Router" },
  { value: "reps", label: "Reps" },
  { value: "log", label: "Log" },
  { value: "held", label: "Held" },
];

export function RoutingView(props: ViewProps) {
  const { sb, session, ws, role, navigate, id } = props;
  const page = routingPage(id);
  const held = useLoad(async () => {
    const r = await sb.from("contacts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).in("route_status", ["held", "unassigned"]).is("deleted_at", null);
    must(r);
    return r.count ?? 0;
  }, ws.id);
  const shared = { sb, session, ws, role, navigate };
  return (
    <Page title="Routing" flush>
      <div className="flex h-full min-h-0 flex-col">
        <RoutingTabs value={page.tab} held={held.data ?? 0} onChange={(t) => navigate("routing", t === "router" ? "" : t)} />
        <div className="min-h-0 flex-1" role="tabpanel" aria-label={TABS.find((t) => t.value === page.tab)?.label}>
          {page.tab === "router" ? (
            <RouterTab {...shared} version={page.version} />
          ) : page.tab === "reps" ? (
            <RepsTab {...shared} sub={page.sub} />
          ) : page.tab === "log" ? (
            <LogTab {...shared} sub={page.sub} />
          ) : (
            <HeldTab {...shared} sub={page.sub} />
          )}
        </div>
      </div>
      <ToastHost />
    </Page>
  );
}

/** Tabs like the app's `Tabs`, with a count `Badge` on Held while anything waits there. */
function RoutingTabs({ value, held, onChange }: { value: RoutingTab; held: number; onChange: (t: RoutingTab) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; width: number } | null>(null);
  const index = TABS.findIndex((t) => t.value === value);
  useLayoutEffect(() => {
    const el = box.current?.querySelectorAll<HTMLElement>("[data-slide]")[index];
    setAt(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [index, held]);
  return (
    <div ref={box} role="tablist" aria-label="Routing" className="relative flex h-11 shrink-0 items-end gap-1 overflow-x-auto border-b border-line px-4 md:px-6">
      {TABS.map((t) => (
        <button
          key={t.value}
          data-slide=""
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`relative flex h-10 shrink-0 items-center gap-1.5 px-2.5 text-[13.5px] font-medium transition-colors duration-[140ms] ${value === t.value ? "text-ink" : "text-muted hover:text-ink"}`}
        >
          {t.label}
          {t.value === "held" && held > 0 ? <Badge tone="amber">{held > 999 ? "999+" : held}</Badge> : null}
        </button>
      ))}
      {at ? <span aria-hidden="true" className="absolute bottom-0 left-0 h-0.5 rounded-full bg-ink transition-[transform,width] duration-[320ms] ease-out" style={{ width: at.width - 12, transform: `translateX(${at.left + 6}px)` }} /> : null}
    </div>
  );
}
