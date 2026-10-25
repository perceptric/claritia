-- Start from scratch (docs/unify-plan.md Part 0): clears every workspace's records and keeps sign-ins, workspaces,
-- billing, settings and connections. Run it once in the Supabase SQL editor. It can't be undone, so it copies each
-- cleared table into the schema reset_backup_20261025 first; drop that schema once you're sure:
--   drop schema reset_backup_20261025 cascade;
--
-- Cleared: CRM records, visits and identity, forms and fills, meeting types and meetings, workflows, routing setups
-- and history, enrichment history and caches, emails and segments, nurtures, the old testing product, and every job
-- that isn't running.
-- Kept: workspaces, members, billing, invites, API keys, tracking sites, settings (sending, scoring, enrichment,
-- qualify, identity, alerts), sending domains, calendars, CRM and Slack connections, field and object definitions,
-- saved views, brand kits, availability, booking profiles, and the compliance records (suppressions, opt-outs,
-- erasures, privacy requests, audit log).
--
-- TRUNCATE without CASCADE: if a kept table still pointed at a cleared one, it stops with an error and changes
-- nothing, so nothing outside the list is ever touched.

begin;

do $$
declare
  clear text[] := array[
    -- CRM
    'contacts', 'contact_events', 'companies', 'records', 'record_links', 'notes', 'tasks', 'field_history', 'field_writes',
    'consents', 'subscriptions', 'imports', 'merge_proposals', 'source_links', 'source_runs', 'source_event_keys', 'sync_log',
    'hook_events', 'activity_out',
    -- Visits and identity
    'sessions', 'devices', 'device_links', 'events', 'persons', 'person_aliases', 'identifiers', 'identity_evidence',
    'learned_networks', 'network_flags', 'accounts', 'account_domains', 'account_scores', 'account_feedback', 'account_daily',
    'account_alert_log', 'signals', 'site_daily', 'site_rolled', 'ip_cache', 'company_cache', 'person_cache',
    -- Inbound
    'forms', 'form_versions', 'form_submissions', 'form_destinations', 'form_destination_secrets', 'form_bookings', 'form_chats',
    'form_checks', 'form_daily', 'form_seen', 'submissions', 'deliveries', 'scheduler_links',
    'meeting_types', 'meetings', 'meeting_links', 'meeting_events', 'meeting_mails', 'meeting_outcome_uses', 'meeting_sync_leases',
    'poll_votes',
    -- Automation
    'workflows', 'workflow_versions', 'workflow_emails', 'workflow_runs', 'workflow_steps_done', 'workflow_watch',
    'routers', 'router_versions', 'router_runs', 'router_slas', 'router_replays', 'router_reps',
    'enrich_runs',
    -- Nurture
    'emails', 'email_messages', 'email_events', 'email_tokens', 'email_templates', 'segments', 'segment_members',
    'nurtures', 'nurture_steps', 'nurture_enrollments',
    -- The old testing product
    'projects', 'environments', 'env_secrets', 'env_secret_values', 'tests', 'test_versions', 'test_proposals', 'blocks',
    'runs', 'run_steps', 'heals', 'plans', 'schedules', 'explorations', 'app_pages', 'app_links', 'tunnels', 'github_checks',
    'github_links', 'inbox_messages', 'alert_events', 'alert_settings',
    -- Caches of AI answers
    'ai_cache'
  ];
  have text[];
  t text;
  n bigint;
begin
  select array_agg(x order by x) into have from unnest(clear) x where to_regclass('public.' || quote_ident(x)) is not null;

  -- A copy of each table first. A second run would copy empty tables over the backup, so it stops instead.
  if exists (select 1 from pg_namespace where nspname = 'reset_backup_20261025') then
    raise exception 'Already run: the backup schema reset_backup_20261025 exists. Drop it first to run again.';
  end if;
  execute 'create schema reset_backup_20261025';
  execute 'revoke all on schema reset_backup_20261025 from public';
  foreach t in array have loop
    execute format('drop table if exists reset_backup_20261025.%I', t);
    execute format('create table reset_backup_20261025.%I as table public.%I', t, t);
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then raise notice 'clearing % rows from %', n, t; end if;
  end loop;

  execute 'truncate ' || (select string_agg(format('public.%I', x), ', ') from unnest(have) x);

  -- Jobs: everything not running (a running job finishes on its own).
  if to_regclass('public.jobs') is not null then
    execute 'create table if not exists reset_backup_20261025.jobs as table public.jobs';
    delete from jobs where status <> 'running';
    get diagnostics n = row_count;
    raise notice 'cleared % jobs', n;
  end if;
end;
$$;

-- What's left, to check by eye: every count below should be 0.
select 'contacts' as t, count(*) from contacts
union all select 'companies', count(*) from companies
union all select 'records', count(*) from records
union all select 'sessions', count(*) from sessions
union all select 'forms', count(*) from forms
union all select 'meetings', count(*) from meetings;

commit;
