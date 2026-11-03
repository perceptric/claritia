-- Meeting emails and timed steps (docs/meetings-scheduler.md 1.7 and 2.4). The worker's meeting jobs
-- (worker-intel/jobs/meetings.ts) send them; this file keeps what they need to send each email once:
--   meetings.token_sealed: a sealed copy (AES-256-GCM, SECRETS_KEY) of the guest's manage token. Only its hash is
--           token_hash, so later emails (reminders, updates) couldn't carry the link without it.
--   meeting_mails: one row per email, keyed by a dedupe string (meeting, kind, time, recipient). A row is made before
--           the send and is never sent again once it may have gone out, so a job run twice sends one email.
--   meeting_outcome_uses: each "How did it go?" email's Held and No-show links work once.
--   meetings_auto_held: booked meetings still unmarked 24 hours after the end turn held, on their own cron entry
--           (claritia-meetings), so this file doesn't redefine minute_tick, which other migrations own.

alter table public.meetings add column if not exists token_sealed text check (length(token_sealed) <= 400);
create index if not exists meetings_booked_end on public.meetings (end_at) where status = 'booked';

create table if not exists public.meeting_mails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  meeting_id uuid references public.meetings (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  kind text not null check (kind in ('confirm', 'host_booked', 'update', 'host_moved', 'cancel', 'host_canceled', 'reminder', 'after', 'no_show', 'book_later')),
  to_email text not null check (length(to_email) <= 320),
  dedupe text not null check (length(dedupe) <= 300),
  -- sending: handed to the provider now, or the worker stopped mid-send (never sent again). retry: the provider said
  -- not now, so the job's next run sends it. unknown: no clear answer, never sent again. skipped: suppressed.
  status text not null default 'sending' check (status in ('sending', 'sent', 'retry', 'failed', 'unknown', 'skipped')),
  skip_reason text check (length(skip_reason) <= 40),
  error text check (length(error) <= 500),
  provider_id text check (length(provider_id) <= 200),
  attempts int not null default 1,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (workspace_id, dedupe)
);
create index if not exists meeting_mails_meeting on public.meeting_mails (meeting_id, created_at) where meeting_id is not null;
alter table public.meeting_mails enable row level security;
create policy "members read" on public.meeting_mails for select using (is_member(workspace_id));
revoke all on public.meeting_mails from anon;
revoke insert, update, delete on public.meeting_mails from authenticated;

create table if not exists public.meeting_outcome_uses (
  nonce text primary key check (nonce ~ '^[0-9a-f]{16}$'),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  status text not null check (status in ('held', 'no_show')),
  at timestamptz not null default now()
);
alter table public.meeting_outcome_uses enable row level security;
revoke all on public.meeting_outcome_uses from anon, authenticated;

-- Manage tokens ------------------------------------------------------------------------------------------------

-- Keep the sealed copy, right after booking, when the token is this meeting's and no copy is kept yet.
create or replace function public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update meetings set token_sealed = p_sealed where id = p_id and token_hash = p_hash and token_sealed is null;
  return found;
end;
$$;

-- A host's "send the link again" for a meeting with no usable copy (links.ts manageToken): a new token, once, only
-- while its hash is still the one the caller read. Returns the hash and copy as they are now, so a caller that lost
-- the race uses the winner's. Emails never call this: a new token would break the link the guest already has.
create or replace function public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
begin
  update meetings set token_hash = p_hash, token_sealed = p_sealed where id = p_id and token_hash = p_old;
  select jsonb_build_object('token_hash', token_hash, 'token_sealed', token_sealed) into r from meetings where id = p_id;
  return r;
end;
$$;

-- What the emails need -----------------------------------------------------------------------------------------

-- Names, sign-in emails and time zones for some workspace members, in the order given.
create or replace function public.meeting_people(p_ws uuid, p_users uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', x.u, 'name', coalesce(nullif(trim(bp.name), ''), split_part(usr.email, '@', 1)), 'email', lower(usr.email), 'tz', coalesce(a.tz, 'UTC')
  ) order by x.ord), '[]')
  from unnest(p_users) with ordinality x(u, ord)
  join auth.users usr on usr.id = x.u
  left join booking_profiles bp on bp.workspace_id = p_ws and bp.user_id = x.u
  left join availability a on a.workspace_id = p_ws and a.user_id = x.u;
$$;

-- Where meeting emails come from: the workspace's From address when its domain is verified, else null (the worker
-- then uses the Claritia system address). Paused sending stops only the emails that respect suppressions.
create or replace function public.meeting_sending(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'from_name', s.from_name,
    'from_email', case when s.from_email is not null and (verified_domain_for(p_ws, s.from_email)).id is not null then s.from_email end,
    'reply_to', s.reply_to,
    'paused', coalesce(s.paused, false))
  from (select 1) one left join send_settings s on s.workspace_id = p_ws;
