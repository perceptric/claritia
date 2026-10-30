-- Calendar and Routing as one system (docs/scheduling-plan.md Part 12). A meeting type can be hosted by a Routing team:
-- its people come from the live router's queue, the times are pooled, and the confirm takes the queue's turn with the
-- router's method and counts. The booking is written as a router run (reason 'booking'), so a rep's meetings and leads
-- share one rotation and one set of caps. A rep's days off (router_reps.out_dates) remove their times, and a paused
-- rep is left out of team times. Writes go through the server with the service role.

-- 'booking': a team meeting type gave the lead its rep.
alter table public.router_runs drop constraint if exists router_runs_reason_check;
alter table public.router_runs add constraint router_runs_reason_check
  check (reason in ('form', 'import', 'crm', 'api', 'again', 'let_through', 'score', 'manual', 'sla', 'booking'));

-- meeting_inputs from 066, with each host's days off and pause from Routing.
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
                        from meetings m where m.workspace_id = p_ws and u = any(m.hosts) and meeting_holds(m)
                          and m.block_end > p_from - interval '7 days' and m.block_start < p_to), '[]'),
    'out_dates', coalesce((select r.out_dates from router_reps r where r.workspace_id = p_ws and r.user_id = u), '[]'),
    'paused_until', (select r.paused_until from router_reps r where r.workspace_id = p_ws and r.user_id = u)
  )), '[]')
  from unnest(p_users) u;
$$;

/*
 * A team meeting's run: the rep the queue's turn gave it, written once per meeting (the key is booking:<meeting>).
 * The contact takes the rep as owner only when it has none, so a lead's routed owner is never moved by a booking.
 * Returns the run id, or the existing one for a key seen before.
 */
create or replace function public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version int, p_steps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k text := 'booking:' || p_meeting::text;
  rid uuid;
  cid uuid;
  c contacts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || coalesce(p_queue, '-'), 0));
  select id into rid from router_runs where workspace_id = p_ws and key = k;
  if rid is not null then return rid; end if;
  select coalesce(p_contact, m.contact_id) into cid from meetings m where m.id = p_meeting and m.workspace_id = p_ws;
  if not found then return null; end if;
  if cid is not null then
    select * into c from contacts where id = cid and workspace_id = p_ws and deleted_at is null for update;
  end if;
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, steps, facts, ms)
  values (p_ws, c.id, k, 'booking', p_version, 'owner', p_owner, 'queue', p_queue, coalesce(p_steps, '[]'), jsonb_build_object('meeting', p_meeting), 0)
  returning id into rid;
  if c.id is not null and c.owner_user_id is null and c.owner_crm_id is null then
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
    values (p_ws, 'contact', c.id, 'owner', 'null'::jsonb, to_jsonb(p_owner), c.field_sources->'owner', 'routing', null);
    update contacts set owner_user_id = p_owner, route_status = null,
      owner_crm_id = (select l.crm_owner_id from crm_owner_links l where l.workspace_id = p_ws and l.user_id = p_owner order by l.updated_at desc limit 1),
      field_sources = coalesce(field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'routing', 'at', now())), updated_at = now()
    where id = c.id;
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (p_ws, c.id, 'lead.routed', jsonb_build_object('run_id', rid, 'owner', p_owner, 'by', 'queue', 'queue', p_queue, 'reason', 'booking'), 'routing');
  end if;
  return rid;
end;
$$;

-- A lead's upcoming meetings with one host, for "Move their upcoming meeting too?" when the lead gets a new rep.
create or replace function public.meeting_upcoming_for(p_ws uuid, p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'host', m.hosts[1], 'start', m.start_at, 'end', m.end_at, 'block_start', m.block_start, 'block_end', m.block_end,
                                               'kind', t.kind) order by m.start_at), '[]')
  from meetings m left join meeting_types t on t.id = m.type_id
  where m.workspace_id = p_ws and m.contact_id = p_contact and m.status = 'booked' and m.start_at > now()
    and cardinality(m.hosts) = 1 and coalesce(t.kind, 'one') not in ('collective', 'double', 'group');
$$;

do $$
declare
  f text;
begin
  foreach f in array array['meeting_inputs(uuid, uuid[], timestamptz, timestamptz, text)', 'meeting_team_run(uuid, uuid, uuid, text, uuid, int, jsonb)', 'meeting_upcoming_for(uuid, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
