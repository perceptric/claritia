// Forms on a real database (docs/form-builder.md Part 12): a fill sent again lands once; spam never becomes a contact;
// consent keeps its wording; HubSpot failing, then timing out after it made the record, ends with one HubSpot contact;
// Slack down for hours waits and sends once; a paused destination holds and then sends in order; two workers can't
// send the same delivery; a field removed later still shows on old fills.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { labeled, signature, type Taken } from "../../src/lib/delivery/send.ts";
import { checkForm, type Form } from "../../src/lib/forms/schema.ts";
import { prepareSubmit } from "../../src/lib/forms/submit.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";
import { seal } from "../../src/lib/seal.ts";
import type { RunOpts } from "../../src/lib/sources/run.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { deliverHeld, deliverOnce } from "../../worker-intel/jobs/deliver.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";
import { FakeHubspot, rng } from "../sources/fakeHubspot.ts";

process.env.SECRETS_KEY ||= "test-secrets-key-that-is-long-enough-1234";
const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const rpc = pgRpc(pool);

async function workspace(name: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}

/** A live form from a template, published through the same function the app uses. */
async function liveForm(ws: string, user: string, template = "contact_sales") {
  const r = checkForm(TEMPLATES.find((t) => t.key === template)!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Contact', $2) returning id`, [ws, r.form]))[0].id as string;
  const v = (await q(`select form_publish($1, $2, $3) as v`, [id, user, r.form]))[0].v as number;
  return { id, form: r.form, version: v };
}

async function destination(user: string, form: string, kind: "slack" | "webhook" | "source", o: { source?: string; secret?: object; name?: string } = {}) {
  return (await q(`select form_destination_save($1, $2, null, $3, $4, $5, '{}', 'upsert', $6) as id`, [user, form, kind, o.source ?? null, o.name ?? kind, o.secret ? seal(JSON.stringify(o.secret)) : null]))[0]
    .id as string;
}

/** A fill as the route makes it, through the same checks. */
async function submit(f: { id: string; form: Form; version: number }, ws: string, answers: Record<string, string>, extra: Record<string, unknown> = {}) {
  const fields = f.form.steps.flatMap((s) => s.fields);
  const byKey = Object.fromEntries(Object.entries(answers).map(([k, v]) => [fields.find((x) => x.key === k)!.id, v]));
  const r = prepareSubmit(f.form, f.version, { v: 1, version: f.version, key: "k".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20), answers: byKey, ms: 5000, ...extra }, await ctxFor(pool, ws));
  if (!("args" in r)) throw new Error(JSON.stringify(r));
  const out = (await q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [f.id, r.args.p_version, r.args.p_idem, r.args.p_values, r.args.p_hidden, r.args.p_contact, r.args.p_consent, r.args.p_country, r.args.p_spam]))[0].r;
  return { ...out, args: r.args } as { id: string; contact_id: string | null; repeat: boolean; args: typeof r.args };
}

const SALES = { name: "Ana Diaz", email: "ana@acme.com", phone: "+1 415 555 0132", company: "Acme", "q.message": "Pricing please" };

