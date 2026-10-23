// The daily form check in a real browser against the real database (docs/form-builder.md Part 10). A small server
// stands in for the app: the hosted form page, the form script and the public routes (the same acceptFill the app
// runs). Deliveries are sent by the same deliver code the intel worker runs, against fake receivers. Cases: a
// two-step form with a webhook passes every step; a form whose Slack hook was removed fails with the reason; the
// check's fills are tests and never count as leads.
//   PG_URL=… CHROMIUM_PATH=… node scripts/forms-qa-check.ts

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildForms } from "./build-forms.mts";
import { checkForm } from "../src/lib/forms/schema.ts";
import { acceptFill, qaOk, type Incoming } from "../src/lib/forms/submit.ts";
import { TEMPLATES } from "../src/lib/forms/templates.ts";
import { seal } from "../src/lib/seal.ts";
import type { Job } from "../src/lib/jobs.ts";
import { pgRpc } from "../worker-intel/rpc.ts";
import { deliverOnce } from "../worker-intel/jobs/deliver.ts";
import { ctxFor } from "../worker-intel/jobs/imports.ts";
import { handleFormQa } from "../worker/formQa.ts";

process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
const rpc = pgRpc(pool);
const failures: string[] = [];
const check = (ok: boolean, what: string) => {
  if (!ok) failures.push(what);
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
};

const WS = crypto.randomUUID();
const USER = crypto.randomUUID();
await q(`insert into workspaces (id, name) values ($1, 'forms qa check')`, [WS]);
await q(`insert into auth.users (id, email) values ($1, 'qa-check@t.io')`, [USER]);
await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [WS, USER]);
await q(`insert into identity_settings (workspace_id, own_domains) values ($1, '{acme.com}') on conflict (workspace_id) do update set own_domains = excluded.own_domains`, [WS]);

