// One Tia turn on the canvas (docs/email-canvas-b5.md section 2.4): which emails it works on, each with its scope,
// from the chips the person added (or the picked email); and which results can't be applied because their email
// changed while Tia worked. Pure.

import type { Scope } from "./scope.ts";

export type Chip = { email: string; id: string | null };
export type Target = { email: string; scope: Scope };
export const MAX_TURN_EMAILS = 5;

/** The emails of a turn: one per email in the chips (parts gathered, an email chip wins), else the picked email. */
export function turnTargets(chips: Chip[], picked: string | null): Target[] {
  if (!chips.length) return picked ? [{ email: picked, scope: { kind: "email" } }] : [];
  const by = new Map<string, Set<string> | "email">();
  for (const c of chips) {
    const cur = by.get(c.email);
    if (cur === "email") continue;
    if (!c.id) by.set(c.email, "email");
    else by.set(c.email, new Set([...(cur ?? []), c.id]));
  }
  return [...by].slice(0, MAX_TURN_EMAILS).map(([email, v]) => ({ email, scope: v === "email" ? { kind: "email" } : { kind: "parts", ids: [...v] } }));
}

/** Adds a chip unless it's there already; a sixth email is refused. */
export function addChip(chips: Chip[], chip: Chip): { chips: Chip[] } | { error: string } {
  if (chips.some((c) => c.email === chip.email && c.id === chip.id)) return { chips };
  const emails = new Set(chips.map((c) => c.email));
  if (!emails.has(chip.email) && emails.size >= MAX_TURN_EMAILS) return { error: `Tia works on up to ${MAX_TURN_EMAILS} emails at a time` };
  return { chips: [...chips, chip] };
}

/** The results whose email changed while Tia worked (compared with the document sent). */
export function changedMeanwhile<T extends { email: string; sent: string }>(results: T[], now: (email: string) => string): T[] {
  return results.filter((r) => now(r.email) !== r.sent);
}
