// A person's role in a workspace, kept in this process for up to a minute so a signed-in request doesn't read
// workspace_members every time. Only a yes is kept: someone not (yet) in the workspace is looked up every time, so a
// new member gets in at once. A removed member keeps their place here for at most the TTL (60 s), or until this
// process changes the membership itself and calls forgetRole. Concurrent lookups for the same pair share one read.
// No "server-only" import, so the database tests can use it through src/app/api/meetings/_lib/host.ts.

export type RoleCache = {
  get(ws: string, user: string, lookup: () => Promise<string | null>): Promise<string | null>;
  forget(ws?: string, user?: string): void;
  size(): number;
};

export function roleCache(o: { ttlMs?: number; max?: number; now?: () => number } = {}): RoleCache {
  const ttl = o.ttlMs ?? 60_000;
  const max = o.max ?? 10_000;
  const now = o.now ?? Date.now;
  const kept = new Map<string, { role: string; until: number }>();
  const inflight = new Map<string, Promise<string | null>>();
  // Bumped by forget, so a lookup that started before it can't put a stale answer back.
  let epoch = 0;
  return {
    async get(ws, user, lookup) {
      const k = `${ws}|${user}`;
      const hit = kept.get(k);
      if (hit && hit.until > now()) {
        // Most recently used goes to the back, so the oldest is dropped first.
        kept.delete(k);
        kept.set(k, hit);
        return hit.role;
      }
      if (hit) kept.delete(k);
      const going = inflight.get(k);
      if (going) return going;
      const started = epoch;
      const p = (async () => {
        try {
          const role = await lookup();
          if (role && started === epoch) {
            kept.set(k, { role, until: now() + ttl });
            while (kept.size > max) kept.delete(kept.keys().next().value!);
          }
          return role;
        } finally {
          inflight.delete(k);
        }
      })();
      inflight.set(k, p);
      return p;
    },
    forget(ws, user) {
      epoch++;
      if (!ws && !user) return kept.clear();
      for (const k of [...kept.keys()]) {
        const [w, u] = k.split("|");
        if ((!ws || w === ws) && (!user || u === user)) kept.delete(k);
      }
    },
    size: () => kept.size,
  };
}

/** The one cache this process shares. */
export const roles = roleCache();

/** Call after this process adds, removes or changes a member (or a whole workspace, with no user). */
export const forgetRole = (ws?: string, user?: string) => roles.forget(ws, user);

/** A small time-limited cache for data that rarely changes (fields, brand kits, settings), cleared on writes here. */
export function ttlCache<V>(o: { ttlMs: number; max?: number; now?: () => number }) {
  const max = o.max ?? 1000;
  const now = o.now ?? Date.now;
  const kept = new Map<string, { v: V; until: number }>();
  const inflight = new Map<string, Promise<V>>();
  let epoch = 0;
  return {
    async get(key: string, load: () => Promise<V>): Promise<V> {
      const hit = kept.get(key);
      if (hit && hit.until > now()) return hit.v;
      if (hit) kept.delete(key);
      const going = inflight.get(key);
      if (going) return going;
      const started = epoch;
      const p = (async () => {
        try {
          const v = await load();
          if (started === epoch) {
            kept.set(key, { v, until: now() + o.ttlMs });
            while (kept.size > max) kept.delete(kept.keys().next().value!);
          }
          return v;
        } finally {
          inflight.delete(key);
        }
      })();
      inflight.set(key, p);
      return p;
    },
    forget(key?: string) {
      epoch++;
      if (key === undefined) kept.clear();
      else kept.delete(key);
    },
    size: () => kept.size,
  };
}
