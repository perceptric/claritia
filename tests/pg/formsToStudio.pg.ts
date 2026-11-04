// Older forms kept as Form Studio pages on a real database (supabase/migrations/123_forms_to_studio.sql): form_public
// hands out the kit's Studio stylesheet and notes and none of the old look; form_to_studio publishes the page as a new
// version only while the version read is still live, turns the draft only while it's still the older kind, leaves a
// site's own form alone, keeps the form's state, look and publish time, and two at once make one version. A page
// bigger than the old 64 KB limit fits.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";
import { checkForm, emptyForm, type Form } from "../../src/lib/forms/schema.ts";
import { templateById } from "../../src/lib/forms/gallery/catalog.ts";
import { templateForm } from "../../src/lib/forms/gallery/convert.ts";
import { capturedForm } from "../../src/lib/forms/templates.ts";
import { studioPublic, type PublicForm } from "../../src/lib/forms/submit.ts";
import { lookCss, studioForm } from "../../src/lib/studio/liveForm.ts";
import { styleOf } from "../../src/lib/studio/styleCss.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 6 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

const ok = (f: unknown): Form => {
  const r = checkForm(f);
  if ("errors" in r) throw new Error(r.errors.join(" "));
  return r.form;
};

async function workspace() {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, 'Acme')`, [ws]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}

/** A form from before the Studio, live, in a kit made for a gallery style. */
async function olderForm(ws: string, user: string, draft?: Form) {
  const kit = (await q(`insert into brand_kits (workspace_id, name, tokens, notes) values ($1, 'Poster style', '{"buttonBg":"#000000"}', array['style:poster']) returning id`, [ws]))[0].id as string;
  const live = ok(templateForm(templateById("agency.project-inquiry")!));
  const id = (await q(`insert into forms (workspace_id, name, draft, brand_kit_id) values ($1, 'Project inquiry', $2, $3) returning id`, [ws, draft ?? live, kit]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, live]);
  return { id, kit, live };
}

const pub = async (id: string) => (await q(`select form_public($1) as f`, [id]))[0].f as PublicForm & Record<string, unknown>;

test("form_public hands out the kit's Studio stylesheet and notes, and none of the old look", async () => {
  const { ws, user } = await workspace();
  const f = await olderForm(ws, user);
  const p = await pub(f.id);
  assert.ok(!("tokens" in p) && !("design" in p) && !("skin" in p), JSON.stringify(Object.keys(p)));
  assert.deepEqual(p.kit_notes, ["style:poster"]);
  // As it's read, it's a page in the style its kit was made for.
  const s = studioPublic(p);
  assert.ok(s.body.page && s.older);
  assert.equal(styleOf(s.body.page!.brand), "poster");
});

test("form_to_studio: the live version and the draft become pages once, and the form stays as it was", async () => {
  const { ws, user } = await workspace();
  const f = await olderForm(ws, user);
  await q(`update forms set status = 'paused' where id = $1`, [f.id]);
  const before = (await q(`select version, status, live_kit_id, published_at, draft_rev from forms where id = $1`, [f.id]))[0];
  const css = lookCss({ notes: ["style:poster"] });
  const page = studioForm(f.live, css);
  assert.ok(!("error" in page));
  if ("error" in page) return;
  const r = (await q(`select form_to_studio($1, $2, $3, $4) as r`, [f.id, before.version, page.form, page.form]))[0].r;
  assert.deepEqual(r, { draft: true, live: true, version: before.version + 1 });
  const now = (await q(`select version, status, live_kit_id, published_at, draft_rev, draft from forms where id = $1`, [f.id]))[0];
  assert.equal(now.version, before.version + 1);
  assert.equal(now.status, "paused", "a paused form stays paused");
  assert.equal(now.live_kit_id, before.live_kit_id);
  assert.equal(String(now.published_at), String(before.published_at));
  assert.equal(now.draft_rev, before.draft_rev + 1);
  assert.ok(now.draft.page);
  const body = (await q(`select body, published_by from form_versions where form_id = $1 and version = $2`, [f.id, now.version]))[0];
  assert.ok(body.body.page && body.published_by === null);
  // Again (a second visitor, the app opening it): nothing more.
  const again = (await q(`select form_to_studio($1, $2, $3, $4) as r`, [f.id, now.version, page.form, page.form]))[0].r;
  assert.deepEqual(again, { draft: false, live: false, version: now.version });
  // A version that's no longer live is never published again.
  const stale = (await q(`select form_to_studio($1, $2, $3, null) as r`, [f.id, before.version, page.form]))[0].r;
  assert.equal(stale.live, false);
});

test("form_to_studio: two at once make one version; a draft with its own changes keeps them", async () => {
  const { ws, user } = await workspace();
  const changed = ok({ ...emptyForm(), title: "New draft", steps: [{ id: "s1", fields: [{ id: "e", key: "email", type: "email", label: "Work email", required: true }] }] });
  const f = await olderForm(ws, user, changed);
  const v = (await q(`select version from forms where id = $1`, [f.id]))[0].version as number;
  const live = studioForm(f.live, lookCss({ notes: ["style:poster"] }));
  const draft = studioForm(changed, lookCss({ notes: ["style:poster"] }));
  assert.ok(!("error" in live) && !("error" in draft));
  if ("error" in live || "error" in draft) return;
  const both = await Promise.all([0, 1].map(() => q(`select form_to_studio($1, $2, $3, $4) as r`, [f.id, v, live.form, draft.form])));
  assert.equal(both.filter(([x]) => x.r.live).length, 1, "one new version");
  assert.equal(both.filter(([x]) => x.r.draft).length, 1, "one draft change");
  assert.equal((await q(`select count(*)::int as n from form_versions where form_id = $1`, [f.id]))[0].n, v + 1);
  const d = (await q(`select draft from forms where id = $1`, [f.id]))[0].draft;
  assert.equal(d.title, "New draft", "the draft's own changes stay");
});

test("form_to_studio leaves a site's own form alone, and a page past the old 64 KB limit fits", async () => {
  const { ws, user } = await workspace();
  const cap = ok(capturedForm("html"));
  const id = (await q(`insert into forms (workspace_id, name, draft, kind) values ($1, 'Own', $2, 'captured') returning id`, [ws, cap]))[0].id as string;
  await q(`select form_publish($1, $2, $3)`, [id, user, cap]);
  const page = studioForm(templateForm(templateById("agency.project-inquiry")!), lookCss(null));
  if ("error" in page) throw new Error(page.error);
  const r = (await q(`select form_to_studio($1, 1, $2, $3) as r`, [id, page.form, page.form]))[0].r;
  assert.deepEqual(r, { draft: false, live: false, version: 1 });
  // A big page: the brand's stylesheet alone can be tens of KB.
  const f = await olderForm(ws, user);
  const big = { ...page.form, page: { ...page.form.page!, brand: `${page.form.page!.brand}\n/* ${"x".repeat(120_000)} */` } };
  const v = (await q(`select version from forms where id = $1`, [f.id]))[0].version as number;
  const res = (await q(`select form_to_studio($1, $2, $3, $4) as r`, [f.id, v, big, big]))[0].r;
  assert.equal(res.live, true);
});
