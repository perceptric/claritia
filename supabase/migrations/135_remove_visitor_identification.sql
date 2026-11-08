-- 135: Visitor identification is gone. Claritia no longer tracks website visits or works out who a visitor is: no
-- tracking script, sessions, devices, page events, persons and their identifiers, IP-to-company lookups, accounts and
-- their scores, or signals. Contacts stay as the person behind each fill and booking (116), and their first touch still
-- comes from their first form fill. The team's own and partner email domains move to team_domains. Safe to run once.

-- 1. The scheduled job that kept the visit tables (partitions, daily salts, hop tokens).
do $$
begin
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'claritia-web-daily';
  end if;
end $$;
-- 2. Functions that stay, without the visit and identity parts.
CREATE OR REPLACE FUNCTION public.reports_nightly()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform first_touch_fill();
  perform prune_batch('public.form_seen', format('at < %L', now() - interval '1 day'), 1000000);
  perform prune_batch('public.form_field_sessions', format('day < %L', current_date - interval '13 months'));
end;
$function$;
CREATE OR REPLACE FUNCTION public.first_touch_fill(p_older interval DEFAULT '00:10:00'::interval)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  n int;
begin
  update contacts c set first_touch = coalesce(
    (select touch_from_fill(s.hidden, s.form_id, s.created_at) from submissions s where s.contact_id = c.id and not s.test and not s.spam order by s.created_at limit 1),
    jsonb_build_object('source', c.source, 'at', c.created_at))
  where c.first_touch is null and c.created_at < now() - p_older;
  get diagnostics n = row_count;
  return n;
end;
$function$;
CREATE OR REPLACE FUNCTION public.workflows_tick()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform workflow_scan();
  perform workflow_due();
end;
$function$;
CREATE OR REPLACE FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with b as (select report_bounds(p_ws, p_from, p_to) r),
  f as (
    select x.*, coalesce(case p_by when 'source' then x.source when 'campaign' then x.campaign when 'form' then x.form_id::text when 'rep' then x.owner::text when 'rule' then x.rule_id end, '') as k
    from b, report_facts(p_ws, lower(b.r), upper(b.r)) x
  ),
  fd as (select form_id::text as k, sum(views) as views, sum(starts) as starts from form_daily where workspace_id = p_ws and day between p_from and p_to group by form_id),
  keys as (
    select k from f
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
    'views', (select coalesce(sum(views), 0) from fd),
    'starts', (select coalesce(sum(starts), 0) from fd),
    'submitted', (select count(*) from f), 'qualified', (select count(*) from f where qualified), 'routed', (select count(*) from f where routed_at is not null),
    'booked', (select count(*) from f where booked_at is not null), 'held', (select count(*) from f where held),
    'opportunity', (select count(*) from f where opp), 'won', (select count(*) from f where won), 'won_amount', (select coalesce(sum(won_amount), 0) from f))
  || case when p_by in ('source', 'campaign', 'form', 'rep', 'rule') then jsonb_build_object('groups', coalesce((
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('key', g.k,
        'views', case when p_by = 'form' then coalesce((select views from fd where fd.k = g.k), 0) end,
        'starts', case when p_by = 'form' then coalesce((select starts from fd where fd.k = g.k), 0) end,
        'submitted', g.submitted, 'qualified', g.qualified, 'routed', g.routed, 'booked', g.booked, 'held', g.held,
        'opportunity', g.opportunity, 'won', g.won, 'won_amount', g.won_amount)) order by g.submitted desc, g.k)
    from g), '[]'::jsonb)) else '{}'::jsonb end;
$function$;
CREATE OR REPLACE FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[])
 RETURNS TABLE(contact_id uuid, fit integer, engagement integer, total integer, band text, reasons jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with s as (select * from lead_settings where workspace_id = p_ws),
  base as (
    select c.id, c.email_class, c.title,
      null::int as company_fit,
      co.industry, co.size, co.country
    from contacts c
    left join companies co on co.id = c.company_id
    where c.workspace_id = p_ws and c.id = any(p_ids) and c.deleted_at is null
  ),
  person as (
    select b.id,
      (case b.email_class when 'work' then 40 when 'own' then 40 when 'partner' then 20 when 'role' then 20 else 0 end)
      + case when cardinality((select titles from s)) = 0 then 0
             when exists (select 1 from unnest((select titles from s)) t where b.title ilike '%' || t || '%') then 60 else 0 end as pts,
      cardinality((select titles from s)) > 0 as has_titles,
      exists (select 1 from unnest((select titles from s)) t where b.title ilike '%' || t || '%') as title_hit
    from base b
  ),
  ev as (
    select e.contact_id as id, e.kind, e.at
    from contact_events e
    where e.workspace_id = p_ws and e.contact_id = any(p_ids) and e.at > now() - interval '90 days'
      and e.kind in (select jsonb_object_keys((select weights from s)))
  ),
  eng2 as (
    select x.id,
      sum(coalesce(((select weights from s)->>x.kind)::numeric, 0) * power(0.5, extract(epoch from now() - x.at) / 86400.0 / (select half_life_days from s))) as raw
    from ev x group by x.id
  ),
  counts as (
    select id, jsonb_object_agg(kind, n) as counts from (select id, kind, count(*) as n from ev group by id, kind) k group by id
  ),
  scored as (
    select b.id,
      case when b.company_fit is null then least(100, round(p.pts * case when p.has_titles then 1 else 2.5 end))::int
           else round(0.6 * b.company_fit + 0.4 * least(100, p.pts * case when p.has_titles then 1 else 2.5 end))::int end as fit,
      greatest(0, least(100, round(coalesce(e.raw, 0))))::int as engagement,
      b.company_fit, b.industry, b.size, b.country, p.title_hit, b.email_class, c.counts
    from base b join person p on p.id = b.id
    left join eng2 e on e.id = b.id
    left join counts c on c.id = b.id
  )
  select x.id, x.fit, x.engagement,
    round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement)::int as total,
    case when round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement) >= (select threshold from s) then 'hot'
         when round((select fit_weight from s) * x.fit + (1 - (select fit_weight from s)) * x.engagement) >= (select threshold from s) * 0.6 then 'warm'
         else 'cold' end,
    jsonb_strip_nulls(jsonb_build_object(
      'company_fit', x.company_fit, 'industry', x.industry, 'size', x.size, 'country', x.country,
      'work_email', x.email_class in ('work', 'own'), 'title_match', x.title_hit, 'activity', coalesce(x.counts, '{}')))
  from scored x;
$function$;
CREATE OR REPLACE FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer DEFAULT 5000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s lead_settings;
  lim int := greatest(least(coalesce(p_limit, 5000), 20000), 1);
  kinds text[];
  changed uuid[];
  sweep uuid[];
  ids uuid[];
  mk lead_score_marks;
  room int;
  n int;
  routed int := 0;
  r record;
