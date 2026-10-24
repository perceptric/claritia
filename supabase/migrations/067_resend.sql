-- All email on Resend (docs/enrich-workflows-reports.md Part 0). Campaign email goes through Resend's API, meeting and
-- routing email through its SMTP relay, and Resend's signed webhook reports what happened. Amazon SES is gone.
--   sending_domains: Resend's domain id. DKIM and the return path now come from Resend's records (send.<domain>).
--   email_messages.provider_id: Resend's email id (was the SES message id).
--   email_events.event_id: the webhook delivery id (svix-id), so a redelivered event counts once (was the SNS id).
--   send_done: a "later" answer (rate limit) goes back in line without using a try; the worker's delay is kept.
--   send_claim: hands the worker each message's tries, so a message tried before is sent alone with its own key.
--   email_event_apply replaces ses_event_apply with the same rules.
--   meeting_mail_event: finds the meeting email by Resend's id, or by its address when the SMTP answer had no id.
-- Production had no sending domains or sent email when this ran, so nothing moves between providers.

-- Domains ---------------------------------------------------------------------------------------------------------

alter table public.sending_domains add column if not exists provider_id text unique check (length(provider_id) <= 100);
comment on column public.sending_domains.mail_from is 'The return path Resend sends bounces to: send.<domain>.';
comment on column public.sending_domains.dkim_tokens is 'SES only; no longer written.';
update public.sending_domains set mail_from = 'send.' || domain where mail_from like 'bounce.%';

create or replace function public.sending_domain_add(p_ws uuid, p_domain text) returns sending_domains
language plpgsql security definer set search_path = public as $$
declare
  d text := lower(trim(both '.' from trim(coalesce(p_domain, ''))));
  made sending_domains;
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can add a sending domain'; end if;
  if d !~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' or length(d) > 240 then raise exception 'Not a domain: %', p_domain; end if;
  if (select count(*) from sending_domains where workspace_id = p_ws) >= 20 then raise exception 'Up to 20 sending domains'; end if;
  if exists (select 1 from sending_domains where domain = d) then raise exception 'That domain is already added to a workspace'; end if;
  insert into sending_domains (workspace_id, domain, mail_from, tracking_host, created_by)
  values (p_ws, d, 'send.' || d, 't.' || d, auth.uid())
  returning * into made;
  perform send_settings_of(p_ws);
  perform enqueue_job(p_ws, 'domain_check', made.id::text, jsonb_build_object('domain_id', made.id), 0, 5);
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'sending.domain_add', d);
  return made;
end;
$$;

-- Removing a domain leaves it in Resend for the worker to delete (domain_remove job).
create or replace function public.sending_domain_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains;
begin
  select * into d from sending_domains where id = p_id;
  if d.id is null or not is_owner(d.workspace_id) then raise exception 'Domain not found'; end if;
  delete from sending_domains where id = p_id;
  perform enqueue_job(d.workspace_id, 'domain_remove', d.domain, jsonb_strip_nulls(jsonb_build_object('domain', d.domain, 'provider_id', d.provider_id)), 0, 5);
  insert into audit_log (workspace_id, actor, action, target) values (d.workspace_id, auth.uid(), 'sending.domain_remove', d.domain);
end;
$$;

drop function if exists public.sending_domain_update(uuid, text[], jsonb, text, text);
create or replace function public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('pending', 'verified', 'failed') then raise exception 'Bad status'; end if;
  update sending_domains set
    provider_id = coalesce(p_provider_id, provider_id),
    records = coalesce(p_records, records),
    status = p_status,
    error = left(p_error, 500),
    checked_at = now(),
    verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else null end
  where id = p_id;
end;
$$;

-- Messages and events ---------------------------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_messages' and column_name = 'ses_message_id') then
    alter table public.email_messages rename column ses_message_id to provider_id;
  end if;
  if exists (select 1 from pg_constraint where conname = 'email_messages_ses_message_id_key') then
    alter table public.email_messages rename constraint email_messages_ses_message_id_key to email_messages_provider_id_key;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'email_events' and column_name = 'sns_id') then
    alter table public.email_events rename column sns_id to event_id;
  end if;
  if exists (select 1 from pg_constraint where conname = 'email_events_sns_id_key') then
    alter table public.email_events rename constraint email_events_sns_id_key to email_events_event_id_key;
  end if;
  if exists (select 1 from pg_constraint where conname = 'email_events_sns_id_check') then
    alter table public.email_events rename constraint email_events_sns_id_check to email_events_event_id_check;
  end if;
