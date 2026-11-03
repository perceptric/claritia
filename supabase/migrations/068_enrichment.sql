-- Enrichment: the waterfall, credits and AI qualify (docs/enrich-workflows-reports.md Part 1).
--   contacts: seniority, department, LinkedIn, and the qualify outcome with its reason and who decided.
--   companies: employees and the year founded.
--   person_cache: people by email, shared like company_cache, "not found" kept too (90 days). Service role only.
--   enrich_settings: on or off, which new contacts to enrich, the re-look days, and a credit cap we can raise.
--   enrich_sources: the steps in the team's order, on or off, and their own keys (sealed, service role only).
--   enrich_runs: each lookup with its steps, fields and credits (13 months).
--   enrich_usage: lookups, matches and credits per month; enrich_spend takes credits under the cap with a row lock.
--   qualify_settings: the team's outcomes with a line each, and the rules that decide before the AI.
--   enrich_write: vendor values merged by field order (a vendor fills blanks, never overwrites a person, CRM or form)
--   with history. A new contact from a form, booking page, the API or by hand gets an enrich_contact job.
--   An erasure deletes the person from the shared cache.

-- Columns -----------------------------------------------------------------------------------------------------------

alter table public.contacts add column if not exists seniority text check (seniority in ('C-level', 'VP', 'Director', 'Manager', 'Individual'));
alter table public.contacts add column if not exists department text check (department in ('Marketing', 'Sales', 'Engineering', 'Product', 'Finance', 'HR', 'Operations', 'Other'));
alter table public.contacts add column if not exists linkedin_url text check (linkedin_url ~ '^https://' and length(linkedin_url) <= 300);
alter table public.contacts add column if not exists qualify_outcome text check (length(qualify_outcome) <= 40);
alter table public.contacts add column if not exists qualify_reason text check (length(qualify_reason) <= 300);
alter table public.contacts add column if not exists qualify_by text check (length(qualify_by) <= 40);
alter table public.contacts add column if not exists qualify_at timestamptz;
alter table public.companies add column if not exists employees int check (employees >= 0);
alter table public.companies add column if not exists founded int check (founded between 1600 and 2100);

insert into public.source_kinds (kind, class) values ('coresignal', 'vendor'), ('pdl', 'vendor'), ('email_check', 'vendor') on conflict do nothing;

-- The keys a contact's history and merges track now include the three new ones.
create or replace function public.contact_vals(c contacts) returns jsonb
language sql stable as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'title', c.title, 'phone', c.phone, 'country', c.country,
    'region', c.region, 'timezone', c.timezone, 'lifecycle', c.lifecycle, 'lead_status', c.lead_status, 'company', c.company_id::text,
    'owner', c.owner_user_id::text, 'seniority', c.seniority, 'department', c.department, 'linkedin_url', c.linkedin_url))
    || coalesce((select jsonb_object_agg('f.' || k, v) from jsonb_each(c.fields) e(k, v)), '{}');
$$;

-- Tables ------------------------------------------------------------------------------------------------------------

create table if not exists public.person_cache (
  email_clean text primary key check (length(email_clean) <= 254),
  vendor text not null check (length(vendor) <= 40),
  data jsonb,
  not_found boolean not null default false,
  fetched_at timestamptz not null default now()
);
alter table public.person_cache enable row level security;
revoke all on public.person_cache from anon, authenticated;

create table if not exists public.enrich_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  "on" boolean not null default true,
  -- Which new contacts are looked up on their own. Imports and synced lists wait for a backfill an owner starts.
  sources text[] not null default '{form,booking,api,manual}',
  skip_free boolean not null default true,
  rescan_days int not null default 90 check (rescan_days between 30 and 365),
  -- Set by us (a beta team, a custom plan); null means the plan's credits.
  credit_cap int check (credit_cap >= 0),
  updated_at timestamptz not null default now()
);
alter table public.enrich_settings enable row level security;
create policy "members read" on public.enrich_settings for select using (is_member(workspace_id));
revoke all on public.enrich_settings from anon;
revoke insert, update, delete on public.enrich_settings from authenticated;

