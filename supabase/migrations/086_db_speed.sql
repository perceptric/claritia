-- Database speed: nothing here grows with a workspace's history. No cron, query, trigger or policy reads more than
-- what changed or what the screen shows. Run after 085. Safe to run more than once. On a busy production table, run a
-- large `create index` by hand as `create index concurrently` first (the `if not exists` here then skips it).
-- Running cost: $0 a month more at Beta (50 teams) and at Growth (500 teams). No new services and no AI calls; the
-- database does less work.
--
-- Measured on 2 workspaces x 30k contacts, 300k contact_events over 12 months, 200k submissions, 100k router_runs,
-- 50k meetings, 1.95M events in 100 day tables, 500k jobs (EXPLAIN ANALYZE, warm, ms, before -> after):
--   forms_list 12,823 -> 35 | visitors_live 8,453 -> 25 | lead_scores_due 545 -> 42 (steady tick)
--   workflow_scan 235 -> 3 (steady tick) | nurture_enroll 147 -> 12 (steady), and it now enrolls past 5,000
--   form_booking_stats 493 -> 35 | calendars_due 175 -> 2 | scoring_facts 328 -> 122 | count(*) of contacts
--   through RLS 114 -> 8 | records_search 54 -> 3 | meeting_inputs 22 -> 5 | first_touch_fill 14 -> 0.2
--
-- Sections: 1 indexes; 2 lead scores; 3 journeys; 4 nurtures; 5 forms list; 6 hosts and routing; 7 reports;
-- 8 web visits; 9 prunes and the nightly schedule; 10 functions copied from their latest definitions with small
-- changes; 11 relation pickers; 12 row level security; 13 grants.

-- 1. Indexes -------------------------------------------------------------------------------------------------------

-- Forms, submissions, meetings
create index if not exists submissions_form_leads on public.submissions (form_id, created_at desc) where not spam and not test;
create index if not exists submissions_spam on public.submissions (created_at) where spam;
create index if not exists meetings_submission on public.meetings (submission_id) where submission_id is not null;
create index if not exists meetings_holding on public.meetings (workspace_id, block_end) include (hosts, block_start, type_id, start_at)
  where status in ('booked', 'pending_payment');
create index if not exists meetings_rr on public.meetings (type_id, created_at) where rr;
create index if not exists deliveries_failed_dest on public.deliveries (destination_id) where status = 'failed';
create index if not exists form_field_sessions_left on public.form_field_sessions (form_id, started_at desc) where not sent;