/** A Slack, webhook or anything that counts what it got and fails while `down` says so. */
function fakeHttp(down: () => boolean) {
  const got: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    if (down()) return new Response("upstream down", { status: 503 });
    got.push({ url: String(input), body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    return new Response("ok", { status: 200 });
  };
  return { got, fetcher };
}

const sendWith = (fetcher: typeof fetch, extra: Partial<RunOpts> = {}) => ({
  run: { rpc, clean: (w: string) => ctxFor(pool, w), sleep: async () => {}, ...extra } as RunOpts,
  fetcher,
  resolve: (async () => [{ address: "93.184.216.34", family: 4 }]) as never,
});

test("a fill sent 3 times, and again a day later from the browser's queue, lands once with one delivery per destination", async () => {
  const { ws, user } = await workspace("forms-repeat");
  const f = await liveForm(ws, user);
  await destination(user, f.id, "slack", { secret: { url: "https://hooks.slack.com/services/T/B/x" } });
  await destination(user, f.id, "webhook", { secret: { url: "https://hooks.acme.com/in", secret: "s3cret" } });
  const first = await submit(f, ws, SALES);
  const again = await Promise.all([1, 2, 3].map(() => q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [f.id, f.version, first.args.p_idem, first.args.p_values, first.args.p_hidden, first.args.p_contact, first.args.p_consent, null, null])));
  for (const a of again) {
    assert.equal(a[0].r.id, first.id);
    assert.equal(a[0].r.repeat, true);
  }
  assert.equal((await q(`select count(*)::int n from submissions where workspace_id = $1`, [ws]))[0].n, 1);
  assert.equal((await q(`select count(*)::int n from contacts where workspace_id = $1`, [ws]))[0].n, 1);
  assert.equal((await q(`select count(*)::int n from deliveries where submission_id = $1`, [first.id]))[0].n, 2);
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'deliver' and workspace_id = $1`, [ws]))[0].n, 2);
  const c = (await q(`select email_clean, first_name, last_name, company_id, source from contacts where id = $1`, [first.contact_id]))[0];
  assert.deepEqual([c.email_clean, c.first_name, c.last_name, c.source], ["ana@acme.com", "Ana", "Diaz", "form"]);
  assert.ok(c.company_id, "the work email's company is set");
  const ev = await q(`select kind, data from contact_events where contact_id = $1 and kind = 'form.submitted'`, [first.contact_id]);
  assert.equal(ev.length, 1);
  assert.equal(ev[0].data.submission_id, first.id);
});

test("spam is kept apart: no contact, no delivery; and the server refuses a free email on a work email field", async () => {
  const { ws, user } = await workspace("forms-spam");
  const f = await liveForm(ws, user);
  await destination(user, f.id, "slack", { secret: { url: "https://hooks.slack.com/services/T/B/x" } });
  const trapped = await submit(f, ws, SALES, { trap: "http://spam.biz" });
  const fast = await submit(f, ws, { ...SALES, email: "bot@acme.com" }, { ms: 100 });
  for (const s of [trapped, fast]) {
    assert.equal(s.contact_id, null);
    assert.equal((await q(`select count(*)::int n from deliveries where submission_id = $1`, [s.id]))[0].n, 0);
  }
  assert.deepEqual((await q(`select spam_reason from submissions where workspace_id = $1 order by created_at`, [ws])).map((r) => r.spam_reason), ["trap", "too_fast"]);
  assert.equal((await q(`select count(*)::int n from contacts where workspace_id = $1`, [ws]))[0].n, 0);
  const fields = f.form.steps[0].fields;
  const email = fields.find((x) => x.key === "email")!;
  const r = prepareSubmit(f.form, f.version, { v: 1, version: f.version, key: "x".repeat(20), answers: { [email.id]: "ana@gmail.com" }, ms: 5000 }, await ctxFor(pool, ws));
  assert.ok("errors" in r && r.errors[email.id] === "Use your work email.");
  const stale = prepareSubmit(f.form, f.version, { v: 1, version: f.version - 1, key: "x".repeat(20), answers: {}, ms: 5000 }, await ctxFor(pool, ws));
  assert.ok("error" in stale && stale.status === 409);
});

test("consent keeps the form's own wording, and an unticked box records nothing", async () => {
  const { ws, user } = await workspace("forms-consent");
  const f = await liveForm(ws, user, "newsletter");
  const ticked = await submit(f, ws, { email: "lea@acme.de" }, { consent: { given: true, wording: "something else the browser claims" } });
  const unticked = await submit(f, ws, { email: "max@acme.de" }, { consent: { given: false } });
  const rows = await q(`select contact_id, basis, status, wording from consents where workspace_id = $1`, [ws]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].contact_id, ticked.contact_id);
  assert.equal(rows[0].basis, "opt_in");
  assert.equal(rows[0].wording, f.form.consent.label);
  assert.ok(unticked.contact_id);
});

test("HubSpot down, then timing out after it made the record: one HubSpot contact, its id kept, a link to it", async () => {
  const { ws, user } = await workspace("forms-hubspot");
  const hs = new FakeHubspot(rng(7), { portal: 4242 });
  const creds = { type: "oauth", access: "t1", refresh: "r1", expiresAt: Date.now() + 3_600_000 };
  // The source only pulls: the form's choice is what sends contacts out.
  const source = (await q(`select source_connect($1, $2, 'hubspot', 'HubSpot', '4242', $3, $4) as id`, [ws, user, seal(JSON.stringify(creds)), JSON.stringify({ objects: { contacts: "in" } })]))[0].id;
  const f = await liveForm(ws, user);
  const dest = await destination(user, f.id, "source", { source, name: "HubSpot" });
  const s = await submit(f, ws, SALES);
  const delivery = (await q(`select id from deliveries where submission_id = $1 and destination_id = $2`, [s.id, dest]))[0].id as string;

  let mode: "down" | "lost" | "up" = "down";
  const fetcher: typeof fetch = async (input, init) => {
    const isUpsert = String(input).includes("/batch/upsert");
    if (mode === "down" && isUpsert) return new Response("{}", { status: 500 });
    if (mode === "lost" && isUpsert) {
      await hs.fetch(input, init); // HubSpot makes it…
      throw new TypeError("socket hang up"); // …and the answer never comes back.
    }
    return hs.fetch(input, init);
  };
  const send = sendWith(fetcher, { fetcher });
  assert.ok((await deliverOnce(rpc, send, delivery, false)).retry, "a 500 retries");
  mode = "lost";
  assert.ok((await deliverOnce(rpc, send, delivery, false)).retry, "a lost answer retries");
  assert.equal((await q(`select status from deliveries where id = $1`, [delivery]))[0].status, "retrying");
  mode = "up";
  assert.deepEqual(await deliverOnce(rpc, send, delivery, false), {});
  const live = hs.live().filter((c) => c.properties.email === "ana@acme.com");
  assert.equal(live.length, 1, "one HubSpot contact");
  const d = (await q(`select status, external_id, external_url, attempts, error from deliveries where id = $1`, [delivery]))[0];
  assert.equal(d.status, "done");
  assert.equal(d.external_id, live[0].id);
  assert.equal(d.external_url, `https://app.hubspot.com/contacts/4242/record/0-1/${live[0].id}`);
  assert.equal(d.attempts, 3);
  assert.equal(d.error, null);
  const link = await q(`select external_id from source_links where source_id = $1 and object = 'contact' and local_id = $2`, [source, s.contact_id]);
  assert.equal(link[0]?.external_id, live[0].id);
  // A second fill by the same person updates the same HubSpot record.
  const s2 = await submit(f, ws, { ...SALES, "q.message": "Again" });
  const d2 = (await q(`select id from deliveries where submission_id = $1`, [s2.id]))[0].id;
  await deliverOnce(rpc, send, d2, false);
  assert.equal(hs.live().filter((c) => c.properties.email === "ana@acme.com").length, 1);
  assert.equal((await q(`select external_id from deliveries where id = $1`, [d2]))[0].external_id, live[0].id);
});