create table if not exists public.enrich_sources (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  step text not null check (step in ('email_check', 'coresignal', 'pdl')),
  "on" boolean not null default true,
  position int not null default 0,
  timeout_ms int not null default 4000 check (timeout_ms between 300 and 10000),
  has_key boolean not null default false,
  primary key (workspace_id, step)
);
alter table public.enrich_sources enable row level security;
create policy "members read" on public.enrich_sources for select using (is_member(workspace_id));
revoke all on public.enrich_sources from anon;
revoke insert, update, delete on public.enrich_sources from authenticated;

-- The team's own vendor keys, sealed with SECRETS_KEY by the server. Nobody reads them but the service role.
create table if not exists public.enrich_keys (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  step text not null check (step in ('coresignal', 'pdl')),
  sealed text not null check (length(sealed) <= 2000),
  primary key (workspace_id, step)
);
alter table public.enrich_keys enable row level security;
revoke all on public.enrich_keys from anon, authenticated;

create table if not exists public.enrich_runs (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  trigger text not null check (trigger in ('new', 'form', 'backfill', 'try', 'workflow', 'again')),
  steps jsonb not null default '[]' check (jsonb_typeof(steps) = 'array'),
  fields text[] not null default '{}',
  credits int not null default 0,
  ms int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists enrich_runs_ws on public.enrich_runs (workspace_id, created_at desc);
create index if not exists enrich_runs_contact on public.enrich_runs (contact_id, created_at desc);
alter table public.enrich_runs enable row level security;
create policy "members read" on public.enrich_runs for select using (is_member(workspace_id));
revoke all on public.enrich_runs from anon;
revoke insert, update, delete on public.enrich_runs from authenticated;

create table if not exists public.enrich_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  month date not null,
  lookups int not null default 0,
  matches int not null default 0,
  credits int not null default 0 check (credits >= 0),
  alerted int not null default 0,
  primary key (workspace_id, month)
);
alter table public.enrich_usage enable row level security;
create policy "members read" on public.enrich_usage for select using (is_member(workspace_id));
revoke all on public.enrich_usage from anon;
revoke insert, update, delete on public.enrich_usage from authenticated;

create table if not exists public.qualify_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  "on" boolean not null default false,
  outcomes jsonb not null default '[]' check (jsonb_typeof(outcomes) = 'array'),
  rules jsonb not null default '[]' check (jsonb_typeof(rules) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.qualify_settings enable row level security;
create policy "members read" on public.qualify_settings for select using (is_member(workspace_id));
revoke all on public.qualify_settings from anon;
revoke insert, update, delete on public.qualify_settings from authenticated;

-- Credits ---------------------------------------------------------------------------------------------------------

create or replace function public.enrich_cap(p_ws uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select credit_cap from enrich_settings where workspace_id = p_ws),
    case (select plan from workspace_billing where workspace_id = p_ws) when 'starter' then 250 when 'team' then 2000 when 'business' then 5000 else 0 end);
$$;

-- Take p_n credits for this month under the cap. The usage row is locked, so two lookups at the last credit can't
-- both take it.
create or replace function public.enrich_spend(p_ws uuid, p_n int default 1) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m date := date_trunc('month', now())::date;
  used int;
begin
  insert into enrich_usage (workspace_id, month) values (p_ws, m) on conflict do nothing;
  select credits into used from enrich_usage where workspace_id = p_ws and month = m for update;
  if used + p_n > enrich_cap(p_ws) then return false; end if;
  update enrich_usage set credits = credits + p_n, lookups = lookups + p_n where workspace_id = p_ws and month = m;
  return true;
end;
$$;

-- A paid call that found nothing or failed gives its credit back.
create or replace function public.enrich_refund(p_ws uuid, p_n int default 1) returns void
language sql security definer set search_path = public as $$
  update enrich_usage set credits = greatest(credits - p_n, 0) where workspace_id = p_ws and month = date_trunc('month', now())::date;
$$;

-- Caches ----------------------------------------------------------------------------------------------------------

create or replace function public.enrich_cache_get(p_email text, p_domain text, p_days int default 90) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'person', (select jsonb_build_object('data', data, 'not_found', not_found, 'vendor', vendor) from person_cache
               where email_clean = lower(p_email) and fetched_at > now() - make_interval(days => p_days)),
    'company', (select jsonb_build_object('data', case when data ? 'not_found' then null else data end, 'not_found', coalesce((data->>'not_found')::boolean, false), 'vendor', vendor)
                from company_cache where domain = lower(p_domain) and fetched_at > now() - interval '30 days'));
