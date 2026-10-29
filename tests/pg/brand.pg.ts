// Brand scans through the jobs queue (docs/form-builder.md Part 5): starting a scan makes the kit and the job and
// hands the kit to a form with none; a finished scan saves checked tokens and the site's forms; a site that turns the
// scan away fails the kit with the reason and isn't retried; a crash retries, and the last try fails the kit.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uuid7 } from "../../collect/ids.ts";
import { DEFAULT_TOKENS } from "../../src/lib/forms/brand.ts";
import { ScanBlocked, type Scan } from "../../src/lib/brand/scan.ts";
import type { Job } from "../../src/lib/jobs.ts";
import { pgRpc } from "../../worker-intel/rpc.ts";
import { handleBrandScan } from "../../worker/brandScan.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());
const sb = { rpc: pgRpc(pool) } as unknown as SupabaseClient;

async function setup() {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'brand')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const form = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'F', '{}') returning id`, [ws]))[0].id as string;
  const kit = (await q(`select brand_scan_start($1, $2, 'https://www.acme.com/', null, $3) as id`, [user, ws, form]))[0].id as string;
  const job = (await q(`select * from jobs where kind = 'brand_scan' and key = $1`, [kit]))[0] as Job;
  return { ws, user, form, kit, job };
}

const fakeScan = (s: Partial<Scan>) => async () => ({ tokens: { ...DEFAULT_TOKENS, buttonBg: "#2563eb" }, notes: ["Text color darkened to read on the background."], logo: "https://acme.com/logo.svg", forms: [{ url: "https://acme.com/contact", fields: [{ label: "Work email", type: "email" }], button: "Talk to sales" }], formShot: null, pages: [], ...s }) as Scan;

test("a scan makes the kit and its job, hands the kit to the form, and saves what it found", async () => {
  const { form, kit, job } = await setup();
  const k0 = (await q(`select name, scan_status from brand_kits where id = $1`, [kit]))[0];
  assert.deepEqual([k0.name, k0.scan_status], ["acme.com", "scanning"]);
  assert.equal((await q(`select brand_kit_id from forms where id = $1`, [form]))[0].brand_kit_id, kit);
  await handleBrandScan(sb, { ...job, attempts: 1 }, { scan: fakeScan({}) });
  const k = (await q(`select tokens, notes, site_forms, logo_url, scan_status, scanned_at from brand_kits where id = $1`, [kit]))[0];
  assert.equal(k.scan_status, "done");
  assert.equal(k.tokens.buttonBg, "#2563eb");
  assert.equal(k.site_forms[0].button, "Talk to sales");
  assert.equal(k.logo_url, "https://acme.com/logo.svg");
  assert.ok(k.scanned_at);
});

test("a site that turns the scan away fails the kit with the reason; a crash retries until the last try", async () => {
  const a = await setup();
  await handleBrandScan(sb, { ...a.job, attempts: 1 }, { scan: async () => { throw new ScanBlocked("The site turned the scan away. Set the colors and font in Design."); } });
  const ka = (await q(`select scan_status, scan_error from brand_kits where id = $1`, [a.kit]))[0];
  assert.deepEqual([ka.scan_status, ka.scan_error], ["failed", "The site turned the scan away. Set the colors and font in Design."]);

  const b = await setup();
  const crash = async () => { throw new Error("browser crashed"); };
  await assert.rejects(handleBrandScan(sb, { ...b.job, attempts: 1, max_attempts: 3 }, { scan: crash }), /browser crashed/);
  assert.equal((await q(`select scan_status from brand_kits where id = $1`, [b.kit]))[0].scan_status, "scanning");
  await handleBrandScan(sb, { ...b.job, attempts: 3, max_attempts: 3 }, { scan: crash });
  assert.equal((await q(`select scan_status from brand_kits where id = $1`, [b.kit]))[0].scan_status, "failed");
});

test("the step cache: the same AI step replays without calling the model, and both are logged", async () => {
  const { ws } = await setup();
  const { cachedStep } = await import("../../src/lib/ai/cache.ts");
  let calls = 0;
  const run = async () => {
    calls++;
    return { result: { fixes: [{ token: "radius", value: "8", why: "rounder" }] }, model: "claude-sonnet-5-5", usage: { input: 1000, output: 100, cache_read: 0, cache_write: 0 } };
  };
  const a = await cachedStep(pgRpc(pool), ws, "brand_look", "a".repeat(64), run);
  const b = await cachedStep(pgRpc(pool), ws, "brand_look", "a".repeat(64), run);
  assert.equal(calls, 1);
  assert.deepEqual(b.result, a.result);
  assert.equal(b.cached, true);
  const logged = await q(`select cached, cost_usd::float c from ai_calls where workspace_id = $1 order by id`, [ws]);
  assert.deepEqual(logged.map((r) => r.cached), [false, true]);
  assert.ok(Math.abs(logged[0].c - 0.003) < 1e-6);
});

test("brand setup: the brief, colors, sizes and links join the kit, and nothing the kit has is overwritten", async () => {
  const { kit, job } = await setup();
  // The kit already has a color named Ocean and its own email heading size.
  await q(`update brand_kits set design = $2, design_rev = 3 where id = $1`, [kit, { variables: [{ id: "ocean", name: "Ocean", kind: "color", value: "#003366" }], email: { globals: { heading: { base: { "font-size": "40px" } } } } }]);
  const brand = { palette: [{ color: "rgb(15, 118, 110)", weight: 900 }, { color: "rgb(255, 255, 255)", weight: 800 }, { color: "rgb(200, 30, 90)", weight: 100 }], headings: [{ level: 2, size: "30px", weight: "600" }], shadow: "rgba(0, 0, 0, 0.12) 0px 4px 12px 0px", social: [{ kind: "linkedin", url: "https://linkedin.com/company/acme" }], address: "500 Market Street, San Francisco", copy: "Acme helps teams ship." };
  let briefs = 0;
  const briefer = async () => (briefs++, { brief: { brief: "Acme sells to busy teams. Plain, warm tone.", colors: ["Ocean", "Berry"] }, usage: { input_tokens: 10, output_tokens: 5 } as never });
  await handleBrandScan(sb, { ...job, attempts: 1 }, { scan: fakeScan({ brand }), briefer });
  const k = (await q(`select design, design_rev, social, address, brief from brand_kits where id = $1`, [kit]))[0];
  assert.equal(briefs, 1);
  assert.equal(k.brief, "Acme sells to busy teams. Plain, warm tone.");
  assert.equal(k.address, "500 Market Street, San Francisco");
  assert.deepEqual(k.social, [{ kind: "linkedin", url: "https://linkedin.com/company/acme" }]);
  const vars = k.design.variables as { id: string; name: string; value: string }[];
  assert.deepEqual(vars.map((v) => v.id), ["ocean", "brand-2", "h2-size", "card-shadow"], "the kit's Ocean stays; the scan's color named Ocean is left out");
  assert.equal(vars.find((v) => v.id === "ocean")!.value, "#003366");
  assert.equal(vars.find((v) => v.id === "brand-2")!.name, "Berry");
  assert.equal(k.design.email.globals.heading.base["font-size"], "40px", "the kit's own heading size stays");
  assert.equal(k.design_rev, 4, "a change bumps the rev, so open builders pick it up");
  // A second scan of the same site replays the brief from the step cache.
  await handleBrandScan(sb, { ...job, attempts: 1 }, { scan: fakeScan({ brand }), briefer });
  assert.equal(briefs, 1);
  assert.equal((await q(`select design_rev from brand_kits where id = $1`, [kit]))[0].design_rev, 4, "nothing new, no new rev");
});
