-- Sending (docs/conversion-weeks.md week 9, docs/marketing-platform.md M3): sending domains on Amazon SES, the send
-- guard, SES events through SNS, one-click unsubscribe and click tracking.
--   Every send goes through send_claim, which locks the message and checks, at that moment: the workspace isn't
--   paused, the From domain is verified, the address isn't suppressed, the contact has a lawful basis and hasn't
--   left the topic, the frequency cap, the daily limit, quiet hours in the contact's time zone, and the per-second
--   rate. A message that was queued before an unsubscribe is still blocked.
--   A message is sent at most once. If a worker stops between claiming and recording the send, the message is
--   marked unknown and never sent again; SES's own Send event fills it in if SES did take it.

-- Settings and limits, one row per workspace ----------------------------------------------------------------------

create table if not exists public.send_limits (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  per_second int not null default 14 check (per_second between 1 and 500),
  per_day int not null default 50000 check (per_day between 1 and 10000000),
  -- At most cap_count marketing emails per contact in cap_days. 0 turns the cap off.
  cap_count int not null default 3 check (cap_count between 0 and 50),
  cap_days int not null default 7 check (cap_days between 1 and 90),
  -- No marketing email from quiet_start to quiet_end, in the contact's time zone. Equal hours turn it off.
  quiet_start int not null default 21 check (quiet_start between 0 and 23),
  quiet_end int not null default 8 check (quiet_end between 0 and 23),
  -- For contacts with no time zone.
  timezone text not null default 'UTC' check (length(timezone) <= 60),
  -- The postal address in every marketing footer (CAN-SPAM).
  footer_address text check (length(footer_address) <= 300),
  paused boolean not null default false,
  paused_reason text check (length(paused_reason) <= 300),
  paused_at timestamptz,
  -- The workspace's SES configuration set, made by the first domain_check.
  config_set text check (config_set ~ '^[A-Za-z0-9_-]{1,64}$'),
  updated_at timestamptz not null default now()
);
alter table public.send_limits enable row level security;
create policy "members read" on public.send_limits for select using (is_member(workspace_id));
revoke all on public.send_limits from anon;
revoke insert, update, delete on public.send_limits from authenticated;

-- Sending domains -------------------------------------------------------------------------------------------------

create table if not exists public.sending_domains (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  domain text not null check (domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' and length(domain) <= 200),
  -- The custom MAIL FROM subdomain that carries SPF.
  mail_from text not null check (length(mail_from) <= 220),
  region text check (region ~ '^[a-z]{2}(-[a-z]+)+-[0-9]$'),
  -- pending: not on SES yet; waiting: records not all there; verified: can send; failed: gave up after 3 days.
  status text not null default 'pending' check (status in ('pending', 'waiting', 'verified', 'failed')),
  dkim_tokens text[] not null default '{}' check (cardinality(dkim_tokens) <= 5),
  -- Per record: verified, waiting or wrong. Keys: dkim1..dkim3, spf_mx, spf_txt, dmarc.
  checks jsonb not null default '{}' check (jsonb_typeof(checks) = 'object'),
  ses_dkim text check (length(ses_dkim) <= 40),
  ses_mail_from text check (length(ses_mail_from) <= 40),
  error text check (length(error) <= 500),
  -- Failed checks in a row on a verified domain. Two drop it back to waiting.
  fails int not null default 0,
  checked_at timestamptz,
  verified_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
-- A domain is an identity in one AWS account, so it belongs to one workspace.
create unique index if not exists sending_domains_domain on public.sending_domains (domain);
create index if not exists sending_domains_ws on public.sending_domains (workspace_id);
alter table public.sending_domains enable row level security;
create policy "members read" on public.sending_domains for select using (is_member(workspace_id));
revoke all on public.sending_domains from anon;
revoke insert, update, delete on public.sending_domains from authenticated;

-- Templates, brand kits and emails (the editor fills these in week 10) -------------------------------------------------

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  blocks jsonb not null default '[]' check (jsonb_typeof(blocks) = 'array'),
  mjml text check (length(mjml) <= 500000),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.templates enable row level security;
create policy "members read" on public.templates for select using (is_member(workspace_id));
revoke all on public.templates from anon;
revoke insert, update, delete on public.templates from authenticated;

create table if not exists public.brand_kits (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  logo_url text check (length(logo_url) <= 1000),
  colors jsonb not null default '{}' check (jsonb_typeof(colors) = 'object'),
  fonts jsonb not null default '{}' check (jsonb_typeof(fonts) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.brand_kits enable row level security;
create policy "members read" on public.brand_kits for select using (is_member(workspace_id));
revoke all on public.brand_kits from anon;
revoke insert, update, delete on public.brand_kits from authenticated;

create table if not exists public.emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  kind text not null check (kind in ('broadcast', 'journey', 'one_to_one', 'test')),
  subject text not null check (length(subject) between 1 and 300),
  preheader text check (length(preheader) <= 300),
  html text not null check (length(html) <= 500000),
  text text check (length(text) <= 200000),
  template_id uuid references public.templates (id) on delete set null,
  from_name text check (length(from_name) <= 100),
  from_email text not null check (length(from_email) <= 254),
  reply_to text check (length(reply_to) <= 254),
  topic_id uuid references public.topics (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'ready', 'sending', 'sent', 'archived')),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists emails_ws on public.emails (workspace_id, created_at desc);
alter table public.emails enable row level security;
create policy "members read" on public.emails for select using (is_member(workspace_id));
revoke all on public.emails from anon;
revoke insert, update, delete on public.emails from authenticated;

-- Messages: one email to one address ------------------------------------------------------------------------------

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email_id uuid references public.emails (id) on delete set null,
  contact_id uuid references public.contacts (id) on delete set null,
  journey_step_id uuid,
  -- marketing: every guard. test: to a teammate; suppression, pause and domain still apply.
  kind text not null default 'marketing' check (kind in ('marketing', 'test')),
  to_email text not null check (length(to_email) <= 254 and to_email !~ '[\r\n]'),
  topic_id uuid references public.topics (id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'blocked', 'failed', 'unknown')),
  blocked_reason text check (blocked_reason in ('paused', 'domain', 'suppressed', 'no_contact', 'no_basis', 'topic', 'frequency_cap', 'no_address', 'no_email')),
  error text check (length(error) <= 1000),
  ses_message_id text check (length(ses_message_id) <= 200),
  subject_final text check (length(subject_final) <= 300),
  body_hash text check (length(body_hash) <= 100),
  attempts int not null default 0,
  send_after timestamptz,
  queued_at timestamptz not null default now(),
  sending_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  bounced text check (bounced in ('hard', 'soft')),
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  first_click_at timestamptz,
  clicks int not null default 0,
  replied_at timestamptz
);
create unique index if not exists email_messages_ses on public.email_messages (ses_message_id) where ses_message_id is not null;
create index if not exists email_messages_ws on public.email_messages (workspace_id, queued_at desc);
create index if not exists email_messages_to on public.email_messages (workspace_id, to_email, sent_at desc) where sent_at is not null;
create index if not exists email_messages_rate on public.email_messages (workspace_id, sending_at desc) where sending_at is not null;
alter table public.email_messages enable row level security;
create policy "members read" on public.email_messages for select using (is_member(workspace_id));
revoke all on public.email_messages from anon;
revoke insert, update, delete on public.email_messages from authenticated;

create table if not exists public.email_clicks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  message_id uuid not null references public.email_messages (id) on delete cascade,
  url text not null check (length(url) <= 2000),
  human boolean not null,
  user_agent text check (length(user_agent) <= 500),
  at timestamptz not null default now()
);
create index if not exists email_clicks_message on public.email_clicks (message_id, at desc);
alter table public.email_clicks enable row level security;
create policy "members read" on public.email_clicks for select using (is_member(workspace_id));
revoke all on public.email_clicks from anon;
revoke insert, update, delete on public.email_clicks from authenticated;