async function live(template: string, dest: { kind: "webhook" | "slack"; url: string; name: string }) {
  const r = checkForm(TEMPLATES.find((t) => t.key === template)!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, $2, $3) returning id`, [WS, template, r.form]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, USER, r.form]);
  await q(`select form_destination_save($1, $2, null, $3, null, $4, '{}', 'upsert', $5)`, [USER, id, dest.kind, dest.name, seal(JSON.stringify({ url: dest.url, secret: "s" }))]);
  return id;
}
const good = await live("event", { kind: "webhook", url: "https://hooks.acme.com/in", name: "CRM webhook" });
const broken = await live("partner", { kind: "slack", url: "https://hooks.slack.com/services/T/B/gone", name: "Slack" });

// The receivers: the webhook answers 200; the removed Slack hook answers 404 no_service.
const received: string[] = [];
const fetcher: typeof fetch = async (input) => {
  const u = String(input);
  if (u.includes("hooks.slack.com")) return new Response("no_service", { status: 404 });
  received.push(u);
  return new Response("ok");
};
// The intel worker's part: send queued deliveries every 300 ms.
let sending = true;
const sender = (async () => {
  while (sending) {
    for (const r of await q(`select id from deliveries where workspace_id = $1 and status in ('queued', 'retrying')`, [WS]))
      await deliverOnce(rpc, { run: { rpc, clean: (w) => ctxFor(pool, w), sleep: async () => {} }, fetcher, resolve: (async () => [{ address: "93.184.216.34", family: 4 }]) as never }, r.id, false).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 300));
  }
})();

const code = Buffer.from(await buildForms());
async function handle(req: IncomingMessage, res: ServerResponse) {
  const u = new URL(req.url!, "http://localhost");
  const send = (status: number, body: unknown) => res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" }).end(JSON.stringify(body));
  if (u.pathname === "/forms/v1.js") return void res.writeHead(200, { "content-type": "text/javascript" }).end(code);
  const page = /^\/f\/([0-9a-f-]{36})$/.exec(u.pathname);
  if (page) return void res.writeHead(200, { "content-type": "text/html" }).end(`<!doctype html><title>Form</title><main><claritia-form form-id="${page[1]}"></claritia-form></main><script src="/forms/v1.js"></script>`);
  const m = /^\/api\/forms\/([0-9a-f-]{36})(\/submit)?$/.exec(u.pathname);
  if (!m) return void res.writeHead(404).end();
  const f = (await q(`select form_public($1) as f`, [m[1]]))[0].f;
  if (!m[2]) return send(200, { ...f, workspace_id: undefined, strict: true });
  let body = "";
  for await (const ch of req) body += ch;
  const raw = JSON.parse(body) as Incoming;
  const r = await acceptFill(rpc, f, raw, await ctxFor(pool, WS), { test: qaOk(m[1], raw.qa, process.env.SECRETS_KEY) });
  return send(r.status, r.body);
}
const server = createServer((req, res) => void handle(req, res).catch(() => res.writeHead(500).end()));
await new Promise<void>((r) => server.listen(0, r));
const appUrl = `http://localhost:${(server.address() as { port: number }).port}`;
const sb = { rpc } as unknown as SupabaseClient;
const job = (form: string) => ({ id: crypto.randomUUID(), workspace_id: WS, kind: "form_qa", key: form, payload: { form_id: form }, attempts: 1, max_attempts: 2 }) as Job;
const opts = { appUrl, secret: process.env.SECRETS_KEY!, chromiumPath: process.env.CHROMIUM_PATH, deliverMs: 10_000, pollMs: 300 };

try {
  check((await handleFormQa(sb, job(good), opts)) === "passed", "a two-step form with a webhook passes the check");
  const c = (await q(`select status, steps, submission_id from form_checks where form_id = $1`, [good]))[0];
  check(JSON.stringify(c.steps.map((s: { name: string; ok: boolean }) => [s.name, s.ok])) === JSON.stringify([["The form loads", true], ["The fill is accepted", true], ["The fill reached Claritia", true], ["Sent to CRM webhook", true]]), "the check keeps each step");
  const s = (await q(`select test, "values" from submissions where id = $1`, [c.submission_id]))[0];
  check(s?.test === true && String(s.values.email).startsWith("qa+") && String(s.values.email).endsWith("@acme.com"), "the check's fill is a test from the workspace's own domain");
  check(received.length === 1, "the destination got the check's fill once");

  check((await handleFormQa(sb, job(broken), opts)) === "failed", "a form whose Slack hook was removed fails the check");
  const b = (await q(`select status, error, steps from form_checks where form_id = $1`, [broken]))[0];
  check(b.status === "failed" && /removed/.test(b.error), `the failure says why (${b.error})`);
  check(b.steps.find((x: { name: string }) => x.name === "The fill is accepted")?.ok === true, "the listbox and website fields were filled like a visitor would");

  const c2 = await pool.connect();
  let list: { id: string; fills: number; check: string }[];
  try {
    await c2.query(`select set_config('request.jwt.claim.sub', $1, false)`, [USER]);
    list = (await c2.query(`select forms_list($1) as l`, [WS])).rows[0].l;
    await c2.query(`select set_config('request.jwt.claim.sub', '', false)`);
  } finally {
    c2.release();
  }
  check(list.length === 2 && list.every((r) => r.fills === 0) && list.find((r) => r.id === good)?.check === "passed" && list.find((r) => r.id === broken)?.check === "failed", "check fills never count as leads, and the list shows each form's last check");

  await q(`update forms set status = 'paused' where id = $1`, [good]);
  check((await handleFormQa(sb, job(good), opts)) === "skipped", "a paused form isn't checked");
} finally {
  sending = false;
  await sender;
  server.close();
  await pool.end();
}
if (failures.length) {
  console.error(`${failures.length} form QA check(s) failed`);
  process.exit(1);
}
console.log("All form QA checks passed");
