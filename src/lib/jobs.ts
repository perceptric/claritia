// The jobs queue from the worker's side (supabase/migrations/020_foundation.sql, 087_job_lanes.sql). A worker claims
// jobs of the kinds it handles, keeps the lease while a job runs, and finishes it. A handler that throws is retried
// later by the database (1, 5, 30 minutes, then 2 and 6 hours); throw `new JobError(msg, { retry: false })` to stop
// retrying. Jobs run in lanes: 0 for what a person waits on, 1 for normal work, 2 for bulk (087_job_lanes.sql).

export type Job = {
  id: string;
  workspace_id: string | null;
  kind: string;
  key: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  priority?: number;
};

/** The one call the queue needs: Supabase's `rpc`, or a fake in tests. */
export type Rpc = (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export class JobError extends Error {
  retry: boolean;
  retryAfterS?: number;
  constructor(message: string, opts: { retry?: boolean; retryAfterS?: number } = {}) {
    super(message);
    this.retry = opts.retry ?? true;
    this.retryAfterS = opts.retryAfterS;
  }
}

async function call<T>(rpc: Rpc, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });

/** Add a job. With a key, it joins the job already waiting for that key. */
export const enqueueJob = (rpc: Rpc, job: { workspaceId: string | null; kind: string; key?: string; payload?: object; delayS?: number; maxAttempts?: number }) =>
  call<string>(rpc, "enqueue_job", {
    p_workspace: job.workspaceId,
    p_kind: job.kind,
    p_key: job.key ?? "",
    p_payload: job.payload ?? {},
    p_delay_s: job.delayS ?? 0,
    p_max_attempts: job.maxAttempts ?? 5,
  });

export type NewJob = { workspaceId: string | null; kind: string; key?: string; payload?: object; delayS?: number; maxAttempts?: number };

/** Add many jobs in one call (enqueue_jobs, 087_job_lanes.sql), with the same rules as enqueueJob. */
export async function enqueueJobs(rpc: Rpc, jobs: NewJob[]): Promise<number> {
  if (!jobs.length) return 0;
  return call<number>(rpc, "enqueue_jobs", {
    p_jobs: jobs.map((j) => ({ workspace_id: j.workspaceId, kind: j.kind, key: j.key ?? "", payload: j.payload ?? {}, delay_s: j.delayS ?? 0, max_attempts: j.maxAttempts ?? 5 })),
  });
}

export type Handler = (job: Job, signal: AbortSignal) => Promise<void>;

/** A deadline for one round of a long job: check `over()` in inner loops, then queue the rest. */
export function budget(ms: number, now: () => number = Date.now) {
  const until = now() + ms;
  return { over: () => now() >= until, left: () => Math.max(0, until - now()) };
}

export type RunOpts = {
  /** The worker is stopping: the handler is told, and a job it stops goes back in line without using a try. */
  stop?: AbortSignal;
  log?: (msg: string) => void;
  /** Tests: how often the lease is kept (default a third of it, at least 5 seconds). */
  keepMs?: number;
};

/**
 * Run one job: keep its lease while the handler works, then finish it. Returns what happened.
 * The signal aborts when the lease is lost (or can't be kept), or when the worker stops.
 */
