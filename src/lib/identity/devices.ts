// Devices and visits (docs/identity.md 4.6, 7.4): linking a device to a person, moving earlier visits to them,
// and splitting a visit when someone else signs in on the same device.

import { uuid7 } from "../web/ids.ts";
import { BACKFILL_DAYS, DAY, IDENTITY_POLICIES, resolve, TAINT_DAYS, type Db, type Evidence } from "./db.ts";

// Device states (7.3), backfill (7.5) and session splits (7.6) ----------------------------------------------

export type Dev = { id: string; state: string; tainted_until: Date | null; no_backfill: boolean };

export async function linkDevice(db: Db, e: Evidence, person: string, level: "verified" | "asserted", t: number, dev: Dev, source: string): Promise<{ device: "linked" | "shared" | "tainted" | "unchanged"; backfilled?: number; split?: string }> {
  const at = new Date(t);
  const device = e.device_id!;
  const ws = e.workspace_id;
  if (dev.state === "tainted" && dev.tainted_until && +new Date(dev.tainted_until) > t) return { device: "tainted" };

  // Taint (7.4): 3+ people in 24 hours, or 2 different unsigned identities.
  const recent = await db.query(
    `select distinct person_id from device_links where device_id = $1 and level <> 'probable' and coalesce(to_at, $2) > $3`,
    [device, at, new Date(t - DAY)],
  );
  const people = new Set(await Promise.all(recent.rows.map((r) => resolve(db, r.person_id))));
  people.add(person);
  const unsigned = await db.query(
    `select count(distinct identifiers::text)::int as n from identity_evidence
     where workspace_id = $1 and device_id = $2 and source = 'identify' and server_at > $3 and server_at <= $4 and revoked_at is null`,
    [ws, device, new Date(t - DAY), at],
  );
  // Unsigned identify rows keep source 'identify'; verified ones become 'identify_signed'.
  if (people.size >= 3 || (source === "identify" && unsigned.rows[0].n >= 2)) {
    await db.query(`update device_links set to_at = $2 where device_id = $1 and to_at is null`, [device, at]);
    await db.query(`update devices set state = 'tainted', state_since = $2, tainted_until = $3, no_backfill = true where id = $1`, [device, at, new Date(t + TAINT_DAYS * DAY)]);
    await db.query(
      `update sessions set person_id = null, person_level = null, person_source = null where device_id = $1 and (started_at >= $2 or ended_at >= $2)`,
      [device, new Date(t - DAY)],
    );
    return { device: "tainted" };
  }

  const open = (await db.query(`select id, person_id, level, from_at from device_links where device_id = $1 and to_at is null`, [device])).rows[0];
  const current = open ? await resolve(db, open.person_id) : null;
  const session = await currentSession(db, e, device, t);

  const openLink = () =>
    db.query(`insert into device_links (id, workspace_id, device_id, person_id, level, from_at, evidence_id) values ($1, $2, $3, $4, $5, $6, $7)`, [uuid7(t), ws, device, person, level, at, e.id]);
  const setState = (state: string, noBackfill: boolean) =>
    db.query(`update devices set state = $2, state_since = case when state = $2 then state_since else $3 end, no_backfill = no_backfill or $4 where id = $1`, [device, state, at, noBackfill]);

  // Fresh, or a probable guess: link and backfill.
  if (!open || (open.level === "probable" && current === person)) {
    if (open) await db.query(`update device_links set level = $2 where id = $1`, [open.id, level]);
    else await openLink();
    const wasFresh = dev.state === "fresh" || dev.state === "probable";
    await setState("linked", false);
    if (wasFresh && !dev.no_backfill) return { device: "linked", backfilled: await backfill(db, device, person, level, t, session?.id ?? null) };
    await liveSession(db, session, person, level);
    return { device: "linked", backfilled: 0 };
  }
  if (open.level === "probable") {
    await db.query(`update device_links set to_at = $2 where id = $1`, [open.id, at]);
    await openLink();
    await setState("linked", false);
    await liveSession(db, session, person, level);
    return { device: "linked" };
  }
  if (current === person) {
    if (level === "verified" && open.level !== "verified") await db.query(`update device_links set level = 'verified' where id = $1`, [open.id]);
    return { device: "unchanged" };
  }
  // Someone else on a linked device: shared. Close, open, split the visit at this moment.
  await db.query(`update device_links set to_at = $2 where id = $1`, [open.id, at]);
  await openLink();
  await setState("shared", true);
  const split = session && +new Date(session.started_at) < t ? await splitSession(db, session, t, person, level) : undefined;
  if (session && !split) await liveSession(db, session, person, level);
  return { device: "shared", split };
}

