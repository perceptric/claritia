-- Job lanes (the jobs queue from 020_foundation.sql, made fast under load):
--   priority     0 for what a person is waiting on (booking emails, lead alerts, routing a form fill, deliveries),
--                1 for normal work, 2 for bulk and backfills (imports, enrichment, scoring passes, rebuilds), 3 for the
--                runner's browser jobs. enqueue_job sets it from the kind (and the payload's reason for route, or a
--                'lane' hint the worker adds when it queues the rest of a long job). A waiting job that is queued again
--                keeps the more urgent lane.
--   claim_job_lane  the worker's claim: lane by lane, oldest first within a lane, on the jobs_lane index. Some of the
--                worker's loops only take lane 0, so bulk work never delays a booking email.
--   recover_jobs   leases that ran out go back in line (or close), on the worker's 30-second timer instead of inside
--                every claim. claim_job (the runner's claim) keeps doing it for its own kinds.
--   release_job    a job stopped by a worker shutting down goes back in line now, and the try doesn't count.
--   enqueue_job    also wakes the worker (NOTIFY claritia_jobs) when the job is ready now.
--   enqueue_jobs   many jobs in one call, with the same rules as enqueue_job.
--   send_done_many, meeting_mail_done_many  the worker's answers for a round of emails in one call.
--   router_queue   one insert for every contact instead of a call per contact, at bulk priority.
--   calendars_due  accounts whose calendars all push refresh hourly instead of every 10 minutes; one insert.
--   form_notify_claim, router_alert_claim  an alert is claimed before it's sent, so two workers never send it twice.
--   router_runs trigger  a form fill's routing wakes its waiting alerts job.
--   prune_jobs     in batches, and busy kinds keep their finished jobs a day instead of a week.
-- The (kind, workspace_id, key) index for open jobs is 086_db_speed.sql's.

-- Lanes ---------------------------------------------------------------------------------------------------------

alter table public.jobs add column if not exists priority smallint not null default 1;
alter table public.jobs drop constraint if exists jobs_priority_check;
alter table public.jobs add constraint jobs_priority_check check (priority between 0 and 3);
create index if not exists jobs_lane on public.jobs (priority, run_after) where status = 'queued';

create or replace function public.job_priority(p_kind text, p_payload jsonb default '{}') returns smallint
language sql immutable set search_path = public as $$
  select (case
    when p_payload->>'lane' = 'urgent' then 0
    when p_payload->>'lane' = 'bulk' then 2
    when p_kind = 'route' then
      case when p_payload->>'reason' in ('form', 'sla') then 0
           when p_payload->>'reason' in ('import', 'crm', 'again') then 2
           else 1 end
    when p_kind in ('meeting_sync', 'meeting_notify', 'meeting_remind', 'meeting_after', 'meeting_webhook', 'meeting_book_later',
                    'meeting_team_run', 'form_notify', 'form_not_booked', 'router_alert', 'router_sla', 'deliver', 'calendar_watch') then 0
    when p_kind in ('enrich_contact', 'qualify', 'enrich_backfill', 'import_file', 'import_undo', 'source_pull', 'score_refresh',
                    'rebuild', 'segment_refresh', 'deliver_held') then 2
    when p_kind in ('brand_scan', 'form_qa') then 3
    else 1 end)::smallint;
$$;

-- Jobs already waiting take their lane.
update public.jobs set priority = public.job_priority(kind, payload)
where status in ('queued', 'running') and priority is distinct from public.job_priority(kind, payload);

-- Whether a job for this workspace, kind and key waits (or runs), written so the unique and running indexes apply.
create or replace function public.job_key_waiting(p_ws uuid, p_kind text, p_key text) returns boolean
language sql stable set search_path = public as $$
  select case when p_ws is null
              then exists (select 1 from public.jobs w where w.status = 'queued' and w.workspace_id is null and w.kind = p_kind and w.key = p_key)
              else exists (select 1 from public.jobs w where w.status = 'queued' and w.workspace_id = p_ws and w.kind = p_kind and w.key = p_key) end;
$$;
create or replace function public.job_key_running(p_ws uuid, p_kind text, p_key text) returns boolean
language sql stable set search_path = public as $$
  select case when p_ws is null
              then exists (select 1 from public.jobs r where r.status = 'running' and r.kind = p_kind and r.key = p_key and r.workspace_id is null)
              else exists (select 1 from public.jobs r where r.status = 'running' and r.kind = p_kind and r.key = p_key and r.workspace_id = p_ws) end;
$$;

-- Adding jobs ---------------------------------------------------------------------------------------------------

create or replace function public.enqueue_job(p_workspace uuid, p_kind text, p_key text default '', p_payload jsonb default '{}',
  p_delay_s int default 0, p_max_attempts int default 5) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  jid uuid;
  delay int := greatest(coalesce(p_delay_s, 0), 0);
  pri smallint := job_priority(p_kind, coalesce(p_payload, '{}'));
begin
  insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
  values (p_workspace, p_kind, coalesce(p_key, ''), coalesce(p_payload, '{}'), now() + make_interval(secs => delay), p_max_attempts, pri)
  on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
  do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
  returning id into jid;
  -- Ready now: wake an idle worker (delivered at commit; the same lane twice in one transaction is one message).
  if delay <= 1 then
    perform pg_notify('claritia_jobs', pri::text);
  end if;
  return jid;
end;
$$;

-- Many jobs at once: [{workspace_id, kind, key, payload, delay_s, max_attempts}]. Two with the same key in one call
-- collapse like two calls would (the last payload, the earliest start). Returns how many were added or joined.
create or replace function public.enqueue_jobs(p_jobs jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  k int;
  lanes smallint[];
begin
  if jsonb_typeof(p_jobs) <> 'array' then return 0; end if;
  with raw as (
    select (j->>'workspace_id')::uuid as ws, j->>'kind' as kind, coalesce(j->>'key', '') as key, coalesce(j->'payload', '{}') as payload,
           greatest(coalesce((j->>'delay_s')::int, 0), 0) as delay_s, coalesce((j->>'max_attempts')::int, 5) as max_attempts, o
    from jsonb_array_elements(p_jobs) with ordinality as t(j, o)
  ),
  keyed as (
    select distinct on (ws, kind, key) ws, kind, key,
           payload, max_attempts,
           min(delay_s) over (partition by ws, kind, key) as delay_s
    from raw where key <> ''
    order by ws, kind, key, o desc
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select ws, kind, key, payload, now() + make_interval(secs => delay_s), max_attempts, job_priority(kind, payload) from keyed
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning priority, run_after
  )
  select count(*), array_agg(distinct priority) filter (where run_after <= now() + interval '1 second') into n, lanes from ins;
  with raw as (
    select (j->>'workspace_id')::uuid as ws, j->>'kind' as kind, coalesce(j->'payload', '{}') as payload,
           greatest(coalesce((j->>'delay_s')::int, 0), 0) as delay_s, coalesce((j->>'max_attempts')::int, 5) as max_attempts
    from jsonb_array_elements(p_jobs) j
    where coalesce(j->>'key', '') = ''
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select ws, kind, '', payload, now() + make_interval(secs => delay_s), max_attempts, job_priority(kind, payload) from raw
    returning priority, run_after
  )
  select count(*), coalesce(lanes, '{}') || coalesce(array_agg(distinct priority) filter (where run_after <= now() + interval '1 second'), '{}') into k, lanes from ins;
  n := n + k;
  perform pg_notify('claritia_jobs', l::text) from (select distinct unnest(lanes) l) x;
  return n;
end;
$$;

-- Claiming ------------------------------------------------------------------------------------------------------

-- The worker's claim: up to p_limit ready jobs of the given kinds, lane 0 first and oldest first in each lane, never
-- above p_max_priority. Leases that ran out are recover_jobs' work, not the claim's.
create or replace function public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s int default 300, p_limit int default 1, p_max_priority int default 2)
returns setof jobs
language plpgsql security definer set search_path = public as $$
declare
  want int := greatest(least(coalesce(p_limit, 1), 100), 1);
  got int := 0;
  k int;
  lane int;
begin
  if coalesce(p_worker, '') = '' then
    raise exception 'A worker name is needed';
  end if;
  for lane in 0 .. least(greatest(coalesce(p_max_priority, 2), 0), 2) loop
    return query
    update jobs j set status = 'running', locked_by = p_worker, attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(coalesce(p_lease_s, 300), 10))
    where j.id in (
      select x.id from jobs x
      where x.status = 'queued' and x.priority = lane and x.run_after <= now() and x.kind = any(p_kinds)
        and (x.key = '' or not job_key_running(x.workspace_id, x.kind, x.key))
      order by x.run_after
      limit want - got
      for update skip locked
    )
    returning j.*;
    get diagnostics k = row_count;
    got := got + k;
    exit when got >= want;
  end loop;
