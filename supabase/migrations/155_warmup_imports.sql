-- Deliverability and safety (docs/email-studio-plan.md Part 10).
--   domain_warm_cap   a newly verified domain sends at most 500 a day its first week, then twice as many each week;
--                     from week 8 there's no warm-up cap (only the plan's and the workspace's own).
--   domain_sent_day   what a domain sent (or is sending) in the last 24 hours: every kind counts.
--   send_claim        145's, plus the warm-up: campaign messages over the domain's cap stay queued and are tried
--                     again an hour later. Meeting emails, workflow emails, alerts and replies are never held, but
--                     they count, and they're claimed before campaign messages. Claims for one workspace take turns,
--                     so two at once can't both use the same room.
--   email_audience_counts  adds `warm` for the From domain while it warms up: when it was verified and what's left
--                     today, so the Send panel can show the days a big first campaign takes.
--   contact_imports   pasted people without consent, brought in by someone who isn't an owner, wait here for an
--                     owner to add or discard them (src/app/api/emails/import).

create or replace function public.domain_warm_cap(p_verified timestamptz, p_now timestamptz default now()) returns int
language sql immutable set search_path = public as $$
  select case when p_verified is null then null
    when floor(extract(epoch from (p_now - p_verified)) / 604800) >= 7 then null
    else (500 * power(2, greatest(floor(extract(epoch from (p_now - p_verified)) / 604800), 0)))::int end;
$$;

create or replace function public.domain_sent_day(p_ws uuid, p_domain text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from email_messages x
  join emails e on e.id = x.email_id
  left join send_settings s on s.workspace_id = x.workspace_id
  where x.workspace_id = p_ws
    and (x.sent_at > now() - interval '1 day' or x.status = 'sending')
    and (lower(split_part(coalesce(e.from_email, s.from_email), '@', 2)) = p_domain
      or lower(split_part(coalesce(e.from_email, s.from_email), '@', 2)) like '%.' || p_domain);
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
  warm jsonb := '{}';
  cap int;
  left_n int;
begin
  -- One claim at a time per workspace: the warm-up and daily counts read what the last claim took.
  perform pg_advisory_xact_lock(hashtextextended('send_claim:' || p_ws::text, 0));
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where workspace_id = p_ws and status = 'sending' and claimed_at < now() - interval '10 minutes';

  select * into s from send_settings where workspace_id = p_ws;
  if s.workspace_id is null or s.paused then return out; end if;
  room := s.per_day - (select count(*) from email_messages where workspace_id = p_ws and sent_at > now() - interval '1 day');
  -- The plan's emails this month: past it, messages stay queued (never skipped) until the month turns or an upgrade.
  room := least(room, coalesce(send_month_room(p_ws), room));
  if room <= 0 then return out; end if;

  for m in
    select x.id, x.to_email, x.contact_id, x.email_id, x.vars, x.from_name, x.reply_to, x.sender_user, e.kind, coalesce(e.from_email, s.from_email) as from_addr
    from email_messages x join emails e on e.id = x.email_id
    where x.workspace_id = p_ws and x.status = 'queued' and x.send_after <= now()
    -- Meeting, workflow and other emails first, so they never wait behind a big campaign.
    order by (e.kind = 'broadcast'), x.send_after, x.id
    limit least(greatest(coalesce(p_limit, 14), 1), room, 200)
    for update of x skip locked
  loop
    select * into d from verified_domain_for(p_ws, m.from_addr);
    cap := domain_warm_cap(coalesce(d.verified_at, d.created_at));
    if d.id is not null and cap is not null and not warm ? d.id::text then
      warm := warm || jsonb_build_object(d.id::text, greatest(cap - domain_sent_day(p_ws, d.domain), 0));
    end if;
    left_n := case when d.id is not null and warm ? d.id::text then (warm->>d.id::text)::int end;
    -- Warm-up: a campaign waits for the domain's room; everything else goes.
    if m.kind = 'broadcast' and left_n is not null and left_n <= 0 then
      update email_messages set send_after = now() + interval '1 hour' where id = m.id;
      continue;
    end if;
    g := email_guard(m.id);
    if g is null then
      update email_messages set status = 'sending', claimed_at = now(), attempts = attempts + 1 where id = m.id returning attempts into tries;
      if left_n is not null then warm := warm || jsonb_build_object(d.id::text, left_n - 1); end if;
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

create or replace function public.email_audience_counts(p_ws uuid, p_lists uuid[], p_everyone boolean, p_topic uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'ready', count(*) filter (where r is null),
    'suppressed', count(*) filter (where r = 'suppressed'),
    'no_consent', count(*) filter (where r in ('withdrawn', 'no_basis')),
    'not_subscribed', count(*) filter (where r = 'not_subscribed'),
    'room', send_month_room(p_ws),
    'warm', (
      select jsonb_build_object('domain', d.domain, 'since', coalesce(d.verified_at, d.created_at),
        'left_today', greatest(domain_warm_cap(coalesce(d.verified_at, d.created_at)) - domain_sent_day(p_ws, d.domain), 0))
      from send_settings st, verified_domain_for(p_ws, st.from_email) d
      where st.workspace_id = p_ws and d.id is not null and domain_warm_cap(coalesce(d.verified_at, d.created_at)) is not null))
  from (select campaign_block_reason(a, p_topic) r from campaign_audience(p_ws, p_lists, p_everyone) a) x;
$$;

create table if not exists public.contact_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  list_id uuid not null references public.lists (id) on delete cascade,
  people jsonb not null check (jsonb_typeof(people) = 'array' and jsonb_array_length(people) between 1 and 2000),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists contact_imports_ws on public.contact_imports (workspace_id, created_at);
alter table public.contact_imports enable row level security;
drop policy if exists "members read" on public.contact_imports;
create policy "members read" on public.contact_imports for select using (is_member(workspace_id));
grant select on public.contact_imports to authenticated;

revoke execute on function public.domain_sent_day(uuid, text) from public, anon, authenticated;
grant execute on function public.domain_sent_day(uuid, text) to service_role;
revoke execute on function public.send_claim(uuid, int) from public, anon, authenticated;
grant execute on function public.send_claim(uuid, int) to service_role;
revoke execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) to service_role;

notify pgrst, 'reload schema';