test("Slack down for 2 hours: the delivery waits through its tries and sends once; past the last try it fails with the reason", async () => {
  const { ws, user } = await workspace("forms-slack");
  const f = await liveForm(ws, user);
  await destination(user, f.id, "slack", { secret: { url: "https://hooks.slack.com/services/T/B/x" } });
  let down = true;
  const slack = fakeHttp(() => down);
  const send = sendWith(slack.fetcher);
  const a = await submit(f, ws, SALES);
  const da = (await q(`select id from deliveries where submission_id = $1`, [a.id]))[0].id;
  for (let i = 0; i < 4; i++) assert.ok((await deliverOnce(rpc, send, da, false)).retry);
  down = false;
  await deliverOnce(rpc, send, da, false);
  assert.equal((await q(`select status from deliveries where id = $1`, [da]))[0].status, "done");
  assert.equal(slack.got.length, 1);
  assert.match(String(slack.got[0].body.text), /New fill on Contact: Ana Diaz/);
  // Done is done: another job for it sends nothing.
  await deliverOnce(rpc, send, da, false);
  assert.equal(slack.got.length, 1);

  down = true;
  const b = await submit(f, ws, { ...SALES, email: "bo@acme.com" });
  const db = (await q(`select id from deliveries where submission_id = $1`, [b.id]))[0].id;
  await deliverOnce(rpc, send, db, true);
  const fb = (await q(`select status, error from deliveries where id = $1`, [db]))[0];
  assert.equal(fb.status, "failed");
  assert.match(fb.error, /503/);
  // Replay from the app gives it a fresh set of tries.
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  assert.equal((await q(`select deliveries_replay($1) as n`, [[db]]))[0].n, 1);
  await q(`select set_config('request.jwt.claim.sub', '', false)`);
  down = false;
  await deliverOnce(rpc, send, db, false);
  assert.equal((await q(`select status from deliveries where id = $1`, [db]))[0].status, "done");
});

