-- Sending as a product (docs/email-platform-plan.md phase 2, docs/ses-plan.md): a monthly limit on workflow and
-- campaign emails for each plan, a counter, and a guard for hard bounces next to the one for complaints (039).
--   plan_sends         emails a month by plan: Free 1,000, Starter 10,000, Pro 50,000, Business 200,000.
--   plan_usage.sends   counted once per message, when it turns 'sent' (a retried send_done changes nothing).
--   send_month_room    what's left this month: the plan's emails, minus this month's, minus those being sent now.
--   send_claim         past the limit, claims nothing: messages stay queued, never skipped or failed, and go when
--                      the month turns or the workspace upgrades.
--   sends_due          doesn't wake a workspace with no room left.
--   bounces_check      pauses sending when hard bounces reach 5% of 7 days' sends (200 or more sent), or 50 land in
--                      a day. Settings › Sending shows the reason and Resume, as for complaints.
--   plan_status        adds sends and sends_cap for Settings › Billing.
-- Meeting emails, alerts and form auto-replies don't count: they're part of forms and meetings.

create or replace function public.plan_sends(p_plan text) returns int
language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 10000 when 'pro' then 50000 when 'business' then 200000 else 1000 end;
$$;

alter table public.plan_usage add column if not exists sends int not null default 0 check (sends >= 0);

create or replace function public.email_message_counted() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into plan_usage (workspace_id, month, sends)
  values (new.workspace_id, date_trunc('month', coalesce(new.sent_at, now()))::date, 1)
  on conflict (workspace_id, month) do update set sends = plan_usage.sends + 1;
  return null;
end;
$$;
drop trigger if exists email_messages_counted on public.email_messages;
create trigger email_messages_counted after update of status on public.email_messages
  for each row when (new.status = 'sent' and old.status is distinct from 'sent')
  execute function public.email_message_counted();

create or replace function public.send_month_room(p_ws uuid) returns int
language sql stable security definer set search_path = public as $$
  select plan_sends(workspace_plan(p_ws))
    - coalesce((select sends from plan_usage where workspace_id = p_ws and month = plan_month()), 0)
    - (select count(*)::int from email_messages where workspace_id = p_ws and status = 'sending');
$$;

create or replace function public.send_claim(p_ws uuid, p_limit int default 14) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s send_settings;
  room int;
  m record;
  g jsonb;
  out jsonb := '[]';
  d sending_domains;
  tries int;
begin
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where workspace_id = p_ws and status = 'sending' and claimed_at < now() - interval '10 minutes';

  select * into s from send_settings where workspace_id = p_ws;
  if s.workspace_id is null or s.paused then return out; end if;
  room := s.per_day - (select count(*) from email_messages where workspace_id = p_ws and sent_at > now() - interval '1 day');
  -- The plan's emails this month: past it, messages stay queued (never skipped) until the month turns or an upgrade.
  room := least(room, coalesce(send_month_room(p_ws), room));
  if room <= 0 then return out; end if;

  for m in
    select x.id, x.to_email, x.contact_id, x.email_id, x.vars, x.from_name, x.reply_to, x.sender_user from email_messages x
    where x.workspace_id = p_ws and x.status = 'queued' and x.send_after <= now()
    order by x.send_after, x.id
    limit least(greatest(coalesce(p_limit, 14), 1), room, 200)
    for update skip locked
  loop
    g := email_guard(m.id);
    if g is null then
      update email_messages set status = 'sending', claimed_at = now(), attempts = attempts + 1 where id = m.id returning attempts into tries;
      select * into d from verified_domain_for(p_ws, coalesce((select from_email from emails where id = m.email_id), s.from_email));
      out := out || jsonb_build_array((
        select jsonb_build_object(
          'id', m.id, 'to', m.to_email, 'contact_id', m.contact_id, 'email_id', e.id, 'kind', e.kind, 'marketing', e.marketing,
          'subject', e.subject, 'preheader', e.preheader, 'html', e.html, 'text', e.text, 'links', to_jsonb(e.links),
          'from_name', coalesce(m.from_name, e.from_name, s.from_name), 'from_email', coalesce(e.from_email, s.from_email),
          'reply_to', coalesce(m.reply_to, s.reply_to), 'address', s.address, 'topic', (select name from topics where id = e.topic_id),
          'mail_from', d.mail_from, 'per_second', s.per_second, 'attempts', tries, 'vars', m.vars, 'sender_user', m.sender_user)
        from emails e where e.id = m.email_id));
    elsif g->>'reason' = 'quiet' then
      update email_messages set send_after = (g->>'retry_at')::timestamptz where id = m.id;
    else
      update email_messages set status = 'skipped', skip_reason = g->>'reason' where id = m.id;
    end if;
  end loop;
  return out;
end;
$$;

create or replace function public.sends_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct x.workspace_id from email_messages x
    join send_settings s on s.workspace_id = x.workspace_id and not s.paused
    where x.status = 'queued' and x.send_after <= now() and coalesce(send_month_room(x.workspace_id), 1) > 0
    limit 500
  loop
    perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3);
    n := n + 1;
  end loop;
  -- Stuck sends in paused or idle workspaces still turn 'unknown'.
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where status = 'sending' and claimed_at < now() - interval '10 minutes';
  return n;
end;
$$;

create or replace function public.bounces_check(p_ws uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  sent int;
  bad int;
  day_bad int;
begin
  select count(*) into sent from email_messages where workspace_id = p_ws and sent_at > now() - interval '7 days';
  select count(*) into bad from email_events where workspace_id = p_ws and kind = 'bounced' and data->>'bounce' = 'hard' and at > now() - interval '7 days';
  select count(*) into day_bad from email_events where workspace_id = p_ws and kind = 'bounced' and data->>'bounce' = 'hard' and at > now() - interval '1 day';
  if (sent >= 200 and bad * 100 >= sent * 5) or day_bad >= 50 then
    update send_settings set paused = true, paused_at = now(),
      paused_reason = format('Hard bounces reached %s of %s sent in 7 days', bad, sent)
    where workspace_id = p_ws and not paused;
    if found then
      insert into audit_log (workspace_id, action, target, data) values (p_ws, 'sending.paused', p_ws::text, jsonb_build_object('bounces', bad, 'sent', sent));
    end if;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.email_event_bounce_check() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform bounces_check(new.workspace_id);
  return null;
end;
$$;
drop trigger if exists email_events_bounce_check on public.email_events;
create trigger email_events_bounce_check after insert on public.email_events
  for each row when (new.kind = 'bounced' and new.data->>'bounce' = 'hard')
  execute function public.email_event_bounce_check();

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
    'sends', coalesce(u.sends, 0),
    'sends_cap', plan_sends(p),
    'month', plan_month()
  );
end;
$$;

do $$
begin
  execute 'revoke execute on function public.email_message_counted() from public, anon, authenticated';
  execute 'revoke execute on function public.email_event_bounce_check() from public, anon, authenticated';
  execute 'revoke execute on function public.send_month_room(uuid) from public, anon, authenticated';
  execute 'revoke execute on function public.bounces_check(uuid) from public, anon, authenticated';
  execute 'grant execute on function public.send_month_room(uuid) to service_role';
  execute 'grant execute on function public.bounces_check(uuid) to service_role';
  execute 'grant execute on function public.plan_sends(text) to authenticated, service_role';
  execute 'revoke execute on function public.plan_status(uuid) from public, anon';
  execute 'grant execute on function public.plan_status(uuid) to authenticated, service_role';
end;
$$;
