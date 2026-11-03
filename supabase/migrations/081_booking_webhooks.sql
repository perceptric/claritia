-- Booking pages at /booking/<handle> and meeting webhooks (docs/scheduling-plan.md Parts 4 to 6).
--   Handles: a person's handle (booking_profiles.handle) and a team's (workspaces.booking_slug) share one space, so
--   /booking/<handle> is never two pages. booking_handle_set claims one under a lock; booking_resolve reads one.
--   Webhooks: each meeting change in meeting_events writes one send per endpoint that wants it, and queues its job,
--   in the same transaction as the change. The send's body is kept, so every retry sends the same bytes and id.

-- Handles ------------------------------------------------------------------------------------------------------

alter table public.booking_profiles add column if not exists handle text check (handle ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');
create unique index if not exists booking_profiles_handle on public.booking_profiles (handle) where handle is not null;

-- Words kept for the app's own addresses and for clarity.
create or replace function public.booking_reserved(p_handle text) returns boolean
language sql immutable as $$
  select p_handle = any(array['m', 'p', 'l', 't', 'api', 'app', 'admin', 'book', 'booking', 'embed', 'new', 'help',
                              'support', 'settings', 'claritia', 'www', 'team', 'login', 'signup', 'pay', 'webhooks']);
$$;

-- Whether a handle is free for this person (p_user) or this team (p_user null).
create or replace function public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select not booking_reserved(lower(p_handle))
     and not exists (select 1 from workspaces w where w.booking_slug = lower(p_handle) and (p_user is not null or w.id <> p_ws))
     and not exists (select 1 from booking_profiles b where b.handle = lower(p_handle) and not (b.workspace_id = p_ws and b.user_id is not distinct from p_user));
$$;

-- Claim a handle: a person's (p_user) or the team's (p_user null). Raises handle_taken or no_profile.
create or replace function public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) returns text
language plpgsql security definer set search_path = public as $$
declare
  h text := lower(trim(p_handle));
begin
  if h !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then raise exception 'bad_handle'; end if;
  perform pg_advisory_xact_lock(hashtextextended('booking-handle:' || h, 0));
  if not booking_handle_free(h, p_ws, p_user) then raise exception 'handle_taken'; end if;
  if p_user is null then
    update workspaces set booking_slug = h where id = p_ws;
  else
    update booking_profiles set handle = h, updated_at = now() where workspace_id = p_ws and user_id = p_user;
    if not found then raise exception 'no_profile'; end if;
  end if;
  return h;
exception when unique_violation then
  raise exception 'handle_taken';
end;
$$;

-- The team's booking name, made from its name the first time; now also skips people's handles and kept words.
create or replace function public.booking_slug_ensure(p_ws uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  s text;
  base text;
  i int := 1;
begin
  select booking_slug into s from workspaces where id = p_ws;
  if s is not null then return s; end if;
  select left(trim(both '-' from regexp_replace(lower(coalesce(name, 'team')), '[^a-z0-9]+', '-', 'g')), 30) into base from workspaces where id = p_ws;
  if base is null or length(base) < 3 then base := 'team-' || substr(p_ws::text, 1, 6); end if;
  s := base;
  loop
    perform pg_advisory_xact_lock(hashtextextended('booking-handle:' || s, 0));
    exit when booking_handle_free(s, p_ws, null);
    i := i + 1;
    s := base || '-' || i;
  end loop;
  update workspaces set booking_slug = s where id = p_ws;
  return s;
end;
$$;

-- A handle as the pages need it: the workspace's booking name and, for a person, their link name.
create or replace function public.booking_resolve(p_handle text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('ws', w.booking_slug, 'person', b.slug, 'handle', b.handle)
     from booking_profiles b join workspaces w on w.id = b.workspace_id
     where b.handle = lower(p_handle) and w.booking_slug is not null),
    (select jsonb_build_object('ws', w.booking_slug, 'person', null, 'handle', w.booking_slug)
     from workspaces w where w.booking_slug = lower(p_handle))
  );
$$;

