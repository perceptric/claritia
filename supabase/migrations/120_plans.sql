-- Plans for forms, meetings and workflows (docs/pricing.md): Free, Starter, Pro and Business, each with 1 host in its
-- price and a price for each extra host. The numbers mirror src/lib/plans.ts; change both together.
--   workspace_billing  plan ids free, starter, pro, business ("team" became pro), the billing interval, the hosts
--                      Stripe bills for. Only the server writes it (the Stripe webhook and checkout).
--   plan_caps          submissions and AI credits a month, calendars per host and active meeting types, by plan.
--   plan_usage         this month's submissions and AI credits, one row a workspace a month. Counts reset on the 1st.
--   submissions        a fill past Free's 250 in a month is saved and marked over_cap; its answers stay hidden until
--                      the workspace upgrades (or the month turns). Counted once, after the insert, so a repeated
--                      send (the idempotency key) or a spam or test fill never counts.
--   ai_credit_take     takes a Tia step's credits before the model is called, or refuses when the month's are used.
--   plan_hosts         the people anyone can book: hosts of active meeting types and their owners.
--   plan_check_type    whether a meeting type fits the plan: its kind, the number of types and hosts on Free.
--   plan_check_calendar  whether one more calendar fits the person's plan.
--   plan_status        what Settings › Billing shows.

-- Billing -----------------------------------------------------------------------------------------------------------

alter table public.workspace_billing drop constraint if exists workspace_billing_plan_check;
update public.workspace_billing set plan = 'pro' where plan = 'team';
alter table public.workspace_billing add constraint workspace_billing_plan_check check (plan in ('free', 'starter', 'pro', 'business'));
alter table public.workspace_billing add column if not exists billing_interval text not null default 'month' check (billing_interval in ('month', 'year'));
alter table public.workspace_billing add column if not exists hosts int not null default 1 check (hosts between 1 and 10000);

create or replace function public.workspace_plan(p_ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select plan from workspace_billing where workspace_id = p_ws), 'free');
$$;

-- The testing product's limits (005, 016), on the new ids. Pro has what Team had.
create or replace function public.plan_limits(p_plan text, out projects int, out minutes int, out credits int)
language sql immutable set search_path = public as $$
  select case p_plan when 'free' then 1 when 'starter' then 3 else null end,
         case p_plan when 'free' then 300 when 'starter' then 2000 when 'pro' then 10000 when 'team' then 10000 else null end,
         case p_plan when 'free' then 200 when 'starter' then 2000 when 'pro' then 10000 when 'team' then 10000 else null end;
$$;

-- What each plan includes. Null means no limit.
create or replace function public.plan_caps(p_plan text, out submissions int, out ai_credits int, out calendars int, out meeting_types int)
language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 2000 when 'pro' then 5000 when 'business' then null else 250 end,
         case p_plan when 'starter' then 500 when 'pro' then 2000 when 'business' then 5000 else 100 end,
         case p_plan when 'starter' then 3 when 'pro' then 10 when 'business' then null else 1 end,
         case p_plan when 'starter' then null when 'pro' then null when 'business' then null else 1 end;
$$;

-- Usage ---------------------------------------------------------------------------------------------------------------

create table if not exists public.plan_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  submissions int not null default 0 check (submissions >= 0),
  ai_credits int not null default 0 check (ai_credits >= 0),
  primary key (workspace_id, month)
);
alter table public.plan_usage enable row level security;
drop policy if exists "members read" on public.plan_usage;
create policy "members read" on public.plan_usage for select using (is_member(workspace_id));
revoke all on public.plan_usage from anon;
revoke insert, update, delete on public.plan_usage from authenticated;

create or replace function public.plan_month() returns date
language sql stable set search_path = public as $$
  select date_trunc('month', now())::date;
$$;

-- Submissions: counted once each, after the insert --------------------------------------------------------------------

alter table public.submissions add column if not exists over_cap boolean not null default false;

-- A real fill (not spam, not a test) counts when it's saved, or when a member lets a held one through. The row lock on
-- the month's usage row puts two fills racing for the last free slot in line: both save, exactly one counts under
-- the cap.
create or replace function public.submissions_count() returns trigger
language plpgsql security definer set search_path = public as $$
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
drop trigger if exists submissions_count on public.submissions;
create trigger submissions_count after insert or update of spam on public.submissions
  for each row execute function public.submissions_count();

-- An upgrade shows every hidden answer.
create or replace function public.billing_plan_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if NEW.plan <> 'free' and (TG_OP = 'INSERT' or OLD.plan is distinct from NEW.plan) then
    update submissions set over_cap = false where workspace_id = NEW.workspace_id and over_cap;
  end if;
  return null;
end;
$$;
drop trigger if exists billing_plan_changed on public.workspace_billing;
create trigger billing_plan_changed after insert or update of plan on public.workspace_billing
  for each row execute function public.billing_plan_changed();

-- AI credits ------------------------------------------------------------------------------------------------------------

-- Take a step's credits, or refuse when they'd pass the month's. The update re-checks the sum under the row lock,
-- so two steps racing for the last credits never both get them.
create or replace function public.ai_credit_take(p_ws uuid, p_n int) returns boolean
language plpgsql security definer set search_path = public as $$
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

-- Give credits back when the model call failed after they were taken.
create or replace function public.ai_credit_give(p_ws uuid, p_n int) returns void
language sql security definer set search_path = public as $$
  update plan_usage set ai_credits = greatest(0, ai_credits - greatest(coalesce(p_n, 0), 0))
  where workspace_id = p_ws and month = plan_month();
$$;

-- Hosts and meeting types ---------------------------------------------------------------------------------------------

-- The hosts of a set of meeting types: each host entry's user, and the type's owner.
create or replace function public.plan_type_hosts(p_hosts jsonb, p_owner uuid) returns setof uuid
language sql immutable set search_path = public as $$
  select (h ->> 'user_id')::uuid from jsonb_array_elements(case when jsonb_typeof(p_hosts) = 'array' then p_hosts else '[]' end) h
  where h ->> 'user_id' ~ '^[0-9a-f-]{36}$'
  union select p_owner where p_owner is not null;
$$;

-- The people anyone can book now.
create or replace function public.plan_hosts(p_ws uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(distinct u)::int from meeting_types t, lateral plan_type_hosts(t.hosts, t.owner_user_id) u
  where t.workspace_id = p_ws and t.active;
$$;

-- Whether saving this meeting type (new when p_id is null) fits the plan. Null when it does, else the line to show.
create or replace function public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
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
    if n_hosts > 1 then return 'Free has 1 host. Upgrade to add more.'; end if;
  end if;
  return null;
end;
$$;

-- Whether one more calendar fits: a reconnect of the same account always does. Zoom isn't a calendar.
create or replace function public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
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
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Your plan has %s calendars for each host. Upgrade to add more.', cap) end;
  end if;
  return null;
end;
$$;

-- Settings › Billing ----------------------------------------------------------------------------------------------------

create or replace function public.plan_status(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
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

-- Who may call what -----------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['workspace_plan(uuid)', 'ai_credit_take(uuid, int)', 'ai_credit_give(uuid, int)', 'plan_hosts(uuid)',
    'plan_check_type(uuid, uuid, jsonb)', 'plan_check_calendar(uuid, uuid, text, text)', 'submissions_count()', 'billing_plan_changed()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke execute on function public.plan_status(uuid) from public, anon';
  execute 'grant execute on function public.plan_status(uuid) to authenticated, service_role';
end;
$$;
