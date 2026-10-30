"use client";

// Routing, as a form that books a meeting reads it (docs/inbound.md: Routing decides, the form shows the result). One
// row per way the live router can place a lead, in the order it decides (src/lib/router/engine.ts decide): held for
// review first (spam is step 1), then the rep they already have (account and keep, steps 2 and 3, when on), the
// rules top to bottom, then everyone else. Each row says which meeting the lead books (the rule's own, else the
// form's) and with whom, and carries a sample lead for the builder's "Preview as". The server does the same in
// src/lib/forms/schedule.ts claritiaPlan.

import { ruleTitle } from "@/components/app/routing/editorModel";
import { ruleWords, type FieldDef } from "@/lib/router/conditions";
import type { RouterBody } from "@/lib/router/types";

export type RouteRow = {
  id: string;
  name: string;
  when: string;
  /** The meeting type the rule names, else null (the form's own). */
  meet: string | null;
  held: boolean;
  /** A rep the lead could get here, for the preview. */
  rep: { id: string; name: string } | null;
  lead: { first: string; email: string };
};

/** What the forms screens know of Routing: live (a published router, not paused), and its rows. */
export type Routes = { on: boolean; rows: RouteRow[]; pv: string; setPv: (id: string) => void; types: { id: string; name: string; settings?: { lengths?: number[] } }[]; open: () => void };

type Person = { id: string; name: string; email: string };

const LEADS = [
  { first: "Maya", email: "maya@globex.com" },
  { first: "Leo", email: "leo@brightline.io" },
  { first: "Ana", email: "ana@initech.com" },
  { first: "Kai", email: "kai@figma.com" },
  { first: "Noor", email: "noor@umbrella.co" },
  { first: "Jonas", email: "jonas@pitch.com" },
  { first: "Priya", email: "priya@vanta.com" },
  { first: "Hana", email: "hana@notion.so" },
];

/** The row the preview opens on: the first rule, else the first lead who books. */
export const firstRow = (rows: RouteRow[]) => rows.find((r) => !r.held && r.id !== "owned" && r.id !== "fallback") ?? rows.find((r) => !r.held) ?? rows[0];

export function routeRows(body: RouterBody, people: Person[], fields: FieldDef[] = []): RouteRow[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const person = (id: string | undefined | null) => {
    const p = id ? byId.get(id) : undefined;
    return p ? { id: p.id, name: p.name || p.email } : null;
  };
  const firstOf = (queue: string) => person(body.queues.find((q) => q.id === queue)?.members[0]?.user);
  const anyone = person(people[0]?.id);
  // "Has a rep" shows someone other than the rules' first reps when there is one, so the preview tells them apart.
  const ruleReps = new Set(body.rules.list.map((r) => body.queues.find((q) => q.id === r.queue)?.members[0]?.user));
  const owner = person(people.find((p) => !ruleReps.has(p.id))?.id) ?? anyone;
  const rows: Omit<RouteRow, "lead">[] = [{ id: "held", name: "Held for review", when: "Spam or a hold rule", meet: null, held: true, rep: null }];
  if (body.account.on || body.keep.on) rows.push({ id: "owned", name: "Has a rep", when: body.account.on ? "Their company has an owner" : "They already have an owner", meet: null, held: false, rep: owner });
  if (body.rules.on)
    for (const r of body.rules.list) {
      if (r.on === false) continue;
      const hold = r.then === "hold";
      rows.push({ id: r.id, name: ruleTitle(r, fields, body.territories), when: ruleWords(r, fields, body.territories), meet: hold ? null : (r.meet ?? null), held: hold, rep: hold ? null : r.then === "owner" ? anyone : (firstOf(r.queue) ?? anyone) });
    }
  const fb = body.fallback;
  rows.push(
    fb
      ? { id: "fallback", name: "Everyone else", when: "No rule matched", meet: fb.meet ?? null, held: false, rep: (fb.kind === "user" ? person(fb.id) : firstOf(fb.id)) ?? anyone }
      : { id: "fallback", name: "Everyone else", when: "No rule matched", meet: null, held: true, rep: null },
  );
  // Sample leads: the rules' first, in order, then the rep they have, then everyone else.
  const order = [...rows.filter((r) => r.id !== "held" && r.id !== "owned" && r.id !== "fallback"), ...rows.filter((r) => r.id === "owned"), ...rows.filter((r) => r.id === "fallback")];
  return rows.map((r) => ({ ...r, lead: r.id === "held" ? { first: "Test", email: "test@mailinator.com" } : LEADS[order.indexOf(r) % LEADS.length]! }));
}

/** A meeting type's name with its first length: "Audit walkthrough, 30 min". */
export const typeLabel = (t: { name: string; settings?: { lengths?: number[] } } | undefined | null) => (t ? `${t.name}${t.settings?.lengths?.[0] ? `, ${t.settings.lengths[0]} min` : ""}` : "A meeting");

/** The routes list: rule and when on the left, what the lead books on the right. A row switches the preview. */
export function RouteList({ routes, formType }: { routes: Routes; formType: string | undefined }) {
  const name = (id: string | null) => typeLabel(routes.types.find((t) => t.id === (id ?? formType)));
  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-line">
      {routes.rows.map((r) => (
        <button
          key={r.id}
          type="button"
          aria-pressed={routes.pv === r.id}
          onClick={() => routes.setPv(r.id)}
          className={`flex items-start gap-[12px] border-t border-line px-[12px] py-[10px] text-left transition-colors duration-[120ms] first:border-t-0 ${routes.pv === r.id ? "bg-paper shadow-[inset_2px_0_0_var(--color-ink)]" : "bg-card hover:bg-hover"}`}
        >
          <span className="flex min-w-0 flex-1 flex-col leading-[1.35]">
            <b className="text-[12.5px] font-medium text-ink">{r.name}</b>
            <span className="text-[11.5px] text-muted">{r.when}</span>
          </span>
          <span className="flex max-w-[55%] min-w-0 flex-col text-right leading-[1.35]">
            <b className="text-[12.5px] font-medium text-ink">{r.held ? "Thank-you message" : name(r.meet)}</b>
            <span className="text-[11.5px] text-muted">{r.held ? "No times" : r.meet ? "With their rep" : "Form's meeting, their rep"}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