end;
$$;

-- The runner's claim (worker/index.ts), same signature as before: its own kinds, oldest first, and the leases of its
-- own kinds that ran out.
create or replace function public.claim_job(p_kinds text[], p_worker text, p_lease_s int default 300, p_limit int default 1)
returns setof jobs
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_worker, '') = '' then
    raise exception 'A worker name is needed';
  end if;

  update jobs j set
    status = case when j.attempts >= j.max_attempts then 'failed' else 'done' end,
    error = case when j.attempts >= j.max_attempts then 'The worker stopped answering' else 'Replaced by a newer job for the same key' end,
    finished_at = now(), locked_by = null, locked_until = null
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'running' and x.locked_until < now()
      and (x.attempts >= x.max_attempts or (x.key <> '' and job_key_waiting(x.workspace_id, x.kind, x.key)))
    for update skip locked
  );
  update jobs j set status = 'queued', run_after = now(), locked_by = null, locked_until = null,
    error = 'The worker stopped answering; trying again'
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'running' and x.locked_until < now()
      and (x.key = '' or not job_key_waiting(x.workspace_id, x.kind, x.key))
    for update skip locked
  );

  return query
  update jobs j set status = 'running', locked_by = p_worker, attempts = j.attempts + 1,
    locked_until = now() + make_interval(secs => greatest(coalesce(p_lease_s, 300), 10))
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'queued' and x.run_after <= now()
      and (x.key = '' or not job_key_running(x.workspace_id, x.kind, x.key))
    order by x.run_after
    limit greatest(least(coalesce(p_limit, 1), 100), 1)
    for update skip locked
  )
  returning j.*;
