-- The Forms API, and the hooks Zapier, Make and Activepieces make with it (docs/integrations-plan.md, Next step 1).
--   Hooks are meeting webhook endpoints (081) made by an app: `via` names the app, `api_key_id` the key it signed in
--   with (revoking the key removes its hooks), `forms` limits a fill hook to some forms. Two more events: a fill
--   (form.submitted) and a routing result (lead.routed). A fill's body is built on its first try, when its contact
--   and uploads are in, then kept for every retry, like a booking's.
--   Signing in: the app sends the person to /oauth/authorize; they approve; the app trades the code for an API key
--   named after it (oauth_codes). A code works once, for 10 minutes; a code used twice revokes the key it made.

-- Hooks ----------------------------------------------------------------------------------------------------------

alter table public.webhook_endpoints add column if not exists via text not null default 'app' check (via in ('app', 'zapier', 'make', 'activepieces', 'api'));
alter table public.webhook_endpoints add column if not exists forms uuid[] not null default '{}' check (cardinality(forms) <= 50);
alter table public.webhook_endpoints add column if not exists api_key_id uuid references public.api_keys (id) on delete cascade;
alter table public.webhook_endpoints add column if not exists failing_since timestamptz;
alter table public.webhook_endpoints drop constraint if exists webhook_endpoints_events_check;
alter table public.webhook_endpoints add constraint webhook_endpoints_events_check check (
  cardinality(events) >= 1 and events <@ array['meeting.booked', 'meeting.rescheduled', 'meeting.canceled', 'meeting.held', 'meeting.no_show', 'form.submitted', 'lead.routed']
);
create index if not exists webhook_endpoints_key on public.webhook_endpoints (api_key_id) where api_key_id is not null;

alter table public.webhook_deliveries add column if not exists submission_id uuid references public.submissions (id) on delete cascade;
-- What a fill or routing send came from ('sub:<id>', 'ce:<id>'): unique per endpoint, so each is sent once.
alter table public.webhook_deliveries add column if not exists ref text check (length(ref) <= 80);
create unique index if not exists webhook_deliveries_ref on public.webhook_deliveries (endpoint_id, ref) where ref is not null;

-- A fill as a hook's first try reads it: the same shape a form's own webhook gets (delivery_take, 045).
create or replace function public.hook_fill(p_sub uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'created_at', s.created_at, 'values', s."values", 'hidden', s.hidden, 'consent', s.consent, 'test', s.test,
                                     'form_version', s.form_version, 'contact_id', s.contact_id, 'spam', s.spam, 'over_cap', s.over_cap),
    'form', jsonb_build_object('id', f.id, 'name', f.name, 'body', v.body),
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name,
                 'title', c.title, 'phone', c.phone, 'country', c.country, 'company', co.name, 'company_domain', co.domain) end)
  from submissions s
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id and c.deleted_at is null
  left join companies co on co.id = c.company_id
  where s.id = p_sub;
$$;

-- A routing result's body. Stable: receivers build on it.
create or replace function public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', 'evt_' || replace(p_id::text, '-', ''),
    'event', 'lead.routed',
    'created_at', p_at,
    'workspace_id', p_ws,
    'test', false,
    'data', jsonb_build_object('lead', jsonb_build_object(
      'id', p_id,
      'result', case when p_kind = 'lead.routed' then 'routed' else 'unassigned' end,
      'owner', case when coalesce(p_data->>'owner', '') ~ '^[0-9a-f-]{36}$' then meeting_people(p_ws, array[(p_data->>'owner')::uuid])->0 end,
      'by', p_data->>'by',
      'queue', p_data->>'queue',
      'reason', p_data->>'reason',
      'submission_id', coalesce(p_data->>'submission_id', p_data->>'submission'),
      'routed_at', p_at,
      'contact', (select jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'title', c.title, 'company', co.name)
                  from contacts c left join companies co on co.id = c.company_id where c.id = p_contact)
    ))
  );
$$;

-- A new fill: one send per hook that wants it. The first try waits 5 seconds, so its contact and uploads are in.
create or replace function public.submissions_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep record;
  did uuid;
