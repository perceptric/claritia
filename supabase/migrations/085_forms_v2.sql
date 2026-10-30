-- Forms, the same way as Calendar (docs/forms-plan.md): what the Forms list and a form's Submissions tab read. Run
-- after 084. Safe to run more than once.
--
--   forms_list       each form as before, plus this week's fills, one count per day for the last 7 days, views in
--                    the last 30 days (form_daily), the pages its fills came from in that time (and whether its own
--                    hosted page took any), and whether the draft has changes the live version doesn't
--   form_left_early  visits that started a form and didn't send it (form_field_sessions), newest first: when, the
--                    field they were in and the step they reached. Never any answers.

create or replace function public.forms_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status, 'kind', f.kind, 'version', f.version, 'updated_at', f.updated_at, 'brand_kit_id', f.brand_kit_id,
           'fills', coalesce(s.fills, 0), 'last_fill', s.last_fill, 'failed', coalesce(d.failed, 0), 'check', k.status,
           'week', coalesce(w.week, 0), 'spark', coalesce(w.spark, '[0,0,0,0,0,0,0]'::jsonb), 'views', coalesce(v.views, 0),
           'pages', coalesce(p.pages, 0), 'page', p.page, 'hosted', coalesce(p.hosted, false),
           'edited', f.version > 0 and f.draft is distinct from (select x.body from form_versions x where x.form_id = f.id and x.version = f.version))
         order by f.updated_at desc), '[]'::jsonb)
  from forms f
  left join lateral (
    select count(*) filter (where x.created_at > now() - interval '30 days') fills, max(x.created_at) last_fill
    from submissions x where x.form_id = f.id and not x.spam and not x.test
  ) s on true
  left join lateral (
    select count(*) failed from deliveries y join form_destinations fd on fd.id = y.destination_id where fd.form_id = f.id and y.status = 'failed'
  ) d on true
  left join lateral (select c.status from form_checks c where c.form_id = f.id order by c.started_at desc limit 1) k on true
  left join lateral (
    select sum(n)::int week, jsonb_agg(n order by g) spark from (
      select g, (select count(*) from submissions x
                 where x.form_id = f.id and not x.spam and not x.test
                   and (x.created_at at time zone ws_tz(f.workspace_id))::date = (now() at time zone ws_tz(f.workspace_id))::date - g) n
      from generate_series(6, 0, -1) g
    ) t
  ) w on true
  left join lateral (
    select sum(y.views)::int views from form_daily y where y.form_id = f.id and y.day > current_date - 30
  ) v on true
  left join lateral (
    select count(distinct x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') pages,
           min(x.hidden->>'page') filter (where x.hidden->>'page' !~ '/f/[0-9a-f-]{36}') page,
           bool_or(x.hidden->>'page' ~ '/f/[0-9a-f-]{36}') hosted
    from submissions x where x.form_id = f.id and not x.test and x.created_at > now() - interval '30 days' and x.hidden ? 'page'
  ) p on true
  where f.workspace_id = p_ws and is_member(p_ws);
$$;

create or replace function public.form_left_early(p_form uuid, p_from date default null, p_limit int default 100) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb;
begin
  perform form_member(p_form);
  with s as (
    select started_at, left_field, step from form_field_sessions
    where form_id = p_form and not sent and (p_from is null or day >= p_from)
  )
  select jsonb_build_object(
    'count', (select count(*) from s),
    'rows', coalesce((select jsonb_agg(to_jsonb(r) order by r.started_at desc) from (
      select * from s order by started_at desc limit least(greatest(coalesce(p_limit, 100), 1), 500)) r), '[]'::jsonb)
  ) into out;
  return out;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['forms_list(uuid)', 'form_left_early(uuid, date, int)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