$$;

-- p_kind: person (keyed by email) or company (by domain). Null data is "not found".
create or replace function public.enrich_cache_put(p_kind text, p_key text, p_vendor text, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind = 'person' then
    -- An erased person is never cached again.
    if exists (select 1 from erasures where value_hash = sha256(convert_to(lower(p_key), 'UTF8'))) then return; end if;
    insert into person_cache (email_clean, vendor, data, not_found, fetched_at) values (lower(p_key), p_vendor, p_data, p_data is null, now())
    on conflict (email_clean) do update set vendor = excluded.vendor, data = excluded.data, not_found = excluded.not_found, fetched_at = now();
  elsif p_kind = 'company' then
    insert into company_cache (domain, data, vendor, fetched_at) values (lower(p_key), coalesce(p_data, '{"not_found":true}'), p_vendor, now())
    on conflict (domain) do update set data = excluded.data, vendor = excluded.vendor, fetched_at = now();
  else
    raise exception 'Unknown cache %', p_kind;
  end if;
end;
$$;

create or replace function public.person_cache_forget() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from person_cache where sha256(convert_to(email_clean, 'UTF8')) = new.value_hash;
  return new;
end;
$$;
drop trigger if exists erasures_forget_person on public.erasures;
create trigger erasures_forget_person after insert on public.erasures for each row execute function public.person_cache_forget();

-- Loading and writing ---------------------------------------------------------------------------------------------

-- What a lookup needs about a contact: who it is, what the records hold, the team's settings and sources.
create or replace function public.enrich_load(p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'workspace_id', c.workspace_id, 'email', c.email_clean, 'email_class', c.email_class, 'source', c.source,
      'first_name', c.first_name, 'last_name', c.last_name, 'title', c.title, 'seniority', c.seniority, 'department', c.department,
      'linkedin_url', c.linkedin_url, 'country', c.country, 'phone', c.phone, 'qualify_outcome', c.qualify_outcome, 'score', c.score,
      'last_run', (select max(created_at) from enrich_runs r where r.contact_id = c.id)),
    'company', (select jsonb_strip_nulls(jsonb_build_object('id', co.id, 'domain', co.domain, 'name', co.name, 'industry', co.industry, 'size', co.size,
      'country', co.country, 'employees', co.employees, 'founded', co.founded)) from companies co where co.id = c.company_id),
    'settings', coalesce((select to_jsonb(s) from enrich_settings s where s.workspace_id = c.workspace_id), jsonb_build_object('on', true, 'sources', '{form,booking,api,manual}'::text[], 'skip_free', true, 'rescan_days', 90)),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'on', s."on", 'position', s.position, 'timeoutMs', s.timeout_ms,
      'key', (select k.sealed from enrich_keys k where k.workspace_id = s.workspace_id and k.step = s.step)) order by s.position)
      from enrich_sources s where s.workspace_id = c.workspace_id), '[]'),
    'qualify', (select to_jsonb(q) from qualify_settings q where q.workspace_id = c.workspace_id))
  from contacts c where c.id = p_contact and c.deleted_at is null;
$$;

-- The same for an email that isn't a contact yet (a form's "known" lookup).
create or replace function public.enrich_load_email(p_ws uuid, p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contact', (select jsonb_strip_nulls(jsonb_build_object('id', c.id, 'title', c.title, 'seniority', c.seniority, 'department', c.department,
      'country', c.country, 'phone', c.phone, 'company_id', c.company_id)) from contacts c where c.workspace_id = p_ws and c.email_clean = lower(p_email) and c.deleted_at is null),
    'company', (select jsonb_strip_nulls(jsonb_build_object('domain', co.domain, 'name', co.name, 'industry', co.industry, 'size', co.size, 'country', co.country))
      from companies co where co.workspace_id = p_ws and co.domain = split_part(lower(p_email), '@', 2)),
    'settings', coalesce((select to_jsonb(s) from enrich_settings s where s.workspace_id = p_ws), jsonb_build_object('on', true)),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('step', s.step, 'on', s."on", 'position', s.position, 'timeoutMs', s.timeout_ms,
      'key', (select k.sealed from enrich_keys k where k.workspace_id = s.workspace_id and k.step = s.step)) order by s.position)
      from enrich_sources s where s.workspace_id = p_ws), '[]'));
