-- Server speed (docs: speed round 1, builder B): fewer round trips per signed-in request. Each function here does in
-- one call what the server did in many (a loop of calls, or two calls in a row), and each is one transaction, all or
-- nothing. The server falls back to the old calls until this file is run (src/lib/rpcCompat.ts), so the order of
-- deploy and migration doesn't matter. Safe to run twice. Adds nothing to the monthly bill.

-- Jobs ------------------------------------------------------------------------------------------------------------

-- Many jobs of one kind at once (Route again for up to 5,000 leads, Let through for many): each element is
-- {key, payload, delay_s?}. Each goes through enqueue_job, so a key already waiting is joined, never doubled, and
-- whatever enqueue_job does (lanes, limits) holds here too. Returns how many were asked for.
create or replace function public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts int default 5) returns int
language plpgsql security definer set search_path = public as $$
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

-- Routing ---------------------------------------------------------------------------------------------------------

-- Assign many leads to one rep (Held and Unassigned): router_assign for each, the same lead once, in id order so two
-- of these never wait on each other. A lead whose step meets a deadlock with a route job is tried again (up to three
-- times) in its own step, so one busy lead doesn't fail the rest.
create or replace function public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) returns int
language plpgsql security definer set search_path = public as $$
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

-- The workspace's people (id, name, email, tz), oldest member first: one call where the server read the members and
-- then asked meeting_people.
create or replace function public.router_members(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select meeting_people(p_ws, coalesce(array(select m.user_id from workspace_members m where m.workspace_id = p_ws order by m.created_at, m.user_id), '{}'));
$$;

-- What the rule editor's field list is made from: custom fields, forms, and each form's latest published body (only
-- that version, not every version's body). Up to 200 forms, most recently changed first.
create or replace function public.router_fields_src(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- Meetings --------------------------------------------------------------------------------------------------------

-- One person's role in a workspace (null when they aren't in it), where the Meetings routes read every member.
create or replace function public.meetings_role(p_ws uuid, p_user uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from workspace_members where workspace_id = p_ws and user_id = p_user;
$$;

-- Sources ---------------------------------------------------------------------------------------------------------

-- A webhook delivery's events staged in one call: hook_stage for each {dedupe, body}. Returns how many were new.
create or replace function public.hook_stage_many(p_source uuid, p_events jsonb) returns int
language plpgsql security definer set search_path = public as $$
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

-- Journeys and nurtures -------------------------------------------------------------------------------------------

-- The build screen's journeys in one call: journey_create for each {name, stage, journey, draft}, in order. Returns
-- their ids in the same order (one per journey key, as journey_create keeps it).
create or replace function public.journeys_create(p_ws uuid, p_user uuid, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  x jsonb;
  ids jsonb := '[]';
begin
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'p_items must be an array'; end if;
  for x in select value from jsonb_array_elements(p_items) loop
    ids := ids || to_jsonb(journey_create(p_ws, p_user, x->>'name', x->>'stage', x->>'journey', x->'draft'));
  end loop;
  return ids;
end;
$$;

-- A nurture's AI steps saved in one call, as the person who asked (security invoker: nurture_step_save checks their
-- membership with auth.uid()). Each {wait_days, subject, preheader, html, text, links, notes}; all or none.
create or replace function public.nurture_steps_save(p_nurture uuid, p_step uuid, p_steps jsonb) returns uuid[]
language plpgsql security invoker set search_path = public as $$
declare
  x jsonb;
  ids uuid[] := '{}';
begin
  if jsonb_typeof(p_steps) is distinct from 'array' then raise exception 'p_steps must be an array'; end if;
  if jsonb_array_length(p_steps) > 50 then raise exception 'Up to 50 steps'; end if;
  for x in select value from jsonb_array_elements(p_steps) loop
    ids := ids || nurture_step_save(p_nurture, p_step, (x->>'wait_days')::int, x->>'subject', x->>'preheader', x->>'html', x->>'text',
      coalesce(array(select jsonb_array_elements_text(coalesce(x->'links', '[]'))), '{}'), true,
      coalesce(array(select jsonb_array_elements_text(coalesce(x->'notes', '[]'))), '{}'));
  end loop;
  return ids;
end;
$$;

-- The AI step cache -----------------------------------------------------------------------------------------------

-- A cache hit read and logged in one call (the log is how the bill is checked). Null on a miss, which isn't logged
-- here: the miss is logged with its tokens by ai_cache_store.
create or replace function public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- A model call's log and (when it should be kept) its answer, in one call.
create or replace function public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform ai_call_log(p_ws, p_kind, p_model, coalesce(p_usage, '{}'), coalesce(p_cost, 0), false);
  if coalesce(p_keep, true) then
    perform ai_cache_put(p_ws, p_kind, p_key, p_output, p_model, coalesce((p_usage->>'input')::int, 0), coalesce((p_usage->>'output')::int, 0));
  end if;
end;
$$;

-- Sending ---------------------------------------------------------------------------------------------------------

-- Whether a test can go: the From address, the pause, and whether the From domain is verified. Always read fresh.
create or replace function public.email_test_ready(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'from_email', s.from_email,
    'paused', coalesce(s.paused, false),
    'verified', s.from_email is not null and (verified_domain_for(p_ws, s.from_email)).id is not null)
  from (select 1) one left join send_settings s on s.workspace_id = p_ws;
$$;

-- A test email made and queued to the member who asked, in one transaction (no test email is left unqueued).
create or replace function public.email_test_send(p_ws uuid, p_user uuid, p_values jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_values->>'kind', '') <> 'test' then raise exception 'Only tests'; end if;
  return email_queue_test(email_create(p_ws, p_user, p_values), p_user);
end;
$$;

-- Test inboxes ----------------------------------------------------------------------------------------------------

-- Test mail older than a week goes each night, instead of on every message that arrives (api/inbox/resend).
create index if not exists inbox_messages_received on public.inbox_messages (received_at);

create or replace function public.inbox_prune() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from inbox_messages where received_at < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-inbox-prune', '29 3 * * *', 'select public.inbox_prune()');
  end if;
end $$;

-- Grants ----------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'enqueue_jobs(uuid, text, jsonb, int)', 'router_assign_many(uuid, uuid[], uuid, uuid)', 'router_members(uuid)', 'router_fields_src(uuid)',
    'meetings_role(uuid, uuid)', 'hook_stage_many(uuid, jsonb)', 'journeys_create(uuid, uuid, jsonb)', 'ai_cache_hit(uuid, text, text)',
    'ai_cache_store(uuid, text, text, jsonb, text, jsonb, numeric, boolean)', 'email_test_ready(uuid)', 'email_test_send(uuid, uuid, jsonb)',
    'inbox_prune()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- Called by the signed-in person's own client; nurture_step_save checks them.
  execute 'revoke execute on function public.nurture_steps_save(uuid, uuid, jsonb) from public, anon';
  execute 'grant execute on function public.nurture_steps_save(uuid, uuid, jsonb) to authenticated';
end;
$$;
