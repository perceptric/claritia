// Booking with the contact's owner on a real database (docs/form-studio.md Part 3): a teammate link is saved only for
// the scheduler it works on, and a saved link that doesn't work for the tool (no link, another tool's, malformed) never
// wins over the form's team link.
import assert from "node:assert/strict";
import { after, test } from "node:test";
import pg from "pg";
import { uuid7 } from "../../collect/ids.ts";
import { bookingBase, linkState } from "../../src/lib/forms/meeting.ts";
import { checkForm } from "../../src/lib/forms/schema.ts";
import { prepareSubmit } from "../../src/lib/forms/submit.ts";
import { TEMPLATES } from "../../src/lib/forms/templates.ts";
import { ctxFor } from "../../worker-intel/jobs/imports.ts";

const url = process.env.PG_URL;
if (!url) throw new Error("PG_URL is not set");
const pool = new pg.Pool({ connectionString: url, max: 4 });
const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, p)).rows;
after(() => pool.end());

async function workspace(name: string) {
  const ws = uuid7();
  const owner = uuid7();
  const member = uuid7();
  await q(`insert into workspaces (id, name) values ($1, $2)`, [ws, name]);
  for (const [id, role] of [[owner, "owner"], [member, "member"]]) {
    await q(`insert into auth.users (id, email) values ($1, $2)`, [id, `${id}@t.io`]);
    await q(`insert into workspace_members (workspace_id, user_id, role) values ($1, $2, $3)`, [ws, id, role]);
  }
  return { ws, owner, member };
}

/** A fill on a live form whose contact is owned by `who`. */
async function fill(ws: string, user: string, who: string) {
  const r = checkForm(TEMPLATES.find((t) => t.key === "contact_sales")!.form());
  if ("errors" in r) throw new Error(r.errors.join(" "));
  const id = (await q(`insert into forms (workspace_id, name, draft) values ($1, 'Contact', $2) returning id`, [ws, r.form]))[0].id as string;
  const version = (await q(`select form_publish($1, $2, $3) as v`, [id, user, r.form]))[0].v as number;
  const fields = r.form.steps.flatMap((s) => s.fields);
  const sales = { name: "Ana Diaz", email: "ana@acme.com", company: "Acme", "q.message": "Pricing please" };
  const answers = Object.fromEntries(Object.entries(sales).map(([k, v]) => [fields.find((x) => x.key === k)!.id, v]));
  const p = prepareSubmit(r.form, version, { v: 1, version, key: "k".repeat(16) + uuid7().replace(/-/g, "").slice(0, 20), answers, ms: 5000 }, await ctxFor(pool, ws));
  if (!("args" in p)) throw new Error(JSON.stringify(p));
  const a = p.args;
  const s = (await q(`select form_submit($1, $2, $3, $4, $5, $6, $7, $8, $9, false) as r`, [id, a.p_version, a.p_idem, a.p_values, a.p_hidden, a.p_contact, a.p_consent, a.p_country, a.p_spam]))[0].r as { id: string; contact_id: string };
  await q(`update contacts set owner_user_id = $1 where id = $2`, [who, s.contact_id]);
  return s.id;
}

const as = async <T>(user: string, fn: () => Promise<T>): Promise<T> => {
  await q(`select set_config('request.jwt.claim.sub', $1, false)`, [user]);
  try {
    return await fn();
  } finally {
    await q(`select set_config('request.jwt.claim.sub', '', false)`);
  }
};
const save = (ws: string, user: string, tool: string, link: string) => q(`select scheduler_link_save($1, $2, $3, $4)`, [ws, user, tool, link]);
const ownerLink = async (sub: string, tool = "calendly") => (await q(`select scheduler_for($1, $2) as u`, [sub, tool]))[0].u as string | null;

