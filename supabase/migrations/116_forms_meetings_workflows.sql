-- Claritia is Forms, Meetings and Workflows. The CRM screens, Enrichment, Scoring, Visitors and CRM sync are gone from
-- the app and the workers, so nothing runs their jobs any more. This stops the database from queuing them, clears the
-- ones already waiting, and pauses live workflows started by a trigger that's gone. Webhooks from outside form and
-- meeting tools stay (source_hook), and so do deliveries to the tools a form sends to (deliver). No data is deleted:
-- contacts, companies and the rest stay in their tables, and forms, meetings and routing keep using contacts.

-- The job kinds no worker runs now.
create or replace function public.job_kind_removed(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'stitch', 'device_reset', 'stitch_evidence', 'rebuild', 'privacy', 'identity_changed', 'ip_lookup',
    'enrich_company', 'enrich_contact', 'enrich_backfill', 'qualify', 'score_account', 'account_alert', 'score_refresh',
    'import_file', 'import_undo', 'source_pull', 'crm_push', 'crm_activity', 'segment_refresh'
  )
$$;

-- Every way in (enqueue_job, enqueue_jobs and the database's own functions) inserts into jobs, so one check here
-- covers them all: a removed kind is dropped instead of waiting forever.
create or replace function public.jobs_drop_removed() returns trigger
language plpgsql as $$
begin
  if public.job_kind_removed(new.kind) then return null; end if;
  return new;
end $$;

drop trigger if exists jobs_drop_removed on public.jobs;
create trigger jobs_drop_removed before insert on public.jobs for each row execute function public.jobs_drop_removed();

delete from public.jobs where status in ('queued', 'running') and public.job_kind_removed(kind);

-- Live workflows started by a removed trigger (qualify outcome, score band, segment, field change, product event,
-- date, broadcast, added by hand) stop; they stay as drafts to change or delete.
update public.workflows set status = 'paused', updated_at = now()
where status = 'live' and trigger_kind in ('outcome', 'band', 'segment', 'field', 'product', 'date', 'broadcast', 'manual');

-- Routing no longer waits on a two-way CRM to learn a new owner: nothing syncs it now (097's routing_sync_needed).
create or replace function public.routing_sync_needed(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false;
$$;
update public.router_runs set sync_state = 'not_required' where sync_state in ('pending', 'failed');

revoke execute on function public.job_kind_removed(text) from public, anon, authenticated;
revoke execute on function public.jobs_drop_removed() from public, anon, authenticated;