begin
  select * into s from lead_settings where workspace_id = p_ws and enabled;
  if s.workspace_id is null then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  if exists (select 1 from scoring_models m where m.workspace_id = p_ws and m.live_version is not null) then
    return jsonb_build_object('scored', 0, 'routed', 0);
  end if;
  kinds := array(select jsonb_object_keys(s.weights));
  -- New, or did something (weighted activity or an edit) in the last day after their last score.
  select array_agg(id) into changed from (
    select u.id from (
      (select c.id, c.scored_at from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.scored_at is null limit lim)
      union
      select c.id, c.scored_at from contact_events e join contacts c on c.id = e.contact_id
      where e.workspace_id = p_ws and e.kind = any(kinds) and e.at > now() - interval '1 day'
        and c.deleted_at is null and e.at > c.scored_at
      union
      select c.id, c.scored_at from contacts c
      where c.workspace_id = p_ws and c.deleted_at is null and c.updated_at > now() - interval '1 day' and c.updated_at > c.scored_at
    ) u
    order by u.scored_at nulls first
    limit lim
  ) t;
  -- The daily pass: everyone once a day, in id order, a slice per run. It catches decay, company and settings changes.
  room := least(lim - coalesce(cardinality(changed), 0), 500);
  if room > 0 then
    insert into lead_score_marks (workspace_id) values (p_ws) on conflict (workspace_id) do nothing;
    select * into mk from lead_score_marks where workspace_id = p_ws for update;
    if mk.sweep_after is null and (mk.sweep_started_at is null or mk.sweep_started_at < now() - interval '1 day') then
      mk.sweep_after := '00000000-0000-0000-0000-000000000000';
      mk.sweep_started_at := now();
    end if;
    if mk.sweep_after is not null then
      select array_agg(c.id order by c.id) into sweep from (
        select c.id from contacts c where c.workspace_id = p_ws and c.deleted_at is null and c.id > mk.sweep_after order by c.id limit room
      ) c;
      update lead_score_marks set
        sweep_after = case when coalesce(cardinality(sweep), 0) < room then null else sweep[cardinality(sweep)] end,
        sweep_started_at = mk.sweep_started_at
      where workspace_id = p_ws;
    end if;
  end if;
  ids := array(select distinct x from unnest(coalesce(changed, '{}') || coalesce(sweep, '{}')) x);
  if cardinality(ids) = 0 then return jsonb_build_object('scored', 0, 'routed', 0); end if;
  -- Write only what changed.
  update contacts c set score = x.total, score_band = x.band, fit_score = x.fit, engagement_score = x.engagement, score_reasons = x.reasons, scored_at = now()
  from lead_score_rows(p_ws, ids) x
  where c.id = x.contact_id
    and (c.score is distinct from x.total or c.score_band is distinct from x.band or c.fit_score is distinct from x.fit
         or c.engagement_score is distinct from x.engagement or c.score_reasons is distinct from x.reasons);
  -- Picked by change and unchanged: mark scored so they aren't picked again. The daily pass writes nothing for them.
  if changed is not null then
    update contacts c set scored_at = now() where c.id = any(changed) and c.deleted_at is null and (c.scored_at is null or c.scored_at < now());
  end if;
  select count(*) into n from contacts c where c.id = any(ids) and c.workspace_id = p_ws and c.deleted_at is null;
  for r in select id from contacts where id = any(ids) and score >= s.threshold and qualified_at is null loop
    perform lead_route(r.id);
    routed := routed + 1;
  end loop;
  return jsonb_build_object('scored', n, 'routed', routed);
end;
$function$;
CREATE OR REPLACE FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  p text := format('($2#>%L)', p_path::text);
  kind text := coalesce(p_node->>'kind', case when p_node ? 'rules' then 'group' end);
  parts text[] := '{}';
  i int := 0;
  w text;
  v_oid uuid;
  n int;
begin
  if jsonb_typeof(p_node) <> 'object' then
    raise exception 'Rules are not valid';
  end if;
  if kind = 'group' then
    if p_depth > 3 then
      raise exception 'Groups go 3 levels deep';
    end if;
    if jsonb_typeof(p_node->'rules') <> 'array' or jsonb_array_length(p_node->'rules') > 30 then
      raise exception 'Rules are not valid';
    end if;
    if jsonb_array_length(p_node->'rules') = 0 then
      return 'true';
    end if;
    for i in 0..jsonb_array_length(p_node->'rules') - 1 loop
      parts := parts || ('(' || segment_sql(p_ws, p_node->'rules'->i, p_path || array['rules', i::text], p_depth + 1) || ')');
    end loop;
    return array_to_string(parts, case when p_node->>'op' = 'or' then ' or ' else ' and ' end);
  end if;

  if kind = 'field' then
    -- A contact or company field, the same filters the lists use. Their values move to this node's place.
    w := object_where(p_ws, 'contact', jsonb_build_array(p_node - 'kind'));
    return replace(w, '$2->0->', p || '->');
  end if;

  if kind = 'event' then
    if coalesce(p_node->>'event', '') !~ '^[a-z][a-z0-9_.]{1,60}$' then raise exception 'Pick an event'; end if;
    if coalesce(p_node->>'days', '') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number of days'; end if;
    if p_node->>'op' = 'none' then
      return format('not exists (select 1 from contact_events e where e.contact_id = c.id and e.kind = %1$s->>''event'' and e.at >= now() - make_interval(days => (%1$s->>''days'')::int))', p);
    end if;
    if coalesce(p_node->>'count', '1') !~ '^[0-9]{1,4}$' then raise exception 'Enter a number'; end if;
    return format('(select count(*) from contact_events e where e.contact_id = c.id and e.kind = %1$s->>''event'' and e.at >= now() - make_interval(days => (%1$s->>''days'')::int)) >= greatest(coalesce((%1$s->>''count'')::int, 1), 1)', p);
  end if;


  if kind = 'consent' then
    w := $q$(not exists (select 1 from suppressions su where su.workspace_id = c.workspace_id and su.email_clean = c.email_clean)
      and coalesce((select k.basis from consents k where k.contact_id = c.id and k.channel = 'email' order by k.at desc, k.id limit 1), 'none') <> 'none')$q$;
    return case p_node->>'state'
      when 'sendable' then w
      when 'not_sendable' then 'not ' || w
      when 'suppressed' then 'exists (select 1 from suppressions su where su.workspace_id = c.workspace_id and su.email_clean = c.email_clean)'
      else null end;
  end if;

  if kind = 'source' then
    if coalesce(p_node->>'source_id', '') !~ '^[0-9a-f-]{36}$' or not exists (select 1 from sources where id = (p_node->>'source_id')::uuid and workspace_id = p_ws) then
      raise exception 'Pick a source';
    end if;
    w := format('exists (select 1 from source_links l where l.local_id = c.id and l.object = ''contact'' and l.deleted_at is null and l.source_id = (%s->>''source_id'')::uuid)', p);
    return case when p_node->>'op' = 'not_in' then 'not ' || w else w end;
  end if;

  if kind = 'object' then
    -- A custom object record linked to the contact (either way round) that matches its own filters.
    select id into v_oid from objects where workspace_id = p_ws and key = p_node->>'object';
    if v_oid is null then raise exception 'Pick an object'; end if;
    w := object_where(p_ws, p_node->>'object', coalesce(p_node->'filters', '[]'));
    w := replace(w, '$2->', format('(%s->''filters'')->', p));
    w := format($q$exists (select 1 from records r where r.object_id = %L and r.deleted_at is null
      and exists (select 1 from record_links l where (l.from_id = r.id and l.to_id = c.id) or (l.from_id = c.id and l.to_id = r.id))
      and (%s))$q$, v_oid, w);
    return case when p_node->>'op' = 'has_not' then 'not ' || w else w end;
  end if;

  raise exception 'Unknown rule';
