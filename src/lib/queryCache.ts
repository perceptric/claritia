/**
 * A small shared cache for the app's screens (no React here, so it runs in tests).
 *
 * - Keyed queries: one entry per key, shared by every screen that asks for it.
 * - Stale-while-revalidate: a screen paints from the cache at once, and the cache fetches again in the background when
 *   the entry is older than `staleMs`.
 * - Dedupe: two asks for the same key while a fetch is out share that one fetch.
 * - Local updates: `set` changes an entry in place; `mutate` changes it at once, sends the write, and puts it back
 *   (and rethrows) when the write fails.
 * - `invalidate` marks keys stale and fetches again the ones on screen. A key matches its own name or any key that
 *   starts with the name and a colon: `invalidate("meeting_types")` hits `meeting_types:<workspace>`.
 */

export type Snap<T> = { data: T | undefined; error: string; at: number; fetching: boolean };

type Entry = {
  snap: Snap<unknown>;
  promise: Promise<unknown> | null;
  /** Bumped on every local change, so a fetch that started before it can't overwrite it. */
  version: number;
  fetcher: (() => Promise<unknown>) | null;
  subs: Set<() => void>;
  stale: boolean;
  used: number;
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const matches = (key: string, name: string) => key === name || key.startsWith(`${name}:`);

const EMPTY: Snap<never> = Object.freeze({ data: undefined, error: "", at: 0, fetching: false });

export class QueryCache {
  entries = new Map<string, Entry>();
  /** Entries without anyone on screen are dropped past this many (oldest first). */
  limit = 300;
  now: () => number = () => Date.now();
  private clock = 0;

  private entry(key: string): Entry {
    let e = this.entries.get(key);
    if (!e) {
      e = { snap: EMPTY, promise: null, version: 0, fetcher: null, subs: new Set(), stale: false, used: ++this.clock };
      this.entries.set(key, e);
      this.trim(key);
    }
    e.used = ++this.clock;
    return e;
  }

  private trim(keep: string) {
    if (this.entries.size <= this.limit) return;
    const idle = [...this.entries].filter(([k, e]) => k !== keep && !e.subs.size && !e.promise).sort((a, b) => a[1].used - b[1].used);
    for (const [k] of idle.slice(0, this.entries.size - this.limit)) this.entries.delete(k);
  }

  private put(e: Entry, next: Partial<Snap<unknown>>) {
    e.snap = { ...e.snap, ...next };
    for (const fn of [...e.subs]) fn();
  }

  get<T>(key: string): Snap<T> {
    return (this.entries.get(key)?.snap ?? EMPTY) as Snap<T>;
  }

  subscribe(key: string, fn: () => void) {
    const e = this.entry(key);
    e.subs.add(fn);
    return () => {
      e.subs.delete(fn);
    };
  }

  /** Remember how to fetch a key (so `invalidate` can ask again) without fetching now. */
  register(key: string, fn: () => Promise<unknown>) {
    this.entry(key).fetcher = fn;
  }

  /** True when the entry has no data yet, was invalidated, or is older than `staleMs`. */
  isStale(key: string, staleMs: number) {
    const e = this.entries.get(key);
    if (!e || e.snap.at === 0 || e.stale) return true;
    return this.now() - e.snap.at >= staleMs;
  }

  /** Fetch a key, sharing a fetch already out. `force` starts a new one even when one is out. */
  fetch<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
    const e = this.entry(key);
    e.fetcher = fn as () => Promise<unknown>;
    if (e.promise && !force) return e.promise as Promise<T>;
    const started = e.version;
    const p: Promise<T> = Promise.resolve()
      .then(fn)
      .then(
        (data) => {
          if (e.promise === p) e.promise = null;
          // A local change landed while this was out: keep the change (the change refetches if it needs to).
          if (e.version !== started) {
            if (!e.promise) this.put(e, { fetching: false });
            return data;
          }
          e.stale = false;
          this.put(e, { data, error: "", at: this.now(), fetching: !!e.promise });
          return data;
        },
        (err) => {
          if (e.promise === p) e.promise = null;
          if (e.version === started) this.put(e, { error: errorText(err), at: this.now(), fetching: !!e.promise });
          else if (!e.promise) this.put(e, { fetching: false });
          throw err;
        },
      );
    e.promise = p;
    if (!e.snap.fetching) this.put(e, { fetching: true });
    return p;
  }

  /** Put data in an entry now (a write that came back, or a row read elsewhere). */
  set<T>(key: string, next: T | ((prev: T | undefined) => T)) {
    const e = this.entry(key);
    const data = typeof next === "function" ? (next as (p: T | undefined) => T)(e.snap.data as T | undefined) : next;
    // Patching a key nothing has read yet leaves it to be read.
    if (data === undefined && e.snap.data === undefined) return;
    e.version++;
    this.put(e, { data, error: "", at: e.snap.at || this.now() });
  }

  /**
   * Change an entry at once, then send the write. When the write fails the entry goes back to what it was (if nothing
   * else changed it since) and the error is thrown for the screen to show. `refetch` asks the server again afterwards.
   */
  async mutate<T, R = unknown>(key: string, change: (prev: T | undefined) => T, write: () => Promise<R>, opts: { refetch?: boolean } = {}): Promise<R> {
    const e = this.entry(key);
    const before = e.snap;
    this.set<T>(key, change);
    const mine = e.version;
    try {
      const out = await write();
      if (opts.refetch) this.invalidate(key);
      return out;
    } catch (err) {
      if (e.version === mine) {
        e.version++;
        this.put(e, { data: before.data, error: "" });
      } else this.invalidate(key);
      throw err;
    }
  }

  /** Mark keys stale; the ones on screen fetch again now, the rest on their next use. */
  invalidate(name: string | ((key: string) => boolean)) {
    const hit = typeof name === "function" ? name : (k: string) => matches(k, name);
    const out: Promise<unknown>[] = [];
    for (const [k, e] of this.entries) {
      if (!hit(k)) continue;
      e.stale = true;
      if (e.subs.size && e.fetcher) out.push(this.fetch(k, e.fetcher, true).catch(() => undefined));
    }
    return Promise.all(out);
  }

  /** Read every entry whose key matches (to patch one row wherever it's listed). */
  keys(name: string) {
    return [...this.entries.keys()].filter((k) => matches(k, name));
  }

  clear() {
    this.entries.clear();
  }
}

/** The app's one cache. */
export const cache = new QueryCache();
