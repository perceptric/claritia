-- Screen speed (Round 1, screens): calls that let a screen open in one round trip instead of several, and counts
-- the database makes instead of the browser downloading thousands of rows to count them. Every function checks the
-- caller is a member of the workspace (is_member) and is granted to authenticated only. Safe to run twice.

-- Start-up: your workspace (made on first sign-in) and your role in it, in one call instead of three.
create or replace function public.app_start() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := ensure_workspace();
  out jsonb;
begin
  select jsonb_build_object('workspace', jsonb_build_object('id', w.id, 'name', w.name, 'features', to_jsonb(coalesce(w.features, '{}'::text[]))), 'role', m.role)
    into out
  from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid()
  where w.id = v_ws;
  if out is null then raise exception 'Workspace not found'; end if;
  return out;
end;
$$;

-- The sidebar's counts (Needs review, today's meetings) and Get started's checks, in one call instead of nine.
-- Get started only needs to know whether there is any, so those are exists checks, not counts.
create or replace function public.app_counts(p_ws uuid, p_day_from timestamptz, p_day_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return jsonb_build_object(
    'review', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status in ('held', 'unassigned') and c.deleted_at is null),
    'meetings_today', (select count(*) from meetings m where m.workspace_id = p_ws and m.status in ('booked', 'held') and m.start_at >= p_day_from and m.start_at < p_day_to),
    'calendars', (select count(*) from (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = auth.uid() limit 1) x),
    'types', (select count(*) from (select 1 from meeting_types t where t.workspace_id = p_ws limit 1) x),
    'live_forms', (select count(*) from (select 1 from forms f where f.workspace_id = p_ws and f.status = 'live' limit 1) x),
    'routing', coalesce((select r.live_version is not null and r.live_version > 0 from routers r where r.workspace_id = p_ws), false),
    'members', (select count(*) from (select 1 from workspace_members w where w.workspace_id = p_ws limit 2) x),
    'invites', (select count(*) from (select 1 from invites i where i.workspace_id = p_ws limit 1) x),
    'sources', (select count(*) from (select 1 from sources s where s.workspace_id = p_ws limit 1) x)
  );
end;
$$;

-- The live routing version's number and body in one call (Reps, Log and Held all read it).
create or replace function public.router_live_screen(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', v.version, 'body', v.body)
  from routers r join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
  where r.workspace_id = p_ws and is_member(p_ws);
$$;

-- Routing › Held: one list (held or unassigned) with each lead's latest run, and both counts, in one call.
create or replace function public.routing_held(p_ws uuid, p_mode text, p_limit int default 200) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'held', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status = 'held' and c.deleted_at is null),
    'unassigned', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status = 'unassigned' and c.deleted_at is null),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'first_name', x.first_name, 'last_name', x.last_name, 'email', x.email, 'updated_at', x.updated_at, 'run', x.run) order by x.updated_at desc)
      from (
        select c.id, c.first_name, c.last_name, c.email, c.updated_at,
          (select jsonb_build_object('id', r.id, 'kind', r.kind, 'steps', r.steps, 'created_at', r.created_at)
             from router_runs r where r.workspace_id = p_ws and r.contact_id = c.id order by r.created_at desc limit 1) run
        from contacts c
        where c.workspace_id = p_ws and c.route_status = p_mode and c.deleted_at is null
        order by c.updated_at desc
        limit least(greatest(coalesce(p_limit, 200), 1), 500)
      ) x), '[]'::jsonb)
  )
  where is_member(p_ws) and p_mode in ('held', 'unassigned');
$$;

-- Routing › Reps: every rep's settings, who has a working calendar, their hours, and the leads each got today and
-- this week (counted here instead of downloading up to 10,000 runs).
create or replace function public.routing_reps_screen(p_ws uuid, p_day timestamptz, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'reps', coalesce((select jsonb_agg(jsonb_build_object('user_id', r.user_id, 'paused_until', r.paused_until, 'out_dates', r.out_dates, 'backup', r.backup, 'cap_day', r.cap_day, 'cap_week', r.cap_week))
                      from router_reps r where r.workspace_id = p_ws), '[]'::jsonb),
    'calendar', coalesce((select jsonb_agg(distinct a.user_id) from calendar_accounts a where a.workspace_id = p_ws and a.provider <> 'zoom' and a.status = 'ok'), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('user_id', h.user_id, 'weekly', h.weekly)) from availability h where h.workspace_id = p_ws), '[]'::jsonb),
    'counts', coalesce((
      select jsonb_agg(jsonb_build_object('owner', t.owner, 'today', t.today, 'week', t.week))
      from (
        select x.owner, count(*) filter (where x.created_at >= p_day) today, count(*) week
        from router_runs x
        where x.workspace_id = p_ws and x.kind = 'owner' and x.by in ('queue', 'fallback') and x.undone_at is null and x.created_at >= p_since and x.owner is not null
        group by x.owner
      ) t), '[]'::jsonb)
  )
  where is_member(p_ws);
$$;