-- The Booking page tab: the team's handle, your profile and handle, and the types you can show.
create or replace function public.booking_page_info(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'team', (select booking_slug from workspaces where id = p_ws),
    'profile', (select jsonb_build_object('slug', slug, 'name', name, 'headline', headline, 'photo_url', photo_url, 'handle', handle)
                from booking_profiles where workspace_id = p_ws and user_id = p_user),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'kind', t.kind, 'secret', t.secret,
                                          'team', t.owner_user_id is null and t.kind not in ('one', 'group'),
                                          'mine', t.owner_user_id = p_user or (t.owner_user_id is null and t.kind in ('one', 'group') and t.hosts->0->>'user_id' = p_user::text),
                                          'length', t.settings->'lengths'->0) order by t.name)
      from meeting_types t where t.workspace_id = p_ws and t.active), '[]')
  );
$$;

-- Webhooks -----------------------------------------------------------------------------------------------------

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- What's safe to show: the address's host and the secret's last characters. The address and secret are sealed.
  host text not null check (length(host) between 1 and 255),
  sealed text not null check (length(sealed) <= 4000),
  secret_hint text not null check (length(secret_hint) <= 8),
  events text[] not null check (cardinality(events) >= 1 and events <@ array['meeting.booked', 'meeting.rescheduled', 'meeting.canceled', 'meeting.held', 'meeting.no_show']),
  description text check (length(description) <= 120),
  active boolean not null default true,
  last_ok_at timestamptz,
  last_fail_at timestamptz,
  last_error text check (length(last_error) <= 500),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhook_endpoints_ws on public.webhook_endpoints (workspace_id, created_at);

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  endpoint_id uuid not null references public.webhook_endpoints (id) on delete cascade,
  event text not null check (length(event) <= 40),
  -- The meeting change it came from; null for a test. Unique per endpoint, so a change is sent once.
  event_id bigint,
  meeting_id uuid,
  body jsonb not null,
  -- Filled on the first try (location and manage link as they are then), then kept for every retry.
  frozen boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'retrying', 'done', 'failed')),
  attempts int not null default 0,
  code int,
  error text check (length(error) <= 500),
  test boolean not null default false,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (endpoint_id, event_id)
);
create index if not exists webhook_deliveries_endpoint on public.webhook_deliveries (endpoint_id, created_at desc);

alter table public.webhook_endpoints enable row level security;
alter table public.webhook_deliveries enable row level security;
revoke all on public.webhook_endpoints, public.webhook_deliveries from anon, authenticated;

-- The body for one meeting change. Stable: receivers build on it.
create or replace function public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamptz, p_detail jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', 'evt_' || p_event_id,
    'event', p_event,
    'created_at', p_at,
    'workspace_id', m.workspace_id,
    'test', false,
    'data', jsonb_build_object('meeting', jsonb_build_object(
      'id', m.id,
      'status', m.status,
      'start_time', m.start_at,
      'end_time', m.end_at,
      'guest_timezone', m.guest_tz,
      'source', m.source,
      'created_at', m.created_at,
      'type', case when t.id is null then null else jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'kind', t.kind) end,
      'hosts', (select coalesce(jsonb_agg(jsonb_build_object('id', p->>'id', 'name', p->>'name', 'email', p->>'email', 'timezone', p->>'tz')), '[]')
                from jsonb_array_elements(meeting_people(m.workspace_id, m.hosts)) p),
      'guest', jsonb_build_object('name', m.guest_name, 'email', m.guest_email, 'contact_id', m.contact_id),
      'answers', m.answers,
      'location', coalesce(t.settings->'location', '{}'::jsonb) || coalesce(m.location, '{}'::jsonb),
      'submission_id', m.submission_id,
      'cancel_reason', case when p_event = 'meeting.canceled' then coalesce(p_detail->>'reason', m.cancel_reason) end,
      'rescheduled_from', case when p_event = 'meeting.rescheduled' then p_detail->'from' end,
      'payment', case when m.payment is null then null else jsonb_build_object('amount', m.payment->'amount', 'currency', m.payment->'currency', 'status', m.payment->'status') end
    ))
  )
  from meetings m left join meeting_types t on t.id = m.type_id
  where m.id = p_meeting;
$$;

