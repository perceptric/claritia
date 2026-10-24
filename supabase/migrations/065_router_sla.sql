-- Response times (docs/router.md Part 17) and the Claritia Slack app. When a lead is routed to a rep, a timer starts
-- from the live version's `sla` setting. The rep acts by adding a note, finishing a task, booking a meeting or pressing
-- "Mark contacted" (here, in Slack or on the contact). Every minute, router_sla_due nudges reps at the nudge time and,
-- at the deadline, routes the lead again without them or gives it to the manager (a `route` job with reason 'sla').
-- The Slack app (one install per workspace) sends direct messages and answers /book. Writes go through the server
-- with the service role; members read.

-- 'sla': a lead passed on because its rep didn't act in time.
alter table public.router_runs drop constraint if exists router_runs_reason_check;
alter table public.router_runs add constraint router_runs_reason_check
  check (reason in ('form', 'import', 'crm', 'api', 'again', 'let_through', 'score', 'manual', 'sla'));

create table if not exists public.router_slas (
  run_id uuid primary key references public.router_runs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  user_id uuid not null,
  started_at timestamptz not null default now(),
  nudge_at timestamptz,
  due_at timestamptz not null,
  -- At the deadline: route the lead again without this rep, give it to the manager, or only tell the rep.
  next text not null check (next in ('route', 'manager', 'nudge')),
  manager uuid,
  status text not null default 'open' check (status in ('open', 'met', 'missed', 'closed')),
  -- How it ended: the act that met it, or why it closed (the owner changed, the run was taken back).
  ended_by text check (ended_by in ('note', 'task', 'meeting', 'marked', 'owner_changed', 'undone')),
  acted_at timestamptz,
  nudged_at timestamptz,
  ended_at timestamptz
);
create index if not exists router_slas_open on public.router_slas (due_at) where status = 'open';
create index if not exists router_slas_contact on public.router_slas (contact_id, started_at desc);
create index if not exists router_slas_user on public.router_slas (workspace_id, user_id, started_at desc);
alter table public.router_slas enable row level security;
create policy "members read" on public.router_slas for select using (is_member(workspace_id));
revoke all on public.router_slas from anon;
revoke insert, update, delete on public.router_slas from authenticated;

-- The Slack app: the workspace's install, its bot token sealed with SECRETS_KEY.
create table if not exists public.slack_installs (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  team_id text not null unique check (length(team_id) <= 40),
  team_name text check (length(team_name) <= 200),
  bot_user_id text check (length(bot_user_id) <= 40),
  sealed text not null,
  installed_by uuid,
  created_at timestamptz not null default now()
);
alter table public.slack_installs enable row level security;
revoke all on public.slack_installs from anon, authenticated;

