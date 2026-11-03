-- Reports (docs/enrich-workflows-reports.md Part 3): form views and starts, first touch on contacts, the site_daily
-- writer, and one function per page (Funnel, Speed to lead, Reps, Forms, Email) plus the contacts behind a number.
-- Run after 069. Safe to run more than once.
--
--   form_daily       views and starts per form and day (the workspace's day), from the form's own beacons
--   form_seen        the last view and start per visitor and form, so a reload within 30 minutes adds nothing
--   site_rolled      the days site_daily holds for a workspace; other days are read live from sessions
--   contacts.first_touch  source, medium, campaign, ref_class, form_id, at: set once, never changed
--
-- Counting rules (written on each page's first screen):
--   a lead is a contact whose first form fill (or API create) falls in the range; test fills, spam, held-as-spam
--   leads and deleted contacts are left out, and a merged contact counts once, under the contact it went into
--   Qualified: stage MQL or later, or the team's first qualify outcome
--   Opportunity: a deal linked to the contact or their company, created after the lead came in
--   Won: that deal in a won stage

-- Form views and starts -----------------------------------------------------------------------------------------------

create table if not exists public.form_daily (
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  views int not null default 0,
  starts int not null default 0,
  primary key (form_id, day)
);
create index if not exists form_daily_ws on public.form_daily (workspace_id, day);
alter table public.form_daily enable row level security;
create policy "members read" on public.form_daily for select using (is_member(workspace_id));
revoke all on public.form_daily from anon;
revoke insert, update, delete on public.form_daily from authenticated;

create table if not exists public.form_seen (
  form_id uuid not null references public.forms (id) on delete cascade,
  vid text not null check (length(vid) between 8 and 64),
  kind text not null check (kind in ('view', 'start')),
  at timestamptz not null default now(),
  primary key (form_id, vid, kind)
);
alter table public.form_seen enable row level security;
revoke all on public.form_seen from anon, authenticated;

-- The workspace's time zone for day lines: its sending time zone, else UTC.
create or replace function public.ws_tz(p_ws uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select timezone from send_settings where workspace_id = p_ws and timezone is not null), 'UTC');
$$;

-- One beacon (server: the route drops bots and holds each address to a rate). Counts once per visitor, form and kind
-- every 30 minutes. Returns whether it counted.
create or replace function public.form_seen(p_form uuid, p_vid text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  hit boolean;
begin
  if p_kind not in ('view', 'start') or p_vid !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null then return false; end if;
  insert into form_seen (form_id, vid, kind, at) values (p_form, p_vid, p_kind, now())
  on conflict (form_id, vid, kind) do update set at = now() where form_seen.at < now() - interval '30 minutes'
  returning true into hit;
  if not coalesce(hit, false) then return false; end if;
  insert into form_daily (form_id, workspace_id, day, views, starts)
  values (p_form, f.workspace_id, (now() at time zone ws_tz(f.workspace_id))::date, (p_kind = 'view')::int, (p_kind = 'start')::int)
  on conflict (form_id, day) do update set views = form_daily.views + excluded.views, starts = form_daily.starts + excluded.starts;
  return true;
end;
$$;

-- First touch ---------------------------------------------------------------------------------------------------------

alter table public.contacts add column if not exists first_touch jsonb;

-- From a fill: the first-touch UTMs the form kept, else the fill's own, else the referrer's host.
create or replace function public.touch_from_fill(h jsonb, p_form uuid, p_at timestamptz) returns jsonb
language sql immutable set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'source', coalesce(nullif(h->>'first_utm_source', ''), nullif(h->>'utm_source', ''), nullif(substring(h->>'referrer' from '^https?://(?:www\.)?([^/:?#]+)'), ''), 'direct'),
    'medium', coalesce(nullif(h->>'first_utm_medium', ''), nullif(h->>'utm_medium', '')),
    'campaign', coalesce(nullif(h->>'first_utm_campaign', ''), nullif(h->>'utm_campaign', '')),
    'form_id', p_form,
    'at', p_at));
$$;

-- The first real fill sets it, once.
create or replace function public.submissions_first_touch() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.contact_id is null or new.test or new.spam then return new; end if;
  update contacts set first_touch = touch_from_fill(new.hidden, new.form_id, new.created_at) where id = new.contact_id and first_touch is null;
  return new;
end;
$$;
drop trigger if exists submissions_first_touch on public.submissions;
create trigger submissions_first_touch after insert or update of contact_id on public.submissions for each row execute function public.submissions_first_touch();