end;
$$;

-- Leases that ran out, every kind: back in line, or failed after the last attempt, or closed when a newer job for the
-- same key already waits. One caller at a time; returns how many it touched.
create or replace function public.recover_jobs() returns int
language plpgsql security definer set search_path = public as $$
declare
  a int;
  b int;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('claritia:recover_jobs', 0)) then
    return 0;
  end if;
  update jobs j set
    status = case when j.attempts >= j.max_attempts then 'failed' else 'done' end,
    error = case when j.attempts >= j.max_attempts then 'The worker stopped answering' else 'Replaced by a newer job for the same key' end,
    finished_at = now(), locked_by = null, locked_until = null
  where j.id in (
    select x.id from jobs x
    where x.status = 'running' and x.locked_until < now()
      and (x.attempts >= x.max_attempts or (x.key <> '' and job_key_waiting(x.workspace_id, x.kind, x.key)))
    limit 5000
    for update skip locked
  );
  get diagnostics a = row_count;
  update jobs j set status = 'queued', run_after = now(), locked_by = null, locked_until = null,
    error = 'The worker stopped answering; trying again'
  where j.id in (
    select x.id from jobs x
    where x.status = 'running' and x.locked_until < now()
      and (x.key = '' or not job_key_waiting(x.workspace_id, x.kind, x.key))
    limit 5000
    for update skip locked
  );
  get diagnostics b = row_count;
  if b > 0 then
    perform pg_notify('claritia_jobs', '0');
  end if;
  return a + b;
end;
$$;

-- Finishing -----------------------------------------------------------------------------------------------------

-- As before (020_foundation.sql): a failure tries again later (1, 5, 30 minutes, then 2 and 6 hours, or p_retry_s),
-- until the last attempt; p_retry_s = -1 means don't try again. False means the lease was lost.
create or replace function public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text default null, p_retry_s int default null)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  j jobs;
  wait int;
begin
  select * into j from jobs where id = p_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return false;
  end if;
  if p_ok then
    update jobs set status = 'done', error = null, finished_at = now(), locked_by = null, locked_until = null where id = p_id;
    return true;
  end if;
  if p_retry_s = -1 or j.attempts >= j.max_attempts or (j.key <> '' and job_key_waiting(j.workspace_id, j.kind, j.key)) then
    update jobs set status = 'failed', error = left(coalesce(p_error, 'Failed'), 2000), finished_at = now(),
      locked_by = null, locked_until = null where id = p_id;
    return true;
  end if;
  wait := greatest(coalesce(p_retry_s, (array[60, 300, 1800, 7200, 21600])[least(j.attempts, 5)]), 0);
  update jobs set status = 'queued', error = left(coalesce(p_error, 'Failed'), 2000), run_after = now() + make_interval(secs => wait),
    locked_by = null, locked_until = null where id = p_id;
  return true;
