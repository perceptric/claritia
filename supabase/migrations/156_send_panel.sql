-- The Send panel's sender and pace (docs/email-studio-plan.md, the Brew comparison, step 1).
--   emails.reply_to, emails.spread_hours   per campaign: a reply-to, and Gradual Send's hours (null: all at once).
--   email_sender_options   the workspace's verified domains, each with what's left today while it warms up (155),
--                          and the From name, address and reply-to from Settings › Sending as the defaults.
--   email_campaign_send    takes from_name, from_email (on one of the workspace's verified domains), reply_to and
--                          spread_hours. Each message carries the person's merge values (first name, last name,
--                          company, title): until now campaign messages had none, so {{first_name|there}} always
--                          read "there". With spread_hours the messages are spaced evenly over that many hours.
--   email_campaign_pause   Resume spaces what's left over what's left of the hours, so a paused Gradual Send stays
--                          gradual.

alter table public.emails add column if not exists reply_to text check (reply_to is null or (length(reply_to) <= 254 and reply_to ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));
alter table public.emails add column if not exists spread_hours int check (spread_hours is null or spread_hours between 1 and 72);

create or replace function public.email_sender_options(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  s send_settings;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into s from send_settings where workspace_id = p_ws;
  return jsonb_build_object(
    'from_name', s.from_name, 'from_email', s.from_email, 'reply_to', s.reply_to,
    'domains', coalesce((
      select jsonb_agg(jsonb_build_object('domain', d.domain, 'since', coalesce(d.verified_at, d.created_at),
        'left_today', case when domain_warm_cap(coalesce(d.verified_at, d.created_at)) is null then null
          else greatest(domain_warm_cap(coalesce(d.verified_at, d.created_at)) - domain_sent_day(p_ws, d.domain), 0) end)
        order by d.domain)
      from sending_domains d where d.workspace_id = p_ws and d.status = 'verified'), '[]'));
end;
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
    audience = jsonb_build_object('lists', to_jsonb(want), 'everyone', everyone),
    status = case when send_time > now() + interval '1 minute' then 'scheduled' else 'sending' end,
    updated_at = now()
  where id = e.id
  returning * into e;

  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, send_after, vars, reply_to)
  select p_ws, e.id, a.id, a.email_clean, e.id::text || ':' || a.id::text,
    send_time + case when spread is null then interval '0' else make_interval(secs => (row_number() over (order by a.id) - 1) * spread * 3600.0 / count(*) over ()) end,
    jsonb_build_object('first_name', a.first_name, 'last_name', a.last_name, 'title', a.title,
      'company', (select c.name from companies c where c.id = a.company_id)),
    e.reply_to
  from campaign_audience(p_ws, want, everyone) a
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
    if e.spread_hours is null then
      update email_messages set send_after = send_time where email_id = e.id and status = 'queued';
      get diagnostics n = row_count;
    else
      -- What's left goes over what's left of the hours (at least one), still evenly spaced.
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

revoke execute on function public.email_sender_options(uuid) from public, anon;
grant execute on function public.email_sender_options(uuid) to authenticated, service_role;
revoke execute on function public.email_campaign_send(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.email_campaign_send(uuid, uuid, uuid, jsonb) to service_role;
revoke execute on function public.email_campaign_pause(uuid, uuid, boolean) from public, anon;
grant execute on function public.email_campaign_pause(uuid, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
