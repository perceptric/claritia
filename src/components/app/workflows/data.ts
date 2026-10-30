"use client";

// What the Workflows screens read: the workflow with its live version, the names its cards show, and the 7-day
// counts. All through the person's own client, so a workflow outside their workspace reads as not found.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanBody } from "@/lib/workflows/check";
import type { Names as WordNames } from "@/lib/workflows/explain";
import type { Body } from "@/lib/workflows/types";
import { must } from "../ui";
import { byId, type Names } from "./model";

export type Workflow = { id: string; name: string; status: "draft" | "live" | "paused"; draft: unknown; draft_revision: number; live_version: number | null; updated_at: string };
export type Version = { version: number; note: string | null; published_at: string; published_by: string | null; body: unknown };
export type Stats = { entered: number; active: number; steps: Record<string, number> };

export type Loaded = { wf: Workflow; draft: Body; live: Body | null; versions: Version[]; names: Names; words: WordNames; stats: Stats };

export async function loadNames(sb: SupabaseClient, ws: string): Promise<Names> {
  const [forms, segments, types, people, profiles, qualify, fields, templates, product] = await Promise.all([
    sb.from("forms").select("id, name").eq("workspace_id", ws).order("name"),
    sb.from("segments").select("id, name, kind").eq("workspace_id", ws).order("name"),
    sb.from("meeting_types").select("id, name").eq("workspace_id", ws).order("name"),
    sb.rpc("workspace_people", { p_ws: ws }),
    sb.from("booking_profiles").select("user_id, name").eq("workspace_id", ws),
    sb.from("qualify_settings").select("outcomes").eq("workspace_id", ws).maybeSingle(),
    sb.from("fields").select("key, label, type").eq("workspace_id", ws).eq("object", "contact").order("position"),
    sb.from("email_templates").select("id, name, body").eq("workspace_id", ws).order("name"),
    sb.rpc("product_event_names", { p_ws: ws }),
  ]);
  const named = new Map(((profiles.data ?? []) as { user_id: string; name: string }[]).map((p) => [p.user_id, p.name]));
  const outcomes = (((qualify.data as { outcomes?: { label?: string }[] } | null)?.outcomes ?? []) as { label?: string }[]).map((o) => o.label ?? "").filter(Boolean);
  return {
    forms: (must(forms) ?? []) as Names["forms"],
    segments: (must(segments) ?? []) as Names["segments"],
    types: (must(types) ?? []) as Names["types"],
    members: (((people.data ?? []) as { id: string; email: string }[]) ?? []).map((p) => ({ id: p.id, email: p.email, name: named.get(p.id) || p.email.replace(/@.*/, "") })),
    outcomes: outcomes.length ? outcomes : ["Sales ready", "Nurture", "Not a fit"],
    dateFields: ((fields.data ?? []) as { key: string; label: string; type: string }[]).filter((f) => f.type === "date").map((f) => ({ key: `f.${f.key}`, label: f.label })),
    templates: (must(templates) ?? []) as Names["templates"],
    // Missing before the migration runs: the pickers then take typed names.
    productEvents: ((product.data ?? []) as string[]).filter(Boolean),
  };
}

export const wordsOf = (n: Names): WordNames => ({ forms: byId(n.forms), segments: byId(n.segments), types: byId(n.types), people: { owner: "their rep", ...byId(n.members) } });

export async function loadWorkflow(sb: SupabaseClient, ws: string, id: string): Promise<Loaded> {
  const wf = must(await sb.from("workflows").select("id, name, status, draft, draft_revision, live_version, updated_at").eq("id", id).eq("workspace_id", ws).maybeSingle()) as Workflow | null;
  if (!wf) throw new Error("Workflow not found.");
  const [versions, names, stats] = await Promise.all([
    sb.from("workflow_versions").select("version, note, published_at, published_by, body").eq("workflow_id", id).order("version", { ascending: false }).limit(50),
    loadNames(sb, ws),
    sb.rpc("workflow_stats", { p_id: id }),
  ]);
  const vs = (must(versions) ?? []) as Version[];
  const liveRow = wf.live_version ? vs.find((v) => v.version === wf.live_version) : null;
  return {
    wf,
    draft: cleanBody(wf.draft),
    live: liveRow ? cleanBody(liveRow.body) : null,
    versions: vs,
    names,
    words: wordsOf(names),
    stats: (stats.data as Stats | null) ?? { entered: 0, active: 0, steps: {} },
  };
}
