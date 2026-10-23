-- Group meetings (docs/meetings-scheduler.md 1.4): every seat at one start shares one calendar event and one video
-- link, and a guest can move their seat to another start of the same type.
--   meeting_move: a group seat may move into a start that has seats left (other seats there aren't a clash).
--   meeting_sync_inputs: for the worker's meeting_sync, the other seats at the meeting's start (to join their event),
--           the meetings that still share its current event (so a cancel or move leaves the event to them), and the
--           session's first seat, whose sync lease keeps two seats from each making an event at once.

create or replace function public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  h uuid;
  seats int := 0;
begin
  foreach h in array (select array_agg(x order by x) from unnest(p_hosts) x) loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-host:' || h::text, 0));
  end loop;
  select * into m from meetings where id = p_id for update;
  if m.id is null or m.status <> 'booked' then raise exception 'not_movable'; end if;
  select coalesce((t.settings->>'seats')::int, 1) into seats from meeting_types t where t.id = m.type_id and t.kind = 'group';
  seats := coalesce(seats, 0);
  if seats > 0 and (select count(*) from meetings x where x.type_id = m.type_id and x.id <> m.id and x.start_at = p_start and meeting_holds(x)) >= seats then
    raise exception 'full';
  end if;
  if exists (
    select 1 from meetings x
    where x.workspace_id = m.workspace_id and x.id <> m.id and x.hosts && p_hosts and meeting_holds(x)
      and tstzrange(x.block_start, x.block_end) && tstzrange(p_block_start, p_block_end)
      and not (seats > 0 and x.type_id = m.type_id and x.start_at = p_start)
  ) then
    raise exception 'slot_taken';
  end if;
  update meetings set hosts = p_hosts, start_at = p_start, end_at = p_end, block_start = p_block_start, block_end = p_block_end, updated_at = now() where id = p_id;
  insert into meeting_events (meeting_id, kind, detail) values (p_id, 'moved', jsonb_build_object('from', m.start_at, 'to', p_start, 'hosts', p_hosts));
  perform meeting_timeline(p_id, 'meeting.rescheduled');
end;
$$;

-- A seat as meeting_sync needs it: who's on it and where its event is.
create or replace function public.meeting_seat(m meetings) returns jsonb
language sql stable as $$
  select jsonb_build_object('id', m.id, 'guest_email', m.guest_email, 'guest_name', m.guest_name, 'answers', m.answers,
                            'start_at', m.start_at, 'end_at', m.end_at, 'events', m.events, 'location', m.location);
$$;

create or replace function public.meeting_sync_inputs(p_meeting uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'meeting', to_jsonb(m) - 'token_hash' - 'payment',
    'title', coalesce((select t.name from meeting_types t where t.id = m.type_id), (select l.title from meeting_links l where l.id = m.link_id), 'Meeting'),
    'questions', (select t.settings->'questions' from meeting_types t where t.id = m.type_id),
    'hosts', (select jsonb_agg(jsonb_build_object(
        'user_id', x.h,
        'email', (select u.email from auth.users u where u.id = x.h),
        'cal', (select calendar_account(c.id) || jsonb_build_object('write', l.calendar_id)
                from calendar_accounts c join calendar_lists l on l.account_id = c.id and l.write
                where c.workspace_id = m.workspace_id and c.user_id = x.h and c.status = 'ok' and c.provider <> 'zoom'
                order by c.created_at limit 1),
        'zoom', (select calendar_account(c.id) from calendar_accounts c
                 where c.workspace_id = m.workspace_id and c.user_id = x.h and c.status = 'ok' and c.provider = 'zoom'
                 order by c.created_at limit 1)
      ) order by x.ord) from unnest(m.hosts) with ordinality x(h, ord)),
    'group', g.is_group,
    'session', case when g.is_group then coalesce((
        select jsonb_agg(meeting_seat(x) order by x.created_at, x.id) from meetings x
        where x.type_id = m.type_id and x.id <> m.id and x.start_at = m.start_at and x.status = 'booked'), '[]') else '[]' end,
    'anchor', case when g.is_group then (
        select x.id from meetings x where x.type_id = m.type_id and x.start_at = m.start_at and (x.id = m.id or x.status = 'booked')
        order by x.created_at, x.id limit 1) end,
    'sharing', coalesce((
        select jsonb_agg(meeting_seat(x) order by x.created_at, x.id) from meetings x
        where x.type_id = m.type_id and x.id <> m.id and x.status = 'booked'
          and exists (select 1 from jsonb_each(m.events) a, jsonb_each(x.events) b
                      where a.value->>'event' is not null and a.value->>'event' = b.value->>'event')), '[]')
  )
  from meetings m
  cross join lateral (select exists (select 1 from meeting_types t where t.id = m.type_id and t.kind = 'group') as is_group) g
  where m.id = p_meeting;
$$;

revoke execute on function public.meeting_seat(meetings) from public, anon, authenticated;
revoke execute on function public.meeting_sync_inputs(uuid) from public, anon, authenticated;
grant execute on function public.meeting_sync_inputs(uuid) to service_role;
