-- Inbound set up like a sales team (Reps, Meetings, Routing): the sidebar's amber dots come with the counts it
-- already reads, in the same one call. Reps shows a dot while a teammate has no working calendar; Routing while it
-- has a draft that isn't published, is paused, or was never made live. Same checks and grants as before. Safe to
-- run twice.

create or replace function public.app_counts(p_ws uuid, p_day_from timestamptz, p_day_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return jsonb_build_object(
    'review', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status in ('held', 'unassigned') and c.deleted_at is null),
    'meetings_today', (select count(*) from meetings m where m.workspace_id = p_ws and m.status in ('booked', 'held') and m.start_at >= p_day_from and m.start_at < p_day_to),
    'calendars', (select count(*) from (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = auth.uid() limit 1) x),
    'types', (select count(*) from (select 1 from meeting_types t where t.workspace_id = p_ws limit 1) x),
    'live_forms', (select count(*) from (select 1 from forms f where f.workspace_id = p_ws and f.status = 'live' limit 1) x),
    'routing', coalesce((select r.live_version is not null and r.live_version > 0 from routers r where r.workspace_id = p_ws), false),
    'members', (select count(*) from (select 1 from workspace_members w where w.workspace_id = p_ws limit 2) x),
    'invites', (select count(*) from (select 1 from invites i where i.workspace_id = p_ws limit 1) x),
    'sources', (select count(*) from (select 1 from sources s where s.workspace_id = p_ws limit 1) x),
    -- Teammates with no calendar that works (Zoom isn't a calendar; one to sign in again doesn't count).
    'no_calendar', (select count(*) from workspace_members w
                     where w.workspace_id = p_ws
                       and not exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status = 'ok')),
    'routing_draft', coalesce((select r.draft is not null from routers r where r.workspace_id = p_ws), false),
    'routing_paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false)
  );
end;
$$;

revoke execute on function public.app_counts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.app_counts(uuid, timestamptz, timestamptz) to authenticated;
