-- Form results and field numbers (docs/forms-plan.md Part 1). Run after 070. Safe to run more than once.
--
--   submissions.search     every answer and hidden value as words, for the Results search box
--   forms.results_columns  the fields the Results table shows, in order, for the whole team
--   form_fill_ids          one page of fills (50, newest first) for a set of filters, by keyset
--   form_fill_count        how many fills match the same filters
--   submissions_mark_spam  move fills to Spam by hand, or back when they were leads before
--   submission_release     a fill held as spam becomes a lead: the same steps a fill takes on the way in
--   submissions_delete     delete fills (their contacts stay)
--   form_field_sessions    one row per visit that started a form: which fields it reached, answered, got wrong, and
--                          how long each took, from the form's own beacon. Never the answers.
--   form_field_stats       those visits added up for the Fields view; report_form_dropoff for the Forms report
--
-- form_submit keeps its arguments and what it returns; what happens after the insert moved into submission_accept so
-- that a released fill goes through exactly the same steps.

-- Search ---------------------------------------------------------------------------------------------------------------

-- Lowercase, and anything that isn't a letter or digit splits words, so "ana@acme.com" is found by "acme".
alter table public.submissions add column if not exists search tsvector generated always as (
  to_tsvector('simple'::regconfig, regexp_replace(lower(left("values"::text, 20000) || ' ' || left(hidden::text, 4000)), '[^[:alnum:]]+', ' ', 'g'))
) stored;
create index if not exists submissions_search on public.submissions using gin (search);
create index if not exists submissions_form_page on public.submissions (form_id, created_at desc, id desc);

-- What someone typed in the search box, as a query: every word, each as the start of a word.
create or replace function public.fill_query(p_q text) returns tsquery
language sql immutable as $$
  select to_tsquery('simple', string_agg(quote_literal(w) || ':*', ' & '))
  from regexp_split_to_table(trim(regexp_replace(lower(left(coalesce(p_q, ''), 200)), '[^[:alnum:]]+', ' ', 'g')), ' ') w
  where w <> '';
$$;

alter table public.forms add column if not exists results_columns text[] check (cardinality(results_columns) <= 40);

-- The fills matching a set of filters. Plain SQL with no settings, so the planner folds it into the callers below.
--   kind: leads (default), tests or spam; q: search words; from, to: timestamps; status: sent, waiting or failed;
--   booked: true or false; key and value: one answer.
create or replace function public.form_fill_set(p_form uuid, p_f jsonb) returns table (id uuid, created_at timestamptz)
language sql stable as $$
  select s.id, s.created_at from public.submissions s
  where s.form_id = p_form
    and case coalesce(p_f->>'kind', 'leads') when 'spam' then s.spam when 'tests' then s.test and not s.spam else not s.test and not s.spam end
    and (public.fill_query(p_f->>'q') is null or s.search @@ public.fill_query(p_f->>'q'))
    and (p_f->>'from' is null or s.created_at >= (p_f->>'from')::timestamptz)
    and (p_f->>'to' is null or s.created_at < (p_f->>'to')::timestamptz)
    and case p_f->>'status'
      when 'failed' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'failed')
      when 'waiting' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status in ('queued', 'sending', 'retrying', 'held'))
      when 'sent' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'done')
        and not exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status not in ('done', 'skipped'))
      else true end
    and (jsonb_typeof(p_f->'booked') is distinct from 'boolean'
      or (p_f->>'booked')::boolean = (exists (select 1 from public.form_bookings b where b.submission_id = s.id)
        or exists (select 1 from public.meetings m where m.submission_id = s.id and m.status <> 'canceled')))
    and (p_f->>'key' is null
      or s."values"->(p_f->>'key') = to_jsonb(p_f->>'value')
      or s."values"->(p_f->>'key') @> jsonb_build_array(p_f->>'value')
      or (s."values"->(p_f->>'key'))::text = (p_f->>'value'));
$$;

create or replace function public.form_member(p_form uuid) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null or not is_member(ws) then
    raise exception 'Form not found';
  end if;
  return ws;
end;
$$;

-- One page, newest first. Pass the last fill's created_at and id to get the page after it.
create or replace function public.form_fill_ids(p_form uuid, p_filters jsonb default '{}', p_after_at timestamptz default null, p_after_id uuid default null, p_limit int default 50)
returns uuid[]
language plpgsql stable security definer set search_path = public as $$
declare
  ids uuid[];