-- Contacts with no fill: their first visit's source, else how they were created. Run by the nightly job for contacts
-- older than 10 minutes (so a fill on its way wins), and once by this migration for everyone.
create or replace function public.first_touch_fill(p_older interval default interval '10 minutes') returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update contacts c set first_touch = coalesce(
    (select touch_from_fill(s.hidden, s.form_id, s.created_at) from submissions s where s.contact_id = c.id and not s.test and not s.spam order by s.created_at limit 1),
    (select jsonb_strip_nulls(jsonb_build_object('source', coalesce(se.source, se.referrer_host, 'direct'), 'medium', se.medium, 'campaign', se.campaign, 'ref_class', se.ref_class, 'at', se.started_at))
       from sessions se where c.person_id is not null and se.workspace_id = c.workspace_id and se.person_id = c.person_id and not se.is_bot and not se.internal
       order by se.started_at limit 1),
    jsonb_build_object('source', c.source, 'at', c.created_at))
  where c.first_touch is null and c.created_at < now() - p_older;
  get diagnostics n = row_count;
  return n;
end;
$$;
select first_touch_fill(interval '0 seconds');

-- site_daily writer ---------------------------------------------------------------------------------------------------

create table if not exists public.site_rolled (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null,
  at timestamptz not null default now(),
  primary key (workspace_id, day)
);
alter table public.site_rolled enable row level security;
revoke all on public.site_rolled from anon, authenticated;

-- One workspace's day (its own time zone), rebuilt from sessions. Bots and internal visits are left out.
create or replace function public.site_daily_roll(p_ws uuid, p_day date) returns int
language plpgsql security definer set search_path = public as $$
declare
  tz text := ws_tz(p_ws);
  n int;
begin
  delete from site_daily where workspace_id = p_ws and day = p_day;
  insert into site_daily (site_id, workspace_id, day, path, source, medium, campaign, ref_class, country, device_type, visitors, sessions, views, engaged_s, bounces)
  select s.site_id, p_ws, p_day, coalesce(left(s.landing_path, 300), ''), coalesce(s.source, ''), coalesce(s.medium, ''), coalesce(s.campaign, ''), coalesce(s.ref_class, ''),
    coalesce(s.country, ''), coalesce(s.device_type, ''),
    count(distinct coalesce(s.device_id::text, encode(s.cookieless_key, 'hex'))), count(*), sum(s.pageviews), sum(s.engaged_s), count(*) filter (where s.pageviews <= 1)
  from sessions s
  where s.workspace_id = p_ws and not s.is_bot and not s.internal
    and s.started_at >= (p_day::timestamp at time zone tz) and s.started_at < ((p_day + 1)::timestamp at time zone tz)
  group by 1, 4, 5, 6, 7, 8, 9, 10;
  get diagnostics n = row_count;
  insert into site_rolled (workspace_id, day) values (p_ws, p_day) on conflict (workspace_id, day) do update set at = now();
  return n;
end;
$$;

-- Nightly: yesterday's site_daily for each workspace with visits, first touch for contacts with none, old beacons out.
create or replace function public.reports_nightly() returns void
language plpgsql security definer set search_path = public as $$
declare
  w record;
begin
  for w in select distinct s.workspace_id from sessions s where s.started_at > now() - interval '2 days' loop
    perform site_daily_roll(w.workspace_id, (now() at time zone ws_tz(w.workspace_id))::date - 1);
  end loop;
  perform first_touch_fill();
  delete from form_seen where at < now() - interval '1 day';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('claritia-reports') where exists (select 1 from cron.job where jobname = 'claritia-reports');
    perform cron.schedule('claritia-reports', '17 3 * * *', 'select public.reports_nightly()');
  end if;
end;
$$;

-- Indexes for the report functions ------------------------------------------------------------------------------------

create index if not exists submissions_ws_created on public.submissions (workspace_id, created_at);
create index if not exists meetings_ws_created on public.meetings (workspace_id, created_at);
create index if not exists contacts_ws_created on public.contacts (workspace_id, created_at);
create index if not exists email_messages_ws_created on public.email_messages (workspace_id, created_at);
create index if not exists router_runs_contact on public.router_runs (contact_id) where contact_id is not null;
create index if not exists record_links_from on public.record_links (from_id);

-- Shared parts (server only) ------------------------------------------------------------------------------------------

-- A range of the workspace's days as times: [from 00:00, to + 1 day 00:00).
create or replace function public.report_bounds(p_ws uuid, p_from date, p_to date) returns tstzrange
language sql stable security definer set search_path = public as $$
  select tstzrange((p_from::timestamp at time zone ws_tz(p_ws)), ((p_to + 1)::timestamp at time zone ws_tz(p_ws)), '[)');
$$;

