// claritia-intel: runs the fast jobs that need no browser (stitch now; lookups, signals and scores next).
// Several claim loops share one pool. SIGTERM lets running jobs finish (Fly gives 30 seconds).
//   DATABASE_URL=… SECRETS_KEY=… node worker-intel/index.ts
// Imports also need SUPABASE_URL and SUPABASE_SECRET_KEY, to read uploaded files from storage. Sources need
// SECRETS_KEY (credentials are sealed with it) and each tool's <PREFIX>_CLIENT_ID and _CLIENT_SECRET to refresh sign-ins.
// Sending needs RESEND_API_KEY (the API for campaigns and domains, SMTP for meeting emails), RESEND_REGION for new
// domains (default us-east-1), SECRETS_KEY (link tokens) and APP_URL when the app isn't at https://app.tryclaritia.com.
// Enrichment uses CORESIGNAL_API_KEY and PDL_API_KEY (a team's own keys come sealed); qualify uses ANTHROPIC_API_KEY.
// The router's alerts use the meeting mailer and a Slack webhook sealed with SECRETS_KEY.
// Calendars need SECRETS_KEY, GOOGLE_, MICROSOFT_ and ZOOM_CLIENT_ID and _CLIENT_SECRET, and APP_URL for push channels.

import { createServer } from "node:http";
import { hostname } from "node:os";
import pg from "pg";
import { startLoops, Wake } from "../src/lib/jobs.ts";
import { linkBase } from "../src/lib/email/render.ts";
import { resendFromEnv } from "../src/lib/email/resend.ts";
import { domainCheck, domainRemove, send } from "./jobs/email.ts";
import { calendarRefresh, calendarWatch, meetingSync } from "./jobs/calendars.ts";
import { calendarReconnect, formNotBooked, mailerFromEnv, meetingAfter, meetingBookLater, meetingNotify, meetingRemind, systemFrom } from "./jobs/meetings.ts";
import { enrichCompany, identityChanged, ipLookup } from "./jobs/company.ts";
import { enrichBackfill, enrichContactJob, qualifyJob } from "./jobs/enrich.ts";
import { workflowRun } from "./jobs/workflows.ts";
import { keysFromEnv } from "../src/lib/enrich/server.ts";
import { accountAlert, scoreAccount, sweepSignals } from "./jobs/signals.ts";
import { importFile, importUndo, pruneImportFiles } from "./jobs/imports.ts";
import { meetingTeamRun, routeJob, routerAlert, routerSla, routingAbandon } from "./jobs/router.ts";
import { formNotify } from "./jobs/forms.ts";
import { segmentRefresh } from "./jobs/segments.ts";
import { scoreRefresh } from "./jobs/scoring.ts";
import { deliver, deliverHeld } from "./jobs/deliver.ts";
import { meetingWebhook } from "./jobs/webhooks.ts";
import { crmActivity, crmPush, sourceHook, sourcePull } from "./jobs/sources.ts";
import { deviceReset, privacy, rebuild, stitch, stitchEvidence } from "./jobs/stitch.ts";
import { pgRpc } from "./rpc.ts";

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));
const port = Number(process.env.PORT || 8080);
const health = (body: object) => createServer((_req, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(body))).listen(port, "0.0.0.0");

if (!process.env.DATABASE_URL) {
  log("not configured", { missing: ["DATABASE_URL"] });
  health({ ok: false, missing: ["DATABASE_URL"] });
  await new Promise(() => {});
}

const loops = Math.max(1, Number(process.env.CONCURRENCY || 4));
// Two connections a loop (a job can hold one while it calls the database through another), plus the timers.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: loops * 2 + 2, statement_timeout: 30_000, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 60_000 });
pool.on("error", (e) => log("pool error", { error: e.message }));
const rpc = pgRpc(pool);
const resend = resendFromEnv();
const company = { ipinfoToken: process.env.IPINFO_TOKEN, ipinfoCompany: process.env.IPINFO_COMPANY === "1", coresignalKey: process.env.CORESIGNAL_API_KEY };
// Meeting emails: raw sends over Resend's SMTP (the invite is a MIME part), from MEETINGS_FROM when a workspace has no
// verified domain.
const meetings = { mailer: mailerFromEnv(), base: linkBase(), from: systemFrom() };
const handlers = {
  stitch: stitch(pool),
  device_reset: deviceReset(pool),
  stitch_evidence: stitchEvidence(pool),
  rebuild: rebuild(pool),
  privacy: privacy(pool),
  identity_changed: identityChanged(pool),
  ip_lookup: ipLookup(pool, company),
  enrich_company: enrichCompany(pool, company),
  enrich_contact: enrichContactJob(rpc, { keys: keysFromEnv() }),
  enrich_backfill: enrichBackfill(rpc),
  qualify: qualifyJob(rpc),
  workflow_run: workflowRun(rpc, { keys: keysFromEnv(), secret: process.env.SECRETS_KEY }),
  score_account: scoreAccount(pool),
  account_alert: accountAlert(pool),
  import_file: importFile(pool, rpc),
  import_undo: importUndo(rpc),
  source_pull: sourcePull(pool, rpc),
  crm_push: crmPush(pool, rpc),
  crm_activity: crmActivity(pool, rpc),
  source_hook: sourceHook(pool, rpc),
  segment_refresh: segmentRefresh(rpc),
  score_refresh: scoreRefresh(pool, rpc),
  deliver: deliver(pool, rpc),
  deliver_held: deliverHeld(pool, rpc),
  send: send(rpc, { sender: resend, base: linkBase() }),
  domain_check: domainCheck(rpc, resend),
  domain_remove: domainRemove(pool, resend),
  meeting_notify: meetingNotify(rpc, meetings),
  meeting_remind: meetingRemind(rpc, meetings),
  meeting_after: meetingAfter(rpc, meetings),
  meeting_book_later: meetingBookLater(rpc, meetings),
  form_not_booked: formNotBooked(rpc),
  form_notify: formNotify(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from, batcher: resend }),
  route: routeJob(rpc),
  meeting_team_run: meetingTeamRun(rpc),
  routing_abandon: routingAbandon(rpc),
  router_alert: routerAlert(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from, batcher: resend }),
  router_sla: routerSla(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from }),
  calendar_refresh: calendarRefresh(rpc),
  calendar_watch: calendarWatch(rpc),
  calendar_reconnect: calendarReconnect(rpc, meetings),
  meeting_sync: meetingSync(rpc),
  meeting_webhook: meetingWebhook(rpc, { base: meetings.base }),
};
const stop = new AbortController();
const worker = `intel-${hostname()}-${process.pid}`;
// Bulk kinds that run long: one at a time per worker, so two of them never take both of the shared loops.
const kindMax = { import_file: 1, source_pull: 1, rebuild: 1, score_refresh: 1, enrich_backfill: 1, deliver_held: 1, segment_refresh: 1, import_undo: 1 };
const reserved = Math.max(0, Math.min(Number(process.env.URGENT_LOOPS ?? 2), loops - 1));

