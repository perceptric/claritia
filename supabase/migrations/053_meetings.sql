-- Meetings (docs/meetings-scheduler.md): calendars, availability, meeting types, booking links, meetings and polls.
-- Times shown to leads come from the slot engine (src/lib/meetings/slots.ts) over busy_blocks and meetings; a
-- booking is only ever written by meeting_book, which locks each host and refuses an overlap, so two leads can't take
-- the same time. Every write goes through the app's server routes (service role) after the TypeScript checks in
-- src/lib/meetings/check.ts; members read their workspace's rows.

-- Booking addresses: /book/<workspace slug>/<type or person slug>.
alter table public.workspaces add column if not exists booking_slug text unique check (booking_slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$');

create table if not exists public.booking_profiles (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$'),
  name text not null check (length(name) between 1 and 120),
  headline text check (length(headline) <= 200),
  photo_url text check (photo_url ~ '^https://' and length(photo_url) <= 1000),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  unique (workspace_id, slug)
);

-- Calendars --------------------------------------------------------------------------------------------------

create table if not exists public.calendar_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  provider text not null check (provider in ('google', 'microsoft', 'zoom', 'fake')),
  account_email text not null check (length(account_email) <= 320),
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  -- Push channels: {calendar id: {id, resource, expires}}.
  channels jsonb not null default '{}',
  refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id, provider, account_email)
);
create index if not exists calendar_accounts_user on public.calendar_accounts (workspace_id, user_id);

-- Sign-in tokens, sealed with SECRETS_KEY (src/lib/seal.ts). No one but the server reads them.
create table if not exists public.calendar_tokens (
  account_id uuid primary key references public.calendar_accounts (id) on delete cascade,
  sealed text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_lists (
  account_id uuid not null references public.calendar_accounts (id) on delete cascade,
  calendar_id text not null check (length(calendar_id) <= 500),
  name text not null check (length(name) <= 300),
  busy boolean not null default true,
  write boolean not null default false,
  primary key (account_id, calendar_id)
);

-- Busy times only: no titles, guests or places from anyone's calendar are kept.
create table if not exists public.busy_blocks (
  account_id uuid not null references public.calendar_accounts (id) on delete cascade,
  calendar_id text not null,
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  ooo boolean not null default false
);
create index if not exists busy_blocks_account on public.busy_blocks (account_id, start_at);

create table if not exists public.availability (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  tz text not null default 'UTC' check (length(tz) <= 60),
  weekly jsonb not null check (jsonb_typeof(weekly) = 'object'),
  overrides jsonb not null default '[]' check (jsonb_typeof(overrides) = 'array'),
  holidays text check (holidays ~ '^[A-Z]{2}$'),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Meeting types and links -------------------------------------------------------------------------------------

create table if not exists public.meeting_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,58}[a-z0-9]$'),
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('one', 'round_robin', 'collective', 'owner_first', 'double', 'group')),
  hosts jsonb not null default '[]' check (jsonb_typeof(hosts) = 'array'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  secret boolean not null default false,
  active boolean not null default true,
  owner_user_id uuid,
  template_id uuid references public.meeting_types (id) on delete set null,
  locked text[] not null default '{}',
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, slug)
);

-- Single-use links, one-off meetings (a few offered times) and polls (guests vote, the host books the winner).
create table if not exists public.meeting_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('single_use', 'one_off', 'poll')),
  type_id uuid references public.meeting_types (id) on delete cascade,
  owner_user_id uuid not null,
  title text check (length(title) <= 120),
  -- one_off and poll: the offered times [{start, end}] and the length; single_use: nothing.
  offered jsonb not null default '[]' check (jsonb_typeof(offered) = 'array'),
  length_min int check (length_min between 5 and 480),
  -- Sent to the guest; only its hash is kept.
  token_hash text not null unique,
  used_at timestamptz,
  meeting_id uuid,
  closed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (kind = 'single_use' and type_id is not null or kind <> 'single_use')
);
create index if not exists meeting_links_ws on public.meeting_links (workspace_id, created_at desc);