-- Routing › Team: how many leads each rep took in each team since a date.
create or replace function public.routing_team_turns(p_ws uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('queue_id', t.queue_id, 'owner', t.owner, 'n', t.n)), '[]'::jsonb)
  from (
    select r.queue_id, r.owner, count(*) n
    from router_runs r
    where r.workspace_id = p_ws and r.kind = 'owner' and r.undone_at is null and r.queue_id is not null and r.owner is not null and r.created_at >= p_since
    group by r.queue_id, r.owner
  ) t
  where is_member(p_ws);
$$;

-- Routing › Leads' numbers (routed, held, no rep, time to route) without the whole routing load.
create or replace function public.routing_week_stats(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select router_stats(p_ws, 7) where is_member(p_ws);
$$;

-- Meetings' cards (booked this week, held, no-shows, from forms), counted here instead of downloading 5,000 rows.
create or replace function public.meetings_week_stats(p_ws uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'booked', count(*) filter (where m.status <> 'canceled'),
    'past', count(*) filter (where m.start_at < now() and m.status <> 'canceled'),
    'held', count(*) filter (where m.start_at < now() and m.status = 'held'),
    'no_show', count(*) filter (where m.start_at < now() and m.status = 'no_show'),
    'from_forms', count(*) filter (where m.source = 'form')
  )
  from meetings m
  where m.workspace_id = p_ws and m.created_at >= p_since and is_member(p_ws);
$$;

-- A form's page: the published body, all-time submissions, failed sends per destination this week and how many pages
-- it's on, in one call that runs beside the form's own queries (they used to wait for them, then read 1,000 rows).
create or replace function public.form_page_stats(p_form uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform form_member(p_form);
  return jsonb_build_object(
    'published', (select v.body from forms f join form_versions v on v.form_id = f.id and v.version = f.version where f.id = p_form),
    'subs', (select count(*) from submissions s where s.form_id = p_form and not s.spam and not s.test),
    'failed', coalesce((
      select jsonb_object_agg(x.destination_id, x.n) from (
        select d.destination_id, count(*) n
        from form_destinations fd join deliveries d on d.destination_id = fd.id
        where fd.form_id = p_form and d.status = 'failed' and d.created_at >= now() - interval '7 days'
        group by d.destination_id
      ) x), '{}'::jsonb),
    'pages', (
      select count(distinct s.hidden->>'page') from submissions s
      where s.form_id = p_form and not s.test and not s.spam and s.created_at >= now() - interval '30 days'
        and s.hidden ? 'page' and s.hidden->>'page' !~ '/f/[0-9a-f-]{36}')
  );
end;
$$;

-- A form's sends per destination with one status since a date (Sync's "Synced 1,204 this month"), counted here.
create or replace function public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform form_member(p_form);
  return coalesce((
    select jsonb_object_agg(x.destination_id, x.n) from (
      select d.destination_id, count(*) n
      from form_destinations fd join deliveries d on d.destination_id = fd.id
      where fd.form_id = p_form and d.status = p_status and d.created_at >= p_since
      group by d.destination_id
    ) x), '{}'::jsonb);
end;
$$;

-- Share's "Seen on": up to 12 pages the form was filled on since a date, newest first, blocked sites last (it used to
-- read 500 submissions to find them).
create or replace function public.form_seen_pages(p_form uuid, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform form_member(p_form);
  return coalesce((
    select jsonb_agg(jsonb_build_array(top.key, jsonb_build_object('last', top.last, 'blocked', top.blocked)) order by top.blocked, top.last desc)
    from (
      select t.key, t.last, t.blocked
      from (
        select distinct on (k.key) k.key, k.created_at last, k.blocked
        from (
          select case when s.blocked then split_part(s.p, '/', 1) else s.p end key, s.created_at, s.blocked
          from (
            select x.created_at, x.spam and coalesce(x.spam_reason, '') = 'site' blocked,
                   regexp_replace(regexp_replace(regexp_replace(x.hidden->>'page', '^https?://', ''), '^www\.', ''), '/$', '') p
            from submissions x
            where x.form_id = p_form and not x.test and x.created_at >= p_since and x.hidden ? 'page'
          ) s
          where s.p <> '' and s.p !~ '/f/[0-9a-f-]{36}'
        ) k
        order by k.key, k.created_at desc
      ) t
      order by t.blocked, t.last desc
      limit 12
    ) top
  ), '[]'::jsonb);
end;
$$;

-- Visitors' live list, polled: only the visits that started or moved since the last look (the screen merges them in),
-- instead of the whole last day every 10 seconds. Same columns as visitors_live.
create or replace function public.visitors_live_since(p_ws uuid, p_since timestamptz, p_limit int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.started_at desc) from (
      select s.id, s.device_id, s.started_at, s.ended_at, s.country, s.city, s.ref_class, s.source, s.referrer_host, s.device_type, s.policy,
             s.account_id, a.name as account_name, a.domain as account_domain, s.account_source,
             s.person_id, p.primary_email as person_email, s.person_level, s.pageviews, s.engaged_s,
             coalesce(pv.pages, '{}') as pages,
             coalesce(pv.page_times, '{}') as page_times
      from sessions s
      left join accounts a on a.id = s.account_id
      left join persons p on p.id = s.person_id
      -- Only the session's own day tables, padded by one (as visitors_live in 086).
      left join lateral (
        select array_agg(x.path order by x.server_at) as pages, array_agg(x.server_at order by x.server_at) as page_times
        from (select e.path, e.server_at from events e
              where e.session_id = s.id and e.kind = 'view'
                and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1
              order by e.server_at limit 12) x
      ) pv on true
      where s.workspace_id = p_ws and s.started_at > now() - interval '24 hours' and greatest(s.started_at, coalesce(s.ended_at, s.started_at)) > p_since
        and not s.is_bot and not s.internal
      order by s.started_at desc
      limit least(greatest(p_limit, 1), 500)
    ) v
  ), '[]'::jsonb);
