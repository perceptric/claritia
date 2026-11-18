-- Getting-started emails (src/lib/tips/send.ts, docs/getting-started-emails.md): a short run of emails in a new
-- workspace's first weeks, sent to the person who made it.
--   workspace_members.tips  each person can turn them off (Settings › Profile, or the link in each email)
--   tips_log                which email went to whom, so nothing sends twice; only the server reads and writes it
--   last_seen               when a person last used the app, from their newest sign-in session; the server only
--   tips_get, tips_set      the Settings switch, for the signed-in person
-- Safe to run twice.

alter table public.workspace_members add column if not exists tips boolean not null default true;

create table if not exists public.tips_log (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  step text not null check (step ~ '^[a-z]{2,20}$'),
  -- 'once', or the window an email that can repeat belongs to (the month for the limit email).
  period text not null default 'once' check (length(period) <= 20),
  sent_at timestamptz not null default now(),
  primary key (workspace_id, user_id, step, period)
);
alter table public.tips_log enable row level security;
revoke all on public.tips_log from anon, authenticated;

-- The newest sign-in session's last refresh (the app refreshes it about every hour while it's open), else the last
-- sign-in. Null when neither is known.
create or replace function public.last_seen(p_user uuid) returns timestamptz
language plpgsql stable security definer set search_path = '' as $fn$
declare
  t timestamptz;
begin
  begin
    execute 'select max(greatest(s.created_at, s.updated_at, s.refreshed_at::timestamptz)) from auth.sessions s where s.user_id = $1'
      into t using p_user;
  exception when others then
    t := null;
  end;
  if t is null then
    select u.last_sign_in_at into t from auth.users u where u.id = p_user;
  end if;
  return t;
end;
$fn$;

-- The Settings switch: whether you get getting-started tips in this workspace.
create or replace function public.tips_get(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select m.tips from workspace_members m where m.workspace_id = p_ws and m.user_id = auth.uid();
$fn$;

create or replace function public.tips_set(p_ws uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $fn$
begin
  update workspace_members set tips = coalesce(p_on, true) where workspace_id = p_ws and user_id = auth.uid();
  if not found then raise exception 'Workspace not found'; end if;
  return coalesce(p_on, true);
end;
$fn$;

revoke execute on function public.last_seen(uuid) from public, anon, authenticated;
grant execute on function public.last_seen(uuid) to service_role;
revoke execute on function public.tips_get(uuid) from public, anon;
grant execute on function public.tips_get(uuid) to authenticated;
revoke execute on function public.tips_set(uuid, boolean) from public, anon;
grant execute on function public.tips_set(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