create table if not exists public.poll_votes (
  link_id uuid not null references public.meeting_links (id) on delete cascade,
  email text not null check (length(email) <= 320),
  name text check (length(name) <= 200),
  picks jsonb not null default '[]' check (jsonb_typeof(picks) = 'array'),
  at timestamptz not null default now(),
  primary key (link_id, email)
);

-- Meetings -----------------------------------------------------------------------------------------------------

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type_id uuid references public.meeting_types (id) on delete set null,
  link_id uuid references public.meeting_links (id) on delete set null,
  hosts uuid[] not null check (cardinality(hosts) between 1 and 20),
  contact_id uuid references public.contacts (id) on delete set null,
  submission_id uuid references public.submissions (id) on delete set null,
  guest_email text not null check (length(guest_email) <= 320),
  guest_name text check (length(guest_name) <= 200),
  guest_tz text check (length(guest_tz) <= 60),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  -- The span kept free around the meeting: start and end with the type's buffers.
  block_start timestamptz not null,
  block_end timestamptz not null check (block_end >= end_at),
  status text not null default 'booked' check (status in ('pending_payment', 'booked', 'canceled', 'held', 'no_show')),
  source text not null check (source in ('page', 'form', 'handoff', 'one_off', 'poll', 'api')),
  -- Whether this meeting counts as a round-robin turn for its hosts.
  rr boolean not null default false,
  location jsonb not null default '{}',
  -- Provider event ids by host: {user id: {provider, calendar, event}}.
  events jsonb not null default '{}',
  -- The guest's manage link (reschedule and cancel); only its hash is kept.
  token_hash text not null unique,
  payment jsonb,
  cancel_reason text check (length(cancel_reason) <= 500),
  booked_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists meetings_hosts on public.meetings using gin (hosts);
create index if not exists meetings_ws_start on public.meetings (workspace_id, start_at desc);
create index if not exists meetings_type_start on public.meetings (type_id, start_at);
create index if not exists meetings_contact on public.meetings (contact_id) where contact_id is not null;