type Sess = { id: string; started_at: Date; person_id: string | null };

async function currentSession(db: Db, e: Evidence, device: string, t: number): Promise<Sess | null> {
  const r = e.session_id
    ? await db.query(`select id, started_at, person_id, split_to from sessions where id = $1`, [e.session_id])
    : await db.query(`select id, started_at, person_id, split_to from sessions where device_id = $1 and started_at <= $2 order by started_at desc limit 1`, [device, new Date(t)]);
  let s = r.rows[0];
  if (s?.split_to) s = (await db.query(`select id, started_at, person_id, split_to from sessions where id = $1`, [s.split_to])).rows[0] ?? s;
  return (s as Sess | undefined) ?? null;
}

async function liveSession(db: Db, s: Sess | null, person: string, level: string): Promise<void> {
  if (!s) return;
  // The second part of a split visit keeps saying so (a rebuild lands here instead of splitting again).
  await db.query(
    `update sessions set person_id = $2, person_level = $3, person_source = case when split_from is not null then 'split' else 'live' end
     where id = $1 and policy = any($4) and not internal`,
    [s.id, person, level, IDENTITY_POLICIES],
  );
}

/** Earlier visits on this device (90 days) move to the person, if they allowed identity and weren't bots. */
async function backfill(db: Db, device: string, person: string, level: string, t: number, sessionId: string | null): Promise<number> {
  const r = await db.query(
    `update sessions set person_id = $2, person_level = $3, person_source = case when id = $6 then 'live' else 'backfill' end
     where device_id = $1 and started_at >= $4 and started_at <= $5 and policy = any($7) and not internal and not is_bot
       and (person_id is null or person_level = 'probable')`,
    [device, person, level, new Date(t - BACKFILL_DAYS * DAY), new Date(t), sessionId, IDENTITY_POLICIES],
  );
  return Math.max(0, (r.rowCount ?? 0) - (sessionId ? 1 : 0));
}

/** Splits a visit at `t`: events from then on move to a new session for the new person. */
async function splitSession(db: Db, s: Sess, t: number, person: string, level: string): Promise<string> {
  const id = uuid7(t);
  const at = new Date(t);
  await db.query(
    `insert into sessions (id, workspace_id, site_id, device_id, cookieless_key, started_at, ended_at, policy, consent, gpc, country, region, city,
       device_type, browser, os, landing_path, referrer_host, source, medium, campaign, term, content, ref_class, ip_net, ip_kind,
       person_id, person_level, person_source, account_id, account_source, network_account_id, internal, is_bot, split_from)
     select $2, workspace_id, site_id, device_id, cookieless_key, $3, greatest(ended_at, $3), policy, consent, gpc, country, region, city,
       device_type, browser, os, null, null, source, medium, campaign, term, content, ref_class, ip_net, ip_kind,
       $4, $5, 'split', account_id, account_source, network_account_id, internal, is_bot, id
     from sessions where id = $1`,
    [s.id, id, at, person, level],
  );
  await db.query(`update events set session_id = $2 where session_id = $1 and day >= $3::date and server_at >= $4`, [s.id, id, at.toISOString().slice(0, 10), at]);
  await db.query(`update sessions set split_to = $2 where id = $1 or split_to = $1`, [s.id, id]);
  for (const sid of [s.id, id]) {
    await db.query(
      `update sessions set pageviews = c.views, engaged_s = c.engaged from (
         select count(*) filter (where kind = 'view')::int as views,
                coalesce(sum(least(greatest((data->>'active_s')::int, 0), 3600)) filter (where kind = 'engage'), 0)::int as engaged
         from events where session_id = $1) c
       where id = $1`,
      [sid],
    );
  }
  await db.query(`update sessions set ended_at = least(ended_at, $2) where id = $1`, [s.id, at]);
  return id;
}
