// claritia-intel: runs the fast jobs that need no browser (stitch now; lookups, signals and scores next).
// Several claim loops share one pool. SIGTERM lets running jobs finish (Fly gives 30 seconds).
//   DATABASE_URL=… SECRETS_KEY=… node worker-intel/index.ts
// Imports also need SUPABASE_URL and SUPABASE_SECRET_KEY, to read uploaded files from storage. Sources need
// SECRETS_KEY (credentials are sealed with it) and each tool's <PREFIX>_CLIENT_ID and _CLIENT_SECRET to refresh sign-ins.
// Sending needs AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_REGION, SES_CONFIGURATION_SET, SECRETS_KEY (link tokens)
// and APP_URL when the app isn't at https://app.tryclaritia.com.
// The router's alerts use the meeting mailer and a Slack webhook sealed with SECRETS_KEY.
// Calendars need SECRETS_KEY, GOOGLE_, MICROSOFT_ and ZOOM_CLIENT_ID and _CLIENT_SECRET, and APP_URL for push channels.

import { createServer } from "node:http";
import { hostname } from "node:os";
import pg from "pg";
import { jobLoop } from "../src/lib/jobs.ts";
import { linkBase } from "../src/lib/email/render.ts";
import { sesFromEnv } from "../src/lib/email/ses.ts";
import { domainCheck, domainRemove, send } from "./jobs/email.ts";
import { calendarRefresh, calendarWatch, meetingSync } from "./jobs/calendars.ts";
import { calendarReconnect, formNotBooked, mailerFromEnv, meetingAfter, meetingBookLater, meetingNotify, meetingRemind, systemFrom } from "./jobs/meetings.ts";
import { enrichCompany, identityChanged, ipLookup } from "./jobs/company.ts";
import { accountAlert, scoreAccount, sweepSignals } from "./jobs/signals.ts";
import { importFile, importUndo, pruneImportFiles } from "./jobs/imports.ts";
import { routeJob, routerAlert } from "./jobs/router.ts";
import { segmentRefresh } from "./jobs/segments.ts";
import { deliver, deliverHeld } from "./jobs/deliver.ts";
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
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: loops + 2, statement_timeout: 30_000 });
const rpc = pgRpc(pool);
const ses = sesFromEnv();
const company = { ipinfoToken: process.env.IPINFO_TOKEN, ipinfoCompany: process.env.IPINFO_COMPANY === "1", coresignalKey: process.env.CORESIGNAL_API_KEY };
// Meeting emails: SES raw sends (the invite is a MIME part), from MEETINGS_FROM when a workspace has no verified domain.
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
  score_account: scoreAccount(pool),
  account_alert: accountAlert(pool),
  import_file: importFile(pool, rpc),
  import_undo: importUndo(rpc),
  source_pull: sourcePull(pool, rpc),
  crm_push: crmPush(pool, rpc),
  crm_activity: crmActivity(pool, rpc),
  source_hook: sourceHook(pool, rpc),
  segment_refresh: segmentRefresh(rpc),
  deliver: deliver(pool, rpc),
  deliver_held: deliverHeld(pool, rpc),
  send: send(rpc, { ses, base: linkBase() }),
  domain_check: domainCheck(rpc, ses),
  domain_remove: domainRemove(pool, ses),
  meeting_notify: meetingNotify(rpc, meetings),
  meeting_remind: meetingRemind(rpc, meetings),
  meeting_after: meetingAfter(rpc, meetings),
  meeting_book_later: meetingBookLater(rpc, meetings),
  form_not_booked: formNotBooked(rpc),
  route: routeJob(rpc),
  router_alert: routerAlert(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from }),
  calendar_refresh: calendarRefresh(rpc),
  calendar_watch: calendarWatch(rpc),
  calendar_reconnect: calendarReconnect(rpc, meetings),
  meeting_sync: meetingSync(rpc),
};
const stop = new AbortController();
const worker = `intel-${hostname()}-${process.pid}`;

health({ ok: true, worker, kinds: Object.keys(handlers), loops });
log("intel started", { worker, loops, secrets: !!process.env.SECRETS_KEY, ses: !!ses, ipinfo: !!company.ipinfoToken, coresignal: !!company.coresignalKey });
const running = Array.from({ length: loops }, (_, i) => jobLoop({ rpc, worker: `${worker}-${i}`, handlers, leaseS: 120, idleMs: 1000, signal: stop.signal, log: (m) => log(m) }));

// The signals sweep: one instance at a time (session advisory lock), every 30 seconds.
const sweep = setInterval(async () => {
  const c = await pool.connect().catch(() => null);
  if (!c) return;
  try {
    const got = (await c.query(`select pg_try_advisory_lock(hashtext('claritia:signals_sweep')) as ok`)).rows[0].ok;
    if (!got) return;
    try {
      const n = await sweepSignals(pool);
      if (n) log("signals sweep", { visits: n });
    } finally {
      await c.query(`select pg_advisory_unlock(hashtext('claritia:signals_sweep'))`);
    }
  } catch (e) {
    log("signals sweep failed", { error: String((e as Error).message ?? e) });
  } finally {
    c.release();
  }
}, 30_000);

// Old import files: once an hour, one instance at a time.
const prune = setInterval(async () => {
  if (!process.env.SUPABASE_URL) return;
  const c = await pool.connect().catch(() => null);
  if (!c) return;
  try {
    const got = (await c.query(`select pg_try_advisory_lock(hashtext('claritia:import_prune')) as ok`)).rows[0].ok;
    if (!got) return;
    try {
      const n = await pruneImportFiles(rpc);
      if (n) log("import files pruned", { files: n });
    } finally {
      await c.query(`select pg_advisory_unlock(hashtext('claritia:import_prune'))`);
    }
  } catch (e) {
    log("import prune failed", { error: String((e as Error).message ?? e) });
  } finally {
    c.release();
  }
}, 3_600_000);

const shutdown = async (sig: string) => {
  log("stopping", { sig });
  stop.abort();
  clearInterval(sweep);
  clearInterval(prune);
  await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 25_000))]);
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