-- The leads that came in during a range: each contact's first real fill (or API create), merged contacts under the
-- one they went into, with that fill's form.
create or replace function public.report_leads(p_ws uuid, p_start timestamptz, p_end timestamptz)
returns table (contact_id uuid, lead_at timestamptz, form_id uuid)
language sql stable security definer set search_path = public as $$
  with touches as (
    select coalesce(c2.merged_into, c.merged_into, c.id) as root, s.created_at as at, s.form_id
    from submissions s join contacts c on c.id = s.contact_id left join contacts c2 on c2.id = c.merged_into
    where s.workspace_id = p_ws and not s.test and not s.spam
    union all
    select coalesce(c2.merged_into, c.merged_into, c.id), c.created_at, null
    from contacts c left join contacts c2 on c2.id = c.merged_into
    where c.workspace_id = p_ws and c.source = 'api'
  ), firsts as (
    select distinct on (root) root, at, form_id from touches order by root, at
  )
  select f.root, f.at, f.form_id from firsts f join contacts r on r.id = f.root
  where f.at >= p_start and f.at < p_end and r.deleted_at is null and r.route_status is distinct from 'spam';
$$;

-- Every contact id that counts as a lead's: the lead and the contacts merged into it.
create or replace function public.report_ids(p_ws uuid, p_roots uuid[]) returns table (root uuid, cid uuid)
language sql stable security definer set search_path = public as $$
  select r, r from unnest(p_roots) r
  union
  select coalesce(c2.merged_into, c.merged_into), c.id from contacts c left join contacts c2 on c2.id = c.merged_into
  where c.workspace_id = p_ws and c.merged_into is not null and coalesce(c2.merged_into, c.merged_into) = any(p_roots);
$$;

-- A fill whose contact is held as spam.
create or replace function public.report_spam(p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select route_status = 'spam' from contacts where id = p_contact), false);
$$;

-- The won stage values for opportunities.
create or replace function public.report_won_stages(p_ws uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(o->>'value'), array['won']) from fields f, jsonb_array_elements(f.options) o
  where f.workspace_id = p_ws and f.object = 'opportunity' and f.key = 'stage' and o->>'kind' = 'won';
$$;

-- Each lead with every fact the pages count: qualified, routed (and by which rule), first meeting, held, first touch
-- by a rep, opportunity and won amount, and the groups it falls under. Grouped joins, so 5,000 leads read in one pass.
create or replace function public.report_facts(p_ws uuid, p_start timestamptz, p_end timestamptz)
returns table (contact_id uuid, lead_at timestamptz, form_id uuid, source text, campaign text, owner uuid, rule_id text,
  qualified boolean, routed_at timestamptz, booked_at timestamptz, held boolean, touched_at timestamptz, opp boolean, won boolean, won_amount numeric)