begin
  if new.spam or new.test then return null; end if;
  for ep in select e.id from webhook_endpoints e
            where e.workspace_id = new.workspace_id and e.active and 'form.submitted' = any(e.events)
              and (cardinality(e.forms) = 0 or new.form_id = any(e.forms))
            order by e.created_at loop
    did := null;
    insert into webhook_deliveries (workspace_id, endpoint_id, event, submission_id, ref, body)
    values (new.workspace_id, ep.id, 'form.submitted', new.id, 'sub:' || new.id,
            jsonb_build_object('id', 'evt_' || replace(new.id::text, '-', ''), 'event', 'form.submitted', 'created_at', new.created_at,
                               'workspace_id', new.workspace_id, 'test', false, 'data', '{}'::jsonb))
    on conflict (endpoint_id, ref) where ref is not null do nothing
    returning id into did;
    if did is not null then
      perform enqueue_job(new.workspace_id, 'meeting_webhook', did::text, jsonb_build_object('delivery_id', did), 5, 8);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists submissions_webhooks on public.submissions;
create trigger submissions_webhooks after insert on public.submissions for each row execute function public.submissions_webhooks();

-- A routing result: one send per hook that wants it.
create or replace function public.contact_events_webhooks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ep record;
  did uuid;
  body jsonb;
begin
  if new.kind not in ('lead.routed', 'lead.unassigned') then return null; end if;
  if not exists (select 1 from webhook_endpoints e where e.workspace_id = new.workspace_id and e.active and 'lead.routed' = any(e.events)) then return null; end if;
  body := webhook_routed_body(new.id, new.workspace_id, new.contact_id, new.kind, new.data, new.at);
  for ep in select e.id from webhook_endpoints e where e.workspace_id = new.workspace_id and e.active and 'lead.routed' = any(e.events) order by e.created_at loop
    did := null;
    insert into webhook_deliveries (workspace_id, endpoint_id, event, ref, body, frozen)
    values (new.workspace_id, ep.id, 'lead.routed', 'ce:' || new.id, body, true)
    on conflict (endpoint_id, ref) where ref is not null do nothing
    returning id into did;
    if did is not null then
      perform enqueue_job(new.workspace_id, 'meeting_webhook', did::text, jsonb_build_object('delivery_id', did), 0, 8);
    end if;
  end loop;
  return null;
end;
$$;

drop trigger if exists contact_events_webhooks on public.contact_events;
create trigger contact_events_webhooks after insert on public.contact_events for each row execute function public.contact_events_webhooks();

-- The worker's take now also says which fill a send is for, which app made its hook, and the hook's id.
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
    'endpoint_id', e.id, 'via', e.via, 'submission_id', d.submission_id,
    'meeting', case when m.id is null then null else jsonb_build_object('id', m.id, 'token_hash', m.token_hash, 'token_sealed', m.token_sealed, 'status', m.status,
                                                                        'location', coalesce(m.location, '{}'::jsonb)) end
  );
end;
$$;

-- How a try ended. A hook an app made that has failed for 3 days is paused; a success clears the count.
create or replace function public.webhook_done(p_id uuid, p_status text, p_code int, p_error text) returns void
language plpgsql security definer set search_path = public as $$
declare
  ep uuid;
begin
  update webhook_deliveries set status = p_status, code = p_code, error = left(p_error, 500), sent_at = now()
  where id = p_id returning endpoint_id into ep;
  if ep is null then return; end if;
  if p_status = 'done' then
    update webhook_endpoints set last_ok_at = now(), failing_since = null where id = ep;
  else
    update webhook_endpoints set
      last_fail_at = now(),
      failing_since = coalesce(failing_since, now()),
      active = case when via <> 'app' and failing_since < now() - interval '3 days' then false else active end,
      last_error = left(case when via <> 'app' and active and failing_since < now() - interval '3 days' then 'Paused after 3 days of failed sends. ' || coalesce(p_error, '') else p_error end, 500)
    where id = ep;
  end if;
end;
$$;

-- The Webhooks tab lists and counts the hooks people made; the apps' hooks are theirs to manage.
create or replace function public.webhooks_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'host', e.host, 'secret_hint', e.secret_hint, 'events', e.events, 'description', e.description, 'active', e.active,
    'last_ok_at', e.last_ok_at, 'last_fail_at', e.last_fail_at, 'last_error', e.last_error, 'created_at', e.created_at,
    'sent', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'done' and d.created_at > now() - interval '30 days'),
    'failed', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'failed' and d.created_at > now() - interval '30 days')
  ) order by e.created_at), '[]')
  from webhook_endpoints e where e.workspace_id = p_ws and e.via = 'app';