export async function runJob(rpc: Rpc, worker: string, job: Job, handler: Handler, leaseS = 300, o: RunOpts = {}): Promise<"done" | "failed" | "lost" | "released"> {
  const lease = new AbortController();
  const signal = o.stop ? AbortSignal.any([lease.signal, o.stop]) : lease.signal;
  const every = o.keepMs ?? Math.max(5, leaseS / 3) * 1000;
  let misses = 0;
  const keep = setInterval(() => {
    void call<boolean>(rpc, "extend_job", { p_id: job.id, p_worker: worker, p_lease_s: leaseS }).then(
      (ok) => {
        misses = 0;
        if (!ok) {
          o.log?.(`${job.kind} ${job.id}: lease lost`);
          lease.abort(new Error("The job's lease was lost"));
        }
      },
      (e) => {
        // Two misses in a row and the lease may run out under us: another worker could take the job, so stop.
        misses++;
        o.log?.(`${job.kind} ${job.id}: couldn't keep the lease (${misses}): ${e instanceof Error ? e.message : String(e)}`);
        if (misses >= 2) lease.abort(new Error("The job's lease couldn't be kept"));
      },
    );
  }, every);
  try {
    await handler(job, signal);
    const ok = await call<boolean>(rpc, "finish_job", { p_id: job.id, p_worker: worker, p_ok: true, p_error: null, p_retry_s: null });
    return ok ? "done" : "lost";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // Stopped by the worker shutting down (not by a lost lease): back in line now, and the try doesn't count.
    if (o.stop?.aborted && !lease.signal.aborted) {
      const ok = await call<boolean>(rpc, "release_job", { p_id: job.id, p_worker: worker, p_error: `Stopped with the worker: ${message}`.slice(0, 2000) });
      return ok ? "released" : "lost";
    }
    const err = e instanceof JobError ? e : null;
    const ok = await call<boolean>(rpc, "finish_job", {
      p_id: job.id,
      p_worker: worker,
      p_ok: false,
      p_error: message.slice(0, 2000),
      p_retry_s: err && !err.retry ? -1 : (err?.retryAfterS ?? null),
    });
    return ok ? "failed" : "lost";
  } finally {
    clearInterval(keep);
  }
}

// Waking -----------------------------------------------------------------------------------------------------------

/** Idle loops wait here; a NOTIFY from enqueue_job (or a timeout) wakes the loops that take that lane. */
export class Wake {
  private waiting = new Set<{ lane: number; done: () => void }>();
  /** Wait up to `ms`, or until a job in a lane up to `lane` is ready. */
  wait(ms: number, lane = 2, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const w = { lane, done: () => finish() };
      const t = setTimeout(() => finish(), ms);
      const finish = () => {
        clearTimeout(t);
        this.waiting.delete(w);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      if (signal?.aborted) return finish();
      signal?.addEventListener("abort", finish, { once: true });
      this.waiting.add(w);
    });
  }
  /** A job in `lane` is ready (or, with no lane, anything may be). */
  ring(lane?: number) {
    for (const w of [...this.waiting]) if (lane === undefined || w.lane >= lane) w.done();
  }
}

// Loops ------------------------------------------------------------------------------------------------------------

/** Claim errors wait 1, 2, 4... seconds, up to 30. */
export const claimBackoff = (failures: number) => Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));

