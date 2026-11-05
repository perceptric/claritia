// claritia-intel: runs the jobs that need no browser: emails and sending, forms (alerts, replies, deliveries to the
// tools a form sends to), routing, meetings, calendars and workflows. Several claim loops share one pool. SIGTERM lets
// running jobs finish (Fly gives 30 seconds).
//   DATABASE_URL=… SECRETS_KEY=… node worker-intel/index.ts
// Deliveries need SECRETS_KEY (credentials are sealed with it) and each tool's <PREFIX>_CLIENT_ID and _CLIENT_SECRET to
// refresh sign-ins. Sending needs RESEND_API_KEY (the API for emails and domains, SMTP for meeting emails),
// RESEND_REGION for new domains (default us-east-1), SECRETS_KEY (link tokens) and APP_URL when the app isn't at
// https://app.tryclaritia.com. The router's alerts use the meeting mailer and a Slack webhook sealed with SECRETS_KEY.
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
import { workflowRun } from "./jobs/workflows.ts";
import { meetingTeamRun, routeJob, routerAlert, routerSla, routingAbandon } from "./jobs/router.ts";
import { formNotify, formResume } from "./jobs/forms.ts";
import { deliver, deliverHeld } from "./jobs/deliver.ts";
import { meetingWebhook } from "./jobs/webhooks.ts";
import { trackSend } from "./jobs/track.ts";
import { textSend } from "./jobs/texts.ts";
import { ctxFor } from "./jobs/ctx.ts";
import { sourceHook } from "./jobs/sources.ts";
import { recheckDomains } from "./jobs/linkDomains.ts";
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
// Meeting emails: raw sends over Resend's SMTP (the invite is a MIME part), from MEETINGS_FROM when a workspace has no
// verified domain.
const meetings = { mailer: mailerFromEnv(), base: linkBase(), from: systemFrom() };
const handlers = {
  workflow_run: workflowRun(rpc, { secret: process.env.SECRETS_KEY, base: linkBase() }),
  source_hook: sourceHook(pool, rpc),
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
  form_resume: formResume(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from }),
  route: routeJob(rpc),
  meeting_team_run: meetingTeamRun(rpc),
  routing_abandon: routingAbandon(rpc),
  router_alert: routerAlert(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from, batcher: resend }),
  router_sla: routerSla(rpc, { mailer: meetings.mailer, base: meetings.base, from: meetings.from }),
  calendar_refresh: calendarRefresh(rpc),
  calendar_watch: calendarWatch(rpc),
  calendar_reconnect: calendarReconnect(rpc, meetings),
  meeting_sync: meetingSync(rpc, { base: meetings.base }),
  meeting_webhook: meetingWebhook(rpc, { base: meetings.base }),
  track_send: trackSend(rpc, { clean: (ws) => ctxFor(pool, ws) }),
  text_send: textSend(rpc, { base: meetings.base, mailer: meetings.mailer, from: meetings.from }),
};
const stop = new AbortController();
const worker = `intel-${hostname()}-${process.pid}`;
// Bulk kinds that run long: one at a time per worker, so two of them never take both of the shared loops.
const kindMax = { deliver_held: 1 };
const reserved = Math.max(0, Math.min(Number(process.env.URGENT_LOOPS ?? 2), loops - 1));

health({ ok: true, worker, kinds: Object.keys(handlers), loops, reserved });
log("intel started", { worker, loops, reserved, secrets: !!process.env.SECRETS_KEY, resend: !!resend });

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

// Custom link domains: their DNS checked again every 30 minutes, so one pointed elsewhere stops serving.
const domains = every("link domains", 30 * 60_000, async () => {
  const n = await recheckDomains(pool);
  if (n) log("link domains checked", { domains: n });
});

const shutdown = async (sig: string) => {
  log("stopping", { sig });
  stop.abort();
  clearInterval(recover);
  clearInterval(domains);
  await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 25_000))]);
  await pool.end().catch(() => {});
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