-- Queue: open jobs by key (calendars_due, deliveries_sweep, claim_job's "same key running"). Only this one; the rest
-- of the jobs table is 087_job_lanes.sql.
create index if not exists jobs_open_key on public.jobs (kind, workspace_id, key) where status in ('queued', 'running');

-- Web events, contact activity, sessions
create index if not exists events_custom_recent on public.events (server_at) where kind = 'custom';
create index if not exists events_ws_custom on public.events (workspace_id, day) where kind = 'custom';
-- A visit's events by session and day, so reads bounded to the visit's days (section 8) are one index range.
-- It serves every lookup the session-only index did, which goes.
create index if not exists events_session_day on public.events (session_id, day);
drop index if exists public.events_session;
create index if not exists sessions_site_started on public.sessions (site_id, started_at desc);
create index if not exists sessions_started_brin on public.sessions using brin (started_at);

-- Workflows, sending, scoring, contacts
create index if not exists workflow_runs_next on public.workflow_runs (next_at) where status in ('active', 'waiting');
create index if not exists email_messages_due on public.email_messages (send_after) where status = 'queued';
create index if not exists contacts_score_due on public.contacts (workspace_id, scored_at nulls first) where deleted_at is null;
create index if not exists contacts_ws_id on public.contacts (workspace_id, id) where deleted_at is null;
create index if not exists contacts_no_touch on public.contacts (created_at) where first_touch is null;
create index if not exists contacts_owner on public.contacts (workspace_id, owner_user_id) where deleted_at is null;
create index if not exists contacts_merged on public.contacts (merged_into) where merged_into is not null;

-- Foreign keys with no index on the child column
create index if not exists meeting_mails_submission on public.meeting_mails (submission_id) where submission_id is not null;
create index if not exists form_checks_submission on public.form_checks (submission_id) where submission_id is not null;
create index if not exists nurture_enrollments_contact on public.nurture_enrollments (contact_id);
create index if not exists form_bookings_contact on public.form_bookings (contact_id) where contact_id is not null;
create index if not exists form_submissions_contact on public.form_submissions (contact_id) where contact_id is not null;
create index if not exists enrich_runs_company on public.enrich_runs (company_id) where company_id is not null;
create index if not exists meeting_outcome_uses_meeting on public.meeting_outcome_uses (meeting_id);
create index if not exists account_feedback_account on public.account_feedback (account_id, created_at desc);
-- record_cleanup deletes notes and tasks by record without the object; these serve it.
create index if not exists notes_record_id on public.notes (record_id);
create index if not exists tasks_record_id on public.tasks (record_id);

-- Lookups
create index if not exists meeting_mails_to on public.meeting_mails (to_email, created_at desc) where status = 'sent';
create index if not exists erasures_hash on public.erasures (value_hash);
create index if not exists crm_owner_links_owner on public.crm_owner_links (workspace_id, crm_owner_id) where user_id is not null;
create index if not exists router_slas_nudge on public.router_slas (nudge_at) where status = 'open' and nudged_at is null;
create index if not exists companies_updated on public.companies (workspace_id, updated_at);

-- An erasure deletes the cached person by hash; hash once per row in an index instead of per erasure.
create or replace function public.email_hash(p text) returns bytea
language sql immutable parallel safe as $$ select pg_catalog.sha256(pg_catalog.convert_to(p, 'UTF8')) $$;
create index if not exists person_cache_hash on public.person_cache (public.email_hash(email_clean));
-- A contact's name as the screens show it (concat_ws), indexable.
create or replace function public.person_name(p_first text, p_last text) returns text
language sql immutable parallel safe as $$ select pg_catalog.concat_ws(' ', p_first, p_last) $$;

-- Prunes: BRIN on the time column (tiny on append-mostly tables)
create index if not exists field_history_at_brin on public.field_history using brin (at);
create index if not exists router_runs_created_brin on public.router_runs using brin (created_at);
create index if not exists sync_log_at_brin on public.sync_log using brin (at);
create index if not exists source_runs_started_brin on public.source_runs using brin (started_at);
create index if not exists hook_events_received_brin on public.hook_events using brin (received_at);
create index if not exists hook_events_done_brin on public.hook_events using brin (done_at);
create index if not exists activity_out_claimed_brin on public.activity_out using brin (claimed_at);
create index if not exists meeting_mails_created_brin on public.meeting_mails using brin (created_at);
create index if not exists webhook_deliveries_created_brin on public.webhook_deliveries using brin (created_at);
create index if not exists ai_cache_created_brin on public.ai_cache using brin (created_at);
create index if not exists form_checks_started_brin on public.form_checks using brin (started_at);
create index if not exists form_field_sessions_day_brin on public.form_field_sessions using brin (day);
create index if not exists form_seen_at_brin on public.form_seen using brin (at);
create index if not exists source_event_keys_at_brin on public.source_event_keys using brin (at);
create index if not exists router_replays_created_brin on public.router_replays using brin (created_at);

-- Search: trigram indexes for the relation pickers (records_search). pg_trgm lives in `extensions` on Supabase.
do $$
declare
  sch text;
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists pg_trgm with schema extensions;
  else
    create extension if not exists pg_trgm;
  end if;
  select n.nspname into sch from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'pg_trgm';
  execute format('create index if not exists contacts_email_trgm on public.contacts using gin (email %I.gin_trgm_ops) where deleted_at is null', sch);
  execute format('create index if not exists contacts_name_trgm on public.contacts using gin (public.person_name(first_name, last_name) %I.gin_trgm_ops) where deleted_at is null', sch);
  execute format('create index if not exists companies_name_trgm on public.companies using gin (name %I.gin_trgm_ops) where deleted_at is null', sch);
  execute format('create index if not exists companies_domain_trgm on public.companies using gin (domain %I.gin_trgm_ops) where deleted_at is null', sch);
  execute format('create index if not exists records_name_trgm on public.records using gin (name %I.gin_trgm_ops) where deleted_at is null', sch);
end;
$$;

-- 2. Lead scores (043) -------------------------------------------------------------------------------------------
-- Before: every 5 minutes, every enabled workspace rescored up to 5,000 contacts picked by a full scan (an `exists` on
-- contact_events across every month per contact), wrote all of them, and every contact came due again each day, so the
-- whole base was rewritten daily and re-pushed to CRMs.
-- Now: contacts are picked by change (new; activity, a visit or an edit in the last day newer than their score), plus a
-- daily pass that walks the workspace in id order a slice at a time. A row is written only when its score, band, fit,
-- engagement or reasons change (or, when picked by change, to mark it scored). Workspaces with a live scoring model are
-- skipped (080 scores them). Each 5-minute run stops after 20 seconds and starts next time with the workspaces it
-- missed.

create table if not exists public.lead_score_marks (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  sweep_after uuid,
  sweep_started_at timestamptz,
  ran_at timestamptz
);
alter table public.lead_score_marks enable row level security;
revoke all on public.lead_score_marks from anon, authenticated;

create or replace function public.lead_scores_refresh(p_ws uuid, p_limit int default 5000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s lead_settings;
  lim int := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  kinds text[];
  changed uuid[];
  sweep uuid[];
  ids uuid[];
  mk lead_score_marks;
  room int;
  n int;
  routed int := 0;
  r record;
begin
  select * into s from lead_settings where workspace_id = p_ws and enabled;
  if s.workspace_id is null then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  if exists (select 1 from scoring_models m where m.workspace_id = p_ws and m.live_version is not null) then
    return jsonb_build_object('scored', 0, 'routed', 0);
  end if;
  kinds := array(select jsonb_object_keys(s.weights));
  -- New, or did something (weighted activity, a visit, an edit) in the last day after their last score.
  select array_agg(id) into changed from (
    select u.id from (
      (select c.id, c.scored_at from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.scored_at is null limit lim)
      union
      select c.id, c.scored_at from contact_events e join contacts c on c.id = e.contact_id
      where e.workspace_id = p_ws and e.kind = any(kinds) and e.at > now() - interval '1 day'
        and c.deleted_at is null and e.at > c.scored_at
      union
      select c.id, c.scored_at from sessions x join contacts c on c.workspace_id = p_ws and c.person_id = x.person_id
      where x.workspace_id = p_ws and x.person_id is not null and x.started_at > now() - interval '1 day'
        and c.deleted_at is null and x.started_at > c.scored_at
      union
      select c.id, c.scored_at from contacts c
      where c.workspace_id = p_ws and c.deleted_at is null and c.updated_at > now() - interval '1 day' and c.updated_at > c.scored_at
    ) u
    order by u.scored_at nulls first
    limit lim
  ) t;
  -- The daily pass: everyone once a day, in id order, a slice per run. It catches decay, company and settings changes.
  room := least(lim - coalesce(cardinality(changed), 0), 500);
  if room > 0 then
    insert into lead_score_marks (workspace_id) values (p_ws) on conflict (workspace_id) do nothing;
    select * into mk from lead_score_marks where workspace_id = p_ws for update;
    if mk.sweep_after is null and (mk.sweep_started_at is null or mk.sweep_started_at < now() - interval '1 day') then
      mk.sweep_after := '00000000-0000-0000-0000-000000000000';
      mk.sweep_started_at := now();
    end if;
    if mk.sweep_after is not null then
      select array_agg(c.id order by c.id) into sweep from (
        select c.id from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.id > mk.sweep_after order by c.id limit room
      ) c;
      update lead_score_marks set
        sweep_after = case when coalesce(cardinality(sweep), 0) < room then null else sweep[cardinality(sweep)] end,
        sweep_started_at = mk.sweep_started_at
      where workspace_id = p_ws;
    end if;
  end if;
  ids := array(select distinct x from unnest(coalesce(changed, '{}') || coalesce(sweep, '{}')) x);
  if cardinality(ids) = 0 then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  -- Write only what changed.
  update contacts c set score = x.total, score_band = x.band, fit_score = x.fit, engagement_score = x.engagement, score_reasons = x.reasons, scored_at = now()
  from lead_score_rows(p_ws, ids) x
  where c.id = x.contact_id
    and (c.score is distinct from x.total or c.score_band is distinct from x.band or c.fit_score is distinct from x.fit
         or c.engagement_score is distinct from x.engagement or c.score_reasons is distinct from x.reasons);
  -- Picked by change and unchanged: mark scored so they aren't picked again. The daily pass writes nothing for them.
  if changed is not null then
    update contacts c set scored_at = now() where c.id = any(changed) and c.deleted_at is null and (c.scored_at is null or c.scored_at < now());
  end if;
  select count(*) into n from contacts c where c.id = any(ids) and c.workspace_id = p_ws and c.deleted_at is null;
  for r in select id from contacts where id = any(ids) and score >= s.threshold and qualified_at is null loop
    perform lead_route(r.id);
    routed := routed + 1;
  end loop;
  return jsonb_build_object('scored', n, 'routed', routed);
end;
$$;

create or replace function public.lead_scores_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  w uuid;
  n int := 0;
  t0 timestamptz := clock_timestamp();
begin
  for w in
    select l.workspace_id from lead_settings l left join lead_score_marks m on m.workspace_id = l.workspace_id
    where l.enabled and not exists (select 1 from scoring_models s where s.workspace_id = l.workspace_id and s.live_version is not null)
    order by m.ran_at nulls first
  loop
    exit when clock_timestamp() - t0 > interval '20 seconds';
    perform lead_scores_refresh(w, 2000);
    insert into lead_score_marks (workspace_id, ran_at) values (w, clock_timestamp())
    on conflict (workspace_id) do update set ran_at = excluded.ran_at;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A score change alone no longer marks the contact changed for CRM push; the band and the CRM owner still do.
create or replace function public.contacts_score_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.score_band is distinct from old.score_band or new.owner_crm_id is distinct from old.owner_crm_id then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

-- Only fire when the CRM owner really changes (bulk owner writes that set the same value skip the function).
drop trigger if exists contacts_crm_owner on public.contacts;
create trigger contacts_crm_owner before update of owner_crm_id on public.contacts for each row
  when (new.owner_crm_id is distinct from old.owner_crm_id and new.owner_crm_id is not null and new.owner_user_id is not distinct from old.owner_user_id)
  execute function public.contacts_crm_owner();
drop trigger if exists contacts_score_touch on public.contacts;
create trigger contacts_score_touch before update of score_band, owner_crm_id on public.contacts for each row
  when (new.score_band is distinct from old.score_band or new.owner_crm_id is distinct from old.owner_crm_id)
  execute function public.contacts_score_touch();
drop trigger if exists contacts_band_event on public.contacts;
create trigger contacts_band_event after update of score_band on public.contacts for each row
  when (new.score_band is distinct from old.score_band and new.score_band is not null and new.deleted_at is null)
  execute function public.contacts_band_event();
drop trigger if exists contacts_owner_meeting_task on public.contacts;
create trigger contacts_owner_meeting_task after update on public.contacts for each row
  when (new.owner_user_id is distinct from old.owner_user_id and new.owner_user_id is not null and coalesce(new.field_sources->'owner'->>'s', '') = 'crm')
  execute function public.contacts_owner_meeting_task();

-- 3. Journeys (069, 082) -----------------------------------------------------------------------------------------
-- workflow_scan ran every minute per live workflow: event triggers walked every event of the workspace in the month
-- (the kind sat inside a CASE, so the (workspace_id, kind, at) index was used only by workspace), a broadcast re-sent
-- its whole segment every minute forever, and a date trigger scanned every contact every minute until midnight.
-- Now: event triggers filter on their kinds (indexed) from a per-workflow mark, a broadcast fires once per live
-- version, and a date trigger runs once a day. Marks live in their own table so editors never wait on the scan.

create table if not exists public.workflow_marks (
  workflow_id uuid primary key references public.workflows (id) on delete cascade,
  scanned_to timestamptz,
  fired_version int,
  date_ran_on date
);
alter table public.workflow_marks enable row level security;
revoke all on public.workflow_marks from anon, authenticated;

-- Broadcasts already live when this runs have fired (they re-sent every minute before); mark them so they stop.
insert into public.workflow_marks (workflow_id, fired_version)
select f.id, f.live_version from public.workflows f join public.workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
where f.status = 'live' and v.body->'trigger'->>'kind' = 'broadcast'
  and exists (select 1 from public.workflow_runs r where r.workflow_id = f.id and r.key like 'bc:%')
on conflict (workflow_id) do nothing;

create or replace function public.workflow_scan() returns integer
language plpgsql security definer set search_path = public as $$
declare
  w record;
  t jsonb;
  started int := 0;
  k int;
  since timestamptz;
  kinds text[];
begin
  for w in
    select f.id, f.workspace_id, f.live_version, f.live_at, v.body, m.scanned_to, m.fired_version, m.date_ran_on
    from workflows f join workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
    left join workflow_marks m on m.workflow_id = f.id
    where f.status = 'live' and f.trigger_kind not in ('manual')
  loop
    t := w.body->'trigger';
    if t->>'kind' in ('form', 'meeting', 'not_booked', 'outcome', 'band', 'routed', 'segment', 'field', 'clicked', 'product') then
      -- Re-read the last 15 minutes past the mark so an event that commits late is still picked up; never more than a day.
      since := greatest(w.live_at, coalesce(w.scanned_to, now()) - interval '15 minutes', now() - interval '1 day');
      kinds := case t->>'kind'
        when 'form' then array['form.submitted']
        when 'meeting' then array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x)
        when 'not_booked' then array['meeting.not_booked']
        when 'outcome' then array['lead.outcome']
        when 'band' then array['lead.band']
        when 'routed' then array(select x from unnest(array['lead.routed', 'lead.unassigned']) x
                                 where (x = 'lead.routed' and t->>'result' in ('routed', 'any')) or (x = 'lead.unassigned' and t->>'result' in ('unassigned', 'any')))
        when 'segment' then array[case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end]
        when 'field' then array['field.changed']
        when 'clicked' then array['email.clicked']
        when 'product' then array['product.used']
      end;
      insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
      select distinct on (e.contact_id) w.workspace_id, w.id, w.live_version, e.contact_id, 'ev:' || e.id::text
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = w.workspace_id and e.kind = any(kinds) and e.at >= since and e.at <= now()
        and case t->>'kind'
          when 'form' then e.kind = 'form.submitted' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'meeting' then e.kind = any(array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x))
            and (jsonb_array_length(coalesce(t->'types', '[]')) = 0 or t->'types' ? (e.data->>'type_id'))
          when 'not_booked' then e.kind = 'meeting.not_booked' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'outcome' then e.kind = 'lead.outcome' and t->'outcomes' ? (e.data->>'outcome')
          when 'band' then e.kind = 'lead.band' and (jsonb_array_length(coalesce(t->'bands', '[]')) = 0 or t->'bands' ? (e.data->>'to'))
          when 'routed' then (e.kind = 'lead.routed' and t->>'result' in ('routed', 'any')) or (e.kind = 'lead.unassigned' and t->>'result' in ('unassigned', 'any'))
          when 'segment' then e.kind = case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end and e.data->>'segment_id' = t->>'segment'
          when 'field' then e.kind = 'field.changed' and e.data->>'key' = t->>'key' and (coalesce(t->>'to', '') = '' or e.data->>'new' = to_jsonb(t->>'to')::text or e.data->'new' = to_jsonb(t->>'to'))
          when 'clicked' then e.kind = 'email.clicked' and (jsonb_array_length(coalesce(t->'emails', '[]')) = 0 or t->'emails' ? (e.data->>'email_id'))
          when 'product' then e.kind = 'product.used' and t->'events' ? (e.data->>'name')
          else false
        end
        and not exists (select 1 from workflow_runs r where r.workflow_id = w.id and r.key = 'ev:' || e.id::text)
        and workflow_may_start(w.id, e.contact_id)
      order by e.contact_id, e.at
      on conflict (workflow_id, key) do nothing;
      get diagnostics k = row_count;
      started := started + k;
      insert into workflow_marks (workflow_id, scanned_to) values (w.id, now())
      on conflict (workflow_id) do update set scanned_to = excluded.scanned_to;
    elsif t->>'kind' = 'broadcast' then
      -- Once, at its time, to everyone in the segment then.
      if (t->>'at')::timestamptz <= now() and w.fired_version is distinct from w.live_version then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, m.contact_id, 'bc:' || m.contact_id
        from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
        where m.segment_id = (t->>'segment')::uuid and m.left_at is null
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
        insert into workflow_marks (workflow_id, fired_version) values (w.id, w.live_version)
        on conflict (workflow_id) do update set fired_version = excluded.fired_version;
      end if;
    elsif t->>'kind' = 'date' then
      -- Once a day after the hour: contacts whose date field, moved by the days, is today.
      if to_char(now(), 'HH24:MI') >= coalesce(t->>'time', '09:00') and w.date_ran_on is distinct from current_date then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, c.id, 'date:' || c.id || ':' || current_date
        from contacts c
        where c.workspace_id = w.workspace_id and c.deleted_at is null
          and (case when t->>'field' like 'f.%' then c.fields->>substr(t->>'field', 3) else null end) ~ '^\d{4}-\d{2}-\d{2}'
          and (left(c.fields->>substr(t->>'field', 3), 10)::date + coalesce((t->>'days')::int, 0)) = current_date
          and workflow_may_start(w.id, c.id)
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
        insert into workflow_marks (workflow_id, date_ran_on) values (w.id, current_date)
        on conflict (workflow_id) do update set date_ran_on = excluded.date_ran_on;
      end if;
    end if;
  end loop;
  return started;