-- On each meeting change: one send per endpoint that wants it, and its job. A booking's first try waits a minute,
-- so the video link made with the calendar event is usually in it.
create or replace function public.meeting_events_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev text;
  ws uuid;
  body jsonb;
  ep record;
  did uuid;
begin
  ev := case new.kind when 'booked' then 'meeting.booked' when 'moved' then 'meeting.rescheduled' when 'canceled' then 'meeting.canceled'
                      when 'held' then 'meeting.held' when 'no_show' then 'meeting.no_show' end;
  if ev is null then return null; end if;
  select workspace_id into ws from meetings where id = new.meeting_id;
  if ws is null or not exists (select 1 from webhook_endpoints e where e.workspace_id = ws and e.active and ev = any(e.events)) then return null; end if;
  body := webhook_meeting_body(new.meeting_id, ev, new.id, new.at, new.detail);
  for ep in select e.id from webhook_endpoints e where e.workspace_id = ws and e.active and ev = any(e.events) order by e.created_at loop
    did := null;
    insert into webhook_deliveries (workspace_id, endpoint_id, event, event_id, meeting_id, body)
    values (ws, ep.id, ev, new.id, new.meeting_id, body)
    on conflict (endpoint_id, event_id) do nothing
    returning id into did;
    if did is not null then
      perform enqueue_job(ws, 'meeting_webhook', did::text, jsonb_build_object('delivery_id', did), case when ev = 'meeting.booked' then 60 else 0 end, 8);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists meeting_events_webhooks on public.meeting_events;
create trigger meeting_events_webhooks after insert on public.meeting_events for each row execute function public.meeting_events_webhooks();

-- The tab: endpoints with their last results (never the sealed address or secret).
create or replace function public.webhooks_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'host', e.host, 'secret_hint', e.secret_hint, 'events', e.events, 'description', e.description, 'active', e.active,
    'last_ok_at', e.last_ok_at, 'last_fail_at', e.last_fail_at, 'last_error', e.last_error, 'created_at', e.created_at,
    'sent', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'done' and d.created_at > now() - interval '30 days'),
    'failed', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'failed' and d.created_at > now() - interval '30 days')
  ) order by e.created_at), '[]')
  from webhook_endpoints e where e.workspace_id = p_ws;
$$;

-- Add (p_id null) or change an endpoint. p_sealed null keeps the address and secret. Up to 10 per workspace.
create or replace function public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('webhooks:' || p_ws::text, 0));
    if (select count(*) from webhook_endpoints where workspace_id = p_ws) >= 10 then raise exception 'too_many'; end if;
    if p_sealed is null then raise exception 'no_address'; end if;
    insert into webhook_endpoints (workspace_id, host, sealed, secret_hint, events, description, active, created_by)
    values (p_ws, p_host, p_sealed, p_hint, p_events, nullif(p_description, ''), coalesce(p_active, true), p_by)
    returning id into rid;
    return rid;
  end if;
  update webhook_endpoints set
    host = case when p_sealed is null then host else p_host end,
    sealed = coalesce(p_sealed, sealed),
    secret_hint = case when p_sealed is null then secret_hint else p_hint end,
    events = coalesce(p_events, events),
    description = case when p_description is null then description else nullif(p_description, '') end,
    active = coalesce(p_active, active),
    updated_at = now()
  where id = p_id and workspace_id = p_ws
  returning id into rid;
  if rid is null then raise exception 'not_found'; end if;
  return rid;
end;
$$;