create table if not exists public.meeting_events (
  id bigint generated always as identity primary key,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index if not exists meeting_events_meeting on public.meeting_events (meeting_id, at);

-- Reading ------------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array['booking_profiles', 'calendar_accounts', 'calendar_lists', 'availability', 'meeting_types', 'meeting_links', 'poll_votes', 'meetings', 'meeting_events', 'busy_blocks', 'calendar_tokens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end;
$$;
create policy "members read" on public.booking_profiles for select using (is_member(workspace_id));
create policy "members read" on public.calendar_accounts for select using (is_member(workspace_id));
create policy "members read" on public.calendar_lists for select using (exists (select 1 from calendar_accounts a where a.id = account_id and is_member(a.workspace_id)));
create policy "members read" on public.availability for select using (is_member(workspace_id));
create policy "members read" on public.meeting_types for select using (is_member(workspace_id));
create policy "members read" on public.meeting_links for select using (is_member(workspace_id));
create policy "members read" on public.poll_votes for select using (exists (select 1 from meeting_links l where l.id = link_id and is_member(l.workspace_id)));
create policy "members read" on public.meetings for select using (is_member(workspace_id));
create policy "members read" on public.meeting_events for select using (exists (select 1 from meetings m where m.id = meeting_id and is_member(m.workspace_id)));
-- Busy times and tokens: the server only.
revoke select on public.busy_blocks, public.calendar_tokens from authenticated;

-- Writing (the server only) -------------------------------------------------------------------------------------

-- Whether a meeting still holds its time: booked, or waiting on payment for up to 10 minutes.
create or replace function public.meeting_holds(m meetings) returns boolean
language sql stable as $$
  select m.status = 'booked' or (m.status = 'pending_payment' and m.created_at > now() - interval '10 minutes');
$$;

/*
 * Book a meeting. Locks each host (in a fixed order, so two bookings can't deadlock), then refuses:
 *   link_used  a single-use or one-off link that already booked;
 *   full       a group start with every seat taken;
 *   slot_taken any held meeting of these hosts overlapping the new one's block (buffers included). A group meeting
 *              of the same type at the same start is the seat itself, not an overlap.
 * Writes the meeting, its first event, the contact's timeline line, and marks the link used.
 */
create or replace function public.meeting_book(
  p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz,
  p_guest jsonb, p_source text, p_token_hash text, p_status text default 'booked', p_contact uuid default null, p_submission uuid default null,
  p_link uuid default null, p_seats int default 0, p_rr boolean default false, p_location jsonb default '{}', p_booked_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
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

-- A line on the contact's timeline for a meeting.
create or replace function public.meeting_timeline(p_meeting uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
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

-- Move a meeting to a new time (and hosts), with the same locks and overlap check, leaving itself out.
create or replace function public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz) returns void
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  h uuid;
begin
  foreach h in array (select array_agg(x order by x) from unnest(p_hosts) x) loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-host:' || h::text, 0));
  end loop;
  select * into m from meetings where id = p_id for update;
  if m.id is null or m.status <> 'booked' then raise exception 'not_movable'; end if;
  if exists (
    select 1 from meetings x
    where x.workspace_id = m.workspace_id and x.id <> m.id and x.hosts && p_hosts and meeting_holds(x)
      and tstzrange(x.block_start, x.block_end) && tstzrange(p_block_start, p_block_end)
  ) then
    raise exception 'slot_taken';
  end if;
  update meetings set hosts = p_hosts, start_at = p_start, end_at = p_end, block_start = p_block_start, block_end = p_block_end, updated_at = now() where id = p_id;
  insert into meeting_events (meeting_id, kind, detail) values (p_id, 'moved', jsonb_build_object('from', m.start_at, 'to', p_start, 'hosts', p_hosts));
  perform meeting_timeline(p_id, 'meeting.rescheduled');
end;
$$;

/*
 * Change a meeting's status. booked → canceled, held or no_show; pending_payment → booked (paid) or canceled;
 * held and no_show can swap (a host fixing a click). A canceled or no-show meeting stops counting as a round-robin
 * turn, because rr_turns only counts booked and held.
 */
create or replace function public.meeting_status(p_id uuid, p_status text, p_reason text default null, p_by uuid default null) returns void
language plpgsql security definer set search_path = public as $$
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

-- Round-robin turns for a type over the last 30 days: booked and held meetings count; canceled and no-shows give
-- the turn back.
create or replace function public.rr_turns(p_type uuid) returns table (user_id uuid, n int, last timestamptz)
language sql stable security definer set search_path = public as $$
  select h, count(*)::int, max(m.created_at)
  from meetings m, unnest(m.hosts) h
  where m.type_id = p_type and m.rr and m.status in ('booked', 'held') and m.created_at > now() - interval '30 days'
  group by h;
$$;

-- Replace a calendar's busy times over a span with what the provider says now.
create or replace function public.busy_replace(p_account uuid, p_calendar text, p_from timestamptz, p_to timestamptz, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
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

-- What the slot engine needs for some hosts over a span, in one read: hours, calendar state, busy times from the
-- calendars that count, and held meetings (from a week before, for the weekly caps).
create or replace function public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamptz, p_to timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u,
    'availability', (select jsonb_build_object('tz', a.tz, 'weekly', a.weekly, 'overrides', a.overrides) from availability a where a.workspace_id = p_ws and a.user_id = u),
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

-- A workspace's booking slug, made from its name the first time it's asked for.
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
  while exists (select 1 from workspaces where booking_slug = s) loop
    i := i + 1;
    s := base || '-' || i;
  end loop;
  update workspaces set booking_slug = s where id = p_ws;
  return s;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'meeting_holds(meetings)',
    'meeting_book(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, text, text, uuid, uuid, uuid, int, boolean, jsonb, uuid)',
    'meeting_timeline(uuid, text)', 'meeting_move(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz)', 'meeting_status(uuid, text, text, uuid)',
    'rr_turns(uuid)', 'busy_replace(uuid, text, timestamptz, timestamptz, jsonb)', 'booking_slug_ensure(uuid)', 'meeting_inputs(uuid, uuid[], timestamptz, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