end;
$$;

-- 4. Nurtures (042) ----------------------------------------------------------------------------------------------
-- Bug: the 5,000 limit came before the "already enrolled" check, so every run re-read the same first 5,000 members and
-- nobody past them was ever enrolled. Now the check comes first. A form nurture reads form fills from a mark (the last
-- run, less 15 minutes) instead of every fill since it went live.

create table if not exists public.nurture_marks (
  nurture_id uuid primary key references public.nurtures (id) on delete cascade,
  enrolled_to timestamptz
);
alter table public.nurture_marks enable row level security;
revoke all on public.nurture_marks from anon, authenticated;

create or replace function public.nurture_enroll(p_nurture uuid default null) returns integer
language plpgsql security definer set search_path = public as $$
declare
  n nurtures;
  first_wait int;
  added int := 0;
  k int;
  mark timestamptz;
begin
  for n in select * from nurtures where status = 'live' and (p_nurture is null or id = p_nurture) loop
    select wait_days into first_wait from nurture_steps where nurture_id = n.id order by position limit 1;
    if first_wait is null then continue; end if;
    if n.trigger->>'kind' = 'segment' then
      insert into nurture_enrollments (workspace_id, nurture_id, contact_id, next_at)
      select n.workspace_id, n.id, m.contact_id, now() + make_interval(days => first_wait)
      from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
      where m.segment_id = nullif(n.trigger->>'segment_id', '')::uuid and m.left_at is null
        and not exists (select 1 from nurture_enrollments x where x.nurture_id = n.id and x.contact_id = m.contact_id)
      limit 5000
      on conflict (nurture_id, contact_id) do nothing;
      get diagnostics k = row_count;
    elsif n.trigger->>'kind' = 'form' then
      select enrolled_to into mark from nurture_marks where nurture_id = n.id;
      insert into nurture_enrollments (workspace_id, nurture_id, contact_id, next_at)
      select distinct n.workspace_id, n.id, e.contact_id, now() + make_interval(days => first_wait)
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = n.workspace_id and e.kind = 'form.submitted' and e.data->>'form_id' = n.trigger->>'form_id'
        and e.at >= greatest(n.live_at, mark - interval '15 minutes')
        and not exists (select 1 from nurture_enrollments x where x.nurture_id = n.id and x.contact_id = e.contact_id)
      limit 5000
      on conflict (nurture_id, contact_id) do nothing;
      get diagnostics k = row_count;
      -- Move the mark only when this run took everything it found.
      if k < 5000 then
        insert into nurture_marks (nurture_id, enrolled_to) values (n.id, now())
        on conflict (nurture_id) do update set enrolled_to = excluded.enrolled_to;
      end if;
    else
      k := 0;
    end if;
    added := added + k;
  end loop;
  return added;
end;
$$;

-- 5. Forms list (085) --------------------------------------------------------------------------------------------
-- The 7-day spark ran 7 full-history counts per form with ws_tz() twice per row. Now the workspace's time zone and the
-- day boundaries are computed once and every count is a range on (form_id, created_at); the last fill is one index
-- probe; failed deliveries come from a partial index. Same results.

create or replace function public.forms_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with z as (select tz, (now() at time zone tz)::date as day0 from (select ws_tz(p_ws) as tz) t)
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status, 'kind', f.kind, 'version', f.version, 'updated_at', f.updated_at, 'brand_kit_id', f.brand_kit_id,
           'fills', coalesce(s.fills, 0), 'last_fill', l.last_fill, 'failed', coalesce(d.failed, 0), 'check', k.status,
           'week', coalesce(w.week, 0), 'spark', coalesce(w.spark, '[0,0,0,0,0,0,0]'::jsonb), 'views', coalesce(v.views, 0),
           'pages', coalesce(p.pages, 0), 'page', p.page, 'hosted', coalesce(p.hosted, false),
           'edited', f.version > 0 and f.draft is distinct from (select x.body from form_versions x where x.form_id = f.id and x.version = f.version))
         order by f.updated_at desc), '[]'::jsonb)
  from forms f
  cross join z
  left join lateral (
    select count(*) fills from submissions x
    where x.form_id = f.id and not x.spam and not x.test and x.created_at > now() - interval '30 days'
  ) s on true
  left join lateral (
    select x.created_at last_fill from submissions x where x.form_id = f.id and not x.spam and not x.test order by x.created_at desc limit 1
  ) l on true
  left join lateral (
    select count(*) failed from deliveries y join form_destinations fd on fd.id = y.destination_id where fd.form_id = f.id and y.status = 'failed'
  ) d on true
  left join lateral (select c.status from form_checks c where c.form_id = f.id order by c.started_at desc limit 1) k on true
  left join lateral (
    select sum(n)::int week, jsonb_agg(n order by g) spark from (
      select g, (select count(*) from submissions x
                 where x.form_id = f.id and not x.spam and not x.test
                   and x.created_at >= ((z.day0 - g)::timestamp at time zone z.tz)
                   and x.created_at < ((z.day0 - g + 1)::timestamp at time zone z.tz)) n
      from generate_series(6, 0, -1) g
    ) t
  ) w on true
  left join lateral (
    select sum(y.views)::int views from form_daily y where y.form_id = f.id and y.day > current_date - 30
  ) v on true
  left join lateral (
    select count(distinct x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') pages,
           min(x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') page,
           bool_or(x.hidden->>'page' ~ '/f/[0-9a-f-]{36}') hosted
    from submissions x where x.form_id = f.id and not x.test and x.created_at > now() - interval '30 days' and x.hidden ? 'page'
  ) p on true
  where f.workspace_id = p_ws and is_member(p_ws);
$$;

-- form_booking_stats: the per-submission `exists` on meetings now probes meetings_submission.

-- 6. Hosts and routing (053-084) ---------------------------------------------------------------------------------
-- `u = any(m.hosts)` can't use an index; `m.hosts @> array[u]` uses meetings_hosts (GIN), and meeting_inputs' booked
-- range uses meetings_holding. router_pick counts every candidate's turns in one grouped query.

create or replace function public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamptz, p_to timestamptz, p_schedule text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u,
    'availability', coalesce(
      (select jsonb_build_object('tz', s.tz, 'weekly', s.weekly, 'overrides', s.overrides) from availability_schedules s
       where p_schedule is not null and s.workspace_id = p_ws and s.user_id = u and lower(s.name) = lower(p_schedule)),
      (select jsonb_build_object('tz', a.tz, 'weekly', a.weekly, 'overrides', a.overrides) from availability a where a.workspace_id = p_ws and a.user_id = u)),
    'connected', exists (select 1 from calendar_accounts c join calendar_lists l on l.account_id = c.id and l.write
                         where c.workspace_id = p_ws and c.user_id = u and c.status = 'ok' and c.provider <> 'zoom'),
    'reconnect', exists (select 1 from calendar_accounts c where c.workspace_id = p_ws and c.user_id = u and c.status = 'reconnect'),
    'busy', coalesce((select jsonb_agg(jsonb_build_array(b.start_at, b.end_at))
                      from busy_blocks b join calendar_accounts c on c.id = b.account_id
                      join calendar_lists l on l.account_id = b.account_id and l.calendar_id = b.calendar_id and l.busy
                      where c.workspace_id = p_ws and c.user_id = u and c.status = 'ok' and b.end_at > p_from and b.start_at < p_to), '[]'),
    'booked', coalesce((select jsonb_agg(jsonb_build_array(m.block_start, m.block_end, m.type_id, m.start_at, m.id))
                        from meetings m where m.workspace_id = p_ws and m.hosts @> array[u] and meeting_holds(m)
                          and m.block_end > p_from - interval '7 days' and m.block_start < p_to), '[]'),
    'out_dates', coalesce(r.out_dates, '[]'),
    'paused_until', r.paused_until
  ) order by t.ord), '[]')
  from unnest(p_users) with ordinality t(u, ord)
  left join router_reps r on r.workspace_id = p_ws and r.user_id = t.u;
$$;

create or replace function public.calendar_reconnect_info(p_account uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a calendar_accounts%rowtype;
begin
  select * into a from calendar_accounts where id = p_account;
  if a.id is null then return null; end if;
  return jsonb_build_object(
    'account', jsonb_build_object('id', a.id, 'workspace_id', a.workspace_id, 'user_id', a.user_id, 'provider', a.provider,
                                  'account_email', a.account_email, 'status', a.status, 'reconnect_at', a.reconnect_at),
    'person', meeting_people(a.workspace_id, array[a.user_id])->0,
    'upcoming', (select count(*) from meetings m
                 where m.workspace_id = a.workspace_id and m.hosts @> array[a.user_id] and m.status = 'booked'
                   and m.start_at > now() and m.start_at < now() + interval '14 days'),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from workspaces w where w.id = a.workspace_id),
    'sending', meeting_sending(a.workspace_id));
end;
$$;

create or replace function public.router_rep_facts(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select coalesce((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user), 'UTC') as tz),
  z as (select tz, (date_trunc('day', now() at time zone tz) at time zone tz) as day0, (date_trunc('week', now() at time zone tz) at time zone tz) as week0 from a)
  select jsonb_build_object(
    'name', coalesce((select nullif(trim(bp.name), '') from booking_profiles bp where bp.workspace_id = p_ws and bp.user_id = p_user),
                     (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user), 'Someone'),
    'member', exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user),
    'tz', z.tz,
    'availability', (select jsonb_build_object('tz', av.tz, 'weekly', av.weekly, 'overrides', av.overrides) from availability av where av.workspace_id = p_ws and av.user_id = p_user),
    'paused_until', r.paused_until,
    'out_dates', coalesce(r.out_dates, '[]'),
    'calendar_out_until', (select max(b.end_at) from busy_blocks b join calendar_accounts c on c.id = b.account_id
                           where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.ooo and b.start_at <= now() and b.end_at > now()),
    'backup', r.backup,
    'cap_day', r.cap_day,
    'cap_week', r.cap_week,
    'today', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.day0),
    'week', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.week0),
    'meetings_week', (select count(*) from meetings m where m.workspace_id = p_ws and m.hosts @> array[p_user] and m.status in ('booked', 'held')
                      and m.start_at >= z.week0 and m.start_at < z.week0 + interval '7 days')
  )
  from z left join router_reps r on r.workspace_id = p_ws and r.user_id = p_user;
$$;