end;
$function$;
CREATE OR REPLACE FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  result jsonb;
  classes jsonb := field_classes(p_ws, 'contact');
  own boolean := source_class(p_source) in ('manual', 'form');
  erased int := 0;
begin
  if p_source !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Unknown source %', p_source;
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send up to 2,000 contacts at a time';
  end if;
  if p_import is not null and not exists (select 1 from imports where id = p_import and workspace_id = p_ws and status = 'running') then
    raise exception 'Import not found';
  end if;

  create temp table if not exists _rows (
    n int, email text, email_clean text, email_class text, first_name text, last_name text, title text, phone text,
    country text, region text, timezone text, lifecycle text, lead_status text, company_domain text, company_name text,
    fields jsonb, basis text, source_id text, company_id uuid, contact_id uuid, created boolean, m jsonb
  ) on commit drop;
  truncate _rows;
  insert into _rows (n, email, email_clean, email_class, first_name, last_name, title, phone, country, region, timezone, lifecycle,
                     lead_status, company_domain, company_name, fields, basis, source_id)
  select distinct on (lower(trim(r.email_clean)))
         r.n, nullif(trim(r.email), ''), lower(trim(r.email_clean)), r.email_class, nullif(trim(r.first_name), ''), nullif(trim(r.last_name), ''),
         nullif(trim(r.title), ''), nullif(trim(r.phone), ''), nullif(upper(trim(r.country)), ''), nullif(trim(r.region), ''), nullif(trim(r.timezone), ''),
         nullif(trim(r.lifecycle), ''), nullif(trim(r.lead_status), ''), nullif(lower(trim(r.company_domain)), ''), nullif(trim(r.company_name), ''),
         coalesce((select jsonb_object_agg(k, v) from jsonb_each(coalesce(r.fields, '{}')) e(k, v) where v <> 'null' and v <> '""'), '{}'),
         nullif(r.basis, ''), nullif(r.source_id, '')
  from rows from (jsonb_to_recordset(p_rows) as (email text, email_clean text, email_class text, first_name text, last_name text, title text,
         phone text, country text, region text, timezone text, lifecycle text, lead_status text, company_domain text, company_name text,
         fields jsonb, basis text, source_id text)) with ordinality as r(email, email_clean, email_class, first_name, last_name, title, phone, country, region,
         timezone, lifecycle, lead_status, company_domain, company_name, fields, basis, source_id, n)
  where coalesce(trim(r.email_clean), '') <> ''
  order by lower(trim(r.email_clean)), r.n desc;

  if not own then
    delete from _rows r where exists (select 1 from erasures e where e.workspace_id = p_ws and e.value_hash = sha256(convert_to(r.email_clean, 'UTF8')));
    get diagnostics erased = row_count;
    -- A suppressed address gets no basis from a list or a sync; only the person can opt back in.
    update _rows r set basis = 'none'
    where r.basis is not null and exists (select 1 from suppressions s where s.workspace_id = p_ws and s.email_clean = r.email_clean);
  end if;

  -- Companies: by domain, or by name when there's no domain.
  insert into companies (workspace_id, domain, name)
  select distinct on (company_domain) p_ws, company_domain, company_name
  from _rows r where company_domain is not null
  order by company_domain, (company_name is null)
  on conflict (workspace_id, domain) where domain is not null
  do update set name = coalesce(companies.name, excluded.name), updated_at = now();
  insert into companies (workspace_id, name)
  select distinct on (lower(company_name)) p_ws, company_name from _rows where company_domain is null and company_name is not null
  on conflict (workspace_id, lower(name)) where domain is null do nothing;
  update _rows r set company_id = c.id from companies c where c.workspace_id = p_ws and r.company_domain is not null and c.domain = r.company_domain;
  update _rows r set company_id = c.id from companies c
  where c.workspace_id = p_ws and r.company_domain is null and r.company_name is not null and c.domain is null and lower(c.name) = lower(r.company_name);

  -- New contacts. A concurrent writer may take an email first; those rows fall through to the update below.
  with ins as (
    insert into contacts (workspace_id, email, email_clean, email_class, first_name, last_name, title, phone, company_id, country, region, timezone,
                          lifecycle, lead_status, source, fields, import_id, source_ids, field_sources)
    select p_ws, r.email, r.email_clean, r.email_class, r.first_name, r.last_name, r.title, r.phone, r.company_id, r.country, r.region, r.timezone,
           r.lifecycle, r.lead_status, p_source, r.fields, p_import,
           case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end,
           (select coalesce(jsonb_object_agg(k, jsonb_strip_nulls(jsonb_build_object('s', p_source, 'at', now(), 'i', p_import))), '{}')
            from jsonb_object_keys(jsonb_strip_nulls(jsonb_build_object('email', r.email, 'first_name', r.first_name, 'last_name', r.last_name,
              'title', r.title, 'phone', r.phone, 'country', r.country, 'region', r.region, 'timezone', r.timezone, 'lifecycle', r.lifecycle,
              'lead_status', r.lead_status, 'company', r.company_id::text))
              || coalesce((select jsonb_object_agg('f.' || fk, fv) from jsonb_each(r.fields) f(fk, fv)), '{}')) k)
    from _rows r
    where not exists (select 1 from contacts c where c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null)
    on conflict (workspace_id, email_clean) where deleted_at is null do nothing
    returning id, email_clean
  )
  update _rows r set contact_id = ins.id, created = true from ins where ins.email_clean = r.email_clean;

  -- Existing contacts: lock, then merge by field order.
  perform 1 from contacts c join _rows r on c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null
  where r.contact_id is null for update of c;
  update _rows r set contact_id = c.id, created = false,
         m = merge_values(classes, p_source, p_import, contact_vals(c), c.field_sources,
               jsonb_strip_nulls(jsonb_build_object('email', r.email, 'first_name', r.first_name, 'last_name', r.last_name, 'title', r.title,
                 'phone', r.phone, 'country', r.country, 'region', r.region, 'timezone', r.timezone, 'lifecycle', r.lifecycle,
                 'lead_status', r.lead_status, 'company', r.company_id::text))
               || coalesce((select jsonb_object_agg('f.' || fk, fv) from jsonb_each(r.fields) f(fk, fv)), '{}'))
  from contacts c
  where r.contact_id is null and c.workspace_id = p_ws and c.email_clean = r.email_clean and c.deleted_at is null;

  update contacts c set
    email = coalesce(r.m->'vals'->>'email', c.email),
    email_class = coalesce(c.email_class, r.email_class),
    first_name = r.m->'vals'->>'first_name',
    last_name = r.m->'vals'->>'last_name',
    title = r.m->'vals'->>'title',
    phone = r.m->'vals'->>'phone',
    country = r.m->'vals'->>'country',
    region = r.m->'vals'->>'region',
    timezone = r.m->'vals'->>'timezone',
    lifecycle = r.m->'vals'->>'lifecycle',
    lead_status = r.m->'vals'->>'lead_status',
    company_id = (r.m->'vals'->>'company')::uuid,
    fields = coalesce((select jsonb_object_agg(substr(k, 3), v) from jsonb_each(r.m->'vals') e(k, v) where k like 'f.%'), '{}'),
    field_sources = r.m->'src',
    source_ids = case when r.source_id is null then c.source_ids else c.source_ids || jsonb_build_object(p_source, r.source_id) end,
    updated_at = case when jsonb_array_length(r.m->'changes') > 0 then now() else c.updated_at end
  from _rows r
  where c.id = r.contact_id and not r.created;

  insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, import_id)
  select p_ws, 'contact', r.contact_id, x->>'key', x->'old', x->'new', x->'old_source', p_source, p_import
  from _rows r cross join lateral jsonb_array_elements(r.m->'changes') x
  where not r.created;

  -- Consent: a new row only when the basis changes.
  insert into consents (workspace_id, contact_id, channel, basis, status, source, import_id)
  select p_ws, r.contact_id, 'email', r.basis, case when r.basis = 'none' then 'none' else 'granted' end, p_source, p_import
  from _rows r
  where r.contact_id is not null and r.basis in ('opt_in', 'soft_opt_in', 'legitimate_interest', 'none')
    and r.basis is distinct from (select c.basis from consents c where c.contact_id = r.contact_id and c.channel = 'email' order by c.at desc, c.id limit 1);

  -- The month's events table is made ahead every day; this covers a day the minute job didn't run.
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source, import_id)
  select p_ws, r.contact_id, 'contact.created', jsonb_strip_nulls(jsonb_build_object('import_id', p_import)), p_source, p_import from _rows r where r.created;

  select jsonb_build_object(
    'created', count(*) filter (where created),
    'updated', count(*) filter (where not created),
    'changed', count(*) filter (where not created and jsonb_array_length(m->'changes') > 0),
    'skipped_erased', erased,
    'ids', coalesce(jsonb_agg(contact_id order by n) filter (where contact_id is not null), '[]'::jsonb)
  ) into result from _rows;
  truncate _rows;
  return result;
