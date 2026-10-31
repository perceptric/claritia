// A Dynamic meeting's booking link on the server (src/lib/meetings/dynamic.ts): the page's questions, and the meeting
// narrowed to the reps the guest's answers pick, for both the times and the booking, so the two always agree.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rpc } from "../jobs.ts";
import { fieldsFor } from "../router/actions.ts";
import { dynamicHosts, dynamicOf, narrowTo, routeQuestions, routeValues, type RouteQuestion } from "./dynamic.ts";
import type { MeetingType } from "./types.ts";

export async function questionsFor(db: SupabaseClient, ws: string, t: MeetingType): Promise<RouteQuestion[]> {
  if (!dynamicOf(t)) return [];
  return routeQuestions(t, (await fieldsFor(db, ws)).fields);
}

/** The answers sent with a request: an object, at most 2 KB. Null when there are none. */
export function answersOf(raw: unknown): Record<string, unknown> | null {
  let v = raw;
  if (typeof v === "string") {
    if (!v || v.length > 2000) return null;
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v) || JSON.stringify(v).length > 2000) return null;
  return v as Record<string, unknown>;
}

/** The meeting with only the reps the answers pick; as it is for an Individual meeting or no answers. */
export async function routedType(rpc: Rpc, db: SupabaseClient, o: { ws: string; type: MeetingType; answers: Record<string, unknown> | null }): Promise<MeetingType> {
  if (!o.answers || !dynamicOf(o.type)) return o.type;
  const qs = await questionsFor(db, o.ws, o.type);
  if (!qs.length) return o.type;
  let fromEmail: { domain: string | null; class: string | null } | undefined;
  if (qs[0]!.key === "email" && typeof o.answers.email === "string") {
    const { cleanEmail, isRejected } = await import("../identity/clean.ts");
    const e = cleanEmail(o.answers.email);
    if (!isRejected(e)) fromEmail = { domain: e.domain, class: e.class };
  }
  const { data, error } = await rpc("routing_team_list", { p_ws: o.ws });
  if (error) throw new Error(error.message);
  const teams = (data ?? {}) as Record<string, { members: { user: string }[] }>;
  return narrowTo(o.type, dynamicHosts(o.type, routeValues(o.answers, qs, fromEmail), teams));
}
