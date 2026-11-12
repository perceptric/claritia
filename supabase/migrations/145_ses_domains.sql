-- Customer sending domains on Amazon SES (docs/ses-plan.md, Steps 3 and 4). A domain sends through the provider its
-- row names. A new domain is made on SES when the worker has EMAIL_SES_MOVE=1; an existing one moves with "Move to
-- the new sending" in Settings › Sending: its five SES records show beside the Resend ones, it keeps sending on Resend
-- until SES verifies them, then provider flips to 'ses' in one update. Both sets of records live side by side, so a
-- domain can go back to Resend in one update until Resend is turned off.
--   sending_domains.provider      'resend' or 'ses': which provider sends this domain's mail now.
--   sending_domains.ses_status    null (not on SES), pending, verified or failed.
--   sending_domains.ses_records   the SES records with their state: three DKIM CNAMEs, MX and SPF on ses_mail_from,
--                                 DMARC.
--   sending_domains.ses_mail_from bounce.<domain>: SES's return path (mail.<domain> is often the team's own mail server).
--   sending_domain_move           the owner starts a move; the check runs at once.
--   sending_domain_ses_update     the worker's answer; the flip to SES happens only with ses_status 'verified'.
--   send_claim                    tells the worker each message's provider: SES only while the domain's SES records
--                                 check out, else Resend (still verified there until Resend is turned off).
--   domain_checks_due             checks a move every 10 minutes until it's done.

alter table public.sending_domains add column if not exists provider text not null default 'resend' check (provider in ('resend', 'ses'));
alter table public.sending_domains add column if not exists ses_status text check (ses_status in ('pending', 'verified', 'failed'));
alter table public.sending_domains add column if not exists ses_records jsonb not null default '[]' check (jsonb_typeof(ses_records) = 'array');
alter table public.sending_domains add column if not exists ses_mail_from text check (length(ses_mail_from) <= 260);
alter table public.sending_domains add column if not exists ses_error text check (length(ses_error) <= 500);

create or replace function public.sending_domain_move(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains;
begin
  select * into d from sending_domains where id = p_id;
  if d.id is null or not is_owner(d.workspace_id) then raise exception 'Only the workspace owner can move a sending domain'; end if;
  if d.provider = 'ses' then return; end if;
  update sending_domains set ses_status = coalesce(ses_status, 'pending'), ses_mail_from = coalesce(ses_mail_from, 'bounce.' || d.domain), ses_error = null where id = p_id;
  perform enqueue_job(d.workspace_id, 'domain_check', p_id::text, jsonb_build_object('domain_id', p_id), 0, 5);
  insert into audit_log (workspace_id, actor, action, target) values (d.workspace_id, auth.uid(), 'sending.domain_move', d.domain);
end;
$$;

-- The worker's answer for SES. With 'verified' the domain sends on SES from now on; a domain that was never on Resend
-- (made on SES) also opens for sending.
create or replace function public.sending_domain_ses_update(p_id uuid, p_records jsonb, p_status text, p_mail_from text, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains;
begin
  if p_status not in ('pending', 'verified', 'failed') then raise exception 'Bad status'; end if;
  select * into d from sending_domains where id = p_id for update;
  if d.id is null then return; end if;
  update sending_domains set
    ses_status = p_status,
    ses_records = coalesce(p_records, ses_records),
    ses_mail_from = coalesce(p_mail_from, ses_mail_from),
    ses_error = left(p_error, 500),
    checked_at = now(),
    provider = case when p_status = 'verified' then 'ses' else provider end,
    status = case when d.provider_id is null then p_status else status end,
    records = case when d.provider_id is null then coalesce(p_records, records) else records end,
    verified_at = case when d.provider_id is null and p_status = 'verified' then coalesce(verified_at, now()) else verified_at end
  where id = p_id;
  if p_status = 'verified' and d.provider is distinct from 'ses' then
    insert into audit_log (workspace_id, action, target) values (d.workspace_id, 'sending.domain_on_ses', d.domain);
  end if;
end;
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
          'mail_from', d.mail_from, 'provider', case when d.provider = 'ses' and d.ses_status = 'verified' then 'ses' else 'resend' end, 'per_second', s.per_second, 'attempts', tries, 'vars', m.vars, 'sender_user', m.sender_user)
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

create or replace function public.domain_checks_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, workspace_id from sending_domains
    where (status <> 'verified' and created_at > now() - interval '3 days' and coalesce(checked_at, created_at) < now() - interval '10 minutes')
       or (status <> 'verified' and created_at <= now() - interval '3 days' and coalesce(checked_at, created_at) < now() - interval '1 hour')
       or (status = 'verified' and coalesce(checked_at, created_at) < now() - interval '1 day')
       or (ses_status = 'pending' and coalesce(checked_at, created_at) < now() - interval '10 minutes')
    order by checked_at nulls first
    limit 200
  loop
    perform enqueue_job(r.workspace_id, 'domain_check', r.id::text, jsonb_build_object('domain_id', r.id), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

do $$
begin
  execute 'revoke execute on function public.sending_domain_move(uuid) from public, anon';
  execute 'grant execute on function public.sending_domain_move(uuid) to authenticated, service_role';
  execute 'revoke execute on function public.sending_domain_ses_update(uuid, jsonb, text, text, text) from public, anon, authenticated';
  execute 'grant execute on function public.sending_domain_ses_update(uuid, jsonb, text, text, text) to service_role';
end;
$$;
