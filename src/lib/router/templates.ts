// Starting points (docs/router-ux.md 4.1): three templates, and today's routing in lead_settings moved over
// (docs/router.md Part 11). Each returns a full body; the editor's "Finish setup" list comes from `problems`.

import { REGIONS } from "./conditions.ts";
import { emptyBody, type Queue, type Rule, type RouterBody } from "./types.ts";

export type TemplateId = "round_robin" | "territories" | "owner_first";

export const TEMPLATES: { id: TemplateId; name: string; text: string }[] = [
  { id: "round_robin", name: "Everyone takes turns", text: "One team shares every lead" },
  { id: "territories", name: "By region", text: "A team for each region" },
  { id: "owner_first", name: "Company owner first", text: "Known companies keep their rep" },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "x";

/** A template's body. `reps`: the members to start the shared queue with. `regions`: names from REGIONS. */
export function fromTemplate(id: TemplateId, o: { reps?: string[]; regions?: string[] } = {}): RouterBody {
  const b = emptyBody();
  const everyone: Queue = { id: "q_everyone", name: "All reps", method: "rr", strict: false, hoursOnly: false, members: (o.reps ?? []).map((user) => ({ user, weight: 1 })) };
  if (id === "round_robin") {
    b.account.on = false;
    b.queues = [everyone];
    b.fallback = { kind: "queue", id: everyone.id };
    return b;
  }
  if (id === "owner_first") {
    b.queues = [{ ...everyone, id: "q_new", name: "New accounts" }];
    b.fallback = { kind: "queue", id: "q_new" };
    return b;
  }
  const regions = (o.regions?.length ? o.regions : ["North America", "EMEA"]).map((n) => REGIONS.find((r) => r.name === n)).filter((r): r is (typeof REGIONS)[number] => !!r);
  for (const r of regions) {
    const key = slug(r.name);
    b.territories.push({ id: `t_${key}`, name: r.name, countries: r.countries });
    b.queues.push({ id: `q_${key}`, name: r.name, method: "rr", strict: false, hoursOnly: false, members: [] });
    b.rules.list.push({ id: `r_${key}`, name: r.name, match: "all", conds: [{ field: "lead.country", op: "one_of", value: [`t:t_${key}`] }], queue: `q_${key}` });
  }
  return b;
}

type OldOwner = { user_id?: string | null; crm_owner_id?: string | null; label?: string | null };
type OldRule = { name?: string; countries?: string[]; industries?: string[]; sizes?: string[]; owners?: OldOwner[] };
export type OldRouting = { respect_owner?: boolean; rules?: OldRule[]; default?: { owners?: OldOwner[] } };

/**
 * Today's routing (`lead_settings.routing` in 043_lead_scoring.sql) as a router: each rule becomes a rule and a queue
 * of its owners, the default owners the fallback queue, and "respect owner" the Keep owner step. Owners known only by
 * CRM id are mapped through `crmToUser`; ones with no teammate are left out and listed in `unmapped`.
 */
export function fromLeadSettings(old: OldRouting, crmToUser: (crm: string) => string | null = () => null): { body: RouterBody; unmapped: string[] } {
  const b = emptyBody();
  b.spam.on = false;
  b.account.on = false;
  b.keep.on = old.respect_owner !== false;
  b.keep.whenOut = "keep";
  const unmapped: string[] = [];
  const members = (owners: OldOwner[] | undefined) => {
    const out: { user: string; weight: number }[] = [];
    for (const o of owners ?? []) {
      const u = o.user_id || (o.crm_owner_id ? crmToUser(o.crm_owner_id) : null);
      if (u && !out.some((m) => m.user === u)) out.push({ user: u, weight: 1 });
      else if (!u) unmapped.push(o.label || o.crm_owner_id || "an owner");
    }
    return out;
  };
  (old.rules ?? []).forEach((r, i) => {
    // Today's routing skips a rule with no owners.
    if (!r.owners?.length) return;
    const id = `r${i + 1}`;
    const q: Queue = { id: `q${i + 1}`, name: r.name || `Rule ${i + 1}`, method: "rr", strict: true, hoursOnly: false, members: members(r.owners) };
    const conds: Rule["conds"] = [];
    // The company's country, else the contact's, as today.
    if (r.countries?.length) conds.push({ field: "lead.country", op: "one_of", value: r.countries.map((c) => c.toUpperCase()) });
    if (r.industries?.length) conds.push({ field: "company.industry", op: "one_of", value: r.industries });
    if (r.sizes?.length) conds.push({ field: "company.size", op: "one_of", value: r.sizes });
    // A rule with nothing to test matched every lead.
    if (!conds.length) conds.push({ field: "lead.source", op: "filled" });
    b.queues.push(q);
    b.rules.list.push({ id, name: q.name, match: "all", conds, queue: q.id });
  });
  const def = members(old.default?.owners);
  if (def.length) {
    b.queues.push({ id: "q_default", name: "Default", method: "rr", strict: true, hoursOnly: false, members: def });
    b.fallback = { kind: "queue", id: "q_default" };
  }
  return { body: b, unmapped: [...new Set(unmapped)] };
}
