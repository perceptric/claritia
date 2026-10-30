// Who hosts a meeting, as Meetings' cards pick it (one dropdown, two groups): Team, a Routing team (from a form each
// lead gets the rep Routing picks, with their own calendar; from the plain booking link the team takes turns), or
// Individual, one rep who always takes it. Team is the "A Routing team" host mode (settings.team); Individual is
// "One person". Types made another way ("Everyone", hand-picked hosts taking turns) keep what they have: their own
// choice shows, and only a pick changes them. Also "Booked by leads from": the live router's rules and fallback that
// name a meeting. No React, so the tests can run them (tests/inboundSetup.test.ts).

import { BASE_FIELDS, ruleWords, type FieldDef } from "../../../lib/router/conditions.ts";
import type { Host, Kind, TypeSettings } from "../../../lib/meetings/types.ts";
import type { Queue, RouterBody } from "../../../lib/router/types.ts";

type T = { kind: Kind; hosts: Host[]; settings: TypeSettings };

/** The card's choice: `team:<queue>`, `rep:<user>`, `everyone`, or `own` for a set-up the dropdown can't make. */
export function hostChoice(t: T): string {
  const team = (t.settings as { team?: unknown }).team;
  if (typeof team === "string" && team) return `team:${team}`;
  if ((t.kind === "one" || t.kind === "group") && t.hosts[0]) return `rep:${t.hosts[0].user_id}`;
  if (t.kind === "collective") return "everyone";
  return "own";
}

const withoutTeam = (s: TypeSettings): TypeSettings => {
  const { team: _t, ...rest } = s as TypeSettings & { team?: string };
  void _t;
  return rest as TypeSettings;
};

/**
 * The type with a new choice. A team takes the team's current members as hosts (so its own booking link takes turns
 * between them) and stores the team; a rep becomes the one host. "everyone" and "own" change nothing: they are
 * only shown for types that already have them. A team with nobody in it keeps the hosts it had.
 */
export function withHostChoice<X extends T>(t: X, choice: string, queues: Queue[], people: Set<string>): X {
  if (choice.startsWith("team:")) {
    const q = queues.find((x) => x.id === choice.slice(5));
    if (!q) return t;
    const members = q.members.filter((m) => people.has(m.user)).map((m): Host => ({ user_id: m.user, weight: Math.min(10, Math.max(1, Math.round(m.weight || 1))), tier: 0 }));
    return { ...t, kind: t.kind === "owner_first" ? "owner_first" : "round_robin", hosts: members.length ? members : t.hosts, settings: { ...t.settings, team: q.id } as TypeSettings };
  }
  if (choice.startsWith("rep:")) {
    const user = choice.slice(4);
    return { ...t, kind: t.kind === "group" ? "group" : "one", hosts: [{ user_id: user }], settings: withoutTeam(t.settings) };
  }
  return t;
}

/** "Country is US", "When no rule fits": the live router's steps that book this meeting. */
export function bookedBy(body: Pick<RouterBody, "rules" | "fallback" | "territories"> | null | undefined, typeId: string, fields: FieldDef[] = BASE_FIELDS): string[] {
  if (!body) return [];
  const out = body.rules.on ? body.rules.list.filter((r) => r.on !== false && r.meet === typeId && (r.then ?? "queue") !== "hold").map((r) => ruleWords(r, fields, body.territories)) : [];
  if (body.fallback?.meet === typeId) out.push("When no rule fits");
  return out;
}