end;
$$;

-- A job the worker stopped because it was shutting down: back in line now, and this try doesn't count. A newer job
-- for the same key that already waits takes over instead. False means the lease was lost.
create or replace function public.release_job(p_id uuid, p_worker text, p_error text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  j jobs;
begin
  select * into j from jobs where id = p_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return false;
  end if;
  if j.key <> '' and job_key_waiting(j.workspace_id, j.kind, j.key) then
    update jobs set status = 'done', error = 'Replaced by a newer job for the same key', finished_at = now(),
      locked_by = null, locked_until = null where id = p_id;
  else
    update jobs set status = 'queued', run_after = now(), attempts = greatest(attempts - 1, 0),
      error = left(coalesce(p_error, 'Stopped with the worker; trying again'), 2000), locked_by = null, locked_until = null where id = p_id;
    perform pg_notify('claritia_jobs', j.priority::text);
  end if;
  return true;
end;
$$;

-- How many jobs of a kind wait for a workspace, counted up to p_cap (a backfill pages on only while few wait).
create or replace function public.jobs_waiting(p_ws uuid, p_kind text, p_cap int default 1000) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from (
    select 1 from jobs where status = 'queued' and workspace_id = p_ws and kind = p_kind
    limit greatest(least(coalesce(p_cap, 1000), 100000), 1)) x;
$$;

-- Finished jobs: kept a week (failed ones a month), the busiest kinds a day. In batches, at most 200,000 a call.
create or replace function public.prune_jobs() returns void
language plpgsql security definer set search_path = public as $$
declare
  k int;
  total int := 0;
begin
  loop
    delete from jobs where id in (
      select id from jobs
      where status in ('done', 'failed') and finished_at < now() - interval '1 day'
        and ((status = 'done' and (finished_at < now() - interval '7 days'
                                   or kind in ('calendar_refresh', 'score_account', 'stitch', 'ip_lookup', 'identity_changed', 'send',
                                               'route', 'enrich_contact', 'qualify', 'workflow_run', 'score_refresh', 'calendar_watch')))
             or finished_at < now() - interval '30 days')
      limit 10000);
    get diagnostics k = row_count;
    total := total + k;
    exit when k < 10000 or total >= 200000;
  end loop;
end;
$$;

-- Batched answers -----------------------------------------------------------------------------------------------

-- [{id, outcome, provider_id, error, delay_s}] through send_done (067_resend.sql), in one call.
create or replace function public.send_done_many(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    perform send_done((r->>'id')::uuid, r->>'outcome', nullif(r->>'provider_id', ''), r->>'error', coalesce((r->>'delay_s')::int, 60));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- [{id, outcome, provider_id, error}] through meeting_mail_done (055_meeting_lifecycle.sql), in one call.
create or replace function public.meeting_mail_done_many(p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    perform meeting_mail_done((r->>'id')::uuid, r->>'outcome', nullif(r->>'provider_id', ''), r->>'error');
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Router ----------------------------------------------------------------------------------------------------------

-- As 064_router.sql, as one insert: an import's (or the CRM's) new contacts each get a route job at bulk priority.
create or replace function public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[] default null, p_import uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
begin
  if p_reason not in ('crm', 'import') then raise exception 'bad reason'; end if;
  if not exists (select 1 from routers where workspace_id = p_ws and live_version is not null) then return 0; end if;
  with c as (
    select x.id from contacts x
    where x.workspace_id = p_ws and x.deleted_at is null and x.owner_user_id is null and x.owner_crm_id is null
      and coalesce(x.route_status, '') <> 'spam'
      and ((p_contacts is not null and x.id = any(p_contacts)) or (p_import is not null and x.import_id = p_import))
    limit 50000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select p_ws, 'route', p_reason || ':' || c.id::text,
           jsonb_build_object('contact', c.id, 'reason', p_reason, 'key', p_reason || ':' || c.id::text), now(), 5,
           job_priority('route', jsonb_build_object('reason', p_reason))
    from c
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into n from ins;
  if n > 0 then
    perform pg_notify('claritia_jobs', job_priority('route', jsonb_build_object('reason', p_reason))::text);
  end if;
  return n;
end;
$$;

-- Alert parts (an email address, 'dm', 'channel') are claimed before they go, so a run's alert never reaches anyone
-- twice, even when two workers hold the job. Returns the parts newly claimed. A send the provider put off is
-- unclaimed for the retry.
create table if not exists public.router_alert_sent (
  run_id uuid not null references public.router_runs (id) on delete cascade,
  part text not null check (length(part) between 1 and 320),
  at timestamptz not null default now(),
  primary key (run_id, part)
);
alter table public.router_alert_sent enable row level security;
revoke all on public.router_alert_sent from anon, authenticated;

create or replace function public.router_alert_claim(p_run uuid, p_parts text[]) returns text[]
language sql security definer set search_path = public as $$
  with ins as (
    insert into router_alert_sent (run_id, part) select p_run, x from unnest(p_parts) x where length(x) between 1 and 320
    on conflict do nothing returning part)
  select coalesce(array_agg(part), '{}') from ins;
$$;
create or replace function public.router_alert_unclaim(p_run uuid, p_parts text[]) returns void
language sql security definer set search_path = public as $$
  delete from router_alert_sent where run_id = p_run and part = any(p_parts);
$$;

-- The same for a form's parts (form_notify_sent, 083_form_notify.sql).
create or replace function public.form_notify_claim(p_sid uuid, p_parts text[]) returns text[]
language sql security definer set search_path = public as $$
  with ins as (
    insert into form_notify_sent (submission_id, part) select p_sid, x from unnest(p_parts) x where x ~ '^(alert:[^\s]{3,254}|slack|reply)$'
    on conflict do nothing returning part)
  select coalesce(array_agg(part), '{}') from ins;
$$;
create or replace function public.form_notify_unclaim(p_sid uuid, p_parts text[]) returns void
language sql security definer set search_path = public as $$
  delete from form_notify_sent where submission_id = p_sid and part = any(p_parts);
$$;

-- A form fill's routing is written: its alerts job, waiting for the rep's name, runs now.
create or replace function public.router_runs_wake_notify() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.key like 'form:%' then
    update jobs set run_after = now()
    where status = 'queued' and workspace_id = new.workspace_id and kind = 'form_notify' and key = 'form_notify:' || substr(new.key, 6)
      and run_after > now() and payload->>'waiting_route' = 'true';
    if found then
      perform pg_notify('claritia_jobs', '0');
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists router_runs_wake_notify on public.router_runs;
create trigger router_runs_wake_notify after insert on public.router_runs for each row execute function public.router_runs_wake_notify();

-- Workflows -------------------------------------------------------------------------------------------------------

-- Runs a workflow_run job claimed but left for its next round go back at once instead of after the 2-minute claim.
create or replace function public.workflow_unclaim(p_runs uuid[]) returns void
language sql security definer set search_path = public as $$
  update workflow_runs set claimed_at = null where id = any(p_runs);
$$;

-- Calendars ---------------------------------------------------------------------------------------------------------

-- As 054_calendars.sql, in two inserts: an account whose every busy calendar has a live push channel refreshes hourly
-- (pushes bring changes in between); the rest every 10 minutes.
create or replace function public.calendars_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  a int;
  b int;
  now_ms numeric := extract(epoch from now()) * 1000;
begin
  with due as (
    select x.id, x.workspace_id from calendar_accounts x
    where x.status = 'ok' and x.provider in ('google', 'microsoft')
      and (x.refreshed_at is null or x.refreshed_at < now() - interval '10 minutes')
      and (x.refreshed_at is null or x.refreshed_at < now() - interval '1 hour'
           or x.channels = '{}'::jsonb
           or exists (select 1 from calendar_lists l
                      where l.account_id = x.id and l.busy
                        and not (jsonb_typeof(x.channels->l.calendar_id->'expires') = 'number'
                                 and (x.channels->l.calendar_id->>'expires')::numeric > now_ms)))
      and not exists (select 1 from jobs j where j.kind = 'calendar_refresh' and j.workspace_id = x.workspace_id and j.key = x.id::text
                        and j.status in ('queued', 'running'))
    order by x.refreshed_at nulls first
    limit 5000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select d.workspace_id, 'calendar_refresh', d.id::text, jsonb_build_object('account', d.id), now(), 3, job_priority('calendar_refresh')
    from due d
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into a from ins;
  with due as (
    select x.id, x.workspace_id from calendar_accounts x
    where x.status = 'ok' and x.provider in ('google', 'microsoft') and (x.watch_due is null or x.watch_due < now())
      and not exists (select 1 from jobs j where j.kind = 'calendar_watch' and j.workspace_id = x.workspace_id and j.key = x.id::text
                        and j.status in ('queued', 'running'))
    limit 2000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select d.workspace_id, 'calendar_watch', d.id::text, jsonb_build_object('account', d.id), now(), 3, job_priority('calendar_watch')
    from due d
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into b from ins;
  if a > 0 then perform pg_notify('claritia_jobs', job_priority('calendar_refresh')::text); end if;
  if b > 0 then perform pg_notify('claritia_jobs', job_priority('calendar_watch')::text); end if;
  return a + b;
end;
$$;

-- Signals ------------------------------------------------------------------------------------------------------------

-- The visits the signals sweep still has to look at (worker-intel/jobs/signals.ts), so an idle sweep reads nothing.
create index if not exists sessions_needs_signal on public.sessions (ended_at)
  where account_id is not null and not internal and not is_bot and (signaled_at is null or signaled_at < ended_at);

-- Grants -------------------------------------------------------------------------------------------------------------

revoke execute on function public.job_priority(text, jsonb) from public, anon, authenticated;
revoke execute on function public.job_key_waiting(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.job_key_running(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.enqueue_job(uuid, text, text, jsonb, int, int) from public, anon, authenticated;
revoke execute on function public.enqueue_jobs(jsonb) from public, anon, authenticated;
revoke execute on function public.claim_job_lane(text[], text, int, int, int) from public, anon, authenticated;
revoke execute on function public.claim_job(text[], text, int, int) from public, anon, authenticated;
revoke execute on function public.recover_jobs() from public, anon, authenticated;
revoke execute on function public.finish_job(uuid, text, boolean, text, int) from public, anon, authenticated;
revoke execute on function public.release_job(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.jobs_waiting(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.prune_jobs() from public, anon, authenticated;
revoke execute on function public.send_done_many(jsonb) from public, anon, authenticated;
revoke execute on function public.meeting_mail_done_many(jsonb) from public, anon, authenticated;
revoke execute on function public.router_queue(uuid, text, uuid[], uuid) from public, anon, authenticated;
revoke execute on function public.router_alert_claim(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.router_alert_unclaim(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.form_notify_claim(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.form_notify_unclaim(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.router_runs_wake_notify() from public, anon, authenticated;
revoke execute on function public.workflow_unclaim(uuid[]) from public, anon, authenticated;
revoke execute on function public.calendars_due() from public, anon, authenticated;
grant execute on function public.job_priority(text, jsonb) to service_role;
grant execute on function public.job_key_waiting(uuid, text, text) to service_role;
grant execute on function public.job_key_running(uuid, text, text) to service_role;
grant execute on function public.enqueue_job(uuid, text, text, jsonb, int, int) to service_role;
grant execute on function public.enqueue_jobs(jsonb) to service_role;
grant execute on function public.claim_job_lane(text[], text, int, int, int) to service_role;
grant execute on function public.claim_job(text[], text, int, int) to service_role;
grant execute on function public.recover_jobs() to service_role;
grant execute on function public.finish_job(uuid, text, boolean, text, int) to service_role;
grant execute on function public.release_job(uuid, text, text) to service_role;
grant execute on function public.jobs_waiting(uuid, text, int) to service_role;
grant execute on function public.prune_jobs() to service_role;
grant execute on function public.send_done_many(jsonb) to service_role;
grant execute on function public.meeting_mail_done_many(jsonb) to service_role;
grant execute on function public.router_queue(uuid, text, uuid[], uuid) to service_role;
grant execute on function public.router_alert_claim(uuid, text[]) to service_role;
grant execute on function public.router_alert_unclaim(uuid, text[]) to service_role;
grant execute on function public.form_notify_claim(uuid, text[]) to service_role;
grant execute on function public.form_notify_unclaim(uuid, text[]) to service_role;
grant execute on function public.workflow_unclaim(uuid[]) to service_role;
grant execute on function public.calendars_due() to service_role;
grant select, insert, delete on public.router_alert_sent to service_role;