begin
  perform form_member(p_form);
  select coalesce(array_agg(t.id order by t.created_at desc, t.id desc), '{}') into ids from (
    select x.id, x.created_at from form_fill_set(p_form, coalesce(p_filters, '{}')) x
    where p_after_at is null or (x.created_at, x.id) < (p_after_at, coalesce(p_after_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
    order by x.created_at desc, x.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 1000)
  ) t;
  return ids;
end;
$$;

create or replace function public.form_fill_count(p_form uuid, p_filters jsonb default '{}') returns bigint
language plpgsql stable security definer set search_path = public as $$
declare
  n bigint;
begin
  perform form_member(p_form);
  select count(*) into n from form_fill_set(p_form, coalesce(p_filters, '{}'));
  return n;
end;
$$;

create or replace function public.form_results_columns(p_form uuid, p_cols text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform form_member(p_form);
  if p_cols is not null and (cardinality(p_cols) > 40 or exists (select 1 from unnest(p_cols) c where c !~ '^[a-z][a-z0-9_.:]{0,59}$')) then
    raise exception 'Bad columns';
  end if;
  update forms set results_columns = p_cols where id = p_form;
end;
$$;

-- Bulk actions ---------------------------------------------------------------------------------------------------------

-- To Spam by hand (kept with reason "marked"), or back. Back only for fills that were leads before (they have a
-- contact); one held as spam on the way in goes through submission_release instead, so it gets its contact and
-- deliveries. Returns how many changed.
create or replace function public.submissions_mark_spam(p_ids uuid[], p_spam boolean) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  if p_spam then
    update submissions set spam = true, spam_reason = 'marked' where id = any(p_ids) and not spam and is_member(workspace_id);
  else
    update submissions set spam = false, spam_reason = null where id = any(p_ids) and spam and contact_id is not null and is_member(workspace_id);
  end if;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.submissions_delete(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  delete from submissions where id = any(p_ids) and is_member(workspace_id);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- What a fill does once it's saved and isn't spam: the contact (through form_contact_write and its overwrite policy),
-- consent with the exact wording, the form.submitted event, and one delivery per destination with its job. From
-- 051_form_data.sql's form_submit, reading the fill's own row.
create or replace function public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
  f forms%rowtype;
  cid uuid;
  up jsonb;
  d record;
  topic uuid;
begin
  select * into s from submissions where id = p_sid;
  select * into f from forms where id = s.form_id;
  if s.id is null or f.id is null or p_contact is null then
    return null;
  end if;
  up := form_contact_write(f.workspace_id, p_contact);
  cid := (up->'ids'->>0)::uuid;
  update submissions set contact_id = cid where id = p_sid;

  if cid is not null and coalesce((p_consent->>'given')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'opt_in', 'granted', 'form', left(p_consent->>'wording', 2000));
    topic := (select (v.body->'consent'->>'topicId')::uuid from form_versions v
              where v.form_id = s.form_id and v.version = s.form_version and v.body->'consent'->>'topicId' ~ '^[0-9a-f-]{36}$');
    if topic is not null and exists (select 1 from topics where id = topic and workspace_id = f.workspace_id) then
      insert into subscriptions (workspace_id, contact_id, topic_id, status) values (f.workspace_id, cid, topic, 'subscribed')
      on conflict (contact_id, topic_id) do update set status = 'subscribed', at = now();
    end if;
  elsif cid is not null and coalesce((p_consent->>'notice')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'legitimate_interest', 'granted', 'form', left(p_consent->>'wording', 2000));
  end if;
  if cid is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (f.workspace_id, cid, 'form.submitted',
            jsonb_strip_nulls(jsonb_build_object('form_id', s.form_id, 'form_name', f.name, 'submission_id', p_sid, 'answers', s."values",
              'utm', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(s.hidden)
                      where key ~ '^(first_)?(utm_(source|medium|campaign|term|content)|gclid|fbclid|li_fat_id|msclkid)$'),
              'page', s.hidden->>'page', 'referrer', s.hidden->>'referrer', 'test', case when s.test then true end)), 'form');
  end if;

  for d in select id, paused from form_destinations where form_id = s.form_id order by position, created_at loop
    insert into deliveries (workspace_id, submission_id, destination_id, status)
    values (f.workspace_id, p_sid, d.id, case when d.paused then 'held' else 'queued' end)
    on conflict (submission_id, destination_id) do nothing;
  end loop;
  for d in select x.id from deliveries x where x.submission_id = p_sid and x.status = 'queued' loop
    perform enqueue_job(f.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
  end loop;
  return cid;
end;
$$;

-- 051_form_data.sql's form_submit, unchanged in what it takes and returns; the steps after the insert are
-- submission_accept above.
create or replace function public.form_submit(p_form uuid, p_version int, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb,
  p_consent jsonb, p_country text, p_spam text, p_test boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  sid uuid;
  cid uuid;
begin
  select * into f from forms where id = p_form;
  -- A test fill (the Test button) also runs on a paused form.
  if f.id is null or (f.status <> 'live' and not (coalesce(p_test, false) and f.status = 'paused')) then
    raise exception 'This form isn''t taking answers';
  end if;
  if not exists (select 1 from form_versions where form_id = p_form and version = p_version) then
    raise exception 'Unknown form version';
  end if;

  insert into submissions (workspace_id, form_id, form_version, idem_key, "values", hidden, consent, country, spam, spam_reason, test)
  values (f.workspace_id, p_form, p_version, p_idem, coalesce(p_values, '{}'), coalesce(p_hidden, '{}'), coalesce(p_consent, '{}'),
          nullif(p_country, ''), p_spam is not null, p_spam, coalesce(p_test, false))
  on conflict (workspace_id, idem_key) do nothing
  returning id into sid;
  if sid is null then
    select id, contact_id into sid, cid from submissions where workspace_id = f.workspace_id and idem_key = p_idem;
    return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', true);
  end if;
  if p_spam is not null or p_contact is null then
    return jsonb_build_object('id', sid, 'contact_id', null, 'repeat', false);
  end if;
  -- The basis comes from the consent box, never from the row; the overwrite policy is applied in form_contact_write.
  cid := submission_accept(sid, p_contact, p_consent);
  return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', false);
end;
$$;

-- A fill held as spam, let through by a member (the server checks them and builds the contact from the saved
-- answers, as on the way in). Locked, so two clicks release it once. Returns the contact, or null when there was
-- nothing to release.
create or replace function public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
begin
  select * into s from submissions where id = p_sid for update;
  if s.id is null or not s.spam or s.test then
    return null;
  end if;
  -- Spam first: the first-touch trigger skips spam, and it fires when the contact is set below.
  update submissions set spam = false, spam_reason = null, consent = coalesce(p_consent, '{}') where id = p_sid;
  if s.contact_id is not null then
    return s.contact_id;
  end if;
  return submission_accept(p_sid, p_contact, p_consent);
end;
$$;

-- Field numbers ----------------------------------------------------------------------------------------------------------

create table if not exists public.form_field_sessions (
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  vid text not null check (vid ~ '^[A-Za-z0-9_-]{8,64}$'),
  version int not null,
  started_at timestamptz not null default now(),
  at timestamptz not null default now(),
  -- The workspace's day the visit started.
  day date not null,
  -- { field id: [reached 0|1, answered 0|1, errors, ms] }
  fields jsonb not null default '{}' check (jsonb_typeof(fields) = 'object' and length(fields::text) <= 8000),
  -- The last field the visitor was in, when they didn't send it.
  left_field text check (left_field ~ '^[a-z0-9]{1,24}$'),
  -- The furthest step reached (0-based).
  step int not null default 0 check (step between 0 and 20),
  sent boolean not null default false,
  primary key (form_id, vid, started_at)
);
create index if not exists form_field_sessions_day on public.form_field_sessions (form_id, day);
create index if not exists form_field_sessions_ws on public.form_field_sessions (workspace_id, day);
alter table public.form_field_sessions enable row level security;
revoke all on public.form_field_sessions from anon, authenticated;

-- One summary from the form (server: the route drops bots and rate-limits). A visit is one row: a later summary within
-- 30 minutes (the visitor came back to the tab, then sent it) replaces the earlier one, so leaving a tab never counts
-- as dropping off. A summary after the fill was sent changes nothing. Returns whether it was kept.
create or replace function public.form_field_seen(p_form uuid, p_vid text, p_version int, p_fields jsonb, p_left text, p_step int, p_sent boolean)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  clean jsonb := '{}';
  k text;
  v jsonb;
  cur record;
begin
  if p_vid !~ '^[A-Za-z0-9_-]{8,64}$' or jsonb_typeof(p_fields) is distinct from 'object' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null or f.status <> 'live' or not exists (select 1 from form_versions where form_id = p_form and version = p_version) then return false; end if;
  for k, v in select * from jsonb_each(p_fields) limit 40 loop
    if k ~ '^[a-z0-9]{1,24}$' and jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 4
       and (select bool_and(jsonb_typeof(x) = 'number') from jsonb_array_elements(v) x) then
      clean := clean || jsonb_build_object(k, jsonb_build_array(
        least(greatest((v->>0)::numeric, 0), 1)::int, least(greatest((v->>1)::numeric, 0), 1)::int,
        least(greatest((v->>2)::numeric, 0), 50)::int, least(greatest((v->>3)::numeric, 0), 3600000)::int));
    end if;
  end loop;
  select * into cur from form_field_sessions where form_id = p_form and vid = p_vid and at > now() - interval '30 minutes' order by at desc limit 1 for update;
  if cur.form_id is not null then
    if cur.sent then return false; end if;
    update form_field_sessions set at = now(), version = p_version, fields = clean,
      left_field = case when coalesce(p_sent, false) or p_left !~ '^[a-z0-9]{1,24}$' then null else p_left end,
      step = greatest(cur.step, least(greatest(coalesce(p_step, 0), 0), 20)), sent = coalesce(p_sent, false)
    where form_id = cur.form_id and vid = cur.vid and started_at = cur.started_at;
    return true;
  end if;
  insert into form_field_sessions (form_id, workspace_id, vid, version, day, fields, left_field, step, sent)
  values (p_form, f.workspace_id, p_vid, p_version, (now() at time zone ws_tz(f.workspace_id))::date, clean,
    case when coalesce(p_sent, false) or p_left !~ '^[a-z0-9]{1,24}$' then null else p_left end,
    least(greatest(coalesce(p_step, 0), 0), 20), coalesce(p_sent, false));
  return true;
end;
$$;

-- The Fields view: visits that started the form in the range, per field and per step.
create or replace function public.form_field_stats(p_form uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb;
begin
  perform form_member(p_form);
  with s as (select * from form_field_sessions where form_id = p_form and day between p_from and p_to),
  f as (
    select e.key as id, (e.value->>0)::int as reached, (e.value->>1)::int as answered, (e.value->>2)::int as errors, (e.value->>3)::int as ms
    from s, jsonb_each(s.fields) e
  )
  select jsonb_build_object(
    'visits', (select count(*) from s),
    'sent', (select count(*) from s where sent),
    'fields', coalesce((select jsonb_agg(to_jsonb(g)) from (
        select f.id, sum(f.reached) as reached, sum(f.answered) as answered, count(*) filter (where f.errors > 0) as with_errors, sum(f.errors) as errors,
          percentile_cont(0.5) within group (order by f.ms) filter (where f.answered = 1 and f.ms > 0) as median_ms,
          (select count(*) from s s2 where s2.left_field = f.id and not s2.sent) as "left"
        from f group by f.id) g), '[]'),
    'steps', coalesce((select jsonb_agg(jsonb_build_object('step', g, 'reached', (select count(*) from s where s.step >= g)) order by g)
        from generate_series(0, (select coalesce(max(step), 0) from s)) g), '[]')
  ) into out;
  return out;
end;
$$;

-- The Forms report's Drop-off column: per form in the range, the field most visits stopped at, with its label from the
-- live version.
create or replace function public.report_form_dropoff(p_ws uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  with s as (select form_id, left_field, sent from form_field_sessions where workspace_id = p_ws and day between p_from and p_to),
  t as (select form_id, count(*) as visits, count(*) filter (where not sent) as left_n from s group by form_id),
  top as (
    select distinct on (form_id) form_id, left_field, count(*) as n
    from s where not sent and left_field is not null group by form_id, left_field order by form_id, count(*) desc, left_field
  )
  select coalesce(jsonb_agg(jsonb_build_object('form_id', t.form_id, 'visits', t.visits, 'left', t.left_n, 'field', top.left_field, 'n', top.n,
      'label', (select x->>'label' from forms fo join form_versions v on v.form_id = fo.id and v.version = fo.version,
                  jsonb_path_query(v.body, '$.steps[*].fields[*]') x where fo.id = t.form_id and x->>'id' = top.left_field limit 1))), '[]')
  into out
  from t left join top on top.form_id = t.form_id;
  return out;
end;
$$;

-- The nightly job, as in 070_reports.sql, now also clearing visits older than 13 months.
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
  delete from form_field_sessions where day < current_date - interval '13 months';
end;
$$;

-- Who may call what ----------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array['submission_accept(uuid, jsonb, jsonb)', 'submission_release(uuid, jsonb, jsonb)', 'form_submit(uuid, int, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)',
    'form_field_seen(uuid, text, int, jsonb, text, int, boolean)', 'reports_nightly()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['form_fill_ids(uuid, jsonb, timestamptz, uuid, int)', 'form_fill_count(uuid, jsonb)', 'form_results_columns(uuid, text[])', 'submissions_mark_spam(uuid[], boolean)',
    'submissions_delete(uuid[])', 'form_field_stats(uuid, date, date)', 'report_form_dropoff(uuid, date, date)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  -- Helpers the functions above call; no one calls them directly.
  foreach f in array array['form_fill_set(uuid, jsonb)', 'fill_query(text)', 'form_member(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
  end loop;
end;
$$;
grant select, insert, update, delete on public.form_field_sessions to service_role;
