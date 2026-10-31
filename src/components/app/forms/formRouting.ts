"use client";

// A form's routing, live (docs/on-submission.md). The form picks the meeting and the meeting picks the rep; publishing
// the form compiles both (src/lib/routing/compile.ts) into the form's own routing policy and publishes it through the
// same calls Routing used (rt_save at the revision read, the test the router asks for, rt_publish at the checked
// fingerprint). A form that shared a policy, or used the default one, gets its own at its first publish, with the
// form moved onto it, so other forms keep theirs. Saving a meeting publishes again every live form that books it.

import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Schedule } from "@/lib/forms/schedule";
import type { Form } from "@/lib/forms/schema";
import { compileRouting, sampleLead, type MeetingLite } from "@/lib/routing/compile";
import { effectiveSource, hasChanges, toV2, withScope, type SourceRow } from "@/lib/routing/screenModel";
import { invalidate } from "../ui";
import { fetchMeetingTypes } from "../meetings/TypesList";
import { newKey, rt, useScreen, type ReviewOut, type Screen } from "../routing/rt/api";

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

/** The policy a form routes with now, counting a staged move. */
const policyOf = (s: SourceRow | null): string | null => (s ? ((s.draft?.policy_id as string | undefined) ?? s.policy_id) : null);
/** Other sources (forms, the handoff) that route with this policy once its draft is live. */
const sharedWith = (sources: SourceRow[], policy: string, formId: string) => sources.filter((s) => s.form_id !== formId && effectiveSource(s, policy).connected && effectiveSource(s, policy).enabled);

/**
 * Compile the form's routing and publish it. Returns the paths that couldn't route (a meeting gone, a value missing),
 * which the form shows; throws when the router refuses the result. Only forms that use this routing (`routes` set)
 * are touched; an older form keeps the policy it had.
 */
export async function publishFormRouting(session: Session, ws: string, o: { formId: string; formName: string; schedule: Schedule | undefined; types: MeetingLite[] }): Promise<{ problems: string[] }> {
  const s = o.schedule;
  if (!s || s.tool !== "claritia" || !s.routes) return { problems: [] };
  let screen = await rt<Screen>(session, ws, "rt_screen");
  if (screen.role !== "owner") return { problems: ["Only an owner can publish routing"] };
  const formSource = () => screen.sources.find((x) => x.kind === "form" && x.form_id === o.formId) ?? null;
  let row = screen.policies.find((p) => p.id === policyOf(formSource())) ?? null;
  let rename = false;
  if (!row || row.is_default || sharedWith(screen.sources, row.id, o.formId).length) {
    const made = row ? await rt<{ id: string }>(session, ws, "rt_duplicate", { policy: row.id, key: newKey("dup") }) : await rt<{ id: string }>(session, ws, "rt_create", { name: o.formName.slice(0, 80) || "Form", start: "conditions", key: newKey("new") });
    screen = await rt<Screen>(session, ws, "rt_screen");
    row = screen.policies.find((p) => p.id === made.id) ?? null;
    rename = true;
  }
  if (!row) throw new Error("Couldn't find this form's routing.");
  const teamKeys = new Set(screen.teams.flatMap((t) => t.keys));
  const start = row.draft ?? row.live;
  if (!start) throw new Error("This form's routing has nothing to start from.");
  const { body, problems } = compileRouting(toV2(start, { reviewer: screen.me, teamKeys }), { def: s.meetingTypeId, routes: s.routes, types: o.types, teamKeys });
  await rt(session, ws, "rt_save", { policy: row.id, body: withScope(body), ...(rename ? { name: o.formName.slice(0, 80) || "Form" } : {}), revision: row.draft_revision });

  // The form's connection: on this policy, booking the Default meeting.
  const src = formSource();
  const eff = src ? effectiveSource(src, row.id) : null;
  const meeting = s.meetingTypeId ?? null;
  const outcome = meeting ? "assign_and_calendar" : "assign_only";
  if (!eff?.connected || !eff.enabled || eff.outcome !== outcome || eff.meetingTypeId !== meeting)
    await rt(session, ws, "rt_stage", { policy: row.id, source: { kind: "form", form: o.formId }, enabled: true, outcome, meeting, revision: src?.draft_revision ?? null });

  screen = await rt<Screen>(session, ws, "rt_screen");
  const now = screen.policies.find((p) => p.id === row!.id);
  if (now && hasChanges(now)) {
    let review = await rt<ReviewOut>(session, ws, "rt_review", { policy: row.id });
    if (review.errors.length) throw new Error(`Routing: ${review.errors.map((e) => e.text).join(" ")}`);
    if (!review.evidence) {
      await rt(session, ws, "rt_test", { policy: row.id, version: "draft", revision: review.revision, source: formSource()?.id ?? null, email: "maya@globex.com", values: sampleLead(body) });
      review = await rt<ReviewOut>(session, ws, "rt_review", { policy: row.id });
    }
    await rt(session, ws, "rt_publish", { policy: row.id, revision: review.revision, key: newKey("pub"), fingerprint: review.fingerprint }, { timeoutMs: 20_000 });
  }
  invalidate(`routing_screen:${ws}`);
  return { problems };
}

/**
 * A meeting changed: publish again the routing of every live form that books it (its Default or a condition), so a
 * Dynamic meeting's new rules reach those forms at once. Returns how many forms were published.
 */
export async function republishFormsUsing(session: Session, sb: SupabaseClient, ws: string, typeId: string): Promise<number> {
  const forms = ((await sb.from("forms").select("id, name, version, status").eq("workspace_id", ws).eq("status", "live")).data ?? []) as { id: string; name: string; version: number | null }[];
  if (!forms.length) return 0;
  const versions = ((await sb.from("form_versions").select("form_id, version, body").in("form_id", forms.map((f) => f.id))).data ?? []) as { form_id: string; version: number; body: Form }[];
  const types = await fetchMeetingTypes(sb, ws);
  let n = 0;
  for (const f of forms) {
    const s = versions.find((v) => v.form_id === f.id && v.version === f.version)?.body?.after?.schedule;
    if (!s?.routes || !(s.meetingTypeId === typeId || s.routes.some((r) => r.meet === typeId))) continue;
    await publishFormRouting(session, ws, { formId: f.id, formName: f.name, schedule: s, types });
    n++;
  }
  return n;
}
