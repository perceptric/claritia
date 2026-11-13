-- Intelligent Send (docs/email-studio-plan.md, the Brew comparison, step 4): each person gets a campaign within 24
-- hours of the start, at the hour they usually open or click.
--   audience_send_hours  for each person in an audience, the hour (UTC) to send and where it came from:
--                        'history'   the hour of their own opens and clicks in the last 180 days (a click counts 3,
--                                    an open 1, since some mail apps open every email the moment it lands);
--                        'timezone'  10 AM in their time zone when they have no history;
--                        'workspace' the hour this workspace's emails are opened most, when neither is known;
--                        'start'     the start itself, when nothing is known at all.
--   smart_time           the first time at that hour from the start, spread over the hour by person, so a thousand
--                        people with the same hour don't all go in the same minute.
--   email_audience_counts  adds `smart`: how many ready people get each kind, for the Send panel.
--   email_campaign_send  takes smart: true (not with spread_hours).
--   email_campaign_pause Resume works the times out again from now, so a paused Intelligent Send stays one.

alter table public.emails add column if not exists smart_send boolean not null default false;

create or replace function public.audience_send_hours(p_ws uuid, p_contacts uuid[]) returns table (contact_id uuid, hr int, how text)
language sql stable security definer set search_path = public as $$
  with ev as (
    select m.contact_id, extract(hour from e.at at time zone 'UTC')::int as h, sum(case when e.kind = 'clicked' then 3 else 1 end) as w
    from email_events e join email_messages m on m.id = e.message_id
    where e.workspace_id = p_ws and e.kind in ('opened', 'clicked') and e.at > now() - interval '180 days' and m.contact_id = any(p_contacts)
    group by 1, 2
  ), own as (
    select distinct on (ev.contact_id) ev.contact_id, ev.h from ev order by ev.contact_id, ev.w desc, ev.h
  ), ws_hour as (
    select extract(hour from e.at at time zone 'UTC')::int as h from email_events e
    where e.workspace_id = p_ws and e.kind in ('opened', 'clicked') and e.at > now() - interval '180 days'
    group by 1 order by sum(case when e.kind = 'clicked' then 3 else 1 end) desc, 1 limit 1
  ), zones as (
    select z.name from pg_timezone_names z where z.name in (select distinct c.timezone from contacts c where c.id = any(p_contacts) and c.timezone is not null)
  )
  select c.id,
    coalesce(own.h, case when zones.name is not null then extract(hour from ((now() at time zone zones.name)::date + time '10:00') at time zone zones.name at time zone 'UTC')::int end, (select h from ws_hour)),
    case when own.h is not null then 'history' when zones.name is not null then 'timezone' when exists (select 1 from ws_hour) then 'workspace' else 'start' end
  from contacts c
  left join own on own.contact_id = c.id
  left join zones on zones.name = c.timezone
  where c.id = any(p_contacts) and c.workspace_id = p_ws;
$$;

create or replace function public.smart_time(p_start timestamptz, p_hr int, p_contact uuid) returns timestamptz
language sql immutable set search_path = public as $$
  select case when p_hr is null then p_start else greatest(p_start,
    date_trunc('hour', p_start at time zone 'UTC') at time zone 'UTC'
      + make_interval(hours => ((p_hr - extract(hour from p_start at time zone 'UTC')::int + 24) % 24))
      + make_interval(mins => abs(hashtext(p_contact::text)) % 55)) end;
$$;

create or replace function public.email_audience_counts(p_ws uuid, p_lists uuid[], p_everyone boolean, p_topic uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select x.id, campaign_block_reason(x, p_topic) r from campaign_audience(p_ws, p_lists, p_everyone) x),
  s as (select how, count(*) n from audience_send_hours(p_ws, array(select id from a where r is null)) group by how)
  select jsonb_build_object(
    'total', (select count(*) from a),
    'ready', (select count(*) from a where r is null),
    'suppressed', (select count(*) from a where r = 'suppressed'),
    'no_consent', (select count(*) from a where r in ('withdrawn', 'no_basis')),
    'not_subscribed', (select count(*) from a where r = 'not_subscribed'),
    'room', send_month_room(p_ws),
    'smart', coalesce((select jsonb_object_agg(how, n) from s), '{}'),
    'warm', (
      select jsonb_build_object('domain', d.domain, 'since', coalesce(d.verified_at, d.created_at),
        'left_today', greatest(domain_warm_cap(coalesce(d.verified_at, d.created_at)) - domain_sent_day(p_ws, d.domain), 0))
      from send_settings st, verified_domain_for(p_ws, st.from_email) d
      where st.workspace_id = p_ws and d.id is not null and domain_warm_cap(coalesce(d.verified_at, d.created_at)) is not null));
$$;