health({ ok: true, worker, kinds: Object.keys(handlers), loops, reserved });
log("intel started", { worker, loops, reserved, secrets: !!process.env.SECRETS_KEY, resend: !!resend, ipinfo: !!company.ipinfoToken, coresignal: !!company.coresignalKey });

// enqueue_job NOTIFYs claritia_jobs when a job is ready now; idle loops wake at once. Without it (a pooler that drops
// LISTEN, or while reconnecting) they look every second.
const wake = new Wake();
let listening = false;
let listenFailures = 0;
const listen = async (): Promise<void> => {
  if (stop.signal.aborted) return;
  const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  let over = false;
  const again = (e: Error) => {
    if (over) return;
    over = true;
    listening = false;
    log("job wake listener stopped", { error: e.message });
    c.end().catch(() => {});
    listenFailures++;
    if (!stop.signal.aborted) setTimeout(() => void listen(), Math.min(30_000, 1000 * 2 ** Math.min(listenFailures, 5))).unref();
  };
  c.on("error", again);
  c.on("end", () => again(new Error("The connection ended")));
  c.on("notification", (n) => wake.ring(Number(n.payload ?? "")));
  try {
    await c.connect();
    await c.query("listen claritia_jobs");
    listening = true;
    listenFailures = 0;
    // Anything queued while the listener was down.
    wake.ring();
    stop.signal.addEventListener("abort", () => {
      over = true;
      void c.end().catch(() => {});
    }, { once: true });
  } catch (e) {
    again(e as Error);
  }
};
void listen();
// Idle loops wait 5 seconds when the listener is up, 1 second when it isn't.
const running = startLoops({ rpc, worker, handlers, loops, reserved, kindMax, leaseS: 120, idleMs: () => (listening ? 5000 : 1000), wake, signal: stop.signal, log: (m) => log(m) });

// Timers: each runs alone in this process (a slow one is skipped, not stacked) and on one worker at a time.
const every = (name: string, ms: number, fn: () => Promise<void>) => {
  let busy = false;
  const tick = async () => {
    if (busy || stop.signal.aborted) return;
    busy = true;
    try {
      await fn();
    } catch (e) {
      log(`${name} failed`, { error: String((e as Error).message ?? e) });
    } finally {
      busy = false;
    }
  };
  setTimeout(() => void tick(), 1000).unref();
  return setInterval(() => void tick(), ms);
};

// Leases that ran out go back in line (recover_jobs takes its own lock, so one worker does it).
const recover = every("job recovery", 30_000, async () => {
  const { data, error } = await rpc("recover_jobs", {});
  if (error) throw new Error(error.message);
  if (Number(data)) log("jobs recovered", { jobs: Number(data) });
});

// The signals sweep, every 30 seconds: it looks first (no connection held), and only then takes the sweep's lock
// inside its own transaction (worker-intel/jobs/signals.ts).
const sweep = every("signals sweep", 30_000, async () => {
  const n = await sweepSignals(pool);
  if (n) log("signals sweep", { visits: n });
});

// Old import files: once an hour, one instance at a time.
const prune = every("import prune", 3_600_000, async () => {
  if (!process.env.SUPABASE_URL) return;
  const c = await pool.connect();
  try {
    await c.query("begin");
    const got = (await c.query(`select pg_try_advisory_xact_lock(hashtext('claritia:import_prune')) as ok`)).rows[0].ok;
    if (got) {
      const n = await pruneImportFiles(rpc);
      if (n) log("import files pruned", { files: n });
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
});

const shutdown = async (sig: string) => {
  log("stopping", { sig });
  stop.abort();
  clearInterval(recover);
  clearInterval(sweep);
  clearInterval(prune);
  await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 25_000))]);
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
