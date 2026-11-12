-- Lists and sending campaigns (docs/email-studio-plan.md Parts 4 and 5).
--
-- Lists are hand-made groups of people ("Workshop waitlist"). A campaign goes to everyone, to lists, or both. Sending
-- freezes the audience in one statement: every person becomes an email_messages row at once, so someone who joins a
-- list a minute later isn't added halfway, and a repeat of the same send queues nothing new. Every message still
-- passes email_guard when it goes (039): suppressions, consent, the topic and the frequency cap decide then, so a
-- person who unsubscribes after the send is never emailed. Scheduling is the messages' send_after.
--   Pause moves a campaign's waiting messages to send_after = infinity (the worker never claims them); Resume puts
--   them back at the scheduled time or now. Cancel takes a campaign that sent nothing back to a draft.
--   email_audience_preview counts who would get it, by the same rules email_guard applies to each person.

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists lists_name on public.lists (workspace_id, lower(name));
alter table public.lists enable row level security;
drop policy if exists "members read" on public.lists;
create policy "members read" on public.lists for select using (is_member(workspace_id));
revoke all on public.lists from anon;
revoke insert, update, delete on public.lists from authenticated;

create table if not exists public.list_members (
  list_id uuid not null references public.lists (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (list_id, contact_id)
);
create index if not exists list_members_contact on public.list_members (contact_id);
alter table public.list_members enable row level security;
drop policy if exists "members read" on public.list_members;
create policy "members read" on public.list_members for select using (is_member(workspace_id));
revoke all on public.list_members from anon;
revoke insert, update, delete on public.list_members from authenticated;

-- The CRM's static lists (034: segments of kind static) come over as lists, with their current members; their old
-- functions are replaced by the ones below.
insert into public.lists (id, workspace_id, name, created_by, created_at)
select s.id, s.workspace_id, left(btrim(s.name), 80), s.created_by, s.created_at
from public.segments s
where s.kind = 'static' and length(btrim(coalesce(s.name, ''))) > 0
  and not exists (select 1 from public.lists l where l.workspace_id = s.workspace_id and lower(l.name) = lower(left(btrim(s.name), 80)))
on conflict (id) do nothing;
insert into public.list_members (list_id, contact_id, workspace_id, added_at)
select m.segment_id, m.contact_id, m.workspace_id, m.entered_at
from public.segment_members m join public.lists l on l.id = m.segment_id
where m.left_at is null
on conflict do nothing;
drop function if exists public.list_add(uuid, uuid, text, uuid[]);
drop function if exists public.list_remove(uuid, uuid, uuid[]);

alter table public.emails add column if not exists send_at timestamptz;
alter table public.emails add column if not exists paused_at timestamptz;
alter table public.emails add column if not exists audience jsonb check (audience is null or jsonb_typeof(audience) = 'object');

-- Lists ------------------------------------------------------------------------------------------------------------

create or replace function public.list_save(p_ws uuid, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  lid uuid;
  n text := btrim(coalesce(p_name, ''));
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if length(n) not between 1 and 80 then raise exception 'Name the list'; end if;
  if exists (select 1 from lists where workspace_id = p_ws and lower(name) = lower(n) and id is distinct from p_id) then raise exception 'A list with that name exists'; end if;
  if p_id is null then
    if (select count(*) from lists where workspace_id = p_ws) >= 200 then raise exception 'Up to 200 lists'; end if;
    insert into lists (workspace_id, name, created_by) values (p_ws, n, auth.uid()) returning id into lid;
  else
    update lists set name = n where id = p_id and workspace_id = p_ws returning id into lid;
    if lid is null then raise exception 'List not found'; end if;
  end if;
  return lid;
end;
$$;

create or replace function public.list_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from lists where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

-- Add or remove people (this workspace's, by id). Answers how many changed; a repeat changes nothing.
create or replace function public.list_add(p_ws uuid, p_list uuid, p_contacts uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if not exists (select 1 from lists where id = p_list and workspace_id = p_ws) then raise exception 'List not found'; end if;
  if cardinality(p_contacts) > 5000 then raise exception 'Add up to 5,000 at a time'; end if;
  insert into list_members (list_id, contact_id, workspace_id)
  select p_list, c.id, p_ws from contacts c where c.id = any(p_contacts) and c.workspace_id = p_ws and c.deleted_at is null
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.list_remove(p_ws uuid, p_list uuid, p_contacts uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from list_members where list_id = p_list and workspace_id = p_ws and contact_id = any(p_contacts);
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.lists_overview(p_ws uuid) returns table (id uuid, name text, members int, created_at timestamptz)
language sql stable set search_path = public as $$
  select l.id, l.name, (select count(*)::int from list_members m join contacts c on c.id = m.contact_id and c.deleted_at is null where m.list_id = l.id), l.created_at
  from lists l where l.workspace_id = p_ws order by lower(l.name);
$$;

-- Audiences: everyone, or one list's people (149's read, with a list).
drop function if exists public.audience_people(uuid, text, timestamptz, int);
create or replace function public.audience_people(p_ws uuid, p_q text default null, p_before timestamptz default null, p_limit int default 50, p_list uuid default null)
returns table (
  id uuid, email text, first_name text, last_name text, source text, created_at timestamptz, status text, last_sent timestamptz
)
language sql stable set search_path = public as $$
  select c.id, c.email, c.first_name, c.last_name, c.source, c.created_at,
    coalesce(
      (select case s.reason when 'manual' then 'unsubscribed' when 'cleaned' then 'bounced' else s.reason end from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean),
      (select case k.status when 'granted' then 'subscribed' when 'withdrawn' then 'unsubscribed' else 'no consent' end
         from consents k where k.contact_id = c.id and k.channel = 'email' order by k.at desc limit 1),
      'no consent'),
    (select max(m.sent_at) from email_messages m where m.contact_id = c.id)
  from contacts c
  where c.workspace_id = p_ws and c.deleted_at is null and c.email is not null
    and (p_list is null or exists (select 1 from list_members lm where lm.list_id = p_list and lm.contact_id = c.id))
    and (p_before is null or c.created_at < p_before)
    and (coalesce(btrim(p_q), '') = ''
      or c.email_clean ilike '%' || lower(btrim(p_q)) || '%'
      or (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || btrim(p_q) || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Who a campaign goes to ---------------------------------------------------------------------------------------------

-- The audience's people: everyone with an email, or the lists' people, once each.
create or replace function public.campaign_audience(p_ws uuid, p_lists uuid[], p_everyone boolean) returns setof contacts
language sql stable set search_path = public as $$
  select c.* from contacts c
  where c.workspace_id = p_ws and c.deleted_at is null and c.email_clean is not null
    and (coalesce(p_everyone, false)
      or exists (select 1 from list_members m join lists l on l.id = m.list_id and l.workspace_id = p_ws
                 where m.contact_id = c.id and m.list_id = any(coalesce(p_lists, '{}'))));
$$;

-- Why one person wouldn't get a marketing email on this topic, by email_guard's rules (039), or null when they would.
-- The frequency cap and quiet hours are left out: they hold a message back, they don't stop it.
create or replace function public.campaign_block_reason(c contacts, p_topic uuid) returns text
language plpgsql stable set search_path = public as $$
declare
  k consents;
  sub text;
  on_default boolean;
begin
  if exists (select 1 from suppressions where workspace_id = c.workspace_id and email_clean = c.email_clean) then return 'suppressed'; end if;
  select * into k from consents where contact_id = c.id and channel = 'email' order by at desc, id desc limit 1;
  if k.id is not null and k.status = 'withdrawn' then return 'withdrawn'; end if;
  if k.id is not null and k.basis = 'none' then return 'no_basis'; end if;
  if (k.id is null or k.basis = 'legitimate_interest') and coalesce(c.country, '') <> 'US' then return 'no_basis'; end if;
  if p_topic is not null then
    select status into sub from subscriptions where contact_id = c.id and topic_id = p_topic;
    select default_on into on_default from topics where id = p_topic;
    if sub = 'unsubscribed' or (sub is null and not coalesce(on_default, false)) then return 'not_subscribed'; end if;
  end if;
  return null;
end;
$$;

create or replace function public.email_audience_preview(p_ws uuid, p_lists uuid[], p_everyone boolean, p_topic uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select jsonb_build_object(
    'total', count(*),
    'ready', count(*) filter (where r is null),
    'suppressed', count(*) filter (where r = 'suppressed'),
    'no_consent', count(*) filter (where r in ('withdrawn', 'no_basis')),
    'not_subscribed', count(*) filter (where r = 'not_subscribed'),
    'room', send_month_room(p_ws))
  into out
  from (select campaign_block_reason(a, p_topic) r from campaign_audience(p_ws, p_lists, p_everyone) a) x;
  return out;
end;
$$;

-- Sending -----------------------------------------------------------------------------------------------------------

/*
 * Send a draft (server: the route made the HTML from the draft's blocks and checked sending is ready). One
 * transaction: the draft becomes the email that goes (subject, HTML, text, links, topic), the audience is frozen into
 * messages at send_at, and the send job is queued for then. A second call for an email already sent answers what the
 * first queued and changes nothing. Answers { queued, status, already }.
 */
create or replace function public.email_campaign_send(p_ws uuid, p_user uuid, p_email uuid, p_values jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  send_time timestamptz := coalesce(nullif(p_values->>'send_at', '')::timestamptz, now());
  want uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(p_values->'lists', '[]'))::uuid), '{}');
  everyone boolean := coalesce((p_values->>'everyone')::boolean, false);
  topic uuid := nullif(p_values->>'topic_id', '')::uuid;
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

  update emails set
    subject = left(btrim(p_values->>'subject'), 300),
    preheader = left(coalesce(p_values->>'preheader', ''), 300),
    html = p_values->>'html',
    text = coalesce(p_values->>'text', ''),
    links = coalesce(array(select jsonb_array_elements_text(coalesce(p_values->'links', '[]'))), '{}'),
    topic_id = topic,
    marketing = true,
    send_at = send_time,
    audience = jsonb_build_object('lists', to_jsonb(want), 'everyone', everyone),
    status = case when send_time > now() + interval '1 minute' then 'scheduled' else 'sending' end,
    updated_at = now()
  where id = e.id;

  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, send_after)
  select p_ws, e.id, a.id, a.email_clean, e.id::text || ':' || a.id::text, send_time
  from campaign_audience(p_ws, want, everyone) a
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Nobody is in that audience'; end if;
  perform enqueue_job(p_ws, 'send', p_ws::text, '{}', greatest(0, extract(epoch from send_time - now())::int), 3);
  return jsonb_build_object('queued', n, 'status', (select status from emails where id = e.id), 'already', false);
end;
$$;

-- Pause: the waiting messages wait forever. Resume: back at the scheduled time, or now. Messages already handed to the
-- provider finish either way.
create or replace function public.email_campaign_pause(p_ws uuid, p_email uuid, p_pause boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  n int;
  send_time timestamptz;
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
    update email_messages set send_after = send_time where email_id = e.id and status = 'queued';
    get diagnostics n = row_count;
    update emails set paused_at = null, updated_at = now() where id = e.id;
    if n > 0 then perform enqueue_job(p_ws, 'send', p_ws::text, '{}', greatest(0, extract(epoch from send_time - now())::int), 3); end if;
  end if;
  return n;
end;
$$;

-- Cancel a campaign that hasn't sent anything: its messages go and it's a draft again.
create or replace function public.email_campaign_cancel(p_ws uuid, p_email uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  e emails;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into e from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast' and status in ('scheduled', 'sending') for update;
  if e.id is null then return false; end if;
  if exists (select 1 from email_messages where email_id = e.id and status not in ('queued', 'skipped')) then raise exception 'Some of it already went; pause it instead'; end if;
  delete from email_messages where email_id = e.id;
  update emails set status = 'draft', paused_at = null, updated_at = now() where id = e.id;
  return true;
end;
$$;

-- Campaigns (149) with the state people see: Draft, Scheduled, Sending, Paused or Sent, and the send time.
drop function if exists public.email_campaigns(uuid);
create or replace function public.email_campaigns(p_ws uuid) returns table (
  id uuid, name text, subject text, status text, created_at timestamptz, updated_at timestamptz, first_sent timestamptz,
  recipients int, sent int, delivered int, clicked int, unsubscribed int, bounced int, complained int, send_at timestamptz, waiting int
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
    count(m.id) filter (where m.status = 'queued')::int
  from emails e
  left join email_messages m on m.email_id = e.id
  where e.workspace_id = p_ws and e.kind = 'broadcast' and e.status <> 'archived'
  group by e.id
  order by coalesce(min(m.sent_at), e.send_at, e.updated_at) desc
  limit 200;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['list_save(uuid, uuid, text)', 'list_delete(uuid, uuid)', 'list_add(uuid, uuid, uuid[])', 'list_remove(uuid, uuid, uuid[])',
    'lists_overview(uuid)', 'audience_people(uuid, text, timestamptz, int, uuid)', 'email_audience_preview(uuid, uuid[], boolean, uuid)',
    'email_campaign_pause(uuid, uuid, boolean)', 'email_campaign_cancel(uuid, uuid)', 'email_campaigns(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['email_campaign_send(uuid, uuid, uuid, jsonb)', 'campaign_audience(uuid, uuid[], boolean)', 'campaign_block_reason(contacts, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
