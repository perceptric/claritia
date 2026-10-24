// The Workflows editor's state (docs/enrich-workflows-reports.md 2.4): the draft body with its undo history, and the
// edits a person can make. Pure, so tests can run it.

import { emailChanged } from "../../../lib/workflows/check.ts";
import { copyStep, find, insert, move, remove, update, type At } from "../../../lib/workflows/tree.ts";
import { newStepId, type Body, type Step } from "../../../lib/workflows/types.ts";

export type EditorState = { body: Body; past: Body[]; future: Body[]; n: number; lastKey: string | null; lastAt: number };

export const startEditor = (body: Body): EditorState => ({ body, past: [], future: [], n: 0, lastKey: null, lastAt: 0 });

export type Action =
  | { type: "set"; body: Body; key?: string; at?: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; body: Body };

/** Typing in one field joins one undo step (the same key within 1.5 s); anything else is its own. */
export function editorReducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case "set": {
      const at = a.at ?? Date.now();
      const join = !!a.key && a.key === s.lastKey && at - s.lastAt < 1500;
      return { body: a.body, past: join ? s.past : [...s.past.slice(-99), s.body], future: [], n: s.n + 1, lastKey: a.key ?? null, lastAt: at };
    }
    case "undo": {
      const prev = s.past[s.past.length - 1];
      if (!prev) return s;
      return { body: prev, past: s.past.slice(0, -1), future: [s.body, ...s.future], n: s.n + 1, lastKey: null, lastAt: 0 };
    }
    case "redo": {
      const next = s.future[0];
      if (!next) return s;
      return { body: next, past: [...s.past, s.body], future: s.future.slice(1), n: s.n + 1, lastKey: null, lastAt: 0 };
    }
    case "reset":
      return startEditor(a.body);
  }
}

// Edits ---------------------------------------------------------------------------------------------------------------

export const addStep = (b: Body, at: At, step: Step): Body => ({ ...b, steps: insert(b.steps, at, step) });
export const removeStep = (b: Body, id: string): Body => ({ ...b, steps: remove(b.steps, id) });
export const moveStep = (b: Body, id: string, at: At): Body => ({ ...b, steps: move(b.steps, id, at) });

/** A changed step. An email whose words changed loses its approval: a person reads it again before it goes. */
export function patchStep(b: Body, id: string, patch: Partial<Step>): Body {
  const before = find(b.steps, id)?.step;
  const next = update(b.steps, id, patch);
  const after = find(next, id)?.step;
  if (before && after && emailChanged(before, after) && !("approved" in patch)) return { ...b, steps: update(next, id, { approved: false } as Partial<Step>) };
  return { ...b, steps: next };
}

/** A copy right under the original. */
export function duplicateStep(b: Body, id: string): { body: Body; id: string | null } {
  const w = find(b.steps, id);
  if (!w) return { body: b, id: null };
  const c = copyStep(w.step, newStepId);
  if (c.kind === "email") c.approved = false;
  return { body: { ...b, steps: insert(b.steps, { parent: w.parent?.step.id ?? null, path: w.parent?.path, index: w.index + 1 }, c) }, id: c.id };
}

/** Up or down within its own list. */
export function nudge(b: Body, id: string, d: -1 | 1): Body {
  const w = find(b.steps, id);
  if (!w) return b;
  const to = w.index + d;
  if (to < 0 || to >= w.list.length) return b;
  return moveStep(b, id, { parent: w.parent?.step.id ?? null, path: w.parent?.path, index: d > 0 ? to + 1 : to });
}

export type Names = { forms: { id: string; name: string }[]; segments: { id: string; name: string; kind: string }[]; types: { id: string; name: string }[]; members: { id: string; name: string; email: string }[]; outcomes: string[]; dateFields: { key: string; label: string }[]; templates: { id: string; name: string; body: unknown }[] };

export const byId = (xs: { id: string; name: string }[]) => Object.fromEntries(xs.map((x) => [x.id, x.name]));
