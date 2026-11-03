// A form's link ending and Email the link (117_form_links.sql), on a real database: an ending is the workspace's alone,
// an old one keeps opening its form for 90 days and can't be taken meanwhile, only members set one, and a link
// emailed twice to the same address goes once.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "./ids.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 2 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace(name: string) {
  const ws = uuid7();
  const user = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  await q(`insert into auth.users (id, email) values ($1, $2)`, [user, `${user}@t.io`]);
  await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, 'owner')`, [ws, user]);
  return { ws, user };
}
const form = async (ws: string, name = "Demo") => (await q(`insert into forms (workspace_id, name, draft) values ($1, $2, '{}') returning id`, [ws, name]))[0].id as string;

/** Runs as a signed-in person. */
async function as<T>(user: string, sql: string, p: unknown[]): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
    return (await c.query(sql, p)).rows[0].r as T;
  } finally {
    await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    c.release();
  }
}
const setSlug = (user: string, f: string, s: string | null) => as<{ ws: string; slug: string | null }>(user, `select form_set_slug($1, $2) as r`, [f, s]);

test("an ending opens its form; another form can't take it; a changed one redirects for 90 days and stays held", async () => {
  const { ws, user } = await workspace("Link Co");
  const [a, b] = [await form(ws, "A"), await form(ws, "B")];
  const set = await setSlug(user, a, " Demo-Request ");
  assert.deepEqual(set, { ws: "link-co", slug: "demo-request" }, "lower case, and the workspace's name made once");
  assert.deepEqual((await q(`select form_by_slug('link-co', 'demo-request') r`))[0].r, { id: a, slug: "demo-request" });
  await assert.rejects(setSlug(user, b, "demo-request"), /That ending is taken/);
  await assert.rejects(setSlug(user, b, "Bad ending!"), /lowercase letters, numbers and dashes/);
  await assert.rejects(setSlug(user, b, "-edge"), /lowercase letters/);
  await setSlug(user, a, "demo");
  assert.deepEqual((await q(`select form_by_slug('link-co', 'demo-request') r`))[0].r, { id: a, slug: "demo", moved: true }, "the old ending points to the new one");
  await assert.rejects(setSlug(user, b, "demo-request"), /That ending is taken/, "held for 90 days");
  // Its own old ending can come back.
  await setSlug(user, a, "demo-request");
  assert.deepEqual((await q(`select form_by_slug('link-co', 'demo-request') r`))[0].r, { id: a, slug: "demo-request" });
  // After 90 days the old one is free.
  await q(`update form_slug_moves set until = now() - interval '1 second' where workspace_id = $1`, [ws]);
  assert.equal((await q(`select form_by_slug('link-co', 'demo') r`))[0].r, null);
  assert.equal((await setSlug(user, b, "demo")).slug, "demo");
  // Cleared: the old ending opens the id link for 90 days.
  await setSlug(user, b, null);
  assert.deepEqual((await q(`select form_by_slug('link-co', 'demo') r`))[0].r, { id: b, slug: null, moved: true });
  assert.equal((await q(`select form_by_slug('link-co', 'nope') r`))[0].r, null);
});

test("endings are per workspace, and only its members set them", async () => {
  const one = await workspace("Same Name");
  const two = await workspace("Same Name");
  const [a, b] = [await form(one.ws), await form(two.ws)];
  const sa = await setSlug(one.user, a, "contact");
  const sb = await setSlug(two.user, b, "contact");
  assert.notEqual(sa.ws, sb.ws, "two workspaces, two names in links");
  assert.equal((await q(`select form_by_slug($1, 'contact') r`, [sb.ws]))[0].r.id, b);
  await assert.rejects(setSlug(two.user, a, "mine"), /Form not found/);
  await assert.rejects(as(two.user, `select form_link($1) as r`, [a]), /Form not found/);
  // Two people saving at once: one wins, the other is told it's taken, never two forms on one ending.
  const c = await form(one.ws);
  const r = await Promise.allSettled([setSlug(one.user, a, "race"), setSlug(one.user, c, "race")]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await q(`select count(*)::int n from forms where workspace_id = $1 and slug = 'race'`, [one.ws]))[0].n, 1);
});

test("Email the link: each address once, a repeat adds nothing, bad addresses are left out, 50 at most", async () => {
  const { ws, user } = await workspace("Mail Co");
  const e = (await q(`select email_create($1, $2, $3) id`, [ws, user, { kind: "one_to_one", subject: "Demo", html: "<p>Hi</p>", text: "Hi", links: [] }]))[0].id;
  assert.equal((await q(`select email_queue_to($1, $2) n`, [e, ["A@acme.com", "a@acme.com", "b@acme.com", "nope"]]))[0].n, 2);
  assert.equal((await q(`select email_queue_to($1, $2) n`, [e, ["a@acme.com", "c@acme.com"]]))[0].n, 1, "sent again: only the new address");
  assert.deepEqual((await q(`select to_email from email_messages where email_id = $1 order by to_email`, [e])).map((r) => r.to_email), ["a@acme.com", "b@acme.com", "c@acme.com"]);
  assert.equal((await q(`select count(*)::int n from jobs where workspace_id = $1 and kind = 'send' and status = 'queued'`, [ws]))[0].n, 1, "one send job");
  await assert.rejects(q(`select email_queue_to($1, $2)`, [e, Array.from({ length: 51 }, (_, i) => `p${i}@acme.com`)]), /Up to 50/);
});