test("the SQL link check agrees with the app's on flaky links", async () => {
  const cases: [string, string][] = [
    ["calendly", "https://calendly.com/maya"],
    ["calendly", "https://www.calendly.com/maya?x=1"],
    ["calendly", "https://CALENDLY.com/maya"],
    ["calendly", "https://calendly.com:443/maya"],
    ["calendly", "https://cal.com/maya"],
    ["calendly", "https://calendly.com.evil.io/maya"],
    ["calendly", "https://maya@calendly.com/x"],
    ["calendly", "http://calendly.com/maya"],
    ["calendly", "calendly.com/maya"],
    ["calendly", ""],
    ["calcom", "https://cal.com/leo"],
    ["calcom", "https://acme.cal.com/leo"],
    ["calcom", "https://evilcal.com/leo"],
    ["hubspot_meetings", "https://meetings-eu1.hubspot.com/leo"],
    ["hubspot_meetings", "https://app.hubspot.com/leo"],
    ["savvycal", "https://savvycal.com/leo"],
    ["link", "https://book.acme.com/leo"],
    ["link", "https://"],
    ["nope", "https://calendly.com/maya"],
  ];
  for (const [tool, link] of cases) {
    const sql = (await q(`select scheduler_link_ok($1, $2) as ok`, [tool, link]))[0].ok as boolean;
    const app = tool === "nope" ? false : link !== "" && linkState(tool as "calendly", link).kind === "ok" && /^https:\/\//.test(link);
    assert.equal(sql, app, `${tool} ${link}`);
  }
});

test("a teammate link is saved only for its own scheduler; owners set anyone's, members their own", async () => {
  const { ws, owner, member } = await workspace("meet-save");
  await as(member, () => save(ws, member, "calendly", "https://calendly.com/leo"));
  await assert.rejects(as(member, () => save(ws, member, "calendly", "https://cal.com/leo")), /doesn't work for this scheduler/);
  await assert.rejects(as(member, () => save(ws, owner, "calendly", "https://calendly.com/maya")), /Only owners/);
  await as(owner, () => save(ws, member, "calcom", "https://cal.com/leo"));
  const rows = await q(`select tool, url from scheduler_links where workspace_id = $1 order by tool`, [ws]);
  assert.deepEqual(rows.map((r) => [r.tool, r.url]), [["calcom", "https://cal.com/leo"], ["calendly", "https://calendly.com/leo"]]);
  await as(member, () => save(ws, member, "calendly", " "));
  assert.equal((await q(`select count(*)::int as n from scheduler_links where workspace_id = $1 and tool = 'calendly'`, [ws]))[0].n, 0);
});

test("a missing, other-tool or malformed owner link falls back to the team link", async () => {
  const { ws, owner, member } = await workspace("meet-fallback");
  const sub = await fill(ws, owner, member);
  const team = { tool: "calendly" as const, url: "https://calendly.com/acme/demo", perOwner: true };
  // No link for the owner.
  assert.equal(await ownerLink(sub), null);
  assert.deepEqual(bookingBase(team, await ownerLink(sub)), { url: team.url, from: "team" });
  // A link for a different tool only.
  await as(member, () => save(ws, member, "calcom", "https://cal.com/leo"));
  assert.equal(await ownerLink(sub), null);
  // A malformed link saved before the check existed.
  await q(`insert into scheduler_links (workspace_id, user_id, tool, url) values ($1, $2, 'calendly', 'https://savvycal.com/leo')`, [ws, member]);
  assert.equal(await ownerLink(sub), null, "a saved link for another tool's host never wins");
  assert.deepEqual(bookingBase(team, await ownerLink(sub)), { url: team.url, from: "team" });
  // A working link wins.
  await as(member, () => save(ws, member, "calendly", "https://calendly.com/leo"));
  assert.equal(await ownerLink(sub), "https://calendly.com/leo");
  assert.deepEqual(bookingBase(team, await ownerLink(sub)), { url: "https://calendly.com/leo", from: "owner" });
});