-- One grouped read of the queue's last 30 days instead of two per candidate. `win` is the same total.
create or replace function public.router_pick(p_ws uuid, p_pick jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := p_pick->>'queue';
  m text := coalesce(p_pick->>'method', 'rr');
  best jsonb;
  win int;
  turns jsonb;
  rows jsonb := '[]';
  x record;
begin
  select coalesce(sum(n), 0)::int, coalesce(jsonb_object_agg(owner::text, jsonb_build_object('n', n, 'last', last)) filter (where owner is not null), '{}')
  into win, turns
  from (
    select r.owner, count(*) as n, max(r.created_at) as last from router_runs r
    where r.workspace_id = p_ws and r.queue_id = q and r.kind = 'owner' and r.undone_at is null and r.created_at > now() - interval '30 days'
    group by r.owner
  ) g;
  for x in
    select (c->>'user')::uuid as u, greatest(1, least(10, coalesce((c->>'weight')::int, 1))) as w, ord,
           coalesce((turns->(c->>'user')::uuid::text->>'n')::bigint, 0) as n,
           (turns->(c->>'user')::uuid::text->>'last')::timestamptz as last,
           router_rep_facts(p_ws, (c->>'user')::uuid) as rf
    from jsonb_array_elements(coalesce(p_pick->'candidates', '[]')) with ordinality t(c, ord)
  loop
    rows := rows || jsonb_build_object('user', x.u, 'n', case when m = 'load' then (x.rf->>'meetings_week')::int else x.n end,
      'score', case when m = 'load' then (x.rf->>'meetings_week')::numeric when m = 'weighted' then x.n::numeric / x.w else x.n::numeric end,
      'last', coalesce(extract(epoch from x.last), 0), 'ord', x.ord,
      'ok', (x.rf->>'member')::boolean
            and not (x.rf->>'paused_until' is not null and (x.rf->>'paused_until')::timestamptz > now())
            and not (x.rf->>'cap_day' is not null and (x.rf->>'today')::int >= (x.rf->>'cap_day')::int)
            and not (x.rf->>'cap_week' is not null and (x.rf->>'week')::int >= (x.rf->>'cap_week')::int));
  end loop;
  select r into best from jsonb_array_elements(rows) r where (r->>'ok')::boolean
  order by (r->>'score')::numeric, (r->>'last')::numeric, (r->>'ord')::int limit 1;
  if best is null then return null; end if;
  return jsonb_build_object('user', best->>'user', 'n', (best->>'n')::int, 'window', win,
    'rest', coalesce((select jsonb_object_agg(r->>'user', jsonb_build_object('n', (r->>'n')::int, 'ok', (r->>'ok')::boolean)) from jsonb_array_elements(rows) r where r->>'user' <> best->>'user'), '{}'));
end;
$$;

-- 7. Reports (070) -----------------------------------------------------------------------------------------------
-- report_leads found each lead's first touch from every submission the workspace ever had, 3-5 times per report.
-- A lead whose first touch is in the range has a touch in the range, so: take the people with a touch in the range,
-- then their own touches only (by contact, including contacts merged into them). Same rows.

create or replace function public.report_leads(p_ws uuid, p_start timestamptz, p_end timestamptz)
returns table (contact_id uuid, lead_at timestamptz, form_id uuid)
language sql stable security definer set search_path = public as $$
  with cand as (
    select coalesce(c2.merged_into, c.merged_into, c.id) as root
    from submissions s join contacts c on c.id = s.contact_id left join contacts c2 on c2.id = c.merged_into
    where s.workspace_id = p_ws and not s.test and not s.spam and s.created_at >= p_start and s.created_at < p_end
    union
    select coalesce(c2.merged_into, c.merged_into, c.id)
    from contacts c left join contacts c2 on c2.id = c.merged_into
    where c.workspace_id = p_ws and c.source = 'api' and c.created_at >= p_start and c.created_at < p_end
  ), near as (
    -- Every contact that can roll up to a candidate: itself, merged into it, or merged into one merged into it.
    select x.root as id from cand x
    union select c.id from cand x join contacts c on c.merged_into = x.root
    union select c1.id from cand x join contacts c0 on c0.merged_into = x.root join contacts c1 on c1.merged_into = c0.id
  ), members as (
    select coalesce(c2.merged_into, c.merged_into, c.id) as root, c.id, c.workspace_id, c.source, c.created_at
    from near n join contacts c on c.id = n.id left join contacts c2 on c2.id = c.merged_into
  ), touches as (
    select m.root, s.created_at as at, s.form_id
    from members m join submissions s on s.contact_id = m.id
    where m.root in (select root from cand) and s.workspace_id = p_ws and not s.test and not s.spam
    union all
    select m.root, m.created_at, null
    from members m
    where m.root in (select root from cand) and m.workspace_id = p_ws and m.source = 'api'
  ), firsts as (
    select distinct on (root) root, at, form_id from touches order by root, at
  )
  select f.root, f.at, f.form_id from firsts f join contacts r on r.id = f.root
  where f.at >= p_start and f.at < p_end and r.deleted_at is null and r.route_status is distinct from 'spam';
$$;

create or replace function public.report_reps(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len int := p_to - p_from + 1;
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  won text[] := report_won_stages(p_ws);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or len > 400 then raise exception 'Pick a range up to 400 days'; end if;
  return jsonb_build_object('weeks', round(len / 7.0, 1), 'reps', coalesce((
    select jsonb_agg(r order by (r->>'leads')::int desc, r->>'id') from (
      select jsonb_build_object(
        'id', m.user_id,
        'leads', (select count(*) from router_runs rr where rr.workspace_id = p_ws and rr.owner = m.user_id and rr.kind = 'owner' and rr.undone_at is null and (rr.created_at >= lower(b) and rr.created_at < upper(b))),
        'met', (select count(*) from router_slas s where s.workspace_id = p_ws and s.user_id = m.user_id and s.status = 'met' and (s.started_at >= lower(b) and s.started_at < upper(b))),
        'timed', (select count(*) from router_slas s where s.workspace_id = p_ws and s.user_id = m.user_id and s.status in ('met', 'missed') and (s.started_at >= lower(b) and s.started_at < upper(b))),
        'booked', (select count(*) from meetings x where x.workspace_id = p_ws and x.hosts @> array[m.user_id] and x.status <> 'pending_payment' and (x.created_at >= lower(b) and x.created_at < upper(b))),
        'held', (select count(*) from meetings x where x.workspace_id = p_ws and x.hosts @> array[m.user_id] and x.status = 'held' and (x.start_at >= lower(b) and x.start_at < upper(b))),
        'no_show', (select count(*) from meetings x where x.workspace_id = p_ws and x.hosts @> array[m.user_id] and x.status = 'no_show' and (x.start_at >= lower(b) and x.start_at < upper(b))),
        'opportunities', (select count(distinct r.id) from records r join objects o on o.id = r.object_id and o.key = 'opportunity'
            join record_links k on k.from_id = r.id and k.to_object = 'contact' join contacts c on c.id = k.to_id and c.owner_user_id = m.user_id
            where r.workspace_id = p_ws and r.deleted_at is null and (r.created_at >= lower(b) and r.created_at < upper(b))),
        'won_amount', coalesce((select sum(case when (r.fields->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (r.fields->>'amount')::numeric else 0 end) from records r
            where r.id in (select r2.id from records r2 join objects o on o.id = r2.object_id and o.key = 'opportunity'
              join record_links k on k.from_id = r2.id and k.to_object = 'contact' join contacts c on c.id = k.to_id and c.owner_user_id = m.user_id
              where r2.workspace_id = p_ws and r2.deleted_at is null and (r2.created_at >= lower(b) and r2.created_at < upper(b)) and r2.fields->>'stage' = any(won))), 0),
        'cap_week', (select cap_week from router_reps rp where rp.workspace_id = p_ws and rp.user_id = m.user_id)) as r
      from workspace_members m where m.workspace_id = p_ws) y), '[]'::jsonb));
end;
$$;

-- `p_group` compared as text stopped the uuid indexes; it's now read as a uuid once (anything else matches nothing,
-- as before).
create or replace function public.report_people(p_ws uuid, p_from date, p_to date, p_page text, p_metric text, p_by text default null, p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  ids uuid[];
  g uuid := case when p_group ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_group::uuid end;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Pick a range up to 400 days'; end if;
  if p_page = 'funnel' then
    select array_agg(f.contact_id) into ids from report_facts(p_ws, lower(b), upper(b)) f
    where (p_group is null or coalesce(case p_by when 'source' then f.source when 'campaign' then f.campaign when 'form' then f.form_id::text when 'rep' then f.owner::text when 'rule' then f.rule_id end, '') = p_group)
      and case p_metric when 'submitted' then true when 'qualified' then f.qualified when 'routed' then f.routed_at is not null when 'booked' then f.booked_at is not null
        when 'held' then f.held when 'opportunity' then f.opp when 'won' then f.won else false end;
  elsif p_page = 'reps' then
    if p_metric = 'leads' then
      select array_agg(distinct rr.contact_id) into ids from router_runs rr where rr.workspace_id = p_ws and rr.owner = g and rr.kind = 'owner' and rr.undone_at is null and (rr.created_at >= lower(b) and rr.created_at < upper(b));
    else
      select array_agg(distinct x.contact_id) into ids from meetings x where x.workspace_id = p_ws and x.hosts @> array[g]
        and case p_metric when 'booked' then x.status <> 'pending_payment' and (x.created_at >= lower(b) and x.created_at < upper(b)) when 'held' then x.status = 'held' and (x.start_at >= lower(b) and x.start_at < upper(b)) when 'no_show' then x.status = 'no_show' and (x.start_at >= lower(b) and x.start_at < upper(b)) else false end;
    end if;
  elsif p_page = 'forms' then
    select array_agg(distinct s.contact_id) into ids from submissions s where s.workspace_id = p_ws and s.form_id = g and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b)) and not report_spam(s.contact_id)
      and (p_metric = 'submits' or (p_metric = 'booked' and exists (select 1 from meetings m where m.submission_id = s.id and m.status <> 'pending_payment')));
  elsif p_page = 'email' then
    select array_agg(distinct m.contact_id) into ids from email_messages m where m.workspace_id = p_ws and m.email_id = g and (m.created_at >= lower(b) and m.created_at < upper(b))
      and case p_metric when 'sent' then m.sent_at is not null when 'delivered' then m.delivered_at is not null when 'bounced' then m.bounced is not null
        when 'clicked' then m.first_click_at is not null when 'unsubscribed' then m.unsubscribed_at is not null when 'complaints' then m.complained_at is not null
        when 'meetings' then m.first_click_at is not null and exists (select 1 from meetings x where x.contact_id = m.contact_id and x.status <> 'pending_payment' and x.created_at >= m.first_click_at and x.created_at < m.first_click_at + interval '7 days')
        else false end;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), 'email', c.email_clean, 'created_at', c.created_at) order by c.created_at desc)
    from (select * from contacts c where c.id = any(coalesce(ids, '{}')) and c.workspace_id = p_ws and c.deleted_at is null order by c.created_at desc limit 500) c), '[]'::jsonb);
end;
$$;