$$;

create or replace function public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('webhooks:' || p_ws::text, 0));
    if (select count(*) from webhook_endpoints where workspace_id = p_ws and via = 'app') >= 10 then raise exception 'too_many'; end if;
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
  where id = p_id and workspace_id = p_ws and via = 'app'
  returning id into rid;
  if rid is null then raise exception 'not_found'; end if;
  return rid;
end;
$$;

-- An app's hook (POST /api/v1/hooks). Up to 200 per workspace; the forms must be the workspace's own.
create or replace function public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
  fs uuid[] := coalesce(p_forms, '{}');
begin
  if p_via = 'app' then raise exception 'bad_via'; end if;
  if not exists (select 1 from api_keys where id = p_key and workspace_id = p_ws and revoked_at is null) then raise exception 'bad_key'; end if;
  if cardinality(fs) > 0 and (select count(*) from forms where workspace_id = p_ws and id = any(fs)) <> cardinality(fs) then raise exception 'form_not_found'; end if;
  perform pg_advisory_xact_lock(hashtextextended('webhooks:' || p_ws::text, 0));
  if (select count(*) from webhook_endpoints where workspace_id = p_ws and via <> 'app') >= 200 then raise exception 'too_many'; end if;
  insert into webhook_endpoints (workspace_id, host, sealed, secret_hint, events, forms, description, active, via, api_key_id)
  values (p_ws, p_host, p_sealed, p_hint, p_events, fs, nullif(left(coalesce(p_description, ''), 120), ''), true, p_via, p_key)
  returning id into rid;
  return rid;
end;
$$;

