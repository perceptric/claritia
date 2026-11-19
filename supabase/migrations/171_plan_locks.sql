-- Plan locks (docs/pricing.md Part 4; FEATURES, lockLine and toolFeature in src/lib/plans.ts). The app checks each
-- one before it saves and says why in one line; these hold the same lines in the database, so no route, job or older
-- server can get round them:
--   meeting_links      polls, one-off meetings and single-use links are on Starter and up.
--   sources            connecting a tool is on Starter and up (the webhook and Google Forms import on every plan),
--                      Salesforce on Business.
--   form_destinations  sending a form's leads to a tool or to Slack is on Starter and up, Salesforce on Business; a
--                      webhook on every plan.
-- Only new rows and reconnects are held: a workspace that moves to a lower plan keeps every link, tool, destination,
-- vote, fill and meeting it has, and can still delete them.
--   payment_account_disconnect  Settings › Integrations › Stripe › Disconnect: forgets the workspace's Stripe account
--                      and turns off the meeting types that take payment on it (they'd refuse every booking), in one
--                      transaction. Booked and paid meetings, and their payments, stay as they are.
-- Safe to run twice.

create or replace function public.plan_rank(p_plan text) returns int
language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 1 when 'pro' then 2 when 'team' then 2 when 'business' then 3 else 0 end;
$$;

-- The lowest plan for each lock the database holds (FEATURES in src/lib/plans.ts).
create or replace function public.plan_feature_rank(p_feature text) returns int
language sql immutable set search_path = public as $$
  select case p_feature
    when 'polls' then 1 when 'one_off' then 1 when 'single_use' then 1
    when 'integrations' then 1 when 'signatures' then 1 when 'form_payments' then 1
    when 'routing' then 2
    when 'salesforce' then 3
    else 0 end;
$$;

create or replace function public.plan_allows(p_ws uuid, p_feature text) returns boolean
language sql stable security definer set search_path = public as $$
  select plan_rank(workspace_plan(p_ws)) >= plan_feature_rank(p_feature);
$$;

-- The line the app shows (lockLine in src/lib/plans.ts), word for word.
create or replace function public.plan_line(p_feature text) returns text
language sql immutable set search_path = public as $$
  select case p_feature
    when 'polls' then 'Meeting polls are on Starter and up.'
    when 'one_off' then 'One-off meetings are on Starter and up.'
    when 'single_use' then 'Single-use links are on Starter and up.'
    when 'integrations' then 'Integrations are on Starter and up.'
    when 'signatures' then 'Signatures are on Starter and up.'
    when 'form_payments' then 'Payments on forms are on Starter and up.'
    when 'routing' then 'Routing by answer is on Pro and up.'
    when 'salesforce' then 'Salesforce is on Business.'
    else 'This is on a higher plan.' end;
$$;

-- The feature a tool needs (toolFeature in src/lib/plans.ts): null for the webhook and Google Forms import.
create or replace function public.plan_tool(p_kind text) returns text
language sql immutable set search_path = public as $$
  select case when p_kind is null or p_kind in ('api', 'google_forms') then null when p_kind = 'salesforce' then 'salesforce' else 'integrations' end;
$$;

-- Links and polls -------------------------------------------------------------------------------------------------

create or replace function public.meeting_links_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text := case NEW.kind when 'poll' then 'polls' when 'one_off' then 'one_off' when 'single_use' then 'single_use' end;
begin
  if f is not null and not plan_allows(NEW.workspace_id, f) then
    raise exception '%', plan_line(f);
  end if;
  return NEW;
end;
$$;

drop trigger if exists meeting_links_plan on public.meeting_links;
create trigger meeting_links_plan before insert on public.meeting_links
  for each row execute function public.meeting_links_plan();

-- Tools -----------------------------------------------------------------------------------------------------------

-- A new connection, a reconnect (source_connect's upsert comes in as an insert) or a disconnected tool turned back on.
create or replace function public.sources_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text := plan_tool(NEW.kind);
begin
  if f is null or NEW.status = 'disconnected' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.status <> 'disconnected' and OLD.kind = NEW.kind then return NEW; end if;
  if not plan_allows(NEW.workspace_id, f) then
    raise exception '%', plan_line(f);
  end if;
  return NEW;
end;
$$;

drop trigger if exists sources_plan on public.sources;
create trigger sources_plan before insert or update of status, kind on public.sources
  for each row execute function public.sources_plan();

-- A form's destinations: a tool or Slack. A change to an existing one's settings is left alone (the app holds those).
create or replace function public.form_destinations_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  f text;
  k text;
begin
  if NEW.kind = 'webhook' then return NEW; end if;
  if TG_OP = 'UPDATE' and OLD.kind = NEW.kind and OLD.source_id is not distinct from NEW.source_id then return NEW; end if;
  if NEW.kind = 'slack' then
    f := 'integrations';
  else
    select kind into k from sources where id = NEW.source_id;
    f := case when k is null then 'integrations' else plan_tool(k) end;
  end if;
  if f is not null and not plan_allows(NEW.workspace_id, f) then
    raise exception '%', plan_line(f);
  end if;
  return NEW;
end;
$$;

drop trigger if exists form_destinations_plan on public.form_destinations;
create trigger form_destinations_plan before insert or update of kind, source_id on public.form_destinations
  for each row execute function public.form_destinations_plan();

-- Stripe: Disconnect ----------------------------------------------------------------------------------------------

-- Forget the workspace's Stripe account and turn off its active meeting types that take payment on Stripe (a price
-- with no provider, or Stripe). PayPal and Square prices are left alone: they don't use this account. Answers the
-- account it forgot (null when none was connected, so a second call changes nothing) and the types turned off.
create or replace function public.payment_account_disconnect(p_ws uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  acct text;
  ids uuid[];
begin
  delete from payment_accounts where workspace_id = p_ws returning stripe_account into acct;
  with off as (
    update meeting_types set active = false, updated_at = now()
    where workspace_id = p_ws and active
      and jsonb_typeof(settings -> 'price') = 'object'
      and coalesce((settings -> 'price' ->> 'amount')::numeric, 0) > 0
      and coalesce(settings -> 'price' ->> 'provider', 'stripe') = 'stripe'
    returning id
  )
  select coalesce(array_agg(id), '{}') into ids from off;
  return jsonb_build_object('account', acct, 'types', to_jsonb(ids));
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['plan_allows(uuid, text)', 'meeting_links_plan()', 'sources_plan()', 'form_destinations_plan()', 'payment_account_disconnect(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