-- 8. Web visits (027, 032, 034, 080) -------------------------------------------------------------------------------
-- `events` is split by day (about 188 tables). Reading a session's events by session_id alone probed every one of them.
-- An event's day is its UTC day, within a day of the server time, and the server time sits between the session's
-- start and end (collect/app.ts eventDay, store.ts writeEvents; a split moves only events after the split's start),
-- so each read is now bounded to the session's own days, padded by one: 1-3 tables. Session reads by account or site
-- now carry the workspace so they use sessions_account / sessions_ws_started.

create or replace function public.visitors_live(p_ws uuid, p_hours int default 24, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.started_at desc) from (
      select s.id, s.device_id, s.started_at, s.ended_at, s.country, s.city, s.ref_class, s.source, s.referrer_host, s.device_type, s.policy,
             s.account_id, a.name as account_name, a.domain as account_domain, s.account_source,
             s.person_id, p.primary_email as person_email, s.person_level, s.pageviews, s.engaged_s,
             coalesce(pv.pages, '{}') as pages,
             coalesce(pv.page_times, '{}') as page_times
      from sessions s
      left join accounts a on a.id = s.account_id
      left join persons p on p.id = s.person_id
      left join lateral (
        select array_agg(x.path order by x.server_at) as pages, array_agg(x.server_at order by x.server_at) as page_times
        from (select e.path, e.server_at from events e
              where e.session_id = s.id and e.kind = 'view'
                and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1
              order by e.server_at limit 12) x
      ) pv on true
      where s.workspace_id = p_ws and s.started_at > now() - make_interval(hours => least(greatest(p_hours, 1), 720)) and not s.is_bot and not s.internal
      order by s.started_at desc
      limit least(greatest(p_limit, 1), 500)
    ) v
  ), '[]'::jsonb);
end;
$$;

create or replace function public.account_timeline(p_id uuid, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from accounts where id = p_id;
  if ws is null or not is_member(ws) then
    raise exception 'Account not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.started_at desc) from (
      select s.id, s.started_at, s.ended_at, s.person_id, p.primary_email as person_email, s.person_level, s.person_source,
             s.ref_class, s.referrer_host, s.country, s.engaged_s, s.account_source,
             coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'path', e.path, 'at', e.server_at, 'data', e.data) order by e.server_at)
                       from events e where e.session_id = s.id and e.kind in ('view', 'form', 'identify')
                         and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1), '[]'::jsonb) as events,
             coalesce((select jsonb_agg(g.kind) from signals g where g.workspace_id = ws and g.account_id = p_id and g.evidence->>'session_id' = s.id::text), '[]'::jsonb) as signals
      from sessions s left join persons p on p.id = s.person_id
      where s.workspace_id = ws and s.account_id = p_id and not s.is_bot
      order by s.started_at desc
      limit least(greatest(p_limit, 1), 200)
    ) v
  ), '[]'::jsonb);
end;
$$;

create or replace function public.accounts_list(p_ws uuid, p_view text default 'all', p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.priority desc nulls last, v.last_signal_at desc nulls last) from (
      select a.id, a.name, a.domain, a.fit, a.intent, a.priority, a.stage, a.temperature, a.why_now, a.last_signal_at, a.first_seen,
             a.firmo->>'industry' as industry, a.firmo->>'size' as size, a.firmo->>'country' as country,
             (select count(distinct s.person_id) from sessions s where s.workspace_id = p_ws and s.account_id = a.id and s.person_id is not null and s.started_at > now() - interval '30 days') as people,
             (select count(*) from sessions s where s.workspace_id = p_ws and s.account_id = a.id and s.started_at > now() - interval '7 days' and not s.is_bot) as sessions_7d,
             (select f.kind from account_feedback f where f.account_id = a.id order by f.created_at desc limit 1) as feedback
      from accounts a
      where a.workspace_id = p_ws
        and case p_view
              when 'hot' then a.temperature = 'hot'
              when 'evaluating' then a.stage = 'evaluating'
              when 'new' then a.first_seen > now() - interval '7 days'
              when 'fit_quiet' then a.fit >= 70 and coalesce(a.last_signal_at, a.first_seen) < now() - interval '30 days'
              else true end
      order by a.priority desc nulls last, a.last_signal_at desc nulls last
      limit least(greatest(p_limit, 1), 1000)
    ) v
  ), '[]'::jsonb);
end;
$$;

create or replace function public.account_detail(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  a accounts%rowtype;
begin
  select * into a from accounts where id = p_id;
  if a.id is null or not is_member(a.workspace_id) then
    raise exception 'Account not found';
  end if;
  return jsonb_build_object(
    'account', to_jsonb(a) - 'workspace_id',
    'people', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.last_seen desc) from (
        select p.id, p.primary_email as email, max(s.person_level) as level, max(s.started_at) as last_seen, count(*) as sessions
        from sessions s join persons p on p.id = s.person_id
        where s.workspace_id = a.workspace_id and s.account_id = a.id
        group by p.id, p.primary_email
      ) x), '[]'::jsonb),
    'unknown', (select jsonb_build_object('devices', count(distinct coalesce(s.device_id::text, encode(s.cookieless_key, 'hex'))), 'sessions', count(*))
                from sessions s where s.workspace_id = a.workspace_id and s.account_id = a.id and s.person_id is null and not s.is_bot),
    'networks', coalesce((
      select jsonb_agg(distinct jsonb_build_object('net', s.ip_net::text, 'source', s.account_source))
      from sessions s where s.workspace_id = a.workspace_id and s.account_id = a.id and s.ip_net is not null and s.account_source in ('learned_network', 'vendor_network')), '[]'::jsonb),
    'signals', coalesce((
      select jsonb_agg(jsonb_build_object('kind', g.kind, 'weight', g.weight, 'at', g.at, 'person_id', g.person_id, 'evidence', g.evidence) order by g.at desc)
      from signals g where g.workspace_id = a.workspace_id and g.account_id = a.id and g.at > now() - interval '90 days'), '[]'::jsonb),
    'half_lives', coalesce((select jsonb_object_agg(kind, half_life_days) from signal_types where workspace_id = a.workspace_id), '{}'::jsonb),
    'icp', (select rules from icp where workspace_id = a.workspace_id),
    'k', coalesce((select k from intent_params where workspace_id = a.workspace_id), 60)
  );
end;
$$;

create or replace function public.site_health(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.created_at) from (
      select st.id, st.domain, st.extra_domains, st.site_key, st.proxy_secret, st.install_mode, st.last_event_at, st.paused, st.created_at,
             coalesce(h.sessions_24h, 0) as sessions_24h, coalesce(h.identified_24h, 0) as identified_24h, coalesce(h.with_account_24h, 0) as with_account_24h
      from sites st
      left join lateral (
        select count(*) as sessions_24h, count(*) filter (where s.person_id is not null) as identified_24h, count(*) filter (where s.account_id is not null) as with_account_24h
        from sessions s where s.site_id = st.id and s.started_at > now() - interval '24 hours' and not s.is_bot
      ) h on true
      where st.workspace_id = p_ws
    ) v
  ), '[]'::jsonb);
end;
$$;

-- 9. Prunes and the nightly schedule -----------------------------------------------------------------------------
-- Prunes delete in batches of 5,000 (found through the BRIN indexes above), at most `p_max` rows per table per run, so
-- no run is one huge transaction. They run hourly instead of at 03:17, where four heavy jobs used to collide.
-- prune_sync gets back the source_event_keys delete that 040 dropped (the table grew forever).

create or replace function public.prune_batch(p_table regclass, p_where text, p_max int default 100000) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  total int := 0;
begin
  loop
    execute format('delete from %s where ctid = any (array(select ctid from %s where %s limit 5000))', p_table, p_table, p_where);
    get diagnostics n = row_count;
    total := total + n;
    exit when n < 5000 or total >= p_max;
  end loop;
  return total;
end;
$$;

create or replace function public.prune_history() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform prune_batch('public.field_history', format('import_id is not null and at < %L', now() - interval '30 days'));
  perform prune_batch('public.field_history', format('at < %L', now() - interval '13 months'));
end;
$$;

create or replace function public.prune_sync() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform prune_batch('public.sync_log', format('at < %L', now() - interval '90 days'));
  perform prune_batch('public.source_runs', format('started_at < %L', now() - interval '90 days'));
  perform prune_batch('public.hook_events', format('done_at is not null and done_at < %L', now() - interval '7 days'));
  perform prune_batch('public.hook_events', format('received_at < %L', now() - interval '30 days'));
  perform prune_batch('public.activity_out', format('claimed_at < %L', now() - interval '7 days'));
  perform prune_batch('public.source_event_keys', format('at < %L', now() - interval '13 months'));
end;
$$;

create or replace function public.router_prune() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  n := prune_batch('public.router_runs', format('created_at < %L', now() - interval '13 months'), 500000);
  perform prune_batch('public.router_replays', format('created_at < %L', now() - interval '7 days'));
  return n;
end;
$$;

create or replace function public.webhook_prune() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform prune_batch('public.webhook_deliveries', format('created_at < %L', now() - interval '30 days'), 500000);
end;
$$;

create or replace function public.forms_keep_prune() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  r record;
begin
  for r in
    select f.id, (v.body->'keep'->>'days')::int as days
    from forms f join form_versions v on v.form_id = f.id and v.version = f.version
    where f.version > 0 and v.body->'keep'->>'days' ~ '^[0-9]{1,5}$' and (v.body->'keep'->>'days')::int >= 1
  loop
    n := n + prune_batch('public.submissions', format('form_id = %L and created_at < %L', r.id, now() - make_interval(days => r.days)), 50000);
  end loop;
  return n;
end;
$$;

-- What minute_tick did at 03:17, now hourly at :47 in batches.
create or replace function public.prune_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform prune_history();
  perform prune_sync();
  perform prune_batch('public.ai_cache', format('created_at < %L', now() - interval '90 days'));
  perform prune_batch('public.submissions', format('spam and created_at < %L', now() - interval '7 days'));
  perform prune_batch('public.form_checks', format('started_at < %L', now() - interval '90 days'));
end;
$$;

-- The nightly report roll: workspaces with a site instead of every session of the last two days; batched deletes.
create or replace function public.reports_nightly() returns void
language plpgsql security definer set search_path = public as $$
declare
  w record;
begin
  for w in
    select distinct st.workspace_id from sites st
    where exists (select 1 from sessions s where s.workspace_id = st.workspace_id and s.started_at > now() - interval '2 days')
  loop
    perform site_daily_roll(w.workspace_id, (now() at time zone ws_tz(w.workspace_id))::date - 1);
  end loop;
  perform first_touch_fill();
  perform prune_batch('public.form_seen', format('at < %L', now() - interval '1 day'), 1000000);
  perform prune_batch('public.form_field_sessions', format('day < %L', current_date - interval '13 months'));
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j) from unnest(array['claritia-reports', 'claritia-router-prune', 'claritia-roll', 'claritia-prune']) j
    where exists (select 1 from cron.job where jobname = j);
    perform cron.schedule('claritia-roll', '43 2 * * *', 'select public.contact_events_roll()');
    perform cron.schedule('claritia-reports', '29 3 * * *', 'select public.reports_nightly()');
    perform cron.schedule('claritia-router-prune', '41 3 * * *', 'select public.router_prune()');
    perform cron.schedule('claritia-prune', '47 * * * *', 'select public.prune_tick()');
  end if;
