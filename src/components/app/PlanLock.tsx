"use client";

// A feature on a higher plan (docs/pricing.md Part 4, FEATURES in src/lib/plans.ts): one line that says where it is,
// the plan's badge and Upgrade, which opens Settings › Billing (only owners change the plan there). usePlan reads the
// workspace's plan, shared by every screen and kept a minute. The server holds every lock too, with the same line.

import type { SupabaseClient } from "@supabase/supabase-js";
import { allows, lockLine, planFor, type Feature } from "@/lib/plans";
import { Badge, Button, useQuery } from "./ui";

/** The workspace's plan id; "free" when there's no billing row. */
export function usePlan(sb: SupabaseClient, ws: string) {
  return useQuery(`workspace_plan:${ws}`, async () => ((await sb.from("workspace_billing").select("plan").eq("workspace_id", ws).maybeSingle()).data as { plan?: string } | null)?.plan ?? "free", { staleMs: 60_000 });
}

/** Whether the plan has the feature. Until the plan is read it does: nothing locks by mistake while it loads. */
export const planHas = (plan: string | null | undefined, f: Feature | null): boolean => !f || plan === null || plan === undefined || allows(plan, f);

/** Settings › Billing, from a place that can't open it in the app (a dialog): the whole page loads there. */
const toBilling = () => window.location.assign(new URL("/settings/billing", window.location.origin).href);

export function PlanLock({ feature, owner = true, onUpgrade }: { feature: Feature; owner?: boolean; onUpgrade?: () => void }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 basis-48 text-[13px] text-body">{lockLine(feature)}</span>
      <Badge tone="violet">{planFor(feature).name}</Badge>
      {owner ? (
        <Button size="sm" onClick={onUpgrade ?? toBilling}>
          Upgrade
        </Button>
      ) : null}
    </div>
  );
}
