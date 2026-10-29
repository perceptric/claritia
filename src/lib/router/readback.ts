// Read it back (docs/router-ux-v2.md Part 12): a whole setup as a short paragraph, made from the setup itself, so it
// is always exact. Shown on Overview, used before and after on Make live, and copied to Slack to tell the team.

import { minutesWords } from "./explain.ts";
import { BASE_FIELDS, ruleWords, type FieldDef } from "./conditions.ts";
import { defaultSla, type RouterBody } from "./types.ts";

const METHOD = { rr: "who take turns", weighted: "where some get more", load: "where the rep with the fewest meetings goes first" } as const;

/** `names`: teammates by id. `fields`: for rule sentences. */
export function readBack(body: RouterBody, o: { names?: Record<string, string>; fields?: FieldDef[] } = {}): string {
  const who = (id: string) => o.names?.[id] ?? "a former teammate";
  const team = (id: string) => body.queues.find((q) => q.id === id);
  const out: string[] = [];

  if (body.spam.on) {
    const checks = [body.spam.disposable && "throwaway emails", body.spam.fakeName && "made-up names", body.spam.tooMany && "too many forms from one person", body.spam.freeMail && "personal emails"].filter(Boolean) as string[];
    out.push(checks.length ? `Leads with ${list(checks)} wait for you to review.` : "Leads from blocked domains wait for you to review.");
  }
  if (body.account.on) out.push(`A lead from a company you already work with goes to ${body.account.oppFirst ? "the rep on its open deal, or else the company's owner" : "the company's owner"}.`);
  if (body.keep.on) {
    const away = { keep: "waits for them", backup: "goes to whoever covers for them", route: "goes on to a team" }[body.keep.whenOut];
    out.push(`A lead who already has a rep keeps them; when that rep is away, it ${away}.`);
  }
  if (body.rules.on) {
    for (const r of body.rules.list) {
      if (r.on === false) continue;
      const q = team(r.queue);
      const sentence = ruleWords(r, o.fields?.length ? o.fields : BASE_FIELDS, body.territories);
      const lower = sentence.charAt(0).toLowerCase() + sentence.slice(1);
      const to = r.then === "hold" ? "it waits for you to review" : r.then === "owner" ? "it goes to the company's owner" : `it goes to ${q ? `the ${q.name} team, ${METHOD[q.method]}` : "a team that's gone"}`;
      out.push(`When ${lower}, ${to}.`);
    }
  }
  const fb = body.fallback;
  out.push(!fb ? "Leads nothing else matched have no rep yet." : fb.kind === "user" ? `Everyone else goes to ${who(fb.id)}.` : `Everyone else goes to the ${team(fb.id)?.name ?? "removed"} team.`);
  const sla = body.sla ?? defaultSla();
  if (sla.on) {
    const then = sla.next === "route" ? "it goes to someone else" : sla.next === "manager" ? `it goes to ${sla.manager ? who(sla.manager) : "the manager"}` : "they get a reminder";
    out.push(`Reps must reach out within ${minutesWords(sla.minutes)}, or ${then}.`);
  }
  return out.join(" ");
}

function list(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

export type PlanLine = { kind: "spam" | "account" | "keep" | "rule" | "fallback" | "sla"; id?: string; text: string; off?: boolean };

/**
 * The setup as numbered lines for the plan card (docs/routing-chat-plan.md 1.2), one per step a lead goes through,
 * in the order they run. Made from the setup itself, like `readBack`, so each line is exactly what will run.
 */
export function planLines(body: RouterBody, o: { names?: Record<string, string>; fields?: FieldDef[] } = {}): PlanLine[] {
  const who = (id: string) => o.names?.[id] ?? "a former teammate";
  const team = (id: string) => body.queues.find((q) => q.id === id);
  const fields = o.fields?.length ? o.fields : BASE_FIELDS;
  const teamWords = (id: string) => {
    const q = team(id);
    if (!q) return "a team that's gone";
    if (q.members.length === 1) return who(q.members[0]!.user);
    return `the ${q.name} team, ${METHOD_SHORT[q.method]}`;
  };
  const out: PlanLine[] = [];
  if (body.spam.on) {
    const checks = [body.spam.disposable && "throwaway emails", body.spam.fakeName && "made-up names", body.spam.tooMany && "too many fills in an hour", body.spam.freeMail && "personal emails"].filter(Boolean) as string[];
    out.push({ kind: "spam", text: checks.length ? `Leads with ${list(checks)} wait for you to review.` : "Leads from blocked domains wait for you to review." });
  }
  if (body.account.on) out.push({ kind: "account", text: `A lead from a company you already work with goes to ${body.account.oppFirst ? "the rep on its open deal, or the company's owner" : "the company's owner"}.` });
  if (body.keep.on) out.push({ kind: "keep", text: `A lead who already has a rep keeps them${body.keep.whenOut === "backup" ? ", or their backup when they're away" : body.keep.whenOut === "route" ? ", unless they're away" : ""}.` });
  if (body.rules.on)
    for (const r of body.rules.list) {
      if (r.on === false) continue;
      const when = r.conds.length ? ruleWords(r, fields, body.territories) : "A new rule";
      const then = r.then === "hold" ? "wait for you to review" : r.then === "owner" ? "go to their company's owner" : `go to ${teamWords(r.queue)}`;
      out.push({ kind: "rule", id: r.id, text: `${when}: leads ${then}.` });
    }
  const fb = body.fallback;
  out.push({ kind: "fallback", text: !fb ? "Everyone else has no rep yet." : fb.kind === "user" ? `Everyone else goes to ${who(fb.id)}.` : `Everyone else goes to ${teamWords(fb.id)}.` });
  const sla = body.sla ?? defaultSla();
  if (sla.on) {
    const then = sla.next === "route" ? "it goes to the next person" : sla.next === "manager" ? `it goes to ${sla.manager ? who(sla.manager) : "the manager"}` : "they get a reminder";
    out.push({ kind: "sla", text: `A rep has ${minutesWords(sla.minutes)} to act, or ${then}.` });
  }
  return out;
}

const METHOD_SHORT = { rr: "taking turns", weighted: "some get more", load: "fewest meetings first" } as const;
