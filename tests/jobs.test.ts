import assert from "node:assert/strict";
import { test } from "node:test";
import { budget, claimBackoff, enqueueJob, enqueueJobs, JobError, jobLoop, Lanes, runJob, startLoops, Wake, type Job, type Rpc } from "../src/lib/jobs.ts";

const job = (over: Partial<Job> = {}): Job => ({ id: "j1", workspace_id: "w", kind: "stitch", key: "dev-1", payload: {}, attempts: 1, max_attempts: 5, ...over });

function fakeRpc(answers: Record<string, unknown> = {}) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const rpc: Rpc = async (fn, args) => {
    calls.push({ fn, args });
    const a = answers[fn];
    return { data: typeof a === "function" ? (a as () => unknown)() : (a ?? true), error: null };
  };
  return { rpc, calls };
}

test("a job that works is finished as done", async () => {
  const { rpc, calls } = fakeRpc();
  assert.equal(await runJob(rpc, "w1", job(), async () => {}), "done");
  assert.deepEqual(calls.at(-1), { fn: "finish_job", args: { p_id: "j1", p_worker: "w1", p_ok: true, p_error: null, p_retry_s: null } });
});

test("a job that throws is finished as failed, retried by the database's schedule", async () => {
  const { rpc, calls } = fakeRpc();
  assert.equal(await runJob(rpc, "w1", job(), async () => { throw new Error("IPinfo said 503"); }), "failed");
  assert.equal(calls.at(-1)!.args.p_error, "IPinfo said 503");
  assert.equal(calls.at(-1)!.args.p_retry_s, null);
});

test("JobError can stop retries or set the wait", async () => {
  const { rpc, calls } = fakeRpc();
  await runJob(rpc, "w1", job(), async () => { throw new JobError("bad input", { retry: false }); });
  assert.equal(calls.at(-1)!.args.p_retry_s, -1);
  await runJob(rpc, "w1", job(), async () => { throw new JobError("rate limited", { retryAfterS: 30 }); });
  assert.equal(calls.at(-1)!.args.p_retry_s, 30);
});

test("a lost lease is reported, and aborts the handler", async () => {
  const { rpc } = fakeRpc({ extend_job: false, finish_job: false });
  let aborted = false;
  const result = await runJob(rpc, "w1", job(), async (_j, signal) => {
    await new Promise((r) => setTimeout(r, 5_200));
    aborted = signal.aborted;
  }, 10);
  assert.equal(result, "lost");
  assert.ok(aborted, "the handler wasn't told the lease was lost");
});

test("enqueueJob passes defaults", async () => {
  const { rpc, calls } = fakeRpc({ enqueue_job: "new-id" });
  assert.equal(await enqueueJob(rpc, { workspaceId: "w", kind: "score", key: "acct-1" }), "new-id");
  assert.deepEqual(calls[0], { fn: "enqueue_job", args: { p_workspace: "w", p_kind: "score", p_key: "acct-1", p_payload: {}, p_delay_s: 0, p_max_attempts: 5 } });
});

test("the loop claims only the kinds it handles and runs each job", async () => {
  const ac = new AbortController();
  let claims = 0;
  const { rpc, calls } = fakeRpc({ claim_job_lane: () => (++claims === 1 ? [job({ kind: "score" })] : []) });
  const ran: string[] = [];
  const loop = jobLoop({ rpc, worker: "w1", handlers: { score: async (j) => void ran.push(j.kind) }, idleMs: 10, signal: ac.signal });
  await new Promise((r) => setTimeout(r, 60));
  ac.abort();
  await loop;
  assert.deepEqual(ran, ["score"]);
  const claim = calls.find((c) => c.fn === "claim_job_lane")!.args;
  assert.deepEqual(claim.p_kinds, ["score"]);
  assert.equal(claim.p_max_priority, 2);
});

const tick = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("claim errors back off 1, 2, 4... seconds up to 30, and a good claim resets it", async () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map(claimBackoff), [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  const ac = new AbortController();
  let n = 0;
  const waits: number[] = [];
  const rpc: Rpc = async (fn) => {
    if (fn !== "claim_job_lane") return { data: true, error: null };
    n++;
    // Down for three claims, then up (empty), then down again.
    return n <= 3 || n === 5 ? { data: null, error: { message: "connection refused" } } : { data: [], error: null };
  };
  const logs: string[] = [];
  const loop = jobLoop({ rpc, worker: "w1", handlers: { score: async () => {} }, idleMs: 1, signal: ac.signal, log: (m) => logs.push(m), backoff: (f) => (waits.push(f), 1) });
  while (n < 6) await tick(2);
  ac.abort();
  await loop;
  assert.deepEqual(waits.slice(0, 4), [1, 2, 3, 1], "failures count up, and start again after a good claim");
  assert.ok(logs.some((l) => /claim_job_lane failed: .*connection refused/.test(l)));
});

test("shutdown: the running job is told, and goes back in line without using a try", async () => {
  const stop = new AbortController();
  const { rpc, calls } = fakeRpc({ release_job: true });
  let told = false;
  const running = runJob(rpc, "w1", job(), async (_j, signal) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    told = true;
    throw new Error("Stopped");
  }, 120, { stop: stop.signal });
  await tick(5);
  stop.abort();
  assert.equal(await running, "released");
  assert.ok(told);
  assert.ok(calls.some((c) => c.fn === "release_job" && c.args.p_id === "j1" && c.args.p_worker === "w1"));
  assert.ok(!calls.some((c) => c.fn === "finish_job"), "a stopped job isn't finished as failed");
});