/** The loops of one worker process share this: how many jobs run per kind and in the bulk lane, and one claim at a time. */
export class Lanes {
  readonly running = new Map<string, number>();
  bulk = 0;
  private lock: Promise<void> = Promise.resolve();
  readonly o: {
    /** Most bulk-lane (2) jobs at once in this process. */
    bulkMax: number;
    /** Most jobs at once of these kinds in this process. */
    kindMax?: Record<string, number>;
  };
  constructor(o: Lanes["o"]) {
    this.o = o;
  }
  /** The kinds a loop may claim now, and the highest lane. */
  pick(kinds: string[], maxLane: number): { kinds: string[]; maxLane: number } {
    const open = kinds.filter((k) => (this.running.get(k) ?? 0) < (this.o.kindMax?.[k] ?? Infinity));
    return { kinds: open, maxLane: maxLane >= 2 && this.bulk >= this.o.bulkMax ? 1 : maxLane };
  }
  start(job: Job) {
    this.running.set(job.kind, (this.running.get(job.kind) ?? 0) + 1);
    if ((job.priority ?? 1) >= 2) this.bulk++;
  }
  end(job: Job) {
    this.running.set(job.kind, Math.max(0, (this.running.get(job.kind) ?? 1) - 1));
    if ((job.priority ?? 1) >= 2) this.bulk = Math.max(0, this.bulk - 1);
  }
  /** One claim at a time in this process, so the counts above hold. */
  async serial<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.lock;
    let release!: () => void;
    this.lock = new Promise((r) => (release = r));
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

export type LoopOpts = {
  rpc: Rpc;
  worker: string;
  handlers: Record<string, Handler>;
  leaseS?: number;
  /** How long an idle loop waits when no NOTIFY wakes it (a function: asked each time). */
  idleMs?: number | (() => number);
  signal?: AbortSignal;
  log?: (msg: string) => void;
  /** The highest lane this loop takes: 0 keeps it for what people wait on. Default 2 (all). */
  maxLane?: number;
  lanes?: Lanes;
  wake?: Wake;
  /** Tests: the wait between claims after errors. */
  backoff?: (failures: number) => number;
};

/** Claim and run jobs until `signal` aborts. Waits `idleMs` (or until woken) when there's nothing to do. */
export async function jobLoop(o: LoopOpts) {
  const all = Object.keys(o.handlers);
  const lanes = o.lanes ?? new Lanes({ bulkMax: Infinity });
  const maxLane = o.maxLane ?? 2;
  let failures = 0;
  while (!o.signal?.aborted) {
    let job: Job | undefined;
    let claimed = false;
    try {
      job = await lanes.serial(async () => {
        const pick = lanes.pick(all, maxLane);
        if (!pick.kinds.length) return undefined;
        const got = await call<Job[]>(o.rpc, "claim_job_lane", { p_kinds: pick.kinds, p_worker: o.worker, p_lease_s: o.leaseS ?? 300, p_limit: 1, p_max_priority: pick.maxLane });
        const j = got?.[0];
        if (j) lanes.start(j);
        return j;
      });
      claimed = true;
      failures = 0;
    } catch (e) {
      failures++;
      o.log?.(`claim_job_lane failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!claimed) {
      await sleep((o.backoff ?? claimBackoff)(failures), o.signal);
      continue;
    }
    if (!job) {
      const idle = typeof o.idleMs === "function" ? o.idleMs() : o.idleMs;
      if (o.wake) await o.wake.wait(idle ?? 5000, maxLane, o.signal);
      else await sleep(idle ?? 1000, o.signal);
      continue;
    }
    try {
      const handler = o.handlers[job.kind];
      const result = handler
        ? await runJob(o.rpc, o.worker, job, handler, o.leaseS ?? 300, { stop: o.signal, log: o.log })
        : await call<boolean>(o.rpc, "release_job", { p_id: job.id, p_worker: o.worker, p_error: "No handler" }).then(() => "released" as const);
      if (result !== "done") o.log?.(`${job.kind} ${job.id}: ${result}`);
    } catch (e) {
      // finish_job itself failed: the lease runs out and recover_jobs puts the job back.
      o.log?.(`${job.kind} ${job.id}: couldn't finish: ${e instanceof Error ? e.message : String(e)}`);
      await sleep((o.backoff ?? claimBackoff)(1), o.signal);
    } finally {
      lanes.end(job);
    }
  }
}

/**
 * A worker's loops: the first `reserved` only take lane 0 (what people wait on), the rest take every lane, lane 0
 * first, with at most `bulkMax` bulk jobs (and `kindMax` per kind) at once.
 */
export function startLoops(o: Omit<LoopOpts, "maxLane" | "lanes"> & { loops: number; reserved?: number; bulkMax?: number; kindMax?: Record<string, number> }) {
  const reserved = Math.min(o.reserved ?? 2, Math.max(0, o.loops - 1));
  const lanes = new Lanes({ bulkMax: o.bulkMax ?? Math.max(1, o.loops - reserved), kindMax: o.kindMax });
  return Array.from({ length: o.loops }, (_, i) => jobLoop({ ...o, worker: `${o.worker}-${i}`, maxLane: i < reserved ? 0 : 2, lanes }));
}