create or replace function public.email_campaign_send(p_ws uuid, p_user uuid, p_email uuid, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  send_time timestamptz := coalesce(nullif(p_values->>'send_at', '')::timestamptz, now());
  want uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_values->'lists', '[]'))::uuid), '{}');
  everyone boolean := coalesce((p_values->>'everyone')::boolean, false);
  topic uuid := nullif(p_values->>'topic_id', '')::uuid;
  sender_name text := nullif(btrim(p_values->>'from_name'), '');
  from_addr text := nullif(lower(btrim(p_values->>'from_email')), '');
  reply text := nullif(lower(btrim(p_values->>'reply_to')), '');
  spread int := nullif(p_values->>'spread_hours', '')::int;
  smart boolean := coalesce((p_values->>'smart')::boolean, false);
  n int;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'Workspace not found'; end if;
  select * into e from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast' for update;
  if e.id is null then raise exception 'Email not found'; end if;
  if e.status <> 'draft' then
    return jsonb_build_object('queued', (select count(*) from email_messages where email_id = e.id), 'status', e.status, 'already', true);
  end if;
  if coalesce(btrim(p_values->>'subject'), '') = '' then raise exception 'Add a subject'; end if;
  if coalesce(p_values->>'html', '') = '' then raise exception 'The email is empty'; end if;
  if not everyone and cardinality(want) = 0 then raise exception 'Pick who gets it'; end if;
  if send_time > now() + interval '1 year' then raise exception 'Pick a time within a year'; end if;
  if topic is not null and not exists (select 1 from topics where id = topic and workspace_id = p_ws) then raise exception 'Topic not found'; end if;
  if exists (select 1 from unnest(want) x where not exists (select 1 from lists l where l.id = x and l.workspace_id = p_ws)) then raise exception 'List not found'; end if;
  if from_addr is not null and (from_addr !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(from_addr) > 254 or (verified_domain_for(p_ws, from_addr)).id is null) then
    raise exception 'Pick a verified domain';
  end if;
  if sender_name is not null and length(sender_name) > 80 then raise exception 'Keep the From name under 80 characters'; end if;
  if reply is not null and (reply !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(reply) > 254) then raise exception 'Check the reply-to address'; end if;
  if spread is not null and (spread < 1 or spread > 72) then raise exception 'Spread it over 1 to 72 hours'; end if;
  if smart and spread is not null then raise exception 'Pick Intelligent Send or Gradual Send'; end if;

  update emails set
    subject = left(btrim(p_values->>'subject'), 300),
    preheader = left(coalesce(p_values->>'preheader', ''), 300),
    html = p_values->>'html',
    text = coalesce(p_values->>'text', ''),
    links = coalesce(array(select jsonb_array_elements_text(coalesce(p_values->'links', '[]'))), '{}'),
    topic_id = topic,
    marketing = true,
    send_at = send_time,
    from_name = coalesce(sender_name, emails.from_name),
    from_email = coalesce(from_addr, emails.from_email),
    reply_to = coalesce(reply, emails.reply_to),
    spread_hours = spread,
    smart_send = smart,
    audience = jsonb_build_object('lists', to_jsonb(want), 'everyone', everyone),
    status = case when send_time > now() + interval '1 minute' then 'scheduled' else 'sending' end,
    updated_at = now()
  where id = e.id
  returning * into e;

  with aud as (select * from campaign_audience(p_ws, want, everyone)),
  hrs as (select * from audience_send_hours(p_ws, array(select id from aud)) where smart)
  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, send_after, vars, reply_to)
  select p_ws, e.id, a.id, a.email_clean, e.id::text || ':' || a.id::text,
    case when smart then smart_time(send_time, h.hr, a.id)
      when spread is null then send_time
      else send_time + make_interval(secs => (row_number() over (order by a.id) - 1) * spread * 3600.0 / count(*) over ()) end,
    jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name, 'title', a.title,
      'company', (select c.name from companies c where c.id = a.company_id)),
    e.reply_to
  from aud a left join hrs h on h.contact_id = a.id
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nobody is in that audience'; end if;
  perform enqueue_job(p_ws, 'send', p_ws::text, '{}', greatest(0, extract(epoch from send_time - now())::int), 3);
  return jsonb_build_object('queued', n, 'status', (select status from emails where id = e.id), 'already', false);
end;
$$;

create or replace function public.email_campaign_pause(p_ws uuid, p_email uuid, p_pause boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  n int;
  send_time timestamptz;
  total int;
  left_hours numeric;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into e from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast' and status in ('scheduled', 'sending') for update;
  if e.id is null then raise exception 'Only a scheduled or sending email can pause'; end if;
  if p_pause then
    update email_messages set send_after = 'infinity' where email_id = e.id and status = 'queued';
    get diagnostics n = row_count;
    update emails set paused_at = now(), updated_at = now() where id = e.id;
  else
    send_time := greatest(now(), coalesce(e.send_at, now()));
    if e.smart_send then
      -- Each person's hour again, from now.
      with q as (select id, contact_id from email_messages where email_id = e.id and status = 'queued'),
      h as (select * from audience_send_hours(p_ws, array(select contact_id from q where contact_id is not null)))
      update email_messages m set send_after = smart_time(send_time, h.hr, m.contact_id)
      from q left join h on h.contact_id = q.contact_id where m.id = q.id;
      get diagnostics n = row_count;
    elsif e.spread_hours is null then
      update email_messages set send_after = send_time where email_id = e.id and status = 'queued';
      get diagnostics n = row_count;
    else
      select count(*) into total from email_messages where email_id = e.id;
      left_hours := greatest(1, e.spread_hours * (select count(*) from email_messages where email_id = e.id and status = 'queued')::numeric / greatest(total, 1));
      with q as (
        select id, row_number() over (order by contact_id) - 1 as i, count(*) over () as c from email_messages where email_id = e.id and status = 'queued'
      )
      update email_messages m set send_after = send_time + make_interval(secs => q.i * left_hours * 3600.0 / q.c) from q where m.id = q.id;
      get diagnostics n = row_count;
    end if;
    update emails set paused_at = null, updated_at = now() where id = e.id;
    if n > 0 then perform enqueue_job(p_ws, 'send', p_ws::text, '{}', greatest(0, extract(epoch from send_time - now())::int), 3); end if;
  end if;
  return n;
end;
$$;

revoke execute on function public.audience_send_hours(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.audience_send_hours(uuid, uuid[]) to service_role;
revoke execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) to service_role;
revoke execute on function public.email_campaign_send(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.email_campaign_send(uuid, uuid, uuid, jsonb) to service_role;
revoke execute on function public.email_campaign_pause(uuid, uuid, boolean) from public, anon;
grant execute on function public.email_campaign_pause(uuid, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
