-- After the submit, and forms a team already has (docs/form-builder.md Parts 8 and 9, week 11).
--   scheduler_links: each teammate's own booking link per tool, so a lead books with their owner.
--   form_bookings: meetings booked from a form on Calendly or Cal.com. A booking that comes back carrying its
--   submission's tracking id is linked for sure and lands on the contact's timeline; one that only matches by email
--   is kept as "email" (a maybe) and starts nothing (the CLAUDE.md rule on wrong links).
--   forms.kind: 'built' in Claritia, or 'captured' (the team's own form on their site, mapped to fields here).

alter table public.forms add column if not exists kind text not null default 'built' check (kind in ('built', 'captured'));

create table if not exists public.scheduler_links (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  tool text not null check (tool in ('calendly', 'calcom', 'hubspot_meetings', 'savvycal', 'link')),
  url text not null check (url ~ '^https://[^\s]+$' and length(url) <= 500),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, tool)
);
alter table public.scheduler_links enable row level security;
create policy "members read" on public.scheduler_links for select using (is_member(workspace_id));
revoke all on public.scheduler_links from anon;
revoke insert, update, delete on public.scheduler_links from authenticated;

create table if not exists public.form_bookings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  source_id uuid references public.sources (id) on delete set null,
  tool text not null check (length(tool) <= 40),
  external_id text not null check (length(external_id) between 1 and 300),
  start_at timestamptz,
  linked text not null check (linked in ('tracking', 'email', 'none')),
  created_at timestamptz not null default now(),
  unique (workspace_id, tool, external_id)
);
create index if not exists form_bookings_submission on public.form_bookings (submission_id) where submission_id is not null;
alter table public.form_bookings enable row level security;
create policy "members read" on public.form_bookings for select using (is_member(workspace_id));
revoke all on public.form_bookings from anon;
revoke insert, update, delete on public.form_bookings from authenticated;

-- A teammate sets their own link; owners set anyone's. An empty url removes it.
create or replace function public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
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
  insert into scheduler_links (workspace_id, user_id, tool, url) values (p_ws, p_user, p_tool, trim(p_url))
  on conflict (workspace_id, user_id, tool) do update set url = excluded.url, updated_at = now();
end;
$$;

-- Who books the meeting for a fill: the contact's owner's link for the tool, when the owner has one.
create or replace function public.scheduler_for(p_submission uuid, p_tool text) returns text
language sql stable security definer set search_path = public as $$
  select l.url from submissions s join contacts c on c.id = s.contact_id
  join scheduler_links l on l.workspace_id = s.workspace_id and l.user_id = c.owner_user_id and l.tool = p_tool
  where s.id = p_submission;
$$;

-- Bookings from a meeting tool's webhooks: [{ tool, id, start, tracking, email }]. Tracking "clr_<submission id>"
-- links for sure; otherwise the newest fill in 7 days by the same email is noted as a maybe.
create or replace function public.booking_record(p_source uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
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
$$;

do $$
declare
  f text;
begin
  foreach f in array array['scheduler_for(uuid, text)', 'booking_record(uuid, jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke execute on function public.scheduler_link_save(uuid, uuid, text, text) from public, anon';
  execute 'grant execute on function public.scheduler_link_save(uuid, uuid, text, text) to authenticated';
end;
$$;