end;
$function$;
CREATE OR REPLACE FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c contacts%rowtype;
  co uuid;
  k text;
  v_old jsonb;
  v_new jsonb;
  f fields%rowtype;
  v jsonb;
  custom jsonb := '{}';
begin
  select * into c from contacts where id = p_id and deleted_at is null for update;
  if c.id is null then
    raise exception 'Contact not found';
  end if;
  if jsonb_typeof(p_values) <> 'object' then
    raise exception 'Nothing to change';
  end if;
  for k in select jsonb_object_keys(p_values) loop
    if k not in ('email', 'email_clean', 'email_class', 'first_name', 'last_name', 'title', 'phone', 'country', 'region', 'timezone', 'lifecycle',
                 'lead_status', 'company_domain', 'company_name', 'owner', 'fields') then
      raise exception 'Unknown field %', k;
    end if;
  end loop;
  if p_values ? 'email_clean' then
    if coalesce(p_values->>'email_clean', '') = '' then
      raise exception 'A contact needs an email';
    end if;
    if exists (select 1 from contacts where workspace_id = c.workspace_id and email_clean = p_values->>'email_clean' and id <> c.id and deleted_at is null) then
      raise exception 'Another contact has this email';
    end if;
  end if;
  if p_values ? 'owner' and nullif(p_values->>'owner', '') is not null
     and not exists (select 1 from workspace_members where workspace_id = c.workspace_id and user_id::text = p_values->>'owner') then
    raise exception 'Owner: pick a teammate';
  end if;
  if p_values ? 'lifecycle' and nullif(p_values->>'lifecycle', '') is not null
     and p_values->>'lifecycle' not in ('subscriber', 'lead', 'mql', 'sql', 'opportunity', 'customer', 'evangelist', 'other') then
    raise exception 'Pick a lifecycle stage';
  end if;
  -- Custom fields, checked against their types and required switch.
  for k, v in select * from jsonb_each(coalesce(p_values->'fields', '{}')) loop
    select * into f from fields where workspace_id = c.workspace_id and object = 'contact' and key = k;
    if f.id is null then
      raise exception 'Unknown field %', k;
    end if;
    v := field_value(c.workspace_id, f.type, f.options, f.label, v);
    if v is null and f.required then
      raise exception '% is required', f.label;
    end if;
    custom := custom || jsonb_build_object(k, coalesce(v, 'null'::jsonb));
  end loop;
  if p_values ? 'company_domain' or p_values ? 'company_name' then
    if nullif(p_values->>'company_domain', '') is not null then
      insert into companies (workspace_id, domain, name)
      values (c.workspace_id, p_values->>'company_domain', nullif(p_values->>'company_name', ''))
      on conflict (workspace_id, domain) where domain is not null do update set name = coalesce(companies.name, excluded.name)
      returning id into co;
    elsif nullif(p_values->>'company_name', '') is not null then
      select id into co from companies where workspace_id = c.workspace_id and domain is null and lower(name) = lower(p_values->>'company_name');
      if co is null then
        insert into companies (workspace_id, name) values (c.workspace_id, p_values->>'company_name') returning id into co;
      end if;
    end if;
  end if;

  v_old := contact_vals(c);
  update contacts set
    email = case when p_values ? 'email' then p_values->>'email' else email end,
    email_clean = case when p_values ? 'email_clean' then p_values->>'email_clean' else email_clean end,
    email_class = case when p_values ? 'email_class' then p_values->>'email_class' else email_class end,
    first_name = case when p_values ? 'first_name' then nullif(trim(p_values->>'first_name'), '') else first_name end,
    last_name = case when p_values ? 'last_name' then nullif(trim(p_values->>'last_name'), '') else last_name end,
    title = case when p_values ? 'title' then nullif(trim(p_values->>'title'), '') else title end,
    phone = case when p_values ? 'phone' then nullif(trim(p_values->>'phone'), '') else phone end,
    country = case when p_values ? 'country' then nullif(upper(trim(p_values->>'country')), '') else country end,
    region = case when p_values ? 'region' then nullif(trim(p_values->>'region'), '') else region end,
    timezone = case when p_values ? 'timezone' then nullif(trim(p_values->>'timezone'), '') else timezone end,
    lifecycle = case when p_values ? 'lifecycle' then nullif(p_values->>'lifecycle', '') else lifecycle end,
    lead_status = case when p_values ? 'lead_status' then nullif(trim(p_values->>'lead_status'), '') else lead_status end,
    owner_user_id = case when p_values ? 'owner' then nullif(p_values->>'owner', '')::uuid else owner_user_id end,
    company_id = case when p_values ? 'company_domain' or p_values ? 'company_name' then co else company_id end,
    fields = jsonb_strip_nulls(fields || custom),
    updated_at = now()
  where id = c.id
  returning contact_vals(contacts) into v_new;

  -- Changed keys: history and sources.
  insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
  select c.workspace_id, 'contact', c.id, x.kk, v_old->x.kk, v_new->x.kk, c.field_sources->x.kk, p_source, p_by
  from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk)
  where (v_old->x.kk) is distinct from (v_new->x.kk);
  update contacts set field_sources = field_sources
    || coalesce((select jsonb_object_agg(x.kk, jsonb_strip_nulls(jsonb_build_object('s', p_source, 'at', now(), 'by', p_by)))
                 from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk)
                 where (v_old->x.kk) is distinct from (v_new->x.kk) and v_new ? x.kk), '{}')
    - array(select x.kk from (select jsonb_object_keys(v_old) union select jsonb_object_keys(v_new)) x(kk) where not v_new ? x.kk)
  where id = c.id;