end;
$$;

-- 10. Copied from their latest definitions, changed only where noted -----------------------------------------------

-- contact_detail: a visit's pages read only the visit's own day tables.
CREATE OR REPLACE FUNCTION public.contact_detail(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c contacts%rowtype;
begin
  select * into c from contacts where id = p_id;
  if c.id is null or not is_member(c.workspace_id) then
    raise exception 'Contact not found';
  end if;
  if c.deleted_at is not null then
    if c.merged_into is not null then
      return jsonb_build_object('moved_to', c.merged_into);
    end if;
    raise exception 'Contact not found';
  end if;
  return jsonb_build_object(
    'contact', to_jsonb(c) - 'workspace_id' - 'deleted_at' || jsonb_build_object('owner', c.owner_user_id),
    'company', (select jsonb_build_object('id', co.id, 'name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size, 'account_id', co.account_id,
                                          'fit', a.fit, 'intent', a.intent, 'stage', a.stage)
                from companies co left join accounts a on a.id = co.account_id where co.id = c.company_id),
    'person', (select jsonb_build_object('id', p.id, 'level', (select l.level from device_links l where l.person_id = p.id and l.to_at is null
                                          order by case l.level when 'verified' then 0 when 'asserted' then 1 else 2 end limit 1))
               from persons p where p.id = c.person_id),
    'writes', coalesce((select jsonb_object_agg(k, jsonb_build_object('source', v->>'s', 'at', v->>'at')) from jsonb_each(c.field_sources) e(k, v)), '{}'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('key', h.key, 'old', h.old, 'new', h.new, 'source', h.source, 'by', h.by, 'at', h.at) order by h.at desc)
                         from (select * from field_history where record_id = c.id order by at desc limit 100) h), '[]'::jsonb),
    'fields', coalesce((select jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'type', f.type, 'options', f.options, 'config', f.config,
                                                            'required', f.required, 'group', f.group_name) order by f.position, f.created_at)
                        from fields f where f.workspace_id = c.workspace_id and f.object = 'contact'), '[]'::jsonb),
    'links', coalesce((select jsonb_object_agg(f.key, (select coalesce(jsonb_agg(jsonb_build_object('id', l.to_id, 'object', l.to_object, 'name',
                  case l.to_object when 'contact' then (select coalesce(nullif(trim(concat_ws(' ', k.first_name, k.last_name)), ''), k.email) from contacts k where k.id = l.to_id)
                                   when 'company' then (select coalesce(m.name, m.domain) from companies m where m.id = l.to_id)
                                   else (select rr.name from records rr where rr.id = l.to_id) end)), '[]')
                from record_links l where l.field_id = f.id and l.from_id = c.id))
              from fields f where f.workspace_id = c.workspace_id and f.object = 'contact' and f.type = 'relation'), '{}'::jsonb),
    'consents', coalesce((select jsonb_agg(jsonb_build_object('channel', x.channel, 'basis', x.basis, 'status', x.status, 'source', x.source, 'at', x.at) order by x.at desc)
                          from (select * from consents where contact_id = c.id order by at desc limit 20) x), '[]'::jsonb),
    'suppressed', (select jsonb_build_object('reason', s.reason, 'source', s.source, 'at', s.at) from suppressions s
                   where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'status', s.status, 'at', s.at) order by t.name)
                        from subscriptions s join topics t on t.id = s.topic_id where s.contact_id = c.id), '[]'::jsonb),
    'segments', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'entered_at', m.entered_at) order by m.entered_at desc)
                          from segment_members m join segments g on g.id = m.segment_id where m.contact_id = c.id and m.left_at is null), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'data', e.data, 'source', e.source, 'at', e.at) order by e.at desc)
                        from (select * from contact_events where contact_id = c.id order by at desc limit 100) e), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (
                select s.id, s.started_at, s.pageviews, s.engaged_s, s.landing_path, s.ref_class, s.referrer_host, s.country,
                       coalesce((select array_agg(e.path order by e.server_at) from (select e.path, e.server_at from events e where e.session_id = s.id and e.kind = 'view'
                                 and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1
                                 order by e.server_at limit 8) e), '{}') as pages
                from sessions s where c.person_id is not null and s.workspace_id = c.workspace_id and s.person_id = c.person_id and not s.is_bot
                order by s.started_at desc limit 30) x), '[]'::jsonb)
  );
end;
$function$;

-- scoring_facts: the same, per session.
CREATE OR REPLACE FUNCTION public.scoring_facts(p_ws uuid, p_since timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ids uuid[] DEFAULT NULL::uuid[], p_after uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with picked as (
    select c.* from contacts c
    where c.workspace_id = p_ws and c.deleted_at is null
      and (p_ids is null or c.id = any(p_ids))
      and (p_since is null or c.created_at >= p_since)
      and (p_after is null or c.id > p_after)
    order by c.id
    limit least(greatest(p_limit, 1), 2000)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'created', c.created_at,
    'values', jsonb_strip_nulls(jsonb_build_object(
      'lead.country', coalesce(co.country, c.country),
      'contact.email_domain', split_part(c.email_clean, '@', 2),
      'contact.email_class', c.email_class,
      'contact.title', c.title,
      'contact.seniority', c.seniority,
      'contact.department', c.department,
      'contact.country', c.country,
      'contact.region', c.region,
      'contact.lifecycle', c.lifecycle,
      'contact.lead_status', c.lead_status,
      'company.name', co.name,
      'company.domain', co.domain,
      'company.country', co.country,
      'company.industry', co.industry,
      'company.size', co.size,
      'company.employees', co.size)) || coalesce((select jsonb_object_agg('contact.f.' || k, v) from jsonb_each(c.fields) x(k, v)), '{}')
        || coalesce((select jsonb_object_agg('company.f.' || k, v) from jsonb_each(co.fields) x(k, v)), '{}'),
    'events', coalesce((
      select jsonb_agg(e order by e->>'at' desc) from (
        (select jsonb_build_object('k', case ev.kind when 'form.submitted' then 'form' when 'meeting.booked' then 'meeting' when 'email.clicked' then 'click' else 'unsub' end,
                  'd', ev.data->>'form_id', 'at', ev.at) as e
         from contact_events ev
         where ev.contact_id = c.id and ev.at > now() - interval '365 days'
           and ev.kind in ('form.submitted', 'meeting.booked', 'email.clicked', 'email.unsubscribed')
         order by ev.at desc limit 200)
        union all
        (select jsonb_build_object('k', case when x.kind = 'custom' then 'product' else 'page' end,
                  'd', case when x.kind = 'custom' then left(coalesce(x.data->>'name', x.title), 120) else left(x.path, 300) end, 'at', x.server_at)
         from sessions s join events x on x.session_id = s.id and x.workspace_id = p_ws and x.day >= (now() - interval '365 days')::date
           and x.day >= (s.started_at at time zone 'UTC')::date - 1 and x.day <= (s.ended_at at time zone 'UTC')::date + 1
         where c.person_id is not null and s.workspace_id = p_ws and s.person_id = c.person_id
           and s.person_level in ('verified', 'asserted') and not s.is_bot and not s.internal
           and x.kind in ('view', 'custom')
         order by x.server_at desc limit 200)
      ) q), '[]'),
    'met', c.lifecycle in ('sql', 'opportunity', 'customer')
      or exists (select 1 from contact_events ev where ev.contact_id = c.id and ev.kind = 'meeting.booked')
  ) order by c.id), '[]')
  from picked c
  left join companies co on co.id = c.company_id;
$function$;

-- records_ingest: find a record by its source id with the GIN index (source ids are always written as strings).
CREATE OR REPLACE FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s sources%rowtype;
  v_oid uuid;
  link_field uuid;
  r record;
  rid uuid;
  f fields%rowtype;
  k text;
  v jsonb;
  clean jsonb;
  created int := 0;
  updated int := 0;
  ids jsonb := '[]';
  cid uuid;
begin
  select * into s from sources where id = p_source;
  select id into v_oid from objects where workspace_id = s.workspace_id and key = p_object;
  if v_oid is null then
    raise exception 'Object not found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5,000 rows at a time';
  end if;
  select id into link_field from fields
  where workspace_id = s.workspace_id and object = p_object and type = 'relation' and config->>'target' = 'contact' order by position, created_at limit 1;
  for r in select * from jsonb_to_recordset(p_rows) as x(id text, name text, fields jsonb, email_clean text) loop
    if coalesce(r.id, '') = '' then
      ids := ids || 'null'::jsonb;
      continue;
    end if;
    clean := '{}';
    for k, v in select * from jsonb_each(coalesce(r.fields, '{}')) loop
      select * into f from fields where workspace_id = s.workspace_id and object = p_object and key = k and type <> 'relation';
      continue when f.id is null;
      begin
        v := field_value(s.workspace_id, f.type, f.options, f.label, v);
      exception when others then
        v := null;
      end;
      if v is not null then clean := clean || jsonb_build_object(k, v); end if;
    end loop;
    select id into rid from records where object_id = v_oid and source_ids @> jsonb_build_object(s.kind, r.id) and deleted_at is null limit 1;
    if rid is null then
      insert into records (workspace_id, object_id, name, fields, source_ids, field_sources)
      values (s.workspace_id, v_oid, left(coalesce(nullif(trim(r.name), ''), r.id), 300), clean, jsonb_build_object(s.kind, left(r.id, 200)),
              (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x))
      returning id into rid;
      created := created + 1;
    else
      update records set
        name = left(coalesce(nullif(trim(r.name), ''), name), 300),
        fields = fields || clean,
        field_sources = field_sources || (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x),
        updated_at = case when fields || clean is distinct from fields or coalesce(nullif(trim(r.name), ''), name) is distinct from name then now() else updated_at end
      where id = rid;
      updated := updated + 1;
    end if;
    if link_field is not null and coalesce(r.email_clean, '') <> '' then
      select id into cid from contacts where workspace_id = s.workspace_id and deleted_at is null and email_clean = lower(trim(r.email_clean));
      if cid is not null then
        insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
        values (s.workspace_id, link_field, p_object, rid, 'contact', cid) on conflict do nothing;
      end if;
    end if;
    ids := ids || to_jsonb(rid);
  end loop;
  return jsonb_build_object('ids', ids, 'created', created, 'updated', updated);
end;
$function$;

-- opportunities_ingest: the same.
CREATE OR REPLACE FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s sources%rowtype;
  v_oid uuid;
  f_company uuid;
  f_contacts uuid;
  it jsonb;
  rid uuid;
  f fields%rowtype;
  k text;
  v jsonb;
  clean jsonb;
  stage text;
  created int := 0;
  updated int := 0;
  skipped int := 0;