language sql stable security definer set search_path = public as $$
  with l as (select * from report_leads(p_ws, p_start, p_end)),
  ids as (select i.root, i.cid, l.lead_at from report_ids(p_ws, (select coalesce(array_agg(contact_id), '{}') from l)) i join l on l.contact_id = i.root),
  q as (select outcomes->0->>'label' as first from qualify_settings where workspace_id = p_ws),
  rr as (
    select i.root, min(r.created_at) as routed_at, (array_agg(r.rule_id order by r.created_at desc))[1] as rule_id
    from router_runs r join ids i on i.cid = r.contact_id
    where r.workspace_id = p_ws and r.kind = 'owner' and r.undone_at is null group by i.root
  ),
  mt as (
    select i.root, min(m.created_at) as booked_at, bool_or(m.status = 'held') as held
    from meetings m join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.created_at >= i.lead_at and m.status <> 'pending_payment' group by i.root
  ),
  sl as (
    select i.root, min(s.acted_at) as acted from router_slas s join ids i on i.cid = s.contact_id
    where s.workspace_id = p_ws and s.acted_at >= i.lead_at group by i.root
  ),
  em as (
    select i.root, min(m.sent_at) as sent from email_messages m join emails e on e.id = m.email_id and e.kind = 'one_to_one' join ids i on i.cid = m.contact_id
    where m.workspace_id = p_ws and m.sent_at >= i.lead_at group by i.root
  ),
  opps as (
    select distinct on (x.root, x.id) x.root, x.id, x.fields from (
      select i.root, i.lead_at, r.id, r.fields, r.created_at from ids i
        join record_links k on k.to_id = i.cid and k.to_object = 'contact' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
      union all
      select l.contact_id, l.lead_at, r.id, r.fields, r.created_at from l join contacts c on c.id = l.contact_id
        join record_links k on k.to_id = c.company_id and k.to_object = 'company' and k.from_object = 'opportunity'
        join records r on r.id = k.from_id and r.deleted_at is null
    ) x where x.created_at >= x.lead_at
  ),
  op as (
    select o.root, bool_or(o.fields->>'stage' = any(report_won_stages(p_ws))) as won,
      sum(case when o.fields->>'stage' = any(report_won_stages(p_ws)) and (o.fields->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (o.fields->>'amount')::numeric else 0 end) as amount
    from opps o group by o.root
  )
  select l.contact_id, l.lead_at, l.form_id,
    coalesce(c.first_touch->>'source', c.source), c.first_touch->>'campaign', c.owner_user_id, rr.rule_id,
    (c.lifecycle in ('mql', 'sql', 'opportunity', 'customer') or (c.qualify_outcome is not null and c.qualify_outcome = (select first from q))),
    rr.routed_at, mt.booked_at, coalesce(mt.held, false), least(sl.acted, mt.booked_at, em.sent),
    op.root is not null, coalesce(op.won, false), coalesce(op.amount, 0)
  from l join contacts c on c.id = l.contact_id
  left join rr on rr.root = l.contact_id left join mt on mt.root = l.contact_id left join sl on sl.root = l.contact_id
  left join em on em.root = l.contact_id left join op on op.root = l.contact_id;
$$;

-- Visits in a range of days: rolled days from site_daily, the rest live from sessions.
create or replace function public.report_visits(p_ws uuid, p_from date, p_to date, p_by text default null)
returns table (key text, visits bigint)
language sql stable security definer set search_path = public as $$
  with b as (select report_bounds(p_ws, p_from, p_to) r, ws_tz(p_ws) tz),
  rolled as (select day from site_rolled where workspace_id = p_ws and day between p_from and p_to),
  v as (
    select case p_by when 'source' then nullif(d.source, '') when 'campaign' then nullif(d.campaign, '') end as key, d.sessions::bigint as n
    from site_daily d where d.workspace_id = p_ws and d.day in (select day from rolled)
    union all
    select case p_by when 'source' then coalesce(s.source, s.referrer_host) when 'campaign' then s.campaign end, 1
    from sessions s, b where s.workspace_id = p_ws and not s.is_bot and not s.internal and s.started_at >= lower(b.r) and s.started_at < upper(b.r)
      and (s.started_at at time zone b.tz)::date not in (select day from rolled)
  )
  select coalesce(key, case when p_by = 'source' then 'direct' else '' end), sum(n)::bigint from v group by 1;
$$;

-- Pages (members) -----------------------------------------------------------------------------------------------------

-- The numbers for one range: totals, and by p_by (source, campaign, form, rep, rule) when given.
create or replace function public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select report_bounds(p_ws, p_from, p_to) r),
  f as (
    select x.*, coalesce(case p_by when 'source' then x.source when 'campaign' then x.campaign when 'form' then x.form_id::text when 'rep' then x.owner::text when 'rule' then x.rule_id end, '') as k
    from b, report_facts(p_ws, lower(b.r), upper(b.r)) x
  ),
  fd as (select form_id::text as k, sum(views) as views, sum(starts) as starts from form_daily where workspace_id = p_ws and day between p_from and p_to group by form_id),
  vis as (select key as k, visits from report_visits(p_ws, p_from, p_to, case when p_by in ('source', 'campaign') then p_by end)),
  keys as (
    select k from f
    union select k from vis where p_by in ('source', 'campaign')
    union select k from fd where p_by = 'form'
  ),
  g as (
    select keys.k,
      count(f.contact_id) as submitted, count(*) filter (where f.qualified) as qualified, count(*) filter (where f.routed_at is not null) as routed,
      count(*) filter (where f.booked_at is not null) as booked, count(*) filter (where f.held) as held, count(*) filter (where f.opp) as opportunity,
      count(*) filter (where f.won) as won, coalesce(sum(f.won_amount), 0) as won_amount
    from keys left join f on f.k = keys.k group by keys.k
  )
  select jsonb_build_object(
    'visits', (select coalesce(sum(visits), 0) from vis),
    'views', (select coalesce(sum(views), 0) from fd),
    'starts', (select coalesce(sum(starts), 0) from fd),
    'submitted', (select count(*) from f), 'qualified', (select count(*) from f where qualified), 'routed', (select count(*) from f where routed_at is not null),
    'booked', (select count(*) from f where booked_at is not null), 'held', (select count(*) from f where held),
    'opportunity', (select count(*) from f where opp), 'won', (select count(*) from f where won), 'won_amount', (select coalesce(sum(won_amount), 0) from f))
  || case when p_by in ('source', 'campaign', 'form', 'rep', 'rule') then jsonb_build_object('groups', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', g.k,
        'visits', case when p_by in ('source', 'campaign') then coalesce((select visits from vis where vis.k = g.k), 0) end,
        'views', case when p_by = 'form' then coalesce((select views from fd where fd.k = g.k), 0) end,
        'starts', case when p_by = 'form' then coalesce((select starts from fd where fd.k = g.k), 0) end,
        'submitted', g.submitted, 'qualified', g.qualified, 'routed', g.routed, 'booked', g.booked, 'held', g.held,
        'opportunity', g.opportunity, 'won', g.won, 'won_amount', g.won_amount)) order by g.submitted desc, g.k)
    from g), '[]'::jsonb)) else '{}'::jsonb end;
