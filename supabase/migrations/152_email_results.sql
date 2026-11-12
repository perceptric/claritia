-- Email results (docs/email-studio-plan.md Part 7): opens, and the meetings and form fills an email led to.
--   Opens: a 1-pixel image in each marketing email (/o/<token>, signed like click links) calls email_open, which marks
--   the message's first open and logs one 'opened' event. Mail apps that load images on their own (Apple Mail) count
--   too, so clicks and meetings stay the numbers to trust.
--   Meetings booked and forms filled: by the person an email went to, within 7 days after they first clicked one of
--   its links. Nothing in booking or forms changes; the results read it from what's already there.

alter table public.email_events drop constraint if exists email_events_kind_check;
alter table public.email_events add constraint email_events_kind_check check (kind in ('delivered', 'bounced', 'complained', 'rejected', 'delayed', 'clicked', 'unsubscribed', 'opened'));
alter table public.email_messages add column if not exists first_open_at timestamptz;

-- One open per message; a message not sent yet (a forged or early pixel) opens nothing.
create or replace function public.email_open(p_message uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m email_messages;
begin
  update email_messages set first_open_at = now()
  where id = p_message and first_open_at is null and sent_at is not null
  returning * into m;
  if m.id is null then return false; end if;
  insert into email_events (workspace_id, message_id, kind) values (m.workspace_id, m.id, 'opened');
  return true;
end;
$$;

-- What a message led to: the person's meetings booked and real form fills within 7 days after their first click.
create or replace function public.email_led_to(m email_messages) returns table (meetings int, forms int)
language sql stable set search_path = public as $$
  select
    case when m.first_click_at is null or m.contact_id is null then 0 else
      (select count(*)::int from meetings x where x.contact_id = m.contact_id and x.workspace_id = m.workspace_id
         and x.created_at >= m.first_click_at and x.created_at < m.first_click_at + interval '7 days') end,
    case when m.first_click_at is null or m.contact_id is null then 0 else
      (select count(*)::int from submissions s where s.contact_id = m.contact_id and s.workspace_id = m.workspace_id and not coalesce(s.spam, false)
         and s.created_at >= m.first_click_at and s.created_at < m.first_click_at + interval '7 days') end;
$$;

-- Campaigns (151) with opens, meetings and forms.
drop function if exists public.email_campaigns(uuid);
create or replace function public.email_campaigns(p_ws uuid) returns table (
  id uuid, name text, subject text, status text, created_at timestamptz, updated_at timestamptz, first_sent timestamptz,
  recipients int, sent int, delivered int, clicked int, unsubscribed int, bounced int, complained int, send_at timestamptz, waiting int,
  opened int, meetings int, forms int
)
language sql stable set search_path = public as $$
  select e.id, e.name, e.subject,
    case
      when e.status = 'draft' then 'draft'
      when e.paused_at is not null and count(m.id) filter (where m.status in ('queued', 'sending')) > 0 then 'paused'
      when e.status in ('scheduled', 'sending') and count(m.id) filter (where m.status in ('queued', 'sending')) = 0 then 'sent'
      when e.status in ('scheduled', 'sending') and count(m.id) filter (where m.sent_at is not null) = 0 and coalesce(e.send_at, now()) > now() then 'scheduled'
      when e.status in ('scheduled', 'sending') then 'sending'
      else e.status
    end,
    e.created_at, e.updated_at,
    min(m.sent_at),
    count(m.id)::int,
    count(m.id) filter (where m.sent_at is not null)::int,
    count(m.id) filter (where m.delivered_at is not null)::int,
    count(m.id) filter (where m.first_click_at is not null)::int,
    count(m.id) filter (where m.unsubscribed_at is not null)::int,
    count(m.id) filter (where m.bounced = 'hard' or m.status = 'bounced')::int,
    count(m.id) filter (where m.complained_at is not null)::int,
    e.send_at,
    count(m.id) filter (where m.status = 'queued')::int,
    count(m.id) filter (where m.first_open_at is not null)::int,
    coalesce(sum(l.meetings), 0)::int,
    coalesce(sum(l.forms), 0)::int
  from emails e
  left join email_messages m on m.email_id = e.id
  left join lateral email_led_to(m) l on m.first_click_at is not null
  where e.workspace_id = p_ws and e.kind = 'broadcast' and e.status <> 'archived'
  group by e.id
  order by coalesce(min(m.sent_at), e.send_at, e.updated_at) desc
  limit 200;
$$;

/*
 * One campaign's results page: the counts (as email_campaigns), the people who booked or filled a form after clicking
 * (up to 100 each, newest first) and the clicks on each link (people, not clicks; mail filters left out).
 */
create or replace function public.email_campaign_results(p_ws uuid, p_email uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  e emails;
  out jsonb;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into e from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast';
  if e.id is null then return null; end if;
  select jsonb_build_object(
    'counts', (select to_jsonb(c) from email_campaigns(p_ws) c where c.id = e.id),
    'booked', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('contact', c.id, 'name', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), 'email', c.email,
          'what', coalesce(t.name, 'A meeting'), 'at', x.created_at) x
        from email_messages m
        join contacts c on c.id = m.contact_id
        join meetings x on x.contact_id = m.contact_id and x.workspace_id = p_ws and x.created_at >= m.first_click_at and x.created_at < m.first_click_at + interval '7 days'
        left join meeting_types t on t.id = x.type_id
        where m.email_id = e.id and m.first_click_at is not null
        order by x.created_at desc limit 100) q), '[]'),
    'filled', coalesce((
      select jsonb_agg(x order by x->>'at' desc) from (
        select jsonb_build_object('contact', c.id, 'name', btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), 'email', c.email,
          'what', coalesce(f.name, 'A form'), 'at', s.created_at) x
        from email_messages m
        join contacts c on c.id = m.contact_id
        join submissions s on s.contact_id = m.contact_id and s.workspace_id = p_ws and not coalesce(s.spam, false) and s.created_at >= m.first_click_at and s.created_at < m.first_click_at + interval '7 days'
        left join forms f on f.id = s.form_id
        where m.email_id = e.id and m.first_click_at is not null
        order by s.created_at desc limit 100) q), '[]'),
    'links', coalesce((
      select jsonb_agg(jsonb_build_object('url', e.links[i], 'people', (
        select count(distinct v.message_id) from email_events v join email_messages m on m.id = v.message_id
        where m.email_id = e.id and v.kind = 'clicked' and (v.data->>'link')::int = i - 1 and coalesce((v.data->>'human')::boolean, true))) order by i)
      from generate_subscripts(e.links, 1) i), '[]'))
  into out;
  return out;
end;
$$;

revoke execute on function public.email_open(uuid) from public, anon, authenticated;
grant execute on function public.email_open(uuid) to service_role;
revoke execute on function public.email_led_to(email_messages) from public, anon;
grant execute on function public.email_led_to(email_messages) to authenticated, service_role;
revoke execute on function public.email_campaigns(uuid) from public, anon;
grant execute on function public.email_campaigns(uuid) to authenticated, service_role;
revoke execute on function public.email_campaign_results(uuid, uuid) from public, anon;
grant execute on function public.email_campaign_results(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
