-- Plan limits say seats, the word the pricing page uses (docs/pricing.md): a seat is a teammate people can book.
-- Only the messages change; the checks are the same as in 120_plans.sql.

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
    if n_hosts > 1 then return 'Free has 1 seat. Upgrade to add more.'; end if;
  end if;
  return null;
end;
$$;

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
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Your plan has %s calendars for each seat. Upgrade to add more.', cap) end;
  end if;
  return null;
end;
$$;

revoke execute on function public.plan_check_type(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_check_type(uuid, uuid, jsonb) to service_role;
revoke execute on function public.plan_check_calendar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_check_calendar(uuid, uuid, text, text) to service_role;