$$;

-- Funnel: this range, the one before it, and leads per day.
create or replace function public.report_funnel(p_ws uuid, p_from date, p_to date, p_by text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len int := p_to - p_from + 1;
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  tz text := ws_tz(p_ws);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or len > 400 then raise exception 'Pick a range up to 400 days'; end if;
  return jsonb_build_object(
    'now', report_funnel_range(p_ws, p_from, p_to, p_by),
    'before', report_funnel_range(p_ws, p_from - len, p_from - 1, null),
    'days', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(x.n, 0)) order by d)
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select (lead_at at time zone tz)::date as day, count(*) as n from report_leads(p_ws, lower(b), upper(b)) group by 1) x on x.day = d::date),
    'tz', tz);
end;
$$;

-- Speed to lead: medians and 90th percentiles (seconds) from the fill to a rep, to first touch, to a booked meeting;
-- the share reached within the response time; a day line; and the slowest leads.
create or replace function public.report_speed_sum(p_ws uuid, p_start timestamptz, p_end timestamptz, p_facts jsonb) returns jsonb
language sql stable security definer set search_path = public as $$
  with f as (
    select (x->>'lead_at')::timestamptz as lead_at, (x->>'routed_at')::timestamptz as routed_at, (x->>'touched_at')::timestamptz as touched_at, (x->>'booked_at')::timestamptz as booked_at
    from jsonb_array_elements(p_facts) x
  ),
  s as (select x.status from router_slas x where x.workspace_id = p_ws and x.started_at >= p_start and x.started_at < p_end and x.status in ('met', 'missed'))
  select jsonb_build_object(
    'leads', count(*),
    'assigned', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from routed_at - lead_at)) filter (where routed_at is not null),
                                   'p90', percentile_cont(0.9) within group (order by extract(epoch from routed_at - lead_at)) filter (where routed_at is not null),
                                   'n', count(*) filter (where routed_at is not null)),
    'touched', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from touched_at - lead_at)) filter (where touched_at is not null),
                                  'p90', percentile_cont(0.9) within group (order by extract(epoch from touched_at - lead_at)) filter (where touched_at is not null),
                                  'n', count(*) filter (where touched_at is not null)),
    'booked', jsonb_build_object('median', percentile_cont(0.5) within group (order by extract(epoch from booked_at - lead_at)) filter (where booked_at is not null),
                                 'p90', percentile_cont(0.9) within group (order by extract(epoch from booked_at - lead_at)) filter (where booked_at is not null),
                                 'n', count(*) filter (where booked_at is not null)),
    'on_time', jsonb_build_object('met', (select count(*) from s where status = 'met'), 'total', (select count(*) from s)))
  from f;
$$;

create or replace function public.report_speed(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len int := p_to - p_from + 1;
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  pb tstzrange := report_bounds(p_ws, p_from - len, p_from - 1);
  tz text := ws_tz(p_ws);
  cur jsonb;
  prev jsonb;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or len > 400 then raise exception 'Pick a range up to 400 days'; end if;
  select coalesce(jsonb_agg(to_jsonb(f)), '[]') into cur from report_facts(p_ws, lower(b), upper(b)) f;
  select coalesce(jsonb_agg(jsonb_build_object('lead_at', f.lead_at, 'routed_at', f.routed_at, 'touched_at', f.touched_at, 'booked_at', f.booked_at)), '[]') into prev from report_facts(p_ws, lower(pb), upper(pb)) f;
  return jsonb_build_object(
    'now', report_speed_sum(p_ws, lower(b), upper(b), cur),
    'before', report_speed_sum(p_ws, lower(pb), upper(pb), prev),
    'days', (select jsonb_agg(jsonb_build_object('day', d::date, 'median', x.m) order by d) from generate_series(p_from, p_to, interval '1 day') d
      left join (select ((f->>'lead_at')::timestamptz at time zone tz)::date as day,
                        percentile_cont(0.5) within group (order by extract(epoch from (f->>'touched_at')::timestamptz - (f->>'lead_at')::timestamptz)) as m
                 from jsonb_array_elements(cur) f where f->>'touched_at' is not null group by 1) x on x.day = d::date),
    'slowest', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), 'email', c.email_clean,
        'at', f.lead_at, 'seconds', f.secs, 'touched', f.touched) order by f.secs desc)
      from (select (x->>'contact_id')::uuid as id, (x->>'lead_at')::timestamptz as lead_at, x->>'touched_at' is not null as touched,
                   extract(epoch from coalesce((x->>'touched_at')::timestamptz, now()) - (x->>'lead_at')::timestamptz) as secs
            from jsonb_array_elements(cur) x order by 4 desc limit 10) f join contacts c on c.id = f.id), '[]'::jsonb),
    'tz', tz);
