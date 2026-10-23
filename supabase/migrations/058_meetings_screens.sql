-- Meetings screens (docs/meetings-scheduler.md 1.2, 1.4, 1.7, 1.8b and 1.9): saving meeting types, managed types
-- pushed to people, hours, booking profiles, and the host's actions on a meeting. Every function here is for the
-- server only (service role): the routes under src/app/api/meetings/ check the caller and run the TypeScript checks
-- (src/lib/meetings/check.ts) first; these keep the rules that must hold in one transaction.

-- The workspace's members and their roles, for host checks.
create or replace function public.meetings_members(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'role', role) order by created_at), '[]') from workspace_members where workspace_id = p_ws;
$$;

create or replace function public.meeting_type_get(p_ws uuid, p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(t) from meeting_types t where t.id = p_id and t.workspace_id = p_ws;
$$;

-- Settings a template locks, taken from its settings: {key: value} for each locked key the template has.
create or replace function public.meeting_type_locked(p_settings jsonb, p_locked text[]) returns jsonb
language sql immutable as $$
  select coalesce((select jsonb_object_agg(k, p_settings -> k) from unnest(p_locked) k where p_settings ? k), '{}');
$$;

/*
 * Save a meeting type (checked by checkType first). A new one when p_id is null. A personal copy of a managed type
 * keeps its owner as host and the template's locked settings, whatever was sent. A template passes its locked
 * settings, name and kind on to every copy in the same transaction. A taken link name raises slug_taken.
 */
create or replace function public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid := p_id;
  cur meeting_types%rowtype;
  tpl meeting_types%rowtype;
  s jsonb := coalesce(p_type -> 'settings', '{}');
  v_name text := p_type ->> 'name';
  v_kind text := p_type ->> 'kind';
  v_hosts jsonb := coalesce(p_type -> 'hosts', '[]');
  v_owner uuid := nullif(p_type ->> 'owner_user_id', '')::uuid;
  v_locked text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(p_type -> 'locked', '[]')) x), '{}');
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by) then raise exception 'not_member'; end if;
  if p_id is not null then
    select * into cur from meeting_types where id = p_id and workspace_id = p_ws for update;
    if cur.id is null then raise exception 'not_found'; end if;
    if cur.template_id is not null then
      select * into tpl from meeting_types where id = cur.template_id;
      v_hosts := cur.hosts;
      v_owner := cur.owner_user_id;
      if tpl.id is not null then
        s := s || meeting_type_locked(tpl.settings, tpl.locked);
        if 'name' = any (tpl.locked) then v_name := tpl.name; end if;
        if 'kind' = any (tpl.locked) then v_kind := tpl.kind; end if;
        v_locked := tpl.locked;
      end if;
    end if;
    update meeting_types set slug = p_type ->> 'slug', name = v_name, kind = v_kind, hosts = v_hosts, settings = s,
      secret = coalesce((p_type ->> 'secret')::boolean, false), active = coalesce((p_type ->> 'active')::boolean, true),
      owner_user_id = v_owner, locked = v_locked, updated_at = now()
    where id = p_id;
  else
    insert into meeting_types (workspace_id, slug, name, kind, hosts, settings, secret, active, owner_user_id, locked, created_by)
    values (p_ws, p_type ->> 'slug', v_name, v_kind, v_hosts, s, coalesce((p_type ->> 'secret')::boolean, false),
            coalesce((p_type ->> 'active')::boolean, true), v_owner, v_locked, p_by)
    returning id into tid;
  end if;
  update meeting_types c set
    settings = c.settings || meeting_type_locked(s, v_locked),
    name = case when 'name' = any (v_locked) then v_name else c.name end,
    kind = case when 'kind' = any (v_locked) then v_kind else c.kind end,
    locked = v_locked,
    updated_at = now()
  where c.template_id = tid and c.workspace_id = p_ws;
  return tid;
exception when unique_violation then
  raise exception 'slug_taken';
end;
$$;