$$;

-- Vendor values into a workspace's company by domain, merged by field order, with history. Made when missing, unless
-- p_create is false (a website visit's account shouldn't add a company). Returns { id, changed: [keys] }.
create or replace function public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
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
    insert into companies (workspace_id, domain, name, account_id)
    values (p_ws, dom, nullif(trim(left(p_company->>'name', 200)), ''), (select account_id from account_domains where workspace_id = p_ws and domain = dom))
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
$$;

-- Vendor values into a contact and its company, merged by field order (a vendor fills blanks, never overwrites a
-- person, CRM or form), with history. Returns the keys that changed.
-- p_person: first_name, last_name, title, seniority, department, linkedin_url, country, phone.
-- p_company: domain, name, industry, size, country, employees, founded.
create or replace function public.enrich_write(p_contact uuid, p_source text, p_person jsonb, p_company jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c contacts%rowtype;
  m jsonb;
  newv jsonb;
  r jsonb;
  changed text[] := '{}';
begin
  if source_class(p_source) <> 'vendor' then raise exception 'Not a vendor source: %', p_source; end if;
  select * into c from contacts where id = p_contact and deleted_at is null for update;
  if c.id is null then return '[]'; end if;

  if p_company is not null and coalesce(p_company->>'domain', '') <> '' then
    r := enrich_write_company(c.workspace_id, p_source, p_company);
    changed := changed || array(select jsonb_array_elements_text(r->'changed'));
    if c.company_id is null and r->>'id' is not null then
      update contacts set company_id = (r->>'id')::uuid where id = c.id;
      c.company_id := (r->>'id')::uuid;
    end if;
  end if;

  newv := jsonb_strip_nulls(jsonb_build_object(
    'first_name', nullif(trim(left(p_person->>'first_name', 80)), ''),
    'last_name', nullif(trim(left(p_person->>'last_name', 80)), ''),
    'title', nullif(trim(left(p_person->>'title', 160)), ''),
    'seniority', case when p_person->>'seniority' in ('C-level', 'VP', 'Director', 'Manager', 'Individual') then p_person->>'seniority' end,
    'department', case when p_person->>'department' in ('Marketing', 'Sales', 'Engineering', 'Product', 'Finance', 'HR', 'Operations', 'Other') then p_person->>'department' end,
    'linkedin_url', case when p_person->>'linkedin_url' ~ '^https://' and length(p_person->>'linkedin_url') <= 300 then p_person->>'linkedin_url' end,
    'country', case when upper(trim(p_person->>'country')) ~ '^[A-Z]{2}$' then upper(trim(p_person->>'country')) end,
    'phone', nullif(trim(left(p_person->>'phone', 50)), '')));
  if coalesce(newv, '{}') <> '{}' then
    m := merge_values(field_classes(c.workspace_id, 'contact'), p_source, null, contact_vals(c), c.field_sources, newv);
    if jsonb_array_length(m->'changes') > 0 then
      update contacts set
        first_name = m->'vals'->>'first_name',
        last_name = m->'vals'->>'last_name',
        title = m->'vals'->>'title',
        seniority = m->'vals'->>'seniority',
        department = m->'vals'->>'department',
        linkedin_url = m->'vals'->>'linkedin_url',
        country = m->'vals'->>'country',
        phone = m->'vals'->>'phone',
        field_sources = m->'src',
        updated_at = now()
      where id = c.id;
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
      select c.workspace_id, 'contact', c.id, x->>'key', x->'old', x->'new', x->'old_source', p_source from jsonb_array_elements(m->'changes') x;
      changed := changed || array(select x->>'key' from jsonb_array_elements(m->'changes') x);
    end if;
  end if;
  return to_jsonb(changed);
end;
$$;

create or replace function public.enrich_run_log(p_ws uuid, p_contact uuid, p_trigger text, p_steps jsonb, p_fields text[], p_credits int, p_ms int) returns void
language plpgsql security definer set search_path = public as $$
declare
  hit boolean := exists (select 1 from jsonb_array_elements(p_steps) s where s->>'result' = 'hit' and s->>'step' in ('coresignal', 'pdl'));
begin
  insert into enrich_runs (workspace_id, contact_id, company_id, trigger, steps, fields, credits, ms)
  values (p_ws, p_contact, (select company_id from contacts where id = p_contact), p_trigger, p_steps, coalesce(p_fields, '{}'), coalesce(p_credits, 0), coalesce(p_ms, 0));
  if hit then
    insert into enrich_usage (workspace_id, month, matches) values (p_ws, date_trunc('month', now())::date, 1)
    on conflict (workspace_id, month) do update set matches = enrich_usage.matches + 1;
  end if;
end;
$$;

-- A qualify outcome on a contact. Writes lead.outcome when it changes, for workflows and reports.
create or replace function public.qualify_store(p_contact uuid, p_outcome text, p_reason text, p_by text, p_facts text[] default '{}') returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c contacts%rowtype;
begin
  select * into c from contacts where id = p_contact and deleted_at is null for update;
  if c.id is null or coalesce(trim(p_outcome), '') = '' then return false; end if;
  if c.qualify_outcome is not distinct from p_outcome and c.qualify_reason is not distinct from p_reason then return false; end if;
  update contacts set qualify_outcome = left(p_outcome, 40), qualify_reason = left(p_reason, 300), qualify_by = left(p_by, 40), qualify_at = now() where id = c.id;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (c.workspace_id, c.id, 'lead.outcome', jsonb_build_object('outcome', left(p_outcome, 40), 'from', c.qualify_outcome, 'by', left(p_by, 40), 'facts', to_jsonb(coalesce(p_facts, '{}'))), 'qualify');
  return true;
end;
$$;

-- What qualify reads about a lead: its latest form answers (with each field's label), the person, the company and
-- the score, plus whether it was held as spam or has a throwaway address (those never reach the model).
create or replace function public.qualify_load(p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'workspace_id', c.workspace_id, 'email', c.email_clean, 'email_class', c.email_class, 'title', c.title,
      'seniority', c.seniority, 'department', c.department, 'country', c.country, 'region', c.region, 'score', c.score, 'score_band', c.score_band,
      'route_status', c.route_status, 'qualify_outcome', c.qualify_outcome, 'qualify_reason', c.qualify_reason, 'fields', c.fields),
    'company', (select jsonb_strip_nulls(jsonb_build_object('name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size,
      'employees', co.employees, 'country', co.country, 'founded', co.founded)) from companies co where co.id = c.company_id),
    'answers', coalesce((
      select jsonb_object_agg(coalesce(nullif(ff.f->>'label', ''), e.k), e.v)
      from (select x.* from submissions x where x.contact_id = c.id and not x.test order by x.created_at desc limit 1) s
      cross join lateral jsonb_each(s."values") e(k, v)
      left join form_versions fv on fv.form_id = s.form_id and fv.version = s.form_version
      left join lateral (
        select fld as f from jsonb_array_elements(coalesce(fv.body->'steps', '[]')) st, jsonb_array_elements(coalesce(st->'fields', '[]')) fld
        where fld->>'key' = e.k or fld->>'id' = e.k limit 1) ff on true
      where jsonb_typeof(e.v) in ('string', 'number', 'boolean', 'array')), '{}'),
    'settings', (select to_jsonb(q) from qualify_settings q where q.workspace_id = c.workspace_id))
  from contacts c where c.id = p_contact and c.deleted_at is null;
$$;

-- The routing values the new columns add (router_facts reads the rest).
create or replace function public.router_facts_more(p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_strip_nulls(jsonb_build_object('seniority', c.seniority, 'department', c.department, 'qualify', c.qualify_outcome,
    'employees', (select co.employees from companies co where co.id = c.company_id)))
  from contacts c where c.id = p_contact;
$$;

-- An owner's settings ---------------------------------------------------------------------------------------------

create or replace function public.enrich_settings_save(p_ws uuid, p_settings jsonb, p_sources jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can change enrichment'; end if;
  if p_settings is not null then
    insert into enrich_settings (workspace_id, "on", sources, skip_free, rescan_days, updated_at)
    values (p_ws, coalesce((p_settings->>'on')::boolean, true),
            coalesce(array(select x from jsonb_array_elements_text(p_settings->'sources') x where x in ('form', 'booking', 'api', 'manual', 'import', 'crm')), '{form,booking,api,manual}'),
            coalesce((p_settings->>'skip_free')::boolean, true), least(greatest(coalesce((p_settings->>'rescan_days')::int, 90), 30), 365), now())
    on conflict (workspace_id) do update set "on" = excluded."on", sources = excluded.sources, skip_free = excluded.skip_free, rescan_days = excluded.rescan_days, updated_at = now();
  end if;
  if p_sources is not null then
    for s in select * from jsonb_array_elements(p_sources) loop
      continue when s->>'step' not in ('email_check', 'coresignal', 'pdl');
      insert into enrich_sources (workspace_id, step, "on", position, timeout_ms, has_key)
      values (p_ws, s->>'step', coalesce((s->>'on')::boolean, true), coalesce((s->>'position')::int, 0), least(greatest(coalesce((s->>'timeoutMs')::int, 4000), 300), 10000),
              exists (select 1 from enrich_keys k where k.workspace_id = p_ws and k.step = s->>'step'))
      on conflict (workspace_id, step) do update set "on" = excluded."on", position = excluded.position, timeout_ms = excluded.timeout_ms;
    end loop;
  end if;
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'enrich.settings', p_ws::text);
end;
$$;

-- Backfill: contacts with a work or role address that miss a field (or are in a segment), each its own job.
-- p_filter: { missing: title | company | industry | size | seniority | any, segment_id }.
create or replace function public.enrich_backfill_where(p_ws uuid, p_filter jsonb) returns setof uuid
language sql stable security definer set search_path = public as $$
  select c.id from contacts c left join companies co on co.id = c.company_id
  where c.workspace_id = p_ws and c.deleted_at is null and c.email_class in ('work', 'role')
    and (coalesce(p_filter->>'segment_id', '') = '' or exists (select 1 from segment_members sm where sm.segment_id = (p_filter->>'segment_id')::uuid and sm.contact_id = c.id and sm.left_at is null))
    and case coalesce(p_filter->>'missing', 'any')
      when 'title' then c.title is null
      when 'company' then c.company_id is null or co.name is null
      when 'industry' then co.industry is null
      when 'size' then co.size is null
      when 'seniority' then c.seniority is null
      else c.title is null or c.company_id is null or co.industry is null or co.size is null
    end;
$$;

create or replace function public.enrich_backfill_count(p_ws uuid, p_filter jsonb) returns int
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return (select count(*) from enrich_backfill_where(p_ws, p_filter));
end;
$$;

create or replace function public.enrich_backfill_start(p_ws uuid, p_filter jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can start a backfill'; end if;
  n := (select count(*) from enrich_backfill_where(p_ws, p_filter));
  perform enqueue_job(p_ws, 'enrich_backfill', 'bf:start:' || md5(coalesce(p_filter::text, '')), jsonb_build_object('filter', coalesce(p_filter, '{}')), 0, 3);
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, auth.uid(), 'enrich.backfill', p_ws::text, jsonb_build_object('filter', p_filter, 'contacts', n));
  return n;
end;
$$;

create or replace function public.enrich_backfill_page(p_ws uuid, p_filter jsonb, p_after uuid, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  ids := array(select id from enrich_backfill_where(p_ws, p_filter) id where p_after is null or id > p_after order by id limit least(greatest(p_limit, 1), 500));
  perform enqueue_job(p_ws, 'enrich_contact', x::text, jsonb_build_object('contact_id', x, 'trigger', 'backfill'), 0, 5) from unnest(ids) x;
  return jsonb_build_object('count', coalesce(array_length(ids, 1), 0), 'last', ids[array_length(ids, 1)]);
end;
$$;

-- New contacts --------------------------------------------------------------------------------------------------------

create or replace function public.contacts_enrich_new() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  s enrich_settings%rowtype;
  src text := case when new.source in ('form', 'typeform', 'tally', 'jotform', 'fillout', 'formstack', 'webflow', 'framer', 'wordpress', 'wix') then 'form'
                   when new.source in ('calendly', 'chilipiper', 'calcom', 'savvycal', 'booking') then 'booking'
                   when new.source = 'api' then 'api' when new.source = 'manual' then 'manual'
                   when source_class(new.source) = 'crm' then 'crm' else 'import' end;
begin
  if new.email_class not in ('work', 'role') then return new; end if;
  select * into s from enrich_settings where workspace_id = new.workspace_id;
  if s.workspace_id is not null and (not s."on" or not src = any(s.sources)) then return new; end if;
  if s.workspace_id is null and src not in ('form', 'booking', 'api', 'manual') then return new; end if;
  perform enqueue_job(new.workspace_id, 'enrich_contact', new.id::text, jsonb_build_object('contact_id', new.id, 'trigger', 'new'), 2, 5);
  return new;
end;
$$;
drop trigger if exists contacts_enrich_new on public.contacts;
create trigger contacts_enrich_new after insert on public.contacts for each row execute function public.contacts_enrich_new();

-- Grants ----------------------------------------------------------------------------------------------------------

revoke execute on function public.enrich_cap(uuid) from public, anon, authenticated;
revoke execute on function public.enrich_spend(uuid, int) from public, anon, authenticated;
revoke execute on function public.enrich_refund(uuid, int) from public, anon, authenticated;
revoke execute on function public.enrich_cache_get(text, text, int) from public, anon, authenticated;
revoke execute on function public.enrich_cache_put(text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.enrich_load(uuid) from public, anon, authenticated;
revoke execute on function public.enrich_load_email(uuid, text) from public, anon, authenticated;
revoke execute on function public.enrich_write(uuid, text, jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.enrich_write_company(uuid, text, jsonb, boolean) from public, anon, authenticated;
revoke execute on function public.enrich_run_log(uuid, uuid, text, jsonb, text[], int, int) from public, anon, authenticated;
revoke execute on function public.qualify_store(uuid, text, text, text, text[]) from public, anon, authenticated;
revoke execute on function public.qualify_load(uuid) from public, anon, authenticated;
revoke execute on function public.router_facts_more(uuid) from public, anon, authenticated;
revoke execute on function public.enrich_backfill_where(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.enrich_backfill_page(uuid, jsonb, uuid, int) from public, anon, authenticated;
revoke execute on function public.enrich_backfill_count(uuid, jsonb) from public, anon;
revoke execute on function public.enrich_backfill_start(uuid, jsonb) from public, anon;
grant execute on function public.enrich_backfill_count(uuid, jsonb) to authenticated;
grant execute on function public.enrich_backfill_start(uuid, jsonb) to authenticated;
revoke execute on function public.person_cache_forget() from public, anon, authenticated;
revoke execute on function public.contacts_enrich_new() from public, anon, authenticated;
revoke execute on function public.enrich_settings_save(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.enrich_settings_save(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.enrich_cap(uuid) to service_role;
grant execute on function public.enrich_spend(uuid, int) to service_role;
grant execute on function public.enrich_refund(uuid, int) to service_role;
grant execute on function public.enrich_cache_get(text, text, int) to service_role;
grant execute on function public.enrich_cache_put(text, text, text, jsonb) to service_role;
grant execute on function public.enrich_load(uuid) to service_role;
grant execute on function public.enrich_load_email(uuid, text) to service_role;
grant execute on function public.enrich_write(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.enrich_write_company(uuid, text, jsonb, boolean) to service_role;
grant execute on function public.enrich_run_log(uuid, uuid, text, jsonb, text[], int, int) to service_role;
grant execute on function public.qualify_store(uuid, text, text, text, text[]) to service_role;
grant execute on function public.qualify_load(uuid) to service_role;
grant execute on function public.router_facts_more(uuid) to service_role;
grant execute on function public.enrich_backfill_page(uuid, jsonb, uuid, int) to service_role;
grant execute on function public.enrich_backfill_where(uuid, jsonb) to service_role;
grant select, insert, update, delete on public.person_cache, public.enrich_keys, public.enrich_settings, public.enrich_sources, public.enrich_runs, public.enrich_usage, public.qualify_settings to service_role;