end;
$$;

-- The worker's view of one message now carries its tries (this one included).
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
  if room <= 0 then return out; end if;

  for m in
    select x.id, x.to_email, x.contact_id, x.email_id from email_messages x
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
          'from_name', coalesce(e.from_name, s.from_name), 'from_email', coalesce(e.from_email, s.from_email),
          'reply_to', s.reply_to, 'address', s.address, 'topic', (select name from topics where id = e.topic_id),
          'mail_from', d.mail_from, 'per_second', s.per_second, 'attempts', tries)
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

-- The worker's answer for one message.
--   ok: Resend took it.
--   later: Resend said not now (rate limit) and sent nothing; it goes back in line after the delay, and the try
--          doesn't count.
--   retry: a server error or a timeout on a keyed single send; safe to repeat, up to 3 tries.
--   unknown: no clear answer and no key to protect a repeat; never resent.
--   anything else: failed for good.
drop function if exists public.send_done(uuid, text, text, text);
create or replace function public.send_done(p_id uuid, p_outcome text, p_provider_id text default null, p_error text default null, p_delay_s int default 60) returns void
language plpgsql security definer set search_path = public as $$
declare
  m email_messages;
  delay int := least(greatest(coalesce(p_delay_s, 60), 1), 3600);
begin
  select * into m from email_messages where id = p_id for update;
  if m.id is null or m.status <> 'sending' then return; end if;
  if p_outcome = 'ok' then
    update email_messages set status = 'sent', sent_at = now(), provider_id = nullif(p_provider_id, ''), error = null where id = p_id;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.sent', jsonb_build_object('email_id', m.email_id, 'message_id', m.id), 'email');
    end if;
  elsif p_outcome = 'later' then
    update email_messages set status = 'queued', claimed_at = null, attempts = greatest(attempts - 1, 0), error = left(p_error, 500), send_after = now() + make_interval(secs => delay) where id = p_id;
  elsif p_outcome = 'retry' and m.attempts < 3 then
    update email_messages set status = 'queued', claimed_at = null, error = left(p_error, 500), send_after = now() + make_interval(secs => greatest(60 * m.attempts, delay)) where id = p_id;
  elsif p_outcome = 'unknown' then
    update email_messages set status = 'unknown', error = left(coalesce(p_error, 'No clear answer from Resend'), 500) where id = p_id;
  else
    update email_messages set status = 'failed', error = left(coalesce(p_error, 'Failed'), 500) where id = p_id;
  end if;
end;
$$;