test("a paused destination holds fills, then sends them oldest first when it's turned back on", async () => {
  const { ws, user } = await workspace("forms-pause");
  const f = await liveForm(ws, user);
  const dest = await destination(user, f.id, "webhook", { secret: { url: "https://hooks.acme.com/in", secret: "s3cret" } });
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await q(`select form_destination_pause($1, true)`, [dest]);
  await q(`select set_config('request.jwt.claim.sub', '', false)`);
  const emails = ["a1@acme.com", "a2@acme.com", "a3@acme.com", "a4@acme.com", "a5@acme.com"];
  for (const e of emails) await submit(f, ws, { ...SALES, email: e });
  assert.deepEqual((await q(`select distinct status from deliveries where destination_id = $1`, [dest])).map((r) => r.status), ["held"]);
  assert.equal((await q(`select count(*)::int n from jobs where kind = 'deliver' and workspace_id = $1`, [ws]))[0].n, 0);
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await q(`select form_destination_pause($1, false)`, [dest]);
  await q(`select set_config('request.jwt.claim.sub', '', false)`);
  const job = (await q(`select * from jobs where kind = 'deliver_held' and key = $1`, [dest]))[0];
  assert.ok(job);
  const hook = fakeHttp(() => false);
  const handler = deliverHeld(pool, rpc, { fetcher: hook.fetcher, sleep: async () => {}, resolve: (async () => [{ address: "93.184.216.34", family: 4 }]) as never });
  await handler(job, new AbortController().signal);
  assert.deepEqual(hook.got.map((g) => (g.body.contact as { email: string }).email), emails);
  const sig = hook.got[0].headers.get("x-claritia-signature")!;
  const [, t] = /t=(\d+)/.exec(sig)!;
  assert.equal(sig, signature("s3cret", JSON.stringify(hook.got[0].body), Number(t)));
  assert.equal(hook.got[0].headers.get("x-claritia-delivery"), hook.got[0].body.delivery_id);
});

test("two workers can't send the same delivery, and a webhook to a private address fails without a call", async () => {
  const { ws, user } = await workspace("forms-lease");
  const f = await liveForm(ws, user);
  await destination(user, f.id, "webhook", { secret: { url: "https://10.0.0.5/hook" } });
  const s = await submit(f, ws, SALES);
  const id = (await q(`select id from deliveries where submission_id = $1`, [s.id]))[0].id;
  const [one, two] = await Promise.all([q(`select delivery_take($1, 120) as t`, [id]), q(`select delivery_take($1, 120) as t`, [id])]);
  assert.equal([one[0].t, two[0].t].filter(Boolean).length, 1);
  // The lease ends; the next try takes it and refuses the address.
  await q(`update deliveries set lease_until = now() - interval '1 second' where id = $1`, [id]);
  const hook = fakeHttp(() => false);
  await deliverOnce(rpc, { ...sendWith(hook.fetcher), resolve: undefined }, id, false);
  const d = (await q(`select status, error from deliveries where id = $1`, [id]))[0];
  assert.equal(d.status, "failed");
  assert.match(d.error, /private network/);
  assert.equal(hook.got.length, 0);
});

test("a field removed after fills came in still shows on the old fills, by its key", async () => {
  const { ws, user } = await workspace("forms-history");
  const f = await liveForm(ws, user);
  await destination(user, f.id, "slack", { secret: { url: "https://hooks.slack.com/services/T/B/x" } });
  const s = await submit(f, ws, SALES);
  const next = { ...f.form, steps: [{ ...f.form.steps[0], fields: f.form.steps[0].fields.filter((x) => x.key !== "q.message") }] };
  await q(`select form_publish($1, $2, $3)`, [f.id, user, next]);
  const id = (await q(`select id from deliveries where submission_id = $1`, [s.id]))[0].id;
  const t = (await q(`select delivery_take($1, 120) as t`, [id]))[0].t as Taken;
  // The fill keeps its own version's labels.
  assert.ok(labeled(t).some((r) => r.label === "How can we help?" && r.value === "Pricing please"));
  const asIfNew = labeled({ ...t, form: { ...t.form!, body: next } });
  assert.ok(asIfNew.some((r) => r.label === "q.message" && r.value === "Pricing please"));
  // A version that was never published is refused.
  await assert.rejects(q(`select form_submit($1, 3, $2, '{}', '{}', null, '{}', null, null, false)`, [f.id, "z".repeat(20)]), /Unknown form version/);
});
