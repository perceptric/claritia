// The step tree: finding a step, the step after it, and editing without changing the original. A container step
// (Branch, Split, Wait until) holds two lists; the step after a list's last step is the step after its container.

import type { Step } from "./types.ts";

export type PathName = "yes" | "no" | "a" | "b";

/** A container's lists, in the order they draw. */
export function pathsOf(s: Step): [PathName, Step[]][] {
  if (s.kind === "branch" || s.kind === "wait_until") return [["yes", s.yes], ["no", s.no]];
  if (s.kind === "split") return [["a", s.a], ["b", s.b]];
  return [];
}

export type Where = { step: Step; list: Step[]; index: number; parent: { step: Step; path: PathName } | null; depth: number };

/** Where a step is: its list, its place, its container. */
export function find(steps: Step[], id: string, parent: Where["parent"] = null, depth = 0): Where | null {
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i]!;
    if (s.id === id) return { step: s, list: steps, index: i, parent, depth };
    for (const [path, list] of pathsOf(s)) {
      const hit = find(list, id, { step: s, path }, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Every step, depth first, with how deep it sits. */
export function walk(steps: Step[], fn: (s: Step, depth: number) => void, depth = 0): void {
  for (const s of steps) {
    fn(s, depth);
    for (const [, list] of pathsOf(s)) walk(list, fn, depth + 1);
  }
}

export function countSteps(steps: Step[]): number {
  let n = 0;
  walk(steps, () => n++);
  return n;
}

/** The deepest level of paths (0 for a straight column). */
export function maxDepth(steps: Step[]): number {
  let d = 0;
  walk(steps, (s, depth) => {
    if (pathsOf(s).length) d = Math.max(d, depth + 1);
  });
  return d;
}

/** The step to run after `id` finishes (a container: after its chosen path ends). Null at the end. */
export function nextAfter(steps: Step[], id: string): string | null {
  const w = find(steps, id);
  if (!w) return null;
  const sib = w.list[w.index + 1];
  if (sib) return sib.id;
  return w.parent ? nextAfter(steps, w.parent.step.id) : null;
}

/** The first step on a container's path, or the step after the container when the path is empty. */
export function enterPath(steps: Step[], container: Step, path: PathName): string | null {
  const list = pathsOf(container).find(([p]) => p === path)?.[1] ?? [];
  return list[0]?.id ?? nextAfter(steps, container.id);
}

// Editing (each returns new lists; the old ones are left as they were) ------------------------------------------

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Where to put a step: a list (the top, or a container's path) and a place in it. */
export type At = { parent: string | null; path?: PathName; index: number };

function listAt(steps: Step[], at: At): Step[] | null {
  if (!at.parent) return steps;
  const w = find(steps, at.parent);
  if (!w) return null;
  return pathsOf(w.step).find(([p]) => p === at.path)?.[1] ?? null;
}

export function insert(steps: Step[], at: At, step: Step): Step[] {
  const out = clone(steps);
  const list = listAt(out, at);
  if (!list) return steps;
  list.splice(Math.max(0, Math.min(at.index, list.length)), 0, step);
  return out;
}

export function remove(steps: Step[], id: string): Step[] {
  const out = clone(steps);
  const w = find(out, id);
  if (!w) return steps;
  w.list.splice(w.index, 1);
  return out;
}

export function update(steps: Step[], id: string, patch: Partial<Step>): Step[] {
  const out = clone(steps);
  const w = find(out, id);
  if (!w) return steps;
  w.list[w.index] = { ...w.step, ...patch, id: w.step.id, kind: w.step.kind } as Step;
  return out;
}

/** Move a step to another place. A container can't move into its own paths. */
export function move(steps: Step[], id: string, at: At): Step[] {
  const w = find(steps, id);
  if (!w) return steps;
  if (at.parent && (at.parent === id || find(pathsOf(w.step).flatMap(([, l]) => l), at.parent))) return steps;
  let out = remove(steps, id);
  // Moving down the same list: the gap left behind shifts the place by one.
  const sameList = (at.parent ?? null) === (w.parent?.step.id ?? null) && (at.path ?? null) === (w.parent?.path ?? null);
  const index = sameList && at.index > w.index ? at.index - 1 : at.index;
  out = insert(out, { ...at, index }, w.step);
  return out;
}

/** A copy of a step (and its paths) with new ids. */
export function copyStep(s: Step, newId: () => string): Step {
  const c = clone(s) as Step;
  const fresh = (x: Step) => {
    x.id = newId();
    for (const [, list] of pathsOf(x)) list.forEach(fresh);
  };
  fresh(c);
  return c;
}