-- One Resend event, already checked (signature and age) and parsed by the route:
-- {event_id, provider_id, kind: delivered | bounced | complained | rejected | delayed, bounce: hard | soft, to, at, detail}
drop function if exists public.ses_event_apply(jsonb);
create or replace function public.email_event_apply(p_event jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  m email_messages;
  k text := p_event->>'kind';
  at_ timestamptz := coalesce((p_event->>'at')::timestamptz, now());
  soft int;
begin
  if k not in ('delivered', 'bounced', 'complained', 'rejected', 'delayed') then return 'ignored'; end if;
  if coalesce(p_event->>'provider_id', '') = '' then return 'unknown_message'; end if;
  select * into m from email_messages where provider_id = p_event->>'provider_id' for update;
  if m.id is null then return 'unknown_message'; end if;
  begin
    insert into email_events (workspace_id, message_id, kind, data, event_id, at)
    values (m.workspace_id, m.id, k, coalesce(p_event->'detail', '{}') || jsonb_strip_nulls(jsonb_build_object('bounce', p_event->>'bounce')), p_event->>'event_id', at_);
  exception when unique_violation then
    return 'duplicate';
  end;

  if k = 'delivered' then
    -- A late "delivered" never undoes a bounce or a complaint.
    update email_messages set status = case when status = 'sent' then 'delivered' else status end, delivered_at = coalesce(delivered_at, at_) where id = m.id;
  elsif k = 'rejected' then
    update email_messages set status = case when status in ('sent', 'delivered') then 'rejected' else status end where id = m.id;
  elsif k = 'bounced' then
    update email_messages set status = case when status = 'complained' then status else 'bounced' end, bounced = coalesce(p_event->>'bounce', 'hard') where id = m.id;
    if coalesce(p_event->>'bounce', 'hard') = 'hard' then
      perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'bounced')));
    else
      select count(*) into soft from email_events v join email_messages vm on vm.id = v.message_id
      where v.workspace_id = m.workspace_id and v.kind = 'bounced' and v.data->>'bounce' = 'soft'
        and lower(vm.to_email) = lower(m.to_email) and v.at > now() - interval '30 days';
      if soft >= 3 then
        perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'bounced')));
      end if;
    end if;
  elsif k = 'complained' then
    update email_messages set status = 'complained', complained_at = coalesce(complained_at, at_) where id = m.id;
    perform suppress(m.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', lower(m.to_email), 'reason', 'complained')));
    if m.contact_id is not null then
      insert into consents (workspace_id, contact_id, channel, basis, status, source)
      select m.workspace_id, m.contact_id, 'email', coalesce(c.basis, 'opt_in'), 'withdrawn', 'complaint'
      from (select (select basis from consents where contact_id = m.contact_id and channel = 'email' and basis <> 'none' order by at desc limit 1) as basis) c;
    end if;
    perform complaints_check(m.workspace_id);
  end if;

  if m.contact_id is not null and k in ('delivered', 'bounced', 'complained') then
    insert into contact_events (workspace_id, contact_id, kind, data, source, at)
    values (m.workspace_id, m.contact_id, 'email.' || k, jsonb_build_object('email_id', m.email_id, 'message_id', m.id), 'email', at_);
  end if;
  return 'ok';
end;
$$;

-- A bounce or complaint on a meeting or routing email. Found by Resend's id; when the SMTP answer gave no id, by the
-- address, but only when one workspace sent it a meeting email in the last 3 days (a complaint belongs to a
-- workspace, so a guess between two is never made).
create or replace function public.meeting_mail_event(p_event jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  r meeting_mails%rowtype;
  k text := p_event->>'kind';
  pid text := coalesce(p_event->>'provider_id', p_event->>'ses_message_id', '');
  addr text := lower(coalesce(p_event->>'to', ''));
  n int;
begin
  if k not in ('bounced', 'complained') then return 'ignored'; end if;
  if pid <> '' then
    select * into r from meeting_mails where provider_id = pid for update;
  end if;
  if r.id is null and addr <> '' then
    select count(distinct workspace_id) into n from meeting_mails where to_email = addr and created_at > now() - interval '3 days' and status = 'sent';
    if n = 1 then
      select * into r from meeting_mails where to_email = addr and created_at > now() - interval '3 days' and status = 'sent' order by created_at desc limit 1 for update;
    elsif n > 1 then
      return 'ambiguous';
    end if;
  end if;
  if r.id is null then return 'unknown_message'; end if;
  if k = 'bounced' then
    update meeting_mails set bounced = coalesce(p_event->>'bounce', 'hard') where id = r.id;
    if coalesce(p_event->>'bounce', 'hard') = 'hard' then
      perform suppress(r.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'bounced')));
    end if;
  else
    update meeting_mails set complained_at = coalesce(complained_at, now()) where id = r.id;
    perform suppress(r.workspace_id, 'email', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'complained')));
  end if;
  return 'meeting_mail';
end;
$$;

-- Grants ----------------------------------------------------------------------------------------------------------

revoke execute on function public.sending_domain_add(uuid, text) from public, anon;
revoke execute on function public.sending_domain_remove(uuid) from public, anon;
grant execute on function public.sending_domain_add(uuid, text) to authenticated;
grant execute on function public.sending_domain_remove(uuid) to authenticated;
revoke execute on function public.sending_domain_update(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.send_claim(uuid, int) from public, anon, authenticated;
revoke execute on function public.send_done(uuid, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.email_event_apply(jsonb) from public, anon, authenticated;
revoke execute on function public.meeting_mail_event(jsonb) from public, anon, authenticated;
grant execute on function public.sending_domain_update(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.send_claim(uuid, int) to service_role;
grant execute on function public.send_done(uuid, text, text, text, int) to service_role;
grant execute on function public.email_event_apply(jsonb) to service_role;
grant execute on function public.meeting_mail_event(jsonb) to service_role;