create table if not exists public.email_stats (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  sent int not null default 0,
  delivered int not null default 0,
  bounced int not null default 0,
  complained int not null default 0,
  rejected int not null default 0,
  clicked int not null default 0,
  unsubscribed int not null default 0,
  blocked int not null default 0,
  primary key (workspace_id, day)
);
alter table public.email_stats enable row level security;
create policy "members read" on public.email_stats for select using (is_member(workspace_id));
revoke all on public.email_stats from anon;
revoke insert, update, delete on public.email_stats from authenticated;

-- SNS deliveries already applied, so a redelivery changes nothing. Kept 30 days.
create table if not exists public.ses_event_keys (
  key text primary key check (length(key) <= 200),
  at timestamptz not null default now()
);
alter table public.ses_event_keys enable row level security;
revoke all on public.ses_event_keys from anon, authenticated;

-- Helpers ---------------------------------------------------------------------------------------------------------

create or replace function public.email_stat(p_ws uuid, p_col text, p_n int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_col not in ('sent', 'delivered', 'bounced', 'complained', 'rejected', 'clicked', 'unsubscribed', 'blocked') then
    raise exception 'Unknown stat';
  end if;
  execute format('insert into email_stats (workspace_id, day, %1$I) values ($1, current_date, $2)
                  on conflict (workspace_id, day) do update set %1$I = email_stats.%1$I + $2', p_col) using p_ws, p_n;
end;
$$;

-- Countries where marketing email needs opt-in or soft opt-in (docs/marketing-platform.md 9.1): EU, EEA, UK,
-- Switzerland and Brazil, as the website rules (src/lib/web/policy.ts), plus Canada (CASL).
create or replace function public.email_strict_country(p_country text) returns boolean
language sql immutable as $$
  select coalesce(upper(p_country), '') = any ('{AT,BE,BG,HR,CY,CZ,DK,EE,FI,FR,DE,GR,HU,IE,IT,LV,LT,LU,MT,NL,PL,PT,RO,SK,SI,ES,SE,IS,LI,NO,GB,CH,BR,CA}'::text[]);
$$;

create or replace function public.valid_timezone(p_tz text) returns boolean
language sql stable as $$
  select p_tz is not null and exists (select 1 from pg_timezone_names where name = p_tz);
$$;

-- Suppress an address for the whole workspace. A stronger reason replaces a weaker one.
create or replace function public.email_suppress(p_ws uuid, p_email text, p_reason text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  rank_of constant jsonb := '{"manual": 1, "cleaned": 2, "unsubscribed": 3, "bounced": 4, "complained": 5}';
begin
  insert into suppressions (workspace_id, email_clean, reason, source)
  values (p_ws, lower(trim(p_email)), p_reason, p_source)
  on conflict (workspace_id, email_clean) do update set reason = excluded.reason, source = excluded.source, at = now()
  where (rank_of->>excluded.reason)::int > (rank_of->>suppressions.reason)::int;
end;
$$;

-- Domains (owners) ------------------------------------------------------------------------------------------------

create or replace function public.sending_domain_add(p_ws uuid, p_domain text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d text := lower(trim(both '. ' from coalesce(p_domain, '')));
  made sending_domains%rowtype;
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can change this';
  end if;
  if d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or length(d) > 200 then
    raise exception 'Enter a domain like mail.acme.com';
  end if;
  if (select count(*) from sending_domains where workspace_id = p_ws) >= 10 then
    raise exception 'A workspace can have up to 10 sending domains';
  end if;
  if exists (select 1 from sending_domains where domain = d) then
    raise exception 'This domain is already added';
  end if;
  insert into send_limits (workspace_id) values (p_ws) on conflict do nothing;
  insert into sending_domains (workspace_id, domain, mail_from, created_by)
  values (p_ws, d, 'bounce.' || d, auth.uid()) returning * into made;
  perform enqueue_job(p_ws, 'domain_check', made.id::text, jsonb_build_object('domain_id', made.id));
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'sending.domain_add', d);
  return to_jsonb(made) - 'workspace_id';
end;
$$;

create or replace function public.sending_domain_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains%rowtype;
begin
  select * into d from sending_domains where id = p_id;
  if d.id is null or not is_owner(d.workspace_id) then
    raise exception 'Domain not found';
  end if;
  delete from sending_domains where id = p_id;
  -- Take it off SES too, so its DKIM keys can't be reused by anyone who adds it later.
  perform enqueue_job(d.workspace_id, 'domain_delete', d.domain, jsonb_build_object('domain', d.domain));
  insert into audit_log (workspace_id, actor, action, target) values (d.workspace_id, auth.uid(), 'sending.domain_remove', d.domain);
end;
$$;

create or replace function public.sending_domain_check_now(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains%rowtype;
begin
  select * into d from sending_domains where id = p_id;
  if d.id is null or not is_member(d.workspace_id) then
    raise exception 'Domain not found';
  end if;
  update sending_domains set status = 'waiting', created_at = now() where id = p_id and status = 'failed';
  perform enqueue_job(d.workspace_id, 'domain_check', d.id::text, jsonb_build_object('domain_id', d.id));
end;
$$;

-- What a domain_check found. p_checks: {dkim1, dkim2, dkim3, spf_mx, spf_txt, dmarc} each verified, waiting, wrong
-- or error (a DNS failure that says nothing either way).
create or replace function public.sending_domain_checked(p_id uuid, p_region text, p_tokens text[], p_checks jsonb, p_ses_dkim text,
  p_ses_mail_from text, p_error text) returns text
language plpgsql security definer set search_path = public as $$
declare
  d sending_domains%rowtype;
  merged jsonb;
  k text;
  ok boolean;
  next_status text;
begin
  select * into d from sending_domains where id = p_id for update;
  if d.id is null then
    return null;
  end if;
  -- An error keeps what was seen last time.
  merged := coalesce(d.checks, '{}');
  for k in select jsonb_object_keys(coalesce(p_checks, '{}')) loop
    if p_checks->>k in ('verified', 'waiting', 'wrong') then
      merged := merged || jsonb_build_object(k, p_checks->>k);
    end if;
  end loop;
  ok := coalesce(p_ses_dkim, d.ses_dkim) = 'SUCCESS'
    and coalesce(cardinality(coalesce(p_tokens, d.dkim_tokens)), 0) = 3
    and (select bool_and(merged->>x = 'verified') from unnest(array['dkim1', 'dkim2', 'dkim3', 'spf_mx', 'spf_txt', 'dmarc']) x);
  next_status := case
    when ok then 'verified'
    when d.status = 'verified' and coalesce(p_ses_dkim, d.ses_dkim) = 'SUCCESS' and d.fails + 1 < 2 then 'verified'
    when d.status <> 'verified' and d.created_at < now() - interval '3 days' then 'failed'
    else 'waiting' end;
  update sending_domains set
    region = coalesce(p_region, region),
    dkim_tokens = coalesce(p_tokens, dkim_tokens),
    checks = merged,
    ses_dkim = coalesce(p_ses_dkim, ses_dkim),
    ses_mail_from = coalesce(p_ses_mail_from, ses_mail_from),
    error = left(p_error, 500),
    status = next_status,
    fails = case when ok then 0 when d.status = 'verified' then d.fails + 1 else 0 end,
    verified_at = case when next_status = 'verified' then coalesce(verified_at, now()) else null end,
    checked_at = now()
  where id = p_id;
  return next_status;
end;
$$;

-- Unverified domains every 5 minutes for 3 days, verified ones daily.
create or replace function public.domains_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  d record;
begin
  for d in select id, workspace_id from sending_domains
           where (status in ('pending', 'waiting') and coalesce(checked_at, 'epoch') < now() - interval '5 minutes')
              or (status = 'verified' and coalesce(checked_at, 'epoch') < now() - interval '1 day')
           limit 500 loop
    perform enqueue_job(d.workspace_id, 'domain_check', d.id::text, jsonb_build_object('domain_id', d.id));
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Settings (owners) ---------------------------------------------------------------------------------------------

create or replace function public.send_settings_save(p_ws uuid, p_values jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  tz text := nullif(trim(p_values->>'timezone'), '');
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can change this';
  end if;
  if tz is not null and not valid_timezone(tz) then
    raise exception 'Unknown time zone: %', left(tz, 60);
  end if;
  insert into send_limits (workspace_id) values (p_ws) on conflict do nothing;
  update send_limits set
    cap_count = coalesce((p_values->>'cap_count')::int, cap_count),
    cap_days = coalesce((p_values->>'cap_days')::int, cap_days),
    quiet_start = coalesce((p_values->>'quiet_start')::int, quiet_start),
    quiet_end = coalesce((p_values->>'quiet_end')::int, quiet_end),
    timezone = coalesce(tz, timezone),
    footer_address = case when p_values ? 'footer_address' then nullif(trim(p_values->>'footer_address'), '') else footer_address end,
    updated_at = now()
  where workspace_id = p_ws;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, auth.uid(), 'sending.settings', p_ws::text, p_values);
end;
$$;

create or replace function public.sending_resume(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can change this';
  end if;
  update send_limits set paused = false, paused_reason = null, paused_at = null, updated_at = now() where workspace_id = p_ws;
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'sending.resume', p_ws::text);
end;
$$;

create or replace function public.topic_add(p_ws uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can change this';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'Enter a topic name';
  end if;
  if (select count(*) from topics where workspace_id = p_ws) >= 50 then
    raise exception 'A workspace can have up to 50 topics';
  end if;
  insert into topics (workspace_id, name) values (p_ws, trim(p_name)) on conflict do nothing returning id into tid;
  if tid is null then
    raise exception 'This topic already exists';
  end if;
  return tid;
end;
$$;

create or replace function public.topic_remove(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from topics where id = p_id;
  if ws is null or not is_owner(ws) then
    raise exception 'Topic not found';
  end if;
  delete from topics where id = p_id;
end;
$$;

-- Queue and send --------------------------------------------------------------------------------------------------

-- Queue one message of an email. The send job checks everything again when it runs.
create or replace function public.email_queue(p_email uuid, p_contact uuid, p_to text, p_kind text default 'marketing', p_delay_s int default 0)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e emails%rowtype;
  addr text := lower(trim(coalesce(p_to, '')));
  mid uuid;
begin
  select * into e from emails where id = p_email;
  if e.id is null then
    raise exception 'Email not found';
  end if;
  if p_contact is not null then
    select email_clean into addr from contacts where id = p_contact and workspace_id = e.workspace_id and deleted_at is null;
    if addr is null then
      raise exception 'Contact not found';
    end if;
  end if;
  if addr !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Not an email address';
  end if;
  insert into email_messages (workspace_id, email_id, contact_id, kind, to_email, topic_id, send_after)
  values (e.workspace_id, e.id, p_contact, p_kind, addr, e.topic_id, now() + make_interval(secs => greatest(p_delay_s, 0)))
  returning id into mid;
  perform enqueue_job(e.workspace_id, 'send', mid::text, jsonb_build_object('message_id', mid), greatest(p_delay_s, 0), 8);
  return mid;
end;
$$;

-- A test to a teammate, from a verified domain of the workspace.
create or replace function public.email_send_test(p_ws uuid, p_from text, p_from_name text, p_to text, p_subject text, p_html text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  addr text := lower(trim(coalesce(p_from, '')));
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if addr !~ '^[a-z0-9._+-]+@[a-z0-9.-]+$' then
    raise exception 'Enter a From address';
  end if;
  if not exists (select 1 from sending_domains where workspace_id = p_ws and domain = split_part(addr, '@', 2) and status = 'verified') then
    raise exception 'The From address needs a verified domain';
  end if;
  if not exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id
                 where m.workspace_id = p_ws and lower(u.email) = lower(trim(p_to))) then
    raise exception 'Tests go to people in this workspace';
  end if;
  if (select count(*) from email_messages where workspace_id = p_ws and kind = 'test' and queued_at > now() - interval '1 hour') >= 30 then
    raise exception 'Up to 30 tests an hour';
  end if;
  insert into emails (workspace_id, name, kind, subject, html, from_name, from_email, status, created_by)
  values (p_ws, 'Test', 'test', left(coalesce(nullif(trim(p_subject), ''), 'Test from Claritia'), 300),
          coalesce(nullif(p_html, ''), '<p>This is a test from Claritia.</p>'), nullif(left(trim(coalesce(p_from_name, '')), 100), ''), addr, 'sent', auth.uid())
  returning id into eid;
  return email_queue(eid, null, p_to, 'test');
end;
$$;

-- The guard. Locks the message and decides, now: send, wait, or block. Returns
--   {action: 'send', ...what the send job needs} | {action: 'wait', seconds} | {action: 'blocked', reason} | {action: 'skip'}
create or replace function public.send_claim(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m email_messages%rowtype;
  e emails%rowtype;
  c contacts%rowtype;
  lim send_limits%rowtype;
  basis_now text;
  status_now text;
  tz text;
  local_ts timestamp;
  h int;
  target timestamp;
  reason text;
begin
  select * into m from email_messages where id = p_id for update;
  if m.id is null then
    return jsonb_build_object('action', 'skip');
  end if;
  if m.status = 'sending' then
    -- A worker claimed it and stopped before recording the send. Never send twice.
    update email_messages set status = 'unknown', error = 'The worker stopped during the send; not sent again' where id = p_id;
    return jsonb_build_object('action', 'skip');
  end if;
  if m.status <> 'queued' then
    return jsonb_build_object('action', 'skip');
  end if;
  select * into e from emails where id = m.email_id;
  select * into lim from send_limits where workspace_id = m.workspace_id;
  if m.contact_id is not null then
    select * into c from contacts where id = m.contact_id;
  end if;

  reason := case
    when e.id is null then 'no_email'
    when coalesce(lim.paused, false) then 'paused'
    when not exists (select 1 from sending_domains d where d.workspace_id = m.workspace_id and d.status = 'verified'
                     and d.domain = split_part(lower(e.from_email), '@', 2)) then 'domain'
    when exists (select 1 from suppressions s where s.workspace_id = m.workspace_id and s.email_clean = m.to_email) then 'suppressed'
  end;
  if reason is null and m.kind = 'marketing' then
    select k.basis, k.status into basis_now, status_now from consents k
    where k.contact_id = m.contact_id and k.channel = 'email' order by k.at desc, k.id desc limit 1;
    reason := case
      when c.id is null or c.deleted_at is not null or c.email_clean is distinct from m.to_email then 'no_contact'
      when coalesce(basis_now, 'none') = 'none' or status_now <> 'granted' then 'no_basis'
      when basis_now = 'legitimate_interest' and email_strict_country(c.country) then 'no_basis'
      when m.topic_id is not null and exists (select 1 from subscriptions s where s.contact_id = c.id and s.topic_id = m.topic_id and s.status = 'unsubscribed') then 'topic'
      when nullif(trim(lim.footer_address), '') is null then 'no_address'
      when coalesce(lim.cap_count, 3) > 0 and (select count(*) from email_messages x
            where x.workspace_id = m.workspace_id and x.to_email = m.to_email and x.kind = 'marketing' and x.id <> m.id
              and x.status in ('sending', 'sent', 'unknown') and coalesce(x.sent_at, x.sending_at) > now() - make_interval(days => coalesce(lim.cap_days, 7)))
            >= coalesce(lim.cap_count, 3) then 'frequency_cap'
    end;
  end if;
  if reason is not null then
    update email_messages set status = 'blocked', blocked_reason = reason where id = p_id;
    perform email_stat(m.workspace_id, 'blocked');
    return jsonb_build_object('action', 'blocked', 'reason', reason);
  end if;

  -- Waits: quiet hours, the daily limit, the per-second rate.
  if m.kind = 'marketing' and coalesce(lim.quiet_start, 21) <> coalesce(lim.quiet_end, 8) then
    tz := case when valid_timezone(c.timezone) then c.timezone when valid_timezone(lim.timezone) then lim.timezone else 'UTC' end;
    local_ts := now() at time zone tz;
    h := extract(hour from local_ts)::int;
    if (coalesce(lim.quiet_start, 21) < coalesce(lim.quiet_end, 8) and h >= coalesce(lim.quiet_start, 21) and h < coalesce(lim.quiet_end, 8))
       or (coalesce(lim.quiet_start, 21) > coalesce(lim.quiet_end, 8) and (h >= coalesce(lim.quiet_start, 21) or h < coalesce(lim.quiet_end, 8))) then
      target := date_trunc('day', local_ts) + make_interval(hours => coalesce(lim.quiet_end, 8));
      if target <= local_ts then
        target := target + interval '1 day';
      end if;
      update email_messages set send_after = target at time zone tz where id = p_id;
      return jsonb_build_object('action', 'wait', 'seconds', greatest(60, ceil(extract(epoch from (target at time zone tz) - now()))::int), 'why', 'quiet_hours');
    end if;
  end if;
  if (select count(*) from email_messages x where x.workspace_id = m.workspace_id and x.sending_at > now() - interval '24 hours') >= coalesce(lim.per_day, 50000) then
    return jsonb_build_object('action', 'wait', 'seconds', 900, 'why', 'per_day');
  end if;
  if (select count(*) from email_messages x where x.workspace_id = m.workspace_id and x.sending_at > now() - interval '1 second') >= coalesce(lim.per_second, 14) then
    return jsonb_build_object('action', 'wait', 'seconds', 1, 'why', 'per_second');
  end if;

  update email_messages set status = 'sending', sending_at = now(), attempts = attempts + 1, error = null where id = p_id;
  return jsonb_build_object(
    'action', 'send',
    'id', m.id,
    'workspace_id', m.workspace_id,
    'kind', m.kind,
    'to', m.to_email,
    'from_email', lower(e.from_email),
    'from_name', e.from_name,
    'reply_to', e.reply_to,
    'subject', e.subject,
    'preheader', e.preheader,
    'html', e.html,
    'text', e.text,
    'config_set', lim.config_set,
    'footer_address', lim.footer_address,
    'workspace_name', (select name from workspaces where id = m.workspace_id),
    'contact', case when c.id is null then null else jsonb_build_object('first_name', c.first_name, 'last_name', c.last_name, 'email', c.email) end);
end;
$$;

-- SES took the message.
create or replace function public.send_done(p_id uuid, p_ses_id text, p_subject text, p_body_hash text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m email_messages%rowtype;
begin
  update email_messages set status = 'sent', sent_at = now(), ses_message_id = p_ses_id, subject_final = left(p_subject, 300), body_hash = left(p_body_hash, 100)
  where id = p_id and status = 'sending' returning * into m;
  if m.id is null then
    return;
  end if;
  perform email_stat(m.workspace_id, 'sent');
  if m.contact_id is not null then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (m.workspace_id, m.contact_id, 'email.sent', jsonb_build_object('message_id', m.id, 'email_id', m.email_id, 'subject', left(p_subject, 300)), 'email');
  end if;
end;
$$;

-- The send didn't happen (p_status failed), may have happened (unknown), or can be tried again (queued).
create or replace function public.send_failed(p_id uuid, p_status text, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('queued', 'failed', 'unknown') then
    raise exception 'Unknown status';
  end if;
  update email_messages set status = p_status, error = left(p_error, 1000), sending_at = case when p_status = 'queued' then null else sending_at end
  where id = p_id and status = 'sending';
end;
$$;

-- Events from SES ------------------------------------------------------------------------------------------------

-- Pause a workspace whose complaint rate over 7 days reaches 0.2% (with at least 3 complaints, so one person's
-- click on a small send doesn't stop everything). Returns true when this call paused it.
create or replace function public.email_complaint_check(p_ws uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select coalesce(sum(sent), 0) as sent, coalesce(sum(complained), 0) as complained into s
  from email_stats where workspace_id = p_ws and day > current_date - 7;
  if s.complained >= 3 and s.complained::numeric >= 0.002 * greatest(s.sent, 1) then
    update send_limits set paused = true, paused_at = now(),
      paused_reason = format('Spam complaints reached %s%% over 7 days (%s of %s)', round(100.0 * s.complained / greatest(s.sent, 1), 2), s.complained, s.sent)
    where workspace_id = p_ws and not paused;
    if found then
      insert into audit_log (workspace_id, action, target, data) values (p_ws, 'sending.paused', p_ws::text, jsonb_build_object('sent', s.sent, 'complained', s.complained));
      return true;
    end if;
  end if;
  return false;
end;
$$;

-- One SES event (the JSON SES publishes to SNS through a configuration set). p_key is the SNS MessageId.
-- Returns {applied, type, paused}.
create or replace function public.ses_event_apply(p_key text, p_event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t text := coalesce(p_event->>'eventType', p_event->>'notificationType');
  ses_id text := p_event#>>'{mail,messageId}';
  tag_m text := p_event#>>'{mail,tags,m,0}';
  tag_ws text := p_event#>>'{mail,tags,ws,0}';
  m email_messages%rowtype;
  r jsonb;
  addr text;
  btype text;
  soft int;
  paused boolean := false;
begin
  if coalesce(p_key, '') = '' then
    raise exception 'An event key is needed';
  end if;
  insert into ses_event_keys (key) values (left(p_key, 200)) on conflict do nothing;
  if not found then
    return jsonb_build_object('applied', false, 'type', t, 'reason', 'duplicate');
  end if;
  if tag_m ~ '^[0-9a-f-]{36}$' then
    select * into m from email_messages where id = tag_m::uuid and workspace_id::text = coalesce(tag_ws, '') for update;
  end if;
  if m.id is null and ses_id is not null then
    select * into m from email_messages where ses_message_id = ses_id for update;
  end if;
  if m.id is null then
    return jsonb_build_object('applied', false, 'type', t, 'reason', 'no_message');
  end if;
  -- A message whose send wasn't recorded: SES has it, so it was sent.
  if m.status in ('unknown', 'sending') and t in ('Send', 'Delivery', 'Bounce', 'Complaint', 'DeliveryDelay') then
    update email_messages set status = 'sent', sent_at = coalesce(sent_at, (p_event#>>'{mail,timestamp}')::timestamptz, now()),
      ses_message_id = coalesce(ses_message_id, ses_id), error = null where id = m.id;
    perform email_stat(m.workspace_id, 'sent');
  elsif m.ses_message_id is null and ses_id is not null then
    update email_messages set ses_message_id = ses_id where id = m.id;
  end if;

  if t = 'Delivery' then
    update email_messages set delivered_at = coalesce(delivered_at, now()) where id = m.id and delivered_at is null;
    if found then perform email_stat(m.workspace_id, 'delivered'); end if;
  elsif t = 'Bounce' then
    btype := case when p_event#>>'{bounce,bounceType}' = 'Permanent' then 'hard' else 'soft' end;
    update email_messages set bounced = case when bounced = 'hard' then 'hard' else btype end, bounced_at = now() where id = m.id;
    perform email_stat(m.workspace_id, 'bounced');
    for r in select * from jsonb_array_elements(coalesce(p_event#>'{bounce,bouncedRecipients}', '[]')) loop
      addr := lower(trim(r->>'emailAddress'));
      continue when addr is null or addr = '';
      if btype = 'hard' then
        perform email_suppress(m.workspace_id, addr, 'bounced', 'ses');
      else
        select count(*) into soft from email_messages x where x.workspace_id = m.workspace_id and x.to_email = addr and x.bounced = 'soft' and x.bounced_at > now() - interval '30 days';
        if soft >= 3 then perform email_suppress(m.workspace_id, addr, 'bounced', 'ses'); end if;
      end if;
    end loop;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.bounced', jsonb_build_object('message_id', m.id, 'type', btype), 'email');
    end if;
  elsif t = 'Complaint' then
    update email_messages set complained_at = coalesce(complained_at, now()) where id = m.id;
    perform email_stat(m.workspace_id, 'complained');
    for r in select * from jsonb_array_elements(coalesce(p_event#>'{complaint,complainedRecipients}', jsonb_build_array(jsonb_build_object('emailAddress', m.to_email)))) loop
      addr := lower(trim(r->>'emailAddress'));
      continue when addr is null or addr = '';
      perform email_suppress(m.workspace_id, addr, 'complained', 'ses');
      perform email_withdraw(m.workspace_id, addr, 'ses_complaint');
    end loop;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.complained', jsonb_build_object('message_id', m.id), 'email');
    end if;
    paused := email_complaint_check(m.workspace_id);
  elsif t = 'Reject' then
    update email_messages set status = 'failed', error = left('SES rejected it: ' || coalesce(p_event#>>'{reject,reason}', ''), 1000) where id = m.id;
    perform email_stat(m.workspace_id, 'rejected');
  end if;
  return jsonb_build_object('applied', true, 'type', t, 'paused', paused, 'workspace_id', m.workspace_id);
end;
$$;

-- Unsubscribe and clicks ----------------------------------------------------------------------------------------

-- Withdraw email consent and every topic for the contacts with this address.
create or replace function public.email_withdraw(p_ws uuid, p_email text, p_source text) returns void
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  b text;
begin
  for cid in select id from contacts where workspace_id = p_ws and email_clean = lower(trim(p_email)) and deleted_at is null loop
    select basis into b from consents where contact_id = cid and channel = 'email' order by at desc, id desc limit 1;
    if coalesce(b, 'none') <> 'none' then
      insert into consents (workspace_id, contact_id, channel, basis, status, source) values (p_ws, cid, 'email', b, 'withdrawn', p_source);
    end if;
    update subscriptions set status = 'unsubscribed', at = now() where contact_id = cid and status <> 'unsubscribed';
  end loop;
end;
$$;

-- The one-click unsubscribe (RFC 8058) and the page's button. Safe to call twice. Returns the workspace name.
create or replace function public.email_unsubscribe(p_message uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m email_messages%rowtype;
begin
  select * into m from email_messages where id = p_message for update;
  if m.id is null then
    return null;
  end if;
  if m.unsubscribed_at is null then
    update email_messages set unsubscribed_at = now() where id = m.id;
    perform email_suppress(m.workspace_id, m.to_email, 'unsubscribed', 'email');
    perform email_withdraw(m.workspace_id, m.to_email, 'unsubscribe_link');
    perform email_stat(m.workspace_id, 'unsubscribed');
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.unsubscribed', jsonb_build_object('message_id', m.id), 'email');
    end if;
  end if;
  return jsonb_build_object('workspace', (select name from workspaces where id = m.workspace_id));
end;
$$;

-- A click on a tracked link. p_bot: the user agent or method says it's a machine. Mail scanners also open links
-- within seconds of delivery and open several at once; those don't count as a person's click either.
create or replace function public.email_click(p_message uuid, p_url text, p_bot boolean, p_user_agent text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m email_messages%rowtype;
  human boolean;
begin
  select * into m from email_messages where id = p_message;
  if m.id is null then
    return false;
  end if;
  human := not p_bot
    and coalesce(m.delivered_at, m.sent_at, m.queued_at) < now() - interval '10 seconds'
    and (select count(*) from email_clicks k where k.message_id = m.id and k.at > now() - interval '3 seconds') = 0;
  insert into email_clicks (workspace_id, message_id, url, human, user_agent) values (m.workspace_id, m.id, left(p_url, 2000), human, left(p_user_agent, 500));
  if human then
    update email_messages set clicks = clicks + 1, first_click_at = coalesce(first_click_at, now()) where id = m.id;
    if m.first_click_at is null then
      perform email_stat(m.workspace_id, 'clicked');
    end if;
    if m.contact_id is not null then
      insert into contact_events (workspace_id, contact_id, kind, data, source)
      values (m.workspace_id, m.contact_id, 'email.clicked', jsonb_build_object('message_id', m.id, 'url', left(p_url, 2000)), 'email');
    end if;
  end if;
  return human;
end;
$$;

-- The Settings › Sending screen -------------------------------------------------------------------------------------

create or replace function public.sending_overview(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lim send_limits%rowtype;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  select * into lim from send_limits where workspace_id = p_ws;
  return jsonb_build_object(
    'settings', jsonb_build_object(
      'cap_count', coalesce(lim.cap_count, 3), 'cap_days', coalesce(lim.cap_days, 7),
      'quiet_start', coalesce(lim.quiet_start, 21), 'quiet_end', coalesce(lim.quiet_end, 8),
      'timezone', coalesce(lim.timezone, 'UTC'), 'footer_address', lim.footer_address,
      'paused', coalesce(lim.paused, false), 'paused_reason', lim.paused_reason, 'paused_at', lim.paused_at,
      'per_second', coalesce(lim.per_second, 14), 'per_day', coalesce(lim.per_day, 50000)),
    'domains', coalesce((select jsonb_agg(jsonb_build_object('id', d.id, 'domain', d.domain, 'mail_from', d.mail_from, 'region', d.region,
        'status', d.status, 'dkim_tokens', to_jsonb(d.dkim_tokens), 'checks', d.checks, 'error', d.error, 'checked_at', d.checked_at,
        'verified_at', d.verified_at) order by d.created_at) from sending_domains d where d.workspace_id = p_ws), '[]'),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by lower(t.name)) from topics t where t.workspace_id = p_ws), '[]'),
    'stats', (select jsonb_build_object('sent', coalesce(sum(sent), 0), 'delivered', coalesce(sum(delivered), 0), 'bounced', coalesce(sum(bounced), 0),
        'complained', coalesce(sum(complained), 0), 'clicked', coalesce(sum(clicked), 0), 'unsubscribed', coalesce(sum(unsubscribed), 0),
        'blocked', coalesce(sum(blocked), 0))
      from email_stats where workspace_id = p_ws and day > current_date - 7),
    'recent', coalesce((select jsonb_agg(x order by x.queued_at desc) from (
        select m.id, m.kind, m.to_email, coalesce(m.subject_final, e.subject) as subject, m.status, m.blocked_reason, m.error, m.queued_at, m.sent_at,
               m.delivered_at, m.bounced, m.complained_at, m.unsubscribed_at, m.clicks
        from email_messages m left join emails e on e.id = m.email_id where m.workspace_id = p_ws order by m.queued_at desc limit 15) x), '[]'),
    'members', coalesce((select jsonb_agg(lower(u.email) order by lower(u.email)) from workspace_members wm join auth.users u on u.id = wm.user_id
        where wm.workspace_id = p_ws and u.email is not null), '[]'));
end;
$$;

create or replace function public.prune_email() returns void
language sql security definer set search_path = public as $$
  delete from ses_event_keys where at < now() - interval '30 days';
$$;

-- Every minute ------------------------------------------------------------------------------------------------
-- Same as before, plus domain checks every 5 minutes and old SES event keys once a day.
create or replace function public.minute_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fire_due_schedules();
  if exists (select 1 from runs where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from explorations where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from plans where status = 'queued' and created_at < now() - interval '20 seconds') then
    perform wake_runner();
  end if;
  if exists (select 1 from github_checks where status = 'pending' and coalesce(synced_at, created_at) < now() - interval '1 minute') then
    perform github_sync();
  end if;
  if exists (select 1 from alert_events where sent_at is null) then
    perform alerts_send();
  end if;
  perform sources_due();
  if extract(minute from now())::int % 5 = 0 then
    perform segments_due();
    perform domains_due();
  end if;
  if extract(minute from now()) = 7 then
    perform prune_jobs();
  end if;
  if extract(hour from now()) = 3 and extract(minute from now()) = 17 then
    perform contact_events_roll();
    perform prune_history();
    perform prune_sync();
    perform prune_email();
  end if;
end;
$$;
revoke execute on function public.minute_tick() from public, anon, authenticated;

-- Grants ------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  -- Server only: the send job, SES events, unsubscribe and click routes.
  foreach f in array array[
    'email_stat(uuid, text, int)', 'email_strict_country(text)', 'valid_timezone(text)', 'email_suppress(uuid, text, text, text)',
    'sending_domain_checked(uuid, text, text[], jsonb, text, text, text)', 'domains_due()', 'email_queue(uuid, uuid, text, text, int)',
    'send_claim(uuid)', 'send_done(uuid, text, text, text)', 'send_failed(uuid, text, text)', 'email_complaint_check(uuid)',
    'ses_event_apply(text, jsonb)', 'email_withdraw(uuid, text, text)', 'email_unsubscribe(uuid)', 'email_click(uuid, text, boolean, text)',
    'prune_email()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  -- Members, each checked inside.
  foreach f in array array[
    'sending_domain_add(uuid, text)', 'sending_domain_remove(uuid)', 'sending_domain_check_now(uuid)', 'send_settings_save(uuid, jsonb)',
    'sending_resume(uuid)', 'topic_add(uuid, text)', 'topic_remove(uuid)', 'email_send_test(uuid, text, text, text, text, text)',
    'sending_overview(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
