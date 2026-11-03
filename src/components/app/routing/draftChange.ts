// One change to the routing draft from a page outside the editor (a team's "how they share" pill): the screen shows
// it at once, one save goes out from the revision on screen, and a save that lost a race with another window reads
// the latest draft and applies the change to that once more. A failed save puts the screen back.
// Plain code with no React, so tests can run it against a flaky server (tests/routingDraft.test.ts).

import type { QueryCache } from "../../../lib/queryCache.ts";
import { emptyBody, type RouterBody } from "../../../lib/router/types.ts";

export type DraftState = { live: { body: RouterBody } | null; draft: RouterBody | null; revision: number };

export const draftBase = (d: DraftState) => d.draft ?? d.live?.body ?? emptyBody();

export async function changeDraft<D extends DraftState>(
  cache: QueryCache,
  key: string,
  deps: {
    load: () => Promise<D>;
    save: (body: RouterBody, revision: number) => Promise<{ revision: number; body: RouterBody }>;
    clean: (b: RouterBody) => RouterBody;
  },
  fn: (b: RouterBody) => RouterBody,
): Promise<void> {
  const before = cache.get<D>(key).data;
  const attempt = async (d: D) => {
    const next = deps.clean(fn(draftBase(d)));
    cache.set<D>(key, { ...d, draft: next });
    const out = await deps.save(next, d.revision);
    const cur = cache.get<D>(key).data ?? d;
    cache.set<D>(key, { ...cur, draft: out.body, revision: out.revision });
  };
  try {
    const d = before ?? (await cache.fetch(key, deps.load, true));
    try {
      await attempt(d);
    } catch (e) {
      if (!/changed the draft/i.test(e instanceof Error ? e.message : String(e))) throw e;
      await attempt(await cache.fetch(key, deps.load, true));
    }
  } catch (e) {
    if (before) cache.set<D>(key, before);
    throw e;
  }
}