test("shutdown: a job that ends anyway is finished as done", async () => {
  const stop = new AbortController();
  const { rpc, calls } = fakeRpc();
  const running = runJob(rpc, "w1", job(), async () => {
    stop.abort();
    await tick(1);
  }, 120, { stop: stop.signal });
  assert.equal(await running, "done");
  assert.equal(calls.at(-1)!.fn, "finish_job");
});

test("a lease that can't be kept is logged and stops the handler (two misses in a row)", async () => {
  let extends_ = 0;
  const rpc: Rpc = async (fn) => {
    if (fn === "extend_job") return (extends_++, { data: null, error: { message: "timeout" } });
    if (fn === "finish_job") return { data: false, error: null };
    return { data: true, error: null };
  };
  const logs: string[] = [];
  let reason = "";
  const result = await runJob(rpc, "w1", job(), async (_j, signal) => {
    await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    reason = String((signal.reason as Error)?.message ?? signal.reason);
    throw new Error("Stopped");
  }, 30, { keepMs: 15, log: (m) => logs.push(m) });
  assert.equal(result, "lost");
  assert.equal(extends_, 2);
  assert.match(reason, /couldn't be kept/);
  assert.equal(logs.filter((l) => /couldn't keep the lease/.test(l)).length, 2, "every miss is logged, none swallowed");
});

test("one missed lease extension followed by a good one doesn't stop the job", async () => {
  let n = 0;
  const rpc: Rpc = async (fn) => (fn === "extend_job" ? (++n === 1 ? { data: null, error: { message: "blip" } } : { data: true, error: null }) : { data: true, error: null });
  let aborted = false;
  const result = await runJob(rpc, "w1", job(), async (_j, signal) => {
    await tick(80);
    aborted = signal.aborted;
  }, 30, { keepMs: 15 });
  assert.equal(result, "done");
  assert.equal(aborted, false);
});

test("lanes: two loops keep to lane 0, the rest take every lane with at most bulkMax bulk jobs", async () => {
  const ac = new AbortController();
  const maxes: number[] = [];
  let bulkGiven = false;
  const rpc: Rpc = async (fn, args) => {
    if (fn !== "claim_job_lane") return { data: true, error: null };
    maxes.push(Number(args.p_max_priority));
    if (Number(args.p_max_priority) === 2 && !bulkGiven) {
      bulkGiven = true;
      return { data: [job({ id: "bulk", kind: "enrich_contact", priority: 2 })], error: null };
    }
    return { data: [], error: null };
  };
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  const loops = startLoops({ rpc, worker: "w", loops: 4, reserved: 2, bulkMax: 1, handlers: { enrich_contact: () => held, meeting_notify: async () => {} }, idleMs: 5, signal: ac.signal });
  await tick(60);
  // While the bulk job runs, the other shared loop asks for lanes 0 and 1 only.
  const during = maxes.slice(-6);
  release();
  ac.abort();
  await Promise.all(loops);
  assert.ok(maxes.filter((m) => m === 0).length >= 2, "the reserved loops claim lane 0 only");
  assert.ok(during.includes(1) && !during.includes(2), `the bulk cap holds: ${during}`);
});

test("lanes: a kind at its cap isn't claimed again until one ends", () => {
  const l = new Lanes({ bulkMax: 2, kindMax: { import_file: 1 } });
  assert.deepEqual(l.pick(["import_file", "stitch"], 2).kinds, ["import_file", "stitch"]);
  l.start(job({ kind: "import_file", priority: 2 }));
  assert.deepEqual(l.pick(["import_file", "stitch"], 2), { kinds: ["stitch"], maxLane: 2 });
  l.start(job({ kind: "enrich_contact", priority: 2 }));
  assert.equal(l.pick(["stitch"], 2).maxLane, 1, "two bulk jobs: no third");
  l.end(job({ kind: "import_file", priority: 2 }));
  assert.deepEqual(l.pick(["import_file", "stitch"], 2), { kinds: ["import_file", "stitch"], maxLane: 2 });
});

test("an idle loop wakes at once when a job in its lane is queued, and not for a lane it doesn't take", async () => {
  const w = new Wake();
  const t0 = Date.now();
  const urgent = w.wait(5000, 0);
  const all = w.wait(5000, 2);
  w.ring(2);
  await all;
  assert.ok(Date.now() - t0 < 1000, "a bulk job wakes the shared loops");
  let woke = false;
  void urgent.then(() => (woke = true));
  await tick(10);
  assert.equal(woke, false, "a lane-0 loop sleeps through a bulk job");
  w.ring(0);
  await urgent;
});

test("enqueueJobs sends one call; budget runs out", async () => {
  const { rpc, calls } = fakeRpc({ enqueue_jobs: 2 });
  assert.equal(await enqueueJobs(rpc, [{ workspaceId: "w", kind: "score_account", key: "a" }, { workspaceId: "w", kind: "score_account", key: "b", delayS: 60 }]), 2);
  assert.equal(calls.length, 1);
  assert.deepEqual((calls[0].args.p_jobs as { key: string; delay_s: number }[]).map((j) => [j.key, j.delay_s]), [["a", 0], ["b", 60]]);
  assert.equal(await enqueueJobs(rpc, []), 0);
  let now = 0;
  const b = budget(100, () => now);
  assert.equal(b.over(), false);
  now = 100;
  assert.equal(b.over(), true);
});