-- Delete a meeting type. Copies of a template stay as the people's own types, unlocked.
create or replace function public.meeting_type_delete(p_ws uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update meeting_types set locked = '{}', template_id = null, updated_at = now() where template_id = p_id and workspace_id = p_ws;
  delete from meeting_types where id = p_id and workspace_id = p_ws;
  if not found then raise exception 'not_found'; end if;
end;
$$;

/*
 * Managed types: give each chosen person their own copy of a template (one host: them), with the template's
 * settings and its locked list; copies of people no longer chosen are removed. Copies already there keep the
 * person's own changes to unlocked settings and take the locked ones again. Returns {made, kept, removed}.
 */
create or replace function public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  tpl meeting_types%rowtype;
  u uuid;
  base text;
  s text;
  i int;
  made int := 0;
  kept int := 0;
  removed int := 0;
begin
  select * into tpl from meeting_types where id = p_template and workspace_id = p_ws for update;
  if tpl.id is null then raise exception 'not_found'; end if;
  if tpl.template_id is not null or tpl.kind not in ('one', 'group') then raise exception 'bad_template'; end if;
  if exists (select 1 from unnest(p_users) x where not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = x)) then
    raise exception 'not_member';
  end if;
  delete from meeting_types where template_id = tpl.id and workspace_id = p_ws and (owner_user_id is null or not owner_user_id = any (p_users));
  get diagnostics removed = row_count;
  foreach u in array (select coalesce(array_agg(distinct x), '{}') from unnest(p_users) x) loop
    update meeting_types set settings = settings || meeting_type_locked(tpl.settings, tpl.locked),
      name = case when 'name' = any (tpl.locked) then tpl.name else name end,
      kind = tpl.kind, locked = tpl.locked, updated_at = now()
    where template_id = tpl.id and owner_user_id = u;
    if found then
      kept := kept + 1;
      continue;
    end if;
    base := left(tpl.slug, 40) || '-' || coalesce((select left(trim(both '-' from left(slug, 16)), 16) from booking_profiles where workspace_id = p_ws and user_id = u), substr(replace(u::text, '-', ''), 1, 8));
    s := base;
    i := 1;
    while exists (select 1 from meeting_types where workspace_id = p_ws and slug = s) loop
      i := i + 1;
      s := base || '-' || i;
    end loop;
    insert into meeting_types (workspace_id, slug, name, kind, hosts, settings, secret, active, owner_user_id, template_id, locked, created_by)
    values (p_ws, s, tpl.name, tpl.kind, jsonb_build_array(jsonb_build_object('user_id', u)), tpl.settings, tpl.secret, true, u, tpl.id, tpl.locked, tpl.created_by);
    made := made + 1;
  end loop;
  return jsonb_build_object('made', made, 'kept', kept, 'removed', removed);
end;
$$;

-- A person's hours (checked by checkAvailability first).
create or replace function public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into availability (workspace_id, user_id, tz, weekly, overrides, updated_at)
  values (p_ws, p_user, p_tz, p_weekly, coalesce(p_overrides, '[]'), now())
  on conflict (workspace_id, user_id) do update set tz = excluded.tz, weekly = excluded.weekly, overrides = excluded.overrides, updated_at = now();
end;
$$;

-- A person's booking page: their link name, name, a line about them and a photo. A taken link name raises slug_taken.
create or replace function public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into booking_profiles (workspace_id, user_id, slug, name, headline, photo_url, updated_at)
  values (p_ws, p_user, p_slug, p_name, nullif(p_headline, ''), nullif(p_photo, ''), now())
  on conflict (workspace_id, user_id) do update set slug = excluded.slug, name = excluded.name, headline = excluded.headline, photo_url = excluded.photo_url, updated_at = now();
exception when unique_violation then
  raise exception 'slug_taken';
end;
$$;

/*
 * A host's action on a meeting: canceled, held or no_show. The status change (meeting_status keeps the rules: only
 * valid changes, held and no-show only after the start) and its job are one transaction, so a cancel queues the
 * calendar cancel exactly once and a refused change queues nothing. A cancel goes to meeting_sync (which then sends
 * the emails); held and no-show touch no calendar and go straight to meeting_notify. Returns the meeting's payment
 * so the route can refund a paid meeting.
 */
create or replace function public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by) then raise exception 'not_member'; end if;
  if p_status not in ('canceled', 'held', 'no_show') then raise exception 'bad_change'; end if;
  select * into m from meetings where id = p_id and workspace_id = p_ws;
  if m.id is null then raise exception 'not_found'; end if;
  perform meeting_status(p_id, p_status, nullif(trim(p_reason), ''), p_by);
  if p_status = 'canceled' then
    perform enqueue_job(p_ws, 'meeting_sync', 'cancel:' || p_id || ':' || floor(extract(epoch from clock_timestamp()) * 1000)::bigint,
                        jsonb_build_object('meeting', p_id, 'action', 'cancel'));
  else
    perform enqueue_job(p_ws, 'meeting_notify', p_status || ':' || p_id, jsonb_build_object('meeting', p_id, 'event', p_status));
  end if;
  return jsonb_build_object('status', p_status, 'was', m.status, 'payment', m.payment);
end;
$$;

-- What the host needs to send the guest their own link to move or cancel (/book/m/<token>): the token's hash and
-- the sealed copy kept by 055_meeting_lifecycle.sql, for a meeting still to come.
create or replace function public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m meetings%rowtype;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_by) then raise exception 'not_member'; end if;
  select * into m from meetings where id = p_id and workspace_id = p_ws;
  if m.id is null then raise exception 'not_found'; end if;
  if m.status <> 'booked' or m.end_at <= now() then raise exception 'bad_change'; end if;
  return jsonb_build_object('id', m.id, 'token_hash', m.token_hash, 'token_sealed', m.token_sealed);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'meetings_members(uuid)', 'meeting_type_get(uuid, uuid)', 'meeting_type_locked(jsonb, text[])', 'meeting_type_save(uuid, uuid, jsonb, uuid)',
    'meeting_type_delete(uuid, uuid)', 'meeting_type_push(uuid, uuid, uuid[])', 'availability_save(uuid, uuid, text, jsonb, jsonb)',
    'booking_profile_save(uuid, uuid, text, text, text, text)', 'meeting_host_action(uuid, uuid, text, text, uuid)',
    'meeting_manage_info(uuid, uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