-- What the screens show about the install, without the token.
create or replace function public.slack_install_info(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(p_ws) then (select jsonb_build_object('team', s.team_name, 'at', s.created_at) from slack_installs s where s.workspace_id = p_ws) end;
$$;
grant execute on function public.slack_install_info(uuid) to authenticated;

-- Timers ----------------------------------------------------------------------------------------------------------

/*
 * A routed lead starts a timer when the version it was routed by has a response time. A lead given to the manager
 * after a miss doesn't start another: the manager is the last stop. A new run closes the lead's older open timers.
 */
create or replace function public.router_sla_start() returns trigger
language plpgsql security definer set search_path = public as $$
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

drop trigger if exists router_sla_start on public.router_runs;
create trigger router_sla_start after insert on public.router_runs for each row execute function public.router_sla_start();

-- A run taken back (spam, routed again) ends its timer.
create or replace function public.router_sla_undone() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.undone_at is not null and old.undone_at is null then
    update router_slas set status = 'closed', ended_by = 'undone', ended_at = now() where run_id = new.id and status = 'open';
  end if;
  return new;
end;
$$;

drop trigger if exists router_sla_undone on public.router_runs;
create trigger router_sla_undone after update of undone_at on public.router_runs for each row execute function public.router_sla_undone();

/*
 * Whether the rep acted on the lead since the timer started, and when first: a note they wrote, a task of theirs
 * finished, a meeting booked with the lead (by anyone, the lead included), or "Mark contacted". A lead that now has
 * another owner closes the timer instead. Null when none of these happened.
 */
create or replace function public.router_sla_acted(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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

/*
 * Every minute (pg_cron): timers at their nudge time or deadline. Acted ones end as met (or closed when the owner
 * changed); the rest are nudged, or at the deadline marked missed and passed on. Two runs at once never take the same
 * timer (skip locked).
 */
create or replace function public.router_sla_due() returns int
language plpgsql security definer set search_path = public as $$
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

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-router-sla', '* * * * *', 'select public.router_sla_due()');
  end if;
end $$;

/*
 * "Mark contacted": a line on the lead's timeline, which meets the rep's open timer at once. Only the lead's owner (or
 * a workspace owner) marks it. Returns whether a timer was met.
 */
create or replace function public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) returns boolean
language plpgsql security definer set search_path = public as $$
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

-- What a nudge, a miss or the pass-on needs: the timer, the rep, the lead, the reps who already let this lead wait
-- (in the last 30 days), the manager, the Slack app and channel, and the From address.
create or replace function public.router_sla_info(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- A contact's latest timer, for the contact page and the run panel.
create or replace function public.router_sla_of(p_ws uuid, p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(p_ws) then (
    select jsonb_build_object('run_id', t.run_id, 'user_id', t.user_id, 'status', t.status, 'started_at', t.started_at, 'due_at', t.due_at,
                              'ended_by', t.ended_by, 'acted_at', t.acted_at)
    from router_slas t where t.workspace_id = p_ws and t.contact_id = p_contact order by t.started_at desc limit 1) end;
$$;
grant execute on function public.router_sla_of(uuid, uuid) to authenticated;

-- Response times over the last p_days: per rep, timers met, missed and the median minutes to act.
create or replace function public.router_sla_stats(p_ws uuid, p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(p_ws) then coalesce((
    select jsonb_object_agg(x.user_id, jsonb_build_object('met', x.met, 'missed', x.missed, 'open', x.open, 'median', x.median))
    from (
      select t.user_id, count(*) filter (where t.status = 'met') as met, count(*) filter (where t.status = 'missed') as missed,
             count(*) filter (where t.status = 'open') as open,
             round((percentile_cont(0.5) within group (order by extract(epoch from (t.acted_at - t.started_at)) / 60)
                    filter (where t.status = 'met'))::numeric) as median
      from router_slas t where t.workspace_id = p_ws and t.started_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
      group by t.user_id) x), '{}') end;
$$;
grant execute on function public.router_sla_stats(uuid, int) to authenticated;

-- Slack -----------------------------------------------------------------------------------------------------------

-- Save an install (a reinstall replaces it). A Slack team belongs to one Claritia workspace at a time.
create or replace function public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  delete from slack_installs where team_id = p_team and workspace_id <> p_ws;
  insert into slack_installs (workspace_id, team_id, team_name, bot_user_id, sealed, installed_by)
  values (p_ws, p_team, left(p_team_name, 200), p_bot, p_sealed, p_user)
  on conflict (workspace_id) do update set team_id = excluded.team_id, team_name = excluded.team_name, bot_user_id = excluded.bot_user_id,
    sealed = excluded.sealed, installed_by = excluded.installed_by, created_at = now();
end;
$$;

-- A Slack request's workspace and the Claritia member with the clicking person's email.
create or replace function public.slack_caller(p_team text, p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('workspace_id', s.workspace_id, 'sealed', s.sealed,
    'user_id', (select m.user_id from workspace_members m join auth.users u on u.id = m.user_id
                where m.workspace_id = s.workspace_id and lower(u.email) = lower(trim(p_email)) limit 1))
  from slack_installs s where s.team_id = p_team;
$$;

create or replace function public.slack_install_token(p_team text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('workspace_id', s.workspace_id, 'sealed', s.sealed) from slack_installs s where s.team_id = p_team;
$$;

/*
 * What /book needs: the lead (by email) with its owner, and the meeting types the host is on, active ones first by
 * name. The host is the lead's owner when it has one, else the person asking.
 */
create or replace function public.slack_book_info(p_ws uuid, p_user uuid, p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- router_alert_info from 064, with the Slack app's sealed token so new leads reach the rep as a direct message.
create or replace function public.router_alert_info(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'run', jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'contact_id', r.contact_id, 'kind', r.kind, 'owner', r.owner, 'by', r."by", 'reason', r.reason,
                              'queue_id', r.queue_id, 'rule_id', r.rule_id, 'steps', r.steps, 'facts', r.facts, 'undone', r.undone_at is not null),
    'sealed', (select sealed from router_secrets s where s.workspace_id = r.workspace_id),
    'slack', (select sealed from slack_installs s where s.workspace_id = r.workspace_id),
    'owner', case when r.owner is null then null else meeting_people(r.workspace_id, array[r.owner])->0 end,
    'admins', coalesce((select jsonb_agg(lower(u.email)) from workspace_members m join auth.users u on u.id = m.user_id
                        where m.workspace_id = r.workspace_id and m.role = 'owner' and u.email is not null), '[]'),
    'workspace', (select name from workspaces w where w.id = r.workspace_id),
    'form', (select f.name from forms f where f.id::text = r.facts->'values'->>'lead.form'),
    'sending', meeting_sending(r.workspace_id))
  from router_runs r where r.id = p_run;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'router_alert_info(uuid)', 'router_sla_start()', 'router_sla_undone()', 'router_sla_acted(uuid)', 'router_sla_due()', 'router_sla_mark(uuid, uuid, uuid)', 'router_sla_info(uuid)',
    'slack_install_save(uuid, uuid, text, text, text, text)', 'slack_caller(text, text)', 'slack_install_token(text)', 'slack_book_info(uuid, uuid, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
