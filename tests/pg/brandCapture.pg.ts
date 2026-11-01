// Brand capture on a real database (docs/brand-capture.md): the first scan makes the workspace's brand, the quick read
// fills the kit at once, a full scan replaces it, a failed full scan keeps it, and booking pages wear the brand.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

test("brand: first scan is the brand, quick look now, full scan replaces it, a failed scan keeps it", async () => {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Momos')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  const start = async (u: string) => (await q(`select brand_scan_start($1, $2, $3) as id`, [user, ws, u]))[0].id as string;
  const kit = await start("https://momos.com");
  assert.equal((await q(`select brand_kit_id from workspaces where id = $1`, [ws]))[0].brand_kit_id, kit);
  // The quick read: ready at once.
  assert.equal((await q(`select brand_kit_quick($1, $2, $3) as ok`, [kit, { accent: "#d73e33" }, "https://momos.com/icon.png"]))[0].ok, true);
  let k = (await q(`select tokens, scan_status, logo_url from brand_kits where id = $1`, [kit]))[0];
  assert.equal(k.scan_status, "done");
  assert.equal(k.tokens.accent, "#d73e33");
  // Booking pages wear the workspace's brand, even with a newer kit around.
  const other = await start("https://other.example.com");
  await q(`select brand_kit_quick($1, $2, null)`, [other, { accent: "#123456" }]);
  assert.equal((await q(`select book_kit($1) as k`, [ws]))[0].k.tokens.accent, "#d73e33");
  // The full scan fails: the quick look stays, and the kit isn't marked failed.
  await q(`select brand_scan_finish($1, '{}', null, '{}', '[]', 'Blocked')`, [kit]);
  k = (await q(`select tokens, scan_status from brand_kits where id = $1`, [kit]))[0];
  assert.equal(k.scan_status, "done");
  assert.equal(k.tokens.accent, "#d73e33");
  // The full scan succeeds: its look replaces the quick one, and a late quick read can't undo it.
  await q(`select brand_scan_finish($1, $2, null, '{}', '[]', null)`, [kit, { accent: "#c0392b", font: "Poppins" }]);
  assert.equal((await q(`select brand_kit_quick($1, $2, null) as ok`, [kit, { accent: "#000000" }]))[0].ok, false);
  assert.equal((await q(`select tokens from brand_kits where id = $1`, [kit]))[0].tokens.accent, "#c0392b");
  // Picking another site as the brand.
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  await q(`select workspace_brand_set($1, $2)`, [ws, other]);
  assert.equal((await q(`select book_kit($1) as k`, [ws]))[0].k.tokens.accent, "#123456");
});
