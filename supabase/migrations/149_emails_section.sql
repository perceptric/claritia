-- The Emails section (docs/email-studio-plan.md Part 1): the reads behind its tabs. Each runs as the caller, so the
-- tables' "members read" rules decide what comes back; nothing here writes.
--   email_campaigns     one-off emails (kind broadcast) with what happened to their messages
--   email_automations   workflows with at least one email step, and how many
--   audience_people     the people emails go to, newest first, with their email status, a page at a time
--   audience_count      how many people, for the tab's header

create or replace function public.email_campaigns(p_ws uuid) returns table (
  id uuid, name text, subject text, status text, created_at timestamptz, updated_at timestamptz, first_sent timestamptz,
  recipients int, sent int, delivered int, clicked int, unsubscribed int, bounced int, complained int
)
language sql stable set search_path = public as $$
  select e.id, e.name, e.subject, e.status, e.created_at, e.updated_at,
    min(m.sent_at),
    count(m.id)::int,
    count(m.id) filter (where m.sent_at is not null)::int,
    count(m.id) filter (where m.delivered_at is not null)::int,
    count(m.id) filter (where m.first_click_at is not null)::int,
    count(m.id) filter (where m.unsubscribed_at is not null)::int,
    count(m.id) filter (where m.bounced = 'hard' or m.status = 'bounced')::int,
    count(m.id) filter (where m.complained_at is not null)::int
  from emails e
  left join email_messages m on m.email_id = e.id
  where e.workspace_id = p_ws and e.kind = 'broadcast' and e.status <> 'archived'
  group by e.id
  order by coalesce(min(m.sent_at), e.updated_at) desc
  limit 200;
$$;

create or replace function public.email_automations(p_ws uuid) returns table (
  id uuid, name text, status text, trigger_kind text, emails int, updated_at timestamptz
)
language sql stable set search_path = public as $$
  select w.id, w.name, w.status, coalesce(w.trigger_kind, w.draft->'trigger'->>'kind'),
    ((length(w.draft::text) - length(replace(w.draft::text, '"kind": "email"', ''))) / length('"kind": "email"'))::int,
    w.updated_at
  from workflows w
  where w.workspace_id = p_ws and w.draft::text like '%"kind": "email"%'
  order by w.updated_at desc
  limit 200;
$$;

-- Status: a suppression wins (bounced, complained, unsubscribed, cleaned or by hand), then the latest email consent
-- (granted is subscribed, withdrawn is unsubscribed), else "no consent". p_before pages by created_at.
create or replace function public.audience_people(p_ws uuid, p_q text default null, p_before timestamptz default null, p_limit int default 50)
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
    and (p_before is null or c.created_at < p_before)
    and (coalesce(btrim(p_q), '') = ''
      or c.email_clean ilike '%' || lower(btrim(p_q)) || '%'
      or (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || btrim(p_q) || '%')
  order by c.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.audience_count(p_ws uuid) returns int
language sql stable set search_path = public as $$
  select count(*)::int from contacts where workspace_id = p_ws and deleted_at is null and email is not null;
$$;

revoke execute on function public.email_campaigns(uuid) from public, anon;
revoke execute on function public.email_automations(uuid) from public, anon;
revoke execute on function public.audience_people(uuid, text, timestamptz, int) from public, anon;
revoke execute on function public.audience_count(uuid) from public, anon;
grant execute on function public.email_campaigns(uuid) to authenticated, service_role;
grant execute on function public.email_automations(uuid) to authenticated, service_role;
grant execute on function public.audience_people(uuid, text, timestamptz, int) to authenticated, service_role;
grant execute on function public.audience_count(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