end;
$$;

-- Reps: per teammate, leads given, reached on time, meetings booked, held and no-shows, opportunities and won amount,
-- and their weekly cap.
create or replace function public.report_reps(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len int := p_to - p_from + 1;
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  won text[] := report_won_stages(p_ws);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or len > 400 then raise exception 'Pick a range up to 400 days'; end if;
  return jsonb_build_object('weeks', round(len / 7.0, 1), 'reps', coalesce((
    select jsonb_agg(r order by (r->>'leads')::int desc, r->>'id') from (
      select jsonb_build_object(
        'id', m.user_id,
        'leads', (select count(*) from router_runs rr where rr.workspace_id = p_ws and rr.owner = m.user_id and rr.kind = 'owner' and rr.undone_at is null and (rr.created_at >= lower(b) and rr.created_at < upper(b))),
        'met', (select count(*) from router_slas s where s.workspace_id = p_ws and s.user_id = m.user_id and s.status = 'met' and (s.started_at >= lower(b) and s.started_at < upper(b))),
        'timed', (select count(*) from router_slas s where s.workspace_id = p_ws and s.user_id = m.user_id and s.status in ('met', 'missed') and (s.started_at >= lower(b) and s.started_at < upper(b))),
        'booked', (select count(*) from meetings x where x.workspace_id = p_ws and m.user_id = any(x.hosts) and x.status <> 'pending_payment' and (x.created_at >= lower(b) and x.created_at < upper(b))),
        'held', (select count(*) from meetings x where x.workspace_id = p_ws and m.user_id = any(x.hosts) and x.status = 'held' and (x.start_at >= lower(b) and x.start_at < upper(b))),
        'no_show', (select count(*) from meetings x where x.workspace_id = p_ws and m.user_id = any(x.hosts) and x.status = 'no_show' and (x.start_at >= lower(b) and x.start_at < upper(b))),
        'opportunities', (select count(distinct r.id) from records r join objects o on o.id = r.object_id and o.key = 'opportunity'
            join record_links k on k.from_id = r.id and k.to_object = 'contact' join contacts c on c.id = k.to_id and c.owner_user_id = m.user_id
            where r.workspace_id = p_ws and r.deleted_at is null and (r.created_at >= lower(b) and r.created_at < upper(b))),
        'won_amount', coalesce((select sum(case when (r.fields->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (r.fields->>'amount')::numeric else 0 end) from records r
            where r.id in (select r2.id from records r2 join objects o on o.id = r2.object_id and o.key = 'opportunity'
              join record_links k on k.from_id = r2.id and k.to_object = 'contact' join contacts c on c.id = k.to_id and c.owner_user_id = m.user_id
              where r2.workspace_id = p_ws and r2.deleted_at is null and (r2.created_at >= lower(b) and r2.created_at < upper(b)) and r2.fields->>'stage' = any(won))), 0),
        'cap_week', (select cap_week from router_reps rp where rp.workspace_id = p_ws and rp.user_id = m.user_id)) as r
      from workspace_members m where m.workspace_id = p_ws) y), '[]'::jsonb));
end;
$$;

-- Forms: per form, views, starts, fills, booked and qualified; per routing rule, leads and booked.
create or replace function public.report_forms(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  len int := p_to - p_from + 1;
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  q text := (select outcomes->0->>'label' from qualify_settings where workspace_id = p_ws);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or len > 400 then raise exception 'Pick a range up to 400 days'; end if;
  return jsonb_build_object(
    'forms', coalesce((select jsonb_agg(x order by (x->>'submits')::int desc, x->>'name') from (
      select jsonb_build_object('id', f.id, 'name', f.name,
        'views', coalesce((select sum(views) from form_daily d where d.form_id = f.id and d.day between p_from and p_to), 0),
        'starts', coalesce((select sum(starts) from form_daily d where d.form_id = f.id and d.day between p_from and p_to), 0),
        'submits', (select count(*) from submissions s where s.form_id = f.id and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b)) and not report_spam(s.contact_id)),
        'booked', (select count(*) from submissions s where s.form_id = f.id and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b)) and not report_spam(s.contact_id)
                    and exists (select 1 from meetings m where m.submission_id = s.id and m.status <> 'pending_payment')),
        'qualified', (select count(distinct c.id) from submissions s join contacts c on c.id = s.contact_id and c.route_status is distinct from 'spam' where s.form_id = f.id and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b))
                    and (c.lifecycle in ('mql', 'sql', 'opportunity', 'customer') or (c.qualify_outcome is not null and c.qualify_outcome = q))),
        'people', (select count(distinct s.contact_id) from submissions s where s.form_id = f.id and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b)) and not report_spam(s.contact_id))) as x
      from forms f where f.workspace_id = p_ws) y
      where (x->>'views')::int + (x->>'submits')::int > 0), '[]'::jsonb),
    'rules', coalesce((select jsonb_agg(x order by (x->>'leads')::int desc) from (
      select jsonb_build_object('id', rr.rule_id,
        'name', (select r->>'name' from router_versions v, jsonb_array_elements(v.body->'rules'->'list') r where v.workspace_id = p_ws and r->>'id' = rr.rule_id order by v.version desc limit 1),
        'leads', count(distinct rr.contact_id),
        'booked', count(distinct rr.contact_id) filter (where exists (select 1 from meetings m where m.contact_id = rr.contact_id and m.created_at >= rr.created_at and m.status <> 'pending_payment'))) as x
      from router_runs rr where rr.workspace_id = p_ws and rr.kind = 'owner' and rr.undone_at is null and rr.rule_id is not null and (rr.created_at >= lower(b) and rr.created_at < upper(b))
      group by rr.rule_id) y), '[]'::jsonb));
