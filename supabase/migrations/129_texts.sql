-- Text messages (docs/integrations-plan.md, Next step 3): a Text message and a WhatsApp message step in workflows,
-- meeting reminders included. A text goes only to a contact whose latest text consent is granted (ticked on a form's
-- Text consent box or a booking page's), to a number kept as E.164, and never to a number that replied STOP to the
-- number it comes from. Each step writes one message (unique per run and step) and queues a text_send job; the job
-- checks again at send time, so a reminder for a meeting canceled or moved since is skipped. A text that can't go
-- after its tries sends its step's email instead, when the step asks for one.

alter table public.consents drop constraint if exists consents_channel_check;
alter table public.consents add constraint consents_channel_check check (channel in ('email', 'sms'));

create table if not exists public.text_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  run_id uuid,
  step_id text check (length(step_id) <= 80),
  channel text not null check (channel in ('sms', 'whatsapp')),
  to_phone text not null check (to_phone ~ '^\+[1-9][0-9]{6,14}$'),
  body text check (length(body) <= 1600),
  -- WhatsApp: the approved template's Content SID and its variables.
  template text check (template ~ '^HX[0-9a-f]{32}$'),
  vars jsonb not null default '{}' check (jsonb_typeof(vars) = 'object' and length(vars::text) <= 4000),
  -- A reminder: the meeting and its start when it was queued, to check at send time.
  meeting_id uuid,
  meeting_start timestamptz,
  -- The email that goes instead when the text can't: { subject, text }.
  fallback jsonb check (fallback is null or (jsonb_typeof(fallback) = 'object' and length(fallback::text) <= 4000)),
  dedupe text not null check (length(dedupe) <= 200),
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped', 'unknown', 'emailed')),
  attempts int not null default 0,
  sid text check (length(sid) <= 64),
  from_number text check (length(from_number) <= 64),
  error text check (length(error) <= 500),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (workspace_id, dedupe)
);
create index if not exists text_messages_sid on public.text_messages (sid) where sid is not null;
create index if not exists text_messages_contact on public.text_messages (contact_id, created_at desc);
alter table public.text_messages enable row level security;
create policy "members read" on public.text_messages for select using (is_member(workspace_id));
revoke all on public.text_messages from anon;
revoke insert, update, delete on public.text_messages from authenticated;

-- STOP and START, per sending number ('*' for every number) and phone.
create table if not exists public.text_optouts (
  sender text not null check (length(sender) <= 64),
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  at timestamptz not null default now(),
  primary key (sender, phone)
);
alter table public.text_optouts enable row level security;
revoke all on public.text_optouts from anon, authenticated;

-- A contact's text consent, from a form's Text consent box or a booking page's: their number kept when they had
-- none, and a granted sms consent with the wording they saw.
create or replace function public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid := p_contact;
begin
  if cid is null and coalesce(p_email, '') <> '' then
    select id into cid from contacts where workspace_id = p_ws and email_clean = lower(trim(p_email)) and deleted_at is null order by created_at limit 1;
  end if;
  if cid is null or not exists (select 1 from contacts where id = cid and workspace_id = p_ws) then return null; end if;
  if p_phone ~ '^\+[1-9][0-9]{6,14}$' then
    update contacts set phone = p_phone where id = cid and coalesce(phone, '') !~ '^\+[1-9][0-9]{6,14}$';
  end if;
  insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
  values (p_ws, cid, 'sms', 'opt_in', 'granted', left(coalesce(p_source, 'form'), 60), left(p_wording, 2000));
  return cid;
end;
$$;

-- A workflow's text: checked (a mobile number, text consent) and queued once per run and step.
create or replace function public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb,
  p_meeting uuid, p_meeting_start timestamptz, p_fallback jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null then return jsonb_build_object('skip', 'the contact is gone'); end if;
  if coalesce(c.phone, '') !~ '^\+[1-9][0-9]{6,14}$' then return jsonb_build_object('skip', 'no mobile number'); end if;
  if coalesce((select status from consents where contact_id = c.id and channel = 'sms' order by at desc, id limit 1), '') <> 'granted' then
    return jsonb_build_object('skip', 'no text consent');
  end if;
  insert into text_messages (workspace_id, contact_id, run_id, step_id, channel, to_phone, body, template, vars, meeting_id, meeting_start, fallback, dedupe)
  values (r.workspace_id, c.id, p_run, p_step, p_channel, c.phone, p_body, nullif(p_template, ''), coalesce(p_vars, '{}'), p_meeting, p_meeting_start, p_fallback,
          'wf:' || p_run || ':' || p_step)
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is null then return jsonb_build_object('skip', 'queued before'); end if;
  perform enqueue_job(r.workspace_id, 'text_send', mid::text, jsonb_build_object('message', mid), 0, 4);
  return jsonb_build_object('id', mid);