-- Remove an app's hook: on its unsubscribe, or when its address answers 410 Gone.
create or replace function public.api_hook_remove(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  delete from webhook_endpoints where id = p_id and workspace_id = p_ws and via <> 'app';
  return found;
end;
$$;

-- A revoked key's hooks go with it.
create or replace function public.api_keys_revoked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    delete from webhook_endpoints where api_key_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists api_keys_revoked on public.api_keys;
create trigger api_keys_revoked after update of revoked_at on public.api_keys for each row execute function public.api_keys_revoked();

-- The last few events of a kind, for an app's sample step and for Find fill. Fills come back as hook_fill rows
-- (the server builds their body); bookings and routing results as their bodies.
create or replace function public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  n int := least(greatest(coalesce(p_limit, 3), 1), 100);
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if p_event = 'form.submitted' then
    return coalesce((
      select jsonb_agg(hook_fill(x.id) order by x.created_at desc) from (
        select s.id, s.created_at from submissions s
        left join contacts c on c.id = s.contact_id
        where s.workspace_id = p_ws and not s.spam and not s.test and not s.over_cap and (p_form is null or s.form_id = p_form)
          and (em is null or c.email_clean = em)
        order by s.created_at desc limit n
      ) x), '[]');
  elsif p_event = 'lead.routed' then
    return coalesce((
      select jsonb_agg(webhook_routed_body(e.id, e.workspace_id, e.contact_id, e.kind, e.data, e.at) order by e.at desc) from (
        select * from contact_events where workspace_id = p_ws and kind in ('lead.routed', 'lead.unassigned') and at > now() - interval '90 days'
        order by at desc limit n
      ) e), '[]');
  elsif p_event in ('meeting.booked', 'meeting.rescheduled', 'meeting.canceled', 'meeting.held', 'meeting.no_show') then
    return coalesce((
      select jsonb_agg(webhook_meeting_body(x.meeting_id, p_event, x.id, x.at, x.detail) order by x.at desc) from (
        select me.* from meeting_events me join meetings m on m.id = me.meeting_id
        where m.workspace_id = p_ws
          and me.kind = case p_event when 'meeting.booked' then 'booked' when 'meeting.rescheduled' then 'moved' when 'meeting.canceled' then 'canceled'
                                     when 'meeting.held' then 'held' else 'no_show' end
          and (em is null or lower(m.guest_email) = em)
        order by me.id desc limit n
      ) x), '[]');
  end if;
  raise exception 'bad_event';
end;
$$;

-- Add a contact to a live workflow from an app (POST /api/v1/workflows/<id>/contacts). Same rules as by hand.
create or replace function public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
  n int;
begin
  select * into w from workflows where id = p_workflow and workspace_id = p_ws;
  if w.id is null then raise exception 'workflow_not_found'; end if;
  if w.status <> 'live' then raise exception 'workflow_not_live'; end if;
  insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key, at_step)
  select w.workspace_id, w.id, w.live_version, c.id, 'api:' || c.id || ':' || to_char(now(), 'YYYY-MM-DD'), null
  from contacts c where c.workspace_id = p_ws and c.id = p_contact and c.deleted_at is null and workflow_may_start(w.id, c.id)
  on conflict (workflow_id, key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Signing in -----------------------------------------------------------------------------------------------------

create table if not exists public.oauth_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client text not null check (client in ('zapier', 'make', 'activepieces')),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  redirect_uri text not null check (length(redirect_uri) <= 2000),
  challenge text check (length(challenge) <= 128),
  expires_at timestamptz not null,
  used_at timestamptz,
  key_id uuid references public.api_keys (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists oauth_codes_created on public.oauth_codes (created_at);
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_codes from anon, authenticated;

create or replace function public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  delete from oauth_codes where created_at < now() - interval '1 day';
  insert into oauth_codes (code_hash, client, workspace_id, user_id, redirect_uri, challenge, expires_at)
  values (p_hash, p_client, p_ws, p_user, p_redirect, nullif(p_challenge, ''), now() + interval '10 minutes');
end;
$$;

/*
 * Use a code once: { ok, workspace_id, user_id, redirect_uri, challenge }. A code used a second time revokes the
 * key it made and answers { replay: true }; an old or unknown one answers null.
 */
create or replace function public.oauth_code_use(p_hash text, p_client text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c oauth_codes%rowtype;
begin
  select * into c from oauth_codes where code_hash = p_hash and client = p_client for update;
  if c.code_hash is null then return null; end if;
  if c.used_at is not null then
    update api_keys set revoked_at = now() where id = c.key_id and revoked_at is null;
    return jsonb_build_object('replay', true);
  end if;
  update oauth_codes set used_at = now() where code_hash = p_hash;
  if c.expires_at < now() then return null; end if;
  return jsonb_build_object('ok', true, 'workspace_id', c.workspace_id, 'user_id', c.user_id, 'redirect_uri', c.redirect_uri, 'challenge', c.challenge);
end;
$$;

-- The key a code turned into, named after the app. The person must still be in the workspace.
create or replace function public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  c oauth_codes%rowtype;
  kid uuid;
begin
  select * into c from oauth_codes where code_hash = p_hash for update;
  if c.code_hash is null or c.used_at is null or c.key_id is not null then raise exception 'bad_code'; end if;
  if not exists (select 1 from workspace_members where workspace_id = c.workspace_id and user_id = c.user_id) then raise exception 'not_member'; end if;
  if (select count(*) from api_keys where workspace_id = c.workspace_id and revoked_at is null) >= 20 then raise exception 'too_many_keys'; end if;
  insert into api_keys (workspace_id, name, prefix, key_hash, created_by) values (c.workspace_id, left(p_name, 60), p_prefix, p_key_hash, c.user_id)
  returning id into kid;
  update oauth_codes set key_id = kid where code_hash = p_hash;
  return kid;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'hook_fill(uuid)', 'webhook_routed_body(uuid, uuid, uuid, text, jsonb, timestamptz)', 'submissions_webhooks()', 'contact_events_webhooks()',
    'webhook_take(uuid)', 'webhook_done(uuid, text, int, text)', 'webhooks_list(uuid)', 'webhook_save(uuid, uuid, text, text, text, text[], text, boolean, uuid)',
    'api_hook_add(uuid, uuid, text, text, text, text, text[], uuid[], text)', 'api_hook_remove(uuid, uuid)', 'api_keys_revoked()',
    'api_recent(uuid, text, uuid, text, int)', 'api_workflow_enter(uuid, uuid, uuid)',
    'oauth_code_add(text, text, uuid, uuid, text, text)', 'oauth_code_use(text, text)', 'oauth_key_make(text, text, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