-- The sealed address and secret, for the server's own changes (a new secret, a test send).
create or replace function public.webhook_sealed(p_ws uuid, p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select sealed from webhook_endpoints where id = p_id and workspace_id = p_ws;
$$;

create or replace function public.webhook_delete(p_ws uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from webhook_endpoints where id = p_id and workspace_id = p_ws;
$$;

-- One endpoint's last sends, newest first.
create or replace function public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select d.id, d.event, d.meeting_id, d.status, d.attempts, d.code, d.error, d.test, d.created_at, d.sent_at, d.body
    from webhook_deliveries d
    where d.endpoint_id = p_endpoint and d.workspace_id = p_ws
    order by d.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

-- A test send, written as a delivery so it shows with the rest. The route sends it at once.
create or replace function public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if not exists (select 1 from webhook_endpoints where id = p_endpoint and workspace_id = p_ws) then raise exception 'not_found'; end if;
  insert into webhook_deliveries (workspace_id, endpoint_id, event, body, frozen, test)
  values (p_ws, p_endpoint, p_event, p_body, true, true)
  returning id into rid;
  return rid;
end;
$$;

-- Send one again: back to pending and queued. A send already waiting joins its job.
create or replace function public.webhook_resend(p_ws uuid, p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update webhook_deliveries set status = 'pending', error = null where id = p_id and workspace_id = p_ws;
  if not found then raise exception 'not_found'; end if;
  perform enqueue_job(p_ws, 'meeting_webhook', p_id::text, jsonb_build_object('delivery_id', p_id), 0, 8);
end;
$$;

/*
 * The worker takes a send: its body, whether it's frozen, the endpoint's sealed address and the meeting's live
 * location and sealed manage token (for the first try). Null when the send or its endpoint is gone, or it's done.
 */
create or replace function public.webhook_take(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d webhook_deliveries%rowtype;
  e webhook_endpoints%rowtype;
  m meetings%rowtype;
begin
  select * into d from webhook_deliveries where id = p_id for update;
  if d.id is null or d.status = 'done' then return null; end if;
  select * into e from webhook_endpoints where id = d.endpoint_id;
  if e.id is null then return null; end if;
  update webhook_deliveries set attempts = attempts + 1 where id = p_id;
  select * into m from meetings where id = d.meeting_id;
  return jsonb_build_object(
    'id', d.id, 'event', d.event, 'body', d.body, 'frozen', d.frozen, 'attempts', d.attempts + 1, 'active', e.active, 'sealed', e.sealed,
    'meeting', case when m.id is null then null else jsonb_build_object('id', m.id, 'token_hash', m.token_hash, 'token_sealed', m.token_sealed, 'status', m.status,
                                                                        'location', coalesce(m.location, '{}'::jsonb)) end
  );
end;
$$;

-- Keep the first try's body for every retry.
create or replace function public.webhook_freeze(p_id uuid, p_body jsonb) returns void
language sql security definer set search_path = public as $$
  update webhook_deliveries set body = p_body, frozen = true where id = p_id and not frozen;
$$;

-- How a try ended: done, retrying or failed, with the answer's code and the reason. The endpoint keeps its last.
create or replace function public.webhook_done(p_id uuid, p_status text, p_code int, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare
  ep uuid;
begin
  update webhook_deliveries set status = p_status, code = p_code, error = left(p_error, 500), sent_at = now()
  where id = p_id returning endpoint_id into ep;
  if ep is null then return; end if;
  if p_status = 'done' then
    update webhook_endpoints set last_ok_at = now() where id = ep;
  else
    update webhook_endpoints set last_fail_at = now(), last_error = left(p_error, 500) where id = ep;
  end if;
end;
$$;

-- Sends are kept 30 days.
create or replace function public.webhook_prune() returns void
language sql security definer set search_path = public as $$
  delete from webhook_deliveries where created_at < now() - interval '30 days';
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'booking_handle_free(text, uuid, uuid)', 'booking_handle_set(uuid, uuid, text)', 'booking_slug_ensure(uuid)', 'booking_resolve(text)',
    'booking_page_info(uuid, uuid)', 'webhook_meeting_body(uuid, text, bigint, timestamptz, jsonb)', 'meeting_events_webhooks()',
    'webhooks_list(uuid)', 'webhook_save(uuid, uuid, text, text, text, text[], text, boolean, uuid)', 'webhook_sealed(uuid, uuid)',
    'webhook_delete(uuid, uuid)', 'webhook_deliveries_list(uuid, uuid, int)', 'webhook_test_add(uuid, uuid, text, jsonb)',
    'webhook_resend(uuid, uuid)', 'webhook_take(uuid)', 'webhook_freeze(uuid, jsonb)', 'webhook_done(uuid, text, int, text)', 'webhook_prune()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

-- Daily: old sends go.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-webhook-prune', '17 4 * * *', 'select public.webhook_prune()');
  end if;
end;
$$;

notify pgrst, 'reload schema';
