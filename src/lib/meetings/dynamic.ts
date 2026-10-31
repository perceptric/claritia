// A Dynamic meeting's own booking link (docs/on-submission.md): the page asks the questions its rules test, then
// shows the times of the rep or team those answers pick, by the same rules a form uses (src/lib/routing/compile.ts).
// The first rule whose conditions all hold wins; anyone else gets Otherwise. A rep or team that can't be offered
// (not among the meeting's reps, a team that's gone or empty) never narrows the page to the wrong person: the page
// keeps every rep, who take turns as before. Runs in the browser and on the server.

import { incomplete, ruleMatches, toNumber, type FieldDef, type FieldType } from "../router/conditions.ts";
import type { Cond, Rule } from "../router/types.ts";
import type { Dest, Dynamic } from "../routing/compile.ts";
import type { MeetingType } from "./types.ts";

/** One question the page asks before its times: a field a rule tests, or the email for the email's domain and type. */
export type RouteQuestion = { key: string; label: string; type: FieldType; options?: string[] };

/** Fields the page works out from the email instead of asking. */
const FROM_EMAIL = new Set(["contact.email_domain", "contact.email_class"]);
const complete = (conds: Cond[]) => conds.length > 0 && !conds.some(incomplete);

export const dynamicOf = (t: Pick<MeetingType, "settings">): Dynamic | null => (t.settings as { dynamic?: Dynamic }).dynamic ?? null;

/** The questions, in the order the rules first test them. None for an Individual meeting or rules that test nothing. */
export function routeQuestions(t: Pick<MeetingType, "settings">, fields: FieldDef[]): RouteQuestion[] {
  const d = dynamicOf(t);
  if (!d) return [];
  const out: RouteQuestion[] = [];
  const seen = new Set<string>();
  let email = false;
  for (const r of d.rules) {
    if (!complete(r.conds)) continue;
    for (const c of r.conds) {
      if (FROM_EMAIL.has(c.field)) email = true;
      if (FROM_EMAIL.has(c.field) || seen.has(c.field)) continue;
      seen.add(c.field);
      const f = fields.find((x) => x.key === c.field);
      if (f) out.push({ key: f.key, label: f.label, type: f.type, ...(f.options?.length ? { options: f.options.slice(0, 60) } : {}) });
    }
  }
  return email ? [{ key: "email", label: "Work email", type: "text" }, ...out] : out;
}

/**
 * The guest's answers as rule values: only the questions asked, trimmed, numbers as numbers, blanks left out. The
 * email's domain and type come in `fromEmail` (worked out on the server by the identity cleaner).
 */
export function routeValues(raw: unknown, questions: RouteQuestion[], fromEmail?: { domain: string | null; class: string | null }): Record<string, unknown> {
  const a = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    if (q.key === "email") continue;
    const v = a[q.key];
    if (typeof v !== "string" && typeof v !== "number") continue;
    const s = String(v).trim().slice(0, 200);
    if (!s) continue;
    if (q.type === "number") {
      const n = toNumber(s);
      if (n !== null) out[q.key] = n;
    } else if ((q.type === "choice" || q.type === "bool") && q.options?.length && !q.options.includes(s)) continue;
    else out[q.key] = s;
  }
  if (fromEmail?.domain) out["contact.email_domain"] = fromEmail.domain;
  if (fromEmail?.class) out["contact.email_class"] = fromEmail.class;
  return out;
}

/** The meeting's reps a destination names: one rep, or the team's members, among the meeting's reps. */
function repsOf(t: Pick<MeetingType, "hosts">, d: Dest | null, teams: Record<string, { members: { user: string }[] }>): string[] {
  if (!d) return [];
  const hosts = new Set(t.hosts.map((h) => h.user_id));
  const ids = d.kind === "user" ? [d.id] : (teams[d.id]?.members ?? []).map((m) => m.user);
  return ids.filter((id) => hosts.has(id));
}

/**
 * Which of the meeting's reps the answers pick, or null for all of them (no Dynamic routing, or a destination that
 * can't be offered). A matched rule decides even when it can't be offered: the page never falls through to a later
 * rule or Otherwise, which could be the wrong person.
 */
export function dynamicHosts(t: Pick<MeetingType, "hosts" | "settings">, values: Record<string, unknown>, teams: Record<string, { members: { user: string }[] }>): string[] | null {
  const d = dynamicOf(t);
  if (!d) return null;
  for (const r of d.rules) {
    if (!complete(r.conds)) continue;
    const rule = { id: r.id, name: r.id, match: "all", conds: r.conds, queue: "" } as Rule;
    if (!ruleMatches(rule, values, [], "v2").ok) continue;
    const ids = repsOf(t, r.to, teams);
    return ids.length ? ids : null;
  }
  const ids = repsOf(t, d.otherwise, teams);
  return ids.length ? ids : null;
}

/** The meeting with only these reps; the meeting as it is when that's all of them or none. */
export function narrowTo(t: MeetingType, ids: string[] | null): MeetingType {
  if (!ids) return t;
  const hosts = t.hosts.filter((h) => ids.includes(h.user_id));
  if (!hosts.length || hosts.length === t.hosts.length) return t;
  // One rep left: strict turns would wait on a turn that's always theirs.
  const settings = hosts.length === 1 && t.settings.rrMode === "strict" ? { ...t.settings, rrMode: "flexible" as const } : t.settings;
  return { ...t, hosts, settings };
}
