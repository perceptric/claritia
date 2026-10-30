-- Routing › Assignment (Round robin or assignment rules, with Sales reps and History as its tabs): the sidebar's amber
-- dot on Routing comes from what Assignment lists under Action required, counted on the routing being worked on (the
-- draft when there is one, else the live version): reps who get leads with no working calendar, rules with no reps,
-- and a Default rule with no reps. Read in the same one call as the other counts. Same checks and grants as before.
-- Safe to run twice.

create or replace function public.router_action_count(p_ws uuid) returns int
language sql stable security definer set search_path = public as $$
  with b as (
    select coalesce(r.draft, v.body) as body
    from routers r
    left join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
    where r.workspace_id = p_ws
  ),
  arr as (
    select case when jsonb_typeof(b.body->'rules'->'list') = 'array' and coalesce((b.body->'rules'->>'on')::boolean, true) then b.body->'rules'->'list' else '[]'::jsonb end as rules,
           case when jsonb_typeof(b.body->'queues') = 'array' then b.body->'queues' else '[]'::jsonb end as queues,
           b.body->'fallback' as fb
    from b
  ),
  rules_on as (
    select x.r from arr cross join lateral jsonb_array_elements(arr.rules) as x(r)
    where coalesce((x.r->>'on')::boolean, true) and coalesce(x.r->>'then', 'queue') = 'queue'
  ),
  q as (
    select x.q->>'id' as id, case when jsonb_typeof(x.q->'members') = 'array' then x.q->'members' else '[]'::jsonb end as members
    from arr cross join lateral jsonb_array_elements(arr.queues) as x(q)
  ),
  used_q as (
    select r->>'queue' as id from rules_on
    union select fb->>'id' from arr where fb->>'kind' = 'queue'
  ),
  used_u as (
    select m->>'user' as u from q join used_q on used_q.id = q.id cross join lateral jsonb_array_elements(q.members) as m
    union select fb->>'id' from arr where fb->>'kind' = 'user'
  )
  select
    (select count(*) from used_u
      where used_u.u is not null
        and not exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id::text = used_u.u and a.provider <> 'zoom' and a.status = 'ok'))::int
  + (select count(*) from rules_on where not exists (select 1 from q where q.id = rules_on.r->>'queue' and jsonb_array_length(q.members) > 0))::int
  + (select count(*) from arr
      where not (coalesce(arr.fb->>'kind', '') = 'user' or exists (select 1 from q where arr.fb->>'kind' = 'queue' and q.id = arr.fb->>'id' and jsonb_array_length(q.members) > 0)))::int
$$;

revoke execute on function public.router_action_count(uuid) from public, anon, authenticated;

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
    'routing_paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false),
    'routing_action', router_action_count(p_ws)
  );
end;
$$;

revoke execute on function public.app_counts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.app_counts(uuid, timestamptz, timestamptz) to authenticated;
