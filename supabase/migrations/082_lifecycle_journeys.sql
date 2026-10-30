-- Lifecycle journeys in Emails (docs/email-plan.md Part 8). What people do in the product (claritia.track() events
-- from the site script, kind 'custom') reaches their contact as product.used, so a workflow can start on it, wait for
-- it, and stop on it. Journeys are workflows with a lifecycle stage, so the Emails section can group them.
--   product_events_sync: every minute, the last 20 minutes of custom events from sessions tied to a contact, once each
--     (keyed by the event's id). Reading back 20 minutes catches a session that was identified just after.
--   workflow_scan: the same scan as 069, with the product trigger.
--   workflow_event_since: wait until a named product event.
--   lifecycle_facts: what the build screen reads: the product's events, the stages in the CRM, the journeys there are.

alter table public.workflows add column if not exists stage text check (stage in ('trial', 'pipeline', 'customer'));
alter table public.workflows add column if not exists journey text check (length(journey) <= 40);

create or replace function public.product_events_sync() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source, at)
  select distinct on (x.id, c.id) x.workspace_id, c.id, 'product.used',
         jsonb_build_object('name', left(coalesce(nullif(x.data->>'name', ''), x.title, 'event'), 64), 'event_id', x.id), 'product', x.server_at
  from events x
  join sessions s on s.id = x.session_id and s.workspace_id = x.workspace_id
  join contacts c on c.workspace_id = s.workspace_id and c.person_id = s.person_id and c.deleted_at is null
  where x.kind = 'custom' and x.day >= current_date - 1 and x.server_at > now() - interval '20 minutes'
    and s.person_id is not null and s.person_level in ('verified', 'asserted') and not s.is_bot and not s.internal
    and not exists (select 1 from contact_events e where e.contact_id = c.id and e.kind = 'product.used'
                    and e.at >= x.server_at - interval '1 minute' and e.data->>'event_id' = x.id::text);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.workflow_scan() returns int
language plpgsql security definer set search_path = public as $$
declare
  w record;
  t jsonb;
  started int := 0;
  k int;
  since timestamptz;
begin
  for w in
    select f.id, f.workspace_id, f.live_version, f.live_at, v.body from workflows f join workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
    where f.status = 'live' and f.trigger_kind not in ('manual')
  loop
    t := w.body->'trigger';
    since := greatest(w.live_at, now() - interval '15 minutes');
    if t->>'kind' in ('form', 'meeting', 'not_booked', 'outcome', 'band', 'routed', 'segment', 'field', 'clicked', 'product') then
      insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
      select distinct on (e.contact_id) w.workspace_id, w.id, w.live_version, e.contact_id, 'ev:' || e.id::text
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = w.workspace_id and e.at >= since and e.at <= now()
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
    elsif t->>'kind' = 'broadcast' then
      -- Once, at its time, to everyone in the segment then.
      if (t->>'at')::timestamptz <= now() then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, m.contact_id, 'bc:' || m.contact_id
        from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
        where m.segment_id = (t->>'segment')::uuid and m.left_at is null
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
      end if;
    elsif t->>'kind' = 'date' then
      -- Each day after the hour: contacts whose date field, moved by the days, is today.
      if to_char(now(), 'HH24:MI') >= coalesce(t->>'time', '09:00') then
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
      end if;
    end if;
  end loop;
  return started;
end;
$$;

-- Wait until: a named product event (product.used with that name); other events as before.
create or replace function public.workflow_event_since(p_run uuid, p_kind text, p_since timestamptz, p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workflow_runs r join contact_events e on e.contact_id = r.contact_id and e.workspace_id = r.workspace_id
                 where r.id = p_run and e.kind = p_kind and e.at >= p_since and (p_name is null or e.data->>'name' = p_name));
$$;

create or replace function public.workflows_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform product_events_sync();
  perform workflow_scan();
  perform workflow_due();
end;
$$;

-- A journey made by the build screen: a draft workflow with its stage. Service role only; the route checks the caller.
create or replace function public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  select id into rid from workflows where workspace_id = p_ws and journey = p_journey;
  if rid is not null then return rid; end if;
  if (select count(*) from workflows where workspace_id = p_ws) >= 100 then raise exception 'Up to 100 workflows'; end if;
  insert into workflows (workspace_id, name, draft, created_by, stage, journey, trigger_kind)
  values (p_ws, left(trim(p_name), 120), p_draft, p_user, p_stage, p_journey, p_draft->'trigger'->>'kind')
  returning id into rid;
  return rid;
end;
$$;

-- What the build screen reads.
create or replace function public.lifecycle_facts(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('name', name, 'people', people) order by people desc)
      from (select left(coalesce(nullif(x.data->>'name', ''), x.title, 'event'), 64) as name, count(distinct x.session_id) as people
            from events x where x.workspace_id = p_ws and x.kind = 'custom' and x.day >= current_date - 30
            group by 1 order by 2 desc limit 30) q), '[]'),
    'stages', coalesce((
      select jsonb_object_agg(lifecycle, n) from (select coalesce(lifecycle, 'none') as lifecycle, count(*) as n from contacts
                                                  where workspace_id = p_ws and deleted_at is null group by 1) q), '{}'),
    'contacts', (select count(*) from contacts where workspace_id = p_ws and deleted_at is null),
    'meetings', (select count(*) from meetings where workspace_id = p_ws and created_at > now() - interval '30 days'),
    'journeys', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'journey', journey, 'stage', stage)) from workflows where workspace_id = p_ws and stage is not null), '[]')
  );
$$;

-- The product's event names (last 30 days), for the editor's pickers. Members only.
create or replace function public.product_event_names(p_ws uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(name order by n desc), '{}') from (
    select left(coalesce(nullif(x.data->>'name', ''), x.title, 'event'), 64) as name, count(*) as n
    from events x where x.workspace_id = p_ws and x.kind = 'custom' and x.day >= current_date - 30 and is_member(p_ws)
    group by 1 order by 2 desc limit 50) q;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'product_events_sync()', 'workflow_scan()', 'workflow_event_since(uuid, text, timestamptz, text)', 'workflows_tick()',
    'journey_create(uuid, uuid, text, text, text, jsonb)', 'lifecycle_facts(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

revoke execute on function public.product_event_names(uuid) from public, anon;
grant execute on function public.product_event_names(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
