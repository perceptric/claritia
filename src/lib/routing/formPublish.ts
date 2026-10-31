// A form's routing goes live with the form (docs/on-submission.md), on the server. The form's Routing and the rules of
// the Dynamic meetings it books are compiled (compile.ts) into the form's own routing policy, which is saved, tested
// the way the router asks and published, through the same calls the Routing screens use. Whoever may publish the form
// publishes its routing too: the work only ever touches that form's own policy (made at its first publish when the
// form shared one), so it runs with an owner's rights on the caller's behalf. Saving a meeting publishes again every
// live form that books it.

import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Schedule } from "../forms/schedule.ts";
import type { Form } from "../forms/schema.ts";
import type { Rpc } from "../jobs.ts";
import { fieldsFor, membersOf } from "../router/actions.ts";
import { compileRouting, sampleLead, type MeetingLite } from "./compile.ts";
import { effectiveSource, hasChanges, toV2, withScope, type SourceRow } from "./screenModel.ts";
import * as S from "./screens.ts";

const key = (p: string) => `${p}_${randomUUID().replace(/-/g, "")}`;
const policyOf = (s: SourceRow | null): string | null => (s ? ((s.draft?.policy_id as string | undefined) ?? s.policy_id) : null);
const sharedWith = (sources: SourceRow[], policy: string, formId: string) => sources.filter((s) => s.form_id !== formId && effectiveSource(s, policy).connected && effectiveSource(s, policy).enabled);

/** The form's own policy, or null when it needs one made: it has none, uses the default, or shares it with another source. */
export function ownPolicy<P extends { id: string; is_default: boolean }>(policies: P[], sources: SourceRow[], formId: string): { row: P | null; own: boolean } {
  const src = sources.find((x) => x.kind === "form" && x.form_id === formId) ?? null;
  const row = policies.find((p) => p.id === policyOf(src)) ?? null;
  return { row, own: !!row && !row.is_default && !sharedWith(sources, row.id, formId).length };
}

/** The live forms whose live version books this meeting, as its Default or in a condition. */
export function formsBooking(forms: { id: string; name: string; version: number | null }[], versions: { form_id: string; version: number; body: Form }[], typeId: string) {
  const out: { id: string; name: string; schedule: Schedule }[] = [];
  for (const f of forms) {
    const s = versions.find((v) => v.form_id === f.id && v.version === f.version)?.body?.after?.schedule;
    if (!s?.routes || s.tool !== "claritia" || !(s.meetingTypeId === typeId || s.routes.some((r) => r.meet === typeId))) continue;
    out.push({ id: f.id, name: f.name, schedule: s });
  }
  return out;
}

export async function meetingsOf(db: SupabaseClient, ws: string): Promise<MeetingLite[]> {
  const r = await db.from("meeting_types").select("id, name, active, hosts, settings").eq("workspace_id", ws);
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []) as MeetingLite[];
}

/**
 * Compile and publish one form's routing. Returns the paths left out (a meeting gone, a value missing); throws when the
 * router refuses the result. A form that never used this routing (no `routes`) keeps the policy it had.
 */
export async function publishFormRouting(rpc: Rpc, db: SupabaseClient, o: { ws: string; user: string; formId: string; formName: string; schedule: Schedule | undefined; types?: MeetingLite[] }): Promise<{ problems: string[] }> {
  const s = o.schedule;
  if (!s || s.tool !== "claritia" || !s.routes) return { problems: [] };
  const c: S.Caller = { ws: o.ws, user: o.user, role: "owner" };
  const deps: S.Deps = { members: () => membersOf(rpc, db, o.ws, { fresh: true }), fields: async () => (await fieldsFor(db, o.ws)).fields };
  const types = o.types ?? (await meetingsOf(db, o.ws));
  let screen = await S.screen(rpc, c, deps);
  const formSource = () => screen.sources.find((x) => x.kind === "form" && x.form_id === o.formId) ?? null;
  const mine = ownPolicy(screen.policies, screen.sources, o.formId);
  let row = mine.row;
  let rename = false;
  if (!mine.own) {
    const made = row ? await S.duplicate(rpc, c, { policy: row.id, key: key("dup") }) : await S.create(rpc, c, { name: o.formName.slice(0, 80) || "Form", start: "conditions", key: key("new") });
    screen = await S.screen(rpc, c, deps);
    row = screen.policies.find((p) => p.id === made.id) ?? null;
    rename = true;
  }
  if (!row) throw new Error("Couldn't find this form's routing.");
  const start = row.draft ?? row.live;
  if (!start) throw new Error("This form's routing has nothing to start from.");
  const teamKeys = new Set(screen.teams.flatMap((t) => t.keys));
  const { body, problems } = compileRouting(toV2(start, { reviewer: screen.me, teamKeys }), { def: s.meetingTypeId, routes: s.routes, types, teamKeys });
  await S.save(rpc, c, { policy: row.id, body: withScope(body), ...(rename ? { name: o.formName.slice(0, 80) || "Form" } : {}), revision: row.draft_revision });

  // The form's connection: on this policy, booking the Default meeting.
  const src = formSource();
  const eff = src ? effectiveSource(src, row.id) : null;
  const meeting = s.meetingTypeId ?? null;
  const outcome = meeting ? "assign_and_calendar" : "assign_only";
  if (!eff?.connected || !eff.enabled || eff.outcome !== outcome || eff.meetingTypeId !== meeting)
    await S.stage(rpc, c, { policy: row.id, source: { kind: "form", form: o.formId }, enabled: true, outcome, meeting, revision: src?.draft_revision ?? null });

  screen = await S.screen(rpc, c, deps);
  const now = screen.policies.find((p) => p.id === row!.id);
  if (now && hasChanges(now)) {
    let review = await S.review(rpc, c, deps, { policy: row.id });
    if (review.errors.length) throw new Error(`Routing: ${review.errors.map((e) => e.text).join(" ")}`);
    if (!review.evidence) {
      await S.test(rpc, c, deps, { policy: row.id, version: "draft", revision: review.revision, source: formSource()?.id ?? null, email: "maya@globex.com", values: sampleLead(body) });
      review = await S.review(rpc, c, deps, { policy: row.id });
    }
    await S.publish(rpc, c, deps, { policy: row.id, revision: review.revision, key: key("pub"), fingerprint: review.fingerprint });
  }
  return { problems };
}

/** A meeting changed: publish again the routing of every live form that books it. Returns the forms published. */
export async function republishFormsUsing(rpc: Rpc, db: SupabaseClient, o: { ws: string; user: string; typeId: string }): Promise<number> {
  const forms = ((await db.from("forms").select("id, name, version").eq("workspace_id", o.ws).eq("status", "live")).data ?? []) as { id: string; name: string; version: number | null }[];
  if (!forms.length) return 0;
  const versions = ((await db.from("form_versions").select("form_id, version, body").in("form_id", forms.map((f) => f.id))).data ?? []) as { form_id: string; version: number; body: Form }[];
  const types = await meetingsOf(db, o.ws);
  let n = 0;
  for (const f of formsBooking(forms, versions, o.typeId)) {
    await publishFormRouting(rpc, db, { ws: o.ws, user: o.user, formId: f.id, formName: f.name, schedule: f.schedule, types });
    n++;
  }
  return n;
}