end;
$$;

/*
 * The job takes a message: the message, the senders the number stopped, the meeting as it is now, the workspace's
 * own Twilio, and what the fallback email needs. Null when it's gone or already finished.
 */
create or replace function public.text_take(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m text_messages%rowtype;
begin
  select * into m from text_messages where id = p_id for update;
  if m.id is null or m.status not in ('queued', 'sending') then return null; end if;
  update text_messages set attempts = attempts + 1, status = 'sending', updated_at = now() where id = p_id;
  return to_jsonb(m) || jsonb_build_object(
    'attempts', m.attempts + 1,
    'stopped', coalesce((select jsonb_agg(o.sender) from text_optouts o where o.phone = m.to_phone), '[]'),
    'consent', (select status from consents where contact_id = m.contact_id and channel = 'sms' order by at desc, id limit 1),
    'meeting', (select jsonb_build_object('status', x.status, 'start_at', x.start_at) from meetings x where x.id = m.meeting_id),
    'twilio_source', (select s.id from sources s where s.workspace_id = m.workspace_id and s.kind = 'twilio' and s.status <> 'disconnected' order by s.created_at limit 1),
    'email', (select c.email_clean from contacts c where c.id = m.contact_id and c.deleted_at is null
              and not exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'sending', (select jsonb_build_object('from_name', coalesce(ss.from_name, w.name), 'from_email', ss.from_email, 'reply_to', ss.reply_to)
                from workspaces w left join send_settings ss on ss.workspace_id = w.id where w.id = m.workspace_id)
  );
end;
$$;

create or replace function public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) returns void
language sql security definer set search_path = public as $$
  update text_messages set status = p_status, sid = coalesce(p_sid, sid), from_number = coalesce(p_from, from_number), error = left(p_error, 500),
    sent_at = case when p_status in ('sent', 'emailed') then now() else sent_at end, updated_at = now()
  where id = p_id;
$$;

-- Twilio's delivery answers, by message SID. A later answer never turns delivered back into sent.
create or replace function public.text_status(p_sid text, p_status text, p_error text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update text_messages set
    status = case when p_status = 'delivered' then 'delivered' when p_status in ('undelivered', 'failed') then 'failed' else status end,
    error = case when p_status in ('undelivered', 'failed') then left(p_error, 500) else error end,
    updated_at = now()
  where sid = p_sid and status in ('sent', 'delivered', 'unknown') and not (status = 'delivered' and p_status <> 'delivered');
  return found;
end;
$$;

-- STOP (p_stop) or START from a phone to a sending number.
create or replace function public.text_optout(p_sender text, p_phone text, p_stop boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_phone !~ '^\+[1-9][0-9]{6,14}$' then return; end if;
  if p_stop then
    insert into text_optouts (sender, phone) values (left(p_sender, 64), p_phone) on conflict (sender, phone) do update set at = now();
  else
    delete from text_optouts where sender = p_sender and phone = p_phone;
  end if;
end;
$$;

-- The workspace's own Twilio, by its account SID, for its webhooks: the source and its sealed keys.
create or replace function public.text_source_for(p_account text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', s.id, 'sealed', k.sealed) from sources s join source_secrets k on k.source_id = s.id
  where s.kind = 'twilio' and s.status <> 'disconnected' and s.account = p_account order by s.created_at limit 1;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'text_consent_add(uuid, uuid, text, text, text, text)', 'workflow_text(uuid, text, text, text, text, jsonb, uuid, timestamptz, jsonb)',
    'text_take(uuid)', 'text_done(uuid, text, text, text, text)', 'text_status(text, text, text)', 'text_optout(text, text, boolean)', 'text_source_for(text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