end;
$$;

-- CRM owners: every distinct owner id on the workspace's contacts and companies (it read up to 10,000 rows of each).
create or replace function public.crm_owner_ids(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb)
  from (
    select distinct owner_crm_id id from contacts where workspace_id = p_ws and owner_crm_id is not null
    union
    select distinct owner_crm_id from companies where workspace_id = p_ws and owner_crm_id is not null
  ) x
  where is_member(p_ws) and x.id <> '';
$$;

-- Signals' cards and 30-day bars: signals per day in the viewer's time zone, this week's count and the companies on
-- the site this week, counted here (the screen used to download up to 40,000 rows to count them).
create or replace function public.signals_feed_stats(p_ws uuid, p_month timestamptz, p_week timestamptz, p_tz text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz text := case when exists (select 1 from pg_timezone_names where name = p_tz) then p_tz else 'UTC' end;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  return jsonb_build_object(
    'days', coalesce((
      select jsonb_object_agg(d.dk, d.n) from (
        select to_char((s.at at time zone tz)::date, 'YYYY-MM-DD') as dk, count(*) as n
        from signals s where s.workspace_id = p_ws and s.at >= p_month
        group by 1
      ) d), '{}'::jsonb),
    'week', (select count(*) from signals s where s.workspace_id = p_ws and s.at >= p_week),
    'companies', (select count(distinct a.account_id) from account_daily a where a.workspace_id = p_ws and a.day >= (p_week at time zone tz)::date)
  );
end;
$$;

-- Enrichment's Overview: how many companies and contacts have each field, fields filled and leads qualified this
-- month, in one call (one pass over each table) instead of fourteen counts and 5,000 runs read in the browser.
create or replace function public.enrich_overview(p_ws uuid, p_month timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'companies', co.total, 'size', co.size, 'industry', co.industry, 'co_country', co.country, 'domain', co.domain,
    'contacts', ct.total, 'title', ct.title, 'seniority', ct.seniority, 'phone', ct.phone, 'ct_country', ct.country, 'company', ct.company, 'qualified', ct.qualified,
    'filled', (select coalesce(sum(cardinality(r.fields)), 0) from enrich_runs r where r.workspace_id = p_ws and r.created_at >= p_month)
  )
  from (
    select count(*) total, count(size) size, count(industry) industry, count(country) country, count(domain) domain
    from companies where workspace_id = p_ws and deleted_at is null
  ) co,
  (
    select count(*) total, count(title) title, count(seniority) seniority, count(phone) phone, count(country) country, count(company_id) company,
           count(*) filter (where qualify_outcome is not null and qualify_at >= p_month) qualified
    from contacts where workspace_id = p_ws and deleted_at is null
  ) ct
  where is_member(p_ws);
$$;

-- Enrichment's Providers: each step's hits out of tries over a window (it read 1,000 runs to count them).
create or replace function public.enrich_step_rates(p_ws uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(t.step, jsonb_build_object('hit', t.hit, 'ran', t.ran)), '{}'::jsonb)
  from (
    select s->>'step' step, count(*) filter (where s->>'result' = 'hit') hit, count(*) ran
    from enrich_runs r cross join lateral jsonb_array_elements(r.steps) s
    where r.workspace_id = p_ws and r.created_at >= p_since and s->>'result' in ('hit', 'miss')
    group by 1
  ) t
  where is_member(p_ws);
$$;

-- Grants ---------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'app_start()',
    'app_counts(uuid, timestamptz, timestamptz)',
    'router_live_screen(uuid)',
    'routing_held(uuid, text, int)',
    'routing_reps_screen(uuid, timestamptz, timestamptz)',
    'routing_team_turns(uuid, timestamptz)',
    'routing_week_stats(uuid)',
    'meetings_week_stats(uuid, timestamptz)',
    'form_page_stats(uuid)',
    'form_deliveries_by_dest(uuid, text, timestamptz)',
    'form_seen_pages(uuid, timestamptz)',
    'visitors_live_since(uuid, timestamptz, int)',
    'crm_owner_ids(uuid)',
    'signals_feed_stats(uuid, timestamptz, timestamptz, text)',
    'enrich_overview(uuid, timestamptz)',
    'enrich_step_rates(uuid, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Planning over the day tables costs more than the read (as visitors_live in 086).
alter function public.visitors_live_since(uuid, timestamptz, int) set jit = off;