end;
$function$;
CREATE OR REPLACE FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  classes jsonb := field_classes(p_ws, 'company');
  r record;
  cid uuid;
  c companies%rowtype;
  m jsonb;
  ids jsonb := '[]';
  changed int := 0;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send up to 2,000 companies at a time';
  end if;
  for r in select * from jsonb_to_recordset(p_rows) as x(domain text, name text, industry text, size text, country text, fields jsonb, source_id text) loop
    cid := null;
    r.domain := nullif(lower(trim(r.domain)), '');
    if r.domain is not null and r.domain !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then r.domain := null; end if;
    r.name := nullif(trim(left(r.name, 200)), '');
    if r.domain is null and r.name is null then
      ids := ids || 'null'::jsonb;
      continue;
    end if;
    if r.domain is not null then
      insert into companies (workspace_id, domain, name, source_ids)
      values (p_ws, r.domain, r.name,
              case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end)
      on conflict (workspace_id, domain) where domain is not null do nothing
      returning id into cid;
      if cid is null then select id into cid from companies where workspace_id = p_ws and domain = r.domain; end if;
    else
      insert into companies (workspace_id, name, source_ids) values (p_ws, r.name, case when r.source_id is null then '{}'::jsonb else jsonb_build_object(p_source, r.source_id) end)
      on conflict (workspace_id, lower(name)) where domain is null do nothing
      returning id into cid;
      if cid is null then select id into cid from companies where workspace_id = p_ws and domain is null and lower(name) = lower(r.name); end if;
    end if;
    select * into c from companies where id = cid for update;
    m := merge_values(classes, p_source, null,
      jsonb_strip_nulls(jsonb_build_object('name', c.name, 'industry', c.industry, 'size', c.size, 'country', c.country))
        || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(c.fields) e(k, v)), '{}'),
      c.field_sources,
      jsonb_strip_nulls(jsonb_build_object('name', r.name, 'industry', nullif(trim(left(r.industry, 120)), ''), 'size', nullif(trim(left(r.size, 40)), ''),
        'country', case when upper(trim(r.country)) ~ '^[A-Z]{2}$' then upper(trim(r.country)) end))
        || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(coalesce(r.fields, '{}')) e(k, v) where v <> 'null' and v <> '""'), '{}'));
    update companies set
      name = coalesce(m->'vals'->>'name', name),
      industry = m->'vals'->>'industry',
      size = m->'vals'->>'size',
      country = m->'vals'->>'country',
      fields = coalesce((select jsonb_object_agg(substr(k, 3), v) from jsonb_each(m->'vals') e(k, v) where k like 'f.%'), '{}'),
      field_sources = m->'src',
      source_ids = case when r.source_id is null then source_ids else source_ids || jsonb_build_object(p_source, r.source_id) end,
      updated_at = case when jsonb_array_length(m->'changes') > 0 then now() else updated_at end
    where id = cid;
    if jsonb_array_length(m->'changes') > 0 then
      changed := changed + 1;
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
      select p_ws, 'company', cid, x->>'key', x->'old', x->'new', x->'old_source', p_source from jsonb_array_elements(m->'changes') x;
    end if;
    ids := ids || to_jsonb(cid);
  end loop;
  return jsonb_build_object('ids', ids, 'changed', changed);
end;
$function$;
CREATE OR REPLACE FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  co companies%rowtype;
  m jsonb;
  newv jsonb;
  dom text := nullif(lower(trim(coalesce(p_company->>'domain', ''))), '');
  cid uuid;
begin
  if source_class(p_source) <> 'vendor' then raise exception 'Not a vendor source: %', p_source; end if;
  if dom is null or dom !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then return jsonb_build_object('id', null, 'changed', '[]'::jsonb); end if;
  if p_create then
    insert into companies (workspace_id, domain, name)
    values (p_ws, dom, nullif(trim(left(p_company->>'name', 200)), ''))
    on conflict (workspace_id, domain) where domain is not null do nothing
    returning id into cid;
  end if;
  if cid is null then select id into cid from companies where workspace_id = p_ws and domain = dom and deleted_at is null; end if;
  if cid is null then return jsonb_build_object('id', null, 'changed', '[]'::jsonb); end if;
  select * into co from companies where id = cid for update;
  newv := jsonb_strip_nulls(jsonb_build_object(
    'name', nullif(trim(left(p_company->>'name', 200)), ''),
    'industry', nullif(trim(left(p_company->>'industry', 120)), ''),
    'size', nullif(trim(left(p_company->>'size', 40)), ''),
    'country', case when upper(trim(p_company->>'country')) ~ '^[A-Z]{2}$' then upper(trim(p_company->>'country')) end,
    'employees', case when (p_company->>'employees') ~ '^\d{1,9}$' then (p_company->>'employees')::int end,
    'founded', case when (p_company->>'founded') ~ '^\d{4}$' and (p_company->>'founded')::int between 1600 and 2100 then (p_company->>'founded')::int end));
  m := merge_values(field_classes(p_ws, 'company'), p_source, null,
    jsonb_strip_nulls(jsonb_build_object('name', co.name, 'industry', co.industry, 'size', co.size, 'country', co.country, 'employees', co.employees, 'founded', co.founded)),
    co.field_sources, newv);
  if jsonb_array_length(m->'changes') > 0 then
    update companies set
      name = coalesce(m->'vals'->>'name', name),
      industry = m->'vals'->>'industry',
      size = m->'vals'->>'size',
      country = m->'vals'->>'country',
      employees = (m->'vals'->>'employees')::int,
      founded = (m->'vals'->>'founded')::int,
      field_sources = m->'src',
      updated_at = now()
    where id = cid;
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
    select p_ws, 'company', cid, x->>'key', x->'old', x->'new', x->'old_source', p_source from jsonb_array_elements(m->'changes') x;
  end if;
  return jsonb_build_object('id', cid, 'changed', coalesce((select jsonb_agg('company.' || (x->>'key')) from jsonb_array_elements(m->'changes') x), '[]'));