$$;

-- Everything one meeting's emails need, in one read. Null when the meeting is gone.
create or replace function public.meeting_mail_info(p_meeting uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
begin
  select * into m from meetings where id = p_meeting;
  if m.id is null then return null; end if;
  return jsonb_build_object(
    'meeting', to_jsonb(m),
    'type', (select to_jsonb(t) from meeting_types t where t.id = m.type_id),
    'hosts', meeting_people(m.workspace_id, m.hosts),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'slug', booking_slug_ensure(w.id)) from workspaces w where w.id = m.workspace_id),
    'sending', meeting_sending(m.workspace_id),
    'sequence', (select count(*) from meeting_events e where e.meeting_id = m.id and e.kind in ('moved', 'canceled')),
    'moved_from', (select e.detail->>'from' from meeting_events e where e.meeting_id = m.id and e.kind = 'moved' order by e.id desc limit 1),
    'canceled_by', (select e.detail->>'by' from meeting_events e where e.meeting_id = m.id and e.kind = 'canceled' order by e.id desc limit 1));
end;
$$;

-- What a "pick a time" email needs for a submission. booked: a meeting already links to it. The not-booked mark
-- itself is submission_not_booked (056_instant_booking.sql).
create or replace function public.meeting_book_later_info(p_submission uuid, p_type uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  t meeting_types%rowtype;
begin
  select * into s from submissions where id = p_submission;
  if s.id is null then return null; end if;
  select * into t from meeting_types where id = p_type and workspace_id = s.workspace_id;
  return jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'workspace_id', s.workspace_id, 'contact_id', s.contact_id, 'spam', s.spam, 'test', s.test),
    'booked', exists (select 1 from meetings where submission_id = p_submission),
    'contact', (select jsonb_build_object('email', c.email_clean, 'first_name', c.first_name, 'last_name', c.last_name, 'timezone', c.timezone)
                from contacts c where c.id = s.contact_id and c.deleted_at is null),
    'type', case when t.id is null then null else to_jsonb(t) end,
    'people', case when t.id is null then '[]'::jsonb
                   else meeting_people(s.workspace_id, array(select (h->>'user_id')::uuid from jsonb_array_elements(t.hosts) h)) end,
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'slug', booking_slug_ensure(w.id)) from workspaces w where w.id = s.workspace_id),
    'sending', meeting_sending(s.workspace_id));
end;
$$;

-- Sending -----------------------------------------------------------------------------------------------------

/*
 * Start one email. Returns its id when it should be sent now, or null when it was sent (or may have been) already,
 * or is skipped. p_optional emails (no-show follow-up, book later) respect suppressions, erasures and paused sending;
 * confirmations, updates, cancels and reminders always go.
 */
create or replace function public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  addr text := lower(trim(p_to));
  reason text;
begin
  insert into meeting_mails (workspace_id, meeting_id, submission_id, kind, to_email, dedupe)
  values (p_ws, p_meeting, p_submission, p_kind, addr, p_dedupe)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is null then
    update meeting_mails set status = 'sending', attempts = attempts + 1, error = null
    where workspace_id = p_ws and dedupe = p_dedupe and status = 'retry'
    returning id into mid;
    return mid;
  end if;
  if p_optional then
    reason := case
      when exists (select 1 from suppressions where workspace_id = p_ws and email_clean = addr) then 'suppressed'
      when exists (select 1 from erasures where workspace_id = p_ws and value_hash = sha256(convert_to(addr, 'UTF8'))) then 'erased'
      when exists (select 1 from send_settings where workspace_id = p_ws and paused) then 'paused'
    end;
    if reason is not null then
      update meeting_mails set status = 'skipped', skip_reason = reason where id = mid;
      return null;
    end if;
  end if;
  return mid;
end;
$$;

-- The provider's answer. ok: sent. retry: not now (up to 5 tries). unknown: may have gone out, never resent.
create or replace function public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text default null, p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  r meeting_mails%rowtype;
begin
  select * into r from meeting_mails where id = p_id for update;
  if r.id is null or r.status <> 'sending' then return; end if;
  if p_outcome = 'ok' then
    update meeting_mails set status = 'sent', sent_at = now(), provider_id = left(p_provider_id, 200), error = null where id = p_id;
    if r.meeting_id is not null and r.kind in ('reminder', 'no_show') then
      insert into meeting_events (meeting_id, kind, detail)
      values (r.meeting_id, case r.kind when 'reminder' then 'reminder_sent' else 'follow_up_sent' end, jsonb_build_object('mail', r.id));
    end if;
  elsif p_outcome = 'retry' and r.attempts < 5 then
    update meeting_mails set status = 'retry', error = left(p_error, 500) where id = p_id;
  elsif p_outcome = 'unknown' then
    update meeting_mails set status = 'unknown', error = left(coalesce(p_error, 'No clear answer from the provider'), 500) where id = p_id;
  else
    update meeting_mails set status = 'failed', error = left(coalesce(p_error, 'Failed'), 500) where id = p_id;
  end if;
