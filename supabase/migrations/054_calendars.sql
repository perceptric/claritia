-- Calendar connections (docs/meetings-scheduler.md 1.1, 1.3, 1.6 and 1.7): connecting Google, Microsoft and Zoom,
-- the calendar lists, the busy-time cache with push and a 10-minute safety net, the live check's inputs, and the
-- calendar side of each meeting (meeting_sync in worker-intel/jobs/calendars.ts). The server and the worker call these
-- with the service role; the provider calls themselves live in src/lib/meetings/providers/.

-- When the push channels next need renewing, and why a calendar asks to reconnect (shown on My calendar).
alter table public.calendar_accounts add column if not exists watch_due timestamptz;
alter table public.calendar_accounts add column if not exists reconnect_at timestamptz;
alter table public.calendar_accounts add column if not exists reconnect_reason text check (length(reconnect_reason) <= 300);
create index if not exists calendar_accounts_due on public.calendar_accounts (refreshed_at) where status = 'ok';

-- One meeting_sync at a time per meeting, so a cancel or a move never races the create it follows.
create table if not exists public.meeting_sync_leases (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  job text not null,
  until timestamptz not null
);
alter table public.meeting_sync_leases enable row level security;
revoke all on public.meeting_sync_leases from anon, authenticated;

-- An account with its sealed token and calendars, for the worker and the routes.
create or replace function public.calendar_account(p_account uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', a.id, 'workspace_id', a.workspace_id, 'user_id', a.user_id, 'provider', a.provider, 'account_email', a.account_email,
    'status', a.status, 'channels', a.channels, 'watch_due', a.watch_due, 'sealed', t.sealed,
    'lists', coalesce((select jsonb_agg(jsonb_build_object('calendar_id', l.calendar_id, 'name', l.name, 'busy', l.busy, 'write', l.write) order by l.calendar_id)
                       from calendar_lists l where l.account_id = a.id), '[]'))
  from calendar_accounts a left join calendar_tokens t on t.account_id = a.id
  where a.id = p_account;
$$;

/*
 * Bring an account's calendar list up to date with the provider's: new calendars come in (the primary one busy, and
 * the one written to when the person has none yet; other calendars they own busy), gone ones leave, and the person's
 * own busy and write choices on the rest stay. p_calendars: [{id, name, primary, own}].
 */
create or replace function public.calendar_lists_sync(p_account uuid, p_calendars jsonb) returns void
language plpgsql security definer set search_path = public as $$
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

-- Save a new sign-in (or a reconnect: the same account turns back to ok). Returns the account id.
create or replace function public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public as $$
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

/*
 * The person's choices: which calendars count as busy and which one gets new events. One calendar per person is
 * written to, so turning one on turns the others off, across all their accounts. p_rows: [{id, busy, write}].
 */
