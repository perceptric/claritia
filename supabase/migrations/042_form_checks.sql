-- The daily form check (docs/form-builder.md Part 10, week 11): Funnel QA for forms. Once a day the runner opens
-- each live form's page in a real browser, fills it with a lead marked as a test, and checks that the fill reached
-- Claritia and every destination. Each check keeps its steps; a failed one shows on the Forms list.

create table if not exists public.form_checks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'passed', 'failed')),
  -- [{ name, ok, detail }]
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  submission_id uuid references public.submissions (id) on delete set null,
  error text check (length(error) <= 1000),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists form_checks_form on public.form_checks (form_id, started_at desc);
alter table public.form_checks enable row level security;
create policy "members read" on public.form_checks for select using (is_member(workspace_id));
revoke all on public.form_checks from anon;
revoke insert, update, delete on public.form_checks from authenticated;

-- Check a form now, from the builder.
create or replace function public.form_check_now(p_form uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if f.status <> 'live' or f.kind <> 'built' then
    raise exception 'Only live forms built here can be checked';
  end if;
  perform enqueue_job(f.workspace_id, 'form_qa', f.id::text, jsonb_build_object('form_id', f.id), 0, 2);
  perform wake_runner();
end;
$$;

-- Each hour: live forms not checked in the last 20 hours get a check.
create or replace function public.form_checks_due() returns int
language plpgsql security definer set search_path = public as $$
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

-- A check begins: its id, and the workspace's own domain for the test lead's address.
create or replace function public.form_check_start(p_form uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
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

-- What the check waits on: the newest test fill since it began, and each of its deliveries.
create or replace function public.form_check_progress(p_form uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('submission_id', s.id, 'deliveries', coalesce((
    select jsonb_agg(jsonb_build_object('name', fd.name, 'status', d.status, 'error', d.error) order by fd.position, fd.created_at)
    from deliveries d join form_destinations fd on fd.id = d.destination_id where d.submission_id = s.id), '[]'::jsonb))
  from submissions s where s.form_id = p_form and s.test and s.created_at >= p_since
  order by s.created_at desc limit 1;
$$;

create or replace function public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) returns void
language sql security definer set search_path = public as $$
  update form_checks set status = p_status, steps = coalesce(p_steps, '[]'), submission_id = p_submission, error = left(p_error, 1000), finished_at = now()
  where id = p_id;
$$;

-- The Forms list gains the last check's state.
create or replace function public.forms_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status, 'kind', f.kind, 'version', f.version, 'updated_at', f.updated_at,
           'fills', coalesce(s.fills, 0), 'last_fill', s.last_fill, 'failed', coalesce(d.failed, 0), 'check', k.status) order by f.updated_at desc), '[]'::jsonb)
  from forms f
  left join lateral (
    select count(*) filter (where x.created_at > now() - interval '30 days') fills, max(x.created_at) last_fill
    from submissions x where x.form_id = f.id and not x.spam and not x.test
  ) s on true
  left join lateral (
    select count(*) failed from deliveries y join form_destinations fd on fd.id = y.destination_id where fd.form_id = f.id and y.status = 'failed'
  ) d on true
  left join lateral (select c.status from form_checks c where c.form_id = f.id order by c.started_at desc limit 1) k on true
  where f.workspace_id = p_ws and is_member(p_ws);
$$;

create or replace function public.minute_tick() returns void
language plpgsql security definer set search_path = public as $$
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
  if extract(minute from now())::int % 5 = 0 then
    perform segments_due();
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
  if extract(hour from now()) = 3 and extract(minute from now()) = 17 then
    perform contact_events_roll();
    perform prune_history();
    perform prune_sync();
    delete from ai_cache where created_at < now() - interval '90 days';
    delete from submissions where spam and created_at < now() - interval '7 days';
    delete from form_checks where started_at < now() - interval '90 days';
  end if;
end;
$$;
revoke execute on function public.minute_tick() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array['form_checks_due()', 'form_check_start(uuid)', 'form_check_progress(uuid, timestamptz)', 'form_check_finish(uuid, text, jsonb, uuid, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke execute on function public.form_check_now(uuid) from public, anon';
  execute 'grant execute on function public.form_check_now(uuid) to authenticated';
end;
$$;