end;
$$;

-- Email: per email and per workflow, sent, delivered, bounced, clicked, unsubscribed, complaints, and meetings booked
-- within 7 days of a click. Opens aren't counted.
create or replace function public.report_email(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b tstzrange := report_bounds(p_ws, p_from, p_to);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or p_to - p_from >= 400 then raise exception 'Pick a range up to 400 days'; end if;
  return (
    with re as (
      select m.email_id, (select we.workflow_id from workflow_emails we where we.email_id = m.email_id limit 1) as workflow_id,
        count(*) filter (where m.sent_at is not null) as sent, count(*) filter (where m.delivered_at is not null) as delivered, count(*) filter (where m.bounced is not null) as bounced,
        count(*) filter (where m.first_click_at is not null) as clicked, count(*) filter (where m.unsubscribed_at is not null) as unsubscribed, count(*) filter (where m.complained_at is not null) as complaints,
        count(*) filter (where m.first_click_at is not null and exists (select 1 from meetings x where x.contact_id = m.contact_id and x.status <> 'pending_payment'
          and x.created_at >= m.first_click_at and x.created_at < m.first_click_at + interval '7 days')) as meetings
      from email_messages m join emails e on e.id = m.email_id
      where m.workspace_id = p_ws and (m.created_at >= lower(b) and m.created_at < upper(b)) and e.kind in ('broadcast', 'journey')
      group by m.email_id
    )
    select jsonb_build_object(
      'emails', coalesce((select jsonb_agg(jsonb_build_object('id', r.email_id, 'name', e.name, 'subject', e.subject, 'workflow', r.workflow_id,
          'sent', r.sent, 'delivered', r.delivered, 'bounced', r.bounced, 'clicked', r.clicked, 'unsubscribed', r.unsubscribed, 'complaints', r.complaints, 'meetings', r.meetings) order by r.sent desc, e.name)
        from re r join emails e on e.id = r.email_id), '[]'::jsonb),
      'workflows', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'sent', x.sent, 'delivered', x.delivered, 'bounced', x.bounced, 'clicked', x.clicked,
          'unsubscribed', x.unsubscribed, 'complaints', x.complaints, 'meetings', x.meetings) order by x.sent desc, w.name)
        from (select workflow_id, sum(sent) sent, sum(delivered) delivered, sum(bounced) bounced, sum(clicked) clicked, sum(unsubscribed) unsubscribed, sum(complaints) complaints, sum(meetings) meetings
              from re where workflow_id is not null group by workflow_id) x join workflows w on w.id = x.workflow_id), '[]'::jsonb)));
end;
$$;

