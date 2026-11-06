-- Sending as the host (docs/integrations-plan.md, Next step 6). A team member connects their own Gmail or Outlook
-- mailbox; workflow emails "from their owner" and meeting emails to their guests then go from it, so replies land in
-- their inbox. One mailbox per person per workspace, its sign-in sealed. Each mailbox is held to its provider's daily
-- limit (mailbox_sends counts the last 24 hours). A sign-in that's gone turns the mailbox to reconnect: its emails go
-- from the workspace's domain on Resend as before, and the person is told once per break.

create table if not exists public.mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  provider text not null check (provider in ('gmail', 'outlook')),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+$' and length(email) <= 254),
  sealed text not null check (length(sealed) <= 8000),
  status text not null default 'ok' check (status in ('ok', 'reconnect')),
  error text check (length(error) <= 500),
  broken_at timestamptz,
  told_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
alter table public.mailboxes enable row level security;
-- People see their own mailbox (never the sealed sign-in).
create policy "own read" on public.mailboxes for select using (user_id = auth.uid() and is_member(workspace_id));
revoke all on public.mailboxes from anon, authenticated;
grant select (id, workspace_id, user_id, provider, email, status, error, created_at) on public.mailboxes to authenticated;

create table if not exists public.mailbox_sends (
  mailbox_id uuid not null references public.mailboxes (id) on delete cascade,
  at timestamptz not null default now()
);
create index if not exists mailbox_sends_at on public.mailbox_sends (mailbox_id, at);
alter table public.mailbox_sends enable row level security;
revoke all on public.mailbox_sends from anon, authenticated;

-- The person whose mailbox a workflow email goes from ("from their owner").
alter table public.email_messages add column if not exists sender_user uuid;

-- The daily limit each provider holds a mailbox to, a little under its own (check).
create or replace function public.mailbox_limit(p_provider text) returns int
language sql immutable as $$
  select case p_provider when 'gmail' then 450 when 'outlook' then 2000 else 0 end;
$$;

create or replace function public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into mailboxes (workspace_id, user_id, provider, email, sealed)
  values (p_ws, p_user, p_provider, lower(trim(p_email)), p_sealed)
  on conflict (workspace_id, user_id) do update set provider = excluded.provider, email = excluded.email, sealed = excluded.sealed,
    status = 'ok', error = null, broken_at = null, updated_at = now()
  returning id into rid;
  return rid;
end;
$$;

create or replace function public.mailbox_disconnect(p_ws uuid, p_user uuid) returns void
language sql security definer set search_path = public as $$
  delete from mailboxes where workspace_id = p_ws and user_id = p_user;
$$;

-- A person's mailbox for a send: only when it's working, with what it has sent in the last 24 hours and its limit,
-- and when the oldest of those turns 24 hours old (when there's room again).
create or replace function public.mailbox_for(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', b.id, 'provider', b.provider, 'email', b.email, 'sealed', b.sealed,
    'sent_day', (select count(*) from mailbox_sends s where s.mailbox_id = b.id and s.at > now() - interval '24 hours'),
    'limit', mailbox_limit(b.provider),
    'room_at', (select min(s.at) + interval '24 hours' from mailbox_sends s where s.mailbox_id = b.id and s.at > now() - interval '24 hours'))
  from mailboxes b where b.workspace_id = p_ws and b.user_id = p_user and b.status = 'ok';
$$;

create or replace function public.mailbox_sent(p_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into mailbox_sends (mailbox_id) values (p_id);
  delete from mailbox_sends where mailbox_id = p_id and at < now() - interval '2 days';
$$;

create or replace function public.mailbox_token_save(p_id uuid, p_sealed text) returns void
language sql security definer set search_path = public as $$
  update mailboxes set sealed = p_sealed, updated_at = now() where id = p_id;
$$;

/*
 * The sign-in is gone: the mailbox needs reconnecting. Answers who to tell and whether this break hasn't been told
 * yet, once; a second answer for the same break says tell: false.
 */
create or replace function public.mailbox_broken(p_id uuid, p_error text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b mailboxes%rowtype;
  tell boolean;
begin
  select * into b from mailboxes where id = p_id for update;
  if b.id is null then return null; end if;
  if b.status = 'ok' then
    update mailboxes set status = 'reconnect', error = left(p_error, 500), broken_at = now(), updated_at = now() where id = p_id returning * into b;
  end if;
  tell := b.told_at is null or b.told_at < b.broken_at;
  if tell then update mailboxes set told_at = now() where id = p_id; end if;
  return jsonb_build_object('tell', tell, 'email', (select lower(u.email) from auth.users u where u.id = b.user_id), 'mailbox', b.email, 'provider', b.provider, 'broken_at', b.broken_at);
end;
$$;

-- The workflow email step "from their owner" now names the owner, so the send can use their mailbox.
create or replace function public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  eid uuid;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select email_id into eid from workflow_emails where workflow_id = r.workflow_id and version = r.version and step_id = p_step;
  if eid is null then raise exception 'This email was never made live'; end if;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null or coalesce(c.email_clean, '') = '' then return null; end if;
  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, vars, from_name, reply_to, sender_user)
  values (r.workspace_id, eid, c.id, c.email_clean, 'wf:' || p_run || ':' || p_step, p_vars, left(p_from_name, 80), left(p_reply_to, 254), p_from_user)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is not null then perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3); end if;
  return mid;
end;
$$;

-- The send claims as before, with the person each message should go from.
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

-- One more answer: 'wait' puts a message back until its mailbox has room again (up to a day), without a try.
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
  elsif p_outcome = 'wait' then
    update email_messages set status = 'queued', claimed_at = null, attempts = greatest(attempts - 1, 0), error = left(p_error, 500),
      send_after = now() + make_interval(secs => least(greatest(coalesce(p_delay_s, 3600), 60), 86400)) where id = p_id;
  elsif p_outcome = 'retry' and m.attempts < 3 then
    update email_messages set status = 'queued', claimed_at = null, error = left(p_error, 500), send_after = now() + make_interval(secs => greatest(60 * m.attempts, delay)) where id = p_id;
  elsif p_outcome = 'unknown' then
    update email_messages set status = 'unknown', error = left(coalesce(p_error, 'No clear answer from Resend'), 500) where id = p_id;
  else
    update email_messages set status = 'failed', error = left(coalesce(p_error, 'Failed'), 500) where id = p_id;
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'mailbox_connect(uuid, uuid, text, text, text)', 'mailbox_disconnect(uuid, uuid)', 'mailbox_for(uuid, uuid)', 'mailbox_sent(uuid)',
    'mailbox_token_save(uuid, text)', 'mailbox_broken(uuid, text)', 'workflow_email(uuid, text, jsonb, text, text, uuid)',
    'send_claim(uuid, int)', 'send_done(uuid, text, text, text, int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
