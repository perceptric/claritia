-- claritia: functions. Built from the running database. Unused objects were removed in the move (see README.md).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- function: activity_candidates(uuid, integer)
CREATE FUNCTION public.activity_candidates(p_source uuid, p_limit integer DEFAULT 200) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with s as (select * from sources where id = p_source)
  select coalesce(jsonb_agg(x order by x->>'at', x->>'id'), '[]') from (
    select jsonb_build_object(
      'id', e.id, 'kind', e.kind, 'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'contact_id', e.contact_id,
      'external_id', l.external_id, 'data', e.data,
      'subject', (select em.subject from emails em where em.id = nullif(e.data->>'email_id', '')::uuid and em.workspace_id = e.workspace_id)) x
    from s join contact_events e on e.workspace_id = s.workspace_id and e.kind = any(activity_kinds()) and e.at > now() - interval '3 days'
    join source_links l on l.source_id = s.id and l.object = 'contact' and l.local_id = e.contact_id and l.deleted_at is null
    where not exists (select 1 from activity_out a where a.source_id = s.id and a.event_id = e.id)
    order by e.at, e.id
    limit least(greatest(p_limit, 1), 500)
  ) y;
$$;

ALTER FUNCTION public.activity_candidates(p_source uuid, p_limit integer) OWNER TO postgres;

-- function: activity_claim(uuid, jsonb)
CREATE FUNCTION public.activity_claim(p_source uuid, p_events jsonb) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  out uuid[];
begin
  select workspace_id into ws from sources where id = p_source;
  if ws is null then return '{}'; end if;
  update activity_out set status = 'unknown', error = 'The worker stopped mid-write; not sent again in case it went out'
  where source_id = p_source and status = 'sending' and claimed_at < now() - interval '10 minutes';
  with ins as (
    insert into activity_out (workspace_id, source_id, event_id, kind, contact_id)
    select ws, p_source, r.id, r.kind, r.contact_id from jsonb_to_recordset(p_events) r(id uuid, kind text, contact_id uuid)
    on conflict (source_id, event_id) do nothing
    returning event_id
  )
  select coalesce(array_agg(event_id), '{}') into out from ins;
  return out;
end;
$$;

ALTER FUNCTION public.activity_claim(p_source uuid, p_events jsonb) OWNER TO postgres;

-- function: activity_done(uuid, jsonb)
CREATE FUNCTION public.activity_done(p_source uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update activity_out a set status = r.status, external_id = left(r.external_id, 200), error = left(r.error, 500)
  from jsonb_to_recordset(p_rows) r(id uuid, status text, external_id text, error text)
  where a.source_id = p_source and a.event_id = r.id and a.status = 'sending' and r.status in ('sent', 'failed', 'unknown');
  insert into sync_log (workspace_id, source_id, direction, object, local_id, external_id, action, fields, error)
  select a.workspace_id, a.source_id, 'out', 'activity', a.contact_id, left(a.external_id, 200),
         case when r.status = 'sent' then 'create' else 'error' end, array[a.kind], left(r.error, 1000)
  from jsonb_to_recordset(p_rows) r(id uuid, status text, external_id text, error text)
  join activity_out a on a.source_id = p_source and a.event_id = r.id;
  update sources set activity_at = now() where id = p_source;
end;
$$;

ALTER FUNCTION public.activity_done(p_source uuid, p_rows jsonb) OWNER TO postgres;

-- function: activity_kinds()
CREATE FUNCTION public.activity_kinds() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    AS $$ select array['email.sent', 'email.clicked', 'email.unsubscribed', 'form.submitted'] $$;

ALTER FUNCTION public.activity_kinds() OWNER TO postgres;

-- function: ai_cache_get(uuid, text, text)
CREATE FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select output from ai_cache where workspace_id = p_ws and kind = p_kind and key = p_key;
$$;

ALTER FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) OWNER TO postgres;

-- function: ai_cache_hit(uuid, text, text)
CREATE FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  out jsonb;
begin
  select output into out from ai_cache where workspace_id = p_ws and kind = p_kind and key = p_key;
  if out is not null and out <> 'null'::jsonb then
    perform ai_call_log(p_ws, p_kind, 'cache', '{}', 0, true);
  end if;
  return out;
end;
$$;

ALTER FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) OWNER TO postgres;

-- function: ai_cache_put(uuid, text, text, jsonb, text, integer, integer)
CREATE FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into ai_cache (workspace_id, kind, key, output, model, input_tokens, output_tokens)
  values (p_ws, p_kind, p_key, p_output, p_model, coalesce(p_in, 0), coalesce(p_out, 0))
  on conflict (workspace_id, kind, key) do nothing;
$$;

ALTER FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) OWNER TO postgres;

-- function: ai_cache_store(uuid, text, text, jsonb, text, jsonb, numeric, boolean)
CREATE FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform ai_call_log(p_ws, p_kind, p_model, coalesce(p_usage, '{}'), coalesce(p_cost, 0), false);
  if coalesce(p_keep, true) then
    perform ai_cache_put(p_ws, p_kind, p_key, p_output, p_model, coalesce((p_usage->>'input')::int, 0), coalesce((p_usage->>'output')::int, 0));
  end if;
end;
$$;

ALTER FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) OWNER TO postgres;

-- function: ai_call_log(uuid, text, text, jsonb, numeric, boolean)
CREATE FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into ai_calls (workspace_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd, cached)
  values (p_ws, p_kind, left(p_model, 60), coalesce((p_usage->>'input')::int, 0), coalesce((p_usage->>'output')::int, 0),
          coalesce((p_usage->>'cache_read')::int, 0), coalesce((p_usage->>'cache_write')::int, 0), coalesce((p_usage->>'searches')::int, 0),
          coalesce(p_cost, 0), coalesce(p_cached, false));
$$;

ALTER FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) OWNER TO postgres;

-- function: ai_credit_give(uuid, integer)
CREATE FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update plan_usage set ai_credits = greatest(0, ai_credits - greatest(coalesce(p_n, 0), 0))
  where workspace_id = p_ws and month = plan_month();
$$;

ALTER FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) OWNER TO postgres;

-- function: ai_credit_take(uuid, integer)
CREATE FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cap int;
  got int;
begin
  if coalesce(p_n, 0) <= 0 then return true; end if;
  cap := (plan_caps(workspace_plan(p_ws))).ai_credits;
  insert into plan_usage (workspace_id, month) values (p_ws, plan_month()) on conflict do nothing;
  update plan_usage set ai_credits = ai_credits + p_n
  where workspace_id = p_ws and month = plan_month() and ai_credits + p_n <= cap
  returning ai_credits into got;
  return got is not null;
end;
$$;

ALTER FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) OWNER TO postgres;

-- function: alerts_on(uuid, text)
CREATE FUNCTION public.alerts_on(p_project uuid, p_kind text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from alert_settings
    where project_id = p_project
      and (slack_sealed is not null or cardinality(emails) > 0)
      and case when p_kind = 'failure' then on_failure else on_heal end
  );
$$;

ALTER FUNCTION public.alerts_on(p_project uuid, p_kind text) OWNER TO postgres;

-- function: alerts_send()
CREATE FUNCTION public.alerts_send() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  url text;
  secret text;
begin
  select value into url from app_config where key = 'alerts_url';
  select value into secret from app_config where key = 'github_sync_secret';
  if coalesce(url, '') = '' or to_regproc('net.http_post') is null then
    return;
  end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2)'
  using url, jsonb_build_object('content-type', 'application/json', 'x-claritia-sync', secret);
end;
$_$;

ALTER FUNCTION public.alerts_send() OWNER TO postgres;

-- function: api_hook_add(uuid, uuid, text, text, text, text, text[], uuid[], text)
CREATE FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) OWNER TO postgres;

-- function: api_hook_remove(uuid, uuid)
CREATE FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from webhook_endpoints where id = p_id and workspace_id = p_ws and via <> 'app';
  return found;
end;
$$;

ALTER FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: api_key_auth(text)
CREATE FUNCTION public.api_key_auth(p_hash text) RETURNS TABLE(key_id uuid, workspace_id uuid, created_by uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k api_keys;
begin
  select * into k from api_keys where key_hash = p_hash and revoked_at is null;
  if k.id is null then
    return;
  end if;
  if k.last_used_at is null or k.last_used_at < now() - interval '1 minute' then
    update api_keys set last_used_at = now() where id = k.id;
  end if;
  return query select k.id, k.workspace_id, k.created_by;
end;
$$;

ALTER FUNCTION public.api_key_auth(p_hash text) OWNER TO postgres;

-- function: api_keys_revoked()
CREATE FUNCTION public.api_keys_revoked() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.revoked_at is not null and old.revoked_at is null then
    delete from webhook_endpoints where api_key_id = new.id;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.api_keys_revoked() OWNER TO postgres;

-- function: api_recent(uuid, text, uuid, text, integer)
CREATE FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) OWNER TO postgres;

-- function: api_start_runs(uuid, uuid, uuid, uuid[])
CREATE FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) RETURNS TABLE(run_id uuid, test_id uuid, test_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k api_keys;
  e environments;
  t tests;
  u record;
  busy int;
  wanted int;
  rid uuid;
begin
  select * into k from api_keys where id = p_key and revoked_at is null;
  if k.id is null then
    raise exception 'This API key was revoked';
  end if;
  if not exists (select 1 from projects where id = p_project and projects.workspace_id = k.workspace_id) then
    raise exception 'Project not found';
  end if;
  select * into e from environments where id = p_env and project_id = p_project;
  if e.id is null then
    raise exception 'Environment not found';
  end if;
  select count(*) into wanted from tests where id = any (p_tests) and project_id = p_project;
  if wanted <> coalesce(cardinality(p_tests), 0) or wanted = 0 then
    raise exception 'Test not found';
  end if;
  if exists (select 1 from tests where id = any (p_tests) and jsonb_array_length(coalesce(steps, '[]')) = 0) then
    raise exception 'Add a step to every test first';
  end if;
  select * into u from workspace_usage(k.workspace_id);
  if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
    raise exception 'This month''s % cloud minutes are used up. Upgrade in Settings to keep running tests.', u.minutes_limit;
  end if;
  select count(*) into busy from runs where runs.workspace_id = k.workspace_id and status in ('queued', 'running') and trigger = 'api';
  if busy + wanted > 50 then
    raise exception '% runs from API keys are already waiting or running in this workspace. Up to 50 can wait at once.', busy;
  end if;

  for t in select * from tests where id = any (p_tests) order by use_case, name loop
    rid := queue_run(t, e, 'api', k.created_by);
    update runs set api_key_id = k.id where id = rid;
    run_id := rid;
    test_id := t.id;
    test_name := t.name;
    return next;
  end loop;
end;
$$;

ALTER FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) OWNER TO postgres;

-- function: api_start_runs(uuid, uuid, uuid, uuid[], text, text)
CREATE FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) RETURNS TABLE(run_id uuid, test_id uuid, test_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k api_keys;
  e environments;
  t tests;
  u record;
  busy int;
  wanted int;
  rid uuid;
begin
  if p_trigger not in ('api', 'mcp') then
    raise exception 'Unknown trigger';
  end if;
  select * into k from api_keys where id = p_key and revoked_at is null;
  if k.id is null then
    raise exception 'This API key was revoked';
  end if;
  if not exists (select 1 from projects where id = p_project and projects.workspace_id = k.workspace_id) then
    raise exception 'Project not found';
  end if;
  select * into e from environments where id = p_env and project_id = p_project;
  if e.id is null then
    raise exception 'Environment not found';
  end if;
  if nullif(trim(p_base_url), '') is not null then
    if trim(p_base_url) !~ '^https?://[^\s/]+' then
      raise exception 'Not a web address: %', p_base_url;
    end if;
    e.base_url := trim(p_base_url);
  end if;
  select count(*) into wanted from tests where id = any (p_tests) and project_id = p_project;
  if wanted <> coalesce(cardinality(p_tests), 0) or wanted = 0 then
    raise exception 'Test not found';
  end if;
  if exists (select 1 from tests where id = any (p_tests) and jsonb_array_length(coalesce(steps, '[]')) = 0) then
    raise exception 'Add a step to every test first';
  end if;
  select * into u from workspace_usage(k.workspace_id);
  if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
    raise exception 'This month''s % cloud minutes are used up. Upgrade in Settings to keep running tests.', u.minutes_limit;
  end if;
  select count(*) into busy from runs where runs.workspace_id = k.workspace_id and status in ('queued', 'running') and trigger in ('api', 'mcp');
  if busy + wanted > 50 then
    raise exception '% runs from API keys are already waiting or running in this workspace. Up to 50 can wait at once.', busy;
  end if;

  for t in select * from tests where id = any (p_tests) order by use_case, name loop
    rid := queue_run(t, e, p_trigger, k.created_by);
    update runs set api_key_id = k.id where id = rid;
    run_id := rid;
    test_id := t.id;
    test_name := t.name;
    return next;
  end loop;
end;
$$;

ALTER FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) OWNER TO postgres;

-- function: api_workflow_enter(uuid, uuid, uuid)
CREATE FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) OWNER TO postgres;

-- function: app_counts(uuid, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return jsonb_build_object(
    'review', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status in ('held', 'unassigned') and c.deleted_at is null),
    'meetings_today', (select count(*) from meetings m where m.workspace_id = p_ws and m.status in ('booked', 'held') and m.start_at >= p_day_from and m.start_at < p_day_to),
    'calendars', (select count(*) from (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = auth.uid() limit 1) x),
    'types', (select count(*) from (select 1 from meeting_types t where t.workspace_id = p_ws limit 1) x),
    'live_forms', (select count(*) from (select 1 from forms f where f.workspace_id = p_ws and f.status = 'live' limit 1) x),
    'routing', coalesce((select r.live_version is not null and r.live_version > 0 from routers r where r.workspace_id = p_ws), false)
               or exists (select 1 from routing_policies p where p.workspace_id = p_ws and p.active_version is not null and p.archived_at is null),
    'members', (select count(*) from (select 1 from workspace_members w where w.workspace_id = p_ws limit 2) x),
    'invites', (select count(*) from (select 1 from invites i where i.workspace_id = p_ws limit 1) x),
    'sources', (select count(*) from (select 1 from sources s where s.workspace_id = p_ws limit 1) x),
    'no_calendar', (select count(*) from workspace_members w
                     where w.workspace_id = p_ws
                       and not exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status = 'ok')),
    'routing_draft', coalesce((select r.draft is not null from routers r where r.workspace_id = p_ws), false),
    'routing_paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false),
    'routing_action', router_action_count(p_ws)
  );
end;
$$;

ALTER FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) OWNER TO postgres;

-- function: app_start(uuid)
CREATE FUNCTION public.app_start(p_ws uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_first uuid := ensure_workspace();
  v_joined uuid;
  v_ws uuid;
  out jsonb;
begin
  select i.workspace_id into v_joined
  from invites i join auth.users u on lower(u.email) = lower(i.email)
  where u.id = auth.uid() and i.accepted_at = now()
  order by i.accepted_at desc limit 1;
  v_ws := case
    when v_joined is not null then v_joined
    when p_ws is not null and exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = auth.uid()) then p_ws
    else v_first end;
  select jsonb_build_object(
      'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'named', w.named, 'features', to_jsonb(coalesce(w.features, '{}'::text[]))),
      'role', m.role,
      'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'role', xm.role) order by lower(x.name), x.id), '[]')
                     from workspace_members xm join workspaces x on x.id = xm.workspace_id where xm.user_id = auth.uid()))
    into out
  from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid()
  where w.id = v_ws;
  if out is null then raise exception 'Workspace not found'; end if;
  return out;
end;
$$;

ALTER FUNCTION public.app_start(p_ws uuid) OWNER TO postgres;

-- function: availability_save(uuid, uuid, text, jsonb, jsonb)
CREATE FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into availability (workspace_id, user_id, tz, weekly, overrides, updated_at)
  values (p_ws, p_user, p_tz, p_weekly, coalesce(p_overrides, '[]'), now())
  on conflict (workspace_id, user_id) do update set tz = excluded.tz, weekly = excluded.weekly, overrides = excluded.overrides, updated_at = now();
end;
$$;

ALTER FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) OWNER TO postgres;

-- function: billing_plan_changed()
CREATE FUNCTION public.billing_plan_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if NEW.plan <> 'free' and (TG_OP = 'INSERT' or OLD.plan is distinct from NEW.plan) then
    update submissions set over_cap = false where workspace_id = NEW.workspace_id and over_cap;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.billing_plan_changed() OWNER TO postgres;

-- function: blocks_touch()
CREATE FUNCTION public.blocks_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;

ALTER FUNCTION public.blocks_touch() OWNER TO postgres;

-- function: book_contact(uuid, text)
CREATE FUNCTION public.book_contact(p_ws uuid, p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from contacts where workspace_id = p_ws and (email_clean = lower(trim(p_email)) or lower(email) = lower(trim(p_email))) order by created_at limit 1;
$$;

ALTER FUNCTION public.book_contact(p_ws uuid, p_email text) OWNER TO postgres;

-- function: book_kit(uuid, uuid)
CREATE FUNCTION public.book_kit(p_ws uuid, p_form uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = p_form and f.workspace_id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from workspaces w join brand_kits k on k.id = w.brand_kit_id where w.id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from brand_kits k where k.workspace_id = p_ws order by k.created_at desc limit 1),
    jsonb_build_object('tokens', '{}'::jsonb, 'logo_url', null, 'design', '{}'::jsonb)
  );
$$;

ALTER FUNCTION public.book_kit(p_ws uuid, p_form uuid) OWNER TO postgres;

-- function: book_link(text, uuid)
CREATE FUNCTION public.book_link(p_hash text DEFAULT NULL::text, p_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select jsonb_build_object(
    'link', jsonb_build_object('id', l.id, 'workspace_id', l.workspace_id, 'kind', l.kind, 'type_id', l.type_id, 'owner_user_id', l.owner_user_id, 'title', l.title,
                               'offered', l.offered, 'length_min', l.length_min, 'location', l.location, 'used', l.used_at is not null, 'closed', l.closed_at is not null
                                 or (l.expires_at is not null and l.expires_at < now()), 'meeting_id', l.meeting_id),
    'type', (select to_jsonb(t) from meeting_types t where t.id = l.type_id and t.active),
    'ws', book_ws(l.workspace_id),
    'owner', (select jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url)
              from booking_profiles p where p.workspace_id = l.workspace_id and p.user_id = l.owner_user_id),
    'profiles', book_profiles(l.workspace_id, array[l.owner_user_id] || coalesce((select array_agg((h->>'user_id')::uuid) from meeting_types t, jsonb_array_elements(t.hosts) h
                                                                                  where t.id = l.type_id and h->>'user_id' ~ '^[0-9a-f-]{36}$'), '{}')),
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('start', s, 'n', n) order by s), '[]')
              from (select (x #>> '{}')::timestamptz s, count(*)::int n from poll_votes v, jsonb_array_elements(v.picks) x where v.link_id = l.id group by 1) c),
    'voters', case when p_id is null then to_jsonb((select count(*)::int from poll_votes v where v.link_id = l.id))
                   else (select coalesce(jsonb_agg(jsonb_build_object('email', v.email, 'name', v.name, 'picks', v.picks) order by v.at), '[]') from poll_votes v where v.link_id = l.id) end
  )
  from meeting_links l
  where (p_hash is not null and l.token_hash = p_hash) or (p_hash is null and l.id = p_id);
$_$;

ALTER FUNCTION public.book_link(p_hash text, p_id uuid) OWNER TO postgres;

-- function: book_meeting(text, uuid)
CREATE FUNCTION public.book_meeting(p_hash text DEFAULT NULL::text, p_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'meeting', jsonb_build_object('id', m.id, 'workspace_id', m.workspace_id, 'type_id', m.type_id, 'link_id', m.link_id, 'hosts', m.hosts, 'guest_email', m.guest_email,
                                  'guest_name', m.guest_name, 'guest_tz', m.guest_tz, 'start_at', m.start_at, 'end_at', m.end_at, 'status', m.status, 'source', m.source,
                                  'location', m.location, 'payment', m.payment, 'cancel_reason', m.cancel_reason, 'created_at', m.created_at,
                                  'holds', meeting_holds(m)),
    'type', (select to_jsonb(t) from meeting_types t where t.id = m.type_id),
    'link', (select jsonb_build_object('kind', l.kind, 'title', l.title, 'length_min', l.length_min) from meeting_links l where l.id = m.link_id),
    'ws', book_ws(m.workspace_id),
    'profiles', book_profiles(m.workspace_id, m.hosts)
  )
  from meetings m
  where (p_hash is not null and m.token_hash = p_hash) or (p_hash is null and m.id = p_id);
$$;

ALTER FUNCTION public.book_meeting(p_hash text, p_id uuid) OWNER TO postgres;

-- function: book_page(text, text, uuid, text)
CREATE FUNCTION public.book_page(p_ws text, p_slug text DEFAULT NULL::text, p_form uuid DEFAULT NULL::uuid, p_handle text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  h jsonb;
  t jsonb;
  w text := p_ws;
  s text := p_slug;
begin
  if p_handle is not null then
    h := booking_resolve(p_handle);
    if h is null then return null; end if;
    w := h->>'ws';
    s := coalesce(p_slug, h->>'person');
  end if;
  if w is null then return null; end if;
  t := book_target(w, s, p_form);
  if t is null then return null; end if;
  return t || jsonb_build_object('look', booking_look((t->'ws'->>'id')::uuid, nullif(t->'profile'->>'user_id', '')::uuid), 'handle', h);
end;
$$;

ALTER FUNCTION public.book_page(p_ws text, p_slug text, p_form uuid, p_handle text) OWNER TO postgres;

-- function: book_profiles(uuid, uuid[])
CREATE FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url) order by p.name), '[]')
  from booking_profiles p where p.workspace_id = p_ws and p.user_id = any(p_users);
$$;

ALTER FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) OWNER TO postgres;

-- function: book_target(text, text, uuid)
CREATE FUNCTION public.book_target(p_ws text, p_slug text DEFAULT NULL::text, p_form uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  w workspaces%rowtype;
  t meeting_types%rowtype;
  p booking_profiles%rowtype;
  types jsonb;
  users uuid[];
begin
  select * into w from workspaces where booking_slug = lower(p_ws);
  if w.id is null then return null; end if;
  if p_slug is not null then
    select * into t from meeting_types where workspace_id = w.id and slug = lower(p_slug) and active;
    if t.id is null then
      select * into p from booking_profiles where workspace_id = w.id and slug = lower(p_slug);
      if p.user_id is null then return null; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') into types
  from meeting_types x
  where x.workspace_id = w.id and x.active and not x.secret and t.id is null
    and case when p.user_id is not null
             then x.owner_user_id = p.user_id or (x.owner_user_id is null and x.kind in ('one', 'group') and x.hosts->0->>'user_id' = p.user_id::text)
             else x.owner_user_id is null end;
  select array_agg(distinct (h->>'user_id')::uuid) into users
  from (select jsonb_array_elements(case when t.id is null then '[]'::jsonb else t.hosts end) h
        union all select jsonb_array_elements(y->'hosts') from jsonb_array_elements(types) y) z
  where h->>'user_id' ~ '^[0-9a-f-]{36}$';
  if p.user_id is not null then users := coalesce(users, '{}') || p.user_id; end if;
  return jsonb_build_object(
    'ws', jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.booking_slug),
    'kit', book_kit(w.id, p_form),
    'turnstile', book_turnstile(w.id),
    'pay', exists (select 1 from payment_accounts a where a.workspace_id = w.id and a.ready),
    'type', case when t.id is null then null else to_jsonb(t) end,
    'profile', case when p.user_id is null then null else jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url) end,
    'types', types,
    'profiles', book_profiles(w.id, coalesce(users, '{}'))
  );
end;
$_$;

ALTER FUNCTION public.book_target(p_ws text, p_slug text, p_form uuid) OWNER TO postgres;

-- function: book_turnstile(uuid)
CREATE FUNCTION public.book_turnstile(p_ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from forms f join form_versions v on v.form_id = f.id and v.version = f.version
    where f.workspace_id = p_ws and f.status = 'live' and v.body->'spam'->>'turnstile' = 'true'
  );
$$;

ALTER FUNCTION public.book_turnstile(p_ws uuid) OWNER TO postgres;

-- function: book_ws(uuid)
CREATE FUNCTION public.book_ws(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.booking_slug, 'kit', book_kit(w.id), 'turnstile', book_turnstile(w.id),
                            'pay', (select jsonb_build_object('account', a.stripe_account, 'ready', a.ready) from payment_accounts a where a.workspace_id = w.id))
  from workspaces w where w.id = p_ws;
$$;

ALTER FUNCTION public.book_ws(p_ws uuid) OWNER TO postgres;

-- function: booking_handle_free(text, uuid, uuid)
CREATE FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select not booking_reserved(lower(p_handle))
     and not exists (select 1 from workspaces w where w.booking_slug = lower(p_handle) and (p_user is not null or w.id <> p_ws))
     and not exists (select 1 from booking_profiles b where b.handle = lower(p_handle) and not (b.workspace_id = p_ws and b.user_id is not distinct from p_user));
$$;

ALTER FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: booking_handle_set(uuid, uuid, text)
CREATE FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;

ALTER FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) OWNER TO postgres;

-- function: booking_look(uuid, uuid)
CREATE FUNCTION public.booking_look(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when p_user is null then (select booking_page from workspaces where id = p_ws)
              else coalesce((select page from booking_profiles where workspace_id = p_ws and user_id = p_user), '{}') end;
$$;

ALTER FUNCTION public.booking_look(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: booking_look_save(uuid, uuid, jsonb)
CREATE FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_user is null then
    update workspaces set booking_page = coalesce(p_look, '{}') where id = p_ws;
  else
    update booking_profiles set page = coalesce(p_look, '{}') where workspace_id = p_ws and user_id = p_user;
    if not found then raise exception 'no_profile'; end if;
  end if;
end;
$$;

ALTER FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) OWNER TO postgres;

-- function: booking_page_info(uuid, uuid)
CREATE FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'team', (select booking_slug from workspaces where id = p_ws),
    'team_page', (select booking_page from workspaces where id = p_ws),
    'profile', (select jsonb_build_object('slug', slug, 'name', name, 'headline', headline, 'photo_url', photo_url, 'handle', handle, 'page', page)
                from booking_profiles where workspace_id = p_ws and user_id = p_user),
    'types', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug, 'kind', t.kind, 'secret', t.secret,
                                          'team', t.owner_user_id is null and t.kind not in ('one', 'group'),
                                          'mine', t.owner_user_id = p_user or (t.owner_user_id is null and t.kind in ('one', 'group') and t.hosts->0->>'user_id' = p_user::text),
                                          'length', t.settings->'lengths'->0) order by t.name)
      from meeting_types t where t.workspace_id = p_ws and t.active), '[]')
  );
$$;

ALTER FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: booking_profile_save(uuid, uuid, text, text, text, text)
CREATE FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into booking_profiles (workspace_id, user_id, slug, name, headline, photo_url, updated_at)
  values (p_ws, p_user, p_slug, p_name, nullif(p_headline, ''), nullif(p_photo, ''), now())
  on conflict (workspace_id, user_id) do update set slug = excluded.slug, name = excluded.name, headline = excluded.headline, photo_url = excluded.photo_url, updated_at = now();
exception when unique_violation then
  raise exception 'slug_taken';
end;
$$;

ALTER FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) OWNER TO postgres;

-- function: booking_record(uuid, jsonb)
CREATE FUNCTION public.booking_record(p_source uuid, p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  ws uuid;
  r record;
  sub submissions%rowtype;
  how text;
  n int := 0;
  bid uuid;
begin
  select workspace_id into ws from sources where id = p_source;
  if ws is null then
    return 0;
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(tool text, id text, start text, tracking text, email text) loop
    sub := null;
    how := 'none';
    if r.tracking ~ '^clr_[0-9a-f-]{36}$' then
      select * into sub from submissions where id = substr(r.tracking, 5)::uuid and workspace_id = ws;
      if sub.id is not null then how := 'tracking'; end if;
    end if;
    if sub.id is null and coalesce(r.email, '') <> '' then
      select s.* into sub from submissions s join contacts c on c.id = s.contact_id
      where s.workspace_id = ws and not s.spam and s.created_at > now() - interval '7 days'
        and (c.email_clean = lower(trim(r.email)) or lower(c.email) = lower(trim(r.email)))
      order by s.created_at desc limit 1;
      if sub.id is not null then how := 'email'; end if;
    end if;
    insert into form_bookings (workspace_id, submission_id, contact_id, source_id, tool, external_id, start_at, linked)
    values (ws, sub.id, sub.contact_id, p_source, left(r.tool, 40), left(r.id, 300), try_timestamptz(r.start), how)
    on conflict (workspace_id, tool, external_id) do nothing
    returning id into bid;
    if bid is null then continue; end if;
    n := n + 1;
    if how = 'tracking' and sub.contact_id is not null then
      if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
        perform contact_events_roll();
      end if;
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (ws, sub.contact_id, 'meeting.booked', jsonb_strip_nulls(jsonb_build_object('tool', r.tool, 'start', r.start, 'submission_id', sub.id, 'form_id', sub.form_id)), left(r.tool, 40));
    end if;
  end loop;
  return n;
end;
$_$;

ALTER FUNCTION public.booking_record(p_source uuid, p_rows jsonb) OWNER TO postgres;

-- function: booking_reserved(text)
CREATE FUNCTION public.booking_reserved(p_handle text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_handle = any(array['m', 'p', 'l', 't', 'api', 'app', 'admin', 'book', 'booking', 'embed', 'new', 'help',
                              'support', 'settings', 'claritia', 'www', 'team', 'login', 'signup', 'pay', 'webhooks']);
$$;

ALTER FUNCTION public.booking_reserved(p_handle text) OWNER TO postgres;

-- function: booking_resolve(text)
CREATE FUNCTION public.booking_resolve(p_handle text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select jsonb_build_object('ws', w.booking_slug, 'person', b.slug, 'handle', b.handle)
     from booking_profiles b join workspaces w on w.id = b.workspace_id
     where b.handle = lower(p_handle) and w.booking_slug is not null),
    (select jsonb_build_object('ws', w.booking_slug, 'person', null, 'handle', w.booking_slug)
     from workspaces w where w.booking_slug = lower(p_handle))
  );
$$;

ALTER FUNCTION public.booking_resolve(p_handle text) OWNER TO postgres;

-- function: booking_slug_ensure(uuid)
CREATE FUNCTION public.booking_slug_ensure(p_ws uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.booking_slug_ensure(p_ws uuid) OWNER TO postgres;

-- function: brand_kit_delete(uuid)
CREATE FUNCTION public.brand_kit_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id;
  if k.id is null or not is_member(k.workspace_id) then
    raise exception 'Brand kit not found';
  end if;
  delete from brand_kits where id = p_id;
end;
$$;

ALTER FUNCTION public.brand_kit_delete(p_id uuid) OWNER TO postgres;

-- function: brand_kit_design_publish(uuid)
CREATE FUNCTION public.brand_kit_design_publish(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id for update;
  if k.id is null or not is_member(k.workspace_id) then
    raise exception 'Design system not found';
  end if;
  update brand_kits set design_live = design, design_published_at = now() where id = p_id;
end;
$$;

ALTER FUNCTION public.brand_kit_design_publish(p_id uuid) OWNER TO postgres;

-- function: brand_kit_design_save(uuid, uuid, jsonb, integer)
CREATE FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id for update;
  if k.id is null or not exists (select 1 from workspace_members where workspace_id = k.workspace_id and user_id = p_user) then
    raise exception 'Design system not found';
  end if;
  if k.design_rev <> p_rev then
    raise exception 'Changed elsewhere';
  end if;
  update brand_kits set design = p_design, design_rev = design_rev + 1, updated_at = now() where id = p_id;
  return k.design_rev + 1;
end;
$$;

ALTER FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) OWNER TO postgres;

-- function: brand_kit_quick(uuid, jsonb, text)
CREATE FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  if jsonb_typeof(p_tokens) <> 'object' or length(p_tokens::text) > 8000 then return false; end if;
  update brand_kits set
    tokens = p_tokens,
    logo_url = coalesce(logo_url, left(p_logo_url, 1000)),
    scan_status = 'done',
    quick_at = now(),
    scanned_at = coalesce(scanned_at, now()),
    updated_at = now()
  where id = p_kit and (scanned_at is null or quick_at is not null) and (tokens = '{}'::jsonb or quick_at is not null);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

ALTER FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) OWNER TO postgres;

-- function: brand_kit_skin(uuid, jsonb)
CREATE FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update brand_kits set skin = p_skin, updated_at = now() where id = p_kit;
$$;

ALTER FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) OWNER TO postgres;

-- function: brand_scan_design(uuid, jsonb, text, jsonb, text, text)
CREATE FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k brand_kits%rowtype;
  d jsonb;
  have jsonb;
  added jsonb;
begin
  select * into k from brand_kits where id = p_kit for update;
  if k.id is null then return; end if;
  d := coalesce(k.design, '{}');
  have := coalesce(d->'variables', '[]');
  select coalesce(jsonb_agg(v), '[]') into added from jsonb_array_elements(coalesce(p_vars, '[]')) v
   where not exists (select 1 from jsonb_array_elements(have) e where e->>'id' = v->>'id' or lower(e->>'name') = lower(v->>'name'));
  d := jsonb_set(d, '{variables}', have || added);
  if p_heading is not null and d #> '{email,globals,heading,base,font-size}' is null then
    d := jsonb_set(d, '{email}', coalesce(d->'email', '{}'));
    d := jsonb_set(d, '{email,globals}', coalesce(d #> '{email,globals}', '{}'));
    d := jsonb_set(d, '{email,globals,heading}', coalesce(d #> '{email,globals,heading}', '{}'));
    d := jsonb_set(d, '{email,globals,heading,base}', coalesce(d #> '{email,globals,heading,base}', '{}') || jsonb_build_object('font-size', p_heading));
  end if;
  update brand_kits set
    social = coalesce(p_social, social),
    address = coalesce(nullif(trim(p_address), ''), address),
    brief = coalesce(nullif(trim(p_brief), ''), brief),
    design = d,
    design_rev = case when d is distinct from k.design then design_rev + 1 else design_rev end,
    updated_at = now()
  where id = p_kit;
end;
$$;

ALTER FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) OWNER TO postgres;

-- function: brand_scan_finish(uuid, jsonb, text, text[], jsonb, text)
CREATE FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update brand_kits set
    tokens = case when p_error is null then p_tokens else tokens end,
    logo_url = case when p_error is null then coalesce(p_logo_url, logo_url) else logo_url end,
    notes = case when p_error is null then coalesce(p_notes, '{}') else notes end,
    site_forms = case when p_error is null then coalesce(p_site_forms, '[]') else site_forms end,
    scan_status = case when p_error is null or tokens <> '{}'::jsonb then 'done' else 'failed' end,
    scan_error = left(p_error, 500),
    quick_at = case when p_error is null then null else quick_at end,
    scanned_at = case when p_error is null then now() else scanned_at end,
    updated_at = now()
  where id = p_kit;
$$;

ALTER FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) OWNER TO postgres;

-- function: brand_scan_start(uuid, uuid, text, uuid, uuid)
CREATE FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid DEFAULT NULL::uuid, p_form uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  kid uuid := p_kit;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Workspace not found';
  end if;
  if p_url !~ '^https?://[^\s/]+' or length(p_url) > 1000 then
    raise exception 'Enter the site''s address';
  end if;
  if kid is null then
    insert into brand_kits (workspace_id, name, source_url, scan_status)
    values (p_ws, left(substring(p_url from '^https?://(?:www\.)?([^/:?#]+)'), 120), p_url, 'scanning')
    returning id into kid;
  else
    update brand_kits set source_url = p_url, scan_status = 'scanning', scan_error = null, updated_at = now() where id = kid and workspace_id = p_ws;
    if not found then
      raise exception 'Brand kit not found';
    end if;
  end if;
  update workspaces set brand_kit_id = kid where id = p_ws and brand_kit_id is null;
  if p_form is not null then
    update forms set brand_kit_id = kid, updated_at = now()
    where id = p_form and workspace_id = p_ws and brand_kit_id is null;
  end if;
  perform enqueue_job(p_ws, 'brand_scan', kid::text, jsonb_build_object('kit_id', kid, 'url', p_url), 0, 3);
  perform wake_runner();
  return kid;
end;
$$;

ALTER FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid) OWNER TO postgres;

-- function: busy_replace(uuid, text, timestamp with time zone, timestamp with time zone, jsonb)
CREATE FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  delete from busy_blocks where account_id = p_account and calendar_id = p_calendar and start_at < p_to and end_at > p_from;
  insert into busy_blocks (account_id, calendar_id, start_at, end_at, ooo)
  select p_account, p_calendar, (r->>'start')::timestamptz, (r->>'end')::timestamptz, coalesce((r->>'ooo')::boolean, false)
  from jsonb_array_elements(p_rows) r
  where (r->>'end')::timestamptz > (r->>'start')::timestamptz;
  get diagnostics n = row_count;
  update calendar_accounts set refreshed_at = now() where id = p_account;
  return n;
end;
$$;

ALTER FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) OWNER TO postgres;

-- function: calendar_account(uuid)
CREATE FUNCTION public.calendar_account(p_account uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'id', a.id, 'workspace_id', a.workspace_id, 'user_id', a.user_id, 'provider', a.provider, 'account_email', a.account_email,
    'status', a.status, 'channels', a.channels, 'watch_due', a.watch_due, 'sealed', t.sealed,
    'lists', coalesce((select jsonb_agg(jsonb_build_object('calendar_id', l.calendar_id, 'name', l.name, 'busy', l.busy, 'write', l.write) order by l.calendar_id)
                       from calendar_lists l where l.account_id = a.id), '[]'))
  from calendar_accounts a left join calendar_tokens t on t.account_id = a.id
  where a.id = p_account;
$$;

ALTER FUNCTION public.calendar_account(p_account uuid) OWNER TO postgres;

-- function: calendar_busy_save(uuid, timestamp with time zone, timestamp with time zone, jsonb)
CREATE FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k text;
  v jsonb;
  n int := 0;
begin
  for k, v in select * from jsonb_each(case when jsonb_typeof(p_rows) = 'object' then p_rows else '{}' end) loop
    if jsonb_typeof(v) = 'array' then
      n := n + busy_replace(p_account, k, p_from, p_to, v);
    end if;
  end loop;
  delete from busy_blocks b where b.account_id = p_account
    and (b.end_at < now() - interval '1 day'
         or not exists (select 1 from calendar_lists l where l.account_id = p_account and l.calendar_id = b.calendar_id and l.busy));
  update calendar_accounts set refreshed_at = now() where id = p_account;
  return n;
end;
$$;

ALTER FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) OWNER TO postgres;

-- function: calendar_channels_save(uuid, jsonb, timestamp with time zone)
CREATE FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update calendar_accounts set channels = coalesce(p_channels, '{}'), watch_due = p_watch_due where id = p_account;
$$;

ALTER FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) OWNER TO postgres;

-- function: calendar_connect(uuid, uuid, text, text, text, jsonb)
CREATE FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  aid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into calendar_accounts (workspace_id, user_id, provider, account_email)
  values (p_ws, p_user, p_provider, lower(trim(p_email)))
  on conflict (workspace_id, user_id, provider, account_email)
  do update set status = 'ok', reconnect_at = null, reconnect_reason = null, watch_due = null
  returning id into aid;
  insert into calendar_tokens (account_id, sealed) values (aid, p_sealed)
  on conflict (account_id) do update set sealed = excluded.sealed, updated_at = now();
  perform calendar_lists_sync(aid, coalesce(p_calendars, '[]'));
  return aid;
end;
$$;

ALTER FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb) OWNER TO postgres;

-- function: calendar_disconnect(uuid)
CREATE FUNCTION public.calendar_disconnect(p_account uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from calendar_accounts where id = p_account;
$$;

ALTER FUNCTION public.calendar_disconnect(p_account uuid) OWNER TO postgres;

-- function: calendar_hook(uuid, text)
CREATE FUNCTION public.calendar_hook(p_account uuid, p_channel text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select a.workspace_id into ws from calendar_accounts a
  where a.id = p_account and a.status = 'ok' and exists (select 1 from jsonb_each(a.channels) c where c.value->>'id' = p_channel);
  if ws is null then return false; end if;
  perform enqueue_job(ws, 'calendar_refresh', p_account::text, jsonb_build_object('account', p_account), 5, 3);
  return true;
end;
$$;

ALTER FUNCTION public.calendar_hook(p_account uuid, p_channel text) OWNER TO postgres;

-- function: calendar_lists_save(uuid, jsonb)
CREATE FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a calendar_accounts%rowtype;
  w text;
begin
  select * into a from calendar_accounts where id = p_account;
  if a.id is null then raise exception 'not_found'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then return; end if;
  select r->>'id' into w from jsonb_array_elements(p_rows) r where coalesce((r->>'write')::boolean, false) limit 1;
  update calendar_lists l set busy = coalesce((r->>'busy')::boolean, l.busy),
                              write = coalesce((r->>'write')::boolean, l.write) and (w is null or l.calendar_id = w)
  from jsonb_array_elements(p_rows) r
  where l.account_id = p_account and l.calendar_id = r->>'id';
  if w is not null then
    update calendar_lists l set write = false
    from calendar_accounts x
    where x.id = l.account_id and x.workspace_id = a.workspace_id and x.user_id = a.user_id and l.write
      and not (l.account_id = p_account and l.calendar_id = w);
  end if;
  update calendar_accounts set watch_due = null where id = p_account;
end;
$$;

ALTER FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) OWNER TO postgres;

-- function: calendar_lists_sync(uuid, jsonb)
CREATE FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a calendar_accounts%rowtype;
  has_write boolean;
begin
  select * into a from calendar_accounts where id = p_account;
  if a.id is null or a.provider = 'zoom' then return; end if;
  -- An empty list can arrive as '{}' (node-pg sends an empty array as a Postgres array).
  if jsonb_typeof(p_calendars) is distinct from 'array' then p_calendars := '[]'; end if;
  delete from calendar_lists where account_id = p_account and calendar_id not in (select c->>'id' from jsonb_array_elements(p_calendars) c);
  has_write := exists (select 1 from calendar_lists l join calendar_accounts x on x.id = l.account_id
                       where x.workspace_id = a.workspace_id and x.user_id = a.user_id and l.write);
  insert into calendar_lists (account_id, calendar_id, name, busy, write)
  select p_account, left(c->>'id', 500), left(coalesce(nullif(c->>'name', ''), c->>'id'), 300),
         coalesce((c->>'primary')::boolean, false) or coalesce((c->>'own')::boolean, false),
         coalesce((c->>'primary')::boolean, false) and not has_write
  from jsonb_array_elements(p_calendars) c
  where coalesce(c->>'id', '') <> ''
  on conflict (account_id, calendar_id) do update set name = excluded.name;
end;
$$;

ALTER FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) OWNER TO postgres;

-- function: calendar_live_inputs(uuid, uuid[], timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'user_id', a.user_id, 'provider', a.provider, 'sealed', t.sealed,
    'calendars', (select jsonb_agg(l.calendar_id) from calendar_lists l where l.account_id = a.id and l.busy),
    'busy', case when a.provider = 'fake' then coalesce((select jsonb_agg(jsonb_build_array(b.start_at, b.end_at)) from busy_blocks b
                                                          join calendar_lists l on l.account_id = b.account_id and l.calendar_id = b.calendar_id and l.busy
                                                          where b.account_id = a.id and b.end_at > p_from and b.start_at < p_to), '[]') end
  )), '[]')
  from calendar_accounts a left join calendar_tokens t on t.account_id = a.id
  where a.workspace_id = p_ws and a.user_id = any(p_users) and a.status = 'ok' and a.provider <> 'zoom'
    and exists (select 1 from calendar_lists l where l.account_id = a.id and l.busy);
$$;

ALTER FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

-- function: calendar_reconnect(uuid, text)
CREATE FUNCTION public.calendar_reconnect(p_account uuid, p_reason text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a calendar_accounts%rowtype;
begin
  update calendar_accounts set status = 'reconnect', reconnect_at = now(), reconnect_reason = left(p_reason, 300)
  where id = p_account and status = 'ok'
  returning * into a;
  if a.id is null then return false; end if;
  perform enqueue_job(a.workspace_id, 'calendar_reconnect', a.id::text,
                      jsonb_build_object('account', a.id, 'user', a.user_id, 'provider', a.provider, 'email', a.account_email), 0, 5);
  return true;
end;
$$;

ALTER FUNCTION public.calendar_reconnect(p_account uuid, p_reason text) OWNER TO postgres;

-- function: calendar_reconnect_info(uuid)
CREATE FUNCTION public.calendar_reconnect_info(p_account uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a calendar_accounts%rowtype;
begin
  select * into a from calendar_accounts where id = p_account;
  if a.id is null then return null; end if;
  return jsonb_build_object(
    'account', jsonb_build_object('id', a.id, 'workspace_id', a.workspace_id, 'user_id', a.user_id, 'provider', a.provider,
                                  'account_email', a.account_email, 'status', a.status, 'reconnect_at', a.reconnect_at),
    'person', meeting_people(a.workspace_id, array[a.user_id])->0,
    'upcoming', (select count(*) from meetings m
                 where m.workspace_id = a.workspace_id and m.hosts @> array[a.user_id] and m.status = 'booked'
                   and m.start_at > now() and m.start_at < now() + interval '14 days'),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from workspaces w where w.id = a.workspace_id),
    'sending', meeting_sending(a.workspace_id));
end;
$$;

ALTER FUNCTION public.calendar_reconnect_info(p_account uuid) OWNER TO postgres;

-- function: calendar_token_save(uuid, text)
CREATE FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update calendar_tokens set sealed = p_sealed, updated_at = now() where account_id = p_account;
$$;

ALTER FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) OWNER TO postgres;

-- function: calendars_due()
CREATE FUNCTION public.calendars_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a int;
  b int;
  now_ms numeric := extract(epoch from now()) * 1000;
begin
  with due as (
    select x.id, x.workspace_id from calendar_accounts x
    where x.status = 'ok' and x.provider in ('google', 'microsoft')
      and (x.refreshed_at is null or x.refreshed_at < now() - interval '10 minutes')
      and (x.refreshed_at is null or x.refreshed_at < now() - interval '1 hour'
           or x.channels = '{}'::jsonb
           or exists (select 1 from calendar_lists l
                      where l.account_id = x.id and l.busy
                        and not (jsonb_typeof(x.channels->l.calendar_id->'expires') = 'number'
                                 and (x.channels->l.calendar_id->>'expires')::numeric > now_ms)))
      and not exists (select 1 from jobs j where j.kind = 'calendar_refresh' and j.workspace_id = x.workspace_id and j.key = x.id::text
                        and j.status in ('queued', 'running'))
    order by x.refreshed_at nulls first
    limit 5000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select d.workspace_id, 'calendar_refresh', d.id::text, jsonb_build_object('account', d.id), now(), 3, job_priority('calendar_refresh')
    from due d
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into a from ins;
  with due as (
    select x.id, x.workspace_id from calendar_accounts x
    where x.status = 'ok' and x.provider in ('google', 'microsoft') and (x.watch_due is null or x.watch_due < now())
      and not exists (select 1 from jobs j where j.kind = 'calendar_watch' and j.workspace_id = x.workspace_id and j.key = x.id::text
                        and j.status in ('queued', 'running'))
    limit 2000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select d.workspace_id, 'calendar_watch', d.id::text, jsonb_build_object('account', d.id), now(), 3, job_priority('calendar_watch')
    from due d
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into b from ins;
  if a > 0 then perform pg_notify('claritia_jobs', job_priority('calendar_refresh')::text); end if;
  if b > 0 then perform pg_notify('claritia_jobs', job_priority('calendar_watch')::text); end if;
  return a + b;
end;
$$;

ALTER FUNCTION public.calendars_due() OWNER TO postgres;

-- function: cancel_invite(uuid)
CREATE FUNCTION public.cancel_invite(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from invites where id = p_id;
  if ws is null or not is_owner(ws) then
    raise exception 'Invite not found';
  end if;
  delete from invites where id = p_id;
end;
$$;

ALTER FUNCTION public.cancel_invite(p_id uuid) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

-- function: claim_exploration(text)
CREATE FUNCTION public.claim_exploration(p_worker text) RETURNS SETOF public.explorations
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  x explorations;
begin
  update explorations set status = 'error', error = 'The runner stopped three times on this exploration.', finished_at = now()
  where status = 'running' and locked_at < now() - interval '10 minutes' and attempts >= 3;
  select * into x from explorations
  where status = 'queued' or (status = 'running' and locked_at < now() - interval '10 minutes')
  order by created_at
  limit 1
  for update skip locked;
  if x.id is null then
    return;
  end if;
  update explorations set status = 'running', locked_by = p_worker, locked_at = now(), attempts = attempts + 1, started_at = coalesce(started_at, now())
  where id = x.id
  returning * into x;
  return next x;
end;
$$;

ALTER FUNCTION public.claim_exploration(p_worker text) OWNER TO postgres;

-- function: claim_job(text[], text, integer, integer)
CREATE FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer DEFAULT 300, p_limit integer DEFAULT 1) RETURNS SETOF public.jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(p_worker, '') = '' then
    raise exception 'A worker name is needed';
  end if;

  update jobs j set
    status = case when j.attempts >= j.max_attempts then 'failed' else 'done' end,
    error = case when j.attempts >= j.max_attempts then 'The worker stopped answering' else 'Replaced by a newer job for the same key' end,
    finished_at = now(), locked_by = null, locked_until = null
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'running' and x.locked_until < now()
      and (x.attempts >= x.max_attempts or (x.key <> '' and job_key_waiting(x.workspace_id, x.kind, x.key)))
    for update skip locked
  );
  update jobs j set status = 'queued', run_after = now(), locked_by = null, locked_until = null,
    error = 'The worker stopped answering; trying again'
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'running' and x.locked_until < now()
      and (x.key = '' or not job_key_waiting(x.workspace_id, x.kind, x.key))
    for update skip locked
  );

  return query
  update jobs j set status = 'running', locked_by = p_worker, attempts = j.attempts + 1,
    locked_until = now() + make_interval(secs => greatest(coalesce(p_lease_s, 300), 10))
  where j.id in (
    select x.id from jobs x
    where x.kind = any(p_kinds) and x.status = 'queued' and x.run_after <= now()
      and (x.key = '' or not job_key_running(x.workspace_id, x.kind, x.key))
    order by x.run_after
    limit greatest(least(coalesce(p_limit, 1), 100), 1)
    for update skip locked
  )
  returning j.*;
end;
$$;

ALTER FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer) OWNER TO postgres;

-- function: claim_job_lane(text[], text, integer, integer, integer)
CREATE FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer DEFAULT 300, p_limit integer DEFAULT 1, p_max_priority integer DEFAULT 2) RETURNS SETOF public.jobs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  want int := greatest(least(coalesce(p_limit, 1), 100), 1);
  got int := 0;
  k int;
  lane int;
begin
  if coalesce(p_worker, '') = '' then
    raise exception 'A worker name is needed';
  end if;
  for lane in 0 .. least(greatest(coalesce(p_max_priority, 2), 0), 2) loop
    return query
    update jobs j set status = 'running', locked_by = p_worker, attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(coalesce(p_lease_s, 300), 10))
    where j.id in (
      select x.id from jobs x
      where x.status = 'queued' and x.priority = lane and x.run_after <= now() and x.kind = any(p_kinds)
        and (x.key = '' or not job_key_running(x.workspace_id, x.kind, x.key))
      order by x.run_after
      limit want - got
      for update skip locked
    )
    returning j.*;
    get diagnostics k = row_count;
    got := got + k;
    exit when got >= want;
  end loop;
end;
$$;

ALTER FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer) OWNER TO postgres;

-- function: claim_plan(text)
CREATE FUNCTION public.claim_plan(p_worker text) RETURNS SETOF public.plans
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p plans;
begin
  update plans set status = 'error', error = 'The runner stopped three times on this plan.', finished_at = now()
  where status = 'running' and locked_at < now() - interval '10 minutes' and attempts >= 3;
  select * into p from plans
  where status = 'queued' or (status = 'running' and locked_at < now() - interval '10 minutes')
  order by created_at
  limit 1
  for update skip locked;
  if p.id is null then
    return;
  end if;
  update plans set status = 'running', locked_by = p_worker, locked_at = now(), attempts = attempts + 1, started_at = coalesce(started_at, now())
  where id = p.id
  returning * into p;
  return next p;
end;
$$;

ALTER FUNCTION public.claim_plan(p_worker text) OWNER TO postgres;

-- function: claim_run(text)
CREATE FUNCTION public.claim_run(p_worker text) RETURNS SETOF public.runs
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r runs;
begin
  update runs set status = 'error', error = 'The runner stopped three times on this run.', finished_at = now()
  where status = 'running' and locked_at < now() - interval '10 minutes' and attempts >= 3;

  select * into r from runs
  where status = 'queued' or (status = 'running' and locked_at < now() - interval '10 minutes')
  order by created_at
  limit 1
  for update skip locked;
  if r.id is null then
    return;
  end if;
  update runs set status = 'running', locked_by = p_worker, locked_at = now(), attempts = attempts + 1, started_at = coalesce(started_at, now()), live_path = null
  where id = r.id
  returning * into r;
  update run_steps set status = 'pending', error = null, started_ms = null, duration_ms = null, retried = false, written = false, healed = false, code = null where run_id = r.id;
  return next r;
end;
$$;

ALTER FUNCTION public.claim_run(p_worker text) OWNER TO postgres;

-- function: companies_follow_account()
CREATE FUNCTION public.companies_follow_account() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update companies set account_id = new.account_id, updated_at = now()
  where workspace_id = new.workspace_id and domain = new.domain and account_id is null;
  return null;
end;
$$;

ALTER FUNCTION public.companies_follow_account() OWNER TO postgres;

-- function: companies_upsert(uuid, text, jsonb)
CREATE FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  classes jsonb := field_classes(p_ws, 'company');
  r record;
  cid uuid;
  c companies%rowtype;
  m jsonb;
  ids jsonb := '[]';
  changed int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send up to 2,000 companies at a time';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(domain text, name text, industry text, size text, country text, fields jsonb, source_id text) loop
    cid := null;
    r.domain := nullif(lower(trim(r.domain)), '');
    if r.domain is not null and r.domain !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then r.domain := null; end if;
    r.name := nullif(trim(left(r.name, 200)), '');
    if r.domain is null and r.name is null then
      ids := ids || 'null'::jsonb;
      continue;
    end if;
    if r.domain is not null then
      insert into companies (workspace_id, domain, name, account_id, source_ids)
      values (p_ws, r.domain, r.name, (select ad.account_id from account_domains ad where ad.workspace_id = p_ws and ad.domain = r.domain),
              case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end)
      on conflict (workspace_id, domain) where domain is not null do nothing
      returning id into cid;
      if cid is null then select id into cid from companies where workspace_id = p_ws and domain = r.domain; end if;
    else
      insert into companies (workspace_id, name, source_ids) values (p_ws, r.name, case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end)
      on conflict (workspace_id, lower(name)) where domain is null do nothing
      returning id into cid;
      if cid is null then select id into cid from companies where workspace_id = p_ws and domain is null and lower(name) = lower(r.name); end if;
    end if;
    select * into c from companies where id = cid for update;
    m := merge_values(classes, p_source, null,
      jsonb_strip_nulls(jsonb_build_object('name', c.name, 'industry', c.industry, 'size', c.size, 'country', c.country))
        || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(c.fields) e(k, v)), '{}'),
      c.field_sources,
      jsonb_strip_nulls(jsonb_build_object('name', r.name, 'industry', nullif(trim(left(r.industry, 120)), ''), 'size', nullif(trim(left(r.size, 40)), ''),
        'country', case when upper(trim(r.country)) ~ '^[A-Z]{2}$' then upper(trim(r.country)) end))
        || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(coalesce(r.fields, '{}')) e(k, v) where v <> 'null' and v <> '""'), '{}'));
    update companies set
      name = coalesce(m->'vals'->>'name', name),
      industry = m->'vals'->>'industry',
      size = m->'vals'->>'size',
      country = m->'vals'->>'country',
      fields = coalesce((select jsonb_object_agg(substr(k, 3), v) from jsonb_each(m->'vals') e(k, v) where k like 'f.%'), '{}'),
      field_sources = m->'src',
      source_ids = case when r.source_id is null then source_ids else source_ids || jsonb_build_object(p_source, r.source_id) end,
      updated_at = case when jsonb_array_length(m->'changes') > 0 then now() else updated_at end
    where id = cid;
    if jsonb_array_length(m->'changes') > 0 then
      changed := changed + 1;
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
      select p_ws, 'company', cid, x->>'key', x->'old', x->'new', x->'old_source', p_source from jsonb_array_elements(m->'changes') x;
    end if;
    ids := ids || to_jsonb(cid);
  end loop;
  return jsonb_build_object('ids', ids, 'changed', changed);
end;
$_$;

ALTER FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) OWNER TO postgres;

-- function: complaints_check(uuid)
CREATE FUNCTION public.complaints_check(p_ws uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  sent int;
  bad int;
  day_bad int;
begin
  select count(*) into sent from email_messages where workspace_id = p_ws and sent_at > now() - interval '7 days';
  select count(*) into bad from email_events where workspace_id = p_ws and kind = 'complained' and at > now() - interval '7 days';
  select count(*) into day_bad from email_events where workspace_id = p_ws and kind = 'complained' and at > now() - interval '1 day';
  if (sent >= 500 and bad * 1000 >= sent * 2) or day_bad >= 10 then
    update send_settings set paused = true, paused_at = now(),
      paused_reason = format('Spam complaints reached %s of %s sent in 7 days', bad, sent)
    where workspace_id = p_ws and not paused;
    if found then
      insert into audit_log (workspace_id, action, target, data) values (p_ws, 'sending.paused', p_ws::text, jsonb_build_object('complaints', bad, 'sent', sent));
    end if;
    return true;
  end if;
  return false;
end;
$$;

ALTER FUNCTION public.complaints_check(p_ws uuid) OWNER TO postgres;

-- function: contact_events_roll()
CREATE FUNCTION public.contact_events_roll() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  m date;
  name text;
  oldest date := (date_trunc('month', now()) - interval '13 months')::date;
  r record;
begin
  for i in -13..3 loop
    m := (date_trunc('month', now()) + make_interval(months => i))::date;
    name := 'contact_events_' || to_char(m, 'YYYY_MM');
    if to_regclass('partitions.' || name) is null then
      execute format('create table partitions.%I partition of public.contact_events for values from (%L) to (%L)', name, m, (m + interval '1 month')::date);
      execute format('alter table partitions.%I enable row level security', name);
      execute format('revoke all on partitions.%I from public, anon, authenticated', name);
    end if;
  end loop;
  for r in
    select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_namespace n on n.oid = c.relnamespace
    where i.inhparent = 'public.contact_events'::regclass and n.nspname = 'partitions' and c.relname ~ '^contact_events_[0-9]{4}_[0-9]{2}$'
  loop
    if to_date(right(r.relname, 7), 'YYYY_MM') < oldest then
      execute format('drop table partitions.%I', r.relname);
    end if;
  end loop;
end;
$_$;

ALTER FUNCTION public.contact_events_roll() OWNER TO postgres;

-- function: contact_events_webhooks()
CREATE FUNCTION public.contact_events_webhooks() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.contact_events_webhooks() OWNER TO postgres;

-- function: contact_force(uuid, uuid, text, jsonb)
CREATE FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  c contacts%rowtype;
  old jsonb;
  src jsonb;
  k text;
  v jsonb;
  n int := 0;
begin
  select * into c from contacts where id = p_id and workspace_id = p_ws and deleted_at is null for update;
  if c.id is null then
    return 0;
  end if;
  old := contact_vals(c);
  src := coalesce(c.field_sources, '{}');
  for k, v in select key, value from jsonb_each(coalesce(p_vals, '{}')) loop
    continue when v is null or v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
    continue when old->k is not distinct from v;
    case k
      when 'email' then update contacts set email = v #>> '{}' where id = p_id;
      when 'first_name' then update contacts set first_name = v #>> '{}' where id = p_id;
      when 'last_name' then update contacts set last_name = v #>> '{}' where id = p_id;
      when 'title' then update contacts set title = v #>> '{}' where id = p_id;
      when 'phone' then update contacts set phone = v #>> '{}' where id = p_id;
      when 'country' then update contacts set country = v #>> '{}' where id = p_id;
      when 'region' then update contacts set region = v #>> '{}' where id = p_id;
      when 'company' then update contacts set company_id = (v #>> '{}')::uuid where id = p_id;
      else
        continue when k !~ '^f\.[a-z][a-z0-9_]{0,39}$';
        update contacts set fields = coalesce(fields, '{}') || jsonb_build_object(substr(k, 3), v) where id = p_id;
    end case;
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
    values (p_ws, 'contact', p_id, k, old->k, v, src->k, p_source);
    src := src || jsonb_build_object(k, jsonb_build_object('s', p_source, 'at', now()));
    n := n + 1;
  end loop;
  if n > 0 then
    update contacts set field_sources = src, updated_at = now() where id = p_id;
  end if;
  return n;
end;
$_$;

ALTER FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) OWNER TO postgres;

-- function: contact_ids_by_email(uuid, text[])
CREATE FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_object_agg(email_clean, id), '{}') from contacts where workspace_id = p_ws and deleted_at is null and email_clean = any(p_emails);
$$;

ALTER FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) OWNER TO postgres;

-- function: contact_update(uuid, text, jsonb, uuid)
CREATE FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c contacts%rowtype;
  co uuid;
  k text;
  v_old jsonb;
  v_new jsonb;
  f fields%rowtype;
  v jsonb;
  custom jsonb := '{}';
begin
  select * into c from contacts where id = p_id and deleted_at is null for update;
  if c.id is null then
    raise exception 'Contact not found';
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Nothing to change';
  end if;
  for k in select jsonb_object_keys(p_values) loop
    if k not in ('email', 'email_clean', 'email_class', 'first_name', 'last_name', 'title', 'phone', 'country', 'region', 'timezone', 'lifecycle',
                 'lead_status', 'company_domain', 'company_name', 'owner', 'fields') then
      raise exception 'Unknown field %', k;
    end if;
  end loop;
  if p_values ? 'email_clean' then
    if coalesce(p_values->>'email_clean', '') = '' then
      raise exception 'A contact needs an email';
    end if;
    if exists (select 1 from contacts where workspace_id = c.workspace_id and email_clean = p_values->>'email_clean' and id <> c.id and deleted_at is null) then
      raise exception 'Another contact has this email';
    end if;
  end if;
  if p_values ? 'owner' and nullif(p_values->>'owner', '') is not null
     and not exists (select 1 from workspace_members where workspace_id = c.workspace_id and user_id::text = p_values->>'owner') then
    raise exception 'Owner: pick a teammate';
  end if;
  if p_values ? 'lifecycle' and nullif(p_values->>'lifecycle', '') is not null
     and p_values->>'lifecycle' not in ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist', 'other') then
    raise exception 'Pick a lifecycle stage';
  end if;
  -- Custom fields, checked against their types and required switch.
  for k, v in select * from jsonb_each(coalesce(p_values->'fields', '{}')) loop
    select * into f from fields where workspace_id = c.workspace_id and object = 'contact' and key = k;
    if f.id is null then
      raise exception 'Unknown field %', k;
    end if;
    v := field_value(c.workspace_id, f.type, f.options, f.label, v);
    if v is null and f.required then
      raise exception '% is required', f.label;
    end if;
    custom := custom || jsonb_build_object(k, coalesce(v, 'null'::jsonb));
  end loop;
  if p_values ? 'company_domain' or p_values ? 'company_name' then
    if nullif(p_values->>'company_domain', '') is not null then
      insert into companies (workspace_id, domain, name, account_id)
      values (c.workspace_id, p_values->>'company_domain', nullif(p_values->>'company_name', ''),
              (select account_id from account_domains where workspace_id = c.workspace_id and domain = p_values->>'company_domain'))
      on conflict (workspace_id, domain) where domain is not null do update set name = coalesce(companies.name, excluded.name)
      returning id into co;
    elsif nullif(p_values->>'company_name', '') is not null then
      select id into co from companies where workspace_id = c.workspace_id and domain is null and lower(name) = lower(p_values->>'company_name');
      if co is null then
        insert into companies (workspace_id, name) values (c.workspace_id, p_values->>'company_name') returning id into co;
      end if;
    end if;
  end if;

  v_old := contact_vals(c);
  update contacts set
    email = case when p_values ? 'email' then p_values->>'email' else email end,
    email_clean = case when p_values ? 'email_clean' then p_values->>'email_clean' else email_clean end,
    email_class = case when p_values ? 'email_class' then p_values->>'email_class' else email_class end,
    first_name = case when p_values ? 'first_name' then nullif(trim(p_values->>'first_name'), '') else first_name end,
    last_name = case when p_values ? 'last_name' then nullif(trim(p_values->>'last_name'), '') else last_name end,
    title = case when p_values ? 'title' then nullif(trim(p_values->>'title'), '') else title end,
    phone = case when p_values ? 'phone' then nullif(trim(p_values->>'phone'), '') else phone end,
    country = case when p_values ? 'country' then nullif(upper(trim(p_values->>'country')), '') else country end,
    region = case when p_values ? 'region' then nullif(trim(p_values->>'region'), '') else region end,
    timezone = case when p_values ? 'timezone' then nullif(trim(p_values->>'timezone'), '') else timezone end,
    lifecycle = case when p_values ? 'lifecycle' then nullif(p_values->>'lifecycle', '') else lifecycle end,
    lead_status = case when p_values ? 'lead_status' then nullif(trim(p_values->>'lead_status'), '') else lead_status end,
    owner_user_id = case when p_values ? 'owner' then nullif(p_values->>'owner', '')::uuid else owner_user_id end,
    company_id = case when p_values ? 'company_domain' or p_values ? 'company_name' then co else company_id end,
    fields = jsonb_strip_nulls(fields || custom),
    person_id = case when p_values ? 'email_clean' then person_for_email(c.workspace_id, p_values->>'email_clean') else person_id end,
    updated_at = now()
  where id = c.id
  returning contact_vals(contacts) into v_new;

  -- Changed keys: history and sources.
  insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
  select c.workspace_id, 'contact', c.id, x.kk, v_old->x.kk, v_new->x.kk, c.field_sources->x.kk, p_source, p_by
  from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk)
  where (v_old->x.kk) is distinct from (v_new->x.kk);
  update contacts set field_sources = field_sources
    || coalesce((select jsonb_object_agg(x.kk, jsonb_strip_nulls(jsonb_build_object('s', p_source, 'at', now(), 'by', p_by)))
                 from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk)
                 where (v_old->x.kk) is distinct from (v_new->x.kk) and v_new ? x.kk), '{}')
    - array(select x.kk from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk) where not v_new ? x.kk)
  where id = c.id;
end;
$$;

ALTER FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid) OWNER TO postgres;

-- function: contact_vals(public.contacts)
CREATE FUNCTION public.contact_vals(c public.contacts) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select jsonb_strip_nulls(jsonb_build_object(
    'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'title', c.title, 'phone', c.phone, 'country', c.country,
    'region', c.region, 'timezone', c.timezone, 'lifecycle', c.lifecycle, 'lead_status', c.lead_status, 'company', c.company_id::text,
    'owner', c.owner_user_id::text, 'seniority', c.seniority, 'department', c.department, 'linkedin_url', c.linkedin_url))
    || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(c.fields) e(k, v)), '{}');
$$;

ALTER FUNCTION public.contact_vals(c public.contacts) OWNER TO postgres;

-- function: contacts_band_event()
CREATE FUNCTION public.contacts_band_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.score_band is distinct from old.score_band and new.score_band is not null and new.deleted_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (new.workspace_id, new.id, 'lead.band', jsonb_build_object('from', old.score_band, 'to', new.score_band), 'score');
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.contacts_band_event() OWNER TO postgres;

-- function: contacts_crm_owner()
CREATE FUNCTION public.contacts_crm_owner() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  u uuid;
begin
  if new.owner_crm_id is distinct from old.owner_crm_id and new.owner_user_id is not distinct from old.owner_user_id and new.owner_crm_id is not null then
    u := router_owner_user(new.workspace_id, new.owner_crm_id);
    if u is not null and u is distinct from old.owner_user_id then
      new.owner_user_id := u;
      new.field_sources := coalesce(new.field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'crm', 'at', now()));
    end if;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.contacts_crm_owner() OWNER TO postgres;

-- function: contacts_delete(uuid, uuid[])
CREATE FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if cardinality(p_ids) > 10000 then
    raise exception 'Remove up to 10,000 contacts at a time';
  end if;
  update contacts set deleted_at = now(), updated_at = now() where workspace_id = p_ws and id = any(p_ids) and deleted_at is null;
  get diagnostics n = row_count;
  insert into audit_log (workspace_id, actor, action, data) values (p_ws, auth.uid(), 'contacts.delete', jsonb_build_object('count', n));
  return n;
end;
$$;

ALTER FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) OWNER TO postgres;

-- function: contacts_enrich_new()
CREATE FUNCTION public.contacts_enrich_new() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s enrich_settings%rowtype;
  src text := case when new.source in ('form', 'typeform', 'tally', 'jotform', 'fillout', 'formstack', 'webflow', 'framer', 'wordpress', 'wix') then 'form'
                   when new.source in ('calendly', 'chilipiper', 'calcom', 'savvycal', 'booking') then 'booking'
                   when new.source = 'api' then 'api' when new.source = 'manual' then 'manual'
                   when source_class(new.source) = 'crm' then 'crm' else 'import' end;
begin
  if new.email_class not in ('work', 'role') then return new; end if;
  select * into s from enrich_settings where workspace_id = new.workspace_id;
  if s.workspace_id is not null and (not s."on" or not src = any(s.sources)) then return new; end if;
  if s.workspace_id is null and src not in ('form', 'booking', 'api', 'manual') then return new; end if;
  perform enqueue_job(new.workspace_id, 'enrich_contact', new.id::text, jsonb_build_object('contact_id', new.id, 'trigger', 'new'), 2, 5);
  return new;
end;
$$;

ALTER FUNCTION public.contacts_enrich_new() OWNER TO postgres;

-- function: contacts_follow_identifier()
CREATE FUNCTION public.contacts_follow_identifier() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.kind = 'email' then
    update contacts set person_id = person_for_email(old.workspace_id, old.value_clean)
    where workspace_id = old.workspace_id and email_clean = old.value_clean and deleted_at is null
      and person_id is distinct from person_for_email(old.workspace_id, old.value_clean);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.kind = 'email' then
    update contacts set person_id = person_for_email(new.workspace_id, new.value_clean)
    where workspace_id = new.workspace_id and email_clean = new.value_clean and deleted_at is null
      and person_id is distinct from person_for_email(new.workspace_id, new.value_clean);
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.contacts_follow_identifier() OWNER TO postgres;

-- function: contacts_follow_merge()
CREATE FUNCTION public.contacts_follow_merge() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.merged_into is not null and new.merged_into is distinct from old.merged_into then
    update contacts set person_id = coalesce(person_for_email(workspace_id, email_clean), new.merged_into)
    where workspace_id = new.workspace_id and person_id = new.id;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.contacts_follow_merge() OWNER TO postgres;

-- function: contacts_list(uuid, jsonb, text, boolean, integer, integer)
CREATE FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb DEFAULT '[]'::jsonb, p_sort text DEFAULT 'updated_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select records_list(p_ws, 'contact', p_filters, p_sort, p_desc, p_limit, p_offset);
$$;

ALTER FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) OWNER TO postgres;

-- function: contacts_owner_crm_set(uuid, jsonb)
CREATE FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update contacts c set owner_crm_id = nullif(left(r.owner, 100), '')
  from jsonb_to_recordset(p_rows) r(id uuid, owner text)
  where c.id = r.id and c.workspace_id = p_ws and c.owner_crm_id is distinct from nullif(left(r.owner, 100), '');
$$;

ALTER FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) OWNER TO postgres;

-- function: contacts_owner_meeting_task()
CREATE FUNCTION public.contacts_owner_meeting_task() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m record;
  who text;
  tz text;
begin
  if new.owner_user_id is null or new.owner_user_id is not distinct from old.owner_user_id or coalesce(new.field_sources->'owner'->>'s', '') <> 'crm' then
    return null;
  end if;
  who := coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), new.email, 'this lead');
  tz := coalesce((select a.tz from availability a where a.workspace_id = new.workspace_id and a.user_id = new.owner_user_id), 'UTC');
  for m in
    select x.id, x.start_at, coalesce(t.name, 'meeting') as name from meetings x left join meeting_types t on t.id = x.type_id
    where x.workspace_id = new.workspace_id and x.contact_id = new.id and x.status = 'booked' and x.start_at > now() and not (new.owner_user_id = any(x.hosts))
    order by x.start_at limit 3
  loop
    insert into tasks (workspace_id, object, record_id, title, due, assignee)
    select new.workspace_id, 'contact', new.id, left(format('Take over %s''s %s on %s?', who, m.name, to_char(m.start_at at time zone tz, 'Dy, Mon FMDD')), 300),
           (m.start_at at time zone tz)::date, new.owner_user_id
    where not exists (select 1 from tasks k where k.workspace_id = new.workspace_id and k.object = 'contact' and k.record_id = new.id and k.assignee = new.owner_user_id
                        and not k.done and k.title like 'Take over %' and k.due = (m.start_at at time zone tz)::date);
  end loop;
  return null;
end;
$$;

ALTER FUNCTION public.contacts_owner_meeting_task() OWNER TO postgres;

-- function: contacts_score_touch()
CREATE FUNCTION public.contacts_score_touch() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.score_band is distinct from old.score_band or new.owner_crm_id is distinct from old.owner_crm_id then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.contacts_score_touch() OWNER TO postgres;

-- function: contacts_upsert(uuid, text, jsonb, uuid)
CREATE FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  result jsonb;
  classes jsonb := field_classes(p_ws, 'contact');
  own boolean := source_class(p_source) in ('manual', 'form');
  erased int := 0;
begin
  if p_source !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Unknown source %', p_source;
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send up to 2,000 contacts at a time';
  end if;
  if p_import is not null and not exists (select 1 from imports where id = p_import and workspace_id = p_ws and status = 'running') then
    raise exception 'Import not found';
  end if;

  create temp table if not exists _rows (
    n int, email text, email_clean text, email_class text, first_name text, last_name text, title text, phone text,
    country text, region text, timezone text, lifecycle text, lead_status text, company_domain text, company_name text,
    fields jsonb, basis text, source_id text, company_id uuid, contact_id uuid, created boolean, m jsonb
  ) on commit drop;
  truncate _rows;
  insert into _rows (n, email, email_clean, email_class, first_name, last_name, title, phone, country, region, timezone, lifecycle,
                     lead_status, company_domain, company_name, fields, basis, source_id)
  select distinct on (lower(trim(r.email_clean)))
         r.n, nullif(trim(r.email), ''), lower(trim(r.email_clean)), r.email_class, nullif(trim(r.first_name), ''), nullif(trim(r.last_name), ''),
         nullif(trim(r.title), ''), nullif(trim(r.phone), ''), nullif(upper(trim(r.country)), ''), nullif(trim(r.region), ''), nullif(trim(r.timezone), ''),
         nullif(trim(r.lifecycle), ''), nullif(trim(r.lead_status), ''), nullif(lower(trim(r.company_domain)), ''), nullif(trim(r.company_name), ''),
         coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(r.fields, '{}')) e(k, v) where v <> 'null' and v <> '""'), '{}'),
         nullif(r.basis, ''), nullif(r.source_id, '')
  from rows from (jsonb_to_recordset(p_rows) as (email text, email_clean text, email_class text, first_name text, last_name text, title text,
         phone text, country text, region text, timezone text, lifecycle text, lead_status text, company_domain text, company_name text,
         fields jsonb, basis text, source_id text)) with ordinality as r(email, email_clean, email_class, first_name, last_name, title, phone, country, region,
         timezone, lifecycle, lead_status, company_domain, company_name, fields, basis, source_id, n)
  where coalesce(trim(r.email_clean), '') <> ''
  order by lower(trim(r.email_clean)), r.n desc;

  if not own then
    delete from _rows r where exists (select 1 from erasures e where e.workspace_id = p_ws and e.value_hash = sha256(convert_to(r.email_clean, 'UTF8')));
    get diagnostics erased = row_count;
    -- A suppressed address gets no basis from a list or a sync; only the person can opt back in.
    update _rows r set basis = 'none'
    where r.basis is not null and exists (select 1 from suppressions s where s.workspace_id = p_ws and s.email_clean = r.email_clean);
  end if;

  -- Companies: by domain, or by name when there's no domain.
  insert into companies (workspace_id, domain, name, account_id)
  select distinct on (company_domain) p_ws, company_domain, company_name,
         (select ad.account_id from account_domains ad where ad.workspace_id = p_ws and ad.domain = r.company_domain)
  from _rows r where company_domain is not null
  order by company_domain, (company_name is null)
  on conflict (workspace_id, domain) where domain is not null
  do update set name = coalesce(companies.name, excluded.name), account_id = coalesce(companies.account_id, excluded.account_id), updated_at = now();
  insert into companies (workspace_id, name)
  select distinct on (lower(company_name)) p_ws, company_name from _rows where company_domain is null and company_name is not null
  on conflict (workspace_id, lower(name)) where domain is null do nothing;
  update _rows r set company_id = c.id from companies c where c.workspace_id = p_ws and r.company_domain is not null and c.domain = r.company_domain;
  update _rows r set company_id = c.id from companies c
  where c.workspace_id = p_ws and r.company_domain is null and r.company_name is not null and c.domain is null and lower(c.name) = lower(r.company_name);

  -- New contacts. A concurrent writer may take an email first; those rows fall through to the update below.
  with ins as (
    insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, title, phone, company_id, country, region, timezone,
                          lifecycle, lead_status, source, fields, person_id, import_id, source_ids, field_sources)
    select p_ws, r.email, r.email_clean, r.email_class, r.first_name, r.last_name, r.title, r.phone, r.company_id, r.country, r.region, r.timezone,
           r.lifecycle, r.lead_status, p_source, r.fields, person_for_email(p_ws, r.email_clean), p_import,
           case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end,
           (select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object('s', p_source, 'at', now(), 'i', p_import))), '{}')
            from jsonb_object_keys(jsonb_strip_nulls(jsonb_build_object('email', r.email, 'first_name', r.first_name, 'last_name', r.last_name,
              'title', r.title, 'phone', r.phone, 'country', r.country, 'region', r.region, 'timezone', r.timezone, 'lifecycle', r.lifecycle,
              'lead_status', r.lead_status, 'company', r.company_id::text))
              || coalesce((select jsonb_object_agg('f.' || fk, fv) from jsonb_each(r.fields) f(fk, fv)), '{}')) k)
    from _rows r
    where not exists (select 1 from contacts c where c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null)
    on conflict (workspace_id, email_clean) where deleted_at is null do nothing
    returning id, email_clean
  )
  update _rows r set contact_id = ins.id, created = true from ins where ins.email_clean = r.email_clean;

  -- Existing contacts: lock, then merge by field order.
  perform 1 from contacts c join _rows r on c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null
  where r.contact_id is null for update of c;
  update _rows r set contact_id = c.id, created = false,
         m = merge_values(classes, p_source, p_import, contact_vals(c), c.field_sources,
               jsonb_strip_nulls(jsonb_build_object('email', r.email, 'first_name', r.first_name, 'last_name', r.last_name, 'title', r.title,
                 'phone', r.phone, 'country', r.country, 'region', r.region, 'timezone', r.timezone, 'lifecycle', r.lifecycle,
                 'lead_status', r.lead_status, 'company', r.company_id::text))
               || coalesce((select jsonb_object_agg('f.' || fk, fv) from jsonb_each(r.fields) f(fk, fv)), '{}'))
  from contacts c
  where r.contact_id is null and c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null;

  update contacts c set
    email = coalesce(r.m->'vals'->>'email', c.email),
    email_class = coalesce(c.email_class, r.email_class),
    first_name = r.m->'vals'->>'first_name',
    last_name = r.m->'vals'->>'last_name',
    title = r.m->'vals'->>'title',
    phone = r.m->'vals'->>'phone',
    country = r.m->'vals'->>'country',
    region = r.m->'vals'->>'region',
    timezone = r.m->'vals'->>'timezone',
    lifecycle = r.m->'vals'->>'lifecycle',
    lead_status = r.m->'vals'->>'lead_status',
    company_id = (r.m->'vals'->>'company')::uuid,
    fields = coalesce((select jsonb_object_agg(substr(k, 3), v) from jsonb_each(r.m->'vals') e(k, v) where k like 'f.%'), '{}'),
    field_sources = r.m->'src',
    source_ids = case when r.source_id is null then c.source_ids else c.source_ids || jsonb_build_object(p_source, r.source_id) end,
    person_id = coalesce(c.person_id, person_for_email(p_ws, c.email_clean)),
    updated_at = case when jsonb_array_length(r.m->'changes') > 0 then now() else c.updated_at end
  from _rows r
  where c.id = r.contact_id and not r.created;

  insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, import_id)
  select p_ws, 'contact', r.contact_id, x->>'key', x->'old', x->'new', x->'old_source', p_source, p_import
  from _rows r cross join lateral jsonb_array_elements(r.m->'changes') x
  where not r.created;

  -- Consent: a new row only when the basis changes.
  insert into consents (workspace_id, contact_id, channel, basis, status, source, import_id)
  select p_ws, r.contact_id, 'email', r.basis, case when r.basis = 'none' then 'none' else 'granted' end, p_source, p_import
  from _rows r
  where r.contact_id is not null and r.basis in ('opt_in', 'soft_opt_in', 'legitimate_interest', 'none')
    and r.basis is distinct from (select c.basis from consents c where c.contact_id = r.contact_id and c.channel = 'email' order by c.at desc, c.id limit 1);

  -- The month's events table is made ahead every day; this covers a day the minute job didn't run.
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source, import_id)
  select p_ws, r.contact_id, 'contact.created', jsonb_strip_nulls(jsonb_build_object('import_id', p_import)), p_source, p_import from _rows r where r.created;

  select jsonb_build_object(
    'created', count(*) filter (where created),
    'updated', count(*) filter (where not created),
    'changed', count(*) filter (where not created and jsonb_array_length(m->'changes') > 0),
    'skipped_erased', erased,
    'ids', coalesce(jsonb_agg(contact_id order by n) filter (where contact_id is not null), '[]'::jsonb)
  ) into result from _rows;
  truncate _rows;
  return result;
end;
$_$;

ALTER FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) OWNER TO postgres;

-- function: contacts_where(uuid, jsonb)
CREATE FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select object_where(p_ws, 'contact', p_filters);
$$;

ALTER FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) OWNER TO postgres;

-- function: create_api_key(uuid, text, text, text)
CREATE FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  kid uuid;
begin
  if not is_member(p_workspace) then
    raise exception 'Workspace not found';
  end if;
  if (select count(*) from api_keys where workspace_id = p_workspace and revoked_at is null) >= 20 then
    raise exception 'A workspace can have 20 keys. Revoke one first.';
  end if;
  insert into api_keys (workspace_id, name, prefix, key_hash) values (p_workspace, trim(p_name), p_prefix, p_hash)
  returning id into kid;
  return kid;
end;
$$;

ALTER FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) OWNER TO postgres;

-- function: crm_seed(uuid)
CREATE FUNCTION public.crm_seed(p_ws uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into objects (workspace_id, key, label, plural, icon, system) values (p_ws, 'opportunity', 'Opportunity', 'Opportunities', 'dollar', true)
  on conflict (workspace_id, key) do update set system = true;
  insert into fields (workspace_id, object, key, label, type, options, config, position, system) values
    (p_ws, 'opportunity', 'amount', 'Amount', 'currency', '[]', '{"currency":"USD","decimals":0}', 1, true),
    (p_ws, 'opportunity', 'stage', 'Stage', 'select',
     '[{"value":"qualification","label":"Qualification","kind":"open"},{"value":"discovery","label":"Discovery","kind":"open"},
       {"value":"proposal","label":"Proposal","kind":"open"},{"value":"negotiation","label":"Negotiation","kind":"open"},
       {"value":"won","label":"Won","kind":"won"},{"value":"lost","label":"Lost","kind":"lost"}]', '{}', 2, true),
    (p_ws, 'opportunity', 'close_date', 'Close date', 'date', '[]', '{}', 3, true),
    (p_ws, 'opportunity', 'probability', 'Win chance', 'percent', '[]', '{}', 4, true),
    (p_ws, 'opportunity', 'company', 'Company', 'relation', '[]', '{"target":"company"}', 5, true),
    (p_ws, 'opportunity', 'contacts', 'Contacts', 'relation', '[]', '{"target":"contact","multiple":true}', 6, true),
    (p_ws, 'opportunity', 'owner', 'Owner', 'text', '[]', '{}', 7, true),
    (p_ws, 'opportunity', 'pipeline', 'Pipeline', 'text', '[]', '{}', 8, true),
    (p_ws, 'opportunity', 'next_step', 'Next step', 'text', '[]', '{}', 9, true),
    (p_ws, 'opportunity', 'crm_url', 'CRM link', 'url', '[]', '{}', 10, true)
  on conflict (workspace_id, object, key) do update set system = true;
end;
$$;

ALTER FUNCTION public.crm_seed(p_ws uuid) OWNER TO postgres;

-- function: decide_heal(uuid, text)
CREATE FUNCTION public.decide_heal(p_heal uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  h heals;
begin
  select * into h from heals where id = p_heal;
  if h.id is null or not is_member(h.workspace_id) then
    raise exception 'Fix not found';
  end if;
  if p_status not in ('approved', 'rejected', 'stale') then
    raise exception 'Unknown decision';
  end if;
  if h.status <> 'pending' then
    raise exception 'This fix was already %', h.status;
  end if;
  update heals set status = p_status, decided_by = auth.uid(), decided_at = now() where id = p_heal;
end;
$$;

ALTER FUNCTION public.decide_heal(p_heal uuid, p_status text) OWNER TO postgres;

-- function: deliveries_create_anyway(uuid[])
CREATE FUNCTION public.deliveries_create_anyway(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  update deliveries set allow_duplicate = true
  where id = any(p_ids) and status in ('failed', 'skipped') and is_member(workspace_id);
  return deliveries_replay(p_ids);
end;
$$;

ALTER FUNCTION public.deliveries_create_anyway(p_ids uuid[]) OWNER TO postgres;

-- function: deliveries_held(uuid, integer)
CREATE FUNCTION public.deliveries_held(p_destination uuid, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with picked as (
    select id from deliveries
    where destination_id = p_destination and status = 'held'
      and not exists (select 1 from form_destinations where id = p_destination and paused)
    order by created_at limit least(p_limit, 500)
    for update skip locked
  ), moved as (
    update deliveries d set status = 'queued', updated_at = now() from picked where d.id = picked.id returning d.id, d.created_at
  )
  select coalesce(jsonb_agg(id order by created_at), '[]'::jsonb) from moved;
$$;

ALTER FUNCTION public.deliveries_held(p_destination uuid, p_limit integer) OWNER TO postgres;

-- function: deliveries_replay(uuid[])
CREATE FUNCTION public.deliveries_replay(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d record;
  n int := 0;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  for d in
    select x.id, x.workspace_id, x.destination_id, fd.paused from deliveries x join form_destinations fd on fd.id = x.destination_id
    where x.id = any(p_ids) and x.status in ('failed', 'done', 'skipped') and is_member(x.workspace_id)
    order by x.created_at
    for update of x
  loop
    update deliveries set status = case when d.paused then 'held' else 'queued' end, attempts = 0, error = null, lease_until = null, updated_at = now()
    where id = d.id;
    if not d.paused then
      perform enqueue_job(d.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.deliveries_replay(p_ids uuid[]) OWNER TO postgres;

-- function: deliveries_sweep()
CREATE FUNCTION public.deliveries_sweep() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int := 0;
  d record;
begin
  update deliveries x set status = 'failed', error = coalesce(x.error, 'The sender stopped answering'), lease_until = null, done_at = now(), updated_at = now()
  where x.status in ('sending', 'retrying') and x.updated_at < now() - interval '12 hours'
    and not exists (select 1 from jobs j where j.kind = 'deliver' and j.workspace_id = x.workspace_id and j.key = x.id::text and j.status in ('queued', 'running'));
  get diagnostics n = row_count;
  for d in
    select x.id, x.workspace_id from deliveries x
    where x.status = 'queued' and x.updated_at < now() - interval '10 minutes'
      and not exists (select 1 from jobs j where j.kind = 'deliver' and j.workspace_id = x.workspace_id and j.key = x.id::text and j.status in ('queued', 'running'))
    limit 1000
  loop
    perform enqueue_job(d.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.deliveries_sweep() OWNER TO postgres;

-- function: delivery_finish(uuid, text, text, text, text)
CREATE FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text DEFAULT NULL::text, p_external_url text DEFAULT NULL::text, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_status not in ('done', 'failed', 'retrying', 'skipped') then
    raise exception 'Bad status %', p_status;
  end if;
  update deliveries set status = p_status, lease_until = null,
         external_id = coalesce(left(p_external_id, 200), external_id), external_url = coalesce(left(p_external_url, 1000), external_url),
         error = case when p_status in ('done', 'skipped') then null else left(p_error, 1000) end,
         done_at = case when p_status in ('done', 'failed', 'skipped') then now() end, updated_at = now()
  where id = p_id and status = 'sending';
end;
$$;

ALTER FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text) OWNER TO postgres;

-- function: delivery_take(uuid, integer)
CREATE FUNCTION public.delivery_take(p_id uuid, p_lease_s integer DEFAULT 120) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  x deliveries%rowtype;
  dst form_destinations%rowtype;
begin
  select * into x from deliveries where id = p_id for update;
  if x.id is null or x.status in ('done', 'failed', 'skipped') then
    return null;
  end if;
  if x.status = 'sending' and x.lease_until > now() then
    return null;
  end if;
  select * into dst from form_destinations where id = x.destination_id;
  if dst.paused then
    update deliveries set status = 'held', lease_until = null, updated_at = now() where id = p_id;
    return null;
  end if;
  update deliveries set status = 'sending', attempts = attempts + 1, lease_until = now() + make_interval(secs => greatest(p_lease_s, 10)), updated_at = now()
  where id = p_id;
  return (
    select jsonb_build_object(
      'delivery', to_jsonb(x) || jsonb_build_object('attempts', x.attempts + 1),
      'destination', to_jsonb(dst),
      'sealed', (select sealed from form_destination_secrets where destination_id = dst.id),
      'submission', to_jsonb(s),
      'form', jsonb_build_object('id', f.id, 'name', f.name, 'body', v.body),
      'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name,
                   'title', c.title, 'phone', c.phone, 'country', c.country, 'company', co.name, 'company_domain', co.domain) end)
    from submissions s
    left join forms f on f.id = s.form_id
    left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
    left join contacts c on c.id = s.contact_id and c.deleted_at is null
    left join companies co on co.id = c.company_id
    where s.id = x.submission_id
  );
end;
$$;

ALTER FUNCTION public.delivery_take(p_id uuid, p_lease_s integer) OWNER TO postgres;

-- function: design_asset_add(uuid, uuid, text, text, text, text, integer, integer, integer)
CREATE FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  aid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'Workspace not found'; end if;
  if (select count(*) from design_assets where workspace_id = p_ws) >= 2000 then raise exception 'Up to 2,000 images'; end if;
  insert into design_assets (workspace_id, path, url, name, type, width, height, bytes, created_by)
  values (p_ws, p_path, p_url, left(coalesce(p_name, ''), 200), p_type, p_width, p_height, p_bytes, p_user) returning id into aid;
  return aid;
end;
$$;

ALTER FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) OWNER TO postgres;

-- function: design_asset_delete(uuid)
CREATE FUNCTION public.design_asset_delete(p_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a design_assets%rowtype;
begin
  select * into a from design_assets where id = p_id;
  if a.id is null or not is_member(a.workspace_id) then raise exception 'Image not found'; end if;
  delete from design_assets where id = p_id;
  return a.path;
end;
$$;

ALTER FUNCTION public.design_asset_delete(p_id uuid) OWNER TO postgres;

-- function: domain_checks_due()
CREATE FUNCTION public.domain_checks_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, workspace_id from sending_domains
    where (status <> 'verified' and created_at > now() - interval '3 days' and coalesce(checked_at, created_at) < now() - interval '10 minutes')
       or (status <> 'verified' and created_at <= now() - interval '3 days' and coalesce(checked_at, created_at) < now() - interval '1 hour')
       or (status = 'verified' and coalesce(checked_at, created_at) < now() - interval '1 day')
    order by checked_at nulls first
    limit 200
  loop
    perform enqueue_job(r.workspace_id, 'domain_check', r.id::text, jsonb_build_object('domain_id', r.id), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.domain_checks_due() OWNER TO postgres;

-- function: drop_old_event_partitions(integer)
CREATE FUNCTION public.drop_old_event_partitions(p_keep_days integer DEFAULT 180) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  t record;
  dropped int := 0;
begin
  for t in
    select c.relname from pg_inherits i join pg_class c on c.oid = i.inhrelid join pg_class p on p.oid = i.inhparent
    where p.relname = 'events' and c.relname ~ '^events_\d{8}$'
      and to_date(substring(c.relname from 8), 'YYYYMMDD') < current_date - greatest(p_keep_days, 30)
  loop
    execute format('drop table public.%I', t.relname);
    dropped := dropped + 1;
  end loop;
  return dropped;
end;
$_$;

ALTER FUNCTION public.drop_old_event_partitions(p_keep_days integer) OWNER TO postgres;

-- function: email_click(uuid, integer, boolean, jsonb)
CREATE FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb DEFAULT '{}'::jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m email_messages;
  url text;
  human boolean := p_human;
begin
  select * into m from email_messages where id = p_message;
  if m.id is null then return null; end if;
  select links[p_link + 1] into url from emails where id = m.email_id;
  if url is null then return null; end if;
  if m.sent_at is null or m.sent_at > now() - interval '10 seconds'
     or (select count(*) from email_events where message_id = m.id and kind = 'clicked' and at > now() - interval '5 seconds') >= 2 then
    human := false;
  end if;
  insert into email_events (workspace_id, message_id, kind, data)
  values (m.workspace_id, m.id, 'clicked', coalesce(p_data, '{}') || jsonb_build_object('link', p_link, 'human', human));
  if human and m.first_click_at is null then
    update email_messages set first_click_at = now() where id = m.id;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.clicked', jsonb_build_object('email_id', m.email_id, 'message_id', m.id, 'url', url), 'email');
    end if;
  end if;
  return url;
end;
$$;

ALTER FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb) OWNER TO postgres;

-- function: email_create(uuid, uuid, jsonb)
CREATE FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  eid uuid;
begin
  insert into emails (workspace_id, name, kind, subject, preheader, html, text, links, from_name, from_email, topic_id, marketing, created_by)
  values (p_ws, coalesce(nullif(p_values->>'name', ''), p_values->>'subject'), p_values->>'kind', p_values->>'subject', p_values->>'preheader',
          p_values->>'html', p_values->>'text', coalesce(array(select jsonb_array_elements_text(p_values->'links')), '{}'),
          nullif(p_values->>'from_name', ''), nullif(lower(p_values->>'from_email'), ''), nullif(p_values->>'topic_id', '')::uuid,
          coalesce((p_values->>'marketing')::boolean, true), p_user)
  returning id into eid;
  if (select topic_id from emails where id = eid) is not null
     and not exists (select 1 from topics t join emails e on e.topic_id = t.id where e.id = eid and t.workspace_id = p_ws) then
    raise exception 'Topic not found';
  end if;
  return eid;
end;
$$;

ALTER FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) OWNER TO postgres;

-- function: email_event_apply(jsonb)
CREATE FUNCTION public.email_event_apply(p_event jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m email_messages;
  k text := p_event->>'kind';
  at_ timestamptz := coalesce((p_event->>'at')::timestamptz, now());
  soft int;
begin
  if k not in ('delivered', 'bounced', 'complained', 'rejected', 'delayed') then return 'ignored'; end if;
  if coalesce(p_event->>'provider_id', '') = '' then return 'unknown_message'; end if;
  select * into m from email_messages where provider_id = p_event->>'provider_id' for update;
  if m.id is null then return 'unknown_message'; end if;
  begin
    insert into email_events (workspace_id, message_id, kind, data, event_id, at)
    values (m.workspace_id, m.id, k, coalesce(p_event->'detail', '{}') || jsonb_strip_nulls(jsonb_build_object('bounce', p_event->>'bounce')), p_event->>'event_id', at_);
  exception when unique_violation then
    return 'duplicate';
  end;

  if k = 'delivered' then
    -- A late "delivered" never undoes a bounce or a complaint.
    update email_messages set status = case when status = 'sent' then 'delivered' else status end, delivered_at = coalesce(delivered_at, at_) where id = m.id;
  elsif k = 'rejected' then
    update email_messages set status = case when status in ('sent', 'delivered') then 'rejected' else status end where id = m.id;
  elsif k = 'bounced' then
    update email_messages set status = case when status = 'complained' then status else 'bounced' end, bounced = coalesce(p_event->>'bounce', 'hard') where id = m.id;
    if coalesce(p_event->>'bounce', 'hard') = 'hard' then
      perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'bounced')));
    else
      select count(*) into soft from email_events v join email_messages vm on vm.id = v.message_id
      where v.workspace_id = m.workspace_id and v.kind = 'bounced' and v.data->>'bounce' = 'soft'
        and lower(vm.to_email) = lower(m.to_email) and v.at > now() - interval '30 days';
      if soft >= 3 then
        perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'bounced')));
      end if;
    end if;
  elsif k = 'complained' then
    update email_messages set status = 'complained', complained_at = coalesce(complained_at, at_) where id = m.id;
    perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'complained')));
    if m.contact_id is not null then
      insert into consents (workspace_id, contact_id, channel, basis, status, source)
      select m.workspace_id, m.contact_id, 'email', coalesce(c.basis, 'opt_in'), 'withdrawn', 'complaint'
      from (select (select basis from consents where contact_id = m.contact_id and channel = 'email' and basis <> 'none' order by at desc limit 1) as basis) c;
    end if;
    perform complaints_check(m.workspace_id);
  end if;

  if m.contact_id is not null and k in ('delivered', 'bounced', 'complained') then
    insert into contact_events (workspace_id, contact_id, kind, data, source, at)
    values (m.workspace_id, m.contact_id, 'email.' || k, jsonb_build_object('email_id', m.email_id, 'message_id', m.id), 'email', at_);
  end if;
  return 'ok';
end;
$$;

ALTER FUNCTION public.email_event_apply(p_event jsonb) OWNER TO postgres;

-- function: email_guard(uuid, timestamp with time zone)
CREATE FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone DEFAULT now()) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m email_messages;
  e emails;
  s send_settings;
  c contacts;
  basis_row consents;
  sub_status text;
  topic_on boolean;
  tz text;
  h int;
  sent_recent int;
begin
  select * into m from email_messages where id = p_message;
  if not found then return jsonb_build_object('reason', 'missing'); end if;
  select * into e from emails where id = m.email_id;
  select * into s from send_settings where workspace_id = m.workspace_id;
  if s.workspace_id is null then return jsonb_build_object('reason', 'no_settings'); end if;
  if s.paused then return jsonb_build_object('reason', 'paused'); end if;
  if verified_domain_for(m.workspace_id, coalesce(e.from_email, s.from_email, '')) is null then
    return jsonb_build_object('reason', 'no_domain');
  end if;

  if exists (select 1 from suppressions where workspace_id = m.workspace_id and email_clean = lower(m.to_email)) then
    return jsonb_build_object('reason', 'suppressed');
  end if;
  if exists (select 1 from erasures where workspace_id = m.workspace_id and value_hash = sha256(convert_to(lower(m.to_email), 'UTF8'))) then
    return jsonb_build_object('reason', 'erased');
  end if;

  if e.kind = 'test' then
    if not exists (select 1 from workspace_members wm join auth.users u on u.id = wm.user_id
                   where wm.workspace_id = m.workspace_id and lower(u.email) = lower(m.to_email)) then
      return jsonb_build_object('reason', 'not_member');
    end if;
    return null;
  end if;

  if m.contact_id is null then return jsonb_build_object('reason', 'no_contact'); end if;
  select * into c from contacts where id = m.contact_id;
  if c.id is null or c.deleted_at is not null then return jsonb_build_object('reason', 'no_contact'); end if;
  if c.email_clean is distinct from lower(m.to_email) then return jsonb_build_object('reason', 'email_changed'); end if;

  if not e.marketing then return null; end if;
  if coalesce(trim(s.address), '') = '' then return jsonb_build_object('reason', 'no_address'); end if;

  select * into basis_row from consents where contact_id = c.id and channel = 'email' order by at desc, id desc limit 1;
  if basis_row.id is not null and basis_row.status = 'withdrawn' then return jsonb_build_object('reason', 'withdrawn'); end if;
  if basis_row.id is not null and basis_row.basis = 'none' then return jsonb_build_object('reason', 'no_basis'); end if;
  if (basis_row.id is null or basis_row.basis = 'legitimate_interest') and coalesce(c.country, '') <> 'US' then
    return jsonb_build_object('reason', 'no_basis');
  end if;

  if e.topic_id is not null then
    select status into sub_status from subscriptions where contact_id = c.id and topic_id = e.topic_id;
    select default_on into topic_on from topics where id = e.topic_id;
    if sub_status = 'unsubscribed' or (sub_status is null and not coalesce(topic_on, false)) then
      return jsonb_build_object('reason', 'not_subscribed');
    end if;
  end if;

  select count(*) into sent_recent from email_messages x join emails xe on xe.id = x.email_id
  where x.contact_id = c.id and xe.marketing and xe.kind <> 'test' and x.id <> m.id
    and x.sent_at > p_now - make_interval(days => s.cap_days);
  if sent_recent >= s.cap_count then return jsonb_build_object('reason', 'cap'); end if;

  if s.quiet_start <> s.quiet_end then
    tz := coalesce(nullif(c.timezone, ''), s.timezone);
    if local_hour(p_now, tz) is null then tz := s.timezone; end if;
    if local_hour(p_now, tz) is null then tz := 'UTC'; end if;
    h := local_hour(p_now, tz);
    if (s.quiet_start < s.quiet_end and h >= s.quiet_start and h < s.quiet_end)
       or (s.quiet_start > s.quiet_end and (h >= s.quiet_start or h < s.quiet_end)) then
      return jsonb_build_object('reason', 'quiet', 'retry_at', next_local_hour(p_now, tz, s.quiet_end));
    end if;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone) OWNER TO postgres;

-- function: email_hash(text)
CREATE FUNCTION public.email_hash(p text) RETURNS bytea
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select pg_catalog.sha256(pg_catalog.convert_to(p, 'UTF8')) $$;

ALTER FUNCTION public.email_hash(p text) OWNER TO postgres;

-- function: email_queue_test(uuid, uuid)
CREATE FUNCTION public.email_queue_test(p_email uuid, p_user uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e emails;
  addr text;
  mid uuid;
begin
  select * into e from emails where id = p_email and kind = 'test';
  if e.id is null then raise exception 'Email not found'; end if;
  select lower(u.email) into addr from auth.users u join workspace_members wm on wm.user_id = u.id
  where u.id = p_user and wm.workspace_id = e.workspace_id;
  if addr is null then raise exception 'Only members get tests'; end if;
  insert into email_messages (workspace_id, email_id, to_email, dedupe)
  values (e.workspace_id, e.id, addr, e.id::text || ':' || addr)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  perform enqueue_job(e.workspace_id, 'send', e.workspace_id::text, '{}', 0, 3);
  return mid;
end;
$$;

ALTER FUNCTION public.email_queue_test(p_email uuid, p_user uuid) OWNER TO postgres;

-- function: email_queue_to(uuid, text[])
CREATE FUNCTION public.email_queue_to(p_email uuid, p_to text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  e emails;
  n int;
begin
  select * into e from emails where id = p_email;
  if e.id is null then raise exception 'Email not found'; end if;
  if cardinality(p_to) > 50 then raise exception 'Up to 50 addresses at once'; end if;
  insert into email_messages (workspace_id, email_id, to_email, dedupe)
  select e.workspace_id, e.id, a, e.id::text || ':' || a
  from (select distinct lower(trim(x)) as a from unnest(p_to) x) t
  where a ~ '^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$'
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform enqueue_job(e.workspace_id, 'send', e.workspace_id::text, '{}', 0, 3); end if;
  return n;
end $_$;

ALTER FUNCTION public.email_queue_to(p_email uuid, p_to text[]) OWNER TO postgres;

-- function: email_template_delete(uuid)
CREATE FUNCTION public.email_template_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from email_templates where id = p_id;
  if ws is null or not is_member(ws) then raise exception 'Template not found'; end if;
  delete from email_templates where id = p_id;
end;
$$;

ALTER FUNCTION public.email_template_delete(p_id uuid) OWNER TO postgres;

-- function: email_template_save(uuid, uuid, text, jsonb)
CREATE FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  tid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the template'; end if;
  if p_id is null then
    if (select count(*) from email_templates where workspace_id = p_ws) >= 200 then raise exception 'Up to 200 templates'; end if;
    insert into email_templates (workspace_id, name, body, created_by) values (p_ws, left(trim(p_name), 120), p_body, auth.uid()) returning id into tid;
  else
    update email_templates set name = left(trim(p_name), 120), body = p_body, updated_at = now() where id = p_id and workspace_id = p_ws returning id into tid;
    if tid is null then raise exception 'Template not found'; end if;
  end if;
  return tid;
end;
$$;

ALTER FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) OWNER TO postgres;

-- function: email_test_ready(uuid)
CREATE FUNCTION public.email_test_ready(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'from_email', s.from_email,
    'paused', coalesce(s.paused, false),
    'verified', s.from_email is not null and (verified_domain_for(p_ws, s.from_email)).id is not null)
  from (select 1) one left join send_settings s on s.workspace_id = p_ws;
$$;

ALTER FUNCTION public.email_test_ready(p_ws uuid) OWNER TO postgres;

-- function: email_unsubscribe(uuid, text)
CREATE FUNCTION public.email_unsubscribe(p_message uuid, p_scope text DEFAULT 'all'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m email_messages;
  e emails;
  scope text := case when p_scope = 'topic' then 'topic' else 'all' end;
begin
  select * into m from email_messages where id = p_message;
  if m.id is null then return null; end if;
  select * into e from emails where id = m.email_id;
  if e.topic_id is null then scope := 'all'; end if;
  insert into email_events (workspace_id, message_id, kind, data) values (m.workspace_id, m.id, 'unsubscribed', jsonb_build_object('scope', scope, 'test', e.kind = 'test'));
  update email_messages set unsubscribed_at = coalesce(unsubscribed_at, now()) where id = m.id;
  if e.kind = 'test' then
    return jsonb_build_object('scope', scope, 'topic', (select name from topics where id = e.topic_id), 'test', true);
  end if;
  if scope = 'topic' and m.contact_id is not null then
    insert into subscriptions (workspace_id, contact_id, topic_id, status) values (m.workspace_id, m.contact_id, e.topic_id, 'unsubscribed')
    on conflict (contact_id, topic_id) do update set status = 'unsubscribed', at = now();
  else
    perform suppress(m.workspace_id, 'unsubscribe', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'unsubscribed')));
    if m.contact_id is not null then
      insert into consents (workspace_id, contact_id, channel, basis, status, source)
      select m.workspace_id, m.contact_id, 'email', coalesce(c.basis, 'opt_in'), 'withdrawn', 'unsubscribe'
      from (select (select basis from consents where contact_id = m.contact_id and channel = 'email' and basis <> 'none' order by at desc limit 1) as basis) c;
    end if;
  end if;
  if m.contact_id is not null then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (m.workspace_id, m.contact_id, 'email.unsubscribed', jsonb_build_object('email_id', m.email_id, 'message_id', m.id, 'scope', scope), 'email');
  end if;
  return jsonb_build_object('scope', scope, 'topic', (select name from topics where id = e.topic_id), 'test', false);
end;
$$;

ALTER FUNCTION public.email_unsubscribe(p_message uuid, p_scope text) OWNER TO postgres;

-- function: email_unsubscribe_info(uuid)
CREATE FUNCTION public.email_unsubscribe_info(p_message uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('topic', t.name, 'from', coalesce(e.from_name, s.from_name), 'done', m.unsubscribed_at is not null)
  from email_messages m join emails e on e.id = m.email_id
  left join topics t on t.id = e.topic_id
  left join send_settings s on s.workspace_id = m.workspace_id
  where m.id = p_message;
$$;

ALTER FUNCTION public.email_unsubscribe_info(p_message uuid) OWNER TO postgres;

-- function: email_version_add(uuid, uuid, text, jsonb, text, text, boolean)
CREATE FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  vid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'Workspace not found'; end if;
  insert into email_versions (workspace_id, ref, doc, subject, note, by_ai, created_by)
  values (p_ws, p_ref, p_doc, left(coalesce(p_subject, ''), 200), left(coalesce(p_note, ''), 300), p_ai, p_user) returning id into vid;
  delete from email_versions where id in (
    select id from email_versions where workspace_id = p_ws and ref = p_ref order by created_at desc offset 50);
  return vid;
end;
$$;

ALTER FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) OWNER TO postgres;

-- function: enqueue_job(uuid, text, text, jsonb, integer, integer)
CREATE FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text DEFAULT ''::text, p_payload jsonb DEFAULT '{}'::jsonb, p_delay_s integer DEFAULT 0, p_max_attempts integer DEFAULT 5) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  jid uuid;
  delay int := greatest(coalesce(p_delay_s, 0), 0);
  pri smallint := job_priority(p_kind, coalesce(p_payload, '{}'));
begin
  insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
  values (p_workspace, p_kind, coalesce(p_key, ''), coalesce(p_payload, '{}'), now() + make_interval(secs => delay), p_max_attempts, pri)
  on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
  do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
  returning id into jid;
  -- Ready now: wake an idle worker (delivered at commit; the same lane twice in one transaction is one message).
  if delay <= 1 then
    perform pg_notify('claritia_jobs', pri::text);
  end if;
  return jid;
end;
$$;

ALTER FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer) OWNER TO postgres;

-- function: enqueue_jobs(jsonb)
CREATE FUNCTION public.enqueue_jobs(p_jobs jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int := 0;
  k int;
  lanes smallint[];
begin
  if jsonb_typeof(p_jobs) <> 'array' then return 0; end if;
  with raw as (
    select (j->>'workspace_id')::uuid as ws, j->>'kind' as kind, coalesce(j->>'key', '') as key, coalesce(j->'payload', '{}') as payload,
           greatest(coalesce((j->>'delay_s')::int, 0), 0) as delay_s, coalesce((j->>'max_attempts')::int, 5) as max_attempts, o
    from jsonb_array_elements(p_jobs) with ordinality as t(j, o)
  ),
  keyed as (
    select distinct on (ws, kind, key) ws, kind, key,
           payload, max_attempts,
           min(delay_s) over (partition by ws, kind, key) as delay_s
    from raw where key <> ''
    order by ws, kind, key, o desc
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select ws, kind, key, payload, now() + make_interval(secs => delay_s), max_attempts, job_priority(kind, payload) from keyed
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning priority, run_after
  )
  select count(*), array_agg(distinct priority) filter (where run_after <= now() + interval '1 second') into n, lanes from ins;
  with raw as (
    select (j->>'workspace_id')::uuid as ws, j->>'kind' as kind, coalesce(j->'payload', '{}') as payload,
           greatest(coalesce((j->>'delay_s')::int, 0), 0) as delay_s, coalesce((j->>'max_attempts')::int, 5) as max_attempts
    from jsonb_array_elements(p_jobs) j
    where coalesce(j->>'key', '') = ''
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select ws, kind, '', payload, now() + make_interval(secs => delay_s), max_attempts, job_priority(kind, payload) from raw
    returning priority, run_after
  )
  select count(*), coalesce(lanes, '{}') || coalesce(array_agg(distinct priority) filter (where run_after <= now() + interval '1 second'), '{}') into k, lanes from ins;
  n := n + k;
  perform pg_notify('claritia_jobs', l::text) from (select distinct unnest(lanes) l) x;
  return n;
end;
$$;

ALTER FUNCTION public.enqueue_jobs(p_jobs jsonb) OWNER TO postgres;

-- function: enqueue_jobs(uuid, text, jsonb, integer)
CREATE FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer DEFAULT 5) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  j jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_jobs) is distinct from 'array' then raise exception 'p_jobs must be an array'; end if;
  if jsonb_array_length(p_jobs) > 5000 then raise exception 'Queue up to 5,000 jobs at a time'; end if;
  for j in select value from jsonb_array_elements(p_jobs) loop
    perform enqueue_job(p_workspace, p_kind, coalesce(j->>'key', ''), coalesce(j->'payload', '{}'), coalesce((j->>'delay_s')::int, 0), coalesce(p_max_attempts, 5));
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer) OWNER TO postgres;

-- function: enrich_backfill_where(uuid, jsonb)
CREATE FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.id from contacts c left join companies co on co.id = c.company_id
  where c.workspace_id = p_ws and c.deleted_at is null and c.email_class in ('work', 'role')
    and (coalesce(p_filter->>'segment_id', '') = '' or exists (select 1 from segment_members sm where sm.segment_id = (p_filter->>'segment_id')::uuid and sm.contact_id = c.id and sm.left_at is null))
    and case coalesce(p_filter->>'missing', 'any')
      when 'title' then c.title is null
      when 'company' then c.company_id is null or co.name is null
      when 'industry' then co.industry is null
      when 'size' then co.size is null
      when 'seniority' then c.seniority is null
      else c.title is null or c.company_id is null or co.industry is null or co.size is null
    end;
$$;

ALTER FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) OWNER TO postgres;

-- function: enrich_cap(uuid)
CREATE FUNCTION public.enrich_cap(p_ws uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select credit_cap from enrich_settings where workspace_id = p_ws),
    case (select plan from workspace_billing where workspace_id = p_ws) when 'starter' then 250 when 'team' then 2000 when 'business' then 5000 else 0 end);
$$;

ALTER FUNCTION public.enrich_cap(p_ws uuid) OWNER TO postgres;

-- function: enrich_write_company(uuid, text, jsonb, boolean)
CREATE FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  co companies%rowtype;
  m jsonb;
  newv jsonb;
  dom text := nullif(lower(trim(coalesce(p_company->>'domain', ''))), '');
  cid uuid;
begin
  if source_class(p_source) <> 'vendor' then raise exception 'Not a vendor source: %', p_source; end if;
  if dom is null or dom !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return jsonb_build_object('id', null, 'changed', '[]'::jsonb); end if;
  if p_create then
    insert into companies (workspace_id, domain, name, account_id)
    values (p_ws, dom, nullif(trim(left(p_company->>'name', 200)), ''), (select account_id from account_domains where workspace_id = p_ws and domain = dom))
    on conflict (workspace_id, domain) where domain is not null do nothing
    returning id into cid;
  end if;
  if cid is null then select id into cid from companies where workspace_id = p_ws and domain = dom and deleted_at is null; end if;
  if cid is null then return jsonb_build_object('id', null, 'changed', '[]'::jsonb); end if;
  select * into co from companies where id = cid for update;
  newv := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(trim(left(p_company->>'name', 200)), ''),
    'industry', nullif(trim(left(p_company->>'industry', 120)), ''),
    'size', nullif(trim(left(p_company->>'size', 40)), ''),
    'country', case when upper(trim(p_company->>'country')) ~ '^[A-Z]{2}$' then upper(trim(p_company->>'country')) end,
    'employees', case when (p_company->>'employees') ~ '^\d{1,9}$' then (p_company->>'employees')::int end,
    'founded', case when (p_company->>'founded') ~ '^\d{4}$' and (p_company->>'founded')::int between 1600 and 2100 then (p_company->>'founded')::int end));
  m := merge_values(field_classes(p_ws, 'company'), p_source, null,
    jsonb_strip_nulls(jsonb_build_object('name', co.name, 'industry', co.industry, 'size', co.size, 'country', co.country, 'employees', co.employees, 'founded', co.founded)),
    co.field_sources, newv);
  if jsonb_array_length(m->'changes') > 0 then
    update companies set
      name = coalesce(m->'vals'->>'name', name),
      industry = m->'vals'->>'industry',
      size = m->'vals'->>'size',
      country = m->'vals'->>'country',
      employees = (m->'vals'->>'employees')::int,
      founded = (m->'vals'->>'founded')::int,
      field_sources = m->'src',
      updated_at = now()
    where id = cid;
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
    select p_ws, 'company', cid, x->>'key', x->'old', x->'new', x->'old_source', p_source from jsonb_array_elements(m->'changes') x;
  end if;
  return jsonb_build_object('id', cid, 'changed', coalesce((select jsonb_agg('company.' || (x->>'key')) from jsonb_array_elements(m->'changes') x), '[]'));
end;
$_$;

ALTER FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean) OWNER TO postgres;

-- function: ensure_workspace()
CREATE FUNCTION public.ensure_workspace() RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  v_email text;
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  for inv in select * from invites i where lower(i.email) = lower(v_email) and i.accepted_at is null and i.expires_at > now() order by i.created_at loop
    insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), 'member') on conflict do nothing;
    update invites set accepted_at = now() where id = inv.id;
  end loop;
  select workspace_id into ws from workspace_members where user_id = auth.uid() order by created_at limit 1;
  if ws is not null then
    return ws;
  end if;
  insert into workspaces (name, named)
  values (coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'My') || '''s workspace', false)
  returning id into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end;
$$;

ALTER FUNCTION public.ensure_workspace() OWNER TO postgres;

-- function: environment_workspace()
CREATE FUNCTION public.environment_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then
    raise exception 'Project not found';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.environment_workspace() OWNER TO postgres;

-- function: events_ingest(uuid, jsonb)
CREATE FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  s sources%rowtype;
  added int;
  unknown int;
begin
  select * into s from sources where id = p_source;
  if s.id is null then
    raise exception 'Source not found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5,000 rows at a time';
  end if;
  create temp table if not exists _ev (key text, email_clean text, kind text, at timestamptz, data jsonb, contact_id uuid) on commit drop;
  truncate _ev;
  insert into _ev (key, email_clean, kind, at, data)
  select distinct on (r.key) left(r.key, 300), lower(trim(r.email_clean)), r.kind, coalesce(r.at, now()), coalesce(r.data, '{}')
  from jsonb_to_recordset(p_rows) as r(key text, email_clean text, kind text, at timestamptz, data jsonb)
  where coalesce(r.key, '') <> '' and r.kind ~ '^[a-z][a-z0-9_.]{1,60}$' and r.at is distinct from 'infinity'::timestamptz
    and coalesce(r.at, now()) > now() - interval '13 months' and coalesce(r.at, now()) < now() + interval '1 day';
  update _ev e set contact_id = c.id from contacts c where c.workspace_id = s.workspace_id and c.deleted_at is null and c.email_clean = e.email_clean;
  select count(*) into unknown from _ev where contact_id is null;
  delete from _ev where contact_id is null;
  -- Only keys never seen before.
  with fresh as (
    insert into source_event_keys (source_id, key) select p_source, key from _ev on conflict do nothing returning key
  ), ins as (
    insert into contact_events (workspace_id, contact_id, kind, data, source, at)
    select s.workspace_id, e.contact_id, e.kind, e.data, s.kind, e.at from _ev e join fresh f on f.key = e.key
    returning 1
  )
  select count(*) into added from ins;
  truncate _ev;
  return jsonb_build_object('added', added, 'no_contact', unknown);
end;
$_$;

ALTER FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) OWNER TO postgres;

-- function: evidence_names(jsonb, text, text, text)
CREATE FUNCTION public.evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select exists (
    select 1 from jsonb_array_elements(e_identifiers) x
    where x->>'kind' = i_kind and lower(trim(x->>'value')) in (lower(i_clean), lower(trim(coalesce(i_raw, ''))))
  )
$$;

ALTER FUNCTION public.evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text) OWNER TO postgres;

-- function: explorations_wake()
CREATE FUNCTION public.explorations_wake() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'queued' then
    perform wake_runner();
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.explorations_wake() OWNER TO postgres;

-- function: extend_job(uuid, text, integer)
CREATE FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer DEFAULT 300) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update jobs set locked_until = now() + make_interval(secs => greatest(coalesce(p_lease_s, 300), 10))
  where id = p_id and status = 'running' and locked_by = p_worker;
  return found;
end;
$$;

ALTER FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer) OWNER TO postgres;

-- function: field_classes(uuid, text)
CREATE FUNCTION public.field_classes(p_ws uuid, p_object text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('*', to_jsonb(array['manual', 'crm', 'form', 'product', 'import', 'vendor', 'ai']))
         || coalesce((select jsonb_object_agg(key, to_jsonb(classes)) from field_order where workspace_id = p_ws and object = p_object), '{}');
$$;

ALTER FUNCTION public.field_classes(p_ws uuid, p_object text) OWNER TO postgres;

-- function: field_history_event()
CREATE FUNCTION public.field_history_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.object = 'contact' and exists (select 1 from workflow_watch w where w.workspace_id = new.workspace_id and w.key = new.key) then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (new.workspace_id, new.record_id, 'field.changed', jsonb_build_object('key', new.key, 'old', new.old, 'new', new.new), coalesce(left(new.source, 40), 'field'));
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.field_history_event() OWNER TO postgres;

-- function: field_value(uuid, text, jsonb, text, jsonb)
CREATE FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  t text := jsonb_typeof(p_value);
  s text;
  allowed text[];
begin
  if p_value is null or t = 'null' or p_value = '""'::jsonb or p_value = '[]'::jsonb then
    return null;
  end if;
  s := case when t = 'string' then trim(p_value #>> '{}') else p_value #>> '{}' end;
  allowed := array(select coalesce(o->>'value', o #>> '{}') from jsonb_array_elements(coalesce(p_options, '[]')) o);
  case p_type
    when 'number', 'currency', 'percent' then
      if try_numeric(s) is null then raise exception '%: enter a number', p_label; end if;
      return to_jsonb(try_numeric(s));
    when 'date' then
      if s !~ '^\d{4}-\d{2}-\d{2}$' or try_timestamptz(s) is null then raise exception '%: enter a date like 2026-03-31', p_label; end if;
      return to_jsonb(s);
    when 'datetime' then
      if try_timestamptz(s) is null then raise exception '%: enter a date and time', p_label; end if;
      return to_jsonb(try_timestamptz(s));
    when 'checkbox' then
      if lower(s) in ('true', 'yes', '1') then return 'true'::jsonb; end if;
      if lower(s) in ('false', 'no', '0') then return 'false'::jsonb; end if;
      raise exception '%: yes or no', p_label;
    when 'select' then
      if not s = any(allowed) then raise exception '%: pick one of its values', p_label; end if;
      return to_jsonb(s);
    when 'multi_select' then
      if t <> 'array' or exists (select 1 from jsonb_array_elements_text(p_value) x where not x = any(allowed)) then
        raise exception '%: pick from its values', p_label;
      end if;
      return (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements_text(p_value) x);
    when 'url' then
      if s !~* '^https?://[^\s]+$' or length(s) > 2000 then raise exception '%: enter a web address starting with https://', p_label; end if;
      return to_jsonb(s);
    when 'email' then
      if s !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(s) > 320 then raise exception '%: enter an email', p_label; end if;
      return to_jsonb(lower(s));
    when 'phone' then
      if length(s) > 50 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
    when 'user' then
      if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id::text = s) then raise exception '%: pick a teammate', p_label; end if;
      return to_jsonb(s);
    when 'rating' then
      if s !~ '^[1-5]$' then raise exception '%: pick 1 to 5', p_label; end if;
      return to_jsonb(s::int);
    when 'long_text' then
      if length(s) > 20000 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
    when 'relation' then
      raise exception '%: links are set with record_link', p_label;
    else
      if length(s) > 500 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
  end case;
end;
$_$;

ALTER FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) OWNER TO postgres;

-- function: fill_query(text)
CREATE FUNCTION public.fill_query(p_q text) RETURNS tsquery
    LANGUAGE sql IMMUTABLE
    AS $$
  select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & '))
  from regexp_split_to_table(trim(regexp_replace(lower(left(coalesce(p_q, ''), 200)), '[^[:alnum:]]+', ' ', 'g')), ' ') w
  where w <> '';
$$;

ALTER FUNCTION public.fill_query(p_q text) OWNER TO postgres;

-- function: finish_job(uuid, text, boolean, text, integer)
CREATE FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text DEFAULT NULL::text, p_retry_s integer DEFAULT NULL::integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  j jobs;
  wait int;
begin
  select * into j from jobs where id = p_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return false;
  end if;
  if p_ok then
    update jobs set status = 'done', error = null, finished_at = now(), locked_by = null, locked_until = null where id = p_id;
    return true;
  end if;
  if p_retry_s = -1 or j.attempts >= j.max_attempts or (j.key <> '' and job_key_waiting(j.workspace_id, j.kind, j.key)) then
    update jobs set status = 'failed', error = left(coalesce(p_error, 'Failed'), 2000), finished_at = now(),
      locked_by = null, locked_until = null where id = p_id;
    return true;
  end if;
  wait := greatest(coalesce(p_retry_s, (array[60, 300, 1800, 7200, 21600])[least(j.attempts, 5)]), 0);
  update jobs set status = 'queued', error = left(coalesce(p_error, 'Failed'), 2000), run_after = now() + make_interval(secs => wait),
    locked_by = null, locked_until = null where id = p_id;
  return true;
end;
$$;

ALTER FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer) OWNER TO postgres;

-- function: fire_due_schedules()
CREATE FUNCTION public.fire_due_schedules() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s schedules;
  e environments;
  t tests;
  u record;
  n int;
  fired int := 0;
begin
  for s in select * from schedules where enabled and next_run_at <= now() order by next_run_at for update skip locked loop
    n := 0;
    select * into e from environments where id = s.environment_id;
    select * into u from workspace_usage(s.workspace_id);
    if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
      update schedules set last_run_at = now(), last_count = 0, last_error = 'This month''s cloud minutes are used up.',
        next_run_at = schedule_next(every, at_hour, at_minute, weekday, timezone, now()) where id = s.id;
      continue;
    end if;
    for t in
      select * from tests
      where project_id = s.project_id
        and jsonb_array_length(coalesce(steps, '[]')) > 0
        and (s.scope = 'all' or (s.scope = 'use_case' and use_case = s.use_case) or (s.scope = 'tests' and id = any (s.test_ids)))
        and not exists (select 1 from runs r where r.test_id = tests.id and r.schedule_id = s.id and r.status in ('queued', 'running'))
      order by use_case, name
      limit 50
    loop
      perform queue_run(t, e, 'schedule', s.created_by, s.id);
      n := n + 1;
    end loop;
    update schedules set last_run_at = now(), last_count = n, last_error = case when n = 0 then 'No tests to run.' end,
      next_run_at = schedule_next(every, at_hour, at_minute, weekday, timezone, now()) where id = s.id;
    fired := fired + 1;
  end loop;
  return fired;
end;
$$;

ALTER FUNCTION public.fire_due_schedules() OWNER TO postgres;

-- function: first_touch_fill(interval)
CREATE FUNCTION public.first_touch_fill(p_older interval DEFAULT '00:10:00'::interval) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  update contacts c set first_touch = coalesce(
    (select touch_from_fill(s.hidden, s.form_id, s.created_at) from submissions s where s.contact_id = c.id and not s.test and not s.spam order by s.created_at limit 1),
    (select jsonb_strip_nulls(jsonb_build_object('source', coalesce(se.source, se.referrer_host, 'direct'), 'medium', se.medium, 'campaign', se.campaign, 'ref_class', se.ref_class, 'at', se.started_at))
       from sessions se where c.person_id is not null and se.workspace_id = c.workspace_id and se.person_id = c.person_id and not se.is_bot and not se.internal
       order by se.started_at limit 1),
    jsonb_build_object('source', c.source, 'at', c.created_at))
  where c.first_touch is null and c.created_at < now() - p_older;
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.first_touch_fill(p_older interval) OWNER TO postgres;

-- function: form_booking_ctx(uuid, uuid)
CREATE FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select jsonb_build_object(
    'workspace_id', s.workspace_id,
    'contact_id', s.contact_id,
    'spam', s.spam,
    'email', c.email,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'owner', c.owner_user_id,
    'shown_at', s.booking_shown_at,
    'type', (select jsonb_build_object('id', t.id, 'workspace_id', t.workspace_id, 'slug', t.slug, 'name', t.name, 'kind', t.kind, 'hosts', t.hosts,
                                       'settings', t.settings, 'secret', t.secret, 'active', t.active, 'owner_user_id', t.owner_user_id,
                                       'template_id', t.template_id, 'locked', to_jsonb(t.locked))
             from meeting_types t where t.id = p_type and t.workspace_id = s.workspace_id and t.active),
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'end', m.end_at, 'hosts', to_jsonb(m.hosts))
                from meetings m where m.submission_id = s.id and m.status = 'booked' order by m.created_at desc limit 1),
    'profiles', coalesce((select jsonb_object_agg(p.user_id, jsonb_build_object('name', p.name, 'photo', p.photo_url))
                          from booking_profiles p
                          where p.workspace_id = s.workspace_id
                            and (p.user_id = c.owner_user_id
                                 or p.user_id in (select (h->>'user_id')::uuid from meeting_types t, jsonb_array_elements(t.hosts) h
                                                  where t.id = p_type and h->>'user_id' ~ '^[0-9a-f-]{36}$'))), '{}'::jsonb)
  )
  from submissions s left join contacts c on c.id = s.contact_id
  where s.id = p_submission;
$_$;

ALTER FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) OWNER TO postgres;

-- function: form_booking_shown(uuid, uuid, uuid)
CREATE FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  t timestamptz;
  s submissions%rowtype;
begin
  update submissions set booking_shown_at = now(), booking_type_id = p_type
  where id = p_submission and booking_shown_at is null
  returning * into s;
  if s.id is null then
    select booking_shown_at into t from submissions where id = p_submission;
    return t;
  end if;
  perform enqueue_job(s.workspace_id, 'meeting_book_later', 'book_later:' || p_submission::text,
    jsonb_strip_nulls(jsonb_build_object('submission', p_submission, 'type', p_type, 'owner', p_owner)), 600, 3);
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.offered', jsonb_strip_nulls(jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', p_type, 'owner', p_owner)), 'form');
  end if;
  return s.booking_shown_at;
end;
$$;

ALTER FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) OWNER TO postgres;

-- function: form_booking_shown_rep(uuid, uuid, uuid)
CREATE FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) RETURNS timestamp with time zone
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  t timestamptz;
  s submissions%rowtype;
begin
  update submissions set booking_shown_at = now(), booking_type_id = p_type
  where id = p_submission and booking_shown_at is null
  returning * into s;
  if s.id is null then
    select booking_shown_at into t from submissions where id = p_submission;
    return t;
  end if;
  perform enqueue_job(s.workspace_id, 'meeting_book_later', 'book_later:' || p_submission::text,
    jsonb_strip_nulls(jsonb_build_object('submission', p_submission, 'type', p_type, 'owner', p_owner, 'only', p_owner is not null)), 600, 3);
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.offered', jsonb_strip_nulls(jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', p_type, 'owner', p_owner)), 'form');
  end if;
  return s.booking_shown_at;
end;
$$;

ALTER FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) OWNER TO postgres;

-- function: form_by_slug(text, text)
CREATE FUNCTION public.form_by_slug(p_ws text, p_slug text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select jsonb_build_object('id', f.id, 'slug', f.slug) from forms f join workspaces w on w.id = f.workspace_id
     where w.booking_slug = lower(p_ws) and f.slug = lower(p_slug) limit 1),
    (select jsonb_build_object('id', f.id, 'slug', f.slug, 'moved', true) from form_slug_moves m
     join workspaces w on w.id = m.workspace_id join forms f on f.id = m.form_id
     where w.booking_slug = lower(p_ws) and m.slug = lower(p_slug) and m.until > now() limit 1)
  );
$$;

ALTER FUNCTION public.form_by_slug(p_ws text, p_slug text) OWNER TO postgres;

-- function: form_check_finish(uuid, text, jsonb, uuid, text)
CREATE FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update form_checks set status = p_status, steps = coalesce(p_steps, '[]'), submission_id = p_submission, error = left(p_error, 1000), finished_at = now()
  where id = p_id;
$$;

ALTER FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) OWNER TO postgres;

-- function: form_check_progress(uuid, timestamp with time zone)
CREATE FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('submission_id', s.id, 'deliveries', coalesce((
    select jsonb_agg(jsonb_build_object('name', fd.name, 'status', d.status, 'error', d.error) order by fd.position, fd.created_at)
    from deliveries d join form_destinations fd on fd.id = d.destination_id where d.submission_id = s.id), '[]'::jsonb))
  from submissions s where s.form_id = p_form and s.test and s.created_at >= p_since
  order by s.created_at desc limit 1;
$$;

ALTER FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) OWNER TO postgres;

-- function: form_check_start(uuid)
CREATE FUNCTION public.form_check_start(p_form uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cid uuid;
  ws uuid;
begin
  insert into form_checks (workspace_id, form_id) select workspace_id, id from forms where id = p_form returning id, workspace_id into cid, ws;
  if cid is null then
    return null;
  end if;
  return jsonb_build_object('id', cid, 'domain', (select own_domains[1] from identity_settings where workspace_id = ws));
end;
$$;

ALTER FUNCTION public.form_check_start(p_form uuid) OWNER TO postgres;

-- function: form_checks_due()
CREATE FUNCTION public.form_checks_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f record;
  n int := 0;
begin
  for f in
    select x.id, x.workspace_id from forms x
    where x.status = 'live' and x.kind = 'built'
      and not exists (select 1 from form_checks c where c.form_id = x.id and c.started_at > now() - interval '20 hours')
    limit 500
  loop
    perform enqueue_job(f.workspace_id, 'form_qa', f.id::text, jsonb_build_object('form_id', f.id), 0, 2);
    n := n + 1;
  end loop;
  if n > 0 then
    perform wake_runner();
  end if;
  return n;
end;
$$;

ALTER FUNCTION public.form_checks_due() OWNER TO postgres;

-- function: form_contact_write(uuid, jsonb)
CREATE FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  pol jsonb := case when jsonb_typeof(p_row->'overwrite') = 'object' then p_row->'overwrite' else '{}'::jsonb end;
  r jsonb := p_row - 'basis' - 'overwrite';
  ec text := lower(btrim(coalesce(p_row->>'email_clean', '')));
  c contacts%rowtype;
  old jsonb;
  k text;
  p text;
  empty boolean;
  force text[] := '{}';
  up jsonb;
  cid uuid;
  vals jsonb := '{}';
  comp uuid;
begin
  if ec = '' or pol = '{}'::jsonb then
    return contacts_upsert(p_ws, 'form', jsonb_build_array(r));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contact:' || p_ws::text || ':' || ec, 0));
  select * into c from contacts where workspace_id = p_ws and email_clean = ec and deleted_at is null for update;
  if c.id is not null then
    old := contact_vals(c);
    for k, p in select key, value #>> '{}' from jsonb_each(pol) loop
      continue when k !~ '^(email|first_name|last_name|title|phone|country|region|company|f\.[a-z][a-z0-9_]{0,39})$'
                 or p is null or p not in ('always', 'if_empty', 'never');
      empty := old->k is null or old->k in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) or (jsonb_typeof(old->k) = 'string' and btrim(old->>k) = '');
      if p = 'never' or (p = 'if_empty' and not empty) then
        r := case when k = 'company' then r - 'company_name' - 'company_domain'
                  when k like 'f.%' then jsonb_set(r, '{fields}', coalesce(r->'fields', '{}'::jsonb) - substr(k, 3))
                  else r - k end;
      else
        force := force || k;
      end if;
    end loop;
  end if;

  up := contacts_upsert(p_ws, 'form', jsonb_build_array(r));
  cid := (up->'ids'->>0)::uuid;

  if c.id is not null and cid = c.id and cardinality(force) > 0 then
    foreach k in array force loop
      if k = 'company' then
        comp := case
          when nullif(lower(btrim(r->>'company_domain')), '') is not null
            then (select id from companies where workspace_id = p_ws and domain = lower(btrim(r->>'company_domain')))
          when nullif(btrim(r->>'company_name'), '') is not null
            then (select id from companies where workspace_id = p_ws and domain is null and lower(name) = lower(btrim(r->>'company_name')) limit 1)
        end;
        if comp is not null then
          vals := vals || jsonb_build_object('company', comp::text);
        end if;
      elsif k like 'f.%' then
        if r->'fields'->substr(k, 3) is not null then
          vals := vals || jsonb_build_object(k, r->'fields'->substr(k, 3));
        end if;
      elsif nullif(btrim(r->>k), '') is not null then
        vals := vals || jsonb_build_object(k, case when k = 'country' then upper(btrim(r->>k)) else btrim(r->>k) end);
      end if;
    end loop;
    perform contact_force(p_ws, cid, 'form', vals);
  end if;
  return up;
end;
$_$;

ALTER FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) OWNER TO postgres;

-- function: form_create(uuid, text, jsonb, uuid, text)
CREATE FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid DEFAULT NULL::uuid, p_kind text DEFAULT 'built'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if p_brand_kit is not null and not exists (select 1 from brand_kits where id = p_brand_kit and workspace_id = p_ws) then
    raise exception 'Brand kit not found';
  end if;
  insert into forms (workspace_id, name, draft, brand_kit_id, created_by, kind)
  values (p_ws, coalesce(nullif(trim(left(p_name, 120)), ''), 'Untitled form'), coalesce(p_draft, '{}'), p_brand_kit, auth.uid(), coalesce(p_kind, 'built'))
  returning id into fid;
  return fid;
end;
$$;

ALTER FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text) OWNER TO postgres;

-- function: form_delete(uuid)
CREATE FUNCTION public.form_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  delete from forms where id = p_id;
end;
$$;

ALTER FUNCTION public.form_delete(p_id uuid) OWNER TO postgres;

-- function: form_deliveries_by_dest(uuid, text, timestamp with time zone)
CREATE FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform form_member(p_form);
  return coalesce((
    select jsonb_object_agg(x.destination_id, x.n) from (
      select d.destination_id, count(*) n
      from form_destinations fd join deliveries d on d.destination_id = fd.id
      where fd.form_id = p_form and d.status = p_status and d.created_at >= p_since
      group by d.destination_id
    ) x), '{}'::jsonb);
end;
$$;

ALTER FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) OWNER TO postgres;

-- function: form_destination_delete(uuid)
CREATE FUNCTION public.form_destination_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d form_destinations%rowtype;
begin
  select * into d from form_destinations where id = p_id;
  if d.id is null or not is_member(d.workspace_id) then
    raise exception 'Destination not found';
  end if;
  delete from form_destinations where id = p_id;
end;
$$;

ALTER FUNCTION public.form_destination_delete(p_id uuid) OWNER TO postgres;

-- function: form_destination_pause(uuid, boolean)
CREATE FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d form_destinations%rowtype;
begin
  select * into d from form_destinations where id = p_id for update;
  if d.id is null or not is_member(d.workspace_id) then
    raise exception 'Destination not found';
  end if;
  update form_destinations set paused = p_paused where id = p_id;
  if not p_paused and exists (select 1 from deliveries where destination_id = p_id and status = 'held') then
    perform enqueue_job(d.workspace_id, 'deliver_held', p_id::text, jsonb_build_object('destination_id', p_id), 0, 6);
  end if;
end;
$$;

ALTER FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) OWNER TO postgres;

-- function: form_destination_save(uuid, uuid, uuid, text, uuid, text, jsonb, text, text)
CREATE FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
  did uuid;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not exists (select 1 from workspace_members where workspace_id = f.workspace_id and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  if p_source is not null and not exists (select 1 from sources where id = p_source and workspace_id = f.workspace_id and status <> 'disconnected') then
    raise exception 'Connect that tool first';
  end if;
  if p_kind in ('slack', 'webhook') and p_id is null and p_sealed is null then
    raise exception 'Add the address';
  end if;
  if p_id is null then
    insert into form_destinations (workspace_id, form_id, kind, source_id, name, config, mode, position)
    values (f.workspace_id, p_form, p_kind, p_source, left(p_name, 120), coalesce(p_config, '{}'), coalesce(p_mode, 'upsert'),
            coalesce((select max(position) + 1 from form_destinations where form_id = p_form), 0))
    returning id into did;
  else
    update form_destinations set name = left(p_name, 120), config = coalesce(p_config, config), mode = coalesce(p_mode, mode)
    where id = p_id and form_id = p_form returning id into did;
    if did is null then
      raise exception 'Destination not found';
    end if;
  end if;
  if p_sealed is not null then
    insert into form_destination_secrets (destination_id, sealed) values (did, p_sealed)
    on conflict (destination_id) do update set sealed = excluded.sealed, updated_at = now();
  end if;
  return did;
end;
$$;

ALTER FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text) OWNER TO postgres;

-- function: form_draft_get(uuid, text)
CREATE FUNCTION public.form_draft_get(p_form uuid, p_token text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('answers', answers, 'step', step, 'email', email, 'page', page)
  from form_drafts where form_id = p_form and token = p_token and expires_at > now();
$$;

ALTER FUNCTION public.form_draft_get(p_form uuid, p_token text) OWNER TO postgres;

-- function: form_draft_info(uuid)
CREATE FUNCTION public.form_draft_info(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('form', f.name, 'form_id', f.id, 'workspace_id', d.workspace_id, 'email', d.email, 'token', d.token, 'page', d.page,
           'workspace', (select name from workspaces w where w.id = d.workspace_id), 'sending', meeting_sending(d.workspace_id))
  from form_drafts d join forms f on f.id = d.form_id where d.id = p_id and d.expires_at > now();
$$;

ALTER FUNCTION public.form_draft_info(p_id uuid) OWNER TO postgres;

-- function: form_draft_save(uuid, text, text, jsonb, integer, text)
CREATE FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  did uuid;
begin
  select f.workspace_id into ws from forms f where f.id = p_form and f.status = 'live';
  if ws is null then
    raise exception 'This form isn''t taking answers';
  end if;
  -- At most 200 saves a form an hour from everyone: a script can't fill the table.
  if (select count(*) from form_drafts where form_id = p_form and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many saves';
  end if;
  delete from form_drafts where expires_at < now();
  insert into form_drafts (workspace_id, form_id, token, email, answers, step, page) values (ws, p_form, p_token, p_email, p_answers, p_step, p_page) returning form_drafts.id into did;
  return did;
end;
$$;

ALTER FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) OWNER TO postgres;

-- function: form_field_seen(uuid, text, integer, jsonb, text, integer, boolean)
CREATE FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  f forms%rowtype;
  clean jsonb := '{}';
  k text;
  v jsonb;
  cur record;
begin
  if p_vid !~ '^[A-Za-z0-9_-]{8,64}$' or jsonb_typeof(p_fields) is distinct from 'object' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null or f.status <> 'live' or not exists (select 1 from form_versions where form_id = p_form and version = p_version) then return false; end if;
  for k, v in select * from jsonb_each(p_fields) limit 40 loop
    if k ~ '^[a-z0-9]{1,24}$' and jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 4
       and (select bool_and(jsonb_typeof(x) = 'number') from jsonb_array_elements(v) x) then
      clean := clean || jsonb_build_object(k, jsonb_build_array(
        least(greatest((v->>0)::numeric, 0), 1)::int, least(greatest((v->>1)::numeric, 0), 1)::int,
        least(greatest((v->>2)::numeric, 0), 50)::int, least(greatest((v->>3)::numeric, 0), 3600000)::int));
    end if;
  end loop;
  select * into cur from form_field_sessions where form_id = p_form and vid = p_vid and at > now() - interval '30 minutes' order by at desc limit 1 for update;
  if cur.form_id is not null then
    if cur.sent then return false; end if;
    update form_field_sessions set at = now(), version = p_version, fields = clean,
      left_field = case when coalesce(p_sent, false) or p_left !~ '^[a-z0-9]{1,24}$' then null else p_left end,
      step = greatest(cur.step, least(greatest(coalesce(p_step, 0), 0), 20)), sent = coalesce(p_sent, false)
    where form_id = cur.form_id and vid = cur.vid and started_at = cur.started_at;
    return true;
  end if;
  insert into form_field_sessions (form_id, workspace_id, vid, version, day, fields, left_field, step, sent)
  values (p_form, f.workspace_id, p_vid, p_version, (now() at time zone ws_tz(f.workspace_id))::date, clean,
    case when coalesce(p_sent, false) or p_left !~ '^[a-z0-9]{1,24}$' then null else p_left end,
    least(greatest(coalesce(p_step, 0), 0), 20), coalesce(p_sent, false));
  return true;
end;
$_$;

ALTER FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) OWNER TO postgres;

-- function: form_fill_channels(uuid, jsonb)
CREATE FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  out jsonb;
begin
  perform form_member(p_form);
  select coalesce(jsonb_object_agg(t.channel, jsonb_build_object('fills', t.fills, 'booked', t.booked)), '{}') into out from (
    select coalesce(s.hidden->>'channel', 'none') as channel, count(*) as fills,
           count(*) filter (where exists (select 1 from form_bookings b where b.submission_id = s.id)
             or exists (select 1 from meetings m where m.submission_id = s.id and m.status <> 'canceled')) as booked
    from form_fill_set(p_form, coalesce(p_filters, '{}') - 'channel') x
    join submissions s on s.id = x.id
    group by 1
  ) t;
  return out;
end;
$$;

ALTER FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb) OWNER TO postgres;

-- function: form_fill_count(uuid, jsonb)
CREATE FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS bigint
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n bigint;
begin
  perform form_member(p_form);
  select count(*) into n from form_fill_set(p_form, coalesce(p_filters, '{}'));
  return n;
end;
$$;

ALTER FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb) OWNER TO postgres;

-- function: form_fill_ids(uuid, jsonb, timestamp with time zone, uuid, integer)
CREATE FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb DEFAULT '{}'::jsonb, p_after_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50) RETURNS uuid[]
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ids uuid[];
begin
  perform form_member(p_form);
  select coalesce(array_agg(t.id order by t.created_at desc, t.id desc), '{}') into ids from (
    select x.id, x.created_at from form_fill_set(p_form, coalesce(p_filters, '{}')) x
    where p_after_at is null or (x.created_at, x.id) < (p_after_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by x.created_at desc, x.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
  ) t;
  return ids;
end;
$$;

ALTER FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer) OWNER TO postgres;

-- function: form_fill_set(uuid, jsonb)
CREATE FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) RETURNS TABLE(id uuid, created_at timestamp with time zone)
    LANGUAGE sql STABLE
    AS $$
  select s.id, s.created_at from public.submissions s
  where s.form_id = p_form
    and case coalesce(p_f->>'kind', 'leads') when 'spam' then s.spam when 'tests' then s.test and not s.spam else not s.test and not s.spam end
    and (public.fill_query(p_f->>'q') is null or s.search @@ public.fill_query(p_f->>'q'))
    and (p_f->>'from' is null or s.created_at >= (p_f->>'from')::timestamptz)
    and (p_f->>'to' is null or s.created_at < (p_f->>'to')::timestamptz)
    and case p_f->>'status'
      when 'failed' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'failed')
      when 'waiting' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status in ('queued', 'sending', 'retrying', 'held'))
      when 'sent' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'done')
        and not exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status not in ('done', 'skipped'))
      else true end
    and (jsonb_typeof(p_f->'booked') is distinct from 'boolean'
      or (p_f->>'booked')::boolean = (exists (select 1 from public.form_bookings b where b.submission_id = s.id)
        or exists (select 1 from public.meetings m where m.submission_id = s.id and m.status <> 'canceled')))
    and (p_f->>'channel' is null or s.hidden->>'channel' = p_f->>'channel')
    and (p_f->>'key' is null
      or s."values"->(p_f->>'key') = to_jsonb(p_f->>'value')
      or s."values"->(p_f->>'key') @> jsonb_build_array(p_f->>'value')
      or (s."values"->(p_f->>'key'))::text = (p_f->>'value'));
$$;

ALTER FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) OWNER TO postgres;

-- function: form_folder_delete(uuid, uuid)
CREATE FUNCTION public.form_folder_delete(p_ws uuid, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from form_folders where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

ALTER FUNCTION public.form_folder_delete(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: form_folder_move(uuid, uuid, integer)
CREATE FUNCTION public.form_folder_move(p_ws uuid, p_id uuid, p_by integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ids uuid[];
  i int;
  j int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select array_agg(id order by position, created_at) into ids from form_folders where workspace_id = p_ws;
  i := array_position(ids, p_id);
  if i is null then raise exception 'Folder not found'; end if;
  j := i + sign(p_by)::int;
  if j < 1 or j > cardinality(ids) then return false; end if;
  ids[i] := ids[j];
  ids[j] := p_id;
  update form_folders f set position = x.ord - 1 from unnest(ids) with ordinality x(id, ord) where f.id = x.id;
  return true;
end;
$$;

ALTER FUNCTION public.form_folder_move(p_ws uuid, p_id uuid, p_by integer) OWNER TO postgres;

-- function: form_folder_save(uuid, uuid, text)
CREATE FUNCTION public.form_folder_save(p_ws uuid, p_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name the folder'; end if;
  if p_id is null then
    if (select count(*) from form_folders where workspace_id = p_ws) >= 100 then raise exception 'Up to 100 folders'; end if;
    insert into form_folders (workspace_id, name, position)
    values (p_ws, left(btrim(p_name), 60), coalesce((select max(position) + 1 from form_folders where workspace_id = p_ws), 0))
    returning id into fid;
    return fid;
  end if;
  update form_folders set name = left(btrim(p_name), 60) where id = p_id and workspace_id = p_ws returning id into fid;
  if fid is null then raise exception 'Folder not found'; end if;
  return fid;
end;
$$;

ALTER FUNCTION public.form_folder_save(p_ws uuid, p_id uuid, p_name text) OWNER TO postgres;

-- function: form_hour_count(uuid)
CREATE FUNCTION public.form_hour_count(p_form uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int from submissions
  where form_id = p_form and not spam and not test and created_at > now() - interval '1 hour';
$$;

ALTER FUNCTION public.form_hour_count(p_form uuid) OWNER TO postgres;

-- function: form_journey_follows(uuid)
CREATE FUNCTION public.form_journey_follows(p_submission uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1 from submissions s
    join workflows w on w.workspace_id = s.workspace_id and w.status = 'live' and w.trigger_kind = 'not_booked'
    join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
    where s.id = p_submission
      and (coalesce(jsonb_array_length(v.body->'trigger'->'forms'), 0) = 0 or v.body->'trigger'->'forms' ? s.form_id::text)
  );
$$;

ALTER FUNCTION public.form_journey_follows(p_submission uuid) OWNER TO postgres;

-- function: form_left_early(uuid, date, integer)
CREATE FUNCTION public.form_left_early(p_form uuid, p_from date DEFAULT NULL::date, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  out jsonb;
begin
  perform form_member(p_form);
  with s as (
    select started_at, left_field, step from form_field_sessions
    where form_id = p_form and not sent and (p_from is null or day >= p_from)
  )
  select jsonb_build_object(
    'count', (select count(*) from s),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
      select * from s order by started_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

ALTER FUNCTION public.form_left_early(p_form uuid, p_from date, p_limit integer) OWNER TO postgres;

-- function: form_link(uuid)
CREATE FUNCTION public.form_link(p_form uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  return jsonb_build_object('ws', booking_slug_ensure(f.workspace_id), 'slug', f.slug);
end $$;

ALTER FUNCTION public.form_link(p_form uuid) OWNER TO postgres;

-- function: form_member(uuid)
CREATE FUNCTION public.form_member(p_form uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null or not is_member(ws) then
    raise exception 'Form not found';
  end if;
  return ws;
end;
$$;

ALTER FUNCTION public.form_member(p_form uuid) OWNER TO postgres;

-- function: form_not_booked_note(uuid, uuid, uuid, uuid)
CREATE FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'form', f.name,
    'test', s.test,
    'not_booked', s.not_booked_at is not null,
    'booked', exists (select 1 from meetings m where m.submission_id = s.id and m.status in ('booked', 'held', 'no_show', 'pending_payment')),
    'contact', (select jsonb_build_object('email', c.email, 'first_name', c.first_name, 'last_name', c.last_name) from contacts c where c.id = s.contact_id),
    'type', (select t.name from meeting_types t where t.id = p_type and t.workspace_id = s.workspace_id),
    'host', case when p_host is null then null else meeting_people(s.workspace_id, array[p_host])->0->>'name' end,
    'paused', d.paused,
    'sealed', (select sealed from form_destination_secrets where destination_id = d.id))
  from submissions s
  join forms f on f.id = s.form_id
  join form_destinations d on d.id = p_destination and d.form_id = s.form_id and d.kind = 'slack'
  where s.id = p_submission;
$$;

ALTER FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) OWNER TO postgres;

-- function: form_not_booked_targets(uuid)
CREATE FUNCTION public.form_not_booked_targets(p_submission uuid) RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(d.id order by d.position, d.created_at), '{}')
  from submissions s join form_destinations d on d.form_id = s.form_id
  where s.id = p_submission and d.kind = 'slack' and not d.paused and not s.spam;
$$;

ALTER FUNCTION public.form_not_booked_targets(p_submission uuid) OWNER TO postgres;

-- function: form_notify_claim(uuid, text[])
CREATE FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) RETURNS text[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  with ins as (
    insert into form_notify_sent (submission_id, part) select p_sid, x from unnest(p_parts) x where x ~ '^(alert:[^\s]{3,254}|slack|reply)$'
    on conflict do nothing returning part)
  select coalesce(array_agg(part), '{}') from ins;
$_$;

ALTER FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) OWNER TO postgres;

-- function: form_notify_info(uuid)
CREATE FUNCTION public.form_notify_info(p_sid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  with s as (select * from submissions where id = p_sid),
  run as (select r.* from router_runs r, s where r.workspace_id = s.workspace_id and r.key = 'form:' || s.id::text),
  meet as (
    select coalesce(
      (select case when run.by = 'fallback' then v.body->'fallback'->>'meet'
                   else (select x->>'meet' from jsonb_array_elements(v.body->'rules'->'list') x where x->>'id' = run.rule_id limit 1) end
       from run join router_versions v on v.workspace_id = run.workspace_id and v.version = run.version where run.kind = 'owner'),
      (select fv.body->'after'->'schedule'->>'meetingTypeId' from s join form_versions fv on fv.form_id = s.form_id and fv.version = s.form_version)) as id
  )
  select jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'workspace_id', s.workspace_id, 'form_id', s.form_id, 'values', s."values",
                                     'spam', s.spam, 'test', s.test, 'contact_id', s.contact_id, 'created_at', s.created_at),
    'form', f.name,
    'body', v.body,
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'email_class', c.email_class,
      'first_name', c.first_name, 'last_name', c.last_name, 'company', (select co.name from companies co where co.id = c.company_id),
      'owner', c.owner_user_id) end,
    'owner', case when c.owner_user_id is null then null else meeting_people(s.workspace_id, array[c.owner_user_id])->0 end,
    'handle', (select coalesce(bp.handle, bp.slug) from booking_profiles bp where bp.workspace_id = s.workspace_id and bp.user_id = c.owner_user_id),
    'workspace', (select name from workspaces w where w.id = s.workspace_id),
    'sealed', (select sealed from router_secrets r where r.workspace_id = s.workspace_id),
    'sending', meeting_sending(s.workspace_id),
    'sent', coalesce((select jsonb_agg(n.part) from form_notify_sent n where n.submission_id = s.id), '[]'),
    'routing', case when not exists (select 1 from routers rt where rt.workspace_id = s.workspace_id and rt.live_version is not null and rt.paused_at is null) then 'none'
                    when exists (select 1 from run) then 'done' else 'pending' end,
    'booked', exists (select 1 from meetings m where m.submission_id = s.id and m.workspace_id = s.workspace_id and m.status in ('booked', 'pending_payment', 'held'))
              or (c.id is not null and exists (select 1 from meetings m where m.contact_id = c.id and m.workspace_id = s.workspace_id
                                                 and m.status in ('booked', 'pending_payment', 'held') and m.created_at >= s.created_at)),
    'meet', (select jsonb_build_object('id', t.id, 'slug', t.slug) from meeting_types t, meet
             where meet.id ~ '^[0-9a-f-]{36}$' and t.id = meet.id::uuid and t.workspace_id = s.workspace_id and t.active and not t.secret))
  from s
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id;
$_$;

ALTER FUNCTION public.form_notify_info(p_sid uuid) OWNER TO postgres;

-- function: form_notify_unclaim(uuid, text[])
CREATE FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from form_notify_sent where submission_id = p_sid and part = any(p_parts);
$$;

ALTER FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) OWNER TO postgres;

-- function: form_page_stats(uuid)
CREATE FUNCTION public.form_page_stats(p_form uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform form_member(p_form);
  return jsonb_build_object(
    'published', (select v.body from forms f join form_versions v on v.form_id = f.id and v.version = f.version where f.id = p_form),
    'subs', (select count(*) from submissions s where s.form_id = p_form and not s.spam and not s.test),
    'failed', coalesce((
      select jsonb_object_agg(x.destination_id, x.n) from (
        select d.destination_id, count(*) n
        from form_destinations fd join deliveries d on d.destination_id = fd.id
        where fd.form_id = p_form and d.status = 'failed' and d.created_at >= now() - interval '7 days'
        group by d.destination_id
      ) x), '{}'::jsonb),
    'pages', (
      select count(distinct s.hidden->>'page') from submissions s
      where s.form_id = p_form and not s.test and not s.spam and s.created_at >= now() - interval '30 days'
        and s.hidden ? 'page' and s.hidden->>'page' !~ '/f/[0-9a-f-]{36}')
  );
end;
$$;

ALTER FUNCTION public.form_page_stats(p_form uuid) OWNER TO postgres;

-- function: form_public(uuid)
CREATE FUNCTION public.form_public(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'logo_url', k.logo_url, 'studio_css', k.studio_css, 'kit_notes', coalesce(to_jsonb(k.notes), '[]'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

ALTER FUNCTION public.form_public(p_id uuid) OWNER TO postgres;

-- function: form_publish(uuid, uuid, jsonb)
CREATE FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
  v int;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not exists (select 1 from workspace_members where workspace_id = f.workspace_id and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  v := f.version + 1;
  insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, p_user);
  update forms set version = v, live_kit_id = brand_kit_id, status = case when status = 'paused' then 'paused' else 'live' end, published_at = now(), updated_at = now() where id = p_id;
  return v;
end;
$$;

ALTER FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) OWNER TO postgres;

-- function: form_results_columns(uuid, text[])
CREATE FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  perform form_member(p_form);
  if p_cols is not null and (cardinality(p_cols) > 40 or exists (select 1 from unnest(p_cols) c where c !~ '^[a-z][a-z0-9_.:]{0,59}$')) then
    raise exception 'Bad columns';
  end if;
  update forms set results_columns = p_cols where id = p_form;
end;
$_$;

ALTER FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) OWNER TO postgres;

-- function: form_results_request(uuid, uuid, text)
CREATE FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s record;
begin
  select sb.id, sb.workspace_id, sb.idem_key, sb.spam, sb.test, c.email into s
  from submissions sb left join contacts c on c.id = sb.contact_id
  where sb.id = p_sid and sb.form_id = p_form;
  if not found or s.idem_key is distinct from p_key then return 'not_found'; end if;
  if s.spam or s.test then return 'not_sent'; end if;
  if s.email is null then return 'no_email'; end if;
  if not exists (select 1 from submission_results r where r.submission_id = p_sid) then return 'no_result'; end if;
  perform enqueue_job(s.workspace_id, 'form_notify', 'form_results:' || p_sid, jsonb_build_object('submission', p_sid, 'only', 'results'));
  return 'queued';
end;
$$;

ALTER FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) OWNER TO postgres;

-- function: form_save(uuid, text, jsonb, integer, uuid)
CREATE FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if f.draft_rev <> p_rev then
    raise exception 'This form changed in another window. Reload to see the latest.';
  end if;
  if p_brand_kit is not null and not exists (select 1 from brand_kits where id = p_brand_kit and workspace_id = f.workspace_id) then
    raise exception 'Brand kit not found';
  end if;
  update forms set name = coalesce(nullif(trim(left(p_name, 120)), ''), name), draft = coalesce(p_draft, draft),
         brand_kit_id = p_brand_kit, draft_rev = draft_rev + 1, updated_at = now()
  where id = p_id;
  return f.draft_rev + 1;
end;
$$;

ALTER FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid) OWNER TO postgres;

-- function: form_seen(uuid, text, text)
CREATE FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  f forms%rowtype;
  hit boolean;
begin
  if p_kind not in ('view', 'start', 'result') or p_vid !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null then return false; end if;
  insert into form_seen (form_id, vid, kind, at) values (p_form, p_vid, p_kind, now())
  on conflict (form_id, vid, kind) do update set at = now() where form_seen.at < now() - interval '30 minutes'
  returning true into hit;
  if not coalesce(hit, false) then return false; end if;
  insert into form_daily (form_id, workspace_id, day, views, starts, results)
  values (p_form, f.workspace_id, (now() at time zone ws_tz(f.workspace_id))::date, (p_kind = 'view')::int, (p_kind = 'start')::int, (p_kind = 'result')::int)
  on conflict (form_id, day) do update set views = form_daily.views + excluded.views, starts = form_daily.starts + excluded.starts, results = form_daily.results + excluded.results;
  return true;
end;
$_$;

ALTER FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) OWNER TO postgres;

-- function: form_seen_pages(uuid, timestamp with time zone)
CREATE FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  perform form_member(p_form);
  return coalesce((
    select jsonb_agg(jsonb_build_array(top.key, jsonb_build_object('last', top.last, 'blocked', top.blocked)) order by top.blocked, top.last desc)
    from (
      select t.key, t.last, t.blocked
      from (
        select distinct on (k.key) k.key, k.created_at last, k.blocked
        from (
          select case when s.blocked then split_part(s.p, '/', 1) else s.p end key, s.created_at, s.blocked
          from (
            select x.created_at, x.spam and coalesce(x.spam_reason, '') = 'site' blocked,
                   regexp_replace(regexp_replace(regexp_replace(x.hidden->>'page', '^https?://', ''), '^www\.', ''), '/$', '') p
            from submissions x
            where x.form_id = p_form and not x.test and x.created_at >= p_since and x.hidden ? 'page'
          ) s
          where s.p <> '' and s.p !~ '/f/[0-9a-f-]{36}'
        ) k
        order by k.key, k.created_at desc
      ) t
      order by t.blocked, t.last desc
      limit 12
    ) top
  ), '[]'::jsonb);
end;
$_$;

ALTER FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) OWNER TO postgres;

-- function: form_set_folder(uuid, uuid, uuid)
CREATE FUNCTION public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_folder is not null and not exists (select 1 from form_folders where id = p_folder and workspace_id = p_ws) then raise exception 'Folder not found'; end if;
  update forms set folder_id = p_folder where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

ALTER FUNCTION public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) OWNER TO postgres;

-- function: form_set_slug(uuid, text)
CREATE FUNCTION public.form_set_slug(p_form uuid, p_slug text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  f forms;
  s text := nullif(lower(trim(coalesce(p_slug, ''))), '');
begin
  select * into f from forms where id = p_form for update;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  if s is not null and s !~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' then
    raise exception 'Use lowercase letters, numbers and dashes, up to 50';
  end if;
  if s is not distinct from f.slug then return form_link(p_form); end if;
  if s is not null and (
    exists (select 1 from forms o where o.workspace_id = f.workspace_id and o.slug = s and o.id <> f.id)
    or exists (select 1 from form_slug_moves m where m.workspace_id = f.workspace_id and m.slug = s and m.form_id <> f.id and m.until > now())
  ) then
    raise exception 'That ending is taken';
  end if;
  -- The old ending keeps opening this form for 90 days.
  if f.slug is not null then
    insert into form_slug_moves (workspace_id, slug, form_id, until) values (f.workspace_id, f.slug, f.id, now() + interval '90 days')
    on conflict (workspace_id, slug) do update set form_id = excluded.form_id, until = excluded.until;
  end if;
  if s is not null then delete from form_slug_moves where workspace_id = f.workspace_id and slug = s; end if;
  update forms set slug = s, updated_at = now() where id = f.id;
  return form_link(p_form);
end $_$;

ALTER FUNCTION public.form_set_slug(p_form uuid, p_slug text) OWNER TO postgres;

-- function: form_set_status(uuid, text)
CREATE FUNCTION public.form_set_status(p_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if p_status not in ('live', 'paused') then
    raise exception 'Pick live or paused';
  end if;
  if f.version = 0 then
    raise exception 'Publish the form first';
  end if;
  update forms set status = p_status, updated_at = now() where id = p_id;
end;
$$;

ALTER FUNCTION public.form_set_status(p_id uuid, p_status text) OWNER TO postgres;

-- function: form_submissions_clear(uuid)
CREATE FUNCTION public.form_submissions_clear(p_form uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null or not is_member(ws) then
    raise exception 'Form not found';
  end if;
  delete from submissions where form_id = p_form;
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.form_submissions_clear(p_form uuid) OWNER TO postgres;

-- function: form_submit(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)
CREATE FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
  sid uuid;
  cid uuid;
begin
  select * into f from forms where id = p_form;
  -- A test fill (the Test button) also runs on a paused form.
  if f.id is null or (f.status <> 'live' and not (coalesce(p_test, false) and f.status = 'paused')) then
    raise exception 'This form isn''t taking answers';
  end if;
  if not exists (select 1 from form_versions where form_id = p_form and version = p_version) then
    raise exception 'Unknown form version';
  end if;

  insert into submissions (workspace_id, form_id, form_version, idem_key, "values", hidden, consent, country, spam, spam_reason, test)
  values (f.workspace_id, p_form, p_version, p_idem, coalesce(p_values, '{}'), coalesce(p_hidden, '{}'), coalesce(p_consent, '{}'),
          nullif(p_country, ''), p_spam is not null, p_spam, coalesce(p_test, false))
  on conflict (workspace_id, idem_key) do nothing
  returning id into sid;
  if sid is null then
    select id, contact_id into sid, cid from submissions where workspace_id = f.workspace_id and idem_key = p_idem;
    return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', true);
  end if;
  if p_spam is not null or p_contact is null then
    return jsonb_build_object('id', sid, 'contact_id', null, 'repeat', false);
  end if;
  -- The basis comes from the consent box, never from the row; the overwrite policy is applied in form_contact_write.
  cid := submission_accept(sid, p_contact, p_consent);
  return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', false);
end;
$$;

ALTER FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) OWNER TO postgres;

-- function: form_submit_all(uuid, integer, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)
CREATE FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b jsonb;
  ws uuid;
  per numeric;
  spam text := p_spam;
  contact jsonb := p_contact;
  r jsonb;
  sid text;
begin
  select v.body, f.workspace_id into b, ws from form_versions v join forms f on f.id = v.form_id where v.form_id = p_form and v.version = p_version;
  -- Past the hourly limit (submissions in the last hour, spam and tests aside): kept in Spam, never a contact.
  per := case when jsonb_typeof(b->'spam'->'perHour') = 'number' then (b->'spam'->>'perHour')::numeric end;
  if spam is null and not coalesce(p_test, false) and per > 0 and form_hour_count(p_form) >= per then
    spam := 'rate';
    contact := null;
  end if;
  -- form_submit refuses a form that isn't live and a version it doesn't have.
  r := form_submit(p_form, p_version, p_idem, p_values, p_hidden, contact, p_consent, p_country, spam, p_test);
  sid := r->>'id';
  -- The alerts go now (the job waits for routing); the auto-reply 5 minutes later. The key is the submission's, so a
  -- repeat never queues twice.
  if not coalesce((r->>'repeat')::boolean, false) and spam is null and not coalesce(p_test, false) and sid is not null then
    if b->'notify'->'on' = 'true'::jsonb then
      perform enqueue_job(ws, 'form_notify', 'form_notify:' || sid, jsonb_build_object('submission', sid, 'only', 'alerts'));
    end if;
    if b->'reply'->'on' = 'true'::jsonb then
      perform enqueue_job(ws, 'form_notify', 'form_reply:' || sid, jsonb_build_object('submission', sid, 'only', 'reply'), 300);
    end if;
  end if;
  return r || jsonb_build_object('spam', spam, 'notified', true);
end;
$$;

ALTER FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) OWNER TO postgres;

-- function: form_to_studio(uuid, integer, jsonb, jsonb)
CREATE FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
  v int;
  did_draft boolean := false;
  did_live boolean := false;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null then
    return jsonb_build_object('draft', false, 'live', false);
  end if;
  v := f.version;
  if p_draft is not null and jsonb_typeof(p_draft) = 'object' and p_draft ? 'page'
     and not (f.draft ? 'page') and not (f.draft ? 'capture') then
    update forms set draft = p_draft, draft_rev = draft_rev + 1, updated_at = now() where id = p_id;
    did_draft := true;
  end if;
  if p_body is not null and jsonb_typeof(p_body) = 'object' and p_body ? 'page' and f.version > 0 and f.version = p_version
     and exists (select 1 from form_versions where form_id = p_id and version = f.version and not (body ? 'page') and not (body ? 'capture')) then
    v := f.version + 1;
    insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, null);
    update forms set version = v where id = p_id;
    did_live := true;
  end if;
  return jsonb_build_object('draft', did_draft, 'live', did_live, 'version', v);
end;
$$;

ALTER FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) OWNER TO postgres;

-- function: form_upload_add(uuid, text, text, text, text, integer)
CREATE FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  id uuid;
begin
  select workspace_id into ws from forms where forms.id = p_form;
  if ws is null then raise exception 'Form not found'; end if;
  insert into form_uploads (workspace_id, form_id, field_id, path, name, kind, bytes) values (ws, p_form, p_field, p_path, p_name, p_kind, p_bytes) returning form_uploads.id into id;
  return id;
end;
$$;

ALTER FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) OWNER TO postgres;

-- function: form_upload_path(uuid)
CREATE FUNCTION public.form_upload_path(p_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select path from form_uploads where id = p_id and is_member(workspace_id);
$$;

ALTER FUNCTION public.form_upload_path(p_id uuid) OWNER TO postgres;

-- function: form_uploads_attach(uuid, uuid[])
CREATE FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  update form_uploads u set submission_id = p_sid
  from submissions s
  where s.id = p_sid and u.id = any(p_ids) and u.form_id = s.form_id and u.submission_id is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) OWNER TO postgres;

-- function: form_uploads_of(uuid)
CREATE FUNCTION public.form_uploads_of(p_sid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'name', u.name, 'kind', u.kind, 'bytes', u.bytes) order by u.created_at), '[]')
  from form_uploads u where u.submission_id = p_sid;
$$;

ALTER FUNCTION public.form_uploads_of(p_sid uuid) OWNER TO postgres;

-- function: form_uploads_stale()
CREATE FUNCTION public.form_uploads_stale() RETURNS text[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  paths text[];
begin
  with gone as (delete from form_uploads where submission_id is null and created_at < now() - interval '1 day' returning path)
  select coalesce(array_agg(path), '{}') into paths from gone;
  return paths;
end;
$$;

ALTER FUNCTION public.form_uploads_stale() OWNER TO postgres;

-- function: form_version_body(uuid, integer)
CREATE FUNCTION public.form_version_body(p_form uuid, p_version integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select body from form_versions where form_id = p_form and version = p_version;
$$;

ALTER FUNCTION public.form_version_body(p_form uuid, p_version integer) OWNER TO postgres;

-- function: forms_keep_prune()
CREATE FUNCTION public.forms_keep_prune() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  n int := 0;
  r record;
begin
  for r in
    select f.id, (v.body->'keep'->>'days')::int as days
    from forms f join form_versions v on v.form_id = f.id and v.version = f.version
    where f.version > 0 and v.body->'keep'->>'days' ~ '^[0-9]{1,5}$' and (v.body->'keep'->>'days')::int >= 1
  loop
    n := n + prune_batch('public.submissions', format('form_id = %L and created_at < %L', r.id, now() - make_interval(days => r.days)), 50000);
  end loop;
  return n;
end;
$_$;

ALTER FUNCTION public.forms_keep_prune() OWNER TO postgres;

-- function: forms_list(uuid)
CREATE FUNCTION public.forms_list(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with z as (select tz, (now() at time zone tz)::date as day0 from (select ws_tz(p_ws) as tz) t)
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status, 'kind', f.kind, 'version', f.version, 'updated_at', f.updated_at, 'brand_kit_id', f.brand_kit_id,
           'fills', coalesce(s.fills, 0), 'last_fill', l.last_fill, 'failed', coalesce(d.failed, 0), 'check', k.status,
           'week', coalesce(w.week, 0), 'spark', coalesce(w.spark, '[0,0,0,0,0,0,0]'::jsonb), 'views', coalesce(v.views, 0),
           'pages', coalesce(p.pages, 0), 'page', p.page, 'hosted', coalesce(p.hosted, false),
           'edited', f.version > 0 and f.draft is distinct from (select x.body from form_versions x where x.form_id = f.id and x.version = f.version))
         order by f.updated_at desc), '[]'::jsonb)
  from forms f
  cross join z
  left join lateral (
    select count(*) fills from submissions x
    where x.form_id = f.id and not x.spam and not x.test and x.created_at > now() - interval '30 days'
  ) s on true
  left join lateral (
    select x.created_at last_fill from submissions x where x.form_id = f.id and not x.spam and not x.test order by x.created_at desc limit 1
  ) l on true
  left join lateral (
    select count(*) failed from deliveries y join form_destinations fd on fd.id = y.destination_id where fd.form_id = f.id and y.status = 'failed'
  ) d on true
  left join lateral (select c.status from form_checks c where c.form_id = f.id order by c.started_at desc limit 1) k on true
  left join lateral (
    select sum(n)::int week, jsonb_agg(n order by g) spark from (
      select g, (select count(*) from submissions x
                 where x.form_id = f.id and not x.spam and not x.test
                   and x.created_at >= ((z.day0 - g)::timestamp at time zone z.tz)
                   and x.created_at < ((z.day0 - g + 1)::timestamp at time zone z.tz)) n
      from generate_series(6, 0, -1) g
    ) t
  ) w on true
  left join lateral (
    select sum(y.views)::int views from form_daily y where y.form_id = f.id and y.day > current_date - 30
  ) v on true
  left join lateral (
    select count(distinct x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') pages,
           min(x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') page,
           bool_or(x.hidden->>'page' ~ '/f/[0-9a-f-]{36}') hosted
    from submissions x where x.form_id = f.id and not x.test and x.created_at > now() - interval '30 days' and x.hidden ? 'page'
  ) p on true
  where f.workspace_id = p_ws and is_member(p_ws);
$$;

ALTER FUNCTION public.forms_list(p_ws uuid) OWNER TO postgres;

-- function: github_links_prepare()
CREATE FUNCTION public.github_links_prepare() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then
    raise exception 'Project not found';
  end if;
  if not exists (select 1 from environments where id = new.environment_id and project_id = new.project_id) then
    raise exception 'Pick an environment from this project';
  end if;
  if not exists (select 1 from github_installations where id = new.installation_id and workspace_id = new.workspace_id) then
    raise exception 'Connect GitHub to this workspace first';
  end if;
  if new.scope = 'use_case' and coalesce(new.use_case, '') = '' then
    raise exception 'Pick a use case';
  end if;
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.github_links_prepare() OWNER TO postgres;

-- function: github_start_check(uuid, text, integer, text)
CREATE FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text DEFAULT NULL::text) RETURNS SETOF public.github_checks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  l github_links;
  e environments;
  t tests;
  u record;
  c github_checks;
  ids uuid[] := '{}';
  url text;
begin
  select * into l from github_links where id = p_link and enabled;
  if l.id is null then
    return;
  end if;
  select * into e from environments where id = l.environment_id;
  url := coalesce(nullif(trim(p_base_url), ''), e.base_url);
  if url !~ '^https?://[^\s/]+' then
    raise exception 'Not a web address: %', url;
  end if;
  e.base_url := url;
  if exists (select 1 from github_checks where link_id = l.id and head_sha = p_sha and base_url = url and status = 'pending') then
    return;
  end if;

  select * into u from workspace_usage(l.workspace_id);
  if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
    insert into github_checks (workspace_id, link_id, installation_id, repo_full_name, head_sha, pr_number, base_url, status, conclusion, error)
    values (l.workspace_id, l.id, l.installation_id, l.repo_full_name, p_sha, p_pr, url, 'done', 'neutral', 'This month''s cloud minutes are used up.')
    returning * into c;
    return next c;
    return;
  end if;

  for t in
    select * from tests
    where project_id = l.project_id
      and jsonb_array_length(coalesce(steps, '[]')) > 0
      and (l.scope = 'all' or use_case = l.use_case)
    order by use_case, name
    limit 50
  loop
    ids := ids || queue_run(t, e, 'ci', l.created_by);
  end loop;

  insert into github_checks (workspace_id, link_id, installation_id, repo_full_name, head_sha, pr_number, base_url, run_ids, status, conclusion, error)
  values (l.workspace_id, l.id, l.installation_id, l.repo_full_name, p_sha, p_pr, url, ids,
          case when cardinality(ids) = 0 then 'done' else 'pending' end,
          case when cardinality(ids) = 0 then 'neutral' end,
          case when cardinality(ids) = 0 then 'No tests with steps to run.' end)
  returning * into c;
  return next c;
end;
$$;

ALTER FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text) OWNER TO postgres;

-- function: github_start_check(uuid, text, integer, text, uuid[], jsonb, integer)
CREATE FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text DEFAULT NULL::text, p_test_ids uuid[] DEFAULT NULL::uuid[], p_selection jsonb DEFAULT NULL::jsonb, p_ai_calls integer DEFAULT 0) RETURNS SETOF public.github_checks
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  l github_links;
  e environments;
  t tests;
  u record;
  c github_checks;
  ids uuid[] := '{}';
  url text;
begin
  select * into l from github_links where id = p_link and enabled;
  if l.id is null then
    return;
  end if;
  select * into e from environments where id = l.environment_id;
  url := coalesce(nullif(trim(p_base_url), ''), e.base_url);
  if url !~ '^https?://[^\s/]+' then
    raise exception 'Not a web address: %', url;
  end if;
  e.base_url := url;
  if exists (select 1 from github_checks where link_id = l.id and head_sha = p_sha and base_url = url and status = 'pending') then
    return;
  end if;
  if p_test_ids is not null and cardinality(p_test_ids) = 0 then
    insert into github_checks (workspace_id, link_id, installation_id, repo_full_name, head_sha, pr_number, base_url, status, conclusion, error, selection, ai_calls)
    values (l.workspace_id, l.id, l.installation_id, l.repo_full_name, p_sha, p_pr, url, 'done', 'neutral', coalesce(p_selection ->> 'reason', 'No tests to run.'), p_selection, coalesce(p_ai_calls, 0))
    returning * into c;
    return next c;
    return;
  end if;
  select * into u from workspace_usage(l.workspace_id);
  if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
    insert into github_checks (workspace_id, link_id, installation_id, repo_full_name, head_sha, pr_number, base_url, status, conclusion, error, selection, ai_calls)
    values (l.workspace_id, l.id, l.installation_id, l.repo_full_name, p_sha, p_pr, url, 'done', 'neutral', 'This month''s cloud minutes are used up.', p_selection, coalesce(p_ai_calls, 0))
    returning * into c;
    return next c;
    return;
  end if;
  for t in
    select * from tests
    where project_id = l.project_id
      and jsonb_array_length(coalesce(steps, '[]')) > 0
      and (l.scope = 'all' or use_case = l.use_case)
      and (p_test_ids is null or id = any (p_test_ids))
    order by use_case, name
    limit 50
  loop
    ids := ids || queue_run(t, e, 'ci', l.created_by);
  end loop;
  insert into github_checks (workspace_id, link_id, installation_id, repo_full_name, head_sha, pr_number, base_url, run_ids, status, conclusion, error, selection, ai_calls)
  values (l.workspace_id, l.id, l.installation_id, l.repo_full_name, p_sha, p_pr, url, ids,
          case when cardinality(ids) = 0 then 'done' else 'pending' end,
          case when cardinality(ids) = 0 then 'neutral' end,
          case when cardinality(ids) = 0 then 'No tests with steps to run.' end, p_selection, coalesce(p_ai_calls, 0))
  returning * into c;
  return next c;
end;
$$;

ALTER FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer) OWNER TO postgres;

-- function: github_sync()
CREATE FUNCTION public.github_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  url text;
  secret text;
  last timestamptz;
begin
  select value into url from app_config where key = 'github_sync_url';
  select value into secret from app_config where key = 'github_sync_secret';
  if coalesce(url, '') = '' or to_regproc('net.http_post') is null then
    return;
  end if;
  select updated_at into last from app_config where key = 'github_last_sync';
  if last is not null and last > now() - interval '3 seconds' then
    return;
  end if;
  insert into app_config (key, value, updated_at) values ('github_last_sync', '', now())
  on conflict (key) do update set updated_at = now();
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := $2)'
  using url, jsonb_build_object('content-type', 'application/json', 'x-claritia-sync', secret);
end;
$_$;

ALTER FUNCTION public.github_sync() OWNER TO postgres;

-- function: heals_alert()
CREATE FUNCTION public.heals_alert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if alerts_on(new.project_id, 'heal') then
    insert into alert_events (workspace_id, project_id, kind, heal_id) values (new.workspace_id, new.project_id, 'heal', new.id);
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.heals_alert() OWNER TO postgres;

-- function: hook_events_done(bigint[])
CREATE FUNCTION public.hook_events_done(p_ids bigint[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update hook_events set done_at = now() where id = any(p_ids);
$$;

ALTER FUNCTION public.hook_events_done(p_ids bigint[]) OWNER TO postgres;

-- function: hook_events_take(uuid, integer)
CREATE FUNCTION public.hook_events_take(p_source uuid, p_limit integer DEFAULT 500) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'body', body) order by id), '[]')
  from (select id, body from hook_events where source_id = p_source and done_at is null order by id limit least(p_limit, 2000)) x;
$$;

ALTER FUNCTION public.hook_events_take(p_source uuid, p_limit integer) OWNER TO postgres;

-- function: hook_fill(uuid)
CREATE FUNCTION public.hook_fill(p_sub uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.hook_fill(p_sub uuid) OWNER TO postgres;

-- function: hook_stage(uuid, text, jsonb)
CREATE FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  n int;
begin
  select * into s from sources where id = p_source;
  if s.id is null or s.status = 'disconnected' then
    return false;
  end if;
  insert into hook_events (workspace_id, source_id, dedupe, body) values (s.workspace_id, p_source, left(p_dedupe, 300), p_body)
  on conflict (source_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n > 0 and s.status <> 'paused' then
    perform enqueue_job(s.workspace_id, 'source_hook', p_source::text, jsonb_build_object('source_id', p_source), 2, 8);
  end if;
  return n > 0;
end;
$$;

ALTER FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) OWNER TO postgres;

-- function: hook_stage_many(uuid, jsonb)
CREATE FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_events) is distinct from 'array' then raise exception 'p_events must be an array'; end if;
  if jsonb_array_length(p_events) > 5000 then raise exception 'Up to 5,000 events at a time'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if hook_stage(p_source, coalesce(e->>'dedupe', ''), coalesce(e->'body', '{}')) then n := n + 1; end if;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) OWNER TO postgres;

-- function: icp_fit(jsonb, text, text, text)
CREATE FUNCTION public.icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text) RETURNS integer
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
declare
  total numeric := 0;
  hit numeric := 0;
  missed boolean := false;
  k text;
  v text;
  r jsonb;
  w numeric;
begin
  if p_rules is null or jsonb_typeof(p_rules) <> 'object' then return null; end if;
  foreach k in array array['industries', 'sizes', 'countries'] loop
    r := p_rules->k;
    if r is null or jsonb_typeof(r->'values') <> 'array' or jsonb_array_length(r->'values') = 0 then continue; end if;
    w := coalesce((r->>'weight')::numeric, 0);
    if w <= 0 then continue; end if;
    v := case k when 'industries' then p_industry when 'sizes' then p_size else p_country end;
    total := total + w;
    if v is not null and exists (select 1 from jsonb_array_elements_text(r->'values') x where lower(x) = lower(v)) then
      hit := hit + w;
    elsif coalesce((r->>'required')::boolean, false) then
      missed := true;
    end if;
  end loop;
  if total = 0 then return null; end if;
  return case when missed then least(round(hit / total * 100), 30) else round(hit / total * 100) end;
end;
$$;

ALTER FUNCTION public.icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text) OWNER TO postgres;

-- function: import_undo(uuid)
CREATE FUNCTION public.import_undo(p_import uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  i imports%rowtype;
begin
  select * into i from imports where id = p_import;
  if i.id is null or not is_member(i.workspace_id) then
    raise exception 'Import not found';
  end if;
  if i.status <> 'done' or i.undo_until is null or i.undo_until < now() then
    raise exception 'This import can''t be undone';
  end if;
  update imports set status = 'undoing' where id = p_import;
  perform enqueue_job(i.workspace_id, 'import_undo', p_import::text, jsonb_build_object('import_id', p_import), 0, 3);
  insert into audit_log (workspace_id, actor, action, target) values (i.workspace_id, auth.uid(), 'contacts.import_undo', p_import::text);
end;
$$;

ALTER FUNCTION public.import_undo(p_import uuid) OWNER TO postgres;

-- function: inbox_prune()
CREATE FUNCTION public.inbox_prune() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  delete from inbox_messages where received_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.inbox_prune() OWNER TO postgres;

-- function: invite_info(uuid, timestamp with time zone)
CREATE FUNCTION public.invite_info(p_id uuid, p_sent_for timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'email', i.email,
    'workspace', w.name,
    'inviter', coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), ''), u.email),
    'inviter_email', lower(u.email))
  from invites i
  join workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.id = p_id and i.accepted_at is null and i.expires_at > now()
    and (p_sent_for is null or i.created_at = p_sent_for);
$$;

ALTER FUNCTION public.invite_info(p_id uuid, p_sent_for timestamp with time zone) OWNER TO postgres;

-- function: invite_member(uuid, text)
CREATE FUNCTION public.invite_member(p_ws uuid, p_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  e text := lower(trim(p_email));
  inv invites;
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can invite people';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email doesn''t look right';
  end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = e) then
    raise exception '% is already on the team', e;
  end if;
  insert into invites (workspace_id, email, invited_by) values (p_ws, e, auth.uid())
  on conflict (workspace_id, email) do update set invited_by = excluded.invited_by, created_at = now(), expires_at = now() + interval '30 days', accepted_at = null
  returning * into inv;
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'team.invite', e);
  perform enqueue_job(p_ws, 'invite_email', inv.id::text || ':' || (extract(epoch from inv.created_at) * 1000000)::bigint::text,
                      jsonb_build_object('invite', inv.id, 'sent_for', inv.created_at), 0, 5);
end;
$_$;

ALTER FUNCTION public.invite_member(p_ws uuid, p_email text) OWNER TO postgres;

-- function: is_member(uuid)
CREATE FUNCTION public.is_member(ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid());
$$;

ALTER FUNCTION public.is_member(ws uuid) OWNER TO postgres;

-- function: is_owner(uuid)
CREATE FUNCTION public.is_owner(ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from workspace_members where workspace_id = ws and user_id = auth.uid() and role = 'owner');
$$;

ALTER FUNCTION public.is_owner(ws uuid) OWNER TO postgres;

-- function: job_key_running(uuid, text, text)
CREATE FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select case when p_ws is null
              then exists (select 1 from public.jobs r where r.status = 'running' and r.kind = p_kind and r.key = p_key and r.workspace_id is null)
              else exists (select 1 from public.jobs r where r.status = 'running' and r.kind = p_kind and r.key = p_key and r.workspace_id = p_ws) end;
$$;

ALTER FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) OWNER TO postgres;

-- function: job_key_waiting(uuid, text, text)
CREATE FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select case when p_ws is null
              then exists (select 1 from public.jobs w where w.status = 'queued' and w.workspace_id is null and w.kind = p_kind and w.key = p_key)
              else exists (select 1 from public.jobs w where w.status = 'queued' and w.workspace_id = p_ws and w.kind = p_kind and w.key = p_key) end;
$$;

ALTER FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) OWNER TO postgres;

-- function: job_kind_removed(text)
CREATE FUNCTION public.job_kind_removed(p_kind text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_kind in (
    'stitch', 'device_reset', 'stitch_evidence', 'rebuild', 'privacy', 'identity_changed', 'ip_lookup',
    'enrich_company', 'enrich_contact', 'enrich_backfill', 'qualify', 'score_account', 'account_alert', 'score_refresh',
    'import_file', 'import_undo', 'source_pull', 'crm_push', 'crm_activity', 'segment_refresh'
  )
$$;

ALTER FUNCTION public.job_kind_removed(p_kind text) OWNER TO postgres;

-- function: job_priority(text, jsonb)
CREATE FUNCTION public.job_priority(p_kind text, p_payload jsonb DEFAULT '{}'::jsonb) RETURNS smallint
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select (case
    when p_payload->>'lane' = 'urgent' then 0
    when p_payload->>'lane' = 'bulk' then 2
    when p_kind = 'route' then
      case when p_payload->>'reason' in ('form', 'sla') then 0
           when p_payload->>'reason' in ('import', 'crm', 'again') then 2
           else 1 end
    when p_kind in ('meeting_sync', 'meeting_notify', 'meeting_remind', 'meeting_after', 'meeting_webhook', 'meeting_book_later',
                    'meeting_team_run', 'form_notify', 'form_not_booked', 'router_alert', 'router_sla', 'deliver', 'calendar_watch') then 0
    when p_kind in ('enrich_contact', 'qualify', 'enrich_backfill', 'import_file', 'import_undo', 'source_pull', 'score_refresh',
                    'rebuild', 'segment_refresh', 'deliver_held') then 2
    when p_kind in ('brand_scan', 'form_qa') then 3
    else 1 end)::smallint;
$$;

ALTER FUNCTION public.job_priority(p_kind text, p_payload jsonb) OWNER TO postgres;

-- function: jobs_drop_removed()
CREATE FUNCTION public.jobs_drop_removed() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if public.job_kind_removed(new.kind) then return null; end if;
  return new;
end $$;

ALTER FUNCTION public.jobs_drop_removed() OWNER TO postgres;

-- function: journey_create(uuid, uuid, text, text, text, jsonb)
CREATE FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) OWNER TO postgres;

-- function: lead_route(uuid)
CREATE FUNCTION public.lead_route(p_contact uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c contacts;
  co companies;
  s lead_settings;
  r jsonb;
  owners jsonb;
  pick jsonb;
  idx int := 0;
  rule_name text;
  turn int;
  vals jsonb := '{}';
begin
  select * into c from contacts where id = p_contact and deleted_at is null for update;
  if c.id is null then return null; end if;
  -- A live router decides the owner (worker-intel/jobs/router.ts); the MQL stage and the timeline stay here.
  if exists (select 1 from routers where workspace_id = c.workspace_id and live_version is not null) then
    if c.lifecycle is null or c.lifecycle in ('subscriber', 'lead') then
      perform contact_update(c.id, 'scoring', jsonb_build_object('lifecycle', 'mql'));
    end if;
    update contacts set qualified_at = now() where id = c.id;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (c.workspace_id, c.id, 'lead.qualified', jsonb_strip_nulls(jsonb_build_object('score', c.score, 'rule', 'router')), 'scoring');
    perform enqueue_job(c.workspace_id, 'route', 'score:' || c.id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
                        jsonb_build_object('contact', c.id, 'reason', 'score', 'key', 'score:' || c.id::text || ':' || to_char(now(), 'YYYY-MM-DD')), 0, 5);
    return 'router';
  end if;
  select * into s from lead_settings where workspace_id = c.workspace_id;
  select * into co from companies where id = c.company_id;
  if coalesce((s.routing->>'respect_owner')::boolean, true) and (c.owner_user_id is not null or c.owner_crm_id is not null) then
    owners := null;
    rule_name := 'kept_owner';
  else
    for r in select * from jsonb_array_elements(coalesce(s.routing->'rules', '[]')) loop
      if (jsonb_array_length(coalesce(r->'countries', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'countries') x where upper(x) = coalesce(co.country, c.country)))
         and (jsonb_array_length(coalesce(r->'industries', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'industries') x where lower(x) = lower(co.industry)))
         and (jsonb_array_length(coalesce(r->'sizes', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'sizes') x where lower(x) = lower(co.size)))
         and jsonb_array_length(coalesce(r->'owners', '[]')) > 0 then
        owners := r->'owners';
        rule_name := coalesce(r->>'name', 'Rule ' || (idx + 1));
        exit;
      end if;
      idx := idx + 1;
    end loop;
    if owners is null and jsonb_array_length(coalesce(s.routing->'default'->'owners', '[]')) > 0 then
      owners := s.routing->'default'->'owners';
      rule_name := 'default';
      idx := -1;
    end if;
  end if;
  if owners is not null then
    turn := coalesce((s.turns->>idx::text)::int, 0);
    pick := owners->(turn % jsonb_array_length(owners));
    update lead_settings set turns = turns || jsonb_build_object(idx::text, turn + 1) where workspace_id = c.workspace_id;
    if nullif(pick->>'user_id', '') is not null and exists (select 1 from workspace_members where workspace_id = c.workspace_id and user_id::text = pick->>'user_id') then
      vals := vals || jsonb_build_object('owner', pick->>'user_id');
    end if;
    if nullif(pick->>'crm_owner_id', '') is not null then
      update contacts set owner_crm_id = left(pick->>'crm_owner_id', 100) where id = c.id;
    end if;
  end if;
  if c.lifecycle is null or c.lifecycle in ('subscriber', 'lead') then
    vals := vals || jsonb_build_object('lifecycle', 'mql');
  end if;
  if vals <> '{}' then perform contact_update(c.id, 'scoring', vals); end if;
  update contacts set qualified_at = now() where id = c.id;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (c.workspace_id, c.id, 'lead.qualified', jsonb_strip_nulls(jsonb_build_object('score', c.score, 'rule', rule_name, 'owner', pick)), 'scoring');
  return rule_name;
end;
$$;

ALTER FUNCTION public.lead_route(p_contact uuid) OWNER TO postgres;

-- function: lead_score_rows(uuid, uuid[])
CREATE FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) RETURNS TABLE(contact_id uuid, fit integer, engagement integer, total integer, band text, reasons jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with s as (select * from lead_settings where workspace_id = p_ws),
  rules as (select rules from icp where workspace_id = p_ws),
  base as (
    select c.id, c.email_class, c.title, c.person_id,
      coalesce(a.fit, icp_fit((select rules from rules), co.industry, co.size, co.country)) as company_fit,
      co.industry, co.size, co.country
    from contacts c
    left join companies co on co.id = c.company_id
    left join accounts a on a.id = co.account_id
    where c.workspace_id = p_ws and c.id = any(p_ids) and c.deleted_at is null
  ),
  person as (
    select b.id,
      (case b.email_class when 'work' then 40 when 'own' then 40 when 'partner' then 20 when 'role' then 20 else 0 end)
      + case when cardinality((select titles from s)) = 0 then 0
             when exists (select 1 from unnest((select titles from s)) t where b.title ilike '%' || t || '%') then 60 else 0 end as pts,
      cardinality((select titles from s)) > 0 as has_titles,
      exists (select 1 from unnest((select titles from s)) t where b.title ilike '%' || t || '%') as title_hit
    from base b
  ),
  ev as (
    select e.contact_id as id, e.kind, e.at
    from contact_events e
    where e.workspace_id = p_ws and e.contact_id = any(p_ids) and e.at > now() - interval '90 days'
      and e.kind in (select jsonb_object_keys((select weights from s)))
    union all
    select b.id, case when x.landing_path ilike '%pricing%' then 'visit.pricing' else 'visit' end, x.started_at
    from base b join sessions x on x.workspace_id = p_ws and x.person_id = b.person_id
    where b.person_id is not null and x.person_level in ('verified', 'asserted') and not x.is_bot and not x.internal
      and x.started_at > now() - interval '90 days'
  ),
  eng2 as (
    select x.id,
      sum(coalesce(((select weights from s)->>x.kind)::numeric, 0) * power(0.5, extract(epoch from now() - x.at) / 86400.0 / (select half_life_days from s))) as raw
    from ev x group by x.id
  ),
  counts as (
    select id, jsonb_object_agg(kind, n) as counts from (select id, kind, count(*) as n from ev group by id, kind) k group by id
  ),
  scored as (
    select b.id,
      case when b.company_fit is null then least(100, round(p.pts * case when p.has_titles then 1 else 2.5 end))::int
           else round(0.6 * b.company_fit + 0.4 * least(100, p.pts * case when p.has_titles then 1 else 2.5 end))::int end as fit,
      greatest(0, least(100, round(coalesce(e.raw, 0))))::int as engagement,
      b.company_fit, b.industry, b.size, b.country, p.title_hit, b.email_class, c.counts
    from base b join person p on p.id = b.id
    left join eng2 e on e.id = b.id
    left join counts c on c.id = b.id
  )
  select x.id, x.fit, x.engagement,
    round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement)::int as total,
    case when round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement) >= (select threshold from s) then 'hot'
         when round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement) >= (select threshold from s) * 0.6 then 'warm'
         else 'cold' end,
    jsonb_strip_nulls(jsonb_build_object(
      'company_fit', x.company_fit, 'industry', x.industry, 'size', x.size, 'country', x.country,
      'work_email', x.email_class in ('work', 'own'), 'title_match', x.title_hit, 'activity', coalesce(x.counts, '{}')))
  from scored x;
$$;

ALTER FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) OWNER TO postgres;

-- function: lead_scores_due()
CREATE FUNCTION public.lead_scores_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w uuid;
  n int := 0;
  t0 timestamptz := clock_timestamp();
begin
  for w in
    select l.workspace_id from lead_settings l left join lead_score_marks m on m.workspace_id = l.workspace_id
    where l.enabled and not exists (select 1 from scoring_models s where s.workspace_id = l.workspace_id and s.live_version is not null)
    order by m.ran_at nulls first
  loop
    exit when clock_timestamp() - t0 > interval '20 seconds';
    perform lead_scores_refresh(w, 2000);
    insert into lead_score_marks (workspace_id, ran_at) values (w, clock_timestamp())
    on conflict (workspace_id) do update set ran_at = excluded.ran_at;
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.lead_scores_due() OWNER TO postgres;

-- function: lead_scores_refresh(uuid, integer)
CREATE FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer DEFAULT 5000) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s lead_settings;
  lim int := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  kinds text[];
  changed uuid[];
  sweep uuid[];
  ids uuid[];
  mk lead_score_marks;
  room int;
  n int;
  routed int := 0;
  r record;
begin
  select * into s from lead_settings where workspace_id = p_ws and enabled;
  if s.workspace_id is null then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  if exists (select 1 from scoring_models m where m.workspace_id = p_ws and m.live_version is not null) then
    return jsonb_build_object('scored', 0, 'routed', 0);
  end if;
  kinds := array(select jsonb_object_keys(s.weights));
  -- New, or did something (weighted activity, a visit, an edit) in the last day after their last score.
  select array_agg(id) into changed from (
    select u.id from (
      (select c.id, c.scored_at from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.scored_at is null limit lim)
      union
      select c.id, c.scored_at from contact_events e join contacts c on c.id = e.contact_id
      where e.workspace_id = p_ws and e.kind = any(kinds) and e.at > now() - interval '1 day'
        and c.deleted_at is null and e.at > c.scored_at
      union
      select c.id, c.scored_at from sessions x join contacts c on c.workspace_id = p_ws and c.person_id = x.person_id
      where x.workspace_id = p_ws and x.person_id is not null and x.started_at > now() - interval '1 day'
        and c.deleted_at is null and x.started_at > c.scored_at
      union
      select c.id, c.scored_at from contacts c
      where c.workspace_id = p_ws and c.deleted_at is null and c.updated_at > now() - interval '1 day' and c.updated_at > c.scored_at
    ) u
    order by u.scored_at nulls first
    limit lim
  ) t;
  -- The daily pass: everyone once a day, in id order, a slice per run. It catches decay, company and settings changes.
  room := least(lim - coalesce(cardinality(changed), 0), 500);
  if room > 0 then
    insert into lead_score_marks (workspace_id) values (p_ws) on conflict (workspace_id) do nothing;
    select * into mk from lead_score_marks where workspace_id = p_ws for update;
    if mk.sweep_after is null and (mk.sweep_started_at is null or mk.sweep_started_at < now() - interval '1 day') then
      mk.sweep_after := '00000000-0000-0000-0000-000000000000';
      mk.sweep_started_at := now();
    end if;
    if mk.sweep_after is not null then
      select array_agg(c.id order by c.id) into sweep from (
        select c.id from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.id > mk.sweep_after order by c.id limit room
      ) c;
      update lead_score_marks set
        sweep_after = case when coalesce(cardinality(sweep), 0) < room then null else sweep[cardinality(sweep)] end,
        sweep_started_at = mk.sweep_started_at
      where workspace_id = p_ws;
    end if;
  end if;
  ids := array(select distinct x from unnest(coalesce(changed, '{}') || coalesce(sweep, '{}')) x);
  if cardinality(ids) = 0 then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  -- Write only what changed.
  update contacts c set score = x.total, score_band = x.band, fit_score = x.fit, engagement_score = x.engagement, score_reasons = x.reasons, scored_at = now()
  from lead_score_rows(p_ws, ids) x
  where c.id = x.contact_id
    and (c.score is distinct from x.total or c.score_band is distinct from x.band or c.fit_score is distinct from x.fit
         or c.engagement_score is distinct from x.engagement or c.score_reasons is distinct from x.reasons);
  -- Picked by change and unchanged: mark scored so they aren't picked again. The daily pass writes nothing for them.
  if changed is not null then
    update contacts c set scored_at = now() where c.id = any(changed) and c.deleted_at is null and (c.scored_at is null or c.scored_at < now());
  end if;
  select count(*) into n from contacts c where c.id = any(ids) and c.workspace_id = p_ws and c.deleted_at is null;
  for r in select id from contacts where id = any(ids) and score >= s.threshold and qualified_at is null loop
    perform lead_route(r.id);
    routed := routed + 1;
  end loop;
  return jsonb_build_object('scored', n, 'routed', routed);
end;
$$;

ALTER FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer) OWNER TO postgres;

-- function: link_domain_host(text)
CREATE FUNCTION public.link_domain_host(p_host text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select w.booking_slug from link_domains d join workspaces w on w.id = d.workspace_id
  where d.hostname = lower(p_host) and d.status = 'active' and w.booking_slug is not null;
$$;

ALTER FUNCTION public.link_domain_host(p_host text) OWNER TO postgres;

-- function: link_slug_exists(text)
CREATE FUNCTION public.link_slug_exists(p_slug text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from workspaces where booking_slug = lower(p_slug));
$$;

ALTER FUNCTION public.link_slug_exists(p_slug text) OWNER TO postgres;

-- function: local_hour(timestamp with time zone, text)
CREATE FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) RETURNS integer
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
begin
  return extract(hour from p_at at time zone p_tz)::int;
exception when others then
  return null;
end;
$$;

ALTER FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) OWNER TO postgres;

-- function: mailbox_broken(uuid, text)
CREATE FUNCTION public.mailbox_broken(p_id uuid, p_error text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b mailboxes%rowtype;
  tell boolean;
begin
  select * into b from mailboxes where id = p_id for update;
  if b.id is null then return null; end if;
  if b.status = 'ok' then
    update mailboxes set status = 'reconnect', error = left(p_error, 500), broken_at = now(), updated_at = now() where id = p_id returning * into b;
  end if;
  tell := b.told_at is null or b.told_at < b.broken_at;
  if tell then update mailboxes set told_at = now() where id = p_id; end if;
  return jsonb_build_object('tell', tell, 'email', (select lower(u.email) from auth.users u where u.id = b.user_id), 'mailbox', b.email, 'provider', b.provider, 'broken_at', b.broken_at);
end;
$$;

ALTER FUNCTION public.mailbox_broken(p_id uuid, p_error text) OWNER TO postgres;

-- function: mailbox_connect(uuid, uuid, text, text, text)
CREATE FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into mailboxes (workspace_id, user_id, provider, email, sealed)
  values (p_ws, p_user, p_provider, lower(trim(p_email)), p_sealed)
  on conflict (workspace_id, user_id) do update set provider = excluded.provider, email = excluded.email, sealed = excluded.sealed,
    status = 'ok', error = null, broken_at = null, updated_at = now()
  returning id into rid;
  return rid;
end;
$$;

ALTER FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) OWNER TO postgres;

-- function: mailbox_disconnect(uuid, uuid)
CREATE FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from mailboxes where workspace_id = p_ws and user_id = p_user;
$$;

ALTER FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: mailbox_for(uuid, uuid)
CREATE FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', b.id, 'provider', b.provider, 'email', b.email, 'sealed', b.sealed,
    'sent_day', (select count(*) from mailbox_sends s where s.mailbox_id = b.id and s.at > now() - interval '24 hours'),
    'limit', mailbox_limit(b.provider),
    'room_at', (select min(s.at) + interval '24 hours' from mailbox_sends s where s.mailbox_id = b.id and s.at > now() - interval '24 hours'))
  from mailboxes b where b.workspace_id = p_ws and b.user_id = p_user and b.status = 'ok';
$$;

ALTER FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: mailbox_limit(text)
CREATE FUNCTION public.mailbox_limit(p_provider text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_provider when 'gmail' then 450 when 'outlook' then 2000 else 0 end;
$$;

ALTER FUNCTION public.mailbox_limit(p_provider text) OWNER TO postgres;

-- function: mailbox_sent(uuid)
CREATE FUNCTION public.mailbox_sent(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into mailbox_sends (mailbox_id) values (p_id);
  delete from mailbox_sends where mailbox_id = p_id and at < now() - interval '2 days';
$$;

ALTER FUNCTION public.mailbox_sent(p_id uuid) OWNER TO postgres;

-- function: mailbox_token_save(uuid, text)
CREATE FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update mailboxes set sealed = p_sealed, updated_at = now() where id = p_id;
$$;

ALTER FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) OWNER TO postgres;

-- function: make_event_partitions(integer)
CREATE FUNCTION public.make_event_partitions(p_days_ahead integer DEFAULT 7) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d date;
  name text;
  made int := 0;
begin
  for d in select generate_series(current_date - 1, current_date + greatest(p_days_ahead, 1), interval '1 day')::date loop
    name := 'events_' || to_char(d, 'YYYYMMDD');
    if to_regclass('public.' || name) is null then
      execute format('create table public.%I partition of public.events for values from (%L) to (%L)', name, d, d + 1);
      execute format('alter table public.%I enable row level security', name);
      execute format('revoke all on public.%I from anon, authenticated', name);
      made := made + 1;
    end if;
  end loop;
  return made;
end;
$$;

ALTER FUNCTION public.make_event_partitions(p_days_ahead integer) OWNER TO postgres;

-- function: meeting_book(uuid, uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, jsonb, text, text, text, uuid, uuid, uuid, integer, boolean, jsonb, uuid)
CREATE FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text DEFAULT 'booked'::text, p_contact uuid DEFAULT NULL::uuid, p_submission uuid DEFAULT NULL::uuid, p_link uuid DEFAULT NULL::uuid, p_seats integer DEFAULT 0, p_rr boolean DEFAULT false, p_location jsonb DEFAULT '{}'::jsonb, p_booked_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  h uuid;
  l meeting_links%rowtype;
  mid uuid;
begin
  if p_status not in ('booked', 'pending_payment') then raise exception 'bad status'; end if;
  foreach h in array (select array_agg(x order by x) from unnest(p_hosts) x) loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-host:' || h::text, 0));
  end loop;
  if p_link is not null then
    select * into l from meeting_links where id = p_link and workspace_id = p_ws for update;
    if l.id is null or l.closed_at is not null or (l.expires_at is not null and l.expires_at < now()) then raise exception 'link_closed'; end if;
    if l.kind in ('single_use', 'one_off') and l.used_at is not null then raise exception 'link_used'; end if;
  end if;
  if p_seats > 0 and (select count(*) from meetings m where m.type_id = p_type and m.start_at = p_start and meeting_holds(m)) >= p_seats then
    raise exception 'full';
  end if;
  if exists (
    select 1 from meetings m
    where m.workspace_id = p_ws and m.hosts && p_hosts and meeting_holds(m)
      and tstzrange(m.block_start, m.block_end) && tstzrange(p_block_start, p_block_end)
      and not (p_seats > 0 and m.type_id = p_type and m.start_at = p_start)
  ) then
    raise exception 'slot_taken';
  end if;
  insert into meetings (workspace_id, type_id, link_id, hosts, contact_id, submission_id, guest_email, guest_name, guest_tz, answers, start_at, end_at,
                        block_start, block_end, status, source, rr, location, token_hash, booked_by)
  values (p_ws, p_type, p_link, p_hosts, p_contact, p_submission, lower(trim(p_guest->>'email')), nullif(trim(p_guest->>'name'), ''), nullif(p_guest->>'tz', ''),
          coalesce(p_guest->'answers', '{}'), p_start, p_end, p_block_start, p_block_end, p_status, p_source, p_rr, coalesce(p_location, '{}'), p_token_hash, p_booked_by)
  returning id into mid;
  if p_link is not null and l.kind in ('single_use', 'one_off') then
    update meeting_links set used_at = now(), meeting_id = mid where id = p_link;
  end if;
  insert into meeting_events (meeting_id, kind, detail) values (mid, case when p_status = 'booked' then 'booked' else 'pending_payment' end, jsonb_build_object('source', p_source));
  if p_contact is not null and p_status = 'booked' then
    perform meeting_timeline(mid, 'meeting.booked');
  end if;
  return mid;
end;
$$;

ALTER FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid) OWNER TO postgres;

-- function: meeting_book_all(uuid, uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, jsonb, text, text, text, uuid, uuid, uuid, integer, boolean, jsonb, uuid, text, jsonb, jsonb, boolean)
CREATE FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text DEFAULT 'booked'::text, p_contact uuid DEFAULT NULL::uuid, p_submission uuid DEFAULT NULL::uuid, p_link uuid DEFAULT NULL::uuid, p_seats integer DEFAULT 0, p_rr boolean DEFAULT false, p_location jsonb DEFAULT '{}'::jsonb, p_booked_by uuid DEFAULT NULL::uuid, p_sealed text DEFAULT NULL::text, p_team jsonb DEFAULT NULL::jsonb, p_contact_row jsonb DEFAULT NULL::jsonb, p_sync boolean DEFAULT true) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mid uuid;
  team text;
begin
  mid := meeting_book(p_ws, p_type, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, p_source, p_token_hash, p_status, p_contact,
                      p_submission, p_link, p_seats, p_rr, p_location, p_booked_by);
  if p_sealed is not null then
    perform meeting_token_keep(mid, p_token_hash, p_sealed);
  end if;
  if p_team is not null and nullif(p_team->>'queue', '') is not null and nullif(p_team->>'owner', '') is not null then
    -- Never wait on the queue: busy, or failing, the job writes the run a moment later.
    if pg_try_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || (p_team->>'queue'), 0)) then
      begin
        perform meeting_team_run(p_ws, mid, p_contact, p_team->>'queue', (p_team->>'owner')::uuid, nullif(p_team->>'version', '')::int, '[]'::jsonb);
        team := 'written';
      exception when others then
        team := null;
      end;
    end if;
    if team is null then
      perform enqueue_job(p_ws, 'meeting_team_run', 'booking:' || mid::text,
        jsonb_build_object('p_ws', p_ws, 'p_meeting', mid, 'p_contact', p_contact, 'p_queue', p_team->>'queue', 'p_owner', p_team->>'owner',
                           'p_version', p_team->'version', 'p_steps', '[]'::jsonb), 0, 8);
      team := 'queued';
    end if;
  end if;
  if p_contact is null and p_contact_row is not null and p_status = 'booked' then
    begin
      perform meeting_contact_make(mid, p_contact_row);
    exception when others then
      null;
    end;
  end if;
  if p_sync and p_status = 'booked' then
    perform enqueue_job(p_ws, 'meeting_sync', 'create:' || mid::text, jsonb_build_object('meeting', mid, 'action', 'create'));
  end if;
  return jsonb_build_object('id', mid, 'team', team);
end;
$$;

ALTER FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean) OWNER TO postgres;

-- function: meeting_book_later_info(uuid, uuid)
CREATE FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s submissions%rowtype;
  t meeting_types%rowtype;
begin
  select * into s from submissions where id = p_submission;
  if s.id is null then return null; end if;
  select * into t from meeting_types where id = p_type and workspace_id = s.workspace_id;
  return jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'workspace_id', s.workspace_id, 'contact_id', s.contact_id, 'spam', s.spam, 'test', s.test),
    'booked', exists (select 1 from meetings where submission_id = p_submission),
    'contact', (select jsonb_build_object('email', c.email_clean, 'first_name', c.first_name, 'last_name', c.last_name, 'timezone', c.timezone)
                from contacts c where c.id = s.contact_id and c.deleted_at is null),
    'type', case when t.id is null then null else to_jsonb(t) end,
    'people', case when t.id is null then '[]'::jsonb
                   else meeting_people(s.workspace_id, array(select (h->>'user_id')::uuid from jsonb_array_elements(t.hosts) h)) end,
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'slug', booking_slug_ensure(w.id)) from workspaces w where w.id = s.workspace_id),
    'sending', meeting_sending(s.workspace_id));
end;
$$;

ALTER FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) OWNER TO postgres;

-- function: meeting_calendar_busy(uuid, uuid, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when is_member(p_ws) and (p_user = auth.uid() or is_owner(p_ws)) then coalesce((
    select jsonb_agg(jsonb_build_object('start', b.start_at, 'end', b.end_at, 'ooo', b.ooo) order by b.start_at)
    from busy_blocks b join calendar_accounts c on c.id = b.account_id
    join calendar_lists l on l.account_id = b.account_id and l.calendar_id = b.calendar_id and l.busy
    where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.end_at > p_from and b.start_at < least(p_to, p_from + interval '62 days')), '[]') end;
$$;

ALTER FUNCTION public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone) OWNER TO postgres;

-- function: meeting_calendar_failed(uuid, jsonb)
CREATE FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into meeting_events (meeting_id, kind, detail) values (p_meeting, 'calendar_failed', coalesce(p_detail, '{}'));
$$;

ALTER FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) OWNER TO postgres;

-- function: meeting_calendar_save(uuid, jsonb, jsonb)
CREATE FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update meetings set events = coalesce(p_events, '{}'), location = location || coalesce(p_location, '{}'), updated_at = now() where id = p_meeting;
$$;

ALTER FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb) OWNER TO postgres;

-- function: meeting_cancel_guest(uuid, text)
CREATE FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  was text;
  ws uuid;
begin
  select status, workspace_id into was, ws from meetings where id = p_id;
  perform meeting_status(p_id, 'canceled', p_reason, null);
  if was = 'booked' then
    perform enqueue_job(ws, 'meeting_sync', 'cancel:' || p_id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      jsonb_build_object('meeting', p_id, 'action', 'cancel'));
  end if;
  return book_meeting(null, p_id);
end;
$$;

ALTER FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text) OWNER TO postgres;

-- function: meeting_contact_make(uuid, jsonb)
CREATE FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
  ec text := lower(btrim(coalesce(p_row->>'email_clean', '')));
  up jsonb;
  cid uuid;
begin
  select * into m from meetings where id = p_meeting for update;
  if m.id is null or m.contact_id is not null or ec = '' or m.status <> 'booked' then return m.contact_id; end if;
  if lower(btrim(coalesce(p_row->>'email', ''))) <> m.guest_email then return null; end if;
  if split_part(ec, '@', 2) = any (coalesce((select own_domains from identity_settings where workspace_id = m.workspace_id), '{}')) then return null; end if;
  up := contacts_upsert(m.workspace_id, 'meeting', jsonb_build_array(p_row));
  cid := (up->'ids'->>0)::uuid;
  if cid is null then return null; end if;
  update meetings set contact_id = cid where id = m.id;
  perform meeting_timeline(m.id, 'meeting.booked');
  return cid;
end;
$$;

ALTER FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) OWNER TO postgres;

-- function: meeting_events_webhooks()
CREATE FUNCTION public.meeting_events_webhooks() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_events_webhooks() OWNER TO postgres;

-- function: meeting_holds(public.meetings)
CREATE FUNCTION public.meeting_holds(m public.meetings) RETURNS boolean
    LANGUAGE sql STABLE
    AS $$
  select m.status = 'booked' or (m.status = 'pending_payment' and m.created_at > now() - interval '10 minutes');
$$;

ALTER FUNCTION public.meeting_holds(m public.meetings) OWNER TO postgres;

-- function: meeting_host_action(uuid, uuid, text, text, uuid)
CREATE FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) OWNER TO postgres;

-- function: meeting_inputs(uuid, uuid[], timestamp with time zone, timestamp with time zone, text)
CREATE FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
                        from meetings m where m.workspace_id = p_ws and m.hosts @> array[u] and meeting_holds(m)
                          and m.block_end > p_from - interval '7 days' and m.block_start < p_to), '[]'),
    'out_dates', coalesce(r.out_dates, '[]'),
    'paused_until', r.paused_until
  ) order by t.ord), '[]')
  from unnest(p_users) with ordinality t(u, ord)
  left join router_reps r on r.workspace_id = p_ws and r.user_id = t.u;
$$;

ALTER FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text) OWNER TO postgres;

-- function: meeting_invite_info(uuid)
CREATE FUNCTION public.meeting_invite_info(p_meeting uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'token_hash', m.token_hash,
    'token_sealed', m.token_sealed,
    'form', (select jsonb_build_object('name', f.name, 'values', s.values, 'body', jsonb_build_object('steps', v.body->'steps'))
             from submissions s
             left join forms f on f.id = s.form_id
             left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
             where s.id = m.submission_id and s.workspace_id = m.workspace_id and not s.spam))
  from meetings m
  where m.id = p_meeting;
$$;

ALTER FUNCTION public.meeting_invite_info(p_meeting uuid) OWNER TO postgres;

-- function: meeting_jobs_drop(uuid, text[])
CREATE FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[] DEFAULT '{}'::text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  update jobs set status = 'done', error = 'The meeting changed', finished_at = now(), locked_by = null, locked_until = null
  where status = 'queued' and kind in ('meeting_remind', 'meeting_after') and payload->>'meeting' = p_meeting::text
    and not (key = any(coalesce(p_keep, '{}')));
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[]) OWNER TO postgres;

-- function: meeting_mail_done(uuid, text, text, text)
CREATE FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r meeting_mails%rowtype;
begin
  select * into r from meeting_mails where id = p_id for update;
  if r.id is null or r.status <> 'sending' then return; end if;
  if p_outcome = 'ok' then
    update meeting_mails set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 200), error = null where id = p_id;
    if r.meeting_id is not null and r.kind in ('reminder', 'no_show') then
      insert into meeting_events (meeting_id, kind, detail)
      values (r.meeting_id, case r.kind when 'reminder' then 'reminder_sent' else 'follow_up_sent' end, jsonb_build_object('mail', r.id));
    end if;
  elsif p_outcome = 'retry' and r.attempts < 5 then
    update meeting_mails set status = 'retry', error = left(p_error, 500) where id = p_id;
  elsif p_outcome = 'unknown' then
    update meeting_mails set status = 'unknown', error = left(coalesce(p_error, 'No clear answer from the provider'), 500) where id = p_id;
  else
    update meeting_mails set status = 'failed', error = left(coalesce(p_error, 'Failed'), 500) where id = p_id;
  end if;
end;
$$;

ALTER FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text) OWNER TO postgres;

-- function: meeting_mail_done_many(jsonb)
CREATE FUNCTION public.meeting_mail_done_many(p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    perform meeting_mail_done((r->>'id')::uuid, r->>'outcome', nullif(r->>'provider_id', ''), r->>'error');
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.meeting_mail_done_many(p_rows jsonb) OWNER TO postgres;

-- function: meeting_mail_event(jsonb)
CREATE FUNCTION public.meeting_mail_event(p_event jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r meeting_mails%rowtype;
  k text := p_event->>'kind';
  pid text := coalesce(p_event->>'provider_id', p_event->>'ses_message_id', '');
  addr text := lower(coalesce(p_event->>'to', ''));
  n int;
begin
  if k not in ('bounced', 'complained') then return 'ignored'; end if;
  if pid <> '' then
    select * into r from meeting_mails where provider_id = pid for update;
  end if;
  if r.id is null and addr <> '' then
    select count(distinct workspace_id) into n from meeting_mails where to_email = addr and created_at > now() - interval '3 days' and status = 'sent';
    if n = 1 then
      select * into r from meeting_mails where to_email = addr and created_at > now() - interval '3 days' and status = 'sent' order by created_at desc limit 1 for update;
    elsif n > 1 then
      return 'ambiguous';
    end if;
  end if;
  if r.id is null then return 'unknown_message'; end if;
  if k = 'bounced' then
    update meeting_mails set bounced = coalesce(p_event->>'bounce', 'hard') where id = r.id;
    if coalesce(p_event->>'bounce', 'hard') = 'hard' then
      perform suppress(r.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'bounced')));
    end if;
  else
    update meeting_mails set complained_at = coalesce(complained_at, now()) where id = r.id;
    perform suppress(r.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'complained')));
  end if;
  return 'meeting_mail';
end;
$$;

ALTER FUNCTION public.meeting_mail_event(p_event jsonb) OWNER TO postgres;

-- function: meeting_mail_info(uuid)
CREATE FUNCTION public.meeting_mail_info(p_meeting uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then return null; end if;
  return jsonb_build_object(
    'meeting', to_jsonb(m),
    'type', (select to_jsonb(t) from meeting_types t where t.id = m.type_id),
    'hosts', meeting_people(m.workspace_id, m.hosts),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'slug', booking_slug_ensure(w.id)) from workspaces w where w.id = m.workspace_id),
    'sending', meeting_sending(m.workspace_id),
    'sequence', (select count(*) from meeting_events e where e.meeting_id = m.id and e.kind in ('moved', 'canceled')),
    'moved_from', (select e.detail->>'from' from meeting_events e where e.meeting_id = m.id and e.kind = 'moved' order by e.id desc limit 1),
    'canceled_by', (select e.detail->>'by' from meeting_events e where e.meeting_id = m.id and e.kind = 'canceled' order by e.id desc limit 1));
end;
$$;

ALTER FUNCTION public.meeting_mail_info(p_meeting uuid) OWNER TO postgres;

-- function: meeting_mail_start(uuid, uuid, uuid, text, text, text, boolean)
CREATE FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mid uuid;
  addr text := lower(trim(p_to));
  reason text;
begin
  insert into meeting_mails (workspace_id, meeting_id, submission_id, kind, to_email, dedupe)
  values (p_ws, p_meeting, p_submission, p_kind, addr, p_dedupe)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is null then
    update meeting_mails set status = 'sending', attempts = attempts + 1, error = null
    where workspace_id = p_ws and dedupe = p_dedupe and status = 'retry'
    returning id into mid;
    return mid;
  end if;
  if p_optional then
    reason := case
      when exists (select 1 from suppressions where workspace_id = p_ws and email_clean = addr) then 'suppressed'
      when exists (select 1 from erasures where workspace_id = p_ws and value_hash = sha256(convert_to(addr, 'UTF8'))) then 'erased'
      when exists (select 1 from send_settings where workspace_id = p_ws and paused) then 'paused'
    end;
    if reason is not null then
      update meeting_mails set status = 'skipped', skip_reason = reason where id = mid;
      return null;
    end if;
  end if;
  return mid;
end;
$$;

ALTER FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean) OWNER TO postgres;

-- function: meeting_manage_info(uuid, uuid, uuid)
CREATE FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) OWNER TO postgres;

-- function: meeting_move(uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) OWNER TO postgres;

-- function: meeting_move_guest(uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  perform meeting_move(p_id, p_hosts, p_start, p_end, p_block_start, p_block_end);
  select workspace_id into ws from meetings where id = p_id;
  perform enqueue_job(ws, 'meeting_sync', 'move:' || p_id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    jsonb_build_object('meeting', p_id, 'action', 'move'));
  return book_meeting(null, p_id);
end;
$$;

ALTER FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) OWNER TO postgres;

-- function: meeting_outcome(uuid, text, text)
CREATE FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
  last_kind text;
  last_reason text;
begin
  if p_status not in ('held', 'no_show') then raise exception 'bad status'; end if;
  select * into m from meetings where id = p_meeting for update;
  if m.id is null then return jsonb_build_object('result', 'not_found'); end if;
  if exists (select 1 from meeting_outcome_uses where nonce = p_nonce) then
    return jsonb_build_object('result', 'used', 'status', m.status);
  end if;
  if m.start_at > now() then return jsonb_build_object('result', 'not_started', 'status', m.status); end if;
  select e.kind, e.detail->>'reason' into last_kind, last_reason from meeting_events e
  where e.meeting_id = m.id and e.kind in ('booked', 'held', 'no_show', 'canceled', 'pending_payment') order by e.id desc limit 1;
  if not (m.status = 'booked' or (m.status = 'held' and last_kind = 'held' and last_reason = 'auto')) then
    return jsonb_build_object('result', 'marked', 'status', m.status);
  end if;
  insert into meeting_outcome_uses (nonce, meeting_id, status) values (p_nonce, m.id, p_status);
  perform meeting_status(m.id, p_status, null, null);
  perform enqueue_job(m.workspace_id, 'meeting_notify', p_status || ':' || m.id::text, jsonb_build_object('meeting', m.id, 'event', p_status), 0, 5);
  return jsonb_build_object('result', 'ok', 'status', p_status);
end;
$$;

ALTER FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) OWNER TO postgres;

-- function: meeting_pay(uuid, jsonb)
CREATE FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
  h uuid;
  seats int := 0;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'not_found'; end if;
  foreach h in array (select array_agg(x order by x) from unnest(m.hosts) x) loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-host:' || h::text, 0));
  end loop;
  select * into m from meetings where id = p_id for update;
  update meetings set payment = coalesce(payment, '{}') || p_payment, updated_at = now() where id = p_id;
  if m.status in ('booked', 'held', 'no_show') then return 'already'; end if;
  if m.status = 'canceled' then return 'refund'; end if;
  select case when t.kind = 'group' then greatest(1, coalesce((t.settings->>'seats')::int, 1)) else 0 end into seats from meeting_types t where t.id = m.type_id;
  seats := coalesce(seats, 0);
  if (seats > 0 and (select count(*) from meetings x where x.id <> m.id and x.type_id = m.type_id and x.start_at = m.start_at and meeting_holds(x)) >= seats)
     or exists (
       select 1 from meetings x
       where x.workspace_id = m.workspace_id and x.id <> m.id and x.hosts && m.hosts and meeting_holds(x)
         and tstzrange(x.block_start, x.block_end) && tstzrange(m.block_start, m.block_end)
         and not (seats > 0 and x.type_id = m.type_id and x.start_at = m.start_at)
     ) then
    update meetings set status = 'canceled', cancel_reason = 'The time was taken before the payment finished.', updated_at = now() where id = p_id;
    insert into meeting_events (meeting_id, kind, detail) values (p_id, 'canceled', jsonb_build_object('reason', 'payment_late'));
    return 'refund';
  end if;
  update meetings set status = 'booked', updated_at = now() where id = p_id;
  insert into meeting_events (meeting_id, kind, detail) values (p_id, 'booked', jsonb_build_object('paid', true));
  perform meeting_timeline(p_id, 'meeting.booked');
  return 'booked';
end;
$$;

ALTER FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) OWNER TO postgres;

-- function: meeting_payment(uuid, jsonb)
CREATE FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update meetings set payment = coalesce(payment, '{}') || p_patch, updated_at = now() where id = p_id returning payment;
$$;

ALTER FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) OWNER TO postgres;

-- function: meeting_people(uuid, uuid[])
CREATE FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.u, 'name', coalesce(nullif(trim(bp.name), ''), split_part(usr.email, '@', 1)), 'email', lower(usr.email), 'tz', coalesce(a.tz, 'UTC')
  ) order by x.ord), '[]')
  from unnest(p_users) with ordinality x(u, ord)
  join auth.users usr on usr.id = x.u
  left join booking_profiles bp on bp.workspace_id = p_ws and bp.user_id = x.u
  left join availability a on a.workspace_id = p_ws and a.user_id = x.u;
$$;

ALTER FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) OWNER TO postgres;

-- function: meeting_seat(public.meetings)
CREATE FUNCTION public.meeting_seat(m public.meetings) RETURNS jsonb
    LANGUAGE sql STABLE
    AS $$
  select jsonb_build_object('id', m.id, 'guest_email', m.guest_email, 'guest_name', m.guest_name, 'answers', m.answers,
                            'start_at', m.start_at, 'end_at', m.end_at, 'events', m.events, 'location', m.location);
$$;

ALTER FUNCTION public.meeting_seat(m public.meetings) OWNER TO postgres;

-- function: meeting_sending(uuid)
CREATE FUNCTION public.meeting_sending(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'from_name', s.from_name,
    'from_email', case when s.from_email is not null and (verified_domain_for(p_ws, s.from_email)).id is not null then s.from_email end,
    'reply_to', s.reply_to,
    'paused', coalesce(s.paused, false))
  from (select 1) one left join send_settings s on s.workspace_id = p_ws;
$$;

ALTER FUNCTION public.meeting_sending(p_ws uuid) OWNER TO postgres;

-- function: meeting_status(uuid, text, text, uuid)
CREATE FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text DEFAULT NULL::text, p_by uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
begin
  select * into m from meetings where id = p_id for update;
  if m.id is null then raise exception 'not_found'; end if;
  if not (
    (m.status = 'booked' and p_status in ('canceled', 'held', 'no_show'))
    or (m.status = 'pending_payment' and p_status in ('booked', 'canceled'))
    or (m.status in ('held', 'no_show') and p_status in ('held', 'no_show'))
  ) then
    raise exception 'bad_change';
  end if;
  if p_status in ('held', 'no_show') and m.start_at > now() then raise exception 'not_started'; end if;
  update meetings set status = p_status, cancel_reason = case when p_status = 'canceled' then left(p_reason, 500) else cancel_reason end, updated_at = now() where id = p_id;
  insert into meeting_events (meeting_id, kind, detail) values (p_id, p_status, jsonb_strip_nulls(jsonb_build_object('reason', left(p_reason, 500), 'by', p_by)));
  perform meeting_timeline(p_id, case p_status when 'booked' then 'meeting.booked' when 'canceled' then 'meeting.canceled' when 'held' then 'meeting.held' else 'meeting.no_show' end);
end;
$$;

ALTER FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid) OWNER TO postgres;

-- function: meeting_sync_inputs(uuid)
CREATE FUNCTION public.meeting_sync_inputs(p_meeting uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_sync_inputs(p_meeting uuid) OWNER TO postgres;

-- function: meeting_sync_lease(uuid, text, integer)
CREATE FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer DEFAULT 120) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into meeting_sync_leases (meeting_id, job, until) values (p_meeting, p_job, now() + make_interval(secs => p_s))
  on conflict (meeting_id) do update set job = excluded.job, until = excluded.until
  where meeting_sync_leases.until < now() or meeting_sync_leases.job = excluded.job;
  return found;
end;
$$;

ALTER FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer) OWNER TO postgres;

-- function: meeting_sync_release(uuid, text)
CREATE FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from meeting_sync_leases where meeting_id = p_meeting and job = p_job;
$$;

ALTER FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) OWNER TO postgres;

-- function: meeting_team_run(uuid, uuid, uuid, text, uuid, integer, jsonb)
CREATE FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb DEFAULT '[]'::jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k text := 'booking:' || p_meeting::text;
  rid uuid;
  cid uuid;
  c contacts%rowtype;
  q routing_quota%rowtype;
  gives boolean := false;
  placed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || coalesce(p_queue, '-'), 0));
  select id into rid from router_runs where workspace_id = p_ws and key = k;
  if rid is not null then return rid; end if;
  select coalesce(p_contact, m.contact_id), routing_meeting_placed(m.events) into cid, placed from meetings m where m.id = p_meeting and m.workspace_id = p_ws;
  if not found then return null; end if;
  if cid is not null then
    select * into c from contacts where id = cid and workspace_id = p_ws and deleted_at is null for update;
  end if;
  gives := c.id is not null and c.owner_user_id is null and c.owner_crm_id is null;
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, steps, facts, ms,
                           assignment_state, booking_state, sync_state, previous_owner, effect, meeting_id)
  values (p_ws, c.id, k, 'booking', p_version, 'owner', p_owner, 'queue', p_queue, coalesce(p_steps, '[]'), jsonb_build_object('meeting', p_meeting), 0,
          'assigned', case when placed then 'confirmed' else 'pending_confirmation' end, 'not_required', c.owner_user_id, case when gives then 'new' else 'none' end, p_meeting)
  returning id into rid;
  if gives then
    q := routing_quota_current(p_ws, p_owner);
    update routing_quota set n = n + 1 where workspace_id = p_ws and user_id = p_owner and period_start = q.period_start;
    insert into routing_assignments (workspace_id, run_id, contact_id, user_id, previous_owner, team_id, counted, advanced, quota_period)
    values (p_ws, rid, c.id, p_owner, null, (select tk.team_id from routing_team_keys tk where tk.workspace_id = p_ws and tk.key = p_queue), true, false, q.period_start)
    on conflict (run_id) do nothing;
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

ALTER FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb) OWNER TO postgres;

-- function: meeting_timeline(uuid, text)
CREATE FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m meetings%rowtype;
begin
  select * into m from meetings where id = p_meeting;
  if m.contact_id is null then return; end if;
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (m.workspace_id, m.contact_id, p_kind, jsonb_strip_nulls(jsonb_build_object('meeting_id', m.id, 'type_id', m.type_id, 'start', m.start_at, 'hosts', m.hosts, 'submission_id', m.submission_id)), 'meetings');
end;
$$;

ALTER FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) OWNER TO postgres;

-- function: meeting_token_keep(uuid, text, text)
CREATE FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update meetings set token_sealed = p_sealed where id = p_id and token_hash = p_hash and token_sealed is null;
  return found;
end;
$$;

ALTER FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) OWNER TO postgres;

-- function: meeting_token_rotate(uuid, text, text, text)
CREATE FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r jsonb;
begin
  update meetings set token_hash = p_hash, token_sealed = p_sealed where id = p_id and token_hash = p_old;
  select jsonb_build_object('token_hash', token_hash, 'token_sealed', token_sealed) into r from meetings where id = p_id;
  return r;
end;
$$;

ALTER FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) OWNER TO postgres;

-- function: meeting_type_delete(uuid, uuid)
CREATE FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update meeting_types set locked = '{}', template_id = null, updated_at = now() where template_id = p_id and workspace_id = p_ws;
  delete from meeting_types where id = p_id and workspace_id = p_ws;
  if not found then raise exception 'not_found'; end if;
end;
$$;

ALTER FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: meeting_type_get(uuid, uuid)
CREATE FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select to_jsonb(t) from meeting_types t where t.id = p_id and t.workspace_id = p_ws;
$$;

ALTER FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: meeting_type_locked(jsonb, text[])
CREATE FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce((select jsonb_object_agg(k, p_settings -> k) from unnest(p_locked) k where p_settings ? k), '{}');
$$;

ALTER FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) OWNER TO postgres;

-- function: meeting_type_push(uuid, uuid, uuid[])
CREATE FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) OWNER TO postgres;

-- function: meeting_type_save(uuid, uuid, jsonb, uuid)
CREATE FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) OWNER TO postgres;

-- function: meeting_upcoming_for(uuid, uuid)
CREATE FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'host', m.hosts[1], 'start', m.start_at, 'end', m.end_at, 'block_start', m.block_start, 'block_end', m.block_end,
                                               'kind', t.kind) order by m.start_at), '[]')
  from meetings m left join meeting_types t on t.id = m.type_id
  where m.workspace_id = p_ws and m.contact_id = p_contact and m.status = 'booked' and m.start_at > now()
    and cardinality(m.hosts) = 1 and coalesce(t.kind, 'one') not in ('collective', 'double', 'group');
$$;

ALTER FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) OWNER TO postgres;

-- function: meetings_auto_held(integer)
CREATE FUNCTION public.meetings_auto_held(p_limit integer DEFAULT 500) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, workspace_id from meetings
    where status = 'booked' and end_at < now() - interval '24 hours'
    order by end_at
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  loop
    perform meeting_status(r.id, 'held', 'auto', null);
    perform enqueue_job(r.workspace_id, 'meeting_notify', 'held:' || r.id::text, jsonb_build_object('meeting', r.id, 'event', 'held'), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.meetings_auto_held(p_limit integer) OWNER TO postgres;

-- function: meetings_members(uuid)
CREATE FUNCTION public.meetings_members(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'role', role) order by created_at), '[]') from workspace_members where workspace_id = p_ws;
$$;

ALTER FUNCTION public.meetings_members(p_ws uuid) OWNER TO postgres;

-- function: meetings_role(uuid, uuid)
CREATE FUNCTION public.meetings_role(p_ws uuid, p_user uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role from workspace_members where workspace_id = p_ws and user_id = p_user;
$$;

ALTER FUNCTION public.meetings_role(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: meetings_tick()
CREATE FUNCTION public.meetings_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform meetings_auto_held(500);
  -- Once a day: the email ledger and spent outcome links past 400 days (their meetings are long marked).
  if extract(hour from now()) = 4 and extract(minute from now()) < 5 then
    delete from meeting_mails where created_at < now() - interval '400 days';
    delete from meeting_outcome_uses where at < now() - interval '400 days';
  end if;
end;
$$;

ALTER FUNCTION public.meetings_tick() OWNER TO postgres;

-- function: member_remove(uuid, uuid)
CREATE FUNCTION public.member_remove(p_ws uuid, p_user uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can remove people';
  end if;
  if exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user and role = 'owner') then
    raise exception 'The owner can''t be removed';
  end if;
  delete from workspace_members where workspace_id = p_ws and user_id = p_user;
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'team.remove', p_user::text);
end;
$$;

ALTER FUNCTION public.member_remove(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: merge_values(jsonb, text, uuid, jsonb, jsonb, jsonb)
CREATE FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  k text;
  v jsonb;
  oldv jsonb;
  vals jsonb := coalesce(p_old, '{}');
  src jsonb := coalesce(p_src, '{}');
  changes jsonb := '[]';
  order_k jsonb;
  new_class text := source_class(p_source);
  new_rank int;
  old_rank int;
begin
  for k, v in select * from jsonb_each(coalesce(p_new, '{}')) loop
    continue when v = 'null'::jsonb or v = '""'::jsonb or v = '[]'::jsonb;
    oldv := vals->k;
    order_k := coalesce(p_classes->k, p_classes->'*');
    select o.n into new_rank from jsonb_array_elements_text(order_k) with ordinality o(c, n) where o.c = new_class;
    select o.n into old_rank from jsonb_array_elements_text(order_k) with ordinality o(c, n) where o.c = source_class(coalesce(src->k->>'s', 'import'));
    if oldv is null or oldv = 'null'::jsonb or oldv = '""'::jsonb or coalesce(new_rank, 99) <= coalesce(old_rank, 99) then
      if oldv is distinct from v then
        changes := changes || jsonb_build_object('key', k, 'old', oldv, 'new', v, 'old_source', src->k);
        vals := vals || jsonb_build_object(k, v);
      end if;
      src := src || jsonb_build_object(k, jsonb_strip_nulls(jsonb_build_object('s', p_source, 'at', now(), 'i', p_import)));
    end if;
  end loop;
  return jsonb_build_object('vals', vals, 'src', src, 'changes', changes);
end;
$$;

ALTER FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) OWNER TO postgres;

-- function: minute_tick()
CREATE FUNCTION public.minute_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform fire_due_schedules();
  if exists (select 1 from runs where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from explorations where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from plans where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from jobs where kind in ('brand_scan', 'form_qa') and status = 'queued' and run_after < now() - interval '20 seconds') then
    perform wake_runner();
  end if;
  if exists (select 1 from github_checks where status = 'pending' and coalesce(synced_at, created_at) < now() - interval '1 minute') then
    perform github_sync();
  end if;
  if exists (select 1 from alert_events where sent_at is null) then
    perform alerts_send();
  end if;
  perform sources_due();
  perform nurture_advance(500);
  perform sends_due();
  if extract(minute from now())::int % 5 = 0 then
    perform segments_due();
    perform domain_checks_due();
    perform nurture_enroll(null);
    perform lead_scores_due();
  end if;
  if extract(minute from now()) = 7 then
    perform prune_jobs();
  end if;
  if extract(minute from now()) = 23 then
    perform deliveries_sweep();
  end if;
  if extract(minute from now()) = 41 then
    perform form_checks_due();
  end if;
end;
$$;

ALTER FUNCTION public.minute_tick() OWNER TO postgres;

-- function: my_owned_workspaces()
CREATE FUNCTION public.my_owned_workspaces() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(workspace_id), '{}') from workspace_members where user_id = auth.uid() and role = 'owner';
$$;

ALTER FUNCTION public.my_owned_workspaces() OWNER TO postgres;

-- function: my_workspaces()
CREATE FUNCTION public.my_workspaces() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(workspace_id), '{}') from workspace_members where user_id = auth.uid();
$$;

ALTER FUNCTION public.my_workspaces() OWNER TO postgres;

-- function: next_local_hour(timestamp with time zone, text, integer)
CREATE FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  local timestamp := p_at at time zone p_tz;
  target timestamp := date_trunc('day', local) + make_interval(hours => p_hour);
begin
  if target <= local then
    target := target + interval '1 day';
  end if;
  return target at time zone p_tz;
end;
$$;

ALTER FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) OWNER TO postgres;

-- function: nurture_advance(integer)
CREATE FUNCTION public.nurture_advance(p_limit integer DEFAULT 500) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e record;
  st nurture_steps;
  nxt nurture_steps;
  queued int := 0;
  wss uuid[] := '{}';
  w uuid;
begin
  for e in
    select x.*, n.status as n_status, n.exit_stages, n.topic_id, c.deleted_at as c_deleted, c.lifecycle, c.email_clean
    from nurture_enrollments x
    join nurtures n on n.id = x.nurture_id
    left join contacts c on c.id = x.contact_id
    where x.status = 'active' and x.next_at <= now() and n.status = 'live'
    order by x.next_at
    limit greatest(least(coalesce(p_limit, 500), 5000), 1)
    for update of x skip locked
  loop
    if e.c_deleted is not null or e.email_clean is null then
      update nurture_enrollments set status = 'exited', exit_reason = 'deleted', finished_at = now() where id = e.id;
      continue;
    end if;
    if e.lifecycle = any(e.exit_stages) then
      update nurture_enrollments set status = 'exited', exit_reason = 'reached_stage', finished_at = now() where id = e.id;
      continue;
    end if;
    if exists (select 1 from suppressions where workspace_id = e.workspace_id and email_clean = e.email_clean) then
      update nurture_enrollments set status = 'exited', exit_reason = 'suppressed', finished_at = now() where id = e.id;
      continue;
    end if;
    if e.topic_id is not null and exists (select 1 from subscriptions where contact_id = e.contact_id and topic_id = e.topic_id and status = 'unsubscribed') then
      update nurture_enrollments set status = 'exited', exit_reason = 'unsubscribed', finished_at = now() where id = e.id;
      continue;
    end if;
    select * into st from nurture_steps where nurture_id = e.nurture_id and position = e.step;
    if st.id is null then
      update nurture_enrollments set status = 'done', finished_at = now() where id = e.id;
      continue;
    end if;
    if st.approved_at is null then
      update nurture_enrollments set next_at = now() + interval '1 hour' where id = e.id;
      continue;
    end if;
    insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe)
    values (e.workspace_id, st.email_id, e.contact_id, e.email_clean, 'nurture:' || e.id::text || ':' || e.step::text)
    on conflict (workspace_id, dedupe) do nothing;
    queued := queued + 1;
    if not e.workspace_id = any(wss) then wss := wss || e.workspace_id; end if;
    select * into nxt from nurture_steps where nurture_id = e.nurture_id and position = e.step + 1;
    if nxt.id is null then
      update nurture_enrollments set step = e.step + 1, status = 'done', finished_at = now() where id = e.id;
    else
      update nurture_enrollments set step = e.step + 1, next_at = now() + make_interval(days => nxt.wait_days) where id = e.id;
    end if;
  end loop;
  foreach w in array wss loop
    perform enqueue_job(w, 'send', w::text, '{}', 0, 3);
  end loop;
  return queued;
end;
$$;

ALTER FUNCTION public.nurture_advance(p_limit integer) OWNER TO postgres;

-- function: nurture_enroll(uuid)
CREATE FUNCTION public.nurture_enroll(p_nurture uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n nurtures;
  first_wait int;
  added int := 0;
  k int;
  mark timestamptz;
begin
  for n in select * from nurtures where status = 'live' and (p_nurture is null or id = p_nurture) loop
    select wait_days into first_wait from nurture_steps where nurture_id = n.id order by position limit 1;
    if first_wait is null then continue; end if;
    if n.trigger->>'kind' = 'segment' then
      insert into nurture_enrollments (workspace_id, nurture_id, contact_id, next_at)
      select n.workspace_id, n.id, m.contact_id, now() + make_interval(days => first_wait)
      from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
      where m.segment_id = nullif(n.trigger->>'segment_id', '')::uuid and m.left_at is null
        and not exists (select 1 from nurture_enrollments x where x.nurture_id = n.id and x.contact_id = m.contact_id)
      limit 5000
      on conflict (nurture_id, contact_id) do nothing;
      get diagnostics k = row_count;
    elsif n.trigger->>'kind' = 'form' then
      select enrolled_to into mark from nurture_marks where nurture_id = n.id;
      insert into nurture_enrollments (workspace_id, nurture_id, contact_id, next_at)
      select distinct n.workspace_id, n.id, e.contact_id, now() + make_interval(days => first_wait)
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = n.workspace_id and e.kind = 'form.submitted' and e.data->>'form_id' = n.trigger->>'form_id'
        and e.at >= greatest(n.live_at, mark - interval '15 minutes')
        and not exists (select 1 from nurture_enrollments x where x.nurture_id = n.id and x.contact_id = e.contact_id)
      limit 5000
      on conflict (nurture_id, contact_id) do nothing;
      get diagnostics k = row_count;
      -- Move the mark only when this run took everything it found.
      if k < 5000 then
        insert into nurture_marks (nurture_id, enrolled_to) values (n.id, now())
        on conflict (nurture_id) do update set enrolled_to = excluded.enrolled_to;
      end if;
    else
      k := 0;
    end if;
    added := added + k;
  end loop;
  return added;
end;
$$;

ALTER FUNCTION public.nurture_enroll(p_nurture uuid) OWNER TO postgres;

-- function: nurture_step_save(uuid, uuid, integer, text, text, text, text, text[], boolean, text[])
CREATE FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean DEFAULT false, p_notes text[] DEFAULT '{}'::text[]) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n nurtures;
  pos int;
  eid uuid;
  sid uuid;
begin
  select * into n from nurtures where id = p_nurture;
  if n.id is null or not is_member(n.workspace_id) then raise exception 'Nurture not found'; end if;
  if coalesce(trim(p_subject), '') = '' then raise exception 'Add a subject'; end if;
  if p_step is null then
    if n.status = 'live' then raise exception 'Pause the nurture to add steps'; end if;
    select coalesce(max(position) + 1, 0) into pos from nurture_steps where nurture_id = n.id;
    if pos > 49 then raise exception 'Up to 50 steps'; end if;
  else
    select position into pos from nurture_steps where id = p_step and nurture_id = n.id;
    if pos is null then raise exception 'Step not found'; end if;
  end if;
  insert into emails (workspace_id, name, kind, subject, preheader, html, text, links, topic_id, marketing, status, created_by)
  values (n.workspace_id, left(n.name || ' · ' || (pos + 1), 200), 'journey', left(trim(p_subject), 300), nullif(left(trim(coalesce(p_preheader, '')), 300), ''),
          coalesce(p_html, ''), coalesce(p_text, ''), coalesce(p_links, '{}'), n.topic_id, true, 'sending', auth.uid())
  returning id into eid;
  if p_step is null then
    insert into nurture_steps (workspace_id, nurture_id, position, wait_days, email_id, ai, review_notes)
    values (n.workspace_id, n.id, pos, coalesce(p_wait_days, 2), eid, coalesce(p_ai, false), coalesce(p_notes, '{}'))
    returning id into sid;
  else
    update nurture_steps set wait_days = coalesce(p_wait_days, wait_days), email_id = eid, ai = coalesce(p_ai, false), review_notes = coalesce(p_notes, '{}'),
      approved_at = null, approved_by = null, updated_at = now()
    where id = p_step returning id into sid;
  end if;
  update nurtures set updated_at = now() where id = n.id;
  return sid;
end;
$$;

ALTER FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[]) OWNER TO postgres;

-- function: oauth_code_add(text, text, uuid, uuid, text, text)
CREATE FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  delete from oauth_codes where created_at < now() - interval '1 day';
  insert into oauth_codes (code_hash, client, workspace_id, user_id, redirect_uri, challenge, expires_at)
  values (p_hash, p_client, p_ws, p_user, p_redirect, nullif(p_challenge, ''), now() + interval '10 minutes');
end;
$$;

ALTER FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) OWNER TO postgres;

-- function: oauth_code_use(text, text)
CREATE FUNCTION public.oauth_code_use(p_hash text, p_client text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.oauth_code_use(p_hash text, p_client text) OWNER TO postgres;

-- function: oauth_key_make(text, text, text, text)
CREATE FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) OWNER TO postgres;

-- function: object_where(uuid, text, jsonb)
CREATE FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  parts text[] := '{true}';
  f jsonb;
  i int := 0;
  field text;
  op text;
  typ text;
  ftype text;
  expr text;
  vals text;
  v0 text;
  t text := case p_object when 'contact' then 'c' when 'company' then 'co' else 'r' end;
  fid uuid;
begin
  if p_filters is null or p_filters = 'null'::jsonb then
    return 'true';
  end if;
  if jsonb_typeof(p_filters) <> 'array' or jsonb_array_length(p_filters) > 20 then
    raise exception 'Filters are not valid';
  end if;
  for f in select * from jsonb_array_elements(p_filters) loop
    field := f->>'field';
    op := f->>'op';
    typ := null;
    expr := null;
    if jsonb_typeof(f->'values') is distinct from 'array' and f ? 'values' then
      raise exception 'Filters are not valid';
    end if;
    if field ~ '^f\.[a-z][a-z0-9_]{0,39}$' then
      select fd.type, fd.id into ftype, fid from fields fd where fd.workspace_id = p_ws and fd.object = p_object and fd.key = substr(field, 3);
      if ftype is null then
        raise exception 'Unknown filter field';
      end if;
      typ := case
        when ftype in ('number', 'currency', 'percent') then 'number'
        when ftype in ('date', 'datetime') then 'date'
        when ftype = 'checkbox' then 'bool'
        when ftype in ('select', 'user') then 'enum'
        when ftype = 'multi_select' then 'multi'
        when ftype = 'relation' then 'link'
        else 'text' end;
      expr := case typ
        when 'number' then format('try_numeric(%s.fields->>%L)', t, substr(field, 3))
        when 'date' then format('try_timestamptz(%s.fields->>%L)', t, substr(field, 3))
        when 'bool' then format('(%s.fields->>%L)::boolean', t, substr(field, 3))
        when 'multi' then format('(%s.fields->%L)', t, substr(field, 3))
        when 'link' then format('array(select l.to_id::text from record_links l where l.field_id = %L and l.from_id = %s.id)', fid, t)
        else format('(%s.fields->>%L)', t, substr(field, 3)) end;
    elsif field = 'q' then
      -- Quick search across the names people look for.
      typ := 'text';
      expr := case p_object when 'contact' then $e$concat_ws(' ', c.first_name, c.last_name, c.email, co.name)$e$
                            when 'company' then $e$concat_ws(' ', co.name, co.domain)$e$ else 'r.name' end;
    elsif p_object = 'contact' then
      case field
        when 'email' then typ := 'text'; expr := 'c.email';
        when 'name' then typ := 'text'; expr := $e$nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')$e$;
        when 'first_name' then typ := 'text'; expr := 'c.first_name';
        when 'last_name' then typ := 'text'; expr := 'c.last_name';
        when 'title' then typ := 'text'; expr := 'c.title';
        when 'phone' then typ := 'text'; expr := 'c.phone';
        when 'country' then typ := 'text'; expr := 'c.country';
        when 'region' then typ := 'text'; expr := 'c.region';
        when 'lead_status' then typ := 'enum'; expr := 'c.lead_status';
        when 'lifecycle' then typ := 'enum'; expr := 'c.lifecycle';
        when 'source' then typ := 'enum'; expr := 'c.source';
        when 'email_class' then typ := 'enum'; expr := 'c.email_class';
        when 'owner' then typ := 'enum'; expr := 'c.owner_user_id::text';
        when 'company' then typ := 'text'; expr := 'co.name';
        when 'company_domain' then typ := 'text'; expr := 'co.domain';
        when 'industry' then typ := 'text'; expr := 'co.industry';
        when 'size' then typ := 'text'; expr := 'co.size';
        when 'fit' then typ := 'number'; expr := 'a.fit';
        when 'intent' then typ := 'number'; expr := 'a.intent';
        when 'score' then typ := 'number'; expr := 'c.score';
        when 'known' then typ := 'bool'; expr := '(c.person_id is not null)';
        when 'segment' then typ := 'link'; expr := 'array(select m.segment_id::text from segment_members m where m.contact_id = c.id and m.left_at is null)';
        when 'created_at' then typ := 'date'; expr := 'c.created_at';
        when 'updated_at' then typ := 'date'; expr := 'c.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    elsif p_object = 'company' then
      case field
        when 'name' then typ := 'text'; expr := 'coalesce(co.name, co.domain)';
        when 'domain' then typ := 'text'; expr := 'co.domain';
        when 'industry' then typ := 'text'; expr := 'co.industry';
        when 'size' then typ := 'text'; expr := 'co.size';
        when 'country' then typ := 'text'; expr := 'co.country';
        when 'owner' then typ := 'enum'; expr := 'co.owner_user_id::text';
        when 'fit' then typ := 'number'; expr := 'a.fit';
        when 'intent' then typ := 'number'; expr := 'a.intent';
        when 'stage' then typ := 'enum'; expr := 'a.stage';
        when 'contacts' then typ := 'number'; expr := '(select count(*) from contacts x where x.company_id = co.id and x.deleted_at is null)';
        when 'created_at' then typ := 'date'; expr := 'co.created_at';
        when 'updated_at' then typ := 'date'; expr := 'co.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    else
      case field
        when 'name' then typ := 'text'; expr := 'r.name';
        when 'created_at' then typ := 'date'; expr := 'r.created_at';
        when 'updated_at' then typ := 'date'; expr := 'r.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    end if;

    vals := format('jsonb_array_elements_text($2->%s->''values'')', i);
    v0 := format('($2->%s->''values''->>0)', i);
    if op in ('gte', 'lte') and coalesce(f->'values'->>0, '') !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'Enter a number';
    end if;
    if op in ('within', 'before') and coalesce(f->'values'->>0, '') !~ '^[0-9]{1,5}$' then
      raise exception 'Enter a number of days';
    end if;
    if op in ('is', 'is_not', 'contains') and coalesce(jsonb_array_length(f->'values'), 0) = 0 then
      raise exception 'Pick a value';
    end if;

    parts := parts || case
      when op = 'empty' and typ = 'multi' then format('coalesce(jsonb_array_length(%s), 0) = 0', expr)
      when op = 'not_empty' and typ = 'multi' then format('coalesce(jsonb_array_length(%s), 0) > 0', expr)
      when op = 'empty' and typ = 'link' then format('cardinality(%s) = 0', expr)
      when op = 'not_empty' and typ = 'link' then format('cardinality(%s) > 0', expr)
      when op = 'empty' then format('(%s is null or %s::text = '''')', expr, expr)
      when op = 'not_empty' then format('(%s is not null and %s::text <> '''')', expr, expr)
      when typ = 'text' and op = 'is' then format('lower(%s) = any(array(select lower(x) from %s x))', expr, vals)
      when typ = 'text' and op = 'is_not' then format('(%s is null or lower(%s) <> all(array(select lower(x) from %s x)))', expr, expr, vals)
      when typ = 'text' and op = 'contains' then
        format($q$exists (select 1 from %s x where %s ilike '%%' || replace(replace(replace(x, '\', '\\'), '%%', '\%%'), '_', '\_') || '%%')$q$, vals, expr)
      when typ = 'enum' and op = 'is' then format('%s = any(array(select %s))', expr, vals)
      when typ = 'enum' and op = 'is_not' then format('(%s is null or %s <> all(array(select %s)))', expr, expr, vals)
      when typ = 'multi' and op = 'is' then format('coalesce(%s, ''[]'') ?| array(select %s)', expr, vals)
      when typ = 'multi' and op = 'is_not' then format('not (coalesce(%s, ''[]'') ?| array(select %s))', expr, vals)
      when typ = 'link' and op = 'is' then format('%s && array(select %s)', expr, vals)
      when typ = 'link' and op = 'is_not' then format('not (%s && array(select %s))', expr, vals)
      when typ = 'number' and op = 'gte' then format('%s >= %s::numeric', expr, v0)
      when typ = 'number' and op = 'lte' then format('%s <= %s::numeric', expr, v0)
      when typ = 'date' and op = 'within' then format('%s >= now() - make_interval(days => %s::int)', expr, v0)
      when typ = 'date' and op = 'before' then format('%s < now() - make_interval(days => %s::int)', expr, v0)
      when typ = 'bool' and op = 'is' then format('coalesce(%s, false) = (%s = ''true'')', expr, v0)
      else null end;
    if parts[array_upper(parts, 1)] is null then
      raise exception 'This filter does not work on that field';
    end if;
    i := i + 1;
  end loop;
  return array_to_string(parts, ' and ');
end;
$_$;

ALTER FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) OWNER TO postgres;

-- function: open_tunnel(uuid)
CREATE FUNCTION public.open_tunnel(p_workspace uuid) RETURNS SETOF public.tunnels
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from tunnels
  where workspace_id = p_workspace and disconnected_at is null and last_seen_at > now() - interval '1 minute'
  order by connected_at desc
  limit 1;
$$;

ALTER FUNCTION public.open_tunnel(p_workspace uuid) OWNER TO postgres;

-- function: opportunities_ingest(uuid, jsonb)
CREATE FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  v_oid uuid;
  f_company uuid;
  f_contacts uuid;
  it jsonb;
  rid uuid;
  f fields%rowtype;
  k text;
  v jsonb;
  clean jsonb;
  stage text;
  created int := 0;
  updated int := 0;
  skipped int := 0;
begin
  select * into s from sources where id = p_source;
  if s.id is null then
    raise exception 'Source not found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 1000 then
    raise exception 'Send up to 1,000 rows at a time';
  end if;
  perform crm_seed(s.workspace_id);
  select id into v_oid from objects where workspace_id = s.workspace_id and key = 'opportunity';
  select id into f_company from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = 'company';
  select id into f_contacts from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = 'contacts';

  for it in select value from jsonb_array_elements(p_rows) loop
    if coalesce(it->>'id', '') = '' then
      skipped := skipped + 1;
      continue;
    end if;
    stage := nullif(trim(coalesce(it#>>'{fields,stage}', '')), '');
    if stage is not null then
      update fields set options = options || jsonb_build_array(jsonb_build_object(
          'value', left(stage, 80),
          'label', left(coalesce(nullif(trim(it->>'stage_label'), ''), stage), 80),
          'kind', case when it->>'stage_kind' in ('won', 'lost') then it->>'stage_kind' else 'open' end)),
        updated_at = now()
      where workspace_id = s.workspace_id and object = 'opportunity' and key = 'stage' and jsonb_array_length(options) < 100
        and not exists (select 1 from jsonb_array_elements(options) o where coalesce(o->>'value', o #>> '{}') = left(stage, 80));
    end if;
    clean := '{}';
    for k, v in select * from jsonb_each(coalesce(it->'fields', '{}')) loop
      select * into f from fields where workspace_id = s.workspace_id and object = 'opportunity' and key = k and type <> 'relation';
      continue when f.id is null;
      begin
        v := field_value(s.workspace_id, f.type, f.options, f.label, v);
      exception when others then
        v := null;
      end;
      if v is not null then clean := clean || jsonb_build_object(k, v); end if;
    end loop;

    select id into rid from records where object_id = v_oid and source_ids @> jsonb_build_object(s.kind, it->>'id') and deleted_at is null limit 1;
    if rid is null then
      insert into records (workspace_id, object_id, name, fields, source_ids, field_sources)
      values (s.workspace_id, v_oid, left(coalesce(nullif(trim(it->>'name'), ''), 'Opportunity ' || (it->>'id')), 300), clean,
              jsonb_build_object(s.kind, left(it->>'id', 200)),
              (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x))
      returning id into rid;
      created := created + 1;
    else
      update records set
        name = left(coalesce(nullif(trim(it->>'name'), ''), name), 300),
        fields = fields || clean,
        field_sources = field_sources || (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x),
        updated_at = case when fields || clean is distinct from fields or coalesce(nullif(trim(it->>'name'), ''), name) is distinct from name then now() else updated_at end
      where id = rid;
      updated := updated + 1;
    end if;

    if it ? 'company' then
      delete from record_links where field_id = f_company and from_id = rid;
      insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
      select s.workspace_id, f_company, 'opportunity', rid, 'company', l.local_id
      from source_links l
      where l.source_id = p_source and l.object = 'company' and l.external_id = it->>'company' and l.deleted_at is null
      limit 1
      on conflict do nothing;
    end if;
    if it ? 'contacts' and jsonb_typeof(it->'contacts') = 'array' then
      delete from record_links where field_id = f_contacts and from_id = rid;
      insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
      select distinct s.workspace_id, f_contacts, 'opportunity', rid, 'contact', l.local_id
      from source_links l
      where l.source_id = p_source and l.object = 'contact' and l.deleted_at is null
        and l.external_id in (select jsonb_array_elements_text(it->'contacts'))
      on conflict do nothing;
    end if;
  end loop;
  return jsonb_build_object('created', created, 'updated', updated, 'skipped', skipped);
end;
$$;

ALTER FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) OWNER TO postgres;

-- function: opportunities_remove(uuid, text[])
CREATE FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  gone uuid[];
begin
  select * into s from sources where id = p_source;
  if s.id is null then
    raise exception 'Source not found';
  end if;
  with d as (
    update records r set deleted_at = now(), updated_at = now() from objects o
    where o.id = r.object_id and o.workspace_id = s.workspace_id and o.key = 'opportunity'
      and r.deleted_at is null and r.source_ids @> any (array(select jsonb_build_object(s.kind, x) from unnest(p_ids) x))
    returning r.id
  )
  select coalesce(array_agg(id), '{}') into gone from d;
  delete from record_links where workspace_id = s.workspace_id and from_id = any(gone);
  return coalesce(array_length(gone, 1), 0);
end;
$$;

ALTER FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) OWNER TO postgres;

-- function: payment_account_set(uuid, text, boolean)
CREATE FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into payment_accounts (workspace_id, stripe_account, ready) values (p_ws, p_account, p_ready)
  on conflict (workspace_id) do update set stripe_account = excluded.stripe_account, ready = excluded.ready, updated_at = now();
$$;

ALTER FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) OWNER TO postgres;

-- function: person_cache_forget()
CREATE FUNCTION public.person_cache_forget() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from person_cache where email_hash(email_clean) = new.value_hash;
  return new;
end;
$$;

ALTER FUNCTION public.person_cache_forget() OWNER TO postgres;

-- function: person_for_email(uuid, text)
CREATE FUNCTION public.person_for_email(p_ws uuid, p_email text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with recursive chain(id, depth) as (
    select i.person_id, 0 from identifiers i where i.workspace_id = p_ws and i.kind = 'email' and i.value_clean = p_email and i.person_id is not null
    union all
    select p.merged_into, c.depth + 1 from chain c join persons p on p.id = c.id where p.merged_into is not null and c.depth < 20
  )
  select c.id from chain c join persons p on p.id = c.id where p.merged_into is null order by c.depth desc limit 1;
$$;

ALTER FUNCTION public.person_for_email(p_ws uuid, p_email text) OWNER TO postgres;

-- function: person_name(text, text)
CREATE FUNCTION public.person_name(p_first text, p_last text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    AS $$ select pg_catalog.concat_ws(' ', p_first, p_last) $$;

ALTER FUNCTION public.person_name(p_first text, p_last text) OWNER TO postgres;

-- function: plan_caps(text)
CREATE FUNCTION public.plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer) RETURNS record
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case p_plan when 'starter' then 2000 when 'pro' then 5000 when 'business' then null else 250 end,
         case p_plan when 'starter' then 500 when 'pro' then 2000 when 'business' then 5000 else 100 end,
         case p_plan when 'starter' then 6 when 'pro' then 6 when 'business' then 6 else 1 end,
         case p_plan when 'starter' then null when 'pro' then null when 'business' then null else 1 end;
$$;

ALTER FUNCTION public.plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer) OWNER TO postgres;

-- function: plan_check_calendar(uuid, uuid, text, text)
CREATE FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cap int := (plan_caps(workspace_plan(p_ws))).calendars;
  n int;
begin
  if cap is null or p_provider in ('zoom', 'fake') then return null; end if;
  if exists (select 1 from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider = p_provider and lower(account_email) = lower(p_email)) then
    return null;
  end if;
  select count(*) into n from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider not in ('zoom', 'fake');
  if n + 1 > cap then
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Each seat can connect %s calendars.', cap) end;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) OWNER TO postgres;

-- function: plan_check_type(uuid, uuid, jsonb)
CREATE FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p text := workspace_plan(p_ws);
  v_kind text := coalesce(p_type ->> 'kind', 'one');
  v_active boolean := coalesce((p_type ->> 'active')::boolean, true);
  types_cap int := (plan_caps(p)).meeting_types;
  others int;
  n_hosts int;
begin
  if v_kind in ('group') and p = 'free' then return 'Group meetings are on Starter and up.'; end if;
  if v_kind in ('round_robin', 'collective') and p in ('free', 'starter') then return 'Team meetings are on Pro and up.'; end if;
  if v_kind in ('owner_first', 'double') and p <> 'business' then return 'This kind of meeting is on Business.'; end if;
  if p = 'free' and v_active and (p_type -> 'settings' -> 'price') is not null and jsonb_typeof(p_type -> 'settings' -> 'price') = 'object' then
    return 'Paid meetings are on Starter and up.';
  end if;
  if not v_active then return null; end if;
  if types_cap is not null then
    select count(*) into others from meeting_types where workspace_id = p_ws and active and id is distinct from p_id;
    if others + 1 > types_cap then return 'Free has 1 meeting type. Upgrade to add more.'; end if;
  end if;
  if p = 'free' then
    select count(distinct u) into n_hosts from (
      select u from meeting_types t, lateral plan_type_hosts(t.hosts, t.owner_user_id) u
      where t.workspace_id = p_ws and t.active and t.id is distinct from p_id
      union select u from plan_type_hosts(p_type -> 'hosts', nullif(p_type ->> 'owner_user_id', '')::uuid) u
    ) x;
    if n_hosts > 1 then return 'Free has 1 seat. Upgrade to add more.'; end if;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) OWNER TO postgres;

-- function: plan_hosts(uuid)
CREATE FUNCTION public.plan_hosts(p_ws uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(distinct u)::int from meeting_types t, lateral plan_type_hosts(t.hosts, t.owner_user_id) u
  where t.workspace_id = p_ws and t.active;
$$;

ALTER FUNCTION public.plan_hosts(p_ws uuid) OWNER TO postgres;

-- function: plan_limits(text)
CREATE FUNCTION public.plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer) RETURNS record
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select case p_plan when 'free' then 1 when 'starter' then 3 else null end,
         case p_plan when 'free' then 300 when 'starter' then 2000 when 'pro' then 10000 when 'team' then 10000 else null end,
         case p_plan when 'free' then 200 when 'starter' then 2000 when 'pro' then 10000 when 'team' then 10000 else null end;
$$;

ALTER FUNCTION public.plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer) OWNER TO postgres;

-- function: plan_month()
CREATE FUNCTION public.plan_month() RETURNS date
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select date_trunc('month', now())::date;
$$;

ALTER FUNCTION public.plan_month() OWNER TO postgres;

-- function: plan_status(uuid)
CREATE FUNCTION public.plan_status(p_ws uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b workspace_billing;
  u plan_usage;
  p text;
begin
  if not (is_member(p_ws) or auth.uid() is null) then raise exception 'Workspace not found'; end if;
  select * into b from workspace_billing where workspace_id = p_ws;
  select * into u from plan_usage where workspace_id = p_ws and month = plan_month();
  p := coalesce(b.plan, 'free');
  return jsonb_build_object(
    'plan', p,
    'interval', coalesce(b.billing_interval, 'month'),
    'status', b.status,
    'period_end', b.period_end,
    'customer', b.stripe_customer_id is not null,
    'subscription', b.stripe_subscription_id is not null,
    'hosts', plan_hosts(p_ws),
    'hosts_billed', coalesce(b.hosts, 1),
    'submissions', coalesce(u.submissions, 0),
    'submissions_cap', (plan_caps(p)).submissions,
    'ai_credits', coalesce(u.ai_credits, 0),
    'ai_credits_cap', (plan_caps(p)).ai_credits,
    'month', plan_month()
  );
end;
$$;

ALTER FUNCTION public.plan_status(p_ws uuid) OWNER TO postgres;

-- function: plan_type_hosts(jsonb, uuid)
CREATE FUNCTION public.plan_type_hosts(p_hosts jsonb, p_owner uuid) RETURNS SETOF uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  select (h ->> 'user_id')::uuid from jsonb_array_elements(case when jsonb_typeof(p_hosts) = 'array' then p_hosts else '[]' end) h
  where h ->> 'user_id' ~ '^[0-9a-f-]{36}$'
  union select p_owner where p_owner is not null;
$_$;

ALTER FUNCTION public.plan_type_hosts(p_hosts jsonb, p_owner uuid) OWNER TO postgres;

-- function: plans_wake()
CREATE FUNCTION public.plans_wake() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform wake_runner();
  return null;
end;
$$;

ALTER FUNCTION public.plans_wake() OWNER TO postgres;

-- function: poll_book(uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, jsonb, text, jsonb, uuid)
CREATE FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb DEFAULT '{}'::jsonb, p_booked_by uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  l meeting_links%rowtype;
  mid uuid;
begin
  select * into l from meeting_links where id = p_link and kind = 'poll' for update;
  if l.id is null or l.closed_at is not null or l.meeting_id is not null then raise exception 'link_closed'; end if;
  if not exists (select 1 from jsonb_array_elements(l.offered) o where (o->>'start')::timestamptz = p_start) then raise exception 'not_offered'; end if;
  mid := meeting_book(l.workspace_id, l.type_id, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, 'poll', p_token_hash, 'booked',
                      null, null, p_link, 0, false, p_location, p_booked_by);
  update meeting_links set closed_at = now(), used_at = now(), meeting_id = mid where id = p_link;
  return mid;
end;
$$;

ALTER FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid) OWNER TO postgres;

-- function: poll_book_all(uuid, uuid[], timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, jsonb, text, jsonb, uuid, text, jsonb)
CREATE FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb DEFAULT '{}'::jsonb, p_booked_by uuid DEFAULT NULL::uuid, p_sealed text DEFAULT NULL::text, p_contact_row jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  mid uuid;
  ws uuid;
begin
  mid := poll_book(p_link, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, p_token_hash, p_location, p_booked_by);
  select workspace_id into ws from meetings where id = mid;
  if p_sealed is not null then
    perform meeting_token_keep(mid, p_token_hash, p_sealed);
  end if;
  if p_contact_row is not null then
    begin
      perform meeting_contact_make(mid, p_contact_row);
    exception when others then
      null;
    end;
  end if;
  perform enqueue_job(ws, 'meeting_sync', 'create:' || mid::text, jsonb_build_object('meeting', mid, 'action', 'create'));
  return jsonb_build_object('id', mid);
end;
$$;

ALTER FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb) OWNER TO postgres;

-- function: poll_vote(text, text, text, timestamp with time zone[])
CREATE FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  l meeting_links%rowtype;
begin
  select * into l from meeting_links where token_hash = p_hash and kind = 'poll' for share;
  if l.id is null or l.closed_at is not null or l.meeting_id is not null or (l.expires_at is not null and l.expires_at < now()) then raise exception 'link_closed'; end if;
  if coalesce(cardinality(p_picks), 0) = 0 or cardinality(p_picks) > 60 or exists (
    select 1 from unnest(p_picks) x
    where not exists (select 1 from jsonb_array_elements(l.offered) o where (o->>'start')::timestamptz = x)
  ) then
    raise exception 'bad_pick';
  end if;
  insert into poll_votes (link_id, email, name, picks)
  values (l.id, lower(trim(p_email)), nullif(trim(left(p_name, 200)), ''), (select jsonb_agg(to_jsonb(x) order by x) from (select distinct x from unnest(p_picks) x) d))
  on conflict (link_id, email) do update set name = excluded.name, picks = excluded.picks, at = now();
end;
$$;

ALTER FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) OWNER TO postgres;

-- function: poll_vote_view(text, text, text, timestamp with time zone[])
CREATE FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform poll_vote(p_hash, p_email, p_name, p_picks);
  return book_link(p_hash, null);
end;
$$;

ALTER FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) OWNER TO postgres;

-- function: product_events_sync()
CREATE FUNCTION public.product_events_sync() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.product_events_sync() OWNER TO postgres;

-- function: project_inbox()
CREATE FUNCTION public.project_inbox() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    new.inbox_id := substr(md5(gen_random_uuid()::text), 1, 8);
  else
    new.inbox_id := old.inbox_id;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.project_inbox() OWNER TO postgres;

-- function: project_limit()
CREATE FUNCTION public.project_limit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  u record;
begin
  select * into u from workspace_usage(new.workspace_id);
  if u.projects_limit is not null and u.projects_used >= u.projects_limit then
    raise exception 'Your plan includes % %. Upgrade in Settings to add more.', u.projects_limit, case when u.projects_limit = 1 then 'project' else 'projects' end;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.project_limit() OWNER TO postgres;

-- function: project_workspace()
CREATE FUNCTION public.project_workspace() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then
    raise exception 'Project not found';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.project_workspace() OWNER TO postgres;

-- function: prune_batch(regclass, text, integer)
CREATE FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer DEFAULT 100000) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
  total int := 0;
begin
  loop
    execute format('delete from %s where ctid = any (array(select ctid from %s where %s limit 5000))', p_table, p_table, p_where);
    get diagnostics n = row_count;
    total := total + n;
    exit when n < 5000 or total >= p_max;
  end loop;
  return total;
end;
$$;

ALTER FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer) OWNER TO postgres;

-- function: prune_history()
CREATE FUNCTION public.prune_history() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform prune_batch('public.field_history', format('import_id is not null and at < %L', now() - interval '30 days'));
  perform prune_batch('public.field_history', format('at < %L', now() - interval '13 months'));
end;
$$;

ALTER FUNCTION public.prune_history() OWNER TO postgres;

-- function: prune_jobs()
CREATE FUNCTION public.prune_jobs() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  k int;
  total int := 0;
begin
  loop
    delete from jobs where id in (
      select id from jobs
      where status in ('done', 'failed') and finished_at < now() - interval '1 day'
        and ((status = 'done' and (finished_at < now() - interval '7 days'
                                   or kind in ('calendar_refresh', 'score_account', 'stitch', 'ip_lookup', 'identity_changed', 'send',
                                               'route', 'enrich_contact', 'qualify', 'workflow_run', 'score_refresh', 'calendar_watch')))
             or finished_at < now() - interval '30 days')
      limit 10000);
    get diagnostics k = row_count;
    total := total + k;
    exit when k < 10000 or total >= 200000;
  end loop;
end;
$$;

ALTER FUNCTION public.prune_jobs() OWNER TO postgres;

-- function: prune_sync()
CREATE FUNCTION public.prune_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform prune_batch('public.sync_log', format('at < %L', now() - interval '90 days'));
  perform prune_batch('public.source_runs', format('started_at < %L', now() - interval '90 days'));
  perform prune_batch('public.hook_events', format('done_at is not null and done_at < %L', now() - interval '7 days'));
  perform prune_batch('public.hook_events', format('received_at < %L', now() - interval '30 days'));
  perform prune_batch('public.activity_out', format('claimed_at < %L', now() - interval '7 days'));
  perform prune_batch('public.source_event_keys', format('at < %L', now() - interval '13 months'));
end;
$$;

ALTER FUNCTION public.prune_sync() OWNER TO postgres;

-- function: prune_tick()
CREATE FUNCTION public.prune_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform prune_history();
  perform prune_sync();
  perform prune_batch('public.ai_cache', format('created_at < %L', now() - interval '90 days'));
  perform prune_batch('public.submissions', format('spam and created_at < %L', now() - interval '7 days'));
  perform prune_batch('public.form_checks', format('started_at < %L', now() - interval '90 days'));
end;
$$;

ALTER FUNCTION public.prune_tick() OWNER TO postgres;

-- function: push_candidates(uuid, text, integer, uuid[])
CREATE FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer DEFAULT 200, p_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with s as (select * from sources where id = p_source)
  select coalesce(jsonb_agg(x order by x->>'updated_at', x->>'id'), '[]') from (
    select jsonb_build_object(
      'id', c.id, 'updated_at', to_char(c.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      'email', c.email, 'email_clean', c.email_clean, 'first_name', c.first_name, 'last_name', c.last_name, 'title', c.title, 'phone', c.phone,
      'country', c.country, 'region', c.region, 'timezone', c.timezone, 'lifecycle', c.lifecycle, 'lead_status', c.lead_status, 'fields', c.fields,
      'score', c.score, 'score_band', c.score_band, 'owner_crm', c.owner_crm_id, 'sources', c.field_sources,
      'company_name', co.name, 'company_domain', co.domain,
      'external_id', l.external_id, 'last', l.last_values,
      'suppressed', exists (select 1 from suppressions su where su.workspace_id = c.workspace_id and su.email_clean = c.email_clean)) x
    from s join contacts c on c.workspace_id = s.workspace_id and c.deleted_at is null
    left join companies co on co.id = c.company_id
    left join source_links l on l.source_id = s.id and l.object = 'contact' and l.local_id = c.id and l.deleted_at is null
    where (p_ids is null and (p_after is null or (c.updated_at, c.id::text) > (split_part(p_after, '|', 1)::timestamptz, split_part(p_after, '|', 2))))
       or c.id = any(p_ids)
    order by c.updated_at, c.id
    limit least(p_limit, 1000)
  ) y;
$$;

ALTER FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[]) OWNER TO postgres;

-- function: valid_steps(jsonb, boolean)
CREATE FUNCTION public.valid_steps(steps jsonb, allow_use boolean) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
declare
  s jsonb;
begin
  if jsonb_typeof(steps) is distinct from 'array' or jsonb_array_length(steps) > 200 then
    return false;
  end if;
  for s in select * from jsonb_array_elements(steps) loop
    if jsonb_typeof(s) <> 'object' or jsonb_typeof(s -> 'id') is distinct from 'string' or length(s ->> 'id') not between 1 and 40 then
      return false;
    end if;
    if s ->> 'kind' in ('do', 'check') then
      if jsonb_typeof(s -> 'text') is distinct from 'string' or length(s ->> 'text') > 500 then
        return false;
      end if;
    elsif s ->> 'kind' = 'use' and allow_use then
      if coalesce(s ->> 'block', '') !~ '^[0-9a-f-]{36}$' then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  return true;
end;
$_$;

ALTER FUNCTION public.valid_steps(steps jsonb, allow_use boolean) OWNER TO postgres;

-- function: queue_run(public.tests, public.environments, text, uuid, uuid)
CREATE FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rid uuid;
begin
  insert into runs (workspace_id, project_id, test_id, test_name, test_version, environment_id, environment_name, base_url, lock, trigger, created_by, schedule_id)
  values (t.workspace_id, t.project_id, t.id, t.name, t.version, e.id, e.name, e.base_url, coalesce(t.lock, ''), p_trigger, p_by, p_schedule)
  returning id into rid;

  insert into run_steps (run_id, workspace_id, position, step_id, kind, label, intent)
  select rid, t.workspace_id, s.ord, s.step ->> 'id', s.step ->> 'kind',
         case when s.step ->> 'kind' = 'use' then 'Use ' || coalesce((select b.name from blocks b where b.id::text = s.step ->> 'block'), 'missing block')
              when s.step ->> 'kind' = 'check' then 'Check: ' || (s.step ->> 'text')
              else s.step ->> 'text' end,
         case when s.step ->> 'kind' = 'use' then (
                select string_agg(case when bs.step ->> 'kind' = 'check' then 'Check: ' || (bs.step ->> 'text') else bs.step ->> 'text' end, E'\n' order by bs.ord)
                from blocks b, jsonb_array_elements(b.steps) with ordinality as bs(step, ord)
                where b.id::text = s.step ->> 'block')
              else s.step ->> 'text' end
  from jsonb_array_elements(t.steps) with ordinality as s(step, ord);
  return rid;
end;
$$;

ALTER FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid) OWNER TO postgres;

-- function: record_cleanup()
CREATE FUNCTION public.record_cleanup() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  delete from notes where workspace_id = old.workspace_id and record_id = old.id;
  delete from tasks where workspace_id = old.workspace_id and record_id = old.id;
  return old;
end;
$$;

ALTER FUNCTION public.record_cleanup() OWNER TO postgres;

-- function: record_exists(uuid, text, uuid)
CREATE FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case p_object
    when 'contact' then exists (select 1 from contacts where id = p_record and workspace_id = p_ws)
    when 'company' then exists (select 1 from companies where id = p_record and workspace_id = p_ws)
    else exists (select 1 from records r join objects o on o.id = r.object_id where r.id = p_record and r.workspace_id = p_ws and o.key = p_object)
  end;
$$;

ALTER FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) OWNER TO postgres;

-- function: record_heal(uuid, integer, text, text, text, text)
CREATE FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r runs;
  hid uuid;
begin
  select * into r from runs where id = p_run;
  if r.id is null or r.test_id is null then
    return null;
  end if;
  select id into hid from heals where test_id = r.test_id and position = p_position and status = 'pending' and new_code = p_new and test_version = r.test_version;
  if hid is not null then
    return hid;
  end if;
  update heals set status = 'stale', decided_at = now() where test_id = r.test_id and position = p_position and status = 'pending';
  insert into heals (workspace_id, project_id, test_id, run_id, test_version, position, step_label, old_code, new_code, error)
  values (r.workspace_id, r.project_id, r.test_id, r.id, r.test_version, p_position, left(p_label, 500), left(p_old, 20000), left(p_new, 20000), left(p_error, 2000))
  returning id into hid;
  return hid;
end;
$$;

ALTER FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) OWNER TO postgres;

-- function: record_set(text, uuid, text, jsonb)
CREATE FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  f fields%rowtype;
  v jsonb;
  v_old jsonb;
begin
  if p_object = 'contact' then
    select workspace_id into ws from contacts where id = p_id and deleted_at is null;
  elsif p_object = 'company' then
    select workspace_id into ws from companies where id = p_id and deleted_at is null;
  else
    select r.workspace_id into ws from records r join objects o on o.id = r.object_id where r.id = p_id and o.key = p_object and r.deleted_at is null;
  end if;
  if ws is null or not is_member(ws) then
    raise exception 'Record not found';
  end if;

  if p_key like 'f.%' then
    select * into f from fields where workspace_id = ws and object = p_object and key = substr(p_key, 3);
    if f.id is null then
      raise exception 'Unknown field';
    end if;
    if f.type = 'relation' then
      if jsonb_typeof(p_value) not in ('array', 'null') or jsonb_array_length(coalesce(p_value, '[]')) > 500 then
        raise exception '%: pick records', f.label;
      end if;
      if not coalesce((f.config->>'multiple')::boolean, false) and jsonb_array_length(coalesce(p_value, '[]')) > 1 then
        raise exception '%: pick one record', f.label;
      end if;
      delete from record_links where field_id = f.id and from_id = p_id;
      insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
      select ws, f.id, p_object, p_id, f.config->>'target', x::uuid from jsonb_array_elements_text(coalesce(p_value, '[]')) x
      where case f.config->>'target'
              when 'contact' then exists (select 1 from contacts where id = x::uuid and workspace_id = ws and deleted_at is null)
              when 'company' then exists (select 1 from companies where id = x::uuid and workspace_id = ws)
              else exists (select 1 from records r join objects o on o.id = r.object_id where r.id = x::uuid and r.workspace_id = ws and o.key = f.config->>'target')
            end
      on conflict do nothing;
      return;
    end if;
    v := field_value(ws, f.type, f.options, f.label, p_value);
    if v is null and f.required then
      raise exception '% is required', f.label;
    end if;
    if p_object = 'contact' then
      perform contact_update(p_id, 'manual', jsonb_build_object('fields', jsonb_build_object(f.key, coalesce(v, 'null'::jsonb))), auth.uid());
      return;
    elsif p_object = 'company' then
      select fields->f.key into v_old from companies where id = p_id;
      update companies set fields = jsonb_strip_nulls(fields || jsonb_build_object(f.key, coalesce(v, 'null'::jsonb))),
        field_sources = field_sources || jsonb_build_object(p_key, jsonb_build_object('s', 'manual', 'at', now(), 'by', auth.uid())), updated_at = now()
      where id = p_id;
    else
      select fields->f.key into v_old from records where id = p_id;
      update records set fields = jsonb_strip_nulls(fields || jsonb_build_object(f.key, coalesce(v, 'null'::jsonb))),
        field_sources = field_sources || jsonb_build_object(p_key, jsonb_build_object('s', 'manual', 'at', now(), 'by', auth.uid())), updated_at = now()
      where id = p_id;
    end if;
    if v_old is distinct from v then
      insert into field_history (workspace_id, object, record_id, key, old, new, source, by) values (ws, p_object, p_id, p_key, v_old, v, 'manual', auth.uid());
    end if;
    return;
  end if;

  if p_object = 'contact' then
    if p_key in ('email', 'email_clean', 'email_class', 'company_domain') then
      raise exception 'Change the email or company website from the edit form';
    end if;
    if p_key = 'company' then
      perform contact_update(p_id, 'manual', jsonb_build_object('company_name', p_value #>> '{}'), auth.uid());
    else
      perform contact_update(p_id, 'manual', jsonb_build_object(p_key, p_value #>> '{}'), auth.uid());
    end if;
  elsif p_object = 'company' then
    if p_key not in ('name', 'industry', 'size', 'country', 'owner') then
      raise exception 'Unknown field %', p_key;
    end if;
    select to_jsonb(case p_key when 'name' then name when 'industry' then industry when 'size' then size when 'country' then country else owner_user_id::text end)
      into v_old from companies where id = p_id;
    if p_key = 'owner' and nullif(p_value #>> '{}', '') is not null and not exists (select 1 from workspace_members where workspace_id = ws and user_id::text = p_value #>> '{}') then
      raise exception 'Owner: pick a teammate';
    end if;
    if p_key = 'name' and nullif(trim(p_value #>> '{}'), '') is null and (select domain from companies where id = p_id) is null then
      raise exception 'A company needs a name or a domain';
    end if;
    update companies set
      name = case when p_key = 'name' then nullif(trim(p_value #>> '{}'), '') else name end,
      industry = case when p_key = 'industry' then nullif(trim(p_value #>> '{}'), '') else industry end,
      size = case when p_key = 'size' then nullif(trim(p_value #>> '{}'), '') else size end,
      country = case when p_key = 'country' then nullif(upper(trim(p_value #>> '{}')), '') else country end,
      owner_user_id = case when p_key = 'owner' then nullif(p_value #>> '{}', '')::uuid else owner_user_id end,
      field_sources = field_sources || jsonb_build_object(p_key, jsonb_build_object('s', 'manual', 'at', now(), 'by', auth.uid())),
      updated_at = now()
    where id = p_id;
    insert into field_history (workspace_id, object, record_id, key, old, new, source, by) values (ws, 'company', p_id, p_key, v_old, p_value, 'manual', auth.uid());
  else
    if p_key <> 'name' then
      raise exception 'Unknown field %', p_key;
    end if;
    if nullif(trim(p_value #>> '{}'), '') is null then
      raise exception 'Give it a name';
    end if;
    select to_jsonb(name) into v_old from records where id = p_id;
    update records set name = left(trim(p_value #>> '{}'), 300), updated_at = now(),
      field_sources = field_sources || jsonb_build_object('name', jsonb_build_object('s', 'manual', 'at', now(), 'by', auth.uid()))
    where id = p_id;
    insert into field_history (workspace_id, object, record_id, key, old, new, source, by) values (ws, p_object, p_id, 'name', v_old, p_value, 'manual', auth.uid());
  end if;
end;
$$;

ALTER FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) OWNER TO postgres;

-- function: records_ingest(uuid, text, jsonb)
CREATE FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  v_oid uuid;
  link_field uuid;
  r record;
  rid uuid;
  f fields%rowtype;
  k text;
  v jsonb;
  clean jsonb;
  created int := 0;
  updated int := 0;
  ids jsonb := '[]';
  cid uuid;
begin
  select * into s from sources where id = p_source;
  select id into v_oid from objects where workspace_id = s.workspace_id and key = p_object;
  if v_oid is null then
    raise exception 'Object not found';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'Send up to 5,000 rows at a time';
  end if;
  select id into link_field from fields
  where workspace_id = s.workspace_id and object = p_object and type = 'relation' and config->>'target' = 'contact' order by position, created_at limit 1;
  for r in select * from jsonb_to_recordset(p_rows) as x(id text, name text, fields jsonb, email_clean text) loop
    if coalesce(r.id, '') = '' then
      ids := ids || 'null'::jsonb;
      continue;
    end if;
    clean := '{}';
    for k, v in select * from jsonb_each(coalesce(r.fields, '{}')) loop
      select * into f from fields where workspace_id = s.workspace_id and object = p_object and key = k and type <> 'relation';
      continue when f.id is null;
      begin
        v := field_value(s.workspace_id, f.type, f.options, f.label, v);
      exception when others then
        v := null;
      end;
      if v is not null then clean := clean || jsonb_build_object(k, v); end if;
    end loop;
    select id into rid from records where object_id = v_oid and source_ids @> jsonb_build_object(s.kind, r.id) and deleted_at is null limit 1;
    if rid is null then
      insert into records (workspace_id, object_id, name, fields, source_ids, field_sources)
      values (s.workspace_id, v_oid, left(coalesce(nullif(trim(r.name), ''), r.id), 300), clean, jsonb_build_object(s.kind, left(r.id, 200)),
              (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x))
      returning id into rid;
      created := created + 1;
    else
      update records set
        name = left(coalesce(nullif(trim(r.name), ''), name), 300),
        fields = fields || clean,
        field_sources = field_sources || (select coalesce(jsonb_object_agg('f.' || x, jsonb_build_object('s', s.kind, 'at', now())), '{}') from jsonb_object_keys(clean) x),
        updated_at = case when fields || clean is distinct from fields or coalesce(nullif(trim(r.name), ''), name) is distinct from name then now() else updated_at end
      where id = rid;
      updated := updated + 1;
    end if;
    if link_field is not null and coalesce(r.email_clean, '') <> '' then
      select id into cid from contacts where workspace_id = s.workspace_id and deleted_at is null and email_clean = lower(trim(r.email_clean));
      if cid is not null then
        insert into record_links (workspace_id, field_id, from_object, from_id, to_object, to_id)
        values (s.workspace_id, link_field, p_object, rid, 'contact', cid) on conflict do nothing;
      end if;
    end if;
    ids := ids || to_jsonb(rid);
  end loop;
  return jsonb_build_object('ids', ids, 'created', created, 'updated', updated);
end;
$$;

ALTER FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) OWNER TO postgres;

-- function: records_list(uuid, text, jsonb, text, boolean, integer, integer)
CREATE FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb DEFAULT '[]'::jsonb, p_sort text DEFAULT 'updated_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  w text;
  ord text;
  sortf text := coalesce(p_sort, 'updated_at');
  total bigint;
  rows jsonb;
  v_oid uuid;
  base text;
  sel text;
  lim text := least(greatest(coalesce(p_limit, 100), 1), 1000)::text || ' offset ' || greatest(coalesce(p_offset, 0), 0)::text;
  t text := case p_object when 'contact' then 'c' when 'company' then 'co' else 'r' end;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if p_object not in ('contact', 'company') then
    select id into v_oid from objects where workspace_id = p_ws and key = p_object;
    if v_oid is null then
      raise exception 'Object not found';
    end if;
  end if;
  w := object_where(p_ws, p_object, coalesce(p_filters, '[]'));
  -- Sort by a built-in column or a custom field (as number when it reads as one, then as text).
  if sortf ~ '^f\.[a-z][a-z0-9_]{0,39}$' then
    ord := format('try_numeric(%1$s.fields->>%2$L) %3$s nulls last, lower(%1$s.fields->>%2$L) %3$s nulls last', t, substr(sortf, 3), case when p_desc then 'desc' else 'asc' end);
  else
    ord := case p_object
      when 'contact' then case sortf
        when 'name' then 'lower(coalesce(c.last_name, c.first_name, c.email))' when 'email' then 'c.email_clean' when 'company' then 'lower(co.name)'
        when 'score' then 'c.score' when 'fit' then 'a.fit' when 'lifecycle' then 'c.lifecycle' when 'lead_status' then 'c.lead_status'
        when 'title' then 'lower(c.title)' when 'country' then 'c.country' when 'created_at' then 'c.created_at' else 'c.updated_at' end
      when 'company' then case sortf
        when 'name' then 'lower(coalesce(co.name, co.domain))' when 'domain' then 'co.domain' when 'fit' then 'a.fit' when 'intent' then 'a.intent'
        when 'contacts' then 'contacts' when 'created_at' then 'co.created_at' else 'co.updated_at' end
      else case sortf when 'name' then 'lower(r.name)' when 'created_at' then 'r.created_at' else 'r.updated_at' end
    end || case when p_desc then ' desc nulls last' else ' asc nulls last' end;
  end if;
  ord := ord || ', ' || t || '.id';

  if p_object = 'contact' then
    base := 'contacts c left join companies co on co.id = c.company_id left join accounts a on a.id = co.account_id
             where c.workspace_id = $1 and c.deleted_at is null';
    sel := 'c.id, c.email, c.first_name, c.last_name, c.title, c.phone, c.country, c.region, c.lifecycle, c.lead_status, c.source,
            c.score, c.score_band, c.person_id, c.fields, c.created_at, c.updated_at, c.owner_user_id as owner, c.field_sources,
            c.email_class, c.company_id, co.name as company_name, co.domain as company_domain, co.industry, co.size, co.account_id, a.fit, a.intent';
  elsif p_object = 'company' then
    base := 'companies co left join accounts a on a.id = co.account_id where co.workspace_id = $1 and co.deleted_at is null';
    sel := 'co.id, co.name, co.domain, co.industry, co.size, co.country, co.owner_user_id as owner, co.fields, co.field_sources, co.account_id,
            co.created_at, co.updated_at, a.fit, a.intent, a.stage,
            (select count(*) from contacts x where x.company_id = co.id and x.deleted_at is null) as contacts';
  else
    base := format('records r where r.workspace_id = $1 and r.object_id = %L and r.deleted_at is null', v_oid);
    sel := 'r.id, r.name, r.fields, r.field_sources, r.created_at, r.updated_at';
  end if;
  execute format('select count(*) from %s and %s', base, w) into total using p_ws, p_filters;
  execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from (select %s from %s and %s order by %s limit %s) x', sel, base, w, ord, lim)
    into rows using p_ws, p_filters;
  -- Relation fields come back as arrays of { id, name } per record.
  if exists (select 1 from fields where workspace_id = p_ws and object = p_object and type = 'relation') and jsonb_array_length(rows) > 0 then
    rows := (select jsonb_agg(x || jsonb_build_object('links', coalesce((
              select jsonb_object_agg(f.key, (select coalesce(jsonb_agg(jsonb_build_object('id', l.to_id, 'object', l.to_object, 'name',
                  case l.to_object when 'contact' then (select coalesce(nullif(trim(concat_ws(' ', k.first_name, k.last_name)), ''), k.email) from contacts k where k.id = l.to_id)
                                   when 'company' then (select coalesce(m.name, m.domain) from companies m where m.id = l.to_id)
                                   else (select rr.name from records rr where rr.id = l.to_id) end)), '[]')
                from record_links l where l.field_id = f.id and l.from_id = (x->>'id')::uuid))
              from fields f where f.workspace_id = p_ws and f.object = p_object and f.type = 'relation'), '{}')) order by n)
             from jsonb_array_elements(rows) with ordinality e(x, n));
  end if;
  return jsonb_build_object('total', total, 'rows', rows);
end;
$_$;

ALTER FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) OWNER TO postgres;

-- function: recover_jobs()
CREATE FUNCTION public.recover_jobs() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a int;
  b int;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('claritia:recover_jobs', 0)) then
    return 0;
  end if;
  update jobs j set
    status = case when j.attempts >= j.max_attempts then 'failed' else 'done' end,
    error = case when j.attempts >= j.max_attempts then 'The worker stopped answering' else 'Replaced by a newer job for the same key' end,
    finished_at = now(), locked_by = null, locked_until = null
  where j.id in (
    select x.id from jobs x
    where x.status = 'running' and x.locked_until < now()
      and (x.attempts >= x.max_attempts or (x.key <> '' and job_key_waiting(x.workspace_id, x.kind, x.key)))
    limit 5000
    for update skip locked
  );
  get diagnostics a = row_count;
  update jobs j set status = 'queued', run_after = now(), locked_by = null, locked_until = null,
    error = 'The worker stopped answering; trying again'
  where j.id in (
    select x.id from jobs x
    where x.status = 'running' and x.locked_until < now()
      and (x.key = '' or not job_key_waiting(x.workspace_id, x.kind, x.key))
    limit 5000
    for update skip locked
  );
  get diagnostics b = row_count;
  if b > 0 then
    perform pg_notify('claritia_jobs', '0');
  end if;
  return a + b;
end;
$$;

ALTER FUNCTION public.recover_jobs() OWNER TO postgres;

-- function: release_job(uuid, text, text)
CREATE FUNCTION public.release_job(p_id uuid, p_worker text, p_error text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  j jobs;
begin
  select * into j from jobs where id = p_id and status = 'running' and locked_by = p_worker for update;
  if not found then
    return false;
  end if;
  if j.key <> '' and job_key_waiting(j.workspace_id, j.kind, j.key) then
    update jobs set status = 'done', error = 'Replaced by a newer job for the same key', finished_at = now(),
      locked_by = null, locked_until = null where id = p_id;
  else
    update jobs set status = 'queued', run_after = now(), attempts = greatest(attempts - 1, 0),
      error = left(coalesce(p_error, 'Stopped with the worker; trying again'), 2000), locked_by = null, locked_until = null where id = p_id;
    perform pg_notify('claritia_jobs', j.priority::text);
  end if;
  return true;
end;
$$;

ALTER FUNCTION public.release_job(p_id uuid, p_worker text, p_error text) OWNER TO postgres;

-- function: report_bounds(uuid, date, date)
CREATE FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) RETURNS tstzrange
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select tstzrange((p_from::timestamp at time zone ws_tz(p_ws)), ((p_to + 1)::timestamp at time zone ws_tz(p_ws)), '[)');
$$;

ALTER FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) OWNER TO postgres;

-- function: report_facts(uuid, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) RETURNS TABLE(contact_id uuid, lead_at timestamp with time zone, form_id uuid, source text, campaign text, owner uuid, rule_id text, qualified boolean, routed_at timestamp with time zone, booked_at timestamp with time zone, held boolean, touched_at timestamp with time zone, opp boolean, won boolean, won_amount numeric)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  with l as (select * from report_leads(p_ws, p_start, p_end)),
  ids as (select i.root, i.cid, l.lead_at from report_ids(p_ws, (select coalesce(array_agg(contact_id), '{}') from l)) i join l on l.contact_id = i.root),
  q as (select outcomes->0->>'label' as first from qualify_settings where workspace_id = p_ws),
  w as (select report_won_stages(p_ws) as won),
  rr as (
    select i.root, min(r.created_at) as routed_at, (array_agg(r.rule_id order by r.created_at desc))[1] as rule_id
    from router_runs r join ids i on i.cid = r.contact_id
    where r.workspace_id = p_ws and r.kind = 'owner' and r.undone_at is null group by i.root
  ),
  mt as (
    select i.root, min(m.created_at) as booked_at, bool_or(m.status = 'held') as held
    from meetings m join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.created_at >= i.lead_at and m.status <> 'pending_payment' group by i.root
  ),
  sl as (
    select i.root, min(s.acted_at) as acted from router_slas s join ids i on i.cid = s.contact_id
    where s.workspace_id = p_ws and s.acted_at >= i.lead_at group by i.root
  ),
  em as (
    select i.root, min(m.sent_at) as sent from email_messages m join emails e on e.id = m.email_id and e.kind = 'one_to_one' join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.sent_at >= i.lead_at group by i.root
  ),
  opps as (
    select distinct on (x.root, x.id) x.root, x.id, x.fields from (
      select i.root, i.lead_at, r.id, r.fields, r.created_at from ids i
        join record_links k on k.to_id = i.cid and k.to_object = 'contact' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
      union all
      select l.contact_id, l.lead_at, r.id, r.fields, r.created_at from l join contacts c on c.id = l.contact_id
        join record_links k on k.to_id = c.company_id and k.to_object = 'company' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
    ) x where x.created_at >= x.lead_at
  ),
  op as (
    select o.root, bool_or(o.fields->>'stage' = any((select won from w)::text[])) as won,
      sum(case when o.fields->>'stage' = any((select won from w)::text[]) and (o.fields->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (o.fields->>'amount')::numeric else 0 end) as amount
    from opps o group by o.root
  )
  select l.contact_id, l.lead_at, l.form_id,
    coalesce(c.first_touch->>'source', c.source), c.first_touch->>'campaign', c.owner_user_id, rr.rule_id,
    (c.lifecycle in ('mql', 'sql', 'opportunity', 'customer') or (c.qualify_outcome is not null and c.qualify_outcome = (select first from q))),
    rr.routed_at, mt.booked_at, coalesce(mt.held, false), least(sl.acted, mt.booked_at, em.sent),
    op.root is not null, coalesce(op.won, false), coalesce(op.amount, 0)
  from l join contacts c on c.id = l.contact_id
  left join rr on rr.root = l.contact_id left join mt on mt.root = l.contact_id left join sl on sl.root = l.contact_id
  left join em on em.root = l.contact_id left join op on op.root = l.contact_id;
$_$;

ALTER FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) OWNER TO postgres;

-- function: report_funnel_range(uuid, date, date, text)
CREATE FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with b as (select report_bounds(p_ws, p_from, p_to) r),
  f as (
    select x.*, coalesce(case p_by when 'source' then x.source when 'campaign' then x.campaign when 'form' then x.form_id::text when 'rep' then x.owner::text when 'rule' then x.rule_id end, '') as k
    from b, report_facts(p_ws, lower(b.r), upper(b.r)) x
  ),
  fd as (select form_id::text as k, sum(views) as views, sum(starts) as starts from form_daily where workspace_id = p_ws and day between p_from and p_to group by form_id),
  vis as (select key as k, visits from report_visits(p_ws, p_from, p_to, case when p_by in ('source', 'campaign') then p_by end)),
  keys as (
    select k from f
    union select k from vis where p_by in ('source', 'campaign')
    union select k from fd where p_by = 'form'
  ),
  g as (
    select keys.k,
      count(f.contact_id) as submitted, count(*) filter (where f.qualified) as qualified, count(*) filter (where f.routed_at is not null) as routed,
      count(*) filter (where f.booked_at is not null) as booked, count(*) filter (where f.held) as held, count(*) filter (where f.opp) as opportunity,
      count(*) filter (where f.won) as won, coalesce(sum(f.won_amount), 0) as won_amount
    from keys left join f on f.k = keys.k group by keys.k
  )
  select jsonb_build_object(
    'visits', (select coalesce(sum(visits), 0) from vis),
    'views', (select coalesce(sum(views), 0) from fd),
    'starts', (select coalesce(sum(starts), 0) from fd),
    'submitted', (select count(*) from f), 'qualified', (select count(*) from f where qualified), 'routed', (select count(*) from f where routed_at is not null),
    'booked', (select count(*) from f where booked_at is not null), 'held', (select count(*) from f where held),
    'opportunity', (select count(*) from f where opp), 'won', (select count(*) from f where won), 'won_amount', (select coalesce(sum(won_amount), 0) from f))
  || case when p_by in ('source', 'campaign', 'form', 'rep', 'rule') then jsonb_build_object('groups', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', g.k,
        'visits', case when p_by in ('source', 'campaign') then coalesce((select visits from vis where vis.k = g.k), 0) end,
        'views', case when p_by = 'form' then coalesce((select views from fd where fd.k = g.k), 0) end,
        'starts', case when p_by = 'form' then coalesce((select starts from fd where fd.k = g.k), 0) end,
        'submitted', g.submitted, 'qualified', g.qualified, 'routed', g.routed, 'booked', g.booked, 'held', g.held,
        'opportunity', g.opportunity, 'won', g.won, 'won_amount', g.won_amount)) order by g.submitted desc, g.k)
    from g), '[]'::jsonb)) else '{}'::jsonb end;
$$;

ALTER FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) OWNER TO postgres;

-- function: report_ids(uuid, uuid[])
CREATE FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) RETURNS TABLE(root uuid, cid uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select r, r from unnest(p_roots) r
  union
  select coalesce(c2.merged_into, c.merged_into), c.id from contacts c left join contacts c2 on c2.id = c.merged_into
  where c.workspace_id = p_ws and c.merged_into is not null and coalesce(c2.merged_into, c.merged_into) = any(p_roots);
$$;

ALTER FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) OWNER TO postgres;

-- function: report_leads(uuid, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) RETURNS TABLE(contact_id uuid, lead_at timestamp with time zone, form_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with cand as (
    select coalesce(c2.merged_into, c.merged_into, c.id) as root
    from submissions s join contacts c on c.id = s.contact_id left join contacts c2 on c2.id = c.merged_into
    where s.workspace_id = p_ws and not s.test and not s.spam and s.created_at >= p_start and s.created_at < p_end
    union
    select coalesce(c2.merged_into, c.merged_into, c.id)
    from contacts c left join contacts c2 on c2.id = c.merged_into
    where c.workspace_id = p_ws and c.source = 'api' and c.created_at >= p_start and c.created_at < p_end
  ), near as (
    -- Every contact that can roll up to a candidate: itself, merged into it, or merged into one merged into it.
    select x.root as id from cand x
    union select c.id from cand x join contacts c on c.merged_into = x.root
    union select c1.id from cand x join contacts c0 on c0.merged_into = x.root join contacts c1 on c1.merged_into = c0.id
  ), members as (
    select coalesce(c2.merged_into, c.merged_into, c.id) as root, c.id, c.workspace_id, c.source, c.created_at
    from near n join contacts c on c.id = n.id left join contacts c2 on c2.id = c.merged_into
  ), touches as (
    select m.root, s.created_at as at, s.form_id
    from members m join submissions s on s.contact_id = m.id
    where m.root in (select root from cand) and s.workspace_id = p_ws and not s.test and not s.spam
    union all
    select m.root, m.created_at, null
    from members m
    where m.root in (select root from cand) and m.workspace_id = p_ws and m.source = 'api'
  ), firsts as (
    select distinct on (root) root, at, form_id from touches order by root, at
  )
  select f.root, f.at, f.form_id from firsts f join contacts r on r.id = f.root
  where f.at >= p_start and f.at < p_end and r.deleted_at is null and r.route_status is distinct from 'spam';
$$;

ALTER FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) OWNER TO postgres;

-- function: report_spam(uuid)
CREATE FUNCTION public.report_spam(p_contact uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select route_status = 'spam' from contacts where id = p_contact), false);
$$;

ALTER FUNCTION public.report_spam(p_contact uuid) OWNER TO postgres;

-- function: report_speed_sum(uuid, timestamp with time zone, timestamp with time zone, jsonb)
CREATE FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with f as (
    select (x->>'lead_at')::timestamptz as lead_at, (x->>'routed_at')::timestamptz as routed_at, (x->>'touched_at')::timestamptz as touched_at, (x->>'booked_at')::timestamptz as booked_at
    from jsonb_array_elements(p_facts) x
  ),
  s as (select x.status from router_slas x where x.workspace_id = p_ws and x.started_at >= p_start and x.started_at < p_end and x.status in ('met', 'missed'))
  select jsonb_build_object(
    'leads', count(*),
    'assigned', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from routed_at - lead_at)) filter (where routed_at is not null),
                                   'p90', percentile_cont(0.9) within group (order by extract(epoch from routed_at - lead_at)) filter (where routed_at is not null),
                                   'n', count(*) filter (where routed_at is not null)),
    'touched', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from touched_at - lead_at)) filter (where touched_at is not null),
                                  'p90', percentile_cont(0.9) within group (order by extract(epoch from touched_at - lead_at)) filter (where touched_at is not null),
                                  'n', count(*) filter (where touched_at is not null)),
    'booked', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from booked_at - lead_at)) filter (where booked_at is not null),
                                 'p90', percentile_cont(0.9) within group (order by extract(epoch from booked_at - lead_at)) filter (where booked_at is not null),
                                 'n', count(*) filter (where booked_at is not null)),
    'on_time', jsonb_build_object('met', (select count(*) from s where status = 'met'), 'total', (select count(*) from s)))
  from f;
$$;

ALTER FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) OWNER TO postgres;

-- function: report_visits(uuid, date, date, text)
CREATE FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text DEFAULT NULL::text) RETURNS TABLE(key text, visits bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with b as (select report_bounds(p_ws, p_from, p_to) r, ws_tz(p_ws) tz),
  rolled as (select day from site_rolled where workspace_id = p_ws and day between p_from and p_to),
  v as (
    select case p_by when 'source' then nullif(d.source, '') when 'campaign' then nullif(d.campaign, '') end as key, d.sessions::bigint as n
    from site_daily d where d.workspace_id = p_ws and d.day in (select day from rolled)
    union all
    select case p_by when 'source' then coalesce(s.source, s.referrer_host) when 'campaign' then s.campaign end, 1
    from sessions s, b where s.workspace_id = p_ws and not s.is_bot and not s.internal and s.started_at >= lower(b.r) and s.started_at < upper(b.r)
      and (s.started_at at time zone b.tz)::date not in (select day from rolled)
  )
  select coalesce(key, case when p_by = 'source' then 'direct' else '' end), sum(n)::bigint from v group by 1;
$$;

ALTER FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text) OWNER TO postgres;

-- function: report_won_stages(uuid)
CREATE FUNCTION public.report_won_stages(p_ws uuid) RETURNS text[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(array_agg(o->>'value'), array['won']) from fields f, jsonb_array_elements(f.options) o
  where f.workspace_id = p_ws and f.object = 'opportunity' and f.key = 'stage' and o->>'kind' = 'won';
$$;

ALTER FUNCTION public.report_won_stages(p_ws uuid) OWNER TO postgres;

-- function: reports_nightly()
CREATE FUNCTION public.reports_nightly() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w record;
begin
  for w in
    select distinct st.workspace_id from sites st
    where exists (select 1 from sessions s where s.workspace_id = st.workspace_id and s.started_at > now() - interval '2 days')
  loop
    perform site_daily_roll(w.workspace_id, (now() at time zone ws_tz(w.workspace_id))::date - 1);
  end loop;
  perform first_touch_fill();
  perform prune_batch('public.form_seen', format('at < %L', now() - interval '1 day'), 1000000);
  perform prune_batch('public.form_field_sessions', format('day < %L', current_date - interval '13 months'));
end;
$$;

ALTER FUNCTION public.reports_nightly() OWNER TO postgres;

-- function: retry_run(uuid)
CREATE FUNCTION public.retry_run(p_run uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r runs;
  t tests;
  nid uuid;
begin
  select * into r from runs where id = p_run for update;
  if r.id is null or r.status <> 'failed' or r.retry_of is not null or r.retried_as is not null then
    return null;
  end if;
  select * into t from tests where id = r.test_id;

  insert into runs (workspace_id, project_id, test_id, test_name, test_version, environment_id, environment_name, base_url, lock, trigger, created_by, retry_of)
  values (r.workspace_id, r.project_id, r.test_id, r.test_name,
          case when r.lock_saved and t.id is not null then t.version else r.test_version end,
          r.environment_id, r.environment_name, r.base_url,
          case when r.lock_saved and t.id is not null then coalesce(t.lock, r.lock) else r.lock end,
          'retry', r.created_by, r.id)
  returning id into nid;

  insert into run_steps (run_id, workspace_id, position, step_id, kind, label, intent)
  select nid, s.workspace_id, s.position, s.step_id, s.kind, s.label, s.intent from run_steps s where s.run_id = r.id;

  update runs set retried_as = nid where id = r.id;
  return nid;
end;
$$;

ALTER FUNCTION public.retry_run(p_run uuid) OWNER TO postgres;

-- function: revoke_api_key(uuid)
CREATE FUNCTION public.revoke_api_key(p_key uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update api_keys set revoked_at = now() where id = p_key and revoked_at is null and is_member(workspace_id);
  if not found then
    raise exception 'Key not found';
  end if;
end;
$$;

ALTER FUNCTION public.revoke_api_key(p_key uuid) OWNER TO postgres;

-- function: router_action_count(uuid)
CREATE FUNCTION public.router_action_count(p_ws uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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
    union all
    select k.key, coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id) order by m.position) from routing_team_members m where m.team_id = k.team_id), '[]')
    from routing_team_keys k
    where k.workspace_id = p_ws and not exists (select 1 from arr, jsonb_array_elements(arr.queues) y where y->>'id' = k.key)
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

ALTER FUNCTION public.router_action_count(p_ws uuid) OWNER TO postgres;

-- function: router_alert_claim(uuid, text[])
CREATE FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) RETURNS text[]
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with ins as (
    insert into router_alert_sent (run_id, part) select p_run, x from unnest(p_parts) x where length(x) between 1 and 320
    on conflict do nothing returning part)
  select coalesce(array_agg(part), '{}') from ins;
$$;

ALTER FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) OWNER TO postgres;

-- function: router_alert_info(uuid)
CREATE FUNCTION public.router_alert_info(p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select jsonb_build_object(
    'run', jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'contact_id', r.contact_id, 'kind', r.kind, 'owner', r.owner, 'by', r."by", 'reason', r.reason,
                              'queue_id', r.queue_id, 'rule_id', r.rule_id, 'steps', r.steps, 'facts', r.facts, 'undone', r.undone_at is not null),
    'sealed', (select sealed from router_secrets s where s.workspace_id = r.workspace_id),
    'slack', (select sealed from slack_installs s where s.workspace_id = r.workspace_id),
    'owner', case when r.owner is null then null else meeting_people(r.workspace_id, array[r.owner])->0 end,
    'admins', coalesce((select jsonb_agg(lower(u.email)) from workspace_members m join auth.users u on u.id = m.user_id
                        where m.workspace_id = r.workspace_id and m.role = 'owner' and u.email is not null), '[]'),
    'workspace', (select name from workspaces w where w.id = r.workspace_id),
    'form', (select f.name from forms f where f.id = case when r.facts->'values'->>'lead.form' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (r.facts->'values'->>'lead.form')::uuid end),
    'sending', meeting_sending(r.workspace_id))
  from router_runs r where r.id = p_run;
$_$;

ALTER FUNCTION public.router_alert_info(p_run uuid) OWNER TO postgres;

-- function: router_alert_unclaim(uuid, text[])
CREATE FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from router_alert_sent where run_id = p_run and part = any(p_parts);
$$;

ALTER FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) OWNER TO postgres;

-- function: router_assign(uuid, uuid, uuid, uuid)
CREATE FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return router_commit(p_ws, p_contact, 'hand:' || p_contact::text || ':' || extract(epoch from clock_timestamp())::text, 'manual',
    (select live_version from routers where workspace_id = p_ws), jsonb_build_object('kind', 'owner', 'user', p_owner, 'by', 'hand'),
    jsonb_build_array(jsonb_build_object('step', 'hand', 'ok', true, 'user', p_owner, 'by_user', p_by)), '{}', 0, false, p_by);
end;
$$;

ALTER FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) OWNER TO postgres;

-- function: router_assign_many(uuid, uuid[], uuid, uuid)
CREATE FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c uuid;
  n int := 0;
  tries int;
begin
  if cardinality(p_contacts) > 1000 then raise exception 'Assign up to 1,000 at a time'; end if;
  for c in select distinct x from unnest(p_contacts) x where x is not null order by x loop
    tries := 0;
    loop
      begin
        perform router_assign(p_ws, c, p_owner, p_by);
        n := n + 1;
        exit;
      exception when deadlock_detected or lock_not_available then
        tries := tries + 1;
        if tries >= 3 then raise; end if;
        perform pg_sleep(0.05 * tries);
      end;
    end loop;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) OWNER TO postgres;

-- function: router_chat_add(uuid, jsonb)
CREATE FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if jsonb_typeof(p_messages) <> 'array' then
    raise exception 'messages must be a list';
  end if;
  insert into router_chats (workspace_id, messages) values (p_ws, p_messages)
  on conflict (workspace_id) do update set
    messages = (select coalesce(jsonb_agg(m order by n), '[]'::jsonb) from (
      select m, n from (
        select m, n from jsonb_array_elements(router_chats.messages || excluded.messages) with ordinality as x(m, n)
        order by n desc limit 40) z) y),
    updated_at = now();
end;
$$;

ALTER FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) OWNER TO postgres;

-- function: router_chat_clear(uuid)
CREATE FUNCTION public.router_chat_clear(p_ws uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from router_chats where workspace_id = p_ws;
$$;

ALTER FUNCTION public.router_chat_clear(p_ws uuid) OWNER TO postgres;

-- function: router_commit(uuid, uuid, text, text, integer, jsonb, jsonb, jsonb, integer, boolean, uuid, jsonb)
CREATE FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean DEFAULT false, p_by_user uuid DEFAULT NULL::uuid, p_pick jsonb DEFAULT NULL::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  return routing_commit(jsonb_strip_nulls(jsonb_build_object(
    'ws', p_ws, 'contact', p_contact, 'key', p_key, 'reason', p_reason, 'policy_version', p_version, 'decision', p_result, 'steps', p_steps, 'facts', p_facts,
    'ms', p_ms, 'set_company', p_set_company, 'by_user', p_by_user, 'pick', p_pick,
    'policy_id', (select id from routing_policies where workspace_id = p_ws and is_default),
    'recheck', jsonb_build_object('away', p_result->>'by' in ('queue', 'fallback'), 'caps', p_result->>'by' = 'queue'))));
end;
$$;

ALTER FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb) OWNER TO postgres;

-- function: router_crm_user(uuid, text)
CREATE FUNCTION public.router_crm_user(p_ws uuid, p_crm text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select l.user_id from crm_owner_links l
  where l.workspace_id = p_ws and l.crm_owner_id = p_crm and l.user_id is not null
  order by l.updated_at desc limit 1;
$$;

ALTER FUNCTION public.router_crm_user(p_ws uuid, p_crm text) OWNER TO postgres;

-- function: router_draft_drop(uuid)
CREATE FUNCTION public.router_draft_drop(p_ws uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid := routing_default_policy(p_ws);
begin
  if pid is not null then perform routing_draft_drop(p_ws, pid); end if;
end;
$$;

ALTER FUNCTION public.router_draft_drop(p_ws uuid) OWNER TO postgres;

-- function: router_draft_save(uuid, jsonb, integer, uuid)
CREATE FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  pid := routing_default_policy(p_ws);
  begin
    return routing_draft_save(p_ws, pid, p_body, p_revision, p_user);
  exception when others then
    if sqlerrm like 'draft_conflict%' then raise exception 'conflict'; end if;
    raise;
  end;
end;
$$;

ALTER FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) OWNER TO postgres;

-- function: router_facts(uuid, uuid, text, uuid[], text[], text, text)
CREATE FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text DEFAULT NULL::text, p_email_class text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c contacts%rowtype;
  co companies%rowtype;
  dom text;
  opp_name text;
  opp_owner text;
  sub_id uuid;
  sub_form uuid;
  sub_values jsonb;
  sub_hidden jsonb;
  users uuid[];
  ex router_runs%rowtype;
  rt routers%rowtype;
begin
  if p_key is not null then
    select * into ex from router_runs where workspace_id = p_ws and key = p_key;
    if ex.id is not null then
      return jsonb_build_object('existing', jsonb_build_object('id', ex.id, 'kind', ex.kind, 'owner', ex.owner, 'by', ex."by", 'queue', ex.queue_id, 'rule', ex.rule_id));
    end if;
  end if;
  select * into c from contacts where id = p_contact and workspace_id = p_ws and deleted_at is null;
  -- The Test panel with an email no contact has yet: a lead with only that email.
  if c.id is null and p_contact is null and nullif(trim(p_email), '') is not null then
    c.email := lower(trim(p_email));
    c.email_clean := c.email;
    c.email_class := p_email_class;
    c.fields := '{}';
  elsif c.id is null then
    return null;
  end if;
  dom := lower(nullif(split_part(coalesce(c.email_clean, c.email, ''), '@', 2), ''));
  if c.company_id is not null then
    select * into co from companies where id = c.company_id and deleted_at is null;
  end if;
  if co.id is null and dom is not null and coalesce(c.email_class, 'work') not in ('free') then
    select * into co from companies where workspace_id = p_ws and deleted_at is null and merged_into is null
      and (domain = dom or dom like '%.' || domain)
    order by (owner_user_id is not null or owner_crm_id is not null) desc, length(domain) desc, created_at limit 1;
  end if;
  -- The open opportunity on the company, most recently changed first.
  if co.id is not null then
    select r.name, r.fields->>'owner' into opp_name, opp_owner
    from records r join objects o on o.id = r.object_id and o.key = 'opportunity'
    join record_links l on l.from_id = r.id and l.to_object = 'company' and l.to_id = co.id
    where r.workspace_id = p_ws and r.deleted_at is null and nullif(r.fields->>'owner', '') is not null
      and coalesce((select (opt->>'kind') from fields f, jsonb_array_elements(f.options) opt
                    where f.workspace_id = p_ws and f.object = 'opportunity' and f.key = 'stage' and opt->>'value' = r.fields->>'stage' limit 1), 'open') = 'open'
    order by r.updated_at desc limit 1;
  end if;
  -- The fill this route is for, or the contact's latest.
  select s.id, s.form_id, s."values", s.hidden into sub_id, sub_form, sub_values, sub_hidden from submissions s
  where c.id is not null and s.workspace_id = p_ws and s.contact_id = c.id
  order by (p_key is not null and p_key = 'form:' || s.id::text) desc, s.created_at desc limit 1;
  select * into rt from routers where workspace_id = p_ws;

  users := array(select distinct u from unnest(
    coalesce(p_users, '{}')
    || array[c.owner_user_id, router_owner_user(p_ws, c.owner_crm_id), co.owner_user_id, router_owner_user(p_ws, co.owner_crm_id), router_owner_user(p_ws, opp_owner)]
  ) u where u is not null);
  users := array(select distinct u from unnest(users || array(select r.backup from router_reps r where r.workspace_id = p_ws and r.user_id = any(users) and r.backup is not null)) u);

  return jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email, 'email_clean', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
                                  'title', c.title, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle, 'lead_status', c.lead_status, 'score', c.score,
                                  'score_band', c.score_band, 'fields', c.fields, 'route_status', c.route_status),
    'domain', dom,
    'owner', jsonb_build_object('user', case when c.owner_user_id is not null then c.owner_user_id else router_owner_user(p_ws, c.owner_crm_id) end, 'crm', c.owner_crm_id),
    'company', case when co.id is null then null else jsonb_build_object(
      'id', co.id, 'name', coalesce(co.name, co.domain), 'domain', co.domain, 'country', co.country, 'industry', co.industry, 'size', co.size, 'fields', co.fields,
      'owner', coalesce(co.owner_user_id, router_owner_user(p_ws, co.owner_crm_id)), 'owner_crm', co.owner_crm_id,
      'opp_owner', router_owner_user(p_ws, opp_owner), 'opp_name', opp_name) end,
    'submission', case when sub_id is null then null else jsonb_build_object('id', sub_id, 'form_id', sub_form, 'values', sub_values, 'hidden', sub_hidden) end,
    'recent', (select count(*) from submissions s where s.workspace_id = p_ws and s.contact_id = c.id and s.created_at > now() - interval '1 hour'),
    'reps', coalesce((select jsonb_object_agg(u, router_rep_facts(p_ws, u)) from unnest(users) u), '{}'),
    'counts', coalesce((select jsonb_object_agg(q, coalesce((
        select jsonb_object_agg(x.owner, jsonb_build_object('n', x.n, 'last', x.last))
        from (select owner, count(*) as n, max(created_at) as last from router_runs
              where workspace_id = p_ws and queue_id = q and kind = 'owner' and undone_at is null and created_at > now() - interval '30 days'
              group by owner) x), '{}'))
      from unnest(coalesce(p_queues, '{}')) q), '{}'),
    'lists', jsonb_build_object('allow', to_jsonb(coalesce(rt.allow, '{}')), 'block', to_jsonb(coalesce(rt.block, '{}')))
  );
end;
$$;

ALTER FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) OWNER TO postgres;

-- function: router_facts_full(uuid, uuid, text, uuid[], text[], text, text)
CREATE FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text DEFAULT NULL::text, p_email_class text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f jsonb := router_facts(p_ws, p_contact, p_key, p_users, p_queues, p_email, p_email_class);
  cid uuid;
begin
  if f is null or f ? 'existing' then return f; end if;
  cid := nullif(f->'contact'->>'id', '')::uuid;
  return f || jsonb_build_object('more', case when cid is null then '{}'::jsonb else coalesce(router_facts_more(cid), '{}'::jsonb) end);
end;
$$;

ALTER FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) OWNER TO postgres;

-- function: router_facts_more(uuid)
CREATE FUNCTION public.router_facts_more(p_contact uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_strip_nulls(jsonb_build_object('seniority', c.seniority, 'department', c.department, 'qualify', c.qualify_outcome,
    'employees', (select co.employees from companies co where co.id = c.company_id)))
  from contacts c where c.id = p_contact;
$$;

ALTER FUNCTION public.router_facts_more(p_contact uuid) OWNER TO postgres;

-- function: router_fields_src(uuid)
CREATE FUNCTION public.router_fields_src(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'custom', coalesce((select jsonb_agg(jsonb_build_object('object', f.object, 'key', f.key, 'label', f.label, 'type', f.type, 'options', f.options))
                        from fields f where f.workspace_id = p_ws), '[]'),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status) order by f.created_at)
                       from forms f where f.workspace_id = p_ws), '[]'),
    'latest', coalesce((select jsonb_agg(jsonb_build_object('form_id', x.id, 'version', x.version, 'body', x.body))
                        from (select f.id, f.version, v.body from forms f join form_versions v on v.form_id = f.id and v.version = f.version
                              where f.workspace_id = p_ws and f.version > 0 order by f.updated_at desc limit 200) x), '[]')
  );
$$;

ALTER FUNCTION public.router_fields_src(p_ws uuid) OWNER TO postgres;

-- function: router_lists_save(uuid, text[], text[])
CREATE FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  update routers set allow = coalesce(p_allow, allow), block = coalesce(p_block, block), updated_at = now() where workspace_id = p_ws;
end;
$$;

ALTER FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) OWNER TO postgres;

-- function: router_live(uuid)
CREATE FUNCTION public.router_live(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select jsonb_build_object('version', v.version, 'body', v.config, 'paused', r.paused_at is not null, 'policy_id', p.id)
     from routing_policies p join routing_policy_versions v on v.policy_id = p.id and v.version = p.active_version
     join routers r on r.workspace_id = p.workspace_id and r.live_version = p.active_version
     where p.workspace_id = p_ws and p.is_default),
    (select jsonb_build_object('version', v.version, 'body', v.body, 'paused', r.paused_at is not null)
     from routers r join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
     where r.workspace_id = p_ws));
$$;

ALTER FUNCTION public.router_live(p_ws uuid) OWNER TO postgres;

-- function: router_live_screen(uuid)
CREATE FUNCTION public.router_live_screen(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when is_member(p_ws) then (select x - 'paused' - 'policy_id' from router_live(p_ws) x) end;
$$;

ALTER FUNCTION public.router_live_screen(p_ws uuid) OWNER TO postgres;

-- function: router_members(uuid)
CREATE FUNCTION public.router_members(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select meeting_people(p_ws, coalesce(array(select m.user_id from workspace_members m where m.workspace_id = p_ws order by m.created_at, m.user_id), '{}'));
$$;

ALTER FUNCTION public.router_members(p_ws uuid) OWNER TO postgres;

-- function: router_owner_user(uuid, text)
CREATE FUNCTION public.router_owner_user(p_ws uuid, p_value text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select case
    when p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_value::uuid) then p_value::uuid
    when nullif(trim(p_value), '') is not null then router_crm_user(p_ws, trim(p_value))
  end;
$_$;

ALTER FUNCTION public.router_owner_user(p_ws uuid, p_value text) OWNER TO postgres;

-- function: router_pause(uuid, boolean, uuid)
CREATE FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update routers set paused_at = case when p_paused then coalesce(paused_at, now()) end, paused_by = case when p_paused then p_user end, updated_at = now()
  where workspace_id = p_ws;
$$;

ALTER FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) OWNER TO postgres;

-- function: router_pick(uuid, jsonb)
CREATE FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  q text := p_pick->>'queue';
  m text := coalesce(p_pick->>'method', 'rr');
  best jsonb;
  win int;
  turns jsonb;
  rows jsonb := '[]';
  x record;
begin
  select coalesce(sum(n), 0)::int, coalesce(jsonb_object_agg(owner::text, jsonb_build_object('n', n, 'last', last)) filter (where owner is not null), '{}')
  into win, turns
  from (
    select r.owner, count(*) as n, max(r.created_at) as last from router_runs r
    where r.workspace_id = p_ws and r.queue_id = q and r.kind = 'owner' and r.undone_at is null and r.created_at > now() - interval '30 days'
    group by r.owner
  ) g;
  for x in
    select (c->>'user')::uuid as u, greatest(1, least(10, coalesce((c->>'weight')::int, 1))) as w, ord,
           coalesce((turns->(c->>'user')::uuid::text->>'n')::bigint, 0) as n,
           (turns->(c->>'user')::uuid::text->>'last')::timestamptz as last,
           router_rep_facts(p_ws, (c->>'user')::uuid) as rf
    from jsonb_array_elements(coalesce(p_pick->'candidates', '[]')) with ordinality t(c, ord)
  loop
    rows := rows || jsonb_build_object('user', x.u, 'n', case when m = 'load' then (x.rf->>'meetings_week')::int else x.n end,
      'score', case when m = 'load' then (x.rf->>'meetings_week')::numeric when m = 'weighted' then x.n::numeric / x.w else x.n::numeric end,
      'last', coalesce(extract(epoch from x.last), 0), 'ord', x.ord,
      'ok', (x.rf->>'member')::boolean
            and not (x.rf->>'paused_until' is not null and (x.rf->>'paused_until')::timestamptz > now())
            and not (x.rf->>'cap_day' is not null and (x.rf->>'today')::int >= (x.rf->>'cap_day')::int)
            and not (x.rf->>'cap_week' is not null and (x.rf->>'week')::int >= (x.rf->>'cap_week')::int));
  end loop;
  select r into best from jsonb_array_elements(rows) r where (r->>'ok')::boolean
  order by (r->>'score')::numeric, (r->>'last')::numeric, (r->>'ord')::int limit 1;
  if best is null then return null; end if;
  return jsonb_build_object('user', best->>'user', 'n', (best->>'n')::int, 'window', win,
    'rest', coalesce((select jsonb_object_agg(r->>'user', jsonb_build_object('n', (r->>'n')::int, 'ok', (r->>'ok')::boolean)) from jsonb_array_elements(rows) r where r->>'user' <> best->>'user'), '{}'));
end;
$$;

ALTER FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) OWNER TO postgres;

-- function: router_prune()
CREATE FUNCTION public.router_prune() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  n := prune_batch('public.router_runs', format('created_at < %L', now() - interval '13 months'), 500000);
  perform prune_batch('public.router_replays', format('created_at < %L', now() - interval '7 days'));
  return n;
end;
$$;

ALTER FUNCTION public.router_prune() OWNER TO postgres;

-- function: router_publish(uuid, jsonb, text, uuid, boolean)
CREATE FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean DEFAULT true) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  pid := routing_default_policy(p_ws);
  return (routing_publish(p_ws, pid, p_body, p_note, p_user, null, null, p_clear_draft, '[]')->>'version')::int;
end;
$$;

ALTER FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean) OWNER TO postgres;

-- function: router_queue(uuid, text, uuid[], uuid)
CREATE FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[] DEFAULT NULL::uuid[], p_import uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int := 0;
begin
  if p_reason not in ('crm', 'import') then raise exception 'bad reason'; end if;
  if not exists (select 1 from routers where workspace_id = p_ws and live_version is not null) then return 0; end if;
  with c as (
    select x.id from contacts x
    where x.workspace_id = p_ws and x.deleted_at is null and x.owner_user_id is null and x.owner_crm_id is null
      and coalesce(x.route_status, '') <> 'spam'
      and ((p_contacts is not null and x.id = any(p_contacts)) or (p_import is not null and x.import_id = p_import))
    limit 50000
  ),
  ins as (
    insert into jobs (workspace_id, kind, key, payload, run_after, max_attempts, priority)
    select p_ws, 'route', p_reason || ':' || c.id::text,
           jsonb_build_object('contact', c.id, 'reason', p_reason, 'key', p_reason || ':' || c.id::text), now(), 5,
           job_priority('route', jsonb_build_object('reason', p_reason))
    from c
    on conflict (workspace_id, kind, key) where status = 'queued' and key <> ''
    do update set payload = excluded.payload, run_after = least(jobs.run_after, excluded.run_after), priority = least(jobs.priority, excluded.priority)
    returning 1
  )
  select count(*) into n from ins;
  if n > 0 then
    perform pg_notify('claritia_jobs', job_priority('route', jsonb_build_object('reason', p_reason))::text);
  end if;
  return n;
end;
$$;

ALTER FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid) OWNER TO postgres;

-- function: router_recent(uuid, uuid, integer)
CREATE FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer DEFAULT 10) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from router_runs r where r.workspace_id = p_ws and r.contact_id = p_contact and r.undone_at is null
                   and r.reason <> 'booking' and r.created_at > now() - make_interval(mins => greatest(1, least(p_minutes, 1440))))
      or exists (select 1 from jobs j where j.workspace_id = p_ws and j.kind = 'route' and j.status in ('queued', 'running') and j.payload->>'contact' = p_contact::text);
$$;

ALTER FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer) OWNER TO postgres;

-- function: router_rep_facts(uuid, uuid)
CREATE FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with a as (select coalesce((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user), 'UTC') as tz),
  z as (select tz, (date_trunc('day', now() at time zone tz) at time zone tz) as day0, (date_trunc('week', now() at time zone tz) at time zone tz) as week0 from a)
  select jsonb_build_object(
    'name', coalesce((select nullif(trim(bp.name), '') from booking_profiles bp where bp.workspace_id = p_ws and bp.user_id = p_user),
                     (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user), 'Someone'),
    'member', exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user),
    'tz', z.tz,
    'availability', (select jsonb_build_object('tz', av.tz, 'weekly', av.weekly, 'overrides', av.overrides) from availability av where av.workspace_id = p_ws and av.user_id = p_user),
    'paused_until', r.paused_until,
    'out_dates', coalesce(r.out_dates, '[]'),
    'calendar_out_until', (select max(b.end_at) from busy_blocks b join calendar_accounts c on c.id = b.account_id
                           where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.ooo and b.start_at <= now() and b.end_at > now()),
    'backup', r.backup,
    'cap_day', r.cap_day,
    'cap_week', r.cap_week,
    'today', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.day0),
    'week', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.week0),
    'meetings_week', (select count(*) from meetings m where m.workspace_id = p_ws and m.hosts @> array[p_user] and m.status in ('booked', 'held')
                      and m.start_at >= z.week0 and m.start_at < z.week0 + interval '7 days')
  )
  from z left join router_reps r on r.workspace_id = p_ws and r.user_id = p_user;
$$;

ALTER FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: router_rep_save(uuid, uuid, jsonb)
CREATE FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into router_reps (workspace_id, user_id) values (p_ws, p_user) on conflict do nothing;
  update router_reps set
    paused_until = case when p_patch ? 'paused_until' then nullif(p_patch->>'paused_until', '')::timestamptz else paused_until end,
    out_dates = case when p_patch ? 'out_dates' and jsonb_typeof(p_patch->'out_dates') = 'array' then p_patch->'out_dates' else out_dates end,
    backup = case when p_patch ? 'backup' then nullif(p_patch->>'backup', '')::uuid else backup end,
    cap_day = case when p_patch ? 'cap_day' then nullif(p_patch->>'cap_day', '')::int else cap_day end,
    cap_week = case when p_patch ? 'cap_week' then nullif(p_patch->>'cap_week', '')::int else cap_week end,
    updated_at = now()
  where workspace_id = p_ws and user_id = p_user;
end;
$$;

ALTER FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) OWNER TO postgres;

-- function: router_runs_wake_notify()
CREATE FUNCTION public.router_runs_wake_notify() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.key like 'form:%' then
    update jobs set run_after = now()
    where status = 'queued' and workspace_id = new.workspace_id and kind = 'form_notify' and key = 'form_notify:' || substr(new.key, 6)
      and run_after > now() and payload->>'waiting_route' = 'true';
    if found then
      perform pg_notify('claritia_jobs', '0');
    end if;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.router_runs_wake_notify() OWNER TO postgres;

-- function: router_sla_acted(uuid)
CREATE FUNCTION public.router_sla_acted(p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with t as (select * from router_slas where run_id = p_run),
  acts as (
    select 'note' as by, min(n.created_at) as at from t join notes n on n.workspace_id = t.workspace_id and n.object = 'contact' and n.record_id = t.contact_id
      and n.author = t.user_id and n.created_at >= t.started_at
    union all
    select 'task', min(k.done_at) from t join tasks k on k.workspace_id = t.workspace_id and k.object = 'contact' and k.record_id = t.contact_id
      and k.done and k.done_at >= t.started_at and (k.assignee = t.user_id or (k.assignee is null and k.created_by = t.user_id))
    union all
    select 'meeting', min(m.created_at) from t join meetings m on m.workspace_id = t.workspace_id and m.contact_id = t.contact_id
      and m.created_at >= t.started_at and m.status <> 'canceled'
    union all
    select 'marked', min(e.at) from t join contact_events e on e.contact_id = t.contact_id and e.kind = 'rep.contacted' and e.at >= t.started_at
  )
  select coalesce(
    (select jsonb_build_object('by', a.by, 'at', a.at) from acts a where a.at is not null order by a.at limit 1),
    (select jsonb_build_object('by', 'owner_changed', 'at', now()) from t join contacts c on c.id = t.contact_id
     where c.owner_user_id is distinct from t.user_id or c.deleted_at is not null));
$$;

ALTER FUNCTION public.router_sla_acted(p_run uuid) OWNER TO postgres;

-- function: router_sla_due()
CREATE FUNCTION public.router_sla_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  t router_slas%rowtype;
  a jsonb;
  n int := 0;
begin
  for t in
    select * from router_slas
    where status = 'open' and (due_at <= now() or (nudge_at <= now() and nudged_at is null))
    order by due_at limit 2000
    for update skip locked
  loop
    a := router_sla_acted(t.run_id);
    if a is not null then
      update router_slas set status = case when a->>'by' = 'owner_changed' then 'closed' else 'met' end, ended_by = a->>'by',
        acted_at = case when a->>'by' = 'owner_changed' then null else (a->>'at')::timestamptz end, ended_at = now()
      where run_id = t.run_id;
    elsif t.due_at <= now() then
      update router_slas set status = 'missed', ended_at = now() where run_id = t.run_id;
      if t.next in ('route', 'manager') then
        perform enqueue_job(t.workspace_id, 'route', 'sla:' || t.run_id::text,
          jsonb_build_object('contact', t.contact_id, 'reason', 'sla', 'key', 'sla:' || t.run_id::text, 'sla', t.run_id), 0, 5);
      else
        perform enqueue_job(t.workspace_id, 'router_sla', 'missed:' || t.run_id::text, jsonb_build_object('run', t.run_id, 'kind', 'missed'), 0, 5);
      end if;
    else
      update router_slas set nudged_at = now() where run_id = t.run_id;
      perform enqueue_job(t.workspace_id, 'router_sla', 'nudge:' || t.run_id::text, jsonb_build_object('run', t.run_id, 'kind', 'nudge'), 0, 5);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.router_sla_due() OWNER TO postgres;

-- function: router_sla_info(uuid)
CREATE FUNCTION public.router_sla_info(p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'sla', to_jsonb(t),
    'minutes', round(extract(epoch from (t.due_at - t.started_at)) / 60)::int,
    'rep', meeting_people(t.workspace_id, array[t.user_id])->0,
    'lead', (select jsonb_build_object('id', c.id, 'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), 'email', c.email,
                                       'company', (select co.name from companies co where co.id = c.company_id), 'owner', c.owner_user_id)
             from contacts c where c.id = t.contact_id),
    'passed', coalesce((select jsonb_agg(distinct x.user_id) from router_slas x where x.contact_id = t.contact_id and x.status = 'missed'
                        and x.started_at > now() - interval '30 days'), '[]'),
    'manager_member', t.manager is not null and exists (select 1 from workspace_members m where m.workspace_id = t.workspace_id and m.user_id = t.manager),
    'version', (select r.version from router_runs r where r.id = t.run_id),
    'slack', (select s.sealed from slack_installs s where s.workspace_id = t.workspace_id),
    'sealed', (select s.sealed from router_secrets s where s.workspace_id = t.workspace_id),
    'sending', meeting_sending(t.workspace_id))
  from router_slas t where t.run_id = p_run;
$$;

ALTER FUNCTION public.router_sla_info(p_run uuid) OWNER TO postgres;

-- function: router_sla_mark(uuid, uuid, uuid)
CREATE FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  c contacts%rowtype;
  n int;
begin
  select * into c from contacts where id = p_contact and workspace_id = p_ws and deleted_at is null;
  if c.id is null then raise exception 'not_found'; end if;
  if c.owner_user_id is distinct from p_user
     and not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user and m.role = 'owner') then
    raise exception 'not_owner';
  end if;
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source) values (p_ws, c.id, 'rep.contacted', jsonb_build_object('by', p_user), 'routing');
  update router_slas set status = 'met', ended_by = 'marked', acted_at = now(), ended_at = now()
  where contact_id = c.id and status = 'open';
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

ALTER FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) OWNER TO postgres;

-- function: router_sla_start()
CREATE FUNCTION public.router_sla_start() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s jsonb;
  mins int;
  nudge int;
begin
  if new.contact_id is null then return new; end if;
  update router_slas set status = 'closed', ended_by = 'owner_changed', ended_at = now()
  where contact_id = new.contact_id and status = 'open' and run_id <> new.id;
  if new.kind <> 'owner' or new.owner is null or new.undone_at is not null then return new; end if;
  if new.reason = 'sla' and new."by" = 'hand' then return new; end if;
  select v.body->'sla' into s from router_versions v where v.workspace_id = new.workspace_id and v.version = new.version;
  if s is null or coalesce((s->>'on')::boolean, false) is not true then return new; end if;
  mins := (s->>'minutes')::int;
  if mins is null or mins < 5 or mins > 10080 then return new; end if;
  nudge := nullif(s->>'nudge', '')::int;
  if nudge is not null and (nudge < 1 or nudge >= mins) then nudge := null; end if;
  insert into router_slas (run_id, workspace_id, contact_id, user_id, started_at, nudge_at, due_at, next, manager)
  values (new.id, new.workspace_id, new.contact_id, new.owner, new.created_at,
          case when nudge is not null then new.created_at + make_interval(mins => nudge) end,
          new.created_at + make_interval(mins => mins),
          case when s->>'next' in ('route', 'manager', 'nudge') then s->>'next' else 'route' end,
          case when s->>'next' = 'manager' then nullif(s->>'manager', '')::uuid end)
  on conflict (run_id) do nothing;
  return new;
end;
$$;

ALTER FUNCTION public.router_sla_start() OWNER TO postgres;

-- function: router_sla_undone()
CREATE FUNCTION public.router_sla_undone() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.undone_at is not null and old.undone_at is null then
    update router_slas set status = 'closed', ended_by = 'undone', ended_at = now() where run_id = new.id and status = 'open';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.router_sla_undone() OWNER TO postgres;

-- function: router_spam(uuid, uuid[])
CREATE FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  update router_runs set undone_at = now() where workspace_id = p_ws and contact_id = any(p_contacts) and undone_at is null;
  update contacts set route_status = 'spam' where workspace_id = p_ws and id = any(p_contacts);
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) OWNER TO postgres;

-- function: router_stats(uuid, integer)
CREATE FUNCTION public.router_stats(p_ws uuid, p_days integer DEFAULT 7) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with r as (select * from router_runs where workspace_id = p_ws and created_at > now() - make_interval(days => least(greatest(p_days, 1), 90)))
  select jsonb_build_object(
    'total', (select count(*) from r),
    'held', (select count(*) from r where kind = 'held'),
    'unassigned', (select count(*) from r where kind = 'unassigned'),
    'by', coalesce((select jsonb_object_agg(by, n) from (select by, count(*) n from r where kind = 'owner' group by by) x), '{}'),
    'rules', coalesce((select jsonb_object_agg(rule_id, n) from (select rule_id, count(*) n from r where rule_id is not null group by rule_id) x), '{}'),
    'queues', coalesce((select jsonb_object_agg(queue_id, n) from (select queue_id, count(*) n from r where queue_id is not null group by queue_id) x), '{}'),
    'p95_ms', (select percentile_cont(0.95) within group (order by ms) from r where ms is not null)
  );
$$;

ALTER FUNCTION public.router_stats(p_ws uuid, p_days integer) OWNER TO postgres;

-- function: router_steps_pick(jsonb, text, uuid, jsonb)
CREATE FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) RETURNS jsonb
    LANGUAGE plpgsql IMMUTABLE
    AS $$
declare
  out jsonb := '[]';
  e jsonb;
  o jsonb;
  others jsonb;
  prev text;
begin
  for e in select x from jsonb_array_elements(coalesce(p_steps, '[]')) x loop
    if e->>'step' = 'queue' and e->'queue'->>'id' = p_queue then
      others := '[]';
      for o in select x from jsonb_array_elements(coalesce(e->'others', '[]')) x loop
        continue when o->>'user' = p_owner::text;
        if not (o ? 'why') and p_pick->'rest' ? (o->>'user') then
          o := o || jsonb_build_object('n', (p_pick->'rest'->(o->>'user')->>'n')::int);
        end if;
        others := others || jsonb_build_array(o);
      end loop;
      prev := e->>'picked';
      if prev is not null and prev <> p_owner::text and p_pick->'rest' ? prev then
        others := others || jsonb_build_array(jsonb_build_object('user', prev, 'n', (p_pick->'rest'->prev->>'n')::int));
      end if;
      e := e || jsonb_build_object('picked', p_owner, 'pickedN', (p_pick->>'n')::int, 'window', (p_pick->>'window')::int, 'others', others);
    elsif e->>'step' = 'fallback' and e->'queue'->>'id' = p_queue then
      e := e || jsonb_build_object('picked', p_owner);
    end if;
    out := out || jsonb_build_array(e);
  end loop;
  return out;
end;
$$;

ALTER FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) OWNER TO postgres;

-- function: router_undo(uuid, uuid)
CREATE FUNCTION public.router_undo(p_ws uuid, p_contact uuid) RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with u as (update router_runs set undone_at = now() where workspace_id = p_ws and contact_id = p_contact and undone_at is null returning 1)
  select count(*)::int from u;
$$;

ALTER FUNCTION public.router_undo(p_ws uuid, p_contact uuid) OWNER TO postgres;

-- function: routing_abandon_minutes(uuid)
CREATE FUNCTION public.routing_abandon_minutes(p_source uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select coalesce((select case when s.no_slots->>'abandonAfter' ~ '^\d{1,4}$' then least(greatest((s.no_slots->>'abandonAfter')::int, 5), 1440) end
                   from routing_sources s where s.id = p_source), 30);
$_$;

ALTER FUNCTION public.routing_abandon_minutes(p_source uuid) OWNER TO postgres;

-- function: routing_booking_abandon(uuid)
CREATE FUNCTION public.routing_booking_abandon(p_run uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  mins int;
  due timestamptz;
  task uuid;
begin
  select * into r from router_runs where id = p_run for update;
  if r.id is null or r.meeting_id is not null or r.booking_state is distinct from 'awaiting_selection' then return jsonb_build_object('state', r.booking_state, 'done', true); end if;
  mins := routing_abandon_minutes(r.source_id);
  due := coalesce(r.booking_active_at, r.created_at) + make_interval(mins => mins);
  if due > now() then return jsonb_build_object('state', r.booking_state, 'wait_s', ceil(extract(epoch from due - now()))::int); end if;
  update router_runs set booking_state = 'abandoned' where id = r.id;
  if r.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then perform contact_events_roll(); end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (r.workspace_id, r.contact_id, 'lead.booking_abandoned', jsonb_build_object('run_id', r.id, 'after_min', mins), 'routing');
  end if;
  if coalesce((select (s.no_slots->>'abandonTask')::boolean from routing_sources s where s.id = r.source_id), false) then
    task := routing_followup(r.workspace_id, r.id, 'abandoned');
  end if;
  return jsonb_build_object('state', 'abandoned', 'done', true, 'task', task);
end;
$$;

ALTER FUNCTION public.routing_booking_abandon(p_run uuid) OWNER TO postgres;

-- function: routing_booking_reconcile(uuid, uuid, uuid)
CREATE FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  m meetings%rowtype;
begin
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then raise exception 'not_found: run'; end if;
  select * into m from meetings where id = r.meeting_id and workspace_id = p_ws;
  if m.id is null or r.booking_state not in ('pending_confirmation', 'failed') then return jsonb_build_object('state', r.booking_state, 'queued', false); end if;
  if routing_meeting_placed(m.events) then
    update router_runs set booking_state = 'confirmed', booking_reason = null where id = r.id;
    perform routing_followups_done(p_ws, r.id);
    return jsonb_build_object('state', 'confirmed', 'queued', false);
  end if;
  if m.status <> 'booked' then return jsonb_build_object('state', r.booking_state, 'queued', false); end if;
  perform enqueue_job(p_ws, 'meeting_sync', 'create:' || m.id::text, jsonb_build_object('meeting', m.id, 'action', 'create'), 0, 5);
  update router_runs set booking_state = 'pending_confirmation', booking_reason = 'outcome_unknown' where id = r.id;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, p_user, 'routing.booking_reconcile', r.id::text, jsonb_build_object('meeting', m.id));
  return jsonb_build_object('state', 'pending_confirmation', 'queued', true);
end;
$$;

ALTER FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) OWNER TO postgres;

-- function: routing_booking_touch(uuid, text)
CREATE FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  mins int;
begin
  select * into r from router_runs where workspace_id = p_ws and key = p_key for update;
  if r.id is null or r.meeting_id is not null or coalesce(r.booking_state, '') not in ('awaiting_selection', 'abandoned') then return r.booking_state; end if;
  mins := routing_abandon_minutes(r.source_id);
  update router_runs set booking_active_at = now(), booking_state = 'awaiting_selection', booking_reason = null where id = r.id;
  if r.booking_state = 'abandoned' and r.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then perform contact_events_roll(); end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (p_ws, r.contact_id, 'lead.booking_resumed', jsonb_build_object('run_id', r.id), 'routing');
  end if;
  perform enqueue_job(p_ws, 'routing_abandon', r.id::text, jsonb_build_object('run', r.id), mins * 60, 3);
  return 'awaiting_selection';
end;
$$;

ALTER FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) OWNER TO postgres;

-- function: routing_commit(jsonb)
CREATE FUNCTION public.routing_commit(p jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  ws uuid := nullif(p->>'ws', '')::uuid;
  cid uuid := nullif(p->>'contact', '')::uuid;
  k text := p->>'key';
  d jsonb := coalesce(p->'decision', '{}');
  kind text := d->>'kind';
  by_ text := d->>'by';
  owner uuid := nullif(d->>'user', '')::uuid;
  qkey text := d->>'queue';
  ex router_runs%rowtype;
  c contacts%rowtype;
  t routing_teams%rowtype;
  prev uuid;
  st jsonb;
  qr routing_quota%rowtype;
  wk int;
  eff text := 'none';
  counted boolean := false;
  advanced boolean := false;
  pos int;
  rid uuid;
  crm text;
  cands uuid[];
  m record;
  reviewer uuid;
  rreason text;
  steps jsonb := coalesce(p->'steps', '[]');
  trace jsonb := p->'trace';
  away boolean := coalesce((p->'recheck'->>'away')::boolean, by_ in ('queue', 'fallback'));
  caps boolean := coalesce((p->'recheck'->>'caps')::boolean, by_ = 'queue');
  state text;
  pk jsonb;
  e jsonb;
  out_steps jsonb := '[]';
begin
  if ws is null or cid is null or k is null or length(k) > 200 or kind is null or kind not in ('owner', 'held', 'unassigned') then raise exception 'routing_commit: bad request'; end if;
  if kind = 'owner' and owner is null and not (p ? 'pick') then raise exception 'routing_commit: no owner'; end if;

  -- 1. The request identity.
  perform pg_advisory_xact_lock(hashtextextended('routing-req:' || ws::text || ':' || k, 0));
  select * into ex from router_runs where workspace_id = ws and key = k;
  if ex.id is not null then
    return jsonb_build_object('status', 'dup', 'id', ex.id, 'kind', ex.kind, 'owner', ex.owner, 'by', ex."by", 'queue', ex.queue_id, 'rule', ex.rule_id,
                              'effect', ex.effect, 'assignment_state', ex.assignment_state, 'policy_version', ex.policy_version);
  end if;

  -- 2. The contact and its owner, read before anything is written.
  select * into c from contacts where id = cid and workspace_id = ws and deleted_at is null for update;
  if c.id is null then return jsonb_build_object('status', 'gone'); end if;
  prev := coalesce(c.owner_user_id, router_owner_user(ws, c.owner_crm_id));
  if p ? 'expect_owner' and prev is distinct from nullif(p->>'expect_owner', '')::uuid then
    return jsonb_build_object('status', 'stale', 'reason', 'ownership_changed', 'owner', prev);
  end if;

  -- 3. Who, checked again under the locks.
  if kind = 'owner' and p ? 'pick' then
    select tm.* into t from routing_team_keys tk join routing_teams tm on tm.id = tk.team_id
    where tk.workspace_id = ws and tk.key = p->'pick'->>'queue' for update of tm;
    if t.id is null then
      -- A queue with no team yet (a body written straight to the router's tables): the old pick from fresh counts.
      pk := router_pick(ws, p->'pick');
      if pk is null then return jsonb_build_object('status', 'stale', 'reason', 'no_eligible_recipient'); end if;
      owner := (pk->>'user')::uuid;
      steps := router_steps_pick(steps, qkey, owner, pk);
    else
      cands := array(select (x->>'user')::uuid from jsonb_array_elements(coalesce(p->'pick'->'candidates', '[]')) x where x->>'user' ~ '^[0-9a-f-]{36}$');
      for m in select u from unnest(cands) u order by u loop
        perform routing_quota_current(ws, m.u);
      end loop;
      perform 1 from routing_quota q where q.workspace_id = ws and q.user_id = any(cands) and q.period_start <= now() and q.period_end > now() order by q.user_id for update;
      owner := null;
      for m in
        select tmm.user_id u, tmm.position
        from routing_team_members tmm
        where tmm.team_id = t.id and tmm.user_id = any(cands)
        order by
          case when t.method = 'rr' then (tmm.position < t.next_position)::int else 0 end,
          case when t.method = 'load' then (router_rep_facts(ws, tmm.user_id)->>'meetings_week')::numeric
               when t.method = 'weighted' then (select count(*) from router_runs r where r.workspace_id = ws and r.owner = tmm.user_id and r.kind = 'owner' and r.undone_at is null
                                                  and r.created_at > now() - interval '30 days' and (r.team_id = t.id or r.queue_id in (select key from routing_team_keys where team_id = t.id)))::numeric / tmm.weight
               else 0 end,
          tmm.position
      loop
        st := routing_member_state(ws, m.u);
        continue when not (st->>'member')::boolean or (st->>'paused')::boolean or (st->>'out')::boolean;
        if m.u is distinct from prev then
          qr := routing_quota_current(ws, m.u);
          wk := (routing_quota_used(ws, m.u)->>'week')::int;
          continue when (st->>'cap_day') is not null and qr.n >= (st->>'cap_day')::int;
          continue when (st->>'cap_week') is not null and wk >= (st->>'cap_week')::int;
        end if;
        owner := m.u;
        pos := m.position;
        exit;
      end loop;
      if owner is null then return jsonb_build_object('status', 'stale', 'reason', 'no_eligible_recipient'); end if;
    end if;
  elsif kind = 'owner' then
    st := routing_member_state(ws, owner);
    if not (st->>'member')::boolean then return jsonb_build_object('status', 'stale', 'reason', 'not_member', 'user', owner); end if;
    if away and ((st->>'paused')::boolean or (st->>'out')::boolean) then return jsonb_build_object('status', 'stale', 'reason', 'away', 'user', owner); end if;
    if caps and owner is distinct from prev then
      qr := routing_quota_current(ws, owner);
      select * into qr from routing_quota where workspace_id = ws and user_id = owner and period_start = qr.period_start for update;
      wk := (routing_quota_used(ws, owner)->>'week')::int;
      if ((st->>'cap_day') is not null and qr.n >= (st->>'cap_day')::int) or ((st->>'cap_week') is not null and wk >= (st->>'cap_week')::int) then
        return jsonb_build_object('status', 'stale', 'reason', 'cap', 'user', owner);
      end if;
    end if;
  end if;

  if kind = 'owner' then
    eff := case when owner is not distinct from prev then 'retained' else 'new' end;
    counted := eff = 'new';
    advanced := eff = 'new' and t.id is not null and t.method = 'rr';
  end if;
  state := case kind when 'owner' then 'assigned' when 'held' then 'held_for_review' else 'unassigned_needs_review' end;

  -- The run's lines and trace say who was taken under the lock.
  if kind = 'owner' and qkey is not null and t.id is not null then
    for e in select x from jsonb_array_elements(steps) x loop
      if e->>'step' = 'queue' and e->'queue'->>'id' = qkey then
        e := e || jsonb_build_object('picked', owner, 'next', t.next_position) || case when eff = 'retained' then '{"retained": true}'::jsonb else '{}'::jsonb end;
      elsif e->>'step' in ('fallback', 'backup') and e ? 'picked' then
        e := e || jsonb_build_object('picked', owner);
      end if;
      out_steps := out_steps || jsonb_build_array(e);
    end loop;
    steps := out_steps;
  end if;
  if jsonb_typeof(trace) = 'object' then
    trace := jsonb_set(jsonb_set(trace, '{assignment,recipient}', coalesce(to_jsonb(owner), 'null')), '{assignment,effect}', to_jsonb(eff));
    trace := jsonb_set(trace, '{assignment,previousOwner}', coalesce(to_jsonb(prev), 'null'));
    if kind = 'owner' then trace := jsonb_set(trace, '{distribution,suggested}', to_jsonb(owner)); end if;
  end if;

  -- 4. The run, the assignment event, the count and the queue.
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, by_user,
                           policy_id, policy_version, source_id, source_revision, parent_run_id, assignment_state, booking_state, sync_state, previous_owner, effect, trace, team_id)
  values (ws, c.id, k, coalesce(p->>'reason', 'api'), nullif(p->>'policy_version', '')::int, kind, case when kind = 'owner' then owner end, case when kind = 'owner' then by_ end,
          case when kind = 'owner' then qkey end, d->>'rule', steps, coalesce(p->'facts', '{}'), nullif(p->>'ms', '')::int, nullif(p->>'by_user', '')::uuid,
          nullif(p->>'policy_id', '')::uuid, nullif(p->>'policy_version', '')::int, nullif(p->>'source_id', '')::uuid, nullif(p->>'source_revision', '')::int,
          nullif(p->>'parent_run', '')::uuid, state, coalesce(nullif(p->>'booking_state', ''), 'not_requested'), 'not_required', prev, eff, trace, t.id)
  returning id into rid;

  if kind = 'owner' then
    if counted then
      qr := routing_quota_current(ws, owner);
      update routing_quota set n = n + 1 where workspace_id = ws and user_id = owner and period_start = qr.period_start;
    end if;
    if advanced then update routing_teams set next_position = pos + 1 where id = t.id; end if;
    insert into routing_assignments (workspace_id, run_id, contact_id, user_id, previous_owner, team_id, counted, advanced, quota_period)
    values (ws, rid, c.id, owner, prev, t.id, counted, advanced, case when counted then qr.period_start end);

    -- 5. The owner. Retention writes nothing; a company's owner is never changed by a contact's assignment unless asked.
    if c.owner_user_id is distinct from owner then
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
      values (ws, 'contact', c.id, 'owner', to_jsonb(c.owner_user_id), to_jsonb(owner), c.field_sources->'owner', 'routing', nullif(p->>'by_user', '')::uuid);
    end if;
    crm := case when router_crm_user(ws, c.owner_crm_id) = owner then c.owner_crm_id
                else (select l.crm_owner_id from crm_owner_links l where l.workspace_id = ws and l.user_id = owner order by l.updated_at desc limit 1) end;
    update contacts set owner_user_id = owner, owner_crm_id = coalesce(crm, owner_crm_id), route_status = null,
      field_sources = case when c.owner_user_id is distinct from owner then coalesce(field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'routing', 'at', now())) else field_sources end,
      updated_at = case when c.owner_user_id is distinct from owner or c.route_status is not null then now() else updated_at end
    where id = c.id and (owner_user_id is distinct from owner or route_status is not null or owner_crm_id is distinct from coalesce(crm, owner_crm_id));
    if coalesce((p->>'set_company')::boolean, false) and c.company_id is not null then
      update companies set owner_user_id = owner, updated_at = now() where id = c.company_id and owner_user_id is null and owner_crm_id is null;
    end if;
  else
    -- Held or unallocated: the existing owner stays; one review item with a named reviewer.
    update contacts set route_status = kind where id = c.id;
    reviewer := nullif(p->>'reviewer', '')::uuid;
    if reviewer is null or not exists (select 1 from workspace_members w where w.workspace_id = ws and w.user_id = reviewer) then
      select w.user_id into reviewer from workspace_members w where w.workspace_id = ws order by (w.role = 'owner') desc, w.created_at limit 1;
    end if;
    rreason := coalesce(d->>'reason', case when kind = 'held' then case when d->'signals' ? 'rule' then 'rule' else 'spam' end else 'no_eligible_recipient' end);
    if reviewer is not null then
      insert into routing_reviews (workspace_id, run_id, contact_id, submission_id, policy_id, reason, reviewer)
      values (ws, rid, c.id, nullif(p->>'submission', '')::uuid, nullif(p->>'policy_id', '')::uuid, rreason, reviewer);
    end if;
  end if;

  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (ws, c.id, case kind when 'owner' then 'lead.routed' when 'held' then 'lead.held' else 'lead.unassigned' end,
          jsonb_strip_nulls(jsonb_build_object('run_id', rid, 'owner', case when kind = 'owner' then owner end, 'by', by_, 'queue', qkey, 'rule', d->>'rule',
                                               'reason', p->>'reason', 'effect', eff, 'previous_owner', prev)), 'routing');
  -- 6. Downstream work goes through the jobs queue, run after this commits.
  if kind <> 'held' then
    perform enqueue_job(ws, 'router_alert', rid::text, jsonb_build_object('run', rid), 0, 5);
  end if;
  return jsonb_build_object('status', 'ok', 'id', rid, 'kind', kind, 'owner', case when kind = 'owner' then owner end, 'effect', eff, 'steps', steps,
                            'assignment_state', state, 'previous_owner', prev, 'counted', counted, 'advanced', advanced);
end;
$_$;

ALTER FUNCTION public.routing_commit(p jsonb) OWNER TO postgres;

-- function: routing_default_policy(uuid)
CREATE FUNCTION public.routing_default_policy(p_ws uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid;
  r routers%rowtype;
begin
  select id into pid from routing_policies where workspace_id = p_ws and is_default;
  if pid is null then
    select * into r from routers where workspace_id = p_ws;
    if r.workspace_id is null then return null; end if;
    insert into routing_policies (workspace_id, name, is_default, draft, draft_base, draft_revision, draft_by, draft_at, active_version, created_at)
    values (p_ws, 'Inbound', true, r.draft, r.draft_base, r.draft_revision, r.draft_by, r.draft_at, r.live_version, r.created_at)
    on conflict do nothing
    returning id into pid;
    if pid is null then select id into pid from routing_policies where workspace_id = p_ws and is_default; end if;
  end if;
  -- Versions published the old way (or before this ran) are copied as they are; the pointer follows the router's.
  insert into routing_policy_versions (policy_id, workspace_id, version, config, note, published_by, published_at)
  select pid, v.workspace_id, v.version, v.body, v.note, v.published_by, v.published_at
  from router_versions v where v.workspace_id = p_ws
    and not exists (select 1 from routing_policy_versions x where x.policy_id = pid and x.version = v.version);
  update routing_policies p set active_version = r2.live_version
  from routers r2 where p.id = pid and r2.workspace_id = p_ws and r2.live_version is not null and p.active_version is distinct from r2.live_version
    and r2.live_version > coalesce(p.active_version, 0);
  return pid;
end;
$$;

ALTER FUNCTION public.routing_default_policy(p_ws uuid) OWNER TO postgres;

-- function: routing_draft_drop(uuid, uuid)
CREATE FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rev int;
begin
  update routing_policies set draft = null, draft_base = null, draft_revision = draft_revision + 1, updated_at = now()
  where id = p_policy and workspace_id = p_ws returning draft_revision into rev;
  if rev is null then raise exception 'not_found'; end if;
  perform routing_mirror_draft(p_policy);
  return rev;
end;
$$;

ALTER FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) OWNER TO postgres;

-- function: routing_draft_save(uuid, uuid, jsonb, integer, uuid)
CREATE FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p routing_policies%rowtype;
begin
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_configuration: config'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if p.archived_at is not null then raise exception 'invalid_configuration: archived'; end if;
  if p_revision is not null and p.draft_revision <> p_revision then raise exception 'draft_conflict'; end if;
  update routing_policies set draft = p_config, draft_base = case when p.draft is null then p.active_version else coalesce(p.draft_base, p.active_version) end,
    draft_revision = p.draft_revision + 1, draft_by = p_user, draft_at = now(), updated_at = now()
  where id = p.id;
  perform routing_mirror_draft(p.id);
  return p.draft_revision + 1;
end;
$$;

ALTER FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) OWNER TO postgres;

-- function: routing_evidence_latest(uuid, uuid, text)
CREATE FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', e.id, 'fingerprint', e.fingerprint, 'at', e.created_at, 'by', e.by_user, 'result', e.result, 'source_id', e.source_id)
  from routing_test_evidence e
  where e.workspace_id = p_ws and e.policy_id = p_policy and e.fingerprint = p_fingerprint and e.tested = 'draft'
  order by e.created_at desc limit 1;
$$;

ALTER FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) OWNER TO postgres;

-- function: routing_evidence_save(uuid, uuid, text, integer, text, integer, uuid, jsonb, jsonb, uuid)
CREATE FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  e routing_test_evidence%rowtype;
begin
  if not exists (select 1 from routing_policies where id = p_policy and workspace_id = p_ws) then raise exception 'not_found'; end if;
  if p_source is not null and not exists (select 1 from routing_sources where id = p_source and workspace_id = p_ws) then raise exception 'not_found: source'; end if;
  insert into routing_test_evidence (workspace_id, policy_id, fingerprint, draft_revision, tested, version, source_id, dependencies, result, by_user)
  values (p_ws, p_policy, p_fingerprint, p_revision, p_tested, p_version, p_source, coalesce(p_deps, '{}'), coalesce(p_result, '{}'), p_user)
  returning * into e;
  return jsonb_build_object('id', e.id, 'fingerprint', e.fingerprint, 'at', e.created_at);
end;
$$;

ALTER FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) OWNER TO postgres;

-- function: routing_facts(uuid, uuid, text, uuid[], text[], text, text)
CREATE FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text DEFAULT NULL::text, p_email_class text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f jsonb;
  teams jsonb;
  users uuid[];
  c contacts%rowtype;
  dom text;
  n int;
begin
  select coalesce(jsonb_object_agg(tk.key, jsonb_build_object(
           'id', tm.id, 'name', tm.name, 'method', tm.method, 'strict', tm.strict, 'hoursOnly', tm.hours_only, 'next', tm.next_position,
           'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight, 'position', m.position) order by m.position)
                                from routing_team_members m where m.team_id = tm.id), '[]'))), '{}')
  into teams
  from routing_team_keys tk join routing_teams tm on tm.id = tk.team_id
  where tk.workspace_id = p_ws and tk.key = any(coalesce(p_queues, '{}')) and tm.archived_at is null;
  users := array(select distinct u from unnest(coalesce(p_users, '{}') || array(
             select (m->>'user')::uuid from jsonb_each(teams) t(k, v), jsonb_array_elements(v->'members') m)) u);
  f := router_facts_full(p_ws, p_contact, p_key, users, p_queues, p_email, p_email_class);
  if f is null or f ? 'existing' then return f; end if;
  f := jsonb_set(f, '{reps}', coalesce((select jsonb_object_agg(r.key, r.value || routing_quota_used(p_ws, r.key::uuid)) from jsonb_each(f->'reps') r), '{}'));
  select * into c from contacts where id = p_contact and workspace_id = p_ws;
  dom := f->>'domain';
  if c.company_id is not null and f->'company' is not null and f->'company' <> 'null'::jsonb then
    n := -1;
  elsif dom is null or coalesce(c.email_class, p_email_class, 'work') = 'free' then
    n := 0;
  else
    -- The email's own domain is one match; otherwise every parent domain that is a company is a possible match.
    select case when bool_or(domain = dom) then 1 else count(*) end into n
    from companies where workspace_id = p_ws and deleted_at is null and merged_into is null and (domain = dom or dom like '%.' || domain);
  end if;
  return f || jsonb_build_object('teams', teams, 'company_match', jsonb_build_object(
    'kind', case when n = -1 then 'linked' when n = 0 then 'none' when n = 1 then 'domain' else 'ambiguous' end, 'count', greatest(n, 1) * (n <> 0)::int));
end;
$$;

ALTER FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) OWNER TO postgres;

-- function: routing_followup(uuid, uuid, text)
CREATE FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  k text := 'routing:' || p_run::text || ':' || p_purpose;
  tid uuid;
begin
  if p_purpose not in ('schedule', 'abandoned') then raise exception 'routing_followup: unknown purpose'; end if;
  select * into r from router_runs where id = p_run and workspace_id = p_ws;
  if r.id is null or r.owner is null or r.contact_id is null then return null; end if;
  insert into tasks (workspace_id, object, record_id, title, due, assignee, dedupe_key)
  values (p_ws, 'contact', r.contact_id, case p_purpose when 'schedule' then 'Arrange a meeting time' else 'Follow up on the unfinished booking' end, current_date, r.owner, k)
  on conflict (workspace_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into tid;
  if tid is null then select id into tid from tasks where workspace_id = p_ws and dedupe_key = k; end if;
  return tid;
end;
$$;

ALTER FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) OWNER TO postgres;

-- function: routing_followups_done(uuid, uuid)
CREATE FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update tasks set done = true, done_at = now(), updated_at = now()
  where workspace_id = p_ws and dedupe_key in ('routing:' || p_run::text || ':schedule', 'routing:' || p_run::text || ':abandoned') and not done;
$$;

ALTER FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) OWNER TO postgres;

-- function: routing_form_made()
CREATE FUNCTION public.routing_form_made() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  sch jsonb := case when jsonb_typeof(new.draft) = 'object' then new.draft->'after'->'schedule' end;
  mt uuid;
begin
  mt := case when sch->>'tool' = 'claritia' and sch->>'meetingTypeId' ~ '^[0-9a-f-]{36}$' then (select t.id from meeting_types t where t.id = (sch->>'meetingTypeId')::uuid and t.workspace_id = new.workspace_id) end;
  insert into routing_sources (workspace_id, kind, form_id, policy_id, enabled, follows_default, outcome, meeting_type_id, completion, no_slots)
  values (new.workspace_id, 'form', new.id, (select p.id from routing_policies p where p.workspace_id = new.workspace_id and p.is_default), true, true,
          case when mt is not null then 'assign_and_calendar' else 'assign_only' end, mt,
          jsonb_strip_nulls(jsonb_build_object('from', 'form', 'auto', true, 'scheduler', case when sch->>'tool' is not null and sch->>'tool' <> 'claritia' then sch->>'tool' end)),
          jsonb_build_object('message', 'form', 'task', true, 'email_later', coalesce(sch->>'none', '') = 'later'))
  on conflict do nothing;
  return null;
end;
$_$;

ALTER FUNCTION public.routing_form_made() OWNER TO postgres;

-- function: routing_form_published()
CREATE FUNCTION public.routing_form_published() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  sch jsonb := case when jsonb_typeof(new.body) = 'object' then new.body->'after'->'schedule' end;
  mt uuid;
begin
  mt := case when sch->>'tool' = 'claritia' and sch->>'meetingTypeId' ~ '^[0-9a-f-]{36}$' then (select t.id from meeting_types t where t.id = (sch->>'meetingTypeId')::uuid and t.workspace_id = new.workspace_id) end;
  update routing_sources set
    outcome = case when mt is not null then 'assign_and_calendar' else 'assign_only' end, meeting_type_id = mt,
    completion = jsonb_strip_nulls(jsonb_build_object('from', 'form', 'auto', true, 'scheduler', case when sch->>'tool' is not null and sch->>'tool' <> 'claritia' then sch->>'tool' end)),
    no_slots = no_slots || jsonb_build_object('email_later', coalesce(sch->>'none', '') = 'later'),
    updated_at = now()
  where form_id = new.form_id and kind = 'form' and completion->>'auto' = 'true' and updated_by is null and draft is null and live_revision = 1 and follows_default;
  return null;
end;
$_$;

ALTER FUNCTION public.routing_form_published() OWNER TO postgres;

-- function: routing_handoff_run(uuid, text)
CREATE FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', r.id, 'owner', r.owner, 'effect', r.effect, 'meeting_id', r.meeting_id, 'booking_state', r.booking_state, 'assignment_state', r.assignment_state)
  from router_runs r where r.workspace_id = p_ws and r.key = p_key;
$$;

ALTER FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) OWNER TO postgres;

-- function: routing_handoff_stage(uuid, jsonb, integer, uuid)
CREATE FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s routing_sources%rowtype;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'invalid_configuration: draft'; end if;
  if nullif(p_draft->>'policy_id', '') is not null and not exists (select 1 from routing_policies where id = (p_draft->>'policy_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: policy';
  end if;
  if nullif(p_draft->>'meeting_type_id', '') is not null and not exists (select 1 from meeting_types where id = (p_draft->>'meeting_type_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: meeting type';
  end if;
  if coalesce(p_draft->>'outcome', 'assign_only') not in ('assign_only', 'assign_and_calendar') then raise exception 'invalid_configuration: outcome'; end if;
  if p_draft->>'outcome' = 'assign_and_calendar' and nullif(p_draft->>'meeting_type_id', '') is null then raise exception 'invalid_configuration: meeting type'; end if;
  insert into routing_sources (workspace_id, kind, follows_default) values (p_ws, 'handoff', false) on conflict do nothing;
  select * into s from routing_sources where workspace_id = p_ws and kind = 'handoff' for update;
  if p_revision is not null and s.draft_revision <> p_revision then raise exception 'draft_conflict: source'; end if;
  update routing_sources set draft = p_draft - 'mappings', draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'revision', s.draft_revision + 1, 'live_revision', s.live_revision, 'live_policy', s.policy_id);
end;
$$;

ALTER FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) OWNER TO postgres;

-- function: routing_handoff_status(uuid, uuid)
CREATE FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('booking_state', r.booking_state,
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'confirmed', m.events <> '{}'::jsonb,
                                          'failed', exists (select 1 from meeting_events e where e.meeting_id = m.id and e.kind = 'calendar_failed'))
                from meetings m where m.id = r.meeting_id and m.workspace_id = p_ws))
  from router_runs r where r.id = p_run and r.workspace_id = p_ws;
$$;

ALTER FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) OWNER TO postgres;

-- function: routing_held(uuid, text, integer)
CREATE FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer DEFAULT 200) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'held', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status = 'held' and c.deleted_at is null),
    'unassigned', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status = 'unassigned' and c.deleted_at is null),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name, 'email', x.email, 'updated_at', x.updated_at, 'run', x.run) order by x.updated_at desc)
      from (
        select c.id, c.first_name, c.last_name, c.email, c.updated_at,
          (select jsonb_build_object('id', r.id, 'kind', r.kind, 'steps', r.steps, 'created_at', r.created_at)
             from router_runs r where r.workspace_id = p_ws and r.contact_id = c.id order by r.created_at desc limit 1) run
        from contacts c
        where c.workspace_id = p_ws and c.route_status = p_mode and c.deleted_at is null
        order by c.updated_at desc
        limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x), '[]'::jsonb)
  )
  where is_member(p_ws) and p_mode in ('held', 'unassigned');
$$;

ALTER FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer) OWNER TO postgres;

-- function: routing_live(uuid, uuid)
CREATE FUNCTION public.routing_live(p_ws uuid, p_policy uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('policy_id', p.id, 'version', v.version, 'body', v.config,
                            'paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false))
  from routing_policies p join routing_policy_versions v on v.policy_id = p.id and v.version = p.active_version
  where p.id = p_policy and p.workspace_id = p_ws and p.archived_at is null;
$$;

ALTER FUNCTION public.routing_live(p_ws uuid, p_policy uuid) OWNER TO postgres;

-- function: routing_meeting_changed()
CREATE FUNCTION public.routing_meeting_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rid uuid;
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    update router_runs set booking_state = 'cancelled', booking_reason = null where meeting_id = new.id and coalesce(booking_state, '') <> 'cancelled';
  elsif new.status in ('booked', 'held', 'no_show') and routing_meeting_placed(new.events) and not routing_meeting_placed(old.events) then
    for rid in
      update router_runs set booking_state = 'confirmed', booking_reason = null
      where meeting_id = new.id and coalesce(booking_state, '') in ('pending_confirmation', 'awaiting_selection', 'failed', 'abandoned', 'unavailable')
      returning id
    loop
      perform routing_followups_done(new.workspace_id, rid);
    end loop;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.routing_meeting_changed() OWNER TO postgres;

-- function: routing_meeting_failed()
CREATE FUNCTION public.routing_meeting_failed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.kind <> 'calendar_failed' or coalesce(new.detail->>'action', 'create') <> 'create' then return null; end if;
  update router_runs set
    booking_state = case when new.detail->>'outcome' = 'failed' then 'failed' else 'pending_confirmation' end,
    booking_reason = case when new.detail->>'outcome' = 'failed' then 'provider_error' else 'outcome_unknown' end
  where meeting_id = new.meeting_id and booking_state = 'pending_confirmation';
  return null;
end;
$$;

ALTER FUNCTION public.routing_meeting_failed() OWNER TO postgres;

-- function: routing_meeting_made()
CREATE FUNCTION public.routing_meeting_made() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  rid uuid;
begin
  if new.submission_id is null then return null; end if;
  update router_runs set meeting_id = new.id, booking_reason = null, booking_active_at = now(),
    booking_state = case when routing_meeting_placed(new.events) then 'confirmed' else 'pending_confirmation' end
  where workspace_id = new.workspace_id and key = 'form:' || new.submission_id::text and meeting_id is null and coalesce(booking_state, '') not in ('confirmed', 'cancelled')
  returning id into rid;
  if rid is not null and routing_meeting_placed(new.events) then perform routing_followups_done(new.workspace_id, rid); end if;
  return null;
end;
$$;

ALTER FUNCTION public.routing_meeting_made() OWNER TO postgres;

-- function: routing_meeting_placed(jsonb)
CREATE FUNCTION public.routing_meeting_placed(p_events jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(jsonb_typeof(p_events) = 'object' and exists (select 1 from jsonb_each(p_events) e where jsonb_typeof(e.value) = 'object' and e.value ? 'event'), false);
$$;

ALTER FUNCTION public.routing_meeting_placed(p_events jsonb) OWNER TO postgres;

-- function: routing_member_state(uuid, uuid)
CREATE FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  with z as (select routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user)) as tz),
  r as (select * from router_reps where workspace_id = p_ws and user_id = p_user)
  select jsonb_build_object(
    'member', exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user),
    'paused', coalesce((select r.paused_until > now() from r), false),
    'out', exists (select 1 from busy_blocks b join calendar_accounts c on c.id = b.account_id
                   where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.ooo and b.start_at <= now() and b.end_at > now())
           or exists (select 1 from r, jsonb_array_elements(r.out_dates) d
                      where jsonb_typeof(d) = 'object' and d->>'from' ~ '^\d{4}-\d{2}-\d{2}$' and d->>'to' ~ '^\d{4}-\d{2}-\d{2}$'
                        and (now() at time zone z.tz)::date between (d->>'from')::date and (d->>'to')::date),
    'tz', z.tz,
    'cap_day', (select r.cap_day from r),
    'cap_week', (select r.cap_week from r)
  ) from z;
$_$;

ALTER FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: routing_mirror_draft(uuid)
CREATE FUNCTION public.routing_mirror_draft(p_policy uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update routers r set draft = p.draft, draft_base = p.draft_base, draft_revision = p.draft_revision, draft_by = p.draft_by, draft_at = p.draft_at, updated_at = now()
  from routing_policies p where p.id = p_policy and p.is_default and r.workspace_id = p.workspace_id;
$$;

ALTER FUNCTION public.routing_mirror_draft(p_policy uuid) OWNER TO postgres;

-- function: routing_past(uuid, uuid, text, uuid, uuid)
CREATE FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  cid uuid := p_contact;
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  sent boolean := false;
  upcoming boolean := false;
  last_booked timestamptz;
begin
  if cid is null and em is not null then
    select c.id into cid from contacts c where c.workspace_id = p_ws and c.email_clean = em and c.deleted_at is null limit 1;
  end if;
  if cid is not null and em is null then
    select c.email_clean into em from contacts c where c.id = cid and c.workspace_id = p_ws;
  end if;
  if cid is not null then
    select exists (
      select 1 from submissions s
      where s.workspace_id = p_ws and s.contact_id = cid and not s.spam and not s.test
        and (p_form is null or s.form_id = p_form) and (p_skip is null or s.id <> p_skip)
    ) into sent;
  end if;
  if cid is not null or em is not null then
    select
      coalesce(bool_or(m.status = 'booked' and m.start_at > now()), false),
      max(m.created_at) filter (where m.status in ('booked', 'held', 'no_show'))
    into upcoming, last_booked
    from meetings m
    where m.workspace_id = p_ws and ((cid is not null and m.contact_id = cid) or (em is not null and lower(m.guest_email) = em));
  end if;
  return jsonb_build_object(
    'sent_form', sent,
    'has_meeting', upcoming,
    'days_since_booked', case when last_booked is null then null else floor(extract(epoch from (now() - last_booked)) / 86400)::int end
  );
end $$;

ALTER FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) OWNER TO postgres;

-- function: routing_policy_archive(uuid, uuid, boolean, uuid)
CREATE FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p routing_policies%rowtype;
  live jsonb;
begin
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if not p_archive then
    update routing_policies set archived_at = null, updated_at = now() where id = p.id;
    return jsonb_build_object('archived', false);
  end if;
  if p.is_default then raise exception 'invalid_configuration: default'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(f.name, 'Internal handoff'))), '[]') into live
  from routing_sources s left join forms f on f.id = s.form_id
  where s.workspace_id = p_ws and s.policy_id = p.id and s.enabled;
  if jsonb_array_length(live) > 0 then
    return jsonb_build_object('archived', false, 'sources', live);
  end if;
  update routing_sources set draft = null, draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now()
  where workspace_id = p_ws and nullif(draft->>'policy_id', '')::uuid = p.id;
  update routing_policies set archived_at = now(), updated_at = now() where id = p.id;
  return jsonb_build_object('archived', true);
end;
$$;

ALTER FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) OWNER TO postgres;

-- function: routing_policy_create(uuid, text, jsonb, text, uuid)
CREATE FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pid uuid;
  n text := btrim(coalesce(p_name, ''));
begin
  if length(n) not between 1 and 80 then raise exception 'invalid_configuration: name'; end if;
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then raise exception 'invalid_configuration: config'; end if;
  if p_key is not null then
    select id into pid from routing_policies where workspace_id = p_ws and create_key = p_key;
    if pid is not null then return jsonb_build_object('id', pid, 'created', false); end if;
  end if;
  insert into routing_policies (workspace_id, name, draft, draft_revision, draft_by, draft_at, create_key, created_by)
  values (p_ws, n, p_config, 1, p_user, now(), p_key, p_user)
  on conflict (workspace_id, create_key) where create_key is not null do nothing
  returning id into pid;
  if pid is null then
    select id into pid from routing_policies where workspace_id = p_ws and create_key = p_key;
    return jsonb_build_object('id', pid, 'created', false);
  end if;
  return jsonb_build_object('id', pid, 'created', true);
end;
$$;

ALTER FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) OWNER TO postgres;

-- function: routing_policy_draft(uuid, uuid, jsonb, text, integer, uuid)
CREATE FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p routing_policies%rowtype;
  cfg jsonb := p_config;
  n text := nullif(btrim(coalesce(p_name, '')), '');
  rev int;
begin
  if n is not null and length(n) > 80 then raise exception 'invalid_configuration: name'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws;
  if p.id is null then raise exception 'not_found'; end if;
  if cfg is null then
    cfg := coalesce(p.draft, (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version));
    if cfg is null then raise exception 'invalid_configuration: config'; end if;
  end if;
  rev := routing_draft_save(p_ws, p_policy, cfg, p_revision, p_user);
  if n is not null then
    update routing_policies set draft_name = case when n = name then null else n end where id = p.id;
  end if;
  return rev;
end;
$$;

ALTER FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) OWNER TO postgres;

-- function: routing_policy_get(uuid, uuid)
CREATE FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'is_default', p.is_default, 'archived', p.archived_at is not null,
    'draft', p.draft, 'draft_revision', p.draft_revision, 'draft_base', p.draft_base,
    'active_version', p.active_version,
    'live', (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'form_id', s.form_id, 'name', coalesce(f.name, 'Internal handoff'),
                                                             'enabled', s.enabled, 'policy_id', coalesce(s.policy_id, case when p.is_default and s.follows_default then p.id end),
                                                             'follows_default', s.follows_default, 'outcome', s.outcome, 'meeting_type_id', s.meeting_type_id,
                                                             'live_revision', s.live_revision, 'draft', s.draft, 'draft_revision', s.draft_revision) order by f.name)
                         from routing_sources s left join forms f on f.id = s.form_id
                         where s.workspace_id = p.workspace_id
                           and (s.policy_id = p.id or nullif(s.draft->>'policy_id', '')::uuid = p.id or (p.is_default and s.follows_default))), '[]'))
  from routing_policies p where p.id = p_policy and p.workspace_id = p_ws;
$$;

ALTER FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) OWNER TO postgres;

-- function: routing_publish(uuid, uuid, jsonb, text, uuid, text, integer, boolean, jsonb)
CREATE FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text DEFAULT NULL::text, p_revision integer DEFAULT NULL::integer, p_clear_draft boolean DEFAULT true, p_sources jsonb DEFAULT '[]'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  p routing_policies%rowtype;
  v int;
  s jsonb;
  src routing_sources%rowtype;
  done jsonb := '[]';
begin
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_configuration: config'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if p.archived_at is not null then raise exception 'invalid_configuration: archived'; end if;
  if p_key is not null then
    select version into v from routing_policy_versions where policy_id = p.id and publish_key = p_key;
    if v is not null then return jsonb_build_object('version', v, 'repeat', true); end if;
  end if;
  if p_revision is not null and p.draft_revision <> p_revision then raise exception 'draft_conflict'; end if;
  select greatest(coalesce((select max(version) from routing_policy_versions where policy_id = p.id), 0),
                  case when p.is_default then coalesce((select max(version) from router_versions where workspace_id = p_ws), 0) else 0 end) + 1 into v;
  for s in select x from jsonb_array_elements(case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]' end) x loop
    select * into src from routing_sources where id = (s->>'id')::uuid and workspace_id = p_ws for update;
    if src.id is null then raise exception 'not_found: source'; end if;
    if src.draft is null or src.draft_revision <> (s->>'revision')::int then raise exception 'draft_conflict: source'; end if;
    if nullif(src.draft->>'policy_id', '')::uuid is distinct from p.id then raise exception 'invalid_configuration: source policy'; end if;
    update routing_sources set
      policy_id = p.id,
      enabled = coalesce((src.draft->>'enabled')::boolean, enabled),
      outcome = coalesce(src.draft->>'outcome', outcome),
      meeting_type_id = case when src.draft ? 'meeting_type_id' then nullif(src.draft->>'meeting_type_id', '')::uuid else meeting_type_id end,
      mappings = coalesce(src.draft->'mappings', mappings),
      completion = coalesce(src.draft->'completion', completion),
      no_slots = coalesce(src.draft->'no_slots', no_slots),
      when_off = case when src.draft->>'when_off' in ('none', 'review') then src.draft->>'when_off' else when_off end,
      live_revision = live_revision + 1, draft = null, follows_default = false, updated_by = p_user, updated_at = now()
    where id = src.id;
    done := done || jsonb_build_array(jsonb_build_object('id', src.id, 'revision', src.live_revision + 1));
  end loop;
  insert into routing_policy_versions (policy_id, workspace_id, version, config, note, published_by, publish_key, sources)
  values (p.id, p_ws, v, p_config, left(p_note, 300), p_user, p_key, done);
  update routing_policies set active_version = v, updated_at = now(),
    name = case when p_clear_draft and p.draft_name is not null then p.draft_name else name end,
    draft_name = case when p_clear_draft then null else draft_name end,
    draft = case when p_clear_draft then null else draft end, draft_base = case when p_clear_draft then null else draft_base end,
    draft_revision = draft_revision + case when p_clear_draft then 1 else 0 end
  where id = p.id;
  perform routing_sync_teams(p_ws, p_config);
  if p.is_default then
    insert into routers (workspace_id) values (p_ws) on conflict do nothing;
    insert into router_versions (workspace_id, version, body, note, published_by) values (p_ws, v, p_config, left(p_note, 300), p_user) on conflict do nothing;
    update routers set live_version = v, updated_at = now() where workspace_id = p_ws;
    perform routing_mirror_draft(p.id);
  end if;
  return jsonb_build_object('version', v, 'repeat', false, 'sources', done);
end;
$$;

ALTER FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb) OWNER TO postgres;

-- function: routing_publish_lookup(uuid, text)
CREATE FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('version', version, 'repeat', true) from routing_policy_versions where policy_id = p_policy and publish_key = p_key;
$$;

ALTER FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) OWNER TO postgres;

-- function: routing_quota_current(uuid, uuid)
CREATE FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) RETURNS public.routing_quota
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  q routing_quota%rowtype;
  tz text;
  d0 timestamptz;
  d1 timestamptz;
  prev timestamptz;
begin
  select * into q from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1;
  if q.workspace_id is not null then return q; end if;
  tz := routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user));
  d0 := date_trunc('day', now() at time zone tz) at time zone tz;
  d1 := (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz;
  select max(period_end) into prev from routing_quota where workspace_id = p_ws and user_id = p_user and period_end <= now();
  d0 := greatest(d0, coalesce(prev, d0));
  if d1 <= d0 then d1 := d0 + interval '1 day'; end if;
  insert into routing_quota (workspace_id, user_id, period_start, period_end, tz, n) values (p_ws, p_user, d0, d1, tz, 0) on conflict do nothing;
  select * into q from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1;
  return q;
end;
$$;

ALTER FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: routing_quota_used(uuid, uuid)
CREATE FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with cur as (select * from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1),
  z as (select coalesce((select tz from cur), routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user))) as tz)
  select jsonb_build_object(
    'today', coalesce((select n from cur), 0),
    'week', coalesce((select sum(q.n) from routing_quota q, z where q.workspace_id = p_ws and q.user_id = p_user
                       and q.period_start >= date_trunc('week', now() at time zone z.tz) at time zone z.tz and q.period_start <= now()), 0)
  );
$$;

ALTER FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) OWNER TO postgres;

-- function: routing_reps_screen(uuid, timestamp with time zone, timestamp with time zone)
CREATE FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'reps', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'paused_until', r.paused_until, 'out_dates', r.out_dates, 'backup', r.backup, 'cap_day', r.cap_day, 'cap_week', r.cap_week))
                      from router_reps r where r.workspace_id = p_ws), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(distinct a.user_id) from calendar_accounts a where a.workspace_id = p_ws and a.provider <> 'zoom' and a.status = 'ok'), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('user_id', h.user_id, 'weekly', h.weekly)) from availability h where h.workspace_id = p_ws), '[]'::jsonb),
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('owner', t.owner, 'today', t.today, 'week', t.week))
      from (
        select x.owner, count(*) filter (where x.created_at >= p_day) today, count(*) week
        from router_runs x
        where x.workspace_id = p_ws and x.kind = 'owner' and x.by in ('queue', 'fallback') and x.undone_at is null and x.created_at >= p_since and x.owner is not null
        group by x.owner
      ) t), '[]'::jsonb)
  )
  where is_member(p_ws);
$$;

ALTER FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) OWNER TO postgres;

-- function: routing_review_act(uuid, uuid, text, uuid, text, integer, text)
CREATE FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text DEFAULT NULL::text, p_revision integer DEFAULT NULL::integer, p_op text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v routing_reviews%rowtype;
  r router_runs%rowtype;
  nxt text;
  act jsonb;
begin
  if p_action not in ('approve', 'start', 'back', 'dismiss', 'reopen') then raise exception 'invalid_configuration: action'; end if;
  select * into v from routing_reviews where id = p_review and workspace_id = p_ws for update;
  if v.id is null then raise exception 'not_found: review'; end if;
  -- Starting again with the operation already running is the same request (a retry), whatever the revision.
  if p_action = 'start' and v.state = 'in_progress' then
    return jsonb_build_object('id', v.id, 'state', v.state, 'revision', v.revision, 'latest_action', v.latest_action, 'op', v.latest_action->>'op');
  end if;
  if p_revision is not null and v.revision <> p_revision then raise exception 'draft_conflict: review'; end if;
  nxt := case p_action
    when 'approve' then case when v.state = 'open' then 'approved_pending_execution' end
    when 'start' then case when v.state in ('open', 'approved_pending_execution') then 'in_progress' end
    when 'back' then case when v.state = 'in_progress' then 'approved_pending_execution' end
    when 'dismiss' then case when v.state in ('open', 'approved_pending_execution') then 'dismissed' end
    when 'reopen' then case when v.state = 'dismissed' then 'open' end
  end;
  if nxt is null then
    if (p_action = 'approve' and v.state = 'approved_pending_execution') or (p_action = 'dismiss' and v.state = 'dismissed') or (p_action = 'reopen' and v.state = 'open') then
      return jsonb_build_object('id', v.id, 'state', v.state, 'revision', v.revision, 'latest_action', v.latest_action, 'repeat', true);
    end if;
    raise exception 'invalid_configuration: % from %', p_action, v.state;
  end if;
  if p_action = 'dismiss' and length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'invalid_configuration: reason'; end if;
  if p_action = 'start' and (p_op is null or p_op !~ '^[A-Za-z0-9_-]{8,80}$') then raise exception 'invalid_configuration: op'; end if;
  act := jsonb_strip_nulls(jsonb_build_object('action', p_action, 'by', p_user, 'at', now(), 'reason', left(nullif(btrim(p_reason), ''), 300),
                                               'op', case when p_action = 'start' then p_op end));
  update routing_reviews set state = nxt, revision = revision + 1, latest_action = act, updated_at = now() where id = v.id;
  -- The contact's "needs review" mark follows the item: a dismissed item clears it (unless another item is open).
  select * into r from router_runs where id = v.run_id;
  if v.contact_id is not null then
    if nxt = 'dismissed' then
      update contacts set route_status = null
      where id = v.contact_id and workspace_id = p_ws and route_status in ('held', 'unassigned')
        and not exists (select 1 from routing_reviews o where o.contact_id = v.contact_id and o.id <> v.id and o.state not in ('resolved', 'dismissed'));
    elsif p_action = 'reopen' and r.kind in ('held', 'unassigned') then
      update contacts set route_status = r.kind where id = v.contact_id and workspace_id = p_ws and route_status is null and owner_user_id is null;
    end if;
  end if;
  insert into audit_log (workspace_id, actor, action, target, data)
  values (p_ws, p_user, 'routing.review.' || p_action, v.id::text, jsonb_strip_nulls(jsonb_build_object('run', v.run_id, 'from', v.state, 'to', nxt, 'reason', act->>'reason', 'op', act->>'op')));
  return jsonb_build_object('id', v.id, 'state', nxt, 'revision', v.revision + 1, 'latest_action', act, 'op', act->>'op');
end;
$_$;

ALTER FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text) OWNER TO postgres;

-- function: routing_reviewer_left()
CREATE FUNCTION public.routing_reviewer_left() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  admin uuid;
begin
  if not exists (select 1 from routing_reviews v where v.workspace_id = old.workspace_id and v.reviewer = old.user_id and v.state not in ('resolved', 'dismissed')) then return null; end if;
  select w.user_id into admin from workspace_members w where w.workspace_id = old.workspace_id and w.user_id <> old.user_id order by (w.role = 'owner') desc, w.created_at limit 1;
  if admin is null then return null; end if;
  update routing_reviews set reviewer = admin, revision = revision + 1, updated_at = now(),
    latest_action = jsonb_build_object('action', 'escalated', 'from', old.user_id, 'to', admin, 'at', now())
  where workspace_id = old.workspace_id and reviewer = old.user_id and state not in ('resolved', 'dismissed');
  return null;
end;
$$;

ALTER FUNCTION public.routing_reviewer_left() OWNER TO postgres;

-- function: routing_reviews_child()
CREATE FUNCTION public.routing_reviews_child() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  par uuid;
  rv uuid;
begin
  select parent_run_id into par from router_runs where id = new.run_id;
  if par is null then return new; end if;
  update routing_reviews set state = 'open', child_run_id = new.run_id, reason = new.reason, revision = revision + 1, updated_at = now(),
    latest_action = jsonb_build_object('action', 'child', 'run', new.run_id, 'result', 'review', 'at', now())
  where run_id = par and workspace_id = new.workspace_id and state not in ('resolved', 'dismissed')
  returning id into rv;
  if rv is not null then return null; end if;
  return new;
end;
$$;

ALTER FUNCTION public.routing_reviews_child() OWNER TO postgres;

-- function: routing_reviews_spam()
CREATE FUNCTION public.routing_reviews_spam() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.reason <> 'spam' or new.submission_id is null then return new; end if;
  if not exists (select 1 from submissions where id = new.submission_id and workspace_id = new.workspace_id and not test) then return new; end if;
  update submissions set spam = true, spam_reason = 'routing' where id = new.submission_id and workspace_id = new.workspace_id and not spam;
  new.state := 'dismissed';
  new.latest_action := jsonb_build_object('action', 'spam', 'at', now());
  -- The contact isn't waiting on anyone: clear its mark unless another item is open.
  if new.contact_id is not null then
    update contacts set route_status = null
    where id = new.contact_id and workspace_id = new.workspace_id and route_status = 'held'
      and not exists (select 1 from routing_reviews o where o.contact_id = new.contact_id and o.state not in ('resolved', 'dismissed'));
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.routing_reviews_spam() OWNER TO postgres;

-- function: routing_run_booking(uuid, text, text, text)
CREATE FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
begin
  select * into r from router_runs where workspace_id = p_ws and key = p_key for update;
  if r.id is null then return null; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state not in ('confirmed', 'cancelled') then return r.booking_state; end if;
  update router_runs set booking_state = p_state, booking_reason = p_reason where id = r.id;
  if p_state = 'confirmed' then perform routing_followups_done(p_ws, r.id); end if;
  return p_state;
end;
$$;

ALTER FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text) OWNER TO postgres;

-- function: routing_run_meeting(uuid, uuid, uuid, text, text)
CREATE FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text DEFAULT NULL::text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  st text := p_state;
begin
  if p_state not in ('awaiting_selection', 'pending_confirmation', 'confirmed', 'failed', 'unavailable') then raise exception 'routing_run_meeting: state'; end if;
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then return null; end if;
  if p_meeting is not null and not exists (select 1 from meetings m where m.id = p_meeting and m.workspace_id = p_ws) then raise exception 'not_found: meeting'; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state <> 'confirmed' then return r.booking_state; end if;
  if st = 'pending_confirmation' and exists (select 1 from meetings m where m.id = p_meeting and routing_meeting_placed(m.events)) then st := 'confirmed'; end if;
  update router_runs set booking_state = st, booking_reason = p_reason, meeting_id = coalesce(p_meeting, meeting_id) where id = r.id;
  if st = 'confirmed' then perform routing_followups_done(p_ws, r.id); end if;
  return st;
end;
$$;

ALTER FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text) OWNER TO postgres;

-- function: routing_runs_after()
CREATE FUNCTION public.routing_runs_after() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.parent_run_id is not null and new.kind = 'owner' then
    update routing_reviews set state = 'resolved', child_run_id = new.id, revision = revision + 1, updated_at = now(),
      latest_action = jsonb_build_object('action', 'resolved', 'run', new.id, 'owner', new.owner, 'by', new.by_user, 'at', now())
    where run_id = new.parent_run_id and workspace_id = new.workspace_id and state not in ('resolved', 'dismissed');
  end if;
  if new."by" = 'hand' then
    insert into audit_log (workspace_id, actor, action, target, data)
    values (new.workspace_id, new.by_user, 'routing.assign_by_hand', coalesce(new.contact_id::text, new.id::text), jsonb_strip_nulls(jsonb_build_object(
      'run', new.id, 'owner', new.owner, 'previous_owner', new.previous_owner, 'parent', new.parent_run_id,
      'reason', coalesce(new.trace->'manual'->>'reason', new.trace->'override'->>'reason'),
      'suggested', new.trace->'override'->>'suggested')));
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.routing_runs_after() OWNER TO postgres;

-- function: routing_runs_before()
CREATE FUNCTION public.routing_runs_before() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.kind = 'owner' and new.effect = 'new' and coalesce(new.sync_state, 'not_required') = 'not_required' and routing_sync_needed(new.workspace_id) then
    new.sync_state := 'pending';
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.routing_runs_before() OWNER TO postgres;

-- function: routing_screen_activity(uuid, text, timestamp with time zone, integer)
CREATE FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'runs', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object(
        'id', r.id, 'at', r.created_at, 'kind', r.kind, 'reason', r.reason, 'by', r.by, 'rule', r.rule_id, 'owner', r.owner, 'previous_owner', r.previous_owner,
        'policy_id', r.policy_id, 'policy', (select p.name from routing_policies p where p.id = r.policy_id), 'version', coalesce(r.policy_version, r.version),
        'source', case when r.source_id is null then null else (select coalesce(f.name, 'Internal handoff') from routing_sources s left join forms f on f.id = s.form_id where s.id = r.source_id) end,
        'assignment_state', r.assignment_state, 'booking_state', r.booking_state, 'booking_reason', r.booking_reason, 'sync_state', r.sync_state, 'effect', r.effect,
        'contact_id', r.contact_id, 'parent_run_id', r.parent_run_id, 'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
        'rule_name', coalesce(r.trace->'rules'->'matched'->>'name', (select s->'rule'->>'name' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'rules' limit 1)),
        'held', (select s->'signals' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'spam' and not coalesce((s->>'ok')::boolean, true) limit 1),
        'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer) from routing_reviews v where v.run_id = r.id)) x
      from router_runs r
      where r.workspace_id = p_ws and r.undone_at is null
        and (p_before is null or r.created_at < p_before)
        and case coalesce(p_filter, 'all')
              when 'review' then exists (select 1 from routing_reviews v where v.run_id = r.id and v.state not in ('resolved', 'dismissed'))
              when 'errors' then r.assignment_state = 'failed' or r.booking_state in ('unavailable', 'failed') or r.sync_state = 'failed'
                                 or (r.booking_state = 'pending_confirmation' and r.booking_reason = 'outcome_unknown')
              else true end
      order by r.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)) y), '[]'),
    'open_reviews', (select count(*) from routing_reviews v where v.workspace_id = p_ws and v.state not in ('resolved', 'dismissed')));
$$;

ALTER FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer) OWNER TO postgres;

-- function: routing_screen_policies(uuid)
CREATE FUNCTION public.routing_screen_policies(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'draft_name', p.draft_name, 'is_default', p.is_default, 'archived', p.archived_at is not null,
    'active_version', p.active_version, 'draft_revision', p.draft_revision, 'draft', p.draft,
    'live', (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version),
    'live_sources', (select count(*) from routing_sources s where s.workspace_id = p.workspace_id and s.enabled
                       and (s.policy_id = p.id or (p.is_default and s.follows_default))),
    'staged', (select count(*) from routing_sources s where s.workspace_id = p.workspace_id and s.draft is not null
                 and (nullif(s.draft->>'policy_id', '')::uuid = p.id or s.policy_id = p.id)),
    'last_run', (select max(r.created_at) from router_runs r where r.workspace_id = p.workspace_id and r.policy_id = p.id),
    'created_at', p.created_at) order by p.archived_at nulls first, p.is_default desc, p.created_at), '[]')
  from routing_policies p where p.workspace_id = p_ws;
$$;

ALTER FUNCTION public.routing_screen_policies(p_ws uuid) OWNER TO postgres;

-- function: routing_screen_run(uuid, uuid)
CREATE FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'id', r.id, 'at', r.created_at, 'key', r.key, 'kind', r.kind, 'reason', r.reason, 'by', r.by, 'by_user', r.by_user, 'rule', r.rule_id, 'owner', r.owner,
    'previous_owner', r.previous_owner, 'policy_id', r.policy_id, 'policy', (select p.name from routing_policies p where p.id = r.policy_id), 'version', coalesce(r.policy_version, r.version),
    'source_id', r.source_id, 'source_revision', r.source_revision,
    'source', case when r.source_id is null then null else (select coalesce(f.name, 'Internal handoff') from routing_sources s left join forms f on f.id = s.form_id where s.id = r.source_id) end,
    'source_kind', (select s.kind from routing_sources s where s.id = r.source_id),
    'assignment_state', r.assignment_state, 'booking_state', r.booking_state, 'booking_reason', r.booking_reason, 'sync_state', r.sync_state, 'effect', r.effect,
    'booking_active_at', r.booking_active_at,
    'trace', r.trace, 'steps', r.steps, 'contact_id', r.contact_id, 'parent_run_id', r.parent_run_id,
    'submission_id', case when r.key like 'form:%' then substr(r.key, 6) end,
    'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
    'current_owner', (select c.owner_user_id from contacts c where c.id = r.contact_id and c.workspace_id = p_ws),
    'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer, 'at', v.created_at, 'latest_action', v.latest_action,
                                         'child_run_id', v.child_run_id, 'revision', v.revision, 'updated_at', v.updated_at)
               from routing_reviews v where v.run_id = r.id),
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'at', ch.created_at, 'kind', ch.kind, 'owner', ch.owner, 'by', ch.by, 'version', ch.policy_version) order by ch.created_at)
                          from router_runs ch where ch.parent_run_id = r.id and ch.workspace_id = p_ws), '[]'),
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'end', m.end_at, 'hosts', m.hosts, 'status', m.status, 'confirmed', routing_meeting_placed(m.events),
                                          'reference', 'create:' || m.id::text,
                                          'failed', (select e.detail || jsonb_build_object('at', e.at) from meeting_events e where e.meeting_id = m.id and e.kind = 'calendar_failed' order by e.id desc limit 1))
                from meetings m where m.id = r.meeting_id and m.workspace_id = p_ws),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'done', t.done, 'assignee', t.assignee, 'at', t.created_at,
                                                          'purpose', split_part(t.dedupe_key, ':', 3)) order by t.created_at)
                       from tasks t where t.workspace_id = p_ws and t.dedupe_key in ('routing:' || r.id::text || ':schedule', 'routing:' || r.id::text || ':abandoned')), '[]'),
    'task', (select jsonb_build_object('id', t.id, 'title', t.title, 'done', t.done, 'assignee', t.assignee, 'at', t.created_at)
             from tasks t where t.workspace_id = p_ws and t.dedupe_key = 'routing:' || r.id::text || ':schedule'),
    'owner_calendar', case when r.owner is null then null else (
      select jsonb_build_object('provider', a.provider, 'status', a.status) from calendar_accounts a
      where a.workspace_id = p_ws and a.user_id = r.owner and a.provider <> 'zoom' order by (a.status = 'ok') desc, a.created_at limit 1) end,
    'sync', case when coalesce(r.sync_state, 'not_required') = 'not_required' then null else jsonb_build_object(
      'crms', (select count(*) from sources so where so.workspace_id = p_ws and so.status = 'active' and so.settings->'objects'->>'contacts' = 'both'),
      'error', (select l.error from sync_log l where l.workspace_id = p_ws and l.local_id = r.contact_id and l.direction = 'out' and l.object = 'contact' and l.action = 'error' and l.at >= r.created_at order by l.at desc limit 1)) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at) order by e.at)
                         from contact_events e where e.workspace_id = p_ws and e.contact_id = r.contact_id and e.kind in ('lead.booking_abandoned', 'lead.booking_resumed')
                           and e.data->>'run_id' = r.id::text and e.at >= r.created_at), '[]'))
  from router_runs r where r.id = p_run and r.workspace_id = p_ws;
$$;

ALTER FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) OWNER TO postgres;

-- function: routing_screen_sources(uuid)
CREATE FUNCTION public.routing_screen_sources(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'form_id', s.form_id, 'name', coalesce(f.name, 'Internal handoff'),
        'enabled', s.enabled, 'policy_id', coalesce(s.policy_id, case when s.follows_default then (select d.id from routing_policies d where d.workspace_id = p_ws and d.is_default) end),
        'follows_default', s.follows_default, 'outcome', s.outcome, 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'no_slots', s.no_slots, 'when_off', s.when_off,
        'auto', s.completion->>'auto' = 'true' and s.updated_by is null and s.draft is null and s.live_revision = 1 and s.follows_default,
        'live_revision', s.live_revision, 'draft', s.draft, 'draft_revision', s.draft_revision) order by s.kind desc, f.name)
      from routing_sources s left join forms f on f.id = s.form_id where s.workspace_id = p_ws), '[]'),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status,
        'fields', coalesce((select jsonb_agg(jsonb_build_object('id', x->>'id', 'key', x->>'key', 'type', x->>'type', 'label', x->>'label', 'options', x->'options'))
                            from form_versions v,
                                 jsonb_array_elements(case when jsonb_typeof(v.body->'steps') = 'array' then v.body->'steps' else '[]' end) st,
                                 jsonb_array_elements(case when jsonb_typeof(st->'fields') = 'array' then st->'fields' else '[]' end) x
                            where v.form_id = f.id and v.version = f.version), '[]')) order by f.name)
      from forms f where f.workspace_id = p_ws), '[]'),
    'meeting_types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', (t.settings->'lengths'->>0)::int) order by t.name)
      from meeting_types t where t.workspace_id = p_ws and t.active and t.template_id is null), '[]'));
$$;

ALTER FUNCTION public.routing_screen_sources(p_ws uuid) OWNER TO postgres;

-- function: routing_screen_teams(uuid)
CREATE FUNCTION public.routing_screen_teams(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'method', t.method, 'next', t.next_position, 'revision', t.revision,
        'keys', coalesce((select jsonb_agg(k.key order by k.key) from routing_team_keys k where k.team_id = t.id), '[]'),
        'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'position', m.position, 'weight', m.weight) order by m.position) from routing_team_members m where m.team_id = t.id), '[]'))
      order by t.created_at, t.name) from routing_teams t where t.workspace_id = p_ws and t.archived_at is null), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.user_id, 'role', w.role,
        'name', coalesce((select b.name from booking_profiles b where b.workspace_id = p_ws and b.user_id = w.user_id), (select u.email from auth.users u where u.id = w.user_id)),
        'email', (select u.email from auth.users u where u.id = w.user_id),
        'paused_until', r.paused_until, 'out_dates', coalesce(r.out_dates, '[]'), 'cap_day', r.cap_day, 'cap_week', r.cap_week, 'backup', r.backup,
        'tz', routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = w.user_id)),
        'today', coalesce((routing_quota_used(p_ws, w.user_id)->>'today')::int, 0),
        'calendar', (select a.provider from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status = 'ok' limit 1),
        'reconnect', exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status <> 'ok'),
        'out', (routing_member_state(p_ws, w.user_id)->>'out')::boolean)
      order by w.created_at) from workspace_members w left join router_reps r on r.workspace_id = w.workspace_id and r.user_id = w.user_id where w.workspace_id = p_ws), '[]'));
$$;

ALTER FUNCTION public.routing_screen_teams(p_ws uuid) OWNER TO postgres;

-- function: routing_screen_versions(uuid, uuid)
CREATE FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'note', v.note, 'by', v.published_by, 'at', v.published_at, 'sources', v.sources, 'config', v.config) order by v.version desc), '[]')
  from routing_policy_versions v where v.policy_id = p_policy and v.workspace_id = p_ws;
$$;

ALTER FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) OWNER TO postgres;

-- function: routing_source_resolve(uuid)
CREATE FUNCTION public.routing_source_resolve(p_form uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  f forms%rowtype;
  s routing_sources%rowtype;
  live jsonb;
begin
  select * into f from forms where id = p_form;
  if f.id is null then return null; end if;
  select * into s from routing_sources where form_id = p_form and kind = 'form';
  if s.id is null then
    live := router_live(f.workspace_id);
    return jsonb_build_object('source', null, 'live', live);
  end if;
  if s.follows_default then
    live := router_live(f.workspace_id);
  elsif s.enabled and s.policy_id is not null then
    select case when p.is_default then router_live(f.workspace_id) else routing_live(f.workspace_id, p.id) end into live
    from routing_policies p where p.id = s.policy_id and p.archived_at is null;
  end if;
  return jsonb_build_object(
    'source', jsonb_build_object('id', s.id, 'revision', s.live_revision, 'enabled', s.enabled, 'follows_default', s.follows_default, 'policy_id', s.policy_id, 'outcome', s.outcome,
                                 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'completion', s.completion, 'no_slots', s.no_slots, 'when_off', s.when_off),
    'live', live);
end;
$$;

ALTER FUNCTION public.routing_source_resolve(p_form uuid) OWNER TO postgres;

-- function: routing_source_stage(uuid, uuid, jsonb, integer, uuid)
CREATE FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s routing_sources%rowtype;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'invalid_configuration: draft'; end if;
  if not exists (select 1 from forms where id = p_form and workspace_id = p_ws) then raise exception 'not_found: form'; end if;
  if nullif(p_draft->>'policy_id', '') is not null and not exists (select 1 from routing_policies where id = (p_draft->>'policy_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: policy';
  end if;
  if nullif(p_draft->>'meeting_type_id', '') is not null and not exists (select 1 from meeting_types where id = (p_draft->>'meeting_type_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: meeting type';
  end if;
  if coalesce(p_draft->>'outcome', 'assign_only') not in ('assign_only', 'assign_and_calendar') then raise exception 'invalid_configuration: outcome'; end if;
  if p_draft->>'outcome' = 'assign_and_calendar' and coalesce((p_draft->>'enabled')::boolean, true) and nullif(p_draft->>'meeting_type_id', '') is null then
    raise exception 'invalid_configuration: meeting type';
  end if;
  if p_draft ? 'mappings' and jsonb_typeof(p_draft->'mappings') <> 'array' then raise exception 'invalid_configuration: mappings'; end if;
  insert into routing_sources (workspace_id, kind, form_id) values (p_ws, 'form', p_form) on conflict do nothing;
  select * into s from routing_sources where form_id = p_form and kind = 'form' for update;
  if p_revision is not null and s.draft_revision <> p_revision then raise exception 'draft_conflict: source'; end if;
  update routing_sources set draft = p_draft, draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'revision', s.draft_revision + 1, 'live_revision', s.live_revision, 'live_policy', s.policy_id);
end;
$$;

ALTER FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) OWNER TO postgres;

-- function: routing_sync_logged()
CREATE FUNCTION public.routing_sync_logged() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update router_runs r set sync_state = case when x.err then 'failed' else 'complete' end
  from (select n.workspace_id, n.local_id, bool_or(n.action = 'error') as err, max(n.at) as at
        from new_rows n where n.direction = 'out' and n.object = 'contact' and n.local_id is not null group by n.workspace_id, n.local_id) x
  where r.workspace_id = x.workspace_id and r.contact_id = x.local_id and r.sync_state in ('pending', 'failed') and r.created_at <= x.at;
  return null;
end;
$$;

ALTER FUNCTION public.routing_sync_logged() OWNER TO postgres;

-- function: routing_sync_needed(uuid)
CREATE FUNCTION public.routing_sync_needed(p_ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select false;
$$;

ALTER FUNCTION public.routing_sync_needed(p_ws uuid) OWNER TO postgres;

-- function: routing_sync_retry(uuid, uuid, uuid)
CREATE FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r router_runs%rowtype;
  s record;
  n int := 0;
begin
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then raise exception 'not_found: run'; end if;
  if r.kind <> 'owner' or r.contact_id is null or coalesce(r.sync_state, 'not_required') not in ('failed', 'pending') then
    return jsonb_build_object('state', r.sync_state, 'queued', 0);
  end if;
  for s in select so.id from sources so where so.workspace_id = p_ws and so.status = 'active' and so.settings->'objects'->>'contacts' = 'both' loop
    perform enqueue_job(p_ws, 'source_pull', s.id::text || ':route:' || r.id::text, jsonb_build_object('source_id', s.id, 'retry', jsonb_build_array(r.contact_id)), 0, 3);
    n := n + 1;
  end loop;
  update router_runs set sync_state = case when n > 0 then 'pending' else 'not_required' end where id = r.id;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, p_user, 'routing.sync_retry', r.id::text, jsonb_build_object('pushes', n));
  return jsonb_build_object('state', case when n > 0 then 'pending' else 'not_required' end, 'queued', n);
end;
$$;

ALTER FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) OWNER TO postgres;

-- function: routing_sync_teams(uuid, jsonb)
CREATE FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  q jsonb;
  twin jsonb;
  tid uuid;
  shared int;
  per_rule boolean;
  made int := 0;
  rule_stems text[];
begin
  if jsonb_typeof(p_body->'queues') is distinct from 'array' then return 0; end if;
  rule_stems := array(select left(regexp_replace('q_' || (r->>'id'), '[^a-zA-Z0-9_-]', '', 'g'), 36)
                      from jsonb_array_elements(case when jsonb_typeof(p_body->'rules'->'list') = 'array' then p_body->'rules'->'list' else '[]' end) r
                      where r->>'id' ~ '^[A-Za-z0-9_-]{1,40}$');
  -- Queues the last build made per rule go last, so the queue they were copied from has its team first.
  for q in
    select x from jsonb_array_elements(p_body->'queues') with ordinality t(x, i)
    where x->>'id' ~ '^[A-Za-z0-9_-]{1,40}$'
    order by (x->>'id' ~ '^q_default(_[0-9]+)?$' or regexp_replace(x->>'id', '_[0-9]+$', '') = any(rule_stems) or x->>'id' = any(rule_stems)), i
  loop
    per_rule := q->>'id' ~ '^q_default(_[0-9]+)?$' or q->>'id' = any(rule_stems) or regexp_replace(q->>'id', '_[0-9]+$', '') = any(rule_stems);
    select team_id into tid from routing_team_keys where workspace_id = p_ws and key = q->>'id';
    if tid is not null then
      select count(*) into shared from routing_team_keys where team_id = tid;
      if shared > 1 and coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight) order by m.position) from routing_team_members m where m.team_id = tid), '[]')
                        is distinct from (select coalesce(jsonb_agg(jsonb_build_object('user', x->>'user', 'weight', greatest(1, least(10, coalesce((x->>'weight')::int, 1))))), '[]') from jsonb_array_elements(coalesce(q->'members', '[]')) x) then
        -- Its members changed while the team is shared: this key gets its own team; the others keep theirs.
        delete from routing_team_keys where workspace_id = p_ws and key = q->>'id';
        tid := null;
      else
        update routing_teams set name = left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), method = coalesce(nullif(q->>'method', ''), 'rr'),
          strict = coalesce((q->>'strict')::boolean, false), hours_only = coalesce((q->>'hoursOnly')::boolean, false), updated_at = now()
        where id = tid and shared = 1
          and (name, method, strict, hours_only) is distinct from (left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), coalesce(nullif(q->>'method', ''), 'rr'), coalesce((q->>'strict')::boolean, false), coalesce((q->>'hoursOnly')::boolean, false));
        if shared = 1 then perform routing_team_set_members(p_ws, tid, q->'members'); end if;
        continue;
      end if;
    end if;
    if per_rule then
      select y into twin from jsonb_array_elements(p_body->'queues') y
      where y->>'id' <> q->>'id' and y->'members' = q->'members' and coalesce(y->>'method', 'rr') = coalesce(q->>'method', 'rr')
        and coalesce((y->>'strict')::boolean, false) = coalesce((q->>'strict')::boolean, false) and coalesce((y->>'hoursOnly')::boolean, false) = coalesce((q->>'hoursOnly')::boolean, false)
        and exists (select 1 from routing_team_keys k where k.workspace_id = p_ws and k.key = y->>'id')
      limit 1;
      if twin is not null then
        select team_id into tid from routing_team_keys where workspace_id = p_ws and key = twin->>'id';
        insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, q->>'id', tid) on conflict do nothing;
        continue;
      end if;
    end if;
    insert into routing_teams (workspace_id, name, method, strict, hours_only)
    values (p_ws, left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), coalesce(nullif(q->>'method', ''), 'rr'), coalesce((q->>'strict')::boolean, false), coalesce((q->>'hoursOnly')::boolean, false))
    returning id into tid;
    insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, q->>'id', tid);
    perform routing_team_set_members(p_ws, tid, q->'members');
    update routing_teams set revision = 1 where id = tid;
    perform routing_team_seed(p_ws, tid);
    made := made + 1;
  end loop;
  return made;
end;
$_$;

ALTER FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) OWNER TO postgres;

-- function: routing_team_list(uuid)
CREATE FUNCTION public.routing_team_list(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_object_agg(k.key, jsonb_build_object('id', t.id, 'name', t.name, 'method', t.method, 'strict', t.strict, 'hoursOnly', t.hours_only,
    'next', t.next_position, 'revision', t.revision,
    'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight, 'position', m.position) order by m.position)
                         from routing_team_members m where m.team_id = t.id), '[]'))), '{}')
  from routing_team_keys k join routing_teams t on t.id = k.team_id
  where k.workspace_id = p_ws and t.archived_at is null;
$$;

ALTER FUNCTION public.routing_team_list(p_ws uuid) OWNER TO postgres;

-- function: routing_team_save(uuid, uuid, text, text, jsonb, integer, text)
CREATE FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer DEFAULT NULL::integer, p_key text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  t routing_teams%rowtype;
  k text;
  n text := btrim(coalesce(p_name, ''));
  bad int;
begin
  if length(n) not between 1 and 80 then raise exception 'invalid_configuration: name'; end if;
  if coalesce(p_method, 'rr') not in ('rr', 'weighted', 'load') then raise exception 'invalid_configuration: method'; end if;
  if jsonb_typeof(coalesce(p_members, '[]')) <> 'array' then raise exception 'invalid_configuration: members'; end if;
  select count(*) into bad from jsonb_array_elements(coalesce(p_members, '[]')) x
  where not (x->>'user' ~ '^[0-9a-f-]{36}$') or not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id::text = x->>'user');
  if bad > 0 then raise exception 'invalid_configuration: member'; end if;
  if p_team is null then
    insert into routing_teams (workspace_id, name, method) values (p_ws, n, coalesce(p_method, 'rr')) returning * into t;
    k := coalesce(p_key, 't_' || replace(left(t.id::text, 13), '-', ''));
    insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, k, t.id);
    perform routing_team_set_members(p_ws, t.id, p_members);
    update routing_teams set revision = 1 where id = t.id returning * into t;
  else
    select * into t from routing_teams where id = p_team and workspace_id = p_ws for update;
    if t.id is null then raise exception 'not_found: team'; end if;
    if p_revision is not null and t.revision <> p_revision then raise exception 'draft_conflict: team'; end if;
    if (t.name, t.method) is distinct from (n, coalesce(p_method, 'rr')) then
      update routing_teams set name = n, method = coalesce(p_method, 'rr'), revision = revision + 1, updated_at = now() where id = t.id;
    end if;
    perform routing_team_set_members(p_ws, t.id, p_members);
    select * into t from routing_teams where id = t.id;
    select key into k from routing_team_keys where team_id = t.id order by key limit 1;
  end if;
  return jsonb_build_object('id', t.id, 'key', k, 'revision', t.revision, 'next', t.next_position);
end;
$_$;

ALTER FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text) OWNER TO postgres;

-- function: routing_team_seed(uuid, uuid)
CREATE FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  pos int;
begin
  select m.position into pos
  from routing_team_members m
  left join lateral (
    select count(*) n, max(r.created_at) last from router_runs r
    where r.workspace_id = p_ws and r.owner = m.user_id and r.kind = 'owner' and r.undone_at is null and r.created_at > now() - interval '30 days'
      and (r.team_id = p_team or r.queue_id in (select k.key from routing_team_keys k where k.team_id = p_team))
  ) h on true
  where m.team_id = p_team
  order by h.n, h.last nulls first, m.position
  limit 1;
  update routing_teams set next_position = coalesce(pos, 0) where id = p_team;
end;
$$;

ALTER FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) OWNER TO postgres;

-- function: routing_team_set_members(uuid, uuid, jsonb)
CREATE FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  changed boolean := false;
  m jsonb;
  v_user uuid;
  w int;
  n int;
begin
  with want as (select (x->>'user')::uuid as wu from jsonb_array_elements(coalesce(p_members, '[]')) x where x->>'user' ~ '^[0-9a-f-]{36}$'),
  gone as (delete from routing_team_members t where t.team_id = p_team and t.user_id not in (select wu from want) returning 1)
  select count(*) > 0 into changed from gone;
  for m in select x from jsonb_array_elements(coalesce(p_members, '[]')) x loop
    continue when not (m->>'user' ~ '^[0-9a-f-]{36}$');
    v_user := (m->>'user')::uuid;
    w := greatest(1, least(10, coalesce((m->>'weight')::int, 1)));
    update routing_team_members set weight = w where team_id = p_team and user_id = v_user and weight <> w;
    get diagnostics n = row_count;
    if n > 0 then changed := true; end if;
    if not exists (select 1 from routing_team_members where team_id = p_team and user_id = v_user) then
      insert into routing_team_members (team_id, workspace_id, user_id, position, weight)
      values (p_team, p_ws, v_user, coalesce((select max(position) + 1 from routing_team_members where team_id = p_team), 0), w);
      changed := true;
    end if;
  end loop;
  if changed then update routing_teams set revision = revision + 1, updated_at = now() where id = p_team; end if;
  return changed;
end;
$_$;

ALTER FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) OWNER TO postgres;

-- function: routing_versions_frozen()
CREATE FUNCTION public.routing_versions_frozen() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  raise exception 'Published routing versions are immutable';
end;
$$;

ALTER FUNCTION public.routing_versions_frozen() OWNER TO postgres;

-- function: routing_zone(text)
CREATE FUNCTION public.routing_zone(p_tz text) RETURNS text
    LANGUAGE plpgsql STABLE
    AS $$
begin
  if p_tz is null or p_tz = '' then return 'UTC'; end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

ALTER FUNCTION public.routing_zone(p_tz text) OWNER TO postgres;

-- function: rr_turns(uuid)
CREATE FUNCTION public.rr_turns(p_type uuid) RETURNS TABLE(user_id uuid, n integer, last timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select h, count(*)::int, max(m.created_at)
  from meetings m, unnest(m.hosts) h
  where m.type_id = p_type and m.rr and m.status in ('booked', 'held') and m.created_at > now() - interval '30 days'
  group by h;
$$;

ALTER FUNCTION public.rr_turns(p_type uuid) OWNER TO postgres;

-- function: runs_alert()
CREATE FUNCTION public.runs_alert() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  started_by text := new.trigger;
begin
  if new.status <> 'failed' or (new.verdict = 'flaky' and new.retry_of is null) or new.verdict = 'setup' then
    return null;
  end if;
  if new.trigger = 'retry' then
    select trigger into started_by from runs where id = new.retry_of;
  end if;
  if coalesce(started_by, 'manual') = 'manual' or not alerts_on(new.project_id, 'failure') then
    return null;
  end if;
  insert into alert_events (workspace_id, project_id, kind, run_id) values (new.workspace_id, new.project_id, 'failure', new.id);
  return null;
end;
$$;

ALTER FUNCTION public.runs_alert() OWNER TO postgres;

-- function: runs_github_sync()
CREATE FUNCTION public.runs_github_sync() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status in ('passed', 'failed', 'error', 'canceled')
     and exists (select 1 from github_checks where status = 'pending' and run_ids @> array[coalesce(new.retry_of, new.id)]) then
    perform github_sync();
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.runs_github_sync() OWNER TO postgres;

-- function: runs_wake()
CREATE FUNCTION public.runs_wake() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.status = 'queued' then
    perform wake_runner();
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.runs_wake() OWNER TO postgres;

-- function: save_alert_settings(uuid, text[], boolean, boolean, text, text, boolean)
CREATE FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text DEFAULT NULL::text, p_slack_hint text DEFAULT NULL::text, p_clear_slack boolean DEFAULT false) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  ws uuid;
  e text;
begin
  select workspace_id into ws from projects where id = p_project;
  if ws is null or not is_member(ws) then
    raise exception 'Project not found';
  end if;
  foreach e in array coalesce(p_emails, '{}') loop
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'Not an email address: %', e;
    end if;
  end loop;
  insert into alert_settings (project_id, workspace_id, slack_sealed, slack_hint, emails, on_failure, on_heal, updated_at)
  values (p_project, ws, p_slack_sealed, p_slack_hint, coalesce(p_emails, '{}'), p_on_failure, p_on_heal, now())
  on conflict (project_id) do update set
    slack_sealed = case when p_clear_slack then null else coalesce(excluded.slack_sealed, alert_settings.slack_sealed) end,
    slack_hint = case when p_clear_slack then null else coalesce(excluded.slack_hint, alert_settings.slack_hint) end,
    emails = excluded.emails,
    on_failure = excluded.on_failure,
    on_heal = excluded.on_heal,
    updated_at = now();
end;
$_$;

ALTER FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean) OWNER TO postgres;

-- function: save_written_lock(uuid, text)
CREATE FUNCTION public.save_written_lock(p_run uuid, p_lock text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r runs;
  v int;
begin
  select * into r from runs where id = p_run;
  if r.id is null or r.test_id is null or coalesce(p_lock, '') = '' or length(p_lock) > 200000 then
    return false;
  end if;
  update tests set lock = p_lock
  where id = r.test_id and version = r.test_version and coalesce(lock, '') = r.lock
  returning version into v;
  if v is null then
    return false;
  end if;
  update test_versions set author_email = 'Claritia' where test_id = r.test_id and version = v;
  update runs set lock_saved = true where id = p_run;
  return true;
end;
$$;

ALTER FUNCTION public.save_written_lock(p_run uuid, p_lock text) OWNER TO postgres;

-- function: schedule_delete(uuid, uuid, uuid)
CREATE FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from availability_schedules where id = p_id and workspace_id = p_ws and user_id = p_user;
$$;

ALTER FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) OWNER TO postgres;

-- function: schedule_next(text, integer, integer, integer, text, timestamp with time zone)
CREATE FUNCTION public.schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    SET search_path TO 'public'
    AS $$
declare
  local timestamp := p_from at time zone p_tz;
  cand timestamp;
  i int;
begin
  if p_every = 'hour' then
    cand := date_trunc('hour', local) + make_interval(mins => p_minute);
    if cand <= local then cand := cand + interval '1 hour'; end if;
    return cand at time zone p_tz;
  end if;
  for i in 0..8 loop
    cand := date_trunc('day', local) + make_interval(days => i, hours => p_hour, mins => p_minute);
    if cand > local
       and (p_every = 'day'
            or (p_every = 'weekday' and extract(dow from cand) between 1 and 5)
            or (p_every = 'week' and extract(dow from cand) = p_weekday)) then
      return cand at time zone p_tz;
    end if;
  end loop;
  return null;
end;
$$;

ALTER FUNCTION public.schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone) OWNER TO postgres;

-- function: schedule_save(uuid, uuid, uuid, text, text, jsonb, jsonb)
CREATE FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) OWNER TO postgres;

-- function: scheduler_for(uuid, text)
CREATE FUNCTION public.scheduler_for(p_submission uuid, p_tool text) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select l.url from submissions s join contacts c on c.id = s.contact_id
  join scheduler_links l on l.workspace_id = s.workspace_id and l.user_id = c.owner_user_id and l.tool = p_tool
  where s.id = p_submission and scheduler_link_ok(p_tool, l.url);
$$;

ALTER FUNCTION public.scheduler_for(p_submission uuid, p_tool text) OWNER TO postgres;

-- function: scheduler_link_ok(text, text)
CREATE FUNCTION public.scheduler_link_ok(p_tool text, p_url text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $_$
  with a as (select substring(coalesce(p_url, '') from '^https://([^/?#\s]*)') as auth),
  h as (select case when auth is null or auth = '' or position('@' in auth) > 0 then null
                    else lower(regexp_replace(auth, ':[0-9]*$', '')) end as host from a)
  select coalesce(case p_tool
    when 'calendly' then host ~ '^(www\.)?calendly\.com$'
    when 'calcom' then host ~ '^(app\.)?cal\.com$' or host ~ '\.cal\.com$'
    when 'hubspot_meetings' then host ~ '^meetings(-[a-z0-9]+)?\.hubspot\.com$'
    when 'savvycal' then host ~ '^savvycal\.com$'
    when 'link' then host <> ''
    else false end, false)
  from h;
$_$;

ALTER FUNCTION public.scheduler_link_ok(p_tool text, p_url text) OWNER TO postgres;

-- function: scheduler_link_save(uuid, uuid, text, text)
CREATE FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) or (p_user <> auth.uid() and not is_owner(p_ws)) then
    raise exception 'Only owners set other people''s links';
  end if;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Not in this workspace';
  end if;
  if coalesce(trim(p_url), '') = '' then
    delete from scheduler_links where workspace_id = p_ws and user_id = p_user and tool = p_tool;
    return;
  end if;
  if not scheduler_link_ok(p_tool, trim(p_url)) then
    raise exception 'That link doesn''t work for this scheduler';
  end if;
  insert into scheduler_links (workspace_id, user_id, tool, url) values (p_ws, p_user, p_tool, trim(p_url))
  on conflict (workspace_id, user_id, tool) do update set url = excluded.url, updated_at = now();
end;
$$;

ALTER FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) OWNER TO postgres;

-- function: schedules_prepare()
CREATE FUNCTION public.schedules_prepare() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  select workspace_id into new.workspace_id from projects where id = new.project_id;
  if new.workspace_id is null then
    raise exception 'Project not found';
  end if;
  if not exists (select 1 from environments where id = new.environment_id and project_id = new.project_id) then
    raise exception 'Pick an environment from this project';
  end if;
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone %', new.timezone;
  end if;
  if new.scope = 'use_case' and coalesce(new.use_case, '') = '' then
    raise exception 'Pick a use case';
  end if;
  if new.scope = 'tests' and coalesce(array_length(new.test_ids, 1), 0) = 0 then
    raise exception 'Pick at least one test';
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null then
    new.created_by := old.created_by;
    new.last_run_at := old.last_run_at;
    new.last_count := old.last_count;
    new.last_error := old.last_error;
  end if;
  new.next_run_at := case when new.enabled then schedule_next(new.every, new.at_hour, new.at_minute, new.weekday, new.timezone, now()) end;
  return new;
end;
$$;

ALTER FUNCTION public.schedules_prepare() OWNER TO postgres;

-- function: segment_members_event()
CREATE FUNCTION public.segment_members_event() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  g segments%rowtype;
begin
  select * into g from segments where id = new.segment_id;
  if g.kind <> 'static' then return new; end if;
  if tg_op = 'INSERT' and new.left_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.entered', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  elsif tg_op = 'UPDATE' and old.left_at is null and new.left_at is not null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.left', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  elsif tg_op = 'UPDATE' and old.left_at is not null and new.left_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.entered', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.segment_members_event() OWNER TO postgres;

-- function: segment_refresh(uuid)
CREATE FUNCTION public.segment_refresh(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  g segments%rowtype;
  w text;
  joined int;
  gone int;
begin
  select * into g from segments where id = p_id for update;
  if g.id is null or g.kind <> 'dynamic' then
    return null;
  end if;
  begin
    w := segment_where(g.workspace_id, g.rules);
  exception when others then
    update segments set error = left(sqlerrm, 500), refreshed_at = now() where id = p_id;
    return jsonb_build_object('error', sqlerrm);
  end;
  create temp table if not exists _seg (contact_id uuid primary key) on commit drop;
  truncate _seg;
  execute format('insert into _seg select c.id from contacts c left join companies co on co.id = c.company_id left join accounts a on a.id = co.account_id
                  where c.workspace_id = $1 and c.deleted_at is null and (%s)', w) using g.workspace_id, g.rules;

  with j as (
    insert into segment_members (workspace_id, segment_id, contact_id)
    select g.workspace_id, p_id, s.contact_id from _seg s
    on conflict (segment_id, contact_id) do update set left_at = null, entered_at = now()
    where segment_members.left_at is not null
    returning contact_id
  ), ev as (
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    select g.workspace_id, j.contact_id, 'segment.entered', jsonb_build_object('segment_id', p_id, 'name', g.name), 'segment' from j
    returning 1
  )
  select count(*) into joined from ev;

  with l as (
    update segment_members m set left_at = now()
    where m.segment_id = p_id and m.left_at is null and not exists (select 1 from _seg s where s.contact_id = m.contact_id)
    returning contact_id
  ), ev as (
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    select g.workspace_id, l.contact_id, 'segment.left', jsonb_build_object('segment_id', p_id, 'name', g.name), 'segment' from l
    returning 1
  )
  select count(*) into gone from ev;

  update segments set count = (select count(*) from _seg), refreshed_at = now(), error = null where id = p_id;
  truncate _seg;
  return jsonb_build_object('joined', joined, 'left', gone);
end;
$_$;

ALTER FUNCTION public.segment_refresh(p_id uuid) OWNER TO postgres;

-- function: segment_sql(uuid, jsonb, text[], integer)
CREATE FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  p text := format('($2#>%L)', p_path::text);
  kind text := coalesce(p_node->>'kind', case when p_node ? 'rules' then 'group' end);
  parts text[] := '{}';
  i int := 0;
  w text;
  v_oid uuid;
  n int;
begin
  if jsonb_typeof(p_node) <> 'object' then
    raise exception 'Rules are not valid';
  end if;
  if kind = 'group' then
    if p_depth > 3 then
      raise exception 'Groups go 3 levels deep';
    end if;
    if jsonb_typeof(p_node->'rules') <> 'array' or jsonb_array_length(p_node->'rules') > 30 then
      raise exception 'Rules are not valid';
    end if;
    if jsonb_array_length(p_node->'rules') = 0 then
      return 'true';
    end if;
    for i in 0..jsonb_array_length(p_node->'rules') - 1 loop
      parts := parts || ('(' || segment_sql(p_ws, p_node->'rules'->i, p_path || array['rules', i::text], p_depth + 1) || ')');
    end loop;
    return array_to_string(parts, case when p_node->>'op' = 'or' then ' or ' else ' and ' end);
  end if;

  if kind = 'field' then
    -- A contact or company field, the same filters the lists use. Their values move to this node's place.
    w := object_where(p_ws, 'contact', jsonb_build_array(p_node - 'kind'));
    return replace(w, '$2->0->', p || '->');
  end if;

  if kind = 'event' then
    if coalesce(p_node->>'event', '') !~ '^[a-z][a-z0-9_.]{1,60}$' then raise exception 'Pick an event'; end if;
    if coalesce(p_node->>'days', '') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number of days'; end if;
    if p_node->>'op' = 'none' then
      return format('not exists (select 1 from contact_events e where e.contact_id = c.id and e.kind = %1$s->>''event'' and e.at >= now() - make_interval(days => (%1$s->>''days'')::int))', p);
    end if;
    if coalesce(p_node->>'count', '1') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number'; end if;
    return format('(select count(*) from contact_events e where e.contact_id = c.id and e.kind = %1$s->>''event'' and e.at >= now() - make_interval(days => (%1$s->>''days'')::int)) >= greatest(coalesce((%1$s->>''count'')::int, 1), 1)', p);
  end if;

  if kind = 'visit' then
    -- Page views on the site by the contact's person; a path may end in * ("/blog/*").
    if coalesce(p_node->>'days', '') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number of days'; end if;
    if coalesce(p_node->>'count', '1') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number'; end if;
    w := format($q$(select count(*) from sessions s join events e on e.session_id = s.id and e.kind = 'view'
        and e.day >= (now() - make_interval(days => (%1$s->>'days')::int))::date
      where c.person_id is not null and s.workspace_id = c.workspace_id and s.person_id = c.person_id and not s.is_bot
        and s.started_at >= now() - make_interval(days => (%1$s->>'days')::int)
        and (coalesce(%1$s->>'path', '') = '' or e.path like replace(replace(replace(replace(%1$s->>'path', '\', '\\'), '%%', '\%%'), '_', '\_'), '*', '%%')))$q$, p);
    if p_node->>'op' = 'none' then
      return w || ' = 0';
    end if;
    return format('%s >= greatest(coalesce((%s->>''count'')::int, 1), 1)', w, p);
  end if;

  if kind = 'consent' then
    w := $q$(not exists (select 1 from suppressions su where su.workspace_id = c.workspace_id and su.email_clean = c.email_clean)
      and coalesce((select k.basis from consents k where k.contact_id = c.id and k.channel = 'email' order by k.at desc, k.id limit 1), 'none') <> 'none')$q$;
    return case p_node->>'state'
      when 'sendable' then w
      when 'not_sendable' then 'not ' || w
      when 'suppressed' then 'exists (select 1 from suppressions su where su.workspace_id = c.workspace_id and su.email_clean = c.email_clean)'
      else null end;
  end if;

  if kind = 'source' then
    if coalesce(p_node->>'source_id', '') !~ '^[0-9a-f-]{36}$' or not exists (select 1 from sources where id = (p_node->>'source_id')::uuid and workspace_id = p_ws) then
      raise exception 'Pick a source';
    end if;
    w := format('exists (select 1 from source_links l where l.local_id = c.id and l.object = ''contact'' and l.deleted_at is null and l.source_id = (%s->>''source_id'')::uuid)', p);
    return case when p_node->>'op' = 'not_in' then 'not ' || w else w end;
  end if;

  if kind = 'object' then
    -- A custom object record linked to the contact (either way round) that matches its own filters.
    select id into v_oid from objects where workspace_id = p_ws and key = p_node->>'object';
    if v_oid is null then raise exception 'Pick an object'; end if;
    w := object_where(p_ws, p_node->>'object', coalesce(p_node->'filters', '[]'));
    w := replace(w, '$2->', format('(%s->''filters'')->', p));
    w := format($q$exists (select 1 from records r where r.object_id = %L and r.deleted_at is null
      and exists (select 1 from record_links l where (l.from_id = r.id and l.to_id = c.id) or (l.from_id = c.id and l.to_id = r.id))
      and (%s))$q$, v_oid, w);
    return case when p_node->>'op' = 'has_not' then 'not ' || w else w end;
  end if;

  raise exception 'Unknown rule';
end;
$_$;

ALTER FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) OWNER TO postgres;

-- function: segment_where(uuid, jsonb)
CREATE FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w text;
begin
  if length(p_rules::text) > 50000 then
    raise exception 'Too many rules';
  end if;
  w := segment_sql(p_ws, coalesce(p_rules, '{"op":"and","rules":[]}'), '{}', 1);
  if w is null then
    raise exception 'Rules are not valid';
  end if;
  return w;
end;
$$;

ALTER FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) OWNER TO postgres;

-- function: segments_due()
CREATE FUNCTION public.segments_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s record;
  n int := 0;
begin
  for s in select id, workspace_id from segments where kind = 'dynamic' and (refreshed_at is null or refreshed_at < now() - interval '1 hour') order by refreshed_at nulls first limit 500 loop
    perform enqueue_job(s.workspace_id, 'segment_refresh', s.id::text, jsonb_build_object('segment_id', s.id), 0, 3);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.segments_due() OWNER TO postgres;

-- function: send_claim(uuid, integer)
CREATE FUNCTION public.send_claim(p_ws uuid, p_limit integer DEFAULT 14) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s send_settings;
  room int;
  m record;
  g jsonb;
  out jsonb := '[]';
  d sending_domains;
  tries int;
begin
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where workspace_id = p_ws and status = 'sending' and claimed_at < now() - interval '10 minutes';

  select * into s from send_settings where workspace_id = p_ws;
  if s.workspace_id is null or s.paused then return out; end if;
  room := s.per_day - (select count(*) from email_messages where workspace_id = p_ws and sent_at > now() - interval '1 day');
  if room <= 0 then return out; end if;

  for m in
    select x.id, x.to_email, x.contact_id, x.email_id, x.vars, x.from_name, x.reply_to, x.sender_user from email_messages x
    where x.workspace_id = p_ws and x.status = 'queued' and x.send_after <= now()
    order by x.send_after, x.id
    limit least(greatest(coalesce(p_limit, 14), 1), room, 200)
    for update skip locked
  loop
    g := email_guard(m.id);
    if g is null then
      update email_messages set status = 'sending', claimed_at = now(), attempts = attempts + 1 where id = m.id returning attempts into tries;
      select * into d from verified_domain_for(p_ws, coalesce((select from_email from emails where id = m.email_id), s.from_email));
      out := out || jsonb_build_array((
        select jsonb_build_object(
          'id', m.id, 'to', m.to_email, 'contact_id', m.contact_id, 'email_id', e.id, 'kind', e.kind, 'marketing', e.marketing,
          'subject', e.subject, 'preheader', e.preheader, 'html', e.html, 'text', e.text, 'links', to_jsonb(e.links),
          'from_name', coalesce(m.from_name, e.from_name, s.from_name), 'from_email', coalesce(e.from_email, s.from_email),
          'reply_to', coalesce(m.reply_to, s.reply_to), 'address', s.address, 'topic', (select name from topics where id = e.topic_id),
          'mail_from', d.mail_from, 'per_second', s.per_second, 'attempts', tries, 'vars', m.vars, 'sender_user', m.sender_user)
        from emails e where e.id = m.email_id));
    elsif g->>'reason' = 'quiet' then
      update email_messages set send_after = (g->>'retry_at')::timestamptz where id = m.id;
    else
      update email_messages set status = 'skipped', skip_reason = g->>'reason' where id = m.id;
    end if;
  end loop;
  return out;
end;
$$;

ALTER FUNCTION public.send_claim(p_ws uuid, p_limit integer) OWNER TO postgres;

-- function: send_done(uuid, text, text, text, integer)
CREATE FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text, p_delay_s integer DEFAULT 60) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m email_messages;
  delay int := least(greatest(coalesce(p_delay_s, 60), 1), 3600);
begin
  select * into m from email_messages where id = p_id for update;
  if m.id is null or m.status <> 'sending' then return; end if;
  if p_outcome = 'ok' then
    update email_messages set status = 'sent', sent_at = now(), provider_id = nullif(p_provider_id, ''), error = null where id = p_id;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.sent', jsonb_build_object('email_id', m.email_id, 'message_id', m.id), 'email');
    end if;
  elsif p_outcome = 'later' then
    update email_messages set status = 'queued', claimed_at = null, attempts = greatest(attempts - 1, 0), error = left(p_error, 500), send_after = now() + make_interval(secs => delay) where id = p_id;
  elsif p_outcome = 'wait' then
    update email_messages set status = 'queued', claimed_at = null, attempts = greatest(attempts - 1, 0), error = left(p_error, 500),
      send_after = now() + make_interval(secs => least(greatest(coalesce(p_delay_s, 3600), 60), 86400)) where id = p_id;
  elsif p_outcome = 'retry' and m.attempts < 3 then
    update email_messages set status = 'queued', claimed_at = null, error = left(p_error, 500), send_after = now() + make_interval(secs => greatest(60 * m.attempts, delay)) where id = p_id;
  elsif p_outcome = 'unknown' then
    update email_messages set status = 'unknown', error = left(coalesce(p_error, 'No clear answer from Resend'), 500) where id = p_id;
  else
    update email_messages set status = 'failed', error = left(coalesce(p_error, 'Failed'), 500) where id = p_id;
  end if;
end;
$$;

ALTER FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer) OWNER TO postgres;

-- function: send_done_many(jsonb)
CREATE FUNCTION public.send_done_many(p_rows jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r jsonb;
  n int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' then return 0; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    perform send_done((r->>'id')::uuid, r->>'outcome', nullif(r->>'provider_id', ''), r->>'error', coalesce((r->>'delay_s')::int, 60));
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.send_done_many(p_rows jsonb) OWNER TO postgres;

-- function: send_resume(uuid)
CREATE FUNCTION public.send_resume(p_ws uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can resume sending'; end if;
  update send_settings set paused = false, paused_reason = null, paused_at = null, updated_at = now() where workspace_id = p_ws and paused;
  if found then
    insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'sending.resume', p_ws::text);
    perform enqueue_job(p_ws, 'send', p_ws::text, '{}', 0, 3);
  end if;
end;
$$;

ALTER FUNCTION public.send_resume(p_ws uuid) OWNER TO postgres;

-- function: send_settings_of(uuid)
CREATE FUNCTION public.send_settings_of(p_ws uuid) RETURNS public.send_settings
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s send_settings;
begin
  select * into s from send_settings where workspace_id = p_ws;
  if not found then
    insert into send_settings (workspace_id) values (p_ws) on conflict do nothing;
    select * into s from send_settings where workspace_id = p_ws;
  end if;
  return s;
end;
$$;

ALTER FUNCTION public.send_settings_of(p_ws uuid) OWNER TO postgres;

-- function: send_settings_save(uuid, jsonb)
CREATE FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  tz text := coalesce(nullif(trim(p_values->>'timezone'), ''), 'UTC');
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can change sending'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'Send an object'; end if;
  if local_hour(now(), tz) is null then raise exception 'Unknown time zone: %', tz; end if;
  perform send_settings_of(p_ws);
  update send_settings set
    from_name = nullif(trim(p_values->>'from_name'), ''),
    from_email = nullif(lower(trim(p_values->>'from_email')), ''),
    reply_to = nullif(lower(trim(p_values->>'reply_to')), ''),
    address = nullif(trim(p_values->>'address'), ''),
    cap_count = coalesce((p_values->>'cap_count')::int, cap_count),
    cap_days = coalesce((p_values->>'cap_days')::int, cap_days),
    quiet_start = coalesce((p_values->>'quiet_start')::int, quiet_start),
    quiet_end = coalesce((p_values->>'quiet_end')::int, quiet_end),
    timezone = tz,
    updated_at = now()
  where workspace_id = p_ws;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, auth.uid(), 'sending.settings', p_ws::text, p_values);
end;
$$;

ALTER FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) OWNER TO postgres;

-- function: sending_domain_add(uuid, text)
CREATE FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) RETURNS public.sending_domains
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  d text := lower(trim(both '.' from trim(coalesce(p_domain, ''))));
  made sending_domains;
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can add a sending domain'; end if;
  if d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or length(d) > 240 then raise exception 'Not a domain: %', p_domain; end if;
  if (select count(*) from sending_domains where workspace_id = p_ws) >= 20 then raise exception 'Up to 20 sending domains'; end if;
  if exists (select 1 from sending_domains where domain = d) then raise exception 'That domain is already added to a workspace'; end if;
  insert into sending_domains (workspace_id, domain, mail_from, tracking_host, created_by)
  values (p_ws, d, 'send.' || d, 't.' || d, auth.uid())
  returning * into made;
  perform send_settings_of(p_ws);
  perform enqueue_job(p_ws, 'domain_check', made.id::text, jsonb_build_object('domain_id', made.id), 0, 5);
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'sending.domain_add', d);
  return made;
end;
$_$;

ALTER FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) OWNER TO postgres;

-- function: sending_domain_check_now(uuid)
CREATE FUNCTION public.sending_domain_check_now(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from sending_domains where id = p_id;
  if ws is null or not is_member(ws) then raise exception 'Domain not found'; end if;
  perform enqueue_job(ws, 'domain_check', p_id::text, jsonb_build_object('domain_id', p_id), 0, 5);
end;
$$;

ALTER FUNCTION public.sending_domain_check_now(p_id uuid) OWNER TO postgres;

-- function: sending_domain_load(uuid)
CREATE FUNCTION public.sending_domain_load(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select to_jsonb(d) from sending_domains d where d.id = p_id;
$$;

ALTER FUNCTION public.sending_domain_load(p_id uuid) OWNER TO postgres;

-- function: sending_domain_remove(uuid)
CREATE FUNCTION public.sending_domain_remove(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  d sending_domains;
begin
  select * into d from sending_domains where id = p_id;
  if d.id is null or not is_owner(d.workspace_id) then raise exception 'Domain not found'; end if;
  delete from sending_domains where id = p_id;
  perform enqueue_job(d.workspace_id, 'domain_remove', d.domain, jsonb_strip_nulls(jsonb_build_object('domain', d.domain, 'provider_id', d.provider_id)), 0, 5);
  insert into audit_log (workspace_id, actor, action, target) values (d.workspace_id, auth.uid(), 'sending.domain_remove', d.domain);
end;
$$;

ALTER FUNCTION public.sending_domain_remove(p_id uuid) OWNER TO postgres;

-- function: sending_domain_update(uuid, text, jsonb, text, text)
CREATE FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_status not in ('pending', 'verified', 'failed') then raise exception 'Bad status'; end if;
  update sending_domains set
    provider_id = coalesce(p_provider_id, provider_id),
    records = coalesce(p_records, records),
    status = p_status,
    error = left(p_error, 500),
    checked_at = now(),
    verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else null end
  where id = p_id;
end;
$$;

ALTER FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text) OWNER TO postgres;

-- function: sends_due()
CREATE FUNCTION public.sends_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct x.workspace_id from email_messages x
    join send_settings s on s.workspace_id = x.workspace_id and not s.paused
    where x.status = 'queued' and x.send_after <= now()
    limit 500
  loop
    perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3);
    n := n + 1;
  end loop;
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where status = 'sending' and claimed_at < now() - interval '10 minutes';
  return n;
end;
$$;

ALTER FUNCTION public.sends_due() OWNER TO postgres;

-- function: set_secret(uuid, text, text)
CREATE FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  sid uuid;
begin
  select workspace_id into ws from environments where id = p_env;
  if ws is null or not is_member(ws) then
    raise exception 'Environment not found';
  end if;
  if p_sealed is null or p_sealed !~ '^v1:' then
    raise exception 'Secret must be sealed by the server';
  end if;
  insert into env_secrets (environment_id, workspace_id, name)
  values (p_env, ws, p_name)
  on conflict (environment_id, name) do update set updated_at = now()
  returning id into sid;
  insert into env_secret_values (secret_id, sealed) values (sid, p_sealed)
  on conflict (secret_id) do update set sealed = excluded.sealed;
  return sid;
end;
$$;

ALTER FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) OWNER TO postgres;

-- function: site_daily_roll(uuid, date)
CREATE FUNCTION public.site_daily_roll(p_ws uuid, p_day date) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  tz text := ws_tz(p_ws);
  n int;
begin
  delete from site_daily where workspace_id = p_ws and day = p_day;
  insert into site_daily (site_id, workspace_id, day, path, source, medium, campaign, ref_class, country, device_type, visitors, sessions, views, engaged_s, bounces)
  select s.site_id, p_ws, p_day, coalesce(left(s.landing_path, 300), ''), coalesce(s.source, ''), coalesce(s.medium, ''), coalesce(s.campaign, ''), coalesce(s.ref_class, ''),
    coalesce(s.country, ''), coalesce(s.device_type, ''),
    count(distinct coalesce(s.device_id::text, encode(s.cookieless_key, 'hex'))), count(*), sum(s.pageviews), sum(s.engaged_s), count(*) filter (where s.pageviews <= 1)
  from sessions s
  where s.workspace_id = p_ws and not s.is_bot and not s.internal
    and s.started_at >= (p_day::timestamp at time zone tz) and s.started_at < ((p_day + 1)::timestamp at time zone tz)
  group by 1, 4, 5, 6, 7, 8, 9, 10;
  get diagnostics n = row_count;
  insert into site_rolled (workspace_id, day) values (p_ws, p_day) on conflict (workspace_id, day) do update set at = now();
  return n;
end;
$$;

ALTER FUNCTION public.site_daily_roll(p_ws uuid, p_day date) OWNER TO postgres;

-- function: site_health(uuid)
CREATE FUNCTION public.site_health(p_ws uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.created_at) from (
      select st.id, st.domain, st.extra_domains, st.site_key, st.proxy_secret, st.install_mode, st.last_event_at, st.paused, st.created_at,
             coalesce(h.sessions_24h, 0) as sessions_24h, coalesce(h.identified_24h, 0) as identified_24h, coalesce(h.with_account_24h, 0) as with_account_24h
      from sites st
      left join lateral (
        select count(*) as sessions_24h, count(*) filter (where s.person_id is not null) as identified_24h, count(*) filter (where s.account_id is not null) as with_account_24h
        from sessions s where s.site_id = st.id and s.started_at > now() - interval '24 hours' and not s.is_bot
      ) h on true
      where st.workspace_id = p_ws
    ) v
  ), '[]'::jsonb);
end;
$$;

ALTER FUNCTION public.site_health(p_ws uuid) OWNER TO postgres;

-- function: slack_book_info(uuid, uuid, text)
CREATE FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  with c as (
    select * from contacts where workspace_id = p_ws and deleted_at is null and lower(email) = lower(trim(p_email)) order by created_at limit 1
  ), h as (
    select coalesce((select owner_user_id from c where exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = c.owner_user_id)), p_user) as u
  )
  select jsonb_build_object(
    'contact', (select jsonb_build_object('id', c.id, 'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), 'email', c.email) from c),
    'host', meeting_people(p_ws, array[(select u from h)])->0,
    'workspace', (select jsonb_build_object('id', w.id, 'slug', booking_slug_ensure(w.id)) from workspaces w where w.id = p_ws),
    'types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'slug', t.slug) order by t.name)
                       from meeting_types t
                       where t.workspace_id = p_ws and t.active
                         and (t.owner_user_id = (select u from h) or exists (select 1 from jsonb_array_elements(t.hosts) x where x->>'user_id' = (select u from h)::text))), '[]'));
$$;

ALTER FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) OWNER TO postgres;

-- function: slack_caller(text, text)
CREATE FUNCTION public.slack_caller(p_team text, p_email text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('workspace_id', s.workspace_id, 'sealed', s.sealed,
    'user_id', (select m.user_id from workspace_members m join auth.users u on u.id = m.user_id
                where m.workspace_id = s.workspace_id and lower(u.email) = lower(trim(p_email)) limit 1))
  from slack_installs s where s.team_id = p_team;
$$;

ALTER FUNCTION public.slack_caller(p_team text, p_email text) OWNER TO postgres;

-- function: slack_install_save(uuid, uuid, text, text, text, text)
CREATE FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  delete from slack_installs where team_id = p_team and workspace_id <> p_ws;
  insert into slack_installs (workspace_id, team_id, team_name, bot_user_id, sealed, installed_by)
  values (p_ws, p_team, left(p_team_name, 200), p_bot, p_sealed, p_user)
  on conflict (workspace_id) do update set team_id = excluded.team_id, team_name = excluded.team_name, bot_user_id = excluded.bot_user_id,
    sealed = excluded.sealed, installed_by = excluded.installed_by, created_at = now();
end;
$$;

ALTER FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) OWNER TO postgres;

-- function: slack_install_token(text)
CREATE FUNCTION public.slack_install_token(p_team text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('workspace_id', s.workspace_id, 'sealed', s.sealed) from slack_installs s where s.team_id = p_team;
$$;

ALTER FUNCTION public.slack_install_token(p_team text) OWNER TO postgres;

-- function: source_class(text)
CREATE FUNCTION public.source_class(p_kind text) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  select coalesce((select class from source_kinds where kind = p_kind), 'import');
$$;

ALTER FUNCTION public.source_class(p_kind text) OWNER TO postgres;

-- function: source_columns_save(uuid, text, jsonb)
CREATE FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update sources set columns = jsonb_set(columns, array[p_object],
    (select coalesce(jsonb_object_agg(k, v), '{}') from (select k, v from jsonb_each(coalesce(columns->p_object, '{}') || p_cols) e(k, v) limit 300) x))
  where id = p_id;
$$;

ALTER FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) OWNER TO postgres;

-- function: source_connect(uuid, uuid, text, text, text, text, jsonb, text)
CREATE FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb DEFAULT '{}'::jsonb, p_hook_sealed text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  sid uuid;
  old_account text;
  existed boolean;
begin
  select true, account into existed, old_account from sources where workspace_id = p_ws and kind = p_kind;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user and role = 'owner') then
    raise exception 'Only owners can connect tools';
  end if;
  if not source_settings_ok(coalesce(p_settings, '{}')) then
    raise exception 'Bad settings';
  end if;
  insert into sources (workspace_id, kind, name, account, settings, created_by, status, next_run_at)
  values (p_ws, p_kind, left(p_name, 120), left(p_account, 200), coalesce(p_settings, '{}'), p_user, 'active', now())
  on conflict (workspace_id, kind) do update set
    name = excluded.name,
    -- Another account on the other side starts over: old links point at the old account.
    cursors = case when sources.account is distinct from excluded.account then '{}' else sources.cursors end,
    push_cursor = case when sources.account is distinct from excluded.account then null else sources.push_cursor end,
    account = excluded.account,
    settings = sources.settings || excluded.settings,
    status = 'active', last_error = null, errors_in_row = 0, next_run_at = now()
  returning id into sid;
  if existed and old_account is distinct from p_account then
    delete from source_links where source_id = sid;
  end if;
  insert into source_secrets (source_id, sealed, hook_sealed) values (sid, p_sealed, p_hook_sealed)
  on conflict (source_id) do update set sealed = excluded.sealed, hook_sealed = coalesce(excluded.hook_sealed, source_secrets.hook_sealed), updated_at = now();
  perform enqueue_job(p_ws, 'source_pull', sid::text, jsonb_build_object('source_id', sid), 0, 5);
  return sid;
end;
$$;

ALTER FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text) OWNER TO postgres;

-- function: source_cursor_save(uuid, text, jsonb)
CREATE FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update sources set cursors = case when p_cursor is null then cursors - p_object else jsonb_set(cursors, array[p_object], p_cursor) end where id = p_id;
$$;

ALTER FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) OWNER TO postgres;

-- function: source_disconnect(uuid)
CREATE FUNCTION public.source_disconnect(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
begin
  select * into s from sources where id = p_id;
  if s.id is null or not is_owner(s.workspace_id) then
    raise exception 'Only owners can change sources';
  end if;
  delete from source_secrets where source_id = p_id;
  delete from source_links where source_id = p_id;
  delete from hook_events where source_id = p_id;
  update sources set status = 'disconnected', cursors = '{}', push_cursor = null where id = p_id;
end;
$$;

ALTER FUNCTION public.source_disconnect(p_id uuid) OWNER TO postgres;

-- function: source_links_delete(uuid, text, text[])
CREATE FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  n int;
begin
  select * into s from sources where id = p_source;
  with gone as (
    update source_links set deleted_at = now(), updated_at = now()
    where source_id = p_source and object = p_object and external_id = any(p_external) and deleted_at is null
    returning local_id
  )
  update contacts c set deleted_at = now()
  from gone where p_object = 'contact' and coalesce((s.settings->>'follow_deletes')::boolean, false) and c.id = gone.local_id
    and not exists (select 1 from source_links o where o.local_id = c.id and o.source_id <> p_source and o.deleted_at is null)
    and not exists (select 1 from field_history h where h.record_id = c.id and source_class(h.source) = 'manual');
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) OWNER TO postgres;

-- function: source_links_get(uuid, text, text[])
CREATE FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_object_agg(l.external_id, jsonb_build_object('local_id', l.local_id, 'values', l.last_values, 'deleted', l.deleted_at is not null,
    'email_clean', (select c.email_clean from contacts c where c.id = l.local_id and p_object = 'contact' and c.deleted_at is null))), '{}')
  from source_links l where l.source_id = p_source and l.object = p_object and l.external_id = any(p_external);
$$;

ALTER FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) OWNER TO postgres;

-- function: source_links_put(uuid, text, jsonb)
CREATE FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid := (select workspace_id from sources where id = p_source);
begin
  -- Another external record that held this local id lets go of it (a merge on the other side).
  update source_links l set deleted_at = now(), updated_at = now()
  from jsonb_to_recordset(p_rows) r(external_id text, local_id uuid)
  where l.source_id = p_source and l.object = p_object and l.local_id = r.local_id and l.external_id <> r.external_id and l.deleted_at is null;
  insert into source_links (workspace_id, source_id, object, external_id, local_id, last_values)
  select distinct on (r.external_id) ws, p_source, p_object, r.external_id, r.local_id, r.values
  from jsonb_to_recordset(p_rows) r(external_id text, local_id uuid, values jsonb)
  where r.external_id is not null and r.local_id is not null
  on conflict (source_id, object, external_id) do update set local_id = excluded.local_id, last_values = excluded.last_values, deleted_at = null, updated_at = now();
end;
$$;

ALTER FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) OWNER TO postgres;

-- function: source_list_sync(uuid, text, text, text[], boolean)
CREATE FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s sources%rowtype;
  seg uuid;
begin
  select * into s from sources where id = p_source;
  insert into segments (workspace_id, name, kind, source_id, external_id)
  values (s.workspace_id, left(coalesce(nullif(trim(p_name), ''), 'List'), 120), 'static', p_source, p_external)
  on conflict (source_id, external_id) where source_id is not null do update set name = excluded.name
  returning id into seg;
  insert into segment_members (workspace_id, segment_id, contact_id)
  select s.workspace_id, seg, c.id from contacts c where c.workspace_id = s.workspace_id and c.deleted_at is null and c.email_clean = any(p_emails)
  on conflict (segment_id, contact_id) do update set left_at = null;
  if p_replace then
    update segment_members m set left_at = now()
    where m.segment_id = seg and m.left_at is null
      and not exists (select 1 from contacts c where c.id = m.contact_id and c.email_clean = any(p_emails));
  end if;
  update segments set count = (select count(*) from segment_members where segment_id = seg and left_at is null), refreshed_at = now() where id = seg;
  return seg;
end;
$$;

ALTER FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) OWNER TO postgres;

-- function: source_load(uuid)
CREATE FUNCTION public.source_load(p_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('source', to_jsonb(s), 'sealed', k.sealed, 'hook_sealed', k.hook_sealed,
    'mappings', coalesce((select jsonb_agg(jsonb_build_object('object', m.object, 'col', m.col, 'target', m.target, 'value_map', m.value_map, 'wins', m.wins) order by m.object, m.position)
                          from mappings m where m.source_id = s.id), '[]'))
  from sources s left join source_secrets k on k.source_id = s.id where s.id = p_id;
$$;

ALTER FUNCTION public.source_load(p_id uuid) OWNER TO postgres;

-- function: source_push_cursor_save(uuid, text)
CREATE FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update sources set push_cursor = p_cursor where id = p_id;
$$;

ALTER FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) OWNER TO postgres;

-- function: source_ran(uuid, text)
CREATE FUNCTION public.source_ran(p_id uuid, p_error text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update sources set
    last_run_at = now(),
    last_error = left(p_error, 1000),
    errors_in_row = case when p_error is null then 0 else errors_in_row + 1 end,
    status = case when status in ('paused', 'disconnected') then status when p_error is null then 'active' when errors_in_row + 1 >= 5 then 'error' else status end,
    next_run_at = now() + make_interval(mins => coalesce((settings->>'every_min')::int, 60))
  where id = p_id;
end;
$$;

ALTER FUNCTION public.source_ran(p_id uuid, p_error text) OWNER TO postgres;

-- function: source_run_log(uuid, text, text, timestamp with time zone, jsonb, text)
CREATE FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into source_runs (workspace_id, source_id, object, direction, started_at, finished_at, pulled, written, skipped, errors, error)
  select s.workspace_id, s.id, p_object, p_direction, p_started, now(), coalesce((p_counts->>'pulled')::int, 0), coalesce((p_counts->>'written')::int, 0),
         coalesce((p_counts->>'skipped')::int, 0), coalesce((p_counts->>'errors')::int, 0), left(p_error, 1000)
  from sources s where s.id = p_id;
$$;

ALTER FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) OWNER TO postgres;

-- function: source_secret_save(uuid, text)
CREATE FUNCTION public.source_secret_save(p_id uuid, p_sealed text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update source_secrets set sealed = p_sealed, updated_at = now() where source_id = p_id;
$$;

ALTER FUNCTION public.source_secret_save(p_id uuid, p_sealed text) OWNER TO postgres;

-- function: source_settings_ok(jsonb)
CREATE FUNCTION public.source_settings_ok(p jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_typeof(p) = 'object'
    and coalesce(p->'objects'->>'contacts', 'in') in ('both', 'in', 'off')
    and coalesce(p->'objects'->>'companies', 'in') in ('both', 'in', 'off')
    and coalesce(p->'objects'->>'opportunities', 'in') in ('in', 'off')
    and coalesce(p->'objects'->>'lists', 'in') in ('in', 'off')
    and coalesce(p->'objects'->>'suppressions', 'in') in ('in', 'off')
    and coalesce(p->>'push_new', 'lifecycle') in ('all', 'lifecycle', 'none')
    and coalesce(p->>'basis', 'none') in ('opt_in', 'soft_opt_in', 'legitimate_interest', 'none')
    and coalesce(jsonb_typeof(p->'activity'), 'boolean') = 'boolean'
    and coalesce((p->>'every_min')::int, 60) between 2 and 1440;
$$;

ALTER FUNCTION public.source_settings_ok(p jsonb) OWNER TO postgres;

-- function: sources_due()
CREATE FUNCTION public.sources_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s record;
  n int := 0;
begin
  for s in select id, workspace_id from sources where status = 'active' and next_run_at <= now() order by next_run_at limit 500 loop
    perform enqueue_job(s.workspace_id, 'source_pull', s.id::text, jsonb_build_object('source_id', s.id), 0, 5);
    update sources set next_run_at = now() + make_interval(mins => coalesce((settings->>'every_min')::int, 60)) where id = s.id;
    n := n + 1;
  end loop;
  for s in
    select so.id, so.workspace_id from sources so
    where so.status = 'active' and (so.settings->'objects'->>'contacts') = 'both'
      and exists (select 1 from contacts c where c.workspace_id = so.workspace_id and c.deleted_at is null
                  and (so.push_cursor is null or c.updated_at > split_part(so.push_cursor, '|', 1)::timestamptz))
    limit 500
  loop
    perform enqueue_job(s.workspace_id, 'crm_push', s.id::text, jsonb_build_object('source_id', s.id), 0, 5);
    n := n + 1;
  end loop;
  for s in
    select so.id, so.workspace_id from sources so
    where so.status = 'active' and so.kind in ('hubspot', 'salesforce') and coalesce((so.settings->>'activity')::boolean, true)
      and (so.activity_at is null or so.activity_at < now() - interval '1 hour'
           or exists (select 1 from contact_events e where e.workspace_id = so.workspace_id and e.kind = any(activity_kinds())
                      and e.at > so.activity_at - interval '1 minute'))
    limit 500
  loop
    perform enqueue_job(s.workspace_id, 'crm_activity', s.id::text, jsonb_build_object('source_id', s.id), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.sources_due() OWNER TO postgres;

-- function: start_run(uuid, uuid, text)
CREATE FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text DEFAULT 'manual'::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  t tests;
  e environments;
  u record;
  busy int;
begin
  select * into t from tests where id = p_test;
  if t.id is null or not is_member(t.workspace_id) then
    raise exception 'Test not found';
  end if;
  select * into e from environments where id = p_env and project_id = t.project_id;
  if e.id is null then
    raise exception 'Environment not found';
  end if;
  if p_trigger not in ('manual', 'api', 'mcp') then
    raise exception 'Unknown trigger';
  end if;
  if jsonb_array_length(coalesce(t.steps, '[]')) = 0 then
    raise exception 'Add a step to this test first';
  end if;
  select * into u from workspace_usage(t.workspace_id);
  if u.minutes_limit is not null and u.minutes_used >= u.minutes_limit then
    raise exception 'This month''s % cloud minutes are used up. Upgrade in Settings to keep running tests.', u.minutes_limit;
  end if;
  select count(*) into busy from runs where workspace_id = t.workspace_id and status in ('queued', 'running') and trigger in ('manual', 'api', 'mcp');
  if busy >= 5 then
    raise exception 'Five runs are already waiting or running in this workspace. Try again when one finishes.';
  end if;
  return queue_run(t, e, p_trigger, auth.uid());
end;
$$;

ALTER FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text) OWNER TO postgres;

-- function: submission_accept(uuid, jsonb, jsonb)
CREATE FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  s submissions%rowtype;
  f forms%rowtype;
  cid uuid;
  up jsonb;
  d record;
  topic uuid;
begin
  select * into s from submissions where id = p_sid;
  select * into f from forms where id = s.form_id;
  if s.id is null or f.id is null or p_contact is null then
    return null;
  end if;
  up := form_contact_write(f.workspace_id, p_contact);
  cid := (up->'ids'->>0)::uuid;
  update submissions set contact_id = cid where id = p_sid;

  if cid is not null and coalesce((p_consent->>'given')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'opt_in', 'granted', 'form', left(p_consent->>'wording', 2000));
    topic := (select (v.body->'consent'->>'topicId')::uuid from form_versions v
              where v.form_id = s.form_id and v.version = s.form_version and v.body->'consent'->>'topicId' ~ '^[0-9a-f-]{36}$');
    if topic is not null and exists (select 1 from topics where id = topic and workspace_id = f.workspace_id) then
      insert into subscriptions (workspace_id, contact_id, topic_id, status) values (f.workspace_id, cid, topic, 'subscribed')
      on conflict (contact_id, topic_id) do update set status = 'subscribed', at = now();
    end if;
  elsif cid is not null and coalesce((p_consent->>'notice')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'legitimate_interest', 'granted', 'form', left(p_consent->>'wording', 2000));
  end if;
  if cid is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (f.workspace_id, cid, 'form.submitted',
            jsonb_strip_nulls(jsonb_build_object('form_id', s.form_id, 'form_name', f.name, 'submission_id', p_sid, 'answers', s."values",
              'utm', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(s.hidden)
                      where key ~ '^(first_)?(utm_(source|medium|campaign|term|content)|gclid|fbclid|li_fat_id|msclkid)$'),
              'page', s.hidden->>'page', 'referrer', s.hidden->>'referrer', 'test', case when s.test then true end)), 'form');
  end if;

  for d in select id, paused from form_destinations where form_id = s.form_id order by position, created_at loop
    insert into deliveries (workspace_id, submission_id, destination_id, status)
    values (f.workspace_id, p_sid, d.id, case when d.paused then 'held' else 'queued' end)
    on conflict (submission_id, destination_id) do nothing;
  end loop;
  for d in select x.id from deliveries x where x.submission_id = p_sid and x.status = 'queued' loop
    perform enqueue_job(f.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
  end loop;
  return cid;
end;
$_$;

ALTER FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) OWNER TO postgres;

-- function: submission_not_booked(uuid)
CREATE FUNCTION public.submission_not_booked(p_submission uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s submissions%rowtype;
begin
  update submissions x set not_booked_at = now()
  where x.id = p_submission and x.booking_shown_at is not null and x.not_booked_at is null
    and not exists (select 1 from meetings m where m.submission_id = x.id and m.status in ('booked', 'held', 'no_show', 'pending_payment'))
  returning * into s;
  if s.id is null then return false; end if;
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.not_booked', jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', s.booking_type_id), 'form');
  end if;
  return true;
end;
$$;

ALTER FUNCTION public.submission_not_booked(p_submission uuid) OWNER TO postgres;

-- function: submission_payment(uuid, jsonb)
CREATE FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update submissions set payment = coalesce(payment, '{}'::jsonb) || p_patch where id = p_sid returning payment;
$$;

ALTER FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) OWNER TO postgres;

-- function: submission_release(uuid, jsonb, jsonb)
CREATE FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s submissions%rowtype;
begin
  select * into s from submissions where id = p_sid for update;
  if s.id is null or not s.spam or s.test then
    return null;
  end if;
  -- Spam first: the first-touch trigger skips spam, and it fires when the contact is set below.
  update submissions set spam = false, spam_reason = null, consent = coalesce(p_consent, '{}') where id = p_sid;
  if s.contact_id is not null then
    return s.contact_id;
  end if;
  return submission_accept(p_sid, p_contact, p_consent);
end;
$$;

ALTER FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) OWNER TO postgres;

-- function: submission_result_get(uuid)
CREATE FUNCTION public.submission_result_get(p_sid uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('outcome_id', r.outcome_id, 'outcome_title', r.outcome_title, 'values', r."values", 'form_version', r.form_version)
  from submission_results r where r.submission_id = p_sid;
$$;

ALTER FUNCTION public.submission_result_get(p_sid uuid) OWNER TO postgres;

-- function: submission_result_save(uuid, integer, text, text, jsonb, jsonb)
CREATE FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  s record;
  n int;
begin
  select workspace_id, form_id, form_version into s from submissions where id = p_sid;
  if not found then raise exception 'Submission not found'; end if;
  insert into submission_results (submission_id, workspace_id, form_id, form_version, engine, outcome_id, outcome_title, "values", constants)
  values (p_sid, s.workspace_id, s.form_id, s.form_version, coalesce(p_engine, 1), p_outcome_id, left(p_outcome_title, 300),
    coalesce(p_values, '{}'), coalesce(p_constants, '{}'))
  on conflict (submission_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

ALTER FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) OWNER TO postgres;

-- function: submissions_count()
CREATE FUNCTION public.submissions_count() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
  cap int;
begin
  if NEW.test or NEW.spam then return null; end if;
  if TG_OP = 'UPDATE' and not OLD.spam then return null; end if;
  insert into plan_usage as u (workspace_id, month, submissions) values (NEW.workspace_id, plan_month(), 1)
  on conflict (workspace_id, month) do update set submissions = u.submissions + 1
  returning u.submissions into n;
  if workspace_plan(NEW.workspace_id) = 'free' then
    cap := (plan_caps('free')).submissions;
    if n > cap then
      update submissions set over_cap = true where id = NEW.id;
    end if;
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.submissions_count() OWNER TO postgres;

-- function: submissions_delete(uuid[])
CREATE FUNCTION public.submissions_delete(p_ids uuid[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  delete from submissions where id = any(p_ids) and is_member(workspace_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.submissions_delete(p_ids uuid[]) OWNER TO postgres;

-- function: submissions_first_touch()
CREATE FUNCTION public.submissions_first_touch() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.contact_id is null or new.test or new.spam then return new; end if;
  update contacts set first_touch = touch_from_fill(new.hidden, new.form_id, new.created_at) where id = new.contact_id and first_touch is null;
  return new;
end;
$$;

ALTER FUNCTION public.submissions_first_touch() OWNER TO postgres;

-- function: submissions_mark_spam(uuid[], boolean)
CREATE FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  if p_spam then
    update submissions set spam = true, spam_reason = 'marked' where id = any(p_ids) and not spam and is_member(workspace_id);
  else
    update submissions set spam = false, spam_reason = null where id = any(p_ids) and spam and contact_id is not null and is_member(workspace_id);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) OWNER TO postgres;

-- function: submissions_webhooks()
CREATE FUNCTION public.submissions_webhooks() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.submissions_webhooks() OWNER TO postgres;

-- function: suppress(uuid, text, jsonb, uuid)
CREATE FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 10000 then
    raise exception 'Send up to 10,000 at a time';
  end if;
  insert into suppressions (workspace_id, email_clean, reason, source, import_id)
  select distinct on (lower(r.email_clean)) p_ws, lower(r.email_clean), r.reason, p_source, p_import
  from jsonb_to_recordset(p_rows) as r(email_clean text, reason text)
  where coalesce(r.email_clean, '') <> '' and r.reason in ('unsubscribed', 'bounced', 'complained', 'cleaned', 'manual')
  order by lower(r.email_clean), array_position(array['complained', 'unsubscribed', 'manual', 'bounced', 'cleaned'], r.reason)
  on conflict (workspace_id, email_clean) do update set
    reason = case when array_position(array['complained', 'unsubscribed', 'manual', 'bounced', 'cleaned'], excluded.reason)
                       < array_position(array['complained', 'unsubscribed', 'manual', 'bounced', 'cleaned'], suppressions.reason)
                  then excluded.reason else suppressions.reason end,
    at = least(suppressions.at, excluded.at);
  get diagnostics n = row_count;
  return n;
end;
$$;

ALTER FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) OWNER TO postgres;

-- function: sync_log_add(uuid, jsonb)
CREATE FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into sync_log (workspace_id, source_id, direction, object, local_id, external_id, action, fields, error)
  select s.workspace_id, s.id, r.direction, r.object, r.local_id, left(r.external_id, 200), r.action, coalesce(r.fields, '{}'), left(r.error, 1000)
  from sources s, jsonb_to_recordset(p_rows) r(direction text, object text, local_id uuid, external_id text, action text, fields text[], error text)
  where s.id = p_source;
$$;

ALTER FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) OWNER TO postgres;

-- function: sync_retry(bigint[])
CREATE FUNCTION public.sync_retry(p_ids bigint[]) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int := 0;
  r record;
begin
  for r in
    select l.source_id, l.workspace_id, array_agg(distinct l.local_id) filter (where l.local_id is not null) ids
    from sync_log l where l.id = any(p_ids) and l.action = 'error' and l.retried_at is null and is_member(l.workspace_id)
    group by l.source_id, l.workspace_id
  loop
    perform enqueue_job(r.workspace_id, 'source_pull', r.source_id::text || ':retry', jsonb_build_object('source_id', r.source_id, 'retry', to_jsonb(r.ids)), 0, 3);
    n := n + coalesce(cardinality(r.ids), 0);
  end loop;
  update sync_log set retried_at = now() where id = any(p_ids) and action = 'error' and is_member(workspace_id);
  return n;
end;
$$;

ALTER FUNCTION public.sync_retry(p_ids bigint[]) OWNER TO postgres;

-- function: team(uuid)
CREATE FUNCTION public.team(p_ws uuid) RETURNS TABLE(user_id uuid, email text, role text, joined_at timestamp with time zone, pending boolean, invite_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select m.user_id, u.email::text, m.role, m.created_at, false, null::uuid
  from workspace_members m join auth.users u on u.id = m.user_id
  where m.workspace_id = p_ws and is_member(p_ws)
  union all
  select null, i.email, 'member', i.created_at, true, i.id
  from invites i
  where i.workspace_id = p_ws and i.accepted_at is null and i.expires_at > now() and is_member(p_ws)
  order by 5, 4;
$$;

ALTER FUNCTION public.team(p_ws uuid) OWNER TO postgres;

-- function: test_bump()
CREATE FUNCTION public.test_bump() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  new.updated_at := now();
  if new.name is distinct from old.name or new.steps is distinct from old.steps or new.lock is distinct from old.lock
     or new.use_case is distinct from old.use_case or new.priority is distinct from old.priority then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end;
$$;

ALTER FUNCTION public.test_bump() OWNER TO postgres;

-- function: test_save_version()
CREATE FUNCTION public.test_save_version() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if tg_op = 'UPDATE' and new.version = old.version then
    return new;
  end if;
  insert into test_versions (test_id, workspace_id, version, name, use_case, priority, steps, lock, author_id, author_email)
  values (new.id, new.workspace_id, new.version, new.name, new.use_case, new.priority, new.steps, new.lock, auth.uid(), auth.jwt() ->> 'email')
  on conflict (test_id, version) do nothing;
  return new;
end;
$$;

ALTER FUNCTION public.test_save_version() OWNER TO postgres;

-- function: text_consent_add(uuid, uuid, text, text, text, text)
CREATE FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  cid uuid := p_contact;
begin
  if cid is null and coalesce(p_email, '') <> '' then
    select id into cid from contacts where workspace_id = p_ws and email_clean = lower(trim(p_email)) and deleted_at is null order by created_at limit 1;
  end if;
  if cid is null or not exists (select 1 from contacts where id = cid and workspace_id = p_ws) then return null; end if;
  if p_phone ~ '^\+[1-9][0-9]{6,14}$' then
    update contacts set phone = p_phone where id = cid and coalesce(phone, '') !~ '^\+[1-9][0-9]{6,14}$';
  end if;
  insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
  values (p_ws, cid, 'sms', 'opt_in', 'granted', left(coalesce(p_source, 'form'), 60), left(p_wording, 2000));
  return cid;
end;
$_$;

ALTER FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) OWNER TO postgres;

-- function: text_done(uuid, text, text, text, text)
CREATE FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update text_messages set status = p_status, sid = coalesce(p_sid, sid), from_number = coalesce(p_from, from_number), error = left(p_error, 500),
    sent_at = case when p_status in ('sent', 'emailed') then now() else sent_at end, updated_at = now()
  where id = p_id;
$$;

ALTER FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) OWNER TO postgres;

-- function: text_optout(text, text, boolean)
CREATE FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
begin
  if p_phone !~ '^\+[1-9][0-9]{6,14}$' then return; end if;
  if p_stop then
    insert into text_optouts (sender, phone) values (left(p_sender, 64), p_phone) on conflict (sender, phone) do update set at = now();
  else
    delete from text_optouts where sender = p_sender and phone = p_phone;
  end if;
end;
$_$;

ALTER FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) OWNER TO postgres;

-- function: text_source_for(text)
CREATE FUNCTION public.text_source_for(p_account text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('id', s.id, 'sealed', k.sealed) from sources s join source_secrets k on k.source_id = s.id
  where s.kind = 'twilio' and s.status <> 'disconnected' and s.account = p_account order by s.created_at limit 1;
$$;

ALTER FUNCTION public.text_source_for(p_account text) OWNER TO postgres;

-- function: text_status(text, text, text)
CREATE FUNCTION public.text_status(p_sid text, p_status text, p_error text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update text_messages set
    status = case when p_status = 'delivered' then 'delivered' when p_status in ('undelivered', 'failed') then 'failed' else status end,
    error = case when p_status in ('undelivered', 'failed') then left(p_error, 500) else error end,
    updated_at = now()
  where sid = p_sid and status in ('sent', 'delivered', 'unknown') and not (status = 'delivered' and p_status <> 'delivered');
  return found;
end;
$$;

ALTER FUNCTION public.text_status(p_sid text, p_status text, p_error text) OWNER TO postgres;

-- function: text_take(uuid)
CREATE FUNCTION public.text_take(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  m text_messages%rowtype;
begin
  select * into m from text_messages where id = p_id for update;
  if m.id is null or m.status not in ('queued', 'sending') then return null; end if;
  update text_messages set attempts = attempts + 1, status = 'sending', updated_at = now() where id = p_id;
  return to_jsonb(m) || jsonb_build_object(
    'attempts', m.attempts + 1,
    'stopped', coalesce((select jsonb_agg(o.sender) from text_optouts o where o.phone = m.to_phone), '[]'),
    'consent', (select status from consents where contact_id = m.contact_id and channel = 'sms' order by at desc, id limit 1),
    'meeting', (select jsonb_build_object('status', x.status, 'start_at', x.start_at) from meetings x where x.id = m.meeting_id),
    'twilio_source', (select s.id from sources s where s.workspace_id = m.workspace_id and s.kind = 'twilio' and s.status <> 'disconnected' order by s.created_at limit 1),
    'email', (select c.email_clean from contacts c where c.id = m.contact_id and c.deleted_at is null
              and not exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'sending', (select jsonb_build_object('from_name', coalesce(ss.from_name, w.name), 'from_email', ss.from_email, 'reply_to', ss.reply_to)
                from workspaces w left join send_settings ss on ss.workspace_id = w.id where w.id = m.workspace_id)
  );
end;
$$;

ALTER FUNCTION public.text_take(p_id uuid) OWNER TO postgres;

-- function: topic_delete(uuid)
CREATE FUNCTION public.topic_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from topics where id = p_id;
  if ws is null or not is_owner(ws) then raise exception 'Topic not found'; end if;
  delete from topics where id = p_id;
end;
$$;

ALTER FUNCTION public.topic_delete(p_id uuid) OWNER TO postgres;

-- function: topic_save(uuid, uuid, text, boolean)
CREATE FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  tid uuid;
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can change topics'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the topic'; end if;
  if p_id is null then
    if (select count(*) from topics where workspace_id = p_ws) >= 50 then raise exception 'Up to 50 topics'; end if;
    insert into topics (workspace_id, name, default_on) values (p_ws, trim(p_name), coalesce(p_default_on, false)) returning id into tid;
  else
    update topics set name = trim(p_name), default_on = coalesce(p_default_on, default_on) where id = p_id and workspace_id = p_ws returning id into tid;
    if tid is null then raise exception 'Topic not found'; end if;
  end if;
  return tid;
end;
$$;

ALTER FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) OWNER TO postgres;

-- function: touch_from_fill(jsonb, uuid, timestamp with time zone)
CREATE FUNCTION public.touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', coalesce(nullif(h->>'first_utm_source', ''), nullif(h->>'utm_source', ''), nullif(substring(h->>'referrer' from '^https?://(?:www\.)?([^/:?#]+)'), ''), 'direct'),
    'medium', coalesce(nullif(h->>'first_utm_medium', ''), nullif(h->>'utm_medium', '')),
    'campaign', coalesce(nullif(h->>'first_utm_campaign', ''), nullif(h->>'utm_campaign', '')),
    'form_id', p_form,
    'at', p_at));
$$;

ALTER FUNCTION public.touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone) OWNER TO postgres;

-- function: track_booked(uuid)
CREATE FUNCTION public.track_booked(p_sub uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from submission_track where submission_id = p_sub;
  if ws is null then return false; end if;
  perform enqueue_job(ws, 'track_send', 'track:b:' || p_sub, jsonb_build_object('submission', p_sub, 'event', 'booked'), 0, 6);
  return true;
end;
$$;

ALTER FUNCTION public.track_booked(p_sub uuid) OWNER TO postgres;

-- function: track_keep(uuid, jsonb)
CREATE FUNCTION public.track_keep(p_sub uuid, p_info jsonb) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
  n int;
begin
  select workspace_id into ws from submissions where id = p_sub and not spam and not test;
  if ws is null then return false; end if;
  insert into submission_track (submission_id, workspace_id, info) values (p_sub, ws, coalesce(p_info, '{}'))
  on conflict (submission_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  -- A few seconds, so the fill's contact is in.
  perform enqueue_job(ws, 'track_send', 'track:' || p_sub, jsonb_build_object('submission', p_sub, 'event', 'submit'), 10, 6);
  return true;
end;
$$;

ALTER FUNCTION public.track_keep(p_sub uuid, p_info jsonb) OWNER TO postgres;

-- function: track_prune()
CREATE FUNCTION public.track_prune() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from submission_track where created_at < now() - interval '30 days';
$$;

ALTER FUNCTION public.track_prune() OWNER TO postgres;

-- function: track_take(uuid)
CREATE FUNCTION public.track_take(p_sub uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'workspace_id', s.workspace_id,
    'submission', jsonb_build_object('id', s.id, 'created_at', s.created_at, 'hidden', s.hidden, 'contact_id', s.contact_id),
    'form', jsonb_build_object('id', f.id, 'name', f.name),
    'track', coalesce(v.body->'track', '{}'::jsonb),
    'info', t.info,
    'booked_at', (select m.created_at from meetings m where m.submission_id = s.id and m.status <> 'canceled' order by m.created_at limit 1),
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email_clean, 'phone', c.phone, 'first_name', c.first_name,
                 'last_name', c.last_name, 'country', c.country) end,
    'meta_source', (select x.id from sources x where x.workspace_id = s.workspace_id and x.kind = 'meta_ads' and x.status <> 'disconnected' order by x.created_at limit 1),
    'ads_source', (select x.id from sources x where x.workspace_id = s.workspace_id and x.kind = 'google_ads' and x.status <> 'disconnected' order by x.created_at limit 1)
  )
  from submission_track t
  join submissions s on s.id = t.submission_id
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id and c.deleted_at is null
  where t.submission_id = p_sub;
$$;

ALTER FUNCTION public.track_take(p_sub uuid) OWNER TO postgres;

-- function: try_numeric(text)
CREATE FUNCTION public.try_numeric(v text) RETURNS numeric
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
begin
  return case when v ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then v::numeric end;
end;
$_$;

ALTER FUNCTION public.try_numeric(v text) OWNER TO postgres;

-- function: try_timestamptz(text)
CREATE FUNCTION public.try_timestamptz(v text) RETURNS timestamp with time zone
    LANGUAGE plpgsql STABLE
    AS $$
begin
  if v is null or v !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' then
    return null;
  end if;
  return v::timestamptz;
exception when others then
  return null;
end;
$$;

ALTER FUNCTION public.try_timestamptz(v text) OWNER TO postgres;

-- function: verified_domain_for(uuid, text)
CREATE FUNCTION public.verified_domain_for(p_ws uuid, p_email text) RETURNS public.sending_domains
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select d.* from sending_domains d
  where d.workspace_id = p_ws and d.status = 'verified'
    and (lower(split_part(p_email, '@', 2)) = d.domain or lower(split_part(p_email, '@', 2)) like '%.' || d.domain)
  order by length(d.domain) desc
  limit 1;
$$;

ALTER FUNCTION public.verified_domain_for(p_ws uuid, p_email text) OWNER TO postgres;

-- function: visitors_list(uuid, text, timestamp with time zone, integer)
CREATE FUNCTION public.visitors_list(p_ws uuid, p_show text DEFAULT 'all'::text, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.last_seen desc) from (
      select d.id, d.first_seen, d.last_seen, d.sessions, d.state,
             ls.source, ls.medium, ls.campaign, ls.referrer_host, ls.ref_class, ls.landing_path, ls.country, ls.city, ls.device_type,
             pv.views, c.id as contact_id, c.first_name, c.last_name, c.email, l.level as link_level
      from devices d
      left join device_links l on l.device_id = d.id and l.to_at is null
      left join lateral (
        select ct.id, ct.first_name, ct.last_name, ct.email from contacts ct
        where ct.workspace_id = d.workspace_id and ct.person_id = l.person_id and ct.deleted_at is null
        order by ct.created_at limit 1
      ) c on l.person_id is not null
      left join lateral (
        select s.source, s.medium, s.campaign, s.referrer_host, s.ref_class, s.landing_path, s.country, s.city, s.device_type
        from sessions s where s.device_id = d.id and not s.is_bot order by s.started_at desc limit 1
      ) ls on true
      left join lateral (select coalesce(sum(s.pageviews), 0)::int as views from sessions s where s.device_id = d.id and not s.is_bot) pv on true
      where d.workspace_id = p_ws and d.state not in ('internal', 'opted_out')
        and (p_before is null or d.last_seen < p_before)
        and exists (select 1 from sessions s where s.device_id = d.id and not s.is_bot and not s.internal)
        and (coalesce(p_show, 'all') = 'all' or (p_show = 'known' and c.id is not null) or (p_show = 'unknown' and c.id is null))
      order by d.last_seen desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) v
  ), '[]'::jsonb);
end;
$$;

ALTER FUNCTION public.visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer) OWNER TO postgres;

-- function: visitors_live(uuid, integer, integer)
CREATE FUNCTION public.visitors_live(p_ws uuid, p_hours integer DEFAULT 24, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    SET jit TO 'off'
    AS $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.started_at desc) from (
      select s.id, s.device_id, s.started_at, s.ended_at, s.country, s.city, s.ref_class, s.source, s.referrer_host, s.device_type, s.policy,
             s.account_id, a.name as account_name, a.domain as account_domain, s.account_source,
             s.person_id, p.primary_email as person_email, s.person_level, s.pageviews, s.engaged_s,
             coalesce(pv.pages, '{}') as pages,
             coalesce(pv.page_times, '{}') as page_times
      from sessions s
      left join accounts a on a.id = s.account_id
      left join persons p on p.id = s.person_id
      left join lateral (
        select array_agg(x.path order by x.server_at) as pages, array_agg(x.server_at order by x.server_at) as page_times
        from (select e.path, e.server_at from events e
              where e.session_id = s.id and e.kind = 'view'
                and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1
              order by e.server_at limit 12) x
      ) pv on true
      where s.workspace_id = p_ws and s.started_at > now() - make_interval(hours => least(greatest(p_hours, 1), 720)) and not s.is_bot and not s.internal
      order by s.started_at desc
      limit least(greatest(p_limit, 1), 500)
    ) v
  ), '[]'::jsonb);
end;
$$;

ALTER FUNCTION public.visitors_live(p_ws uuid, p_hours integer, p_limit integer) OWNER TO postgres;

-- function: wake_runner()
CREATE FUNCTION public.wake_runner() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  url text;
  last timestamptz;
begin
  select value into url from app_config where key = 'runner_wake_url';
  if coalesce(url, '') = '' or to_regproc('net.http_get') is null then
    return;
  end if;
  select updated_at into last from app_config where key = 'runner_last_wake';
  if last is not null and last > now() - interval '20 seconds' then
    return;
  end if;
  insert into app_config (key, value, updated_at) values ('runner_last_wake', '', now())
  on conflict (key) do update set updated_at = now();
  execute 'select net.http_get($1)' using url;
end;
$_$;

ALTER FUNCTION public.wake_runner() OWNER TO postgres;

-- function: web_daily()
CREATE FUNCTION public.web_daily() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform make_event_partitions(7);
  perform drop_old_event_partitions(180);
  insert into salts (day, salt) values (current_date, decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'))
  on conflict (day) do nothing;
  delete from salts where day < current_date - 1;
  delete from hop_nonces where used_at < now() - interval '10 minutes';
end;
$$;

ALTER FUNCTION public.web_daily() OWNER TO postgres;

-- function: webhook_delete(uuid, uuid)
CREATE FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from webhook_endpoints where id = p_id and workspace_id = p_ws;
$$;

ALTER FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: webhook_deliveries_list(uuid, uuid, integer)
CREATE FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer DEFAULT 50) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select d.id, d.event, d.meeting_id, d.status, d.attempts, d.code, d.error, d.test, d.created_at, d.sent_at, d.body
    from webhook_deliveries d
    where d.endpoint_id = p_endpoint and d.workspace_id = p_ws
    order by d.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x;
$$;

ALTER FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer) OWNER TO postgres;

-- function: webhook_done(uuid, text, integer, text)
CREATE FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) OWNER TO postgres;

-- function: webhook_freeze(uuid, jsonb)
CREATE FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update webhook_deliveries set body = p_body, frozen = true where id = p_id and not frozen;
$$;

ALTER FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) OWNER TO postgres;

-- function: webhook_meeting_body(uuid, text, bigint, timestamp with time zone, jsonb)
CREATE FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) OWNER TO postgres;

-- function: webhook_prune()
CREATE FUNCTION public.webhook_prune() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform prune_batch('public.webhook_deliveries', format('created_at < %L', now() - interval '30 days'), 500000);
end;
$$;

ALTER FUNCTION public.webhook_prune() OWNER TO postgres;

-- function: webhook_resend(uuid, uuid)
CREATE FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update webhook_deliveries set status = 'pending', error = null where id = p_id and workspace_id = p_ws;
  if not found then raise exception 'not_found'; end if;
  perform enqueue_job(p_ws, 'meeting_webhook', p_id::text, jsonb_build_object('delivery_id', p_id), 0, 8);
end;
$$;

ALTER FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: webhook_routed_body(uuid, uuid, uuid, text, jsonb, timestamp with time zone)
CREATE FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;

ALTER FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) OWNER TO postgres;

-- function: webhook_save(uuid, uuid, text, text, text, text[], text, boolean, uuid)
CREATE FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) OWNER TO postgres;

-- function: webhook_sealed(uuid, uuid)
CREATE FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select sealed from webhook_endpoints where id = p_id and workspace_id = p_ws;
$$;

ALTER FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: webhook_take(uuid)
CREATE FUNCTION public.webhook_take(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.webhook_take(p_id uuid) OWNER TO postgres;

-- function: webhook_test_add(uuid, uuid, text, jsonb)
CREATE FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) OWNER TO postgres;

-- function: webhooks_list(uuid)
CREATE FUNCTION public.webhooks_list(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'host', e.host, 'secret_hint', e.secret_hint, 'events', e.events, 'description', e.description, 'active', e.active,
    'last_ok_at', e.last_ok_at, 'last_fail_at', e.last_fail_at, 'last_error', e.last_error, 'created_at', e.created_at,
    'sent', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'done' and d.created_at > now() - interval '30 days'),
    'failed', (select count(*) from webhook_deliveries d where d.endpoint_id = e.id and d.status = 'failed' and d.created_at > now() - interval '30 days')
  ) order by e.created_at), '[]')
  from webhook_endpoints e where e.workspace_id = p_ws and e.via = 'app';
$$;

ALTER FUNCTION public.webhooks_list(p_ws uuid) OWNER TO postgres;

-- function: workflow_claim(uuid, integer)
CREATE FUNCTION public.workflow_claim(p_ws uuid, p_limit integer DEFAULT 200) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ids uuid[];
begin
  ids := array(
    select x.id from workflow_runs x join workflows w on w.id = x.workflow_id and w.status = 'live'
    where x.workspace_id = p_ws and x.status in ('active', 'waiting') and x.next_at <= now() and (x.claimed_at is null or x.claimed_at < now() - interval '2 minutes')
    order by x.next_at limit least(greatest(p_limit, 1), 500)
    for update of x skip locked);
  update workflow_runs set claimed_at = now() where id = any(ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'workflow_id', r.workflow_id, 'workflow_name', w.name, 'version', r.version, 'contact_id', r.contact_id, 'at_step', r.at_step,
      'wait', r.wait, 'started_at', r.started_at, 'next_at', r.next_at, 'body', v.body) order by r.next_at)
    from workflow_runs r join workflows w on w.id = r.workflow_id join workflow_versions v on v.workflow_id = r.workflow_id and v.version = r.version
    where r.id = any(ids)), '[]');
end;
$$;

ALTER FUNCTION public.workflow_claim(p_ws uuid, p_limit integer) OWNER TO postgres;

-- function: workflow_defaults(uuid, jsonb)
CREATE FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  it jsonb;
  names text[];
  fname text;
  fid uuid;
  made int := 0;
  i int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then raise exception 'Bad starting workflows'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if (select workflow_defaults_at from workspaces where id = p_ws) is not null then return 0; end if;
  update workspaces set workflow_defaults_at = now() where id = p_ws;
  if (select count(*) from workflows where workspace_id = p_ws) + jsonb_array_length(p_items) > 100 then return 0; end if;

  -- The starting folders go first, in the order they're named; older folders move down after them.
  select array_agg(f order by o) into names from (
    select it2->>'folder' f, min(o) o from jsonb_array_elements(p_items) with ordinality x(it2, o) group by it2->>'folder'
  ) g;
  if (select count(*) from workflow_folders where workspace_id = p_ws) + coalesce(array_length(names, 1), 0) > 50 then return 0; end if;
  update workflow_folders set position = position + coalesce(array_length(names, 1), 0) where workspace_id = p_ws;
  for i in 1 .. coalesce(array_length(names, 1), 0) loop
    fname := left(btrim(coalesce(names[i], '')), 60);
    if fname = '' then raise exception 'Name the folder'; end if;
    insert into workflow_folders (workspace_id, name, position) values (p_ws, fname, i - 1);
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'name'), '') = '' or jsonb_typeof(it->'draft') <> 'object' then raise exception 'Bad starting workflows'; end if;
    select id into fid from workflow_folders where workspace_id = p_ws and name = left(btrim(it->>'folder'), 60) order by position limit 1;
    insert into workflows (workspace_id, name, draft, folder_id, created_by)
    values (p_ws, left(btrim(it->>'name'), 120), it->'draft', fid, auth.uid());
    made := made + 1;
  end loop;
  return made;
end;
$$;

ALTER FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) OWNER TO postgres;

-- function: workflow_delete(uuid)
CREATE FUNCTION public.workflow_delete(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  delete from workflows where id = p_id;
  insert into audit_log (workspace_id, actor, action, target, data) values (w.workspace_id, auth.uid(), 'workflow.delete', p_id::text, jsonb_build_object('name', w.name));
end;
$$;

ALTER FUNCTION public.workflow_delete(p_id uuid) OWNER TO postgres;

-- function: workflow_due()
CREATE FUNCTION public.workflow_due() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct x.workspace_id from workflow_runs x join workflows w on w.id = x.workflow_id and w.status = 'live'
    where x.status in ('active', 'waiting') and x.next_at <= now()
    limit 500
  loop
    perform enqueue_job(r.workspace_id, 'workflow_run', r.workspace_id::text, '{}', 0, 3);
    n := n + 1;
  end loop;
  return n;
end;
$$;

ALTER FUNCTION public.workflow_due() OWNER TO postgres;

-- function: workflow_email(uuid, text, jsonb, text, text)
CREATE FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r workflow_runs%rowtype;
  eid uuid;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select email_id into eid from workflow_emails where workflow_id = r.workflow_id and version = r.version and step_id = p_step;
  if eid is null then raise exception 'This email was never made live'; end if;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null or coalesce(c.email_clean, '') = '' then return null; end if;
  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, vars, from_name, reply_to)
  values (r.workspace_id, eid, c.id, c.email_clean, 'wf:' || p_run || ':' || p_step, p_vars, left(p_from_name, 80), left(p_reply_to, 254))
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is not null then perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3); end if;
  return mid;
end;
$$;

ALTER FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) OWNER TO postgres;

-- function: workflow_email(uuid, text, jsonb, text, text, uuid)
CREATE FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r workflow_runs%rowtype;
  eid uuid;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select email_id into eid from workflow_emails where workflow_id = r.workflow_id and version = r.version and step_id = p_step;
  if eid is null then raise exception 'This email was never made live'; end if;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null or coalesce(c.email_clean, '') = '' then return null; end if;
  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, vars, from_name, reply_to, sender_user)
  values (r.workspace_id, eid, c.id, c.email_clean, 'wf:' || p_run || ':' || p_step, p_vars, left(p_from_name, 80), left(p_reply_to, 254), p_from_user)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is not null then perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3); end if;
  return mid;
end;
$$;

ALTER FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) OWNER TO postgres;

-- function: workflow_event_since(uuid, text, timestamp with time zone)
CREATE FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from workflow_runs r join contact_events e on e.contact_id = r.contact_id and e.workspace_id = r.workspace_id
                 where r.id = p_run and e.kind = p_kind and e.at >= p_since);
$$;

ALTER FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) OWNER TO postgres;

-- function: workflow_event_since(uuid, text, timestamp with time zone, text)
CREATE FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (select 1 from workflow_runs r join contact_events e on e.contact_id = r.contact_id and e.workspace_id = r.workspace_id
                 where r.id = p_run and e.kind = p_kind and e.at >= p_since and (p_name is null or e.data->>'name' = p_name));
$$;

ALTER FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) OWNER TO postgres;

-- function: workflow_facts(uuid)
CREATE FUNCTION public.workflow_facts(p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
      'title', c.title, 'seniority', c.seniority, 'department', c.department, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle,
      'lead_status', c.lead_status, 'score', c.score, 'score_band', c.score_band, 'qualify_outcome', c.qualify_outcome, 'timezone', c.timezone,
      'owner', c.owner_user_id, 'fields', c.fields, 'deleted', c.deleted_at is not null, 'merged_into', c.merged_into,
      'suppressed', exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'company', (select jsonb_strip_nulls(jsonb_build_object('name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size, 'employees', co.employees, 'country', co.country)) from companies co where co.id = c.company_id),
    'answers', coalesce((select s."values" from submissions s where s.contact_id = c.id and not s.test order by s.created_at desc limit 1), '{}'),
    'booked', exists (select 1 from meetings m where m.contact_id = c.id and m.created_at >= r.started_at and m.status in ('booked', 'held')),
    'tz', coalesce(c.timezone, (select timezone from send_settings where workspace_id = r.workspace_id)),
    'owner', (select jsonb_build_object('id', u.id, 'email', u.email,
                'name', coalesce((select nullif(trim(bp.name), '') from booking_profiles bp where bp.workspace_id = r.workspace_id and bp.user_id = u.id), split_part(u.email, '@', 1)))
              from auth.users u where u.id = c.owner_user_id))
  from workflow_runs r join contacts c on c.id = r.contact_id where r.id = p_run;
$$;

ALTER FUNCTION public.workflow_facts(p_run uuid) OWNER TO postgres;

-- function: workflow_folder_delete(uuid, uuid)
CREATE FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from workflow_folders where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

ALTER FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) OWNER TO postgres;

-- function: workflow_folder_move(uuid, uuid, integer)
CREATE FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ids uuid[];
  i int;
  j int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select array_agg(id order by position, created_at) into ids from workflow_folders where workspace_id = p_ws;
  i := array_position(ids, p_id);
  if i is null then raise exception 'Folder not found'; end if;
  j := i + sign(p_by)::int;
  if j < 1 or j > cardinality(ids) then return false; end if;
  ids[i] := ids[j];
  ids[j] := p_id;
  update workflow_folders f set position = x.ord - 1 from unnest(ids) with ordinality x(id, ord) where f.id = x.id;
  return true;
end;
$$;

ALTER FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) OWNER TO postgres;

-- function: workflow_folder_save(uuid, uuid, text)
CREATE FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name the folder'; end if;
  if p_id is null then
    if (select count(*) from workflow_folders where workspace_id = p_ws) >= 50 then raise exception 'Up to 50 folders'; end if;
    insert into workflow_folders (workspace_id, name, position)
    values (p_ws, left(btrim(p_name), 60), coalesce((select max(position) + 1 from workflow_folders where workspace_id = p_ws), 0))
    returning id into fid;
    return fid;
  end if;
  update workflow_folders set name = left(btrim(p_name), 60) where id = p_id and workspace_id = p_ws returning id into fid;
  if fid is null then raise exception 'Folder not found'; end if;
  return fid;
end;
$$;

ALTER FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) OWNER TO postgres;

-- function: workflow_folders_start(uuid)
CREATE FUNCTION public.workflow_folders_start(p_ws uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n int := 0;
  st record;
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if exists (select 1 from workflow_folders where workspace_id = p_ws) then return 0; end if;
  for st in
    select x.stage, x.label, x.ord from (values ('trial', 'Trial', 1), ('pipeline', 'Pipeline', 2), ('customer', 'Customer', 3)) x(stage, label, ord)
    where exists (select 1 from workflows w where w.workspace_id = p_ws and w.stage = x.stage)
    order by x.ord
  loop
    insert into workflow_folders (workspace_id, name, position) values (p_ws, st.label, n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and stage = st.stage and folder_id is null;
    n := n + 1;
  end loop;
  if exists (select 1 from workflows where workspace_id = p_ws and folder_id is null) then
    insert into workflow_folders (workspace_id, name, position) values (p_ws, 'Workflows', n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and folder_id is null;
    n := n + 1;
  end if;
  return n;
end;
$$;

ALTER FUNCTION public.workflow_folders_start(p_ws uuid) OWNER TO postgres;

-- function: workflow_follow(uuid, uuid)
CREATE FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r workflow_runs%rowtype;
begin
  select * into r from workflow_runs where id = p_run for update;
  if not exists (select 1 from contacts c where c.id = p_contact and c.workspace_id = r.workspace_id and c.deleted_at is null) then return false; end if;
  if exists (select 1 from workflow_runs x where x.workflow_id = r.workflow_id and x.contact_id = p_contact and x.id <> r.id) then
    update workflow_runs set status = 'exited', exit_reason = 'merged into another run', ended_at = now(), claimed_at = null where id = p_run;
    return false;
  end if;
  update workflow_runs set contact_id = p_contact where id = p_run;
  return true;
end;
$$;

ALTER FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) OWNER TO postgres;

-- function: workflow_list(uuid, text, uuid)
CREATE FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r workflow_runs%rowtype;
begin
  select * into r from workflow_runs where id = p_run;
  if not exists (select 1 from segments where id = p_segment and workspace_id = r.workspace_id and kind = 'static') then return false; end if;
  if p_action = 'add' then
    insert into segment_members (workspace_id, segment_id, contact_id) values (r.workspace_id, p_segment, r.contact_id)
    on conflict (segment_id, contact_id) do update set left_at = null, entered_at = case when segment_members.left_at is null then segment_members.entered_at else now() end;
  else
    update segment_members set left_at = now() where segment_id = p_segment and contact_id = r.contact_id and left_at is null;
  end if;
  update segments set count = (select count(*) from segment_members where segment_id = p_segment and left_at is null), refreshed_at = now() where id = p_segment;
  return true;
end;
$$;

ALTER FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) OWNER TO postgres;

-- function: workflow_may_start(uuid, uuid)
CREATE FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    (select count(*) from workflow_runs r where r.contact_id = p_contact and r.status in ('active', 'waiting')) < 20
    and case coalesce((select v.body->'entry'->>'mode' from workflows w join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version where w.id = p_workflow), 'once')
      when 'once' then not exists (select 1 from workflow_runs r where r.workflow_id = p_workflow and r.contact_id = p_contact)
      else not exists (select 1 from workflow_runs r where r.workflow_id = p_workflow and r.contact_id = p_contact
        and r.started_at > now() - make_interval(days => coalesce((select (v.body->'entry'->>'gapDays')::int from workflows w join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version where w.id = p_workflow), 30)))
    end;
$$;

ALTER FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) OWNER TO postgres;

-- function: workflow_meeting_changed()
CREATE FUNCTION public.workflow_meeting_changed() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.contact_id is not null and (new.start_at is distinct from old.start_at or new.status is distinct from old.status) then
    update workflow_runs set next_at = now()
    where contact_id = new.contact_id and workspace_id = new.workspace_id and status = 'waiting' and wait ? 'meeting' and next_at > now();
  end if;
  return null;
end;
$$;

ALTER FUNCTION public.workflow_meeting_changed() OWNER TO postgres;

-- function: workflow_meetings(uuid)
CREATE FUNCTION public.workflow_meetings(p_run uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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

ALTER FUNCTION public.workflow_meetings(p_run uuid) OWNER TO postgres;

-- function: workflow_preview_facts(uuid)
CREATE FUNCTION public.workflow_preview_facts(p_contact uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when is_member(c.workspace_id) then jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
      'title', c.title, 'seniority', c.seniority, 'department', c.department, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle,
      'lead_status', c.lead_status, 'score', c.score, 'score_band', c.score_band, 'qualify_outcome', c.qualify_outcome, 'timezone', c.timezone,
      'owner', c.owner_user_id, 'fields', c.fields, 'deleted', false, 'merged_into', null,
      'suppressed', exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'company', (select jsonb_strip_nulls(jsonb_build_object('name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size, 'employees', co.employees, 'country', co.country)) from companies co where co.id = c.company_id),
    'answers', coalesce((select s."values" from submissions s where s.contact_id = c.id and not s.test order by s.created_at desc limit 1), '{}'),
    'booked', false,
    'tz', c.timezone,
    'owner', null) end
  from contacts c where c.id = p_contact and c.deleted_at is null;
$$;

ALTER FUNCTION public.workflow_preview_facts(p_contact uuid) OWNER TO postgres;

-- function: workflow_publish(uuid, uuid, jsonb, jsonb, text)
CREATE FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w workflows%rowtype;
  v int;
  e jsonb;
  eid uuid;
begin
  select * into w from workflows where id = p_id for update;
  if w.id is null then raise exception 'Workflow not found'; end if;
  v := coalesce((select max(version) from workflow_versions where workflow_id = p_id), 0) + 1;
  insert into workflow_versions (workflow_id, workspace_id, version, body, note, published_by) values (p_id, w.workspace_id, v, p_body, left(p_note, 300), p_user);
  for e in select * from jsonb_array_elements(coalesce(p_emails, '[]')) loop
    eid := email_create(w.workspace_id, p_user, jsonb_build_object('kind', 'journey', 'name', left(w.name || ': ' || coalesce(e->>'subject', ''), 200), 'subject', e->>'subject',
      'preheader', e->>'preheader', 'html', e->>'html', 'text', e->>'text', 'links', coalesce(e->'links', '[]'), 'marketing', true));
    insert into workflow_emails (workflow_id, version, step_id, email_id) values (p_id, v, e->>'step', eid);
  end loop;
  update workflows set status = 'live', live_version = v, trigger_kind = p_body->'trigger'->>'kind', live_at = coalesce(case when status = 'live' then live_at end, now()), draft = p_body, updated_at = now() where id = p_id;
  delete from workflow_watch where workflow_id = p_id;
  if p_body->'trigger'->>'kind' = 'field' then
    insert into workflow_watch (workspace_id, workflow_id, key) values (w.workspace_id, p_id, p_body->'trigger'->>'key') on conflict do nothing;
  end if;
  insert into audit_log (workspace_id, actor, action, target, data) values (w.workspace_id, p_user, 'workflow.publish', p_id::text, jsonb_build_object('version', v));
  return v;
end;
$$;

ALTER FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text) OWNER TO postgres;

-- function: workflow_reminders_live(uuid)
CREATE FUNCTION public.workflow_reminders_live(p_ws uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
  select exists (
    select 1 from workflows w
    join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
    where w.workspace_id = p_ws and w.status = 'live' and v.body->'trigger'->>'kind' = 'meeting'
      and jsonb_path_exists(v.body->'steps', '$.** ? (@.kind == "wait" && @.before == "meeting")'));
$_$;

ALTER FUNCTION public.workflow_reminders_live(p_ws uuid) OWNER TO postgres;

-- function: workflow_retry(uuid)
CREATE FUNCTION public.workflow_retry(p_run uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  r workflow_runs%rowtype;
  failed text;
begin
  select * into r from workflow_runs where id = p_run for update;
  if r.id is null or not is_member(r.workspace_id) then raise exception 'Run not found'; end if;
  select step_id into failed from workflow_steps_done where run_id = p_run and status = 'failed' order by at desc limit 1;
  if failed is null then raise exception 'Nothing failed on this run'; end if;
  delete from workflow_steps_done where run_id = p_run and step_id = failed;
  update workflow_runs set status = 'active', at_step = failed, next_at = now(), ended_at = null, exit_reason = null, claimed_at = null where id = p_run;
  insert into audit_log (workspace_id, actor, action, target, data) values (r.workspace_id, auth.uid(), 'workflow.retry', p_run::text, jsonb_build_object('step', failed));
end;
$$;

ALTER FUNCTION public.workflow_retry(p_run uuid) OWNER TO postgres;

-- function: workflow_save(uuid, uuid, text, jsonb, integer)
CREATE FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w workflows%rowtype;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the workflow'; end if;
  if p_id is null then
    if (select count(*) from workflows where workspace_id = p_ws) >= 100 then raise exception 'Up to 100 workflows'; end if;
    insert into workflows (workspace_id, name, draft, created_by) values (p_ws, left(trim(p_name), 120), coalesce(p_draft, '{}'), auth.uid()) returning * into w;
    return jsonb_build_object('id', w.id, 'revision', w.draft_revision);
  end if;
  select * into w from workflows where id = p_id and workspace_id = p_ws for update;
  if w.id is null then raise exception 'Workflow not found'; end if;
  if p_revision is not null and p_revision <> w.draft_revision then raise exception 'Someone else changed this workflow. Reload to see their changes.'; end if;
  update workflows set name = left(trim(p_name), 120), draft = coalesce(p_draft, draft), draft_revision = draft_revision + 1, updated_at = now() where id = p_id returning * into w;
  return jsonb_build_object('id', w.id, 'revision', w.draft_revision);
end;
$$;

ALTER FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) OWNER TO postgres;

-- function: workflow_scan()
CREATE FUNCTION public.workflow_scan() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w record;
  t jsonb;
  started int := 0;
  k int;
  since timestamptz;
  kinds text[];
begin
  for w in
    select f.id, f.workspace_id, f.live_version, f.live_at, v.body, m.scanned_to, m.fired_version, m.date_ran_on
    from workflows f join workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
    left join workflow_marks m on m.workflow_id = f.id
    where f.status = 'live' and f.trigger_kind not in ('manual')
  loop
    t := w.body->'trigger';
    if t->>'kind' in ('form', 'meeting', 'not_booked', 'outcome', 'band', 'routed', 'segment', 'field', 'clicked', 'product') then
      -- Re-read the last 15 minutes past the mark so an event that commits late is still picked up; never more than a day.
      since := greatest(w.live_at, coalesce(w.scanned_to, now()) - interval '15 minutes', now() - interval '1 day');
      kinds := case t->>'kind'
        when 'form' then array['form.submitted']
        when 'meeting' then array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x)
        when 'not_booked' then array['meeting.not_booked']
        when 'outcome' then array['lead.outcome']
        when 'band' then array['lead.band']
        when 'routed' then array(select x from unnest(array['lead.routed', 'lead.unassigned']) x
                                 where (x = 'lead.routed' and t->>'result' in ('routed', 'any')) or (x = 'lead.unassigned' and t->>'result' in ('unassigned', 'any')))
        when 'segment' then array[case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end]
        when 'field' then array['field.changed']
        when 'clicked' then array['email.clicked']
        when 'product' then array['product.used']
      end;
      insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
      select distinct on (e.contact_id) w.workspace_id, w.id, w.live_version, e.contact_id, 'ev:' || e.id::text
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = w.workspace_id and e.kind = any(kinds) and e.at >= since and e.at <= now()
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
      insert into workflow_marks (workflow_id, scanned_to) values (w.id, now())
      on conflict (workflow_id) do update set scanned_to = excluded.scanned_to;
    elsif t->>'kind' = 'broadcast' then
      -- Once, at its time, to everyone in the segment then.
      if (t->>'at')::timestamptz <= now() and w.fired_version is distinct from w.live_version then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, m.contact_id, 'bc:' || m.contact_id
        from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
        where m.segment_id = (t->>'segment')::uuid and m.left_at is null
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
        insert into workflow_marks (workflow_id, fired_version) values (w.id, w.live_version)
        on conflict (workflow_id) do update set fired_version = excluded.fired_version;
      end if;
    elsif t->>'kind' = 'date' then
      -- Once a day after the hour: contacts whose date field, moved by the days, is today.
      if to_char(now(), 'HH24:MI') >= coalesce(t->>'time', '09:00') and w.date_ran_on is distinct from current_date then
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
        insert into workflow_marks (workflow_id, date_ran_on) values (w.id, current_date)
        on conflict (workflow_id) do update set date_ran_on = excluded.date_ran_on;
      end if;
    end if;
  end loop;
  return started;
end;
$$;

ALTER FUNCTION public.workflow_scan() OWNER TO postgres;

-- function: workflow_set_folder(uuid, uuid, uuid)
CREATE FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_folder is not null and not exists (select 1 from workflow_folders where id = p_folder and workspace_id = p_ws) then raise exception 'Folder not found'; end if;
  update workflows set folder_id = p_folder where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

ALTER FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) OWNER TO postgres;

-- function: workflow_set_status(uuid, text)
CREATE FUNCTION public.workflow_set_status(p_id uuid, p_status text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  if p_status not in ('live', 'paused') then raise exception 'Pick live or paused'; end if;
  if p_status = 'live' and w.live_version is null then raise exception 'Make it live first'; end if;
  update workflows set status = p_status, updated_at = now() where id = p_id;
  insert into audit_log (workspace_id, actor, action, target) values (w.workspace_id, auth.uid(), 'workflow.' || p_status, p_id::text);
end;
$$;

ALTER FUNCTION public.workflow_set_status(p_id uuid, p_status text) OWNER TO postgres;

-- function: workflow_slack(uuid, uuid)
CREATE FUNCTION public.workflow_slack(p_run uuid, p_user uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select jsonb_build_object('sealed', (select s.sealed from slack_installs s where s.workspace_id = r.workspace_id),
    'email', (select u.email from auth.users u join workspace_members m on m.user_id = u.id and m.workspace_id = r.workspace_id where u.id = p_user))
  from workflow_runs r where r.id = p_run;
$$;

ALTER FUNCTION public.workflow_slack(p_run uuid, p_user uuid) OWNER TO postgres;

-- function: workflow_stats(uuid)
CREATE FUNCTION public.workflow_stats(p_id uuid) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  ws uuid;
begin
  select workspace_id into ws from workflows where id = p_id;
  if ws is null or not is_member(ws) then raise exception 'Workflow not found'; end if;
  return jsonb_build_object(
    'entered', (select count(*) from workflow_runs where workflow_id = p_id and started_at > now() - interval '7 days'),
    'active', (select count(*) from workflow_runs where workflow_id = p_id and status in ('active', 'waiting')),
    'steps', coalesce((select jsonb_object_agg(step_id, n) from (
      select d.step_id, count(*) as n from workflow_steps_done d join workflow_runs r on r.id = d.run_id
      where r.workflow_id = p_id and d.workspace_id = ws and d.at > now() - interval '7 days' and d.status = 'done'
      group by d.step_id) x), '{}'::jsonb));
end;
$$;

ALTER FUNCTION public.workflow_stats(p_id uuid) OWNER TO postgres;

-- function: workflow_step_begin(uuid, text, integer)
CREATE FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer DEFAULT 1) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  st text;
  ws uuid;
begin
  select workspace_id into ws from workflow_runs where id = p_run;
  insert into workflow_steps_done (run_id, workspace_id, step_id, visit, status) values (p_run, ws, p_step, p_visit, 'running')
  on conflict (run_id, step_id, visit) do nothing;
  if found then return 'new'; end if;
  select status into st from workflow_steps_done where run_id = p_run and step_id = p_step and visit = p_visit;
  return st;
end;
$$;

ALTER FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer) OWNER TO postgres;

-- function: workflow_step_done(uuid, text, integer, text, jsonb, text, timestamp with time zone, jsonb, text, text)
CREATE FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  wid uuid;
begin
  if p_step is not null then
    update workflow_steps_done set status = p_status, result = coalesce(p_result, '{}'), at = now() where run_id = p_run and step_id = p_step and visit = p_visit;
  end if;
  update workflow_runs set
    at_step = p_next,
    next_at = coalesce(p_next_at, now()),
    wait = p_wait,
    status = p_run_status,
    exit_reason = case when p_run_status in ('done', 'exited', 'failed') then coalesce(p_exit, exit_reason) else null end,
    ended_at = case when p_run_status in ('done', 'exited', 'failed') then now() else null end,
    claimed_at = null
  where id = p_run
  returning workflow_id into wid;
  return exists (select 1 from workflows where id = wid and status = 'live');
end;
$$;

ALTER FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text) OWNER TO postgres;

-- function: workflow_text(uuid, text, text, text, text, jsonb, uuid, timestamp with time zone, jsonb)
CREATE FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  r workflow_runs%rowtype;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null then return jsonb_build_object('skip', 'the contact is gone'); end if;
  if coalesce(c.phone, '') !~ '^\+[1-9][0-9]{6,14}$' then return jsonb_build_object('skip', 'no mobile number'); end if;
  if coalesce((select status from consents where contact_id = c.id and channel = 'sms' order by at desc, id limit 1), '') <> 'granted' then
    return jsonb_build_object('skip', 'no text consent');
  end if;
  insert into text_messages (workspace_id, contact_id, run_id, step_id, channel, to_phone, body, template, vars, meeting_id, meeting_start, fallback, dedupe)
  values (r.workspace_id, c.id, p_run, p_step, p_channel, c.phone, p_body, nullif(p_template, ''), coalesce(p_vars, '{}'), p_meeting, p_meeting_start, p_fallback,
          'wf:' || p_run || ':' || p_step)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is null then return jsonb_build_object('skip', 'queued before'); end if;
  perform enqueue_job(r.workspace_id, 'text_send', mid::text, jsonb_build_object('message', mid), 0, 4);
  return jsonb_build_object('id', mid);
end;
$_$;

ALTER FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) OWNER TO postgres;

-- function: workflow_unclaim(uuid[])
CREATE FUNCTION public.workflow_unclaim(p_runs uuid[]) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update workflow_runs set claimed_at = null where id = any(p_runs);
$$;

ALTER FUNCTION public.workflow_unclaim(p_runs uuid[]) OWNER TO postgres;

-- function: workflows_tick()
CREATE FUNCTION public.workflows_tick() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform product_events_sync();
  perform workflow_scan();
  perform workflow_due();
end;
$$;

ALTER FUNCTION public.workflows_tick() OWNER TO postgres;

-- function: workspace_brand_set(uuid, uuid)
CREATE FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_kit is not null and not exists (select 1 from brand_kits where id = p_kit and workspace_id = p_ws) then raise exception 'Brand kit not found'; end if;
  update workspaces set brand_kit_id = p_kit where id = p_ws;
end;
$$;

ALTER FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) OWNER TO postgres;

-- function: workspace_name_set(uuid, text)
CREATE FUNCTION public.workspace_name_set(p_ws uuid, p_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can rename it'; end if;
  if length(n) < 1 or length(n) > 80 then raise exception 'Use 1 to 80 characters'; end if;
  update workspaces set name = n, named = true where id = p_ws;
end;
$$;

ALTER FUNCTION public.workspace_name_set(p_ws uuid, p_name text) OWNER TO postgres;

-- function: workspace_people(uuid)
CREATE FUNCTION public.workspace_people(p_ws uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when is_member(p_ws) then coalesce((
    select jsonb_agg(jsonb_build_object('id', m.user_id, 'email', u.email, 'role', m.role) order by u.email)
    from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws), '[]'::jsonb) end;
$$;

ALTER FUNCTION public.workspace_people(p_ws uuid) OWNER TO postgres;

-- function: workspace_plan(uuid)
CREATE FUNCTION public.workspace_plan(p_ws uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select plan from workspace_billing where workspace_id = p_ws), 'free');
$$;

ALTER FUNCTION public.workspace_plan(p_ws uuid) OWNER TO postgres;

-- function: workspace_source(uuid, text)
CREATE FUNCTION public.workspace_source(p_ws uuid, p_kind text) RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select id from sources
  where workspace_id = p_ws and kind = p_kind and kind in ('webex', 'whereby', 'paypal', 'square') and status <> 'disconnected'
  order by created_at limit 1;
$$;

ALTER FUNCTION public.workspace_source(p_ws uuid, p_kind text) OWNER TO postgres;

-- function: workspace_usage(uuid)
CREATE FUNCTION public.workspace_usage(p_workspace uuid) RETURNS TABLE(plan text, period_start timestamp with time zone, period_end timestamp with time zone, minutes_used numeric, minutes_limit integer, credits_used integer, credits_limit integer, projects_used integer, projects_limit integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  b workspace_billing;
  p text;
  ps timestamptz;
  pe timestamptz;
begin
  if not (is_member(p_workspace) or auth.uid() is null) then
    raise exception 'Workspace not found';
  end if;
  select * into b from workspace_billing where workspace_id = p_workspace;
  p := coalesce(b.plan, 'free');
  if p <> 'free' and b.period_start is not null and b.period_end > now() then
    ps := b.period_start;
    pe := b.period_end;
  else
    ps := date_trunc('month', now());
    pe := ps + interval '1 month';
  end if;
  return query
  select p, ps, pe,
         round((coalesce((select sum(r.duration_ms) from runs r where r.workspace_id = p_workspace and r.created_at >= ps), 0)
              + coalesce((select sum(x.duration_ms) from explorations x where x.workspace_id = p_workspace and x.created_at >= ps), 0)) / 60000.0, 1),
         (plan_limits(p)).minutes,
         (coalesce((select sum(r.ai_calls) from runs r where r.workspace_id = p_workspace and r.created_at >= ps), 0)
          + coalesce((select sum(x.ai_calls) from explorations x where x.workspace_id = p_workspace and x.created_at >= ps), 0)
          + coalesce((select sum(pl.ai_calls) from plans pl where pl.workspace_id = p_workspace and pl.created_at >= ps), 0)
          + coalesce((select sum(g.ai_calls) from github_checks g where g.workspace_id = p_workspace and g.created_at >= ps), 0))::int,
         (plan_limits(p)).credits,
         (select count(*) from projects pr where pr.workspace_id = p_workspace)::int,
         (plan_limits(p)).projects;
end;
$$;

ALTER FUNCTION public.workspace_usage(p_workspace uuid) OWNER TO postgres;

-- function: workspaces_named()
CREATE FUNCTION public.workspaces_named() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if new.name is distinct from old.name then new.named := true; end if;
  return new;
end;
$$;

ALTER FUNCTION public.workspaces_named() OWNER TO postgres;

-- function: workspaces_seed_crm()
CREATE FUNCTION public.workspaces_seed_crm() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform crm_seed(new.id);
  return new;
end;
$$;

ALTER FUNCTION public.workspaces_seed_crm() OWNER TO postgres;

-- function: ws_tz(uuid)
CREATE FUNCTION public.ws_tz(p_ws uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select timezone from send_settings where workspace_id = p_ws and timezone is not null), 'UTC');
$$;

ALTER FUNCTION public.ws_tz(p_ws uuid) OWNER TO postgres;