-- The contacts behind a number (up to 500). p_metric names the number:
--   funnel:   submitted, qualified, routed, booked, held, opportunity, won (p_by and p_group pick a group)
--   reps:     leads, booked, held, no_show (p_group is the rep)
--   forms:    submits, booked (p_group is the form)
--   email:    sent, delivered, bounced, clicked, unsubscribed, complaints, meetings (p_group is the email)
create or replace function public.report_people(p_ws uuid, p_from date, p_to date, p_page text, p_metric text, p_by text default null, p_group text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  b tstzrange := report_bounds(p_ws, p_from, p_to);
  ids uuid[];
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Pick a range up to 400 days'; end if;
  if p_page = 'funnel' then
    select array_agg(f.contact_id) into ids from report_facts(p_ws, lower(b), upper(b)) f
    where (p_group is null or coalesce(case p_by when 'source' then f.source when 'campaign' then f.campaign when 'form' then f.form_id::text when 'rep' then f.owner::text when 'rule' then f.rule_id end, '') = p_group)
      and case p_metric when 'submitted' then true when 'qualified' then f.qualified when 'routed' then f.routed_at is not null when 'booked' then f.booked_at is not null
        when 'held' then f.held when 'opportunity' then f.opp when 'won' then f.won else false end;
  elsif p_page = 'reps' then
    if p_metric = 'leads' then
      select array_agg(distinct rr.contact_id) into ids from router_runs rr where rr.workspace_id = p_ws and rr.owner::text = p_group and rr.kind = 'owner' and rr.undone_at is null and (rr.created_at >= lower(b) and rr.created_at < upper(b));
    else
      select array_agg(distinct x.contact_id) into ids from meetings x where x.workspace_id = p_ws and p_group = any(x.hosts::text[])
        and case p_metric when 'booked' then x.status <> 'pending_payment' and (x.created_at >= lower(b) and x.created_at < upper(b)) when 'held' then x.status = 'held' and (x.start_at >= lower(b) and x.start_at < upper(b)) when 'no_show' then x.status = 'no_show' and (x.start_at >= lower(b) and x.start_at < upper(b)) else false end;
    end if;
  elsif p_page = 'forms' then
    select array_agg(distinct s.contact_id) into ids from submissions s where s.workspace_id = p_ws and s.form_id::text = p_group and not s.test and not s.spam and (s.created_at >= lower(b) and s.created_at < upper(b)) and not report_spam(s.contact_id)
      and (p_metric = 'submits' or (p_metric = 'booked' and exists (select 1 from meetings m where m.submission_id = s.id and m.status <> 'pending_payment')));
  elsif p_page = 'email' then
    select array_agg(distinct m.contact_id) into ids from email_messages m where m.workspace_id = p_ws and m.email_id::text = p_group and (m.created_at >= lower(b) and m.created_at < upper(b))
      and case p_metric when 'sent' then m.sent_at is not null when 'delivered' then m.delivered_at is not null when 'bounced' then m.bounced is not null
        when 'clicked' then m.first_click_at is not null when 'unsubscribed' then m.unsubscribed_at is not null when 'complaints' then m.complained_at is not null
        when 'meetings' then m.first_click_at is not null and exists (select 1 from meetings x where x.contact_id = m.contact_id and x.status <> 'pending_payment' and x.created_at >= m.first_click_at and x.created_at < m.first_click_at + interval '7 days')
        else false end;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), 'email', c.email_clean, 'created_at', c.created_at) order by c.created_at desc)
    from (select * from contacts c where c.id = any(coalesce(ids, '{}')) and c.workspace_id = p_ws and c.deleted_at is null order by c.created_at desc limit 500) c), '[]'::jsonb);
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------------------

revoke execute on function public.form_seen(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.ws_tz(uuid) from public, anon, authenticated;
revoke execute on function public.submissions_first_touch() from public, anon, authenticated;
revoke execute on function public.first_touch_fill(interval) from public, anon, authenticated;
revoke execute on function public.site_daily_roll(uuid, date) from public, anon, authenticated;
revoke execute on function public.reports_nightly() from public, anon, authenticated;
revoke execute on function public.report_bounds(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.report_leads(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.report_ids(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.report_won_stages(uuid) from public, anon, authenticated;
revoke execute on function public.report_spam(uuid) from public, anon, authenticated;
revoke execute on function public.report_facts(uuid, timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function public.report_visits(uuid, date, date, text) from public, anon, authenticated;
revoke execute on function public.report_funnel_range(uuid, date, date, text) from public, anon, authenticated;
revoke execute on function public.report_speed_sum(uuid, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
revoke execute on function public.report_funnel(uuid, date, date, text) from public, anon;
revoke execute on function public.report_speed(uuid, date, date) from public, anon;
revoke execute on function public.report_reps(uuid, date, date) from public, anon;
revoke execute on function public.report_forms(uuid, date, date) from public, anon;
revoke execute on function public.report_email(uuid, date, date) from public, anon;
revoke execute on function public.report_people(uuid, date, date, text, text, text, text) from public, anon;
grant execute on function public.report_funnel(uuid, date, date, text) to authenticated;
grant execute on function public.report_speed(uuid, date, date) to authenticated;
grant execute on function public.report_reps(uuid, date, date) to authenticated;
grant execute on function public.report_forms(uuid, date, date) to authenticated;
grant execute on function public.report_email(uuid, date, date) to authenticated;
grant execute on function public.report_people(uuid, date, date, text, text, text, text) to authenticated;
grant execute on function public.form_seen(uuid, text, text) to service_role;
grant execute on function public.ws_tz(uuid) to service_role;
grant execute on function public.first_touch_fill(interval) to service_role;
grant execute on function public.site_daily_roll(uuid, date) to service_role;
grant execute on function public.reports_nightly() to service_role;
grant select, insert, update, delete on public.form_daily, public.form_seen, public.site_rolled to service_role;
