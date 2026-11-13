"use client";

// Each workspace's meeting emails and meeting workflows (docs/workflows-plan.md, Part A): the System emails (164), then
// the meeting workflows (165), made once, with the reminder times the workspace's first meeting type has today. Called
// when Workflows or Emails opens. A call that fails (before 164 or 165) leaves everything as it was: the meeting
// worker then sends as it always did.

import type { SupabaseClient } from "@supabase/supabase-js";
import { SYSTEM_KEYS, systemEnsurePayload } from "@/lib/meetings/systemEmails";
import { hourly, MEETING_FLOW_KINDS, meetingFlowsPayload, RETIRED_STARTING } from "@/lib/workflows/meetingFlows";


export async function ensureMeetingSetup(sb: SupabaseClient, ws: string): Promise<void> {
  try {
    const [sys, flows] = await Promise.all([
      sb.from("emails").select("id", { count: "exact", head: true }).eq("workspace_id", ws).eq("kind", "system"),
      sb.from("workflows").select("id", { count: "exact", head: true }).eq("workspace_id", ws).not("meeting_kind", "is", null),
    ]);
    if (!sys.error && (sys.count ?? 0) < SYSTEM_KEYS.length) await sb.rpc("system_email_ensure", { p_ws: ws, p_rows: systemEnsurePayload() });
    if (flows.error || (flows.count ?? 0) >= MEETING_FLOW_KINDS.length) return;
    const t = await sb.from("meeting_types").select("settings").eq("workspace_id", ws).order("created_at").limit(1);
    const rem = ((t.data ?? [])[0] as { settings?: { reminders?: unknown[] } } | undefined)?.settings?.reminders;
    const times = Array.isArray(rem) ? hourly(rem) : undefined;
    await sb.rpc("meeting_flows_ensure", { p_ws: ws, p_items: meetingFlowsPayload(times?.length ? times : undefined), p_retire: RETIRED_STARTING });
  } catch {
    /* the next open tries again */
  }
}