end;
$$;

-- Timed steps --------------------------------------------------------------------------------------------------

-- Drop a meeting's waiting reminder and after-meeting jobs, except the keys given (the ones for its time now).
-- The jobs also check the meeting when they run, so one that slips through still sends nothing.
create or replace function public.meeting_jobs_drop(p_meeting uuid, p_keep text[] default '{}') returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update jobs set status = 'done', error = 'The meeting changed', finished_at = now(), locked_by = null, locked_until = null
  where status = 'queued' and kind in ('meeting_remind', 'meeting_after') and payload->>'meeting' = p_meeting::text
    and not (key = any(coalesce(p_keep, '{}')));
  get diagnostics n = row_count;
  return n;
end;
$$;

/*
 * A host's Held or No-show link (the route checked the signature). Works once per email (the nonce), and only while
 * the meeting is unmarked: booked, or held by the 24-hour rule. A meeting someone already marked is left as it is.
 * Returns {result: ok | used | marked | not_started | not_found, status}.
 */
create or replace function public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  last_kind text;
  last_reason text;
begin
  if p_status not in ('held', 'no_show') then raise exception 'bad status'; end if;
  select * into m from meetings where id = p_meeting for update;
  if m.id is null then return jsonb_build_object('result', 'not_found'); end if;
  if exists (select 1 from meeting_outcome_uses where nonce = p_nonce) then
    return jsonb_build_object('result', 'used', 'status', m.status);
  end if;
  if m.start_at > now() then return jsonb_build_object('result', 'not_started', 'status', m.status); end if;
  select e.kind, e.detail->>'reason' into last_kind, last_reason from meeting_events e
  where e.meeting_id = m.id and e.kind in ('booked', 'held', 'no_show', 'canceled', 'pending_payment') order by e.id desc limit 1;
  if not (m.status = 'booked' or (m.status = 'held' and last_kind = 'held' and last_reason = 'auto')) then
    return jsonb_build_object('result', 'marked', 'status', m.status);
  end if;
  insert into meeting_outcome_uses (nonce, meeting_id, status) values (p_nonce, m.id, p_status);
  perform meeting_status(m.id, p_status, null, null);
  perform enqueue_job(m.workspace_id, 'meeting_notify', p_status || ':' || m.id::text, jsonb_build_object('meeting', m.id, 'event', p_status), 0, 5);
  return jsonb_build_object('result', 'ok', 'status', p_status);
end;
$$;

-- Booked meetings still unmarked 24 hours after the end turn held. Rows a host is marking right now are skipped
-- (and re-checked on the next round); a meeting already marked is never touched.
create or replace function public.meetings_auto_held(p_limit int default 500) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, workspace_id from meetings
    where status = 'booked' and end_at < now() - interval '24 hours'
    order by end_at
    limit greatest(1, least(coalesce(p_limit, 500), 5000))
    for update skip locked
  loop
    perform meeting_status(r.id, 'held', 'auto', null);
    perform enqueue_job(r.workspace_id, 'meeting_notify', 'held:' || r.id::text, jsonb_build_object('meeting', r.id, 'event', 'held'), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.meetings_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform meetings_auto_held(500);
  -- Once a day: the email ledger and spent outcome links past 400 days (their meetings are long marked).
  if extract(hour from now()) = 4 and extract(minute from now()) < 5 then
    delete from meeting_mails where created_at < now() - interval '400 days';
    delete from meeting_outcome_uses where at < now() - interval '400 days';
  end if;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-meetings', '*/5 * * * *', 'select public.meetings_tick()');
  end if;
end $$;

-- Grants (the server only) -------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'meeting_token_keep(uuid, text, text)', 'meeting_token_rotate(uuid, text, text, text)', 'meeting_people(uuid, uuid[])',
    'meeting_sending(uuid)', 'meeting_mail_info(uuid)', 'meeting_book_later_info(uuid, uuid)',
    'meeting_mail_start(uuid, uuid, uuid, text, text, text, boolean)', 'meeting_mail_done(uuid, text, text, text)',
    'meeting_jobs_drop(uuid, text[])', 'meeting_outcome(uuid, text, text)', 'meetings_auto_held(int)', 'meetings_tick()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