end;
$function$;
CREATE OR REPLACE FUNCTION public.form_check_start(p_form uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cid uuid;
  ws uuid;
begin
  insert into form_checks (workspace_id, form_id) select workspace_id, id from forms where id = p_form returning id, workspace_id into cid, ws;
  if cid is null then
    return null;
  end if;
  return jsonb_build_object('id', cid, 'domain', (select own_domains[1] from team_domains where workspace_id = ws));
end;
$function$;
CREATE OR REPLACE FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m meetings%rowtype;
  ec text := lower(btrim(coalesce(p_row->>'email_clean', '')));
  up jsonb;
  cid uuid;
begin
  select * into m from meetings where id = p_meeting for update;
  if m.id is null or m.contact_id is not null or ec = '' or m.status <> 'booked' then return m.contact_id; end if;
  if lower(btrim(coalesce(p_row->>'email', ''))) <> m.guest_email then return null; end if;
  if split_part(ec, '@', 2) = any (coalesce((select own_domains from team_domains where workspace_id = m.workspace_id), '{}')) then return null; end if;
  up := contacts_upsert(m.workspace_id, 'meeting', jsonb_build_array(p_row));
  cid := (up->'ids'->>0)::uuid;
  if cid is null then return null; end if;
  update meetings set contact_id = cid where id = m.id;
  perform meeting_timeline(m.id, 'meeting.booked');
  return cid;
end;
$function$;
CREATE OR REPLACE FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  parts text[] := '{true}';
  f jsonb;
  i int := 0;
  field text;
  op text;
  typ text;
  ftype text;
  expr text;
  vals text;
  v0 text;
  t text := case p_object when 'contact' then 'c' when 'company' then 'co' else 'r' end;
  fid uuid;
begin
  if p_filters is null or p_filters = 'null'::jsonb then
    return 'true';
  end if;
  if jsonb_typeof(p_filters) <> 'array' or jsonb_array_length(p_filters) > 20 then
    raise exception 'Filters are not valid';
  end if;
  for f in select * from jsonb_array_elements(p_filters) loop
    field := f->>'field';
    op := f->>'op';
    typ := null;
    expr := null;
    if jsonb_typeof(f->'values') is distinct from 'array' and f ? 'values' then
      raise exception 'Filters are not valid';
    end if;
    if field ~ '^f\.[a-z][a-z0-9_]{0,39}$' then
      select fd.type, fd.id into ftype, fid from fields fd where fd.workspace_id = p_ws and fd.object = p_object and fd.key = substr(field, 3);
      if ftype is null then
        raise exception 'Unknown filter field';
      end if;
      typ := case
        when ftype in ('number', 'currency', 'percent') then 'number'
        when ftype in ('date', 'datetime') then 'date'
        when ftype = 'checkbox' then 'bool'
        when ftype in ('select', 'user') then 'enum'
        when ftype = 'multi_select' then 'multi'
        when ftype = 'relation' then 'link'
        else 'text' end;
      expr := case typ
        when 'number' then format('try_numeric(%s.fields->>%L)', t, substr(field, 3))
        when 'date' then format('try_timestamptz(%s.fields->>%L)', t, substr(field, 3))
        when 'bool' then format('(%s.fields->>%L)::boolean', t, substr(field, 3))
        when 'multi' then format('(%s.fields->%L)', t, substr(field, 3))
        when 'link' then format('array(select l.to_id::text from record_links l where l.field_id = %L and l.from_id = %s.id)', fid, t)
        else format('(%s.fields->>%L)', t, substr(field, 3)) end;
    elsif field = 'q' then
      -- Quick search across the names people look for.
      typ := 'text';
      expr := case p_object when 'contact' then $e$concat_ws(' ', c.first_name, c.last_name, c.email, co.name)$e$
                            when 'company' then $e$concat_ws(' ', co.name, co.domain)$e$ else 'r.name' end;
    elsif p_object = 'contact' then
      case field
        when 'email' then typ := 'text'; expr := 'c.email';
        when 'name' then typ := 'text'; expr := $e$nullif(trim(concat_ws(' ', c.first_name, c.last_name)), '')$e$;
        when 'first_name' then typ := 'text'; expr := 'c.first_name';
        when 'last_name' then typ := 'text'; expr := 'c.last_name';
        when 'title' then typ := 'text'; expr := 'c.title';
        when 'phone' then typ := 'text'; expr := 'c.phone';
        when 'country' then typ := 'text'; expr := 'c.country';
        when 'region' then typ := 'text'; expr := 'c.region';
        when 'lead_status' then typ := 'enum'; expr := 'c.lead_status';
        when 'lifecycle' then typ := 'enum'; expr := 'c.lifecycle';
        when 'source' then typ := 'enum'; expr := 'c.source';
        when 'email_class' then typ := 'enum'; expr := 'c.email_class';
        when 'owner' then typ := 'enum'; expr := 'c.owner_user_id::text';
        when 'company' then typ := 'text'; expr := 'co.name';
        when 'company_domain' then typ := 'text'; expr := 'co.domain';
        when 'industry' then typ := 'text'; expr := 'co.industry';
        when 'size' then typ := 'text'; expr := 'co.size';
        when 'score' then typ := 'number'; expr := 'c.score';
        when 'segment' then typ := 'link'; expr := 'array(select m.segment_id::text from segment_members m where m.contact_id = c.id and m.left_at is null)';
        when 'created_at' then typ := 'date'; expr := 'c.created_at';
        when 'updated_at' then typ := 'date'; expr := 'c.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    elsif p_object = 'company' then
      case field
        when 'name' then typ := 'text'; expr := 'coalesce(co.name, co.domain)';
        when 'domain' then typ := 'text'; expr := 'co.domain';
        when 'industry' then typ := 'text'; expr := 'co.industry';
        when 'size' then typ := 'text'; expr := 'co.size';
        when 'country' then typ := 'text'; expr := 'co.country';
        when 'owner' then typ := 'enum'; expr := 'co.owner_user_id::text';
        when 'contacts' then typ := 'number'; expr := '(select count(*) from contacts x where x.company_id = co.id and x.deleted_at is null)';
        when 'created_at' then typ := 'date'; expr := 'co.created_at';
        when 'updated_at' then typ := 'date'; expr := 'co.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    else
      case field
        when 'name' then typ := 'text'; expr := 'r.name';
        when 'created_at' then typ := 'date'; expr := 'r.created_at';
        when 'updated_at' then typ := 'date'; expr := 'r.updated_at';
        else raise exception 'Unknown filter field';
      end case;
    end if;

    vals := format('jsonb_array_elements_text($2->%s->''values'')', i);
    v0 := format('($2->%s->''values''->>0)', i);
    if op in ('gte', 'lte') and coalesce(f->'values'->>0, '') !~ '^-?[0-9]+(\.[0-9]+)?$' then
      raise exception 'Enter a number';
    end if;
    if op in ('within', 'before') and coalesce(f->'values'->>0, '') !~ '^[0-9]{1,5}$' then
      raise exception 'Enter a number of days';
    end if;
    if op in ('is', 'is_not', 'contains') and coalesce(jsonb_array_length(f->'values'), 0) = 0 then
      raise exception 'Pick a value';
    end if;

    parts := parts || case
      when op = 'empty' and typ = 'multi' then format('coalesce(jsonb_array_length(%s), 0) = 0', expr)
      when op = 'not_empty' and typ = 'multi' then format('coalesce(jsonb_array_length(%s), 0) > 0', expr)
      when op = 'empty' and typ = 'link' then format('cardinality(%s) = 0', expr)
      when op = 'not_empty' and typ = 'link' then format('cardinality(%s) > 0', expr)
      when op = 'empty' then format('(%s is null or %s::text = '''')', expr, expr)
      when op = 'not_empty' then format('(%s is not null and %s::text <> '''')', expr, expr)
      when typ = 'text' and op = 'is' then format('lower(%s) = any(array(select lower(x) from %s x))', expr, vals)
      when typ = 'text' and op = 'is_not' then format('(%s is null or lower(%s) <> all(array(select lower(x) from %s x)))', expr, expr, vals)
      when typ = 'text' and op = 'contains' then
        format($q$exists (select 1 from %s x where %s ilike '%%' || replace(replace(replace(x, '\', '\\'), '%%', '\%%'), '_', '\_') || '%%')$q$, vals, expr)
      when typ = 'enum' and op = 'is' then format('%s = any(array(select %s))', expr, vals)
      when typ = 'enum' and op = 'is_not' then format('(%s is null or %s <> all(array(select %s)))', expr, expr, vals)
      when typ = 'multi' and op = 'is' then format('coalesce(%s, ''[]'') ?| array(select %s)', expr, vals)
      when typ = 'multi' and op = 'is_not' then format('not (coalesce(%s, ''[]'') ?| array(select %s))', expr, vals)
      when typ = 'link' and op = 'is' then format('%s && array(select %s)', expr, vals)
      when typ = 'link' and op = 'is_not' then format('not (%s && array(select %s))', expr, vals)
      when typ = 'number' and op = 'gte' then format('%s >= %s::numeric', expr, v0)
      when typ = 'number' and op = 'lte' then format('%s <= %s::numeric', expr, v0)
      when typ = 'date' and op = 'within' then format('%s >= now() - make_interval(days => %s::int)', expr, v0)
      when typ = 'date' and op = 'before' then format('%s < now() - make_interval(days => %s::int)', expr, v0)
      when typ = 'bool' and op = 'is' then format('coalesce(%s, false) = (%s = ''true'')', expr, v0)
      else null end;
    if parts[array_upper(parts, 1)] is null then
      raise exception 'This filter does not work on that field';
    end if;
    i := i + 1;
  end loop;
  return array_to_string(parts, ' and ');
end;
$function$;
CREATE OR REPLACE FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb DEFAULT '[]'::jsonb, p_sort text DEFAULT 'updated_at'::text, p_desc boolean DEFAULT true, p_limit integer DEFAULT 100, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  w text;
  ord text;
  sortf text := coalesce(p_sort, 'updated_at');
  total bigint;
  rows jsonb;
  v_oid uuid;
  base text;
  sel text;
  lim text := least(greatest(coalesce(p_limit, 100), 1), 1000)::text || ' offset ' || greatest(coalesce(p_offset, 0), 0)::text;
  t text := case p_object when 'contact' then 'c' when 'company' then 'co' else 'r' end;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if p_object not in ('contact', 'company') then
    select id into v_oid from objects where workspace_id = p_ws and key = p_object;
    if v_oid is null then
      raise exception 'Object not found';
    end if;
  end if;
  w := object_where(p_ws, p_object, coalesce(p_filters, '[]'));
  -- Sort by a built-in column or a custom field (as number when it reads as one, then as text).
  if sortf ~ '^f\.[a-z][a-z0-9_]{0,39}$' then
    ord := format('try_numeric(%1$s.fields->>%2$L) %3$s nulls last, lower(%1$s.fields->>%2$L) %3$s nulls last', t, substr(sortf, 3), case when p_desc then 'desc' else 'asc' end);
  else
    ord := case p_object
      when 'contact' then case sortf
        when 'name' then 'lower(coalesce(c.last_name, c.first_name, c.email))' when 'email' then 'c.email_clean' when 'company' then 'lower(co.name)'
        when 'score' then 'c.score' when 'lifecycle' then 'c.lifecycle' when 'lead_status' then 'c.lead_status'
        when 'title' then 'lower(c.title)' when 'country' then 'c.country' when 'created_at' then 'c.created_at' else 'c.updated_at' end
      when 'company' then case sortf
        when 'name' then 'lower(coalesce(co.name, co.domain))' when 'domain' then 'co.domain'
        when 'contacts' then 'contacts' when 'created_at' then 'co.created_at' else 'co.updated_at' end
      else case sortf when 'name' then 'lower(r.name)' when 'created_at' then 'r.created_at' else 'r.updated_at' end
    end || case when p_desc then ' desc nulls last' else ' asc nulls last' end;
  end if;
  ord := ord || ', ' || t || '.id';

  if p_object = 'contact' then
    base := 'contacts c left join companies co on co.id = c.company_id
             where c.workspace_id = $1 and c.deleted_at is null';
    sel := 'c.id, c.email, c.first_name, c.last_name, c.title, c.phone, c.country, c.region, c.lifecycle, c.lead_status, c.source,
            c.score, c.score_band, c.fields, c.created_at, c.updated_at, c.owner_user_id as owner, c.field_sources,
            c.email_class, c.company_id, co.name as company_name, co.domain as company_domain, co.industry, co.size';
  elsif p_object = 'company' then
    base := 'companies co where co.workspace_id = $1 and co.deleted_at is null';
    sel := 'co.id, co.name, co.domain, co.industry, co.size, co.country, co.owner_user_id as owner, co.fields, co.field_sources,
            co.created_at, co.updated_at,
            (select count(*) from contacts x where x.company_id = co.id and x.deleted_at is null) as contacts';
  else
    base := format('records r where r.workspace_id = $1 and r.object_id = %L and r.deleted_at is null', v_oid);
    sel := 'r.id, r.name, r.fields, r.field_sources, r.created_at, r.updated_at';
  end if;
  execute format('select count(*) from %s and %s', base, w) into total using p_ws, p_filters;
  execute format('select coalesce(jsonb_agg(x), ''[]''::jsonb) from (select %s from %s and %s order by %s limit %s) x', sel, base, w, ord, lim)
    into rows using p_ws, p_filters;
  -- Relation fields come back as arrays of { id, name } per record.
  if exists (select 1 from fields where workspace_id = p_ws and object = p_object and type = 'relation') and jsonb_array_length(rows) > 0 then
    rows := (select jsonb_agg(x || jsonb_build_object('links', coalesce((
              select jsonb_object_agg(f.key, (select coalesce(jsonb_agg(jsonb_build_object('id', l.to_id, 'object', l.to_object, 'name',
                  case l.to_object when 'contact' then (select coalesce(nullif(trim(concat_ws(' ', k.first_name, k.last_name)), ''), k.email) from contacts k where k.id = l.to_id)
                                   when 'company' then (select coalesce(m.name, m.domain) from companies m where m.id = l.to_id)
                                   else (select rr.name from records rr where rr.id = l.to_id) end)), '[]')
                from record_links l where l.field_id = f.id and l.from_id = (x->>'id')::uuid))
              from fields f where f.workspace_id = p_ws and f.object = p_object and f.type = 'relation'), '{}')) order by n)
             from jsonb_array_elements(rows) with ordinality e(x, n));
  end if;
  return jsonb_build_object('total', total, 'rows', rows);
end;
$function$;
CREATE OR REPLACE FUNCTION public.segment_refresh(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  g segments%rowtype;
  w text;
  joined int;
  gone int;
begin
  select * into g from segments where id = p_id for update;
  if g.id is null or g.kind <> 'dynamic' then
    return null;
  end if;
  begin
    w := segment_where(g.workspace_id, g.rules);
  exception when others then
    update segments set error = left(sqlerrm, 500), refreshed_at = now() where id = p_id;
    return jsonb_build_object('error', sqlerrm);
  end;
  create temp table if not exists _seg (contact_id uuid primary key) on commit drop;
  truncate _seg;
  execute format('insert into _seg select c.id from contacts c left join companies co on co.id = c.company_id
                  where c.workspace_id = $1 and c.deleted_at is null and (%s)', w) using g.workspace_id, g.rules;

  with j as (
    insert into segment_members (workspace_id, segment_id, contact_id)
    select g.workspace_id, p_id, s.contact_id from _seg s
    on conflict (segment_id, contact_id) do update set left_at = null, entered_at = now()
    where segment_members.left_at is not null
    returning contact_id
  ), ev as (
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    select g.workspace_id, j.contact_id, 'segment.entered', jsonb_build_object('segment_id', p_id, 'name', g.name), 'segment' from j
    returning 1
  )
  select count(*) into joined from ev;

  with l as (
    update segment_members m set left_at = now()
    where m.segment_id = p_id and m.left_at is null and not exists (select 1 from _seg s where s.contact_id = m.contact_id)
    returning contact_id
  ), ev as (
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    select g.workspace_id, l.contact_id, 'segment.left', jsonb_build_object('segment_id', p_id, 'name', g.name), 'segment' from l
    returning 1
  )
  select count(*) into gone from ev;

  update segments set count = (select count(*) from _seg), refreshed_at = now(), error = null where id = p_id;
  truncate _seg;
  return jsonb_build_object('joined', joined, 'left', gone);
end;
$function$;

-- 3. The tables. cascade takes their partitions, policies, triggers and the keys that point at them.
drop table if exists
  public.sessions, public.devices, public.device_links, public.events, public.site_daily, public.site_rolled,
  public.page_groups, public.opt_outs, public.salts, public.hop_nonces, public.persons, public.person_aliases,
  public.identifiers, public.identity_evidence, public.learned_networks, public.merge_proposals, public.privacy_exports, public.ip_cache,
  public.domain_aliases, public.accounts, public.account_domains, public.account_scores, public.account_daily, public.account_feedback,
  public.account_alert_log, public.account_alert_rules, public.signals, public.signal_types, public.network_flags, public.intent_params,
  public.icp
  cascade;

-- 4. Functions that only served visits, identity, accounts or signals (their tables went first, with the triggers on them).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
    'account_detail', 'account_feedback_add', 'account_timeline', 'accounts_list', 'companies_follow_account', 'company_detail',
    'contact_detail', 'contacts_follow_identifier', 'contacts_follow_merge', 'contacts_merge', 'decide_merge', 'drop_old_event_partitions',
    'icp_fit', 'lifecycle_facts', 'make_event_partitions', 'mark_kiosk', 'person_detail', 'person_for_email',
    'privacy_find', 'privacy_request', 'product_event_names', 'product_events_sync', 'records_group_counts', 'remove_site',
    'report_visits', 'scoring_facts', 'segment_preview', 'set_icp', 'set_identity_domains', 'set_page_groups',
    'signals_feed_stats', 'site_daily_roll', 'site_health', 'unlink_device', 'unmerge_person', 'update_site',
    'visitor_journey', 'visitors_counts', 'visitors_list', 'visitors_live', 'visitors_live_since', 'web_daily')
  loop
    execute format('drop function %s', f);
  end loop;
end $$;

-- 5. Columns that pointed at them, and the site's tracking settings (a site is now just its domains).
alter table public.contacts drop column if exists person_id;
alter table public.companies drop column if exists account_id;
alter table public.sites
  drop column if exists site_key,
  drop column if exists proxy_secret,
  drop column if exists install_mode,
  drop column if exists policy_overrides,
  drop column if exists private_paths,
  drop column if exists url_param_allow,
  drop column if exists city_level,
  drop column if exists honor_dnt,
  drop column if exists event_retention_days,
  drop column if exists paused,
  drop column if exists last_event_at;

-- 6. The team's own and partner email domains, without the identity settings around them.
alter table if exists public.identity_settings rename to team_domains;
alter table public.team_domains drop column if exists office_nets, drop column if exists identify_secrets_sealed;
-- The app's running build still reads identity_settings until the new one is live; 136 removes this view.
create or replace view public.identity_settings with (security_invoker = true) as
  select workspace_id, own_domains, partner_domains from public.team_domains;
grant select on public.identity_settings to authenticated, service_role;
