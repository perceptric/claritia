// The canvas's one undo history (docs/email-canvas-b4.md section 4.3): a step holds, for each email it touched, the
// document and subject before and after, and for each brand kit, the styles before and after, so a move between two
// emails or a brand-wide change is one step. Changes with the same merge key within a second join one step; a key
// starting with "~" (a typing run) joins however long the pauses are. At most 100 steps. Pure.

import type { EmailDoc } from "../design/email/doc.ts";
import type { DesignSystem } from "../design/model.ts";

export type Snap = { doc: EmailDoc; subject: string };
export type Step = {
  key?: string;
  at: number;
  label: string;
  emails: Record<string, { before: Snap; after: Snap }>;
  kits: Record<string, { before: DesignSystem; after: DesignSystem }>;
};
export type History = { past: Step[]; future: Step[] };
export type Restore = { emails: Record<string, Snap>; kits: Record<string, DesignSystem>; label: string };

export const MAX_STEPS = 100;
export const MERGE_MS = 1000;
export const emptyHistory = (): History => ({ past: [], future: [] });

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** True when every email and kit in the step ends as it started. */
export function isEmpty(step: Step): boolean {
  return Object.values(step.emails).every((e) => same(e.before.doc, e.after.doc) && e.before.subject === e.after.subject) && Object.values(step.kits).every((k) => same(k.before, k.after));
}

const keysOf = (s: Step) => [...Object.keys(s.emails).map((k) => `e:${k}`), ...Object.keys(s.kits).map((k) => `k:${k}`)].sort().join("|");

/** Adds a step: it joins the last one when the merge rules allow, clears redo, and keeps at most 100. */
export function push(h: History, step: Step, now: number = step.at): History {
  const last = h.past[h.past.length - 1];
  const joins = !!step.key && !!last && last.key === step.key && keysOf(last) === keysOf(step) && (step.key.startsWith("~") || now - last.at <= MERGE_MS);
  if (joins) {
    const merged: Step = {
      ...last,
      at: now,
      emails: Object.fromEntries(Object.entries(last.emails).map(([id, e]) => [id, { before: e.before, after: step.emails[id]!.after }])),
      kits: Object.fromEntries(Object.entries(last.kits).map(([id, k]) => [id, { before: k.before, after: step.kits[id]!.after }])),
    };
    const past = h.past.slice(0, -1);
    return { past: isEmpty(merged) ? past : [...past, merged], future: [] };
  }
  if (isEmpty(step)) return h;
  return { past: [...h.past, { ...step, at: now }].slice(-MAX_STEPS), future: [] };
}

const restoreOf = (s: Step, side: "before" | "after"): Restore => ({
  emails: Object.fromEntries(Object.entries(s.emails).map(([id, e]) => [id, e[side]])),
  kits: Object.fromEntries(Object.entries(s.kits).map(([id, k]) => [id, k[side]])),
  label: s.label,
});

/** Takes back the last step: what to put back. */
export function undo(h: History): { h: History; restore: Restore } | null {
  const s = h.past[h.past.length - 1];
  if (!s) return null;
  return { h: { past: h.past.slice(0, -1), future: [s, ...h.future] }, restore: restoreOf(s, "before") };
}

/** Does the last undone step again. */
export function redo(h: History): { h: History; restore: Restore } | null {
  const s = h.future[0];
  if (!s) return null;
  return { h: { past: [...h.past, s], future: h.future.slice(1) }, restore: restoreOf(s, "after") };
}

/** Drops every step that touches a kit (after someone else saved its styles first); email-only steps stay. */
export function dropKit(h: History, kitId: string): History {
  const keep = (s: Step) => !(kitId in s.kits);
  return { past: h.past.filter(keep), future: h.future.filter(keep) };
}

