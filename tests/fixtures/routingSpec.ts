// The deterministic fixtures of docs/routing-workflow.md Section 26: Ana, Vincent and Kai; the teams Enterprise US,
// Enterprise global, General sales and Vietnam sales with their stable order and first positions; the ordered rules
// of Section 11; Everyone else to General sales; review by Vincent. Test data only, never seeded into a workspace.

import { specBody, type Facts, type RepFacts, type RouterBody, type TeamFacts } from "../../src/lib/router/types.ts";

export const ANA = "a0a0a0a0-0000-4000-8000-000000000001";
export const VIN = "a0a0a0a0-0000-4000-8000-000000000002";
export const KAI = "a0a0a0a0-0000-4000-8000-000000000003";
/** Someone in the workspace but outside the policy's scope (an SDR). */
export const LEE = "a0a0a0a0-0000-4000-8000-000000000004";
export const NOW = Date.UTC(2026, 10, 2, 15, 0);
const DAY = 86_400_000;

export const rep = (name: string, o: Partial<RepFacts> = {}): RepFacts => ({ name, member: true, tz: "UTC", pausedUntil: null, outUntil: null, backup: null, capDay: 5, capWeek: null, today: 0, week: 0, meetingsWeek: 0, inHours: true, ...o });

export const TEAMS = {
  eus: { name: "Enterprise US", members: [ANA, VIN] },
  eg: { name: "Enterprise global", members: [KAI, ANA] },
  gs: { name: "General sales", members: [VIN, KAI, ANA] },
  vn: { name: "Vietnam sales", members: [VIN] },
} as const;

export function teams(): Record<string, TeamFacts> {
  return Object.fromEntries(
    Object.entries(TEAMS).map(([id, t]) => [id, { id: `team-${id}`, name: t.name, method: "rr", strict: false, hoursOnly: false, next: 0, members: t.members.map((user, position) => ({ user, weight: 1, position })) }]),
  );
}

/** The Section 11 policy: US enterprise, Other enterprise, Vietnam, then Everyone else to General sales. */
export function policy(): RouterBody {
  const b = specBody({ people: [ANA, VIN, KAI], teams: ["eus", "eg", "gs", "vn"], reviewer: VIN });
  b.rules.list = [
    { id: "r_us_ent", name: "US enterprise", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["US"] }, { field: "company.employees", op: "gte", value: 201 }], queue: "eus" },
    { id: "r_ent", name: "Other enterprise", match: "all", conds: [{ field: "company.employees", op: "gte", value: 201 }], queue: "eg" },
    { id: "r_vn", name: "Vietnam", match: "all", conds: [{ field: "lead.country", op: "one_of", value: ["VN"] }], queue: "vn" },
  ];
  b.fallback = { kind: "queue", id: "gs" };
  return b;
}

/** Maya: unowned, no company owner, US, 800 employees, a valid work email, no spam. Ana 2/5, Vincent 1/5, Kai 3/5 and out. */
export function maya(o: { country?: string | null; employees?: number | string | null; owner?: string | null; companyOwner?: string | null; reps?: Partial<Record<string, Partial<RepFacts>>> } & Partial<Facts> = {}): Facts {
  const { country, employees, owner, companyOwner, reps, ...rest } = o;
  const values: Record<string, unknown> = { "lead.source": "form", "lead.country": country === undefined ? "US" : country, "company.employees": employees === undefined ? 800 : employees };
  return {
    now: NOW,
    lead: { id: "maya", name: "Maya Chen", email: "maya@globex.com", emailClass: "work", domain: "globex.com", firstName: "Maya", lastName: "Chen", recent: 1, disposable: false },
    values,
    owner: owner ? { user: owner, crm: null } : { user: null, crm: null },
    company: { id: "globex", name: "Globex", domain: "globex.com", owner: companyOwner ?? null, ownerCrm: null, oppOwner: null, oppName: null },
    companyMatch: { kind: "linked", count: 1 },
    reps: {
      [ANA]: rep("Ana", { today: 2, ...reps?.[ANA] }),
      [VIN]: rep("Vincent", { today: 1, ...reps?.[VIN] }),
      [KAI]: rep("Kai", { today: 3, outUntil: NOW + 3 * DAY, ...reps?.[KAI] }),
      [LEE]: rep("Lee", { ...reps?.[LEE] }),
    },
    counts: {},
    lists: { allow: [], block: [] },
    teams: teams(),
    ...rest,
  };
}
