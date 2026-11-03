-- Meeting reminders live in Workflows (docs/workflows.md). A Wait can be "before the meeting": the run reads the
-- contact's booked meetings, parks until that long before the next one, and wakes again whenever a meeting of theirs
-- moves or is canceled, so a reminder follows a reschedule and never goes for a canceled meeting. Once a live workflow
-- triggered by meetings has such a wait, the meeting's own reminder emails stop for that workspace, so nobody gets two.

-- The contact's booked meetings from a day ago on, soonest first, with what reminder emails need.
create or replace function public.workflow_meetings(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x->>'start_at'), '[]')
  from (
    select jsonb_build_object('id', m.id, 'start_at', m.start_at, 'type_id', m.type_id, 'guest_tz', m.guest_tz, 'url', m.location->>'url',
                              'token_hash', m.token_hash, 'token_sealed', m.token_sealed) as x
    from workflow_runs r
    join meetings m on m.contact_id = r.contact_id and m.workspace_id = r.workspace_id
    where r.id = p_run and m.status = 'booked' and m.start_at > now() - interval '1 day'
    order by m.start_at
    limit 20
  ) s;
$$;

-- A meeting moved or canceled: the contact's runs waiting on a meeting check again now.
create or replace function public.workflow_meeting_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is not null and (new.start_at is distinct from old.start_at or new.status is distinct from old.status) then
    update workflow_runs set next_at = now()
    where contact_id = new.contact_id and workspace_id = new.workspace_id and status = 'waiting' and wait ? 'meeting' and next_at > now();
  end if;
  return null;
end;
$$;
drop trigger if exists workflow_meeting_changed on public.meetings;
create trigger workflow_meeting_changed after update of start_at, status on public.meetings for each row execute function public.workflow_meeting_changed();

-- Whether a live workflow sends the workspace's meeting reminders.
create or replace function public.workflow_reminders_live(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workflows w
    join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
    where w.workspace_id = p_ws and w.status = 'live' and v.body->'trigger'->>'kind' = 'meeting'
      and jsonb_path_exists(v.body->'steps', '$.** ? (@.kind == "wait" && @.before == "meeting")'));
$$;

revoke execute on function public.workflow_meetings(uuid) from public, anon, authenticated;
revoke execute on function public.workflow_reminders_live(uuid) from public, anon, authenticated;
grant execute on function public.workflow_meetings(uuid) to service_role;
grant execute on function public.workflow_reminders_live(uuid) to service_role;