begin
  select * into s from sources where id = p_source;
  if s.id is null then
    raise exception 'Source not found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Send up to 1,000 rows at a time';
  end if;
  perform crm_seed(s.workspace_id);
  select id into v_oid from objects where workspace_id = s.workspace_id and key = 'opportunity';
  select id into f_company from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = 'company';
  select id into f_contacts from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = 'contacts';

  for it in select value from jsonb_array_elements(p_rows) loop
    if coalesce(it->>'id', '') = '' then
      skipped := skipped + 1;
      continue;
    end if;
    stage := nullif(trim(coalesce(it#>>'{fields,stage}', '')), '');
    if stage is not null then
      update fields set options = options || jsonb_build_array(jsonb_build_object(
          'value', left(stage, 80),
          'label', left(coalesce(nullif(trim(it->>'stage_label'), ''), stage), 80),
          'kind', case when it->>'stage_kind' in ('won', 'lost') then it->>'stage_kind' else 'open' end)),
        updated_at = now()
      where workspace_id = s.workspace_id and object = 'opportunity' and key = 'stage' and jsonb_array_length(options) < 100
        and not exists (select 1 from jsonb_array_elements(options) o where coalesce(o->>'value', o #>> '{}') = left(stage, 80));
    end if;
    clean := '{}';
    for k, v in select * from jsonb_each(coalesce(it->'fields', '{}')) loop
      select * into f from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = k and type <> 'relation';
      continue when f.id is null;
      begin
        v := field_value(s.workspace_id, f.type, f.options, f.label, v);
      exception when others then
        v := null;
      end;
      if v is not null then clean := clean || jsonb_build_object(k, v); end if;
    end loop;

    select id into rid from records where object_id = v_oid and source_ids @> jsonb_build_object(s.kind, it->>'id') and deleted_at is null limit 1;
    if rid is null then
      insert into records (workspace_id, object_id, name, fields, source_ids, field_sources)
      values (s.workspace_id, v_oid, left(coalesce(nullif(trim(it->>'name'), ''), 'Opportunity ' || (it->>'id')), 300), clean,
              jsonb_build_object(s.kind, left(it->>'id', 200)),
              (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x))
      returning id into rid;
      created := created + 1;
    else
      update records set
        name = left(coalesce(nullif(trim(it->>'name'), ''), name), 300),
        fields = fields || clean,
        field_sources = field_sources || (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x),
        updated_at = case when fields || clean is distinct from fields or coalesce(nullif(trim(it->>'name'), ''), name) is distinct from name then now() else updated_at end
      where id = rid;
      updated := updated + 1;
    end if;

    if it ? 'company' then
      delete from record_links where field_id = f_company and from_id = rid;
      insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
      select s.workspace_id, f_company, 'opportunity', rid, 'company', l.local_id
      from source_links l
      where l.source_id = p_source and l.object = 'company' and l.external_id = it->>'company' and l.deleted_at is null
      limit 1
      on conflict do nothing;
    end if;
    if it ? 'contacts' and jsonb_typeof(it->'contacts') = 'array' then
      delete from record_links where field_id = f_contacts and from_id = rid;
      insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
      select distinct s.workspace_id, f_contacts, 'opportunity', rid, 'contact', l.local_id
      from source_links l
      where l.source_id = p_source and l.object = 'contact' and l.deleted_at is null
        and l.external_id in (select jsonb_array_elements_text(it->'contacts'))
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated, 'skipped', skipped);
end;
$function$;

-- opportunities_remove: the same.
CREATE OR REPLACE FUNCTION public.opportunities_remove(p_source uuid, p_ids text[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s sources%rowtype;
  gone uuid[];
begin
  select * into s from sources where id = p_source;
  if s.id is null then
    raise exception 'Source not found';
  end if;
  with d as (
    update records r set deleted_at = now(), updated_at = now() from objects o
    where o.id = r.object_id and o.workspace_id = s.workspace_id and o.key = 'opportunity'
      and r.deleted_at is null and r.source_ids @> any (array(select jsonb_build_object(s.kind, x) from unnest(p_ids) x))
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into gone from d;
  delete from record_links where workspace_id = s.workspace_id and from_id = any(gone);
  return coalesce(array_length(gone, 1), 0);
end;
$function$;

-- form_notify_info: the OR became two indexed lookups (by submission, by contact).
CREATE OR REPLACE FUNCTION public.form_notify_info(p_sid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select * from submissions where id = p_sid),
  run as (select r.* from router_runs r, s where r.workspace_id = s.workspace_id and r.key = 'form:' || s.id::text),
  meet as (
    select coalesce(
      (select case when run.by = 'fallback' then v.body->'fallback'->>'meet'
                   else (select x->>'meet' from jsonb_array_elements(v.body->'rules'->'list') x where x->>'id' = run.rule_id limit 1) end
       from run join router_versions v on v.workspace_id = run.workspace_id and v.version = run.version where run.kind = 'owner'),
      (select fv.body->'after'->'schedule'->>'meetingTypeId' from s join form_versions fv on fv.form_id = s.form_id and fv.version = s.form_version)) as id
  )
  select jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'workspace_id', s.workspace_id, 'form_id', s.form_id, 'values', s."values",
                                     'spam', s.spam, 'test', s.test, 'contact_id', s.contact_id, 'created_at', s.created_at),
    'form', f.name,
    'body', v.body,
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'email_class', c.email_class,
      'first_name', c.first_name, 'last_name', c.last_name, 'company', (select co.name from companies co where co.id = c.company_id),
      'owner', c.owner_user_id) end,
    'owner', case when c.owner_user_id is null then null else meeting_people(s.workspace_id, array[c.owner_user_id])->0 end,
    'handle', (select coalesce(bp.handle, bp.slug) from booking_profiles bp where bp.workspace_id = s.workspace_id and bp.user_id = c.owner_user_id),
    'workspace', (select name from workspaces w where w.id = s.workspace_id),
    'sealed', (select sealed from router_secrets r where r.workspace_id = s.workspace_id),
    'sending', meeting_sending(s.workspace_id),
    'sent', coalesce((select jsonb_agg(n.part) from form_notify_sent n where n.submission_id = s.id), '[]'),
    'routing', case when not exists (select 1 from routers rt where rt.workspace_id = s.workspace_id and rt.live_version is not null and rt.paused_at is null) then 'none'
                    when exists (select 1 from run) then 'done' else 'pending' end,
    'booked', exists (select 1 from meetings m where m.submission_id = s.id and m.workspace_id = s.workspace_id and m.status in ('booked', 'pending_payment', 'held'))
              or (c.id is not null and exists (select 1 from meetings m where m.contact_id = c.id and m.workspace_id = s.workspace_id
                                                 and m.status in ('booked', 'pending_payment', 'held') and m.created_at >= s.created_at)),
    'meet', (select jsonb_build_object('id', t.id, 'slug', t.slug) from meeting_types t, meet
             where meet.id ~ '^[0-9a-f-]{36}$' and t.id = meet.id::uuid and t.workspace_id = s.workspace_id and t.active and not t.secret))
  from s
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id;
$function$;

-- router_alert_info: the form by its key, not every form cast to text.
CREATE OR REPLACE FUNCTION public.router_alert_info(p_run uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'run', jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'contact_id', r.contact_id, 'kind', r.kind, 'owner', r.owner, 'by', r."by", 'reason', r.reason,
                              'queue_id', r.queue_id, 'rule_id', r.rule_id, 'steps', r.steps, 'facts', r.facts, 'undone', r.undone_at is not null),
    'sealed', (select sealed from router_secrets s where s.workspace_id = r.workspace_id),
    'slack', (select sealed from slack_installs s where s.workspace_id = r.workspace_id),
    'owner', case when r.owner is null then null else meeting_people(r.workspace_id, array[r.owner])->0 end,
    'admins', coalesce((select jsonb_agg(lower(u.email)) from workspace_members m join auth.users u on u.id = m.user_id
                        where m.workspace_id = r.workspace_id and m.role = 'owner' and u.email is not null), '[]'),
    'workspace', (select name from workspaces w where w.id = r.workspace_id),
    'form', (select f.name from forms f where f.id = case when r.facts->'values'->>'lead.form' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.facts->'values'->>'lead.form')::uuid end),
    'sending', meeting_sending(r.workspace_id))
  from router_runs r where r.id = p_run;
$function$;

-- person_cache_forget: uses person_cache_hash.
CREATE OR REPLACE FUNCTION public.person_cache_forget()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from person_cache where email_hash(email_clean) = new.value_hash;
  return new;
end;
$function$;

-- deliveries_sweep: with the workspace, the open-job check uses jobs_open_key (deliver jobs carry the delivery's
-- workspace).
CREATE OR REPLACE FUNCTION public.deliveries_sweep()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int := 0;
  d record;
begin
  update deliveries x set status = 'failed', error = coalesce(x.error, 'The sender stopped answering'), lease_until = null, done_at = now(), updated_at = now()
  where x.status in ('sending', 'retrying') and x.updated_at < now() - interval '12 hours'
    and not exists (select 1 from jobs j where j.kind = 'deliver' and j.workspace_id = x.workspace_id and j.key = x.id::text and j.status in ('queued', 'running'));
  get diagnostics n = row_count;
  for d in
    select x.id, x.workspace_id from deliveries x
    where x.status = 'queued' and x.updated_at < now() - interval '10 minutes'
      and not exists (select 1 from jobs j where j.kind = 'deliver' and j.workspace_id = x.workspace_id and j.key = x.id::text and j.status in ('queued', 'running'))
    limit 1000
  loop
    perform enqueue_job(d.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
    n := n + 1;
  end loop;
  return n;
end;
$function$;

-- minute_tick: the 03:17 block moved to its own cron jobs (claritia-roll, claritia-prune) so a partition drop or a
-- big delete never holds the minute's transaction.
CREATE OR REPLACE FUNCTION public.minute_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform fire_due_schedules();
  if exists (select 1 from runs where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from explorations where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from plans where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from jobs where kind in ('brand_scan', 'form_qa') and status = 'queued' and run_after < now() - interval '20 seconds') then
    perform wake_runner();
  end if;
  if exists (select 1 from github_checks where status = 'pending' and coalesce(synced_at, created_at) < now() - interval '1 minute') then
    perform github_sync();
  end if;
  if exists (select 1 from alert_events where sent_at is null) then
    perform alerts_send();
  end if;
  perform sources_due();
  perform nurture_advance(500);
  perform sends_due();
  if extract(minute from now())::int % 5 = 0 then
    perform segments_due();
    perform domain_checks_due();
    perform nurture_enroll(null);
    perform lead_scores_due();
  end if;
  if extract(minute from now()) = 7 then
    perform prune_jobs();
  end if;
  if extract(minute from now()) = 23 then
    perform deliveries_sweep();
  end if;
  if extract(minute from now()) = 41 then
    perform form_checks_due();
  end if;
end;
$function$;

-- report_facts: the won stages once per call, not twice per opportunity.
CREATE OR REPLACE FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone)
 RETURNS TABLE(contact_id uuid, lead_at timestamp with time zone, form_id uuid, source text, campaign text, owner uuid, rule_id text, qualified boolean, routed_at timestamp with time zone, booked_at timestamp with time zone, held boolean, touched_at timestamp with time zone, opp boolean, won boolean, won_amount numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with l as (select * from report_leads(p_ws, p_start, p_end)),
  ids as (select i.root, i.cid, l.lead_at from report_ids(p_ws, (select coalesce(array_agg(contact_id), '{}') from l)) i join l on l.contact_id = i.root),
  q as (select outcomes->0->>'label' as first from qualify_settings where workspace_id = p_ws),
  w as (select report_won_stages(p_ws) as won),
  rr as (
    select i.root, min(r.created_at) as routed_at, (array_agg(r.rule_id order by r.created_at desc))[1] as rule_id
    from router_runs r join ids i on i.cid = r.contact_id
    where r.workspace_id = p_ws and r.kind = 'owner' and r.undone_at is null group by i.root
  ),
  mt as (
    select i.root, min(m.created_at) as booked_at, bool_or(m.status = 'held') as held
    from meetings m join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.created_at >= i.lead_at and m.status <> 'pending_payment' group by i.root
  ),
  sl as (
    select i.root, min(s.acted_at) as acted from router_slas s join ids i on i.cid = s.contact_id
    where s.workspace_id = p_ws and s.acted_at >= i.lead_at group by i.root
  ),
  em as (
    select i.root, min(m.sent_at) as sent from email_messages m join emails e on e.id = m.email_id and e.kind = 'one_to_one' join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.sent_at >= i.lead_at group by i.root
  ),
  opps as (
    select distinct on (x.root, x.id) x.root, x.id, x.fields from (
      select i.root, i.lead_at, r.id, r.fields, r.created_at from ids i
        join record_links k on k.to_id = i.cid and k.to_object = 'contact' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
      union all
      select l.contact_id, l.lead_at, r.id, r.fields, r.created_at from l join contacts c on c.id = l.contact_id
        join record_links k on k.to_id = c.company_id and k.to_object = 'company' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
    ) x where x.created_at >= x.lead_at
  ),
  op as (
    select o.root, bool_or(o.fields->>'stage' = any((select won from w)::text[])) as won,
      sum(case when o.fields->>'stage' = any((select won from w)::text[]) and (o.fields->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (o.fields->>'amount')::numeric else 0 end) as amount
    from opps o group by o.root
  )
  select l.contact_id, l.lead_at, l.form_id,
    coalesce(c.first_touch->>'source', c.source), c.first_touch->>'campaign', c.owner_user_id, rr.rule_id,
    (c.lifecycle in ('mql', 'sql', 'opportunity', 'customer') or (c.qualify_outcome is not null and c.qualify_outcome = (select first from q))),
    rr.routed_at, mt.booked_at, coalesce(mt.held, false), least(sl.acted, mt.booked_at, em.sent),
    op.root is not null, coalesce(op.won, false), coalesce(op.amount, 0)
  from l join contacts c on c.id = l.contact_id
  left join rr on rr.root = l.contact_id left join mt on mt.root = l.contact_id left join sl on sl.root = l.contact_id
  left join em on em.root = l.contact_id left join op on op.root = l.contact_id;
$function$;

-- enrich_backfill_page: pages by id inside the query, so each page reads one page.
CREATE OR REPLACE FUNCTION public.enrich_backfill_page(p_ws uuid, p_filter jsonb, p_after uuid, p_limit integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  ids uuid[];
begin
  -- enrich_backfill_where's filter, with the page's start and limit inside it (it re-read the whole workspace per page).
  ids := array(
    select c.id from contacts c left join companies co on co.id = c.company_id
    where c.workspace_id = p_ws and c.deleted_at is null and c.email_class in ('work', 'role')
      and (p_after is null or c.id > p_after)
      and (coalesce(p_filter->>'segment_id', '') = '' or exists (select 1 from segment_members sm where sm.segment_id = (p_filter->>'segment_id')::uuid and sm.contact_id = c.id and sm.left_at is null))
      and case coalesce(p_filter->>'missing', 'any')
        when 'title' then c.title is null
        when 'company' then c.company_id is null or co.name is null
        when 'industry' then co.industry is null
        when 'size' then co.size is null
        when 'seniority' then c.seniority is null
        else c.title is null or c.company_id is null or co.industry is null or co.size is null
      end
    order by c.id limit least(greatest(p_limit, 1), 500));
  perform enqueue_job(p_ws, 'enrich_contact', x::text, jsonb_build_object('contact_id', x, 'trigger', 'backfill'), 0, 5) from unnest(ids) x;
  return jsonb_build_object('count', coalesce(array_length(ids, 1), 0), 'last', ids[array_length(ids, 1)]);
end;
$function$;

-- 11. Relation pickers (034 records_search) ----------------------------------------------------------------------
-- Per keystroke it walked the workspace newest first until it had 10 matches: a rare term read every row. With 3 or
-- more characters the matches now come from the trigram indexes first; shorter terms work as before. Same results.

create or replace function public.records_search(p_ws uuid, p_object text, p_q text, p_limit int default 10) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := '%' || replace(replace(replace(coalesce(trim(p_q), ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  lim int := least(greatest(coalesce(p_limit, 10), 1), 50);
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if length(coalesce(trim(p_q), '')) < 3 then
    return coalesce(case p_object
      when 'contact' then (select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select id, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email) as name from contacts
        where workspace_id = p_ws and deleted_at is null and (email ilike q or concat_ws(' ', first_name, last_name) ilike q) order by updated_at desc limit lim) x)
      when 'company' then (select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select id, coalesce(name, domain) as name from companies where workspace_id = p_ws and deleted_at is null and (name ilike q or domain ilike q)
        order by updated_at desc limit lim) x)
      else (select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select r.id, r.name from records r join objects o on o.id = r.object_id where o.workspace_id = p_ws and o.key = p_object and r.deleted_at is null and r.name ilike q
        order by r.updated_at desc limit lim) x)
    end, '[]'::jsonb);
  end if;
  return coalesce(case p_object
    when 'contact' then (
      with m as materialized (
        select id, first_name, last_name, email, updated_at from contacts
        where workspace_id = p_ws and deleted_at is null and (email ilike q or person_name(first_name, last_name) ilike q))
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select id, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email) as name from m order by updated_at desc limit lim) x)
    when 'company' then (
      with m as materialized (
        select id, name, domain, updated_at from companies where workspace_id = p_ws and deleted_at is null and (name ilike q or domain ilike q))
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select id, coalesce(name, domain) as name from m order by updated_at desc limit lim) x)
    else (
      with m as materialized (
        select r.id, r.name, r.updated_at from records r join objects o on o.id = r.object_id
        where o.workspace_id = p_ws and o.key = p_object and r.deleted_at is null and r.name ilike q)
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name)) from (
        select id, name from m order by updated_at desc limit lim) x)
  end, '[]'::jsonb);
