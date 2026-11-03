-- Per-seat pricing (docs/pricing.md, November 2026): every paid plan connects 6 calendar accounts per seat, as
-- Calendly does, and Free keeps 1. The other limits are unchanged from 120_plans.sql. A paid plan's calendar limit
-- is now the same on every plan, so its message no longer offers an upgrade.

create or replace function public.plan_caps(p_plan text, out submissions int, out ai_credits int, out calendars int, out meeting_types int)
language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 2000 when 'pro' then 5000 when 'business' then null else 250 end,
         case p_plan when 'starter' then 500 when 'pro' then 2000 when 'business' then 5000 else 100 end,
         case p_plan when 'starter' then 6 when 'pro' then 6 when 'business' then 6 else 1 end,
         case p_plan when 'starter' then null when 'pro' then null when 'business' then null else 1 end;
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
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Each seat can connect %s calendars.', cap) end;
  end if;
  return null;
end;
$$;

revoke execute on function public.plan_check_calendar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_check_calendar(uuid, uuid, text, text) to service_role;