create or replace function public.calendar_lists_save(p_account uuid, p_rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
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

-- Replace the cached busy times of every calendar read ({calendar id: [{start, end, ooo}]}), drop the cache of
-- calendars no longer counted, and the past.
create or replace function public.calendar_busy_save(p_account uuid, p_from timestamptz, p_to timestamptz, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
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

create or replace function public.calendar_token_save(p_account uuid, p_sealed text) returns void
language sql security definer set search_path = public as $$
  update calendar_tokens set sealed = p_sealed, updated_at = now() where account_id = p_account;
$$;

/*
 * The provider turned the sign-in down. The account goes to "reconnect", which takes its person out of every offer
 * (meeting_inputs), and the person is told once: a calendar_reconnect job (the email) is queued only on the change.
 */
create or replace function public.calendar_reconnect(p_account uuid, p_reason text default null) returns boolean
language plpgsql security definer set search_path = public as $$
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

create or replace function public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamptz) returns void
language sql security definer set search_path = public as $$
  update calendar_accounts set channels = coalesce(p_channels, '{}'), watch_due = p_watch_due where id = p_account;
$$;

-- A push from Google or Microsoft (the signature is checked by the route): queue one refresh for the account, if the
-- channel is still one of its own. Pushes that arrive together join the same waiting job.
create or replace function public.calendar_hook(p_account uuid, p_channel text) returns boolean
language plpgsql security definer set search_path = public as $$
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

-- What the live check needs for some hosts: each working account with its sealed token and busy calendars. The fake
-- provider's busy times are its cached ones.
create or replace function public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
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

-- Disconnect: the account, its token, lists and busy times go.
create or replace function public.calendar_disconnect(p_account uuid) returns void
language sql security definer set search_path = public as $$
  delete from calendar_accounts where id = p_account;
$$;

/*
 * Every minute (pg_cron): the 10-minute safety-net refresh for every working Google and Microsoft account, and push
 * channels that are missing or end within a day. An account whose job is already waiting or running is skipped, so a
 * failing provider keeps its retry backoff.
 */
create or replace function public.calendars_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id, a.workspace_id from calendar_accounts a
    where a.status = 'ok' and a.provider in ('google', 'microsoft')
      and (a.refreshed_at is null or a.refreshed_at < now() - interval '10 minutes')
      and not exists (select 1 from jobs j where j.kind = 'calendar_refresh' and j.key = a.id::text and j.workspace_id = a.workspace_id and j.status in ('queued', 'running'))
    order by a.refreshed_at nulls first
    limit 5000
  loop
    perform enqueue_job(r.workspace_id, 'calendar_refresh', r.id::text, jsonb_build_object('account', r.id), 0, 3);
    n := n + 1;
  end loop;
  for r in
    select a.id, a.workspace_id from calendar_accounts a
    where a.status = 'ok' and a.provider in ('google', 'microsoft') and (a.watch_due is null or a.watch_due < now())
      and not exists (select 1 from jobs j where j.kind = 'calendar_watch' and j.key = a.id::text and j.workspace_id = a.workspace_id and j.status in ('queued', 'running'))
    limit 2000
  loop
    perform enqueue_job(r.workspace_id, 'calendar_watch', r.id::text, jsonb_build_object('account', r.id), 0, 3);
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-calendars', '* * * * *', 'select public.calendars_due()');
  end if;
end $$;

-- Meetings on calendars ---------------------------------------------------------------------------------------

-- What meeting_sync needs: the meeting, its type's name, and per host (in order) their email, the account and
-- calendar new events go to, and their Zoom account.
create or replace function public.meeting_sync_inputs(p_meeting uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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
      ) order by x.ord) from unnest(m.hosts) with ordinality x(h, ord))
  )
  from meetings m where m.id = p_meeting;
$$;

-- Take or keep the meeting's sync lease for p_s seconds; false while another job holds it.
create or replace function public.meeting_sync_lease(p_meeting uuid, p_job text, p_s int default 120) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  insert into meeting_sync_leases (meeting_id, job, until) values (p_meeting, p_job, now() + make_interval(secs => p_s))
  on conflict (meeting_id) do update set job = excluded.job, until = excluded.until
  where meeting_sync_leases.until < now() or meeting_sync_leases.job = excluded.job;
  return found;
end;
$$;

create or replace function public.meeting_sync_release(p_meeting uuid, p_job text) returns void
language sql security definer set search_path = public as $$
  delete from meeting_sync_leases where meeting_id = p_meeting and job = p_job;
$$;

-- Keep the provider event ids ({host: {provider, account, calendar, event, zoom}}) and the join link.
create or replace function public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb default '{}') returns void
language sql security definer set search_path = public as $$
  update meetings set events = coalesce(p_events, '{}'), location = location || coalesce(p_location, '{}'), updated_at = now() where id = p_meeting;
$$;

-- The calendar work failed for good: the meeting stays as it is, and the history says so.
create or replace function public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) returns void
language sql security definer set search_path = public as $$
  insert into meeting_events (meeting_id, kind, detail) values (p_meeting, 'calendar_failed', coalesce(p_detail, '{}'));
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'calendar_account(uuid)', 'calendar_lists_sync(uuid, jsonb)', 'calendar_connect(uuid, uuid, text, text, text, jsonb)',
    'calendar_lists_save(uuid, jsonb)', 'calendar_busy_save(uuid, timestamptz, timestamptz, jsonb)', 'calendar_token_save(uuid, text)',
    'calendar_reconnect(uuid, text)', 'calendar_channels_save(uuid, jsonb, timestamptz)', 'calendar_hook(uuid, text)',
    'calendar_live_inputs(uuid, uuid[], timestamptz, timestamptz)', 'calendar_disconnect(uuid)', 'calendars_due()',
    'meeting_sync_inputs(uuid)', 'meeting_sync_lease(uuid, text, int)', 'meeting_sync_release(uuid, text)',
    'meeting_calendar_save(uuid, jsonb, jsonb)', 'meeting_calendar_failed(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