end;
$$;

-- Reads of a visit's events plan over every day table; the plan's cost is high even though only 1-3 tables run, and
-- compiling it (JIT) took longer than running it. These read a few rows each.
alter function public.visitors_live(uuid, int, int) set jit = off;
alter function public.contact_detail(uuid) set jit = off;
alter function public.account_timeline(uuid, int) set jit = off;
alter function public.scoring_facts(uuid, timestamptz, uuid[], uuid, int) set jit = off;

-- 12. Row level security -----------------------------------------------------------------------------------------
-- Every policy called is_member(workspace_id) per row: a SECURITY DEFINER function is never inlined, so a count over
-- 30k contacts made 30k calls. Now each policy compares the row's workspace with the caller's workspaces, read once
-- per query (an InitPlan), and auth.uid() is read once too. Same access: a row passes exactly when its workspace is
-- one the caller belongs to (owns, for is_owner), as before. Same grants as is_member: signed-in people only.

create or replace function public.my_workspaces() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(workspace_id), '{}') from workspace_members where user_id = auth.uid();
$$;
create or replace function public.my_owned_workspaces() returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(workspace_id), '{}') from workspace_members where user_id = auth.uid() and role = 'owner';
$$;
revoke execute on function public.my_workspaces() from public, anon;
revoke execute on function public.my_owned_workspaces() from public, anon;
grant execute on function public.my_workspaces() to authenticated, service_role;
grant execute on function public.my_owned_workspaces() to authenticated, service_role;

do $$
declare
  p record;
  q text;
  c text;
  sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check from pg_policies
    where schemaname in ('public', 'storage')
      and (coalesce(qual, '') || coalesce(with_check, '')) ~ '(is_member|is_owner)\(|(?<!SELECT )auth\.uid\(\)'
  loop
    q := p.qual;
    c := p.with_check;
    q := regexp_replace(q, 'is_member\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)', '(((storage.foldername(name))[1])::uuid = ANY ((SELECT public.my_workspaces())::uuid[]))', 'g');
    c := regexp_replace(c, 'is_member\(\(\(storage\.foldername\(name\)\)\[1\]\)::uuid\)', '(((storage.foldername(name))[1])::uuid = ANY ((SELECT public.my_workspaces())::uuid[]))', 'g');
    q := regexp_replace(q, '(public\.)?is_member\(([a-z_]+\.)?([a-z_]+)\)', '(\2\3 = ANY ((SELECT public.my_workspaces())::uuid[]))', 'g');
    c := regexp_replace(c, '(public\.)?is_member\(([a-z_]+\.)?([a-z_]+)\)', '(\2\3 = ANY ((SELECT public.my_workspaces())::uuid[]))', 'g');
    q := regexp_replace(q, '(public\.)?is_owner\(([a-z_]+\.)?([a-z_]+)\)', '(\2\3 = ANY ((SELECT public.my_owned_workspaces())::uuid[]))', 'g');
    c := regexp_replace(c, '(public\.)?is_owner\(([a-z_]+\.)?([a-z_]+)\)', '(\2\3 = ANY ((SELECT public.my_owned_workspaces())::uuid[]))', 'g');
    q := regexp_replace(q, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    c := regexp_replace(c, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    if (coalesce(q, '') || coalesce(c, '')) ~ '(is_member|is_owner)\(' then
      raise exception 'Policy % on %.% has a membership check this migration does not rewrite: % / %', p.policyname, p.schemaname, p.tablename, q, c;
    end if;
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if q is not null then sql := sql || format(' using (%s)', q); end if;
    if c is not null then sql := sql || format(' with check (%s)', c); end if;
    begin
      execute sql;
    exception when insufficient_privilege then
      raise notice 'Left % on %.% as it was (not the table owner)', p.policyname, p.schemaname, p.tablename;
    end;
  end loop;
end;
$$;

-- 13. Grants: the new jobs are the service's only.
do $$
declare
  f text;
begin
  foreach f in array array['prune_batch(regclass, text, int)', 'prune_tick()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
