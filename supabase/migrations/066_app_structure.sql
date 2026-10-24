-- The new app structure (docs/app-structure.md): named schedules, kept link addresses, and Pause routing.
--
-- A person's hours (`availability`) stay their default schedule. They can add named ones ("Demo hours", "Fridays
-- only"), and a meeting type can pick a schedule by name: each host uses their schedule with that name, or their
-- default when they have none by that name. meeting_inputs takes the name, so the booking page, forms, links and the
-- booking itself all read the same hours.
--
-- Single-use links, one-off meetings and polls keep a sealed copy of their address (AES-256-GCM with SECRETS_KEY, as
-- meetings keep their manage token), so Links and polls can copy a link again later. Only its hash opens it.

create table if not exists public.availability_schedules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  name text not null check (length(name) between 1 and 60),
  tz text not null default 'UTC' check (length(tz) <= 60),
  weekly jsonb not null check (jsonb_typeof(weekly) = 'object'),
  overrides jsonb not null default '[]' check (jsonb_typeof(overrides) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id, name)
);
alter table public.availability_schedules enable row level security;
drop policy if exists "members read" on public.availability_schedules;
create policy "members read" on public.availability_schedules for select using (is_member(workspace_id));
revoke all on public.availability_schedules from anon;
revoke insert, update, delete on public.availability_schedules from authenticated;

alter table public.meeting_links add column if not exists token_sealed text;

-- Add or change a named schedule (p_id null adds). The name is unique per person; a taken name raises name_taken.
create or replace function public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  if exists (select 1 from availability_schedules where workspace_id = p_ws and user_id = p_user and lower(name) = lower(trim(p_name)) and id is distinct from p_id) then
    raise exception 'name_taken';
  end if;
  -- An empty list can arrive as '{}' (node-pg sends an empty array as a Postgres array).
  if jsonb_typeof(p_overrides) is distinct from 'array' then p_overrides := '[]'; end if;
  if p_id is null then
    insert into availability_schedules (workspace_id, user_id, name, tz, weekly, overrides)
    values (p_ws, p_user, trim(p_name), p_tz, p_weekly, p_overrides)
    returning id into sid;
  else
    update availability_schedules set name = trim(p_name), tz = p_tz, weekly = p_weekly, overrides = p_overrides, updated_at = now()
    where id = p_id and workspace_id = p_ws and user_id = p_user
    returning id into sid;
    if sid is null then raise exception 'not_found'; end if;
  end if;
  return sid;
end;
$$;

create or replace function public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from availability_schedules where id = p_id and workspace_id = p_ws and user_id = p_user;
$$;

-- meeting_inputs from 053, with the schedule a type picked: each host's schedule of that name, else their default.
drop function if exists public.meeting_inputs(uuid, uuid[], timestamptz, timestamptz);
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
                          and m.block_end > p_from - interval '7 days' and m.block_start < p_to), '[]')
  )), '[]')
  from unnest(p_users) u;
$$;

-- CRM › Meetings, "All meetings" (docs/app-structure.md 3.1): the busy times on a person's connected calendars next to
-- their Claritia meetings. Your own, or anyone's for workspace owners; times only (event titles aren't kept).
create or replace function public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(p_ws) and (p_user = auth.uid() or is_owner(p_ws)) then coalesce((
    select jsonb_agg(jsonb_build_object('start', b.start_at, 'end', b.end_at, 'ooo', b.ooo) order by b.start_at)
    from busy_blocks b join calendar_accounts c on c.id = b.account_id
    join calendar_lists l on l.account_id = b.account_id and l.calendar_id = b.calendar_id and l.busy
    where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.end_at > p_from and b.start_at < least(p_to, p_from + interval '62 days')), '[]') end;
$$;
grant execute on function public.meeting_calendar_busy(uuid, uuid, timestamptz, timestamptz) to authenticated;

-- Pause routing (docs/router-ux-v2.md 3.1): new leads keep the owner they come with until routing is turned on again.
-- Nothing else changes: the setup, versions, reps and timers stay. router_live says so, and route() stops there.
alter table public.routers add column if not exists paused_at timestamptz;
alter table public.routers add column if not exists paused_by uuid;

create or replace function public.router_live(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', v.version, 'body', v.body, 'paused', r.paused_at is not null)
  from routers r join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
  where r.workspace_id = p_ws;
$$;

create or replace function public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) returns void
language sql security definer set search_path = public as $$
  update routers set paused_at = case when p_paused then coalesce(paused_at, now()) end, paused_by = case when p_paused then p_user end, updated_at = now()
  where workspace_id = p_ws;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'router_live(uuid)', 'router_pause(uuid, boolean, uuid)', 'schedule_save(uuid, uuid, uuid, text, text, jsonb, jsonb)', 'schedule_delete(uuid, uuid, uuid)', 'meeting_inputs(uuid, uuid[], timestamptz, timestamptz, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
