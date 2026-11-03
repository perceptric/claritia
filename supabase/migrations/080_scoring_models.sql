-- Lead scoring models (docs/scoring-plan.md Part 4). A workspace has one or more models; each has a draft, published
-- versions and a revision so a second editor's save shows as a conflict. The model's rules run in TypeScript
-- (src/lib/scoring/engine.ts) on the worker; this file stores them, reads the facts the engine needs and writes scores.
-- A workspace with a live model stops using the fixed math in 043_lead_scoring.sql.

create table if not exists public.scoring_models (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  position int not null default 0,
  draft jsonb,
  draft_base int,
  revision int not null default 0,
  live_version int,
  built jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scoring_models_ws on public.scoring_models (workspace_id, position);

create table if not exists public.scoring_versions (
  model_id uuid not null references public.scoring_models (id) on delete cascade,
  version int not null,
  body jsonb not null,
  published_by uuid,
  published_at timestamptz not null default now(),
  primary key (model_id, version)
);

alter table public.scoring_models enable row level security;
alter table public.scoring_versions enable row level security;
create policy "members read" on public.scoring_models for select using (is_member(workspace_id));
create policy "members read" on public.scoring_versions for select using (exists (select 1 from scoring_models m where m.id = model_id and is_member(m.workspace_id)));
revoke all on public.scoring_models, public.scoring_versions from anon;
revoke insert, update, delete on public.scoring_models, public.scoring_versions from authenticated;

alter table public.contacts add column if not exists score_grade text check (length(score_grade) <= 4);
alter table public.contacts add column if not exists score_model uuid;

-- Save a draft. Refused when someone saved since `p_revision` (null skips the check).
create or replace function public.scoring_save_draft(p_model uuid, p_body jsonb, p_revision int) returns int
language plpgsql security definer set search_path = public as $$
declare
  r int;
begin
  update scoring_models set draft = p_body, draft_base = coalesce(draft_base, live_version), revision = revision + 1, updated_at = now()
  where id = p_model and (p_revision is null or revision = p_revision)
  returning revision into r;
  if r is null then raise exception 'The model changed in another window. Reload to see the latest.' using errcode = 'P0409'; end if;
  return r;
end;
$$;

-- Publish the draft as the next version. The old fixed scoring turns off for the workspace.
create or replace function public.scoring_publish(p_model uuid, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  m scoring_models;
  v int;
begin
  select * into m from scoring_models where id = p_model for update;
  if m.id is null or m.draft is null then raise exception 'There is nothing to publish.'; end if;
  v := coalesce((select max(version) from scoring_versions where model_id = p_model), 0) + 1;
  insert into scoring_versions (model_id, version, body, published_by) values (p_model, v, m.draft, p_user);
  update scoring_models set live_version = v, draft = null, draft_base = null, revision = revision + 1, updated_at = now() where id = p_model;
  update lead_settings set enabled = false, updated_at = now() where workspace_id = m.workspace_id;
  return v;
end;
$$;

-- What the engine needs for some leads: their field values, what they did in the last year, and whether they went on
-- to meet sales. Only verified and asserted visits count; a probable link never adds activity. `p_since` picks leads
-- created since then (for Results on past leads); `p_ids` picks leads by id (for scoring); `p_after` pages by id.
create or replace function public.scoring_facts(p_ws uuid, p_since timestamptz default null, p_ids uuid[] default null, p_after uuid default null, p_limit int default 1000)
returns jsonb
language sql stable security definer set search_path = public as $$
  with picked as (
    select c.* from contacts c
    where c.workspace_id = p_ws and c.deleted_at is null
      and (p_ids is null or c.id = any(p_ids))
      and (p_since is null or c.created_at >= p_since)
      and (p_after is null or c.id > p_after)
    order by c.id
    limit least(greatest(p_limit, 1), 2000)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'created', c.created_at,
    'values', jsonb_strip_nulls(jsonb_build_object(
      'lead.country', coalesce(co.country, c.country),
      'contact.email_domain', split_part(c.email_clean, '@', 2),
      'contact.email_class', c.email_class,
      'contact.title', c.title,
      'contact.seniority', c.seniority,
      'contact.department', c.department,
      'contact.country', c.country,
      'contact.region', c.region,
      'contact.lifecycle', c.lifecycle,
      'contact.lead_status', c.lead_status,
      'company.name', co.name,
      'company.domain', co.domain,
      'company.country', co.country,
      'company.industry', co.industry,
      'company.size', co.size,
      'company.employees', co.size)) || coalesce((select jsonb_object_agg('contact.f.' || k, v) from jsonb_each(c.fields) x(k, v)), '{}')
        || coalesce((select jsonb_object_agg('company.f.' || k, v) from jsonb_each(co.fields) x(k, v)), '{}'),
    'events', coalesce((
      select jsonb_agg(e order by e->>'at' desc) from (
        (select jsonb_build_object('k', case ev.kind when 'form.submitted' then 'form' when 'meeting.booked' then 'meeting' when 'email.clicked' then 'click' else 'unsub' end,
                  'd', ev.data->>'form_id', 'at', ev.at) as e
         from contact_events ev
         where ev.contact_id = c.id and ev.at > now() - interval '365 days'
           and ev.kind in ('form.submitted', 'meeting.booked', 'email.clicked', 'email.unsubscribed')
         order by ev.at desc limit 200)
        union all
        (select jsonb_build_object('k', case when x.kind = 'custom' then 'product' else 'page' end,
                  'd', case when x.kind = 'custom' then left(coalesce(x.data->>'name', x.title), 120) else left(x.path, 300) end, 'at', x.server_at)
         from sessions s join events x on x.session_id = s.id and x.workspace_id = p_ws and x.day >= (now() - interval '365 days')::date
         where c.person_id is not null and s.workspace_id = p_ws and s.person_id = c.person_id
           and s.person_level in ('verified', 'asserted') and not s.is_bot and not s.internal
           and x.kind in ('view', 'custom')
         order by x.server_at desc limit 200)
      ) q), '[]'),
    'met', c.lifecycle in ('sql', 'opportunity', 'customer')
      or exists (select 1 from contact_events ev where ev.contact_id = c.id and ev.kind = 'meeting.booked')
  ) order by c.id), '[]')
  from picked c
  left join companies co on co.id = c.company_id;
$$;

-- Write scores. Each row: id, score, band, grade, fit, act, reasons. A band change adds a lead.band event once
-- (069_workflows.sql), so running the same batch twice changes nothing.
create or replace function public.scoring_write(p_ws uuid, p_model uuid, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update contacts c set
    score = (r->>'score')::int,
    score_band = r->>'band',
    score_grade = r->>'grade',
    fit_score = (r->>'fit')::int,
    engagement_score = (r->>'act')::int,
    score_reasons = r->'reasons',
    score_model = p_model,
    scored_at = now(),
    qualified_at = case when r->>'band' = 'hot' and c.score_band is distinct from 'hot' then now() else c.qualified_at end
  from jsonb_array_elements(p_rows) r
  where c.workspace_id = p_ws and c.id = (r->>'id')::uuid
    and (c.score is distinct from (r->>'score')::int or c.score_band is distinct from r->>'band' or c.score_grade is distinct from r->>'grade'
         or c.fit_score is distinct from (r->>'fit')::int or c.engagement_score is distinct from (r->>'act')::int or c.score_model is distinct from p_model);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Leads that are new, changed or did something since `p_since`, for the worker's quick pass (up to 2,000).
create or replace function public.scoring_changed(p_ws uuid, p_since timestamptz) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(id), '{}') from (
    select c.id from contacts c where c.workspace_id = p_ws and c.deleted_at is null and (c.created_at >= p_since or c.updated_at >= p_since)
    union
    select e.contact_id from contact_events e where e.workspace_id = p_ws and e.at >= p_since and e.kind in ('form.submitted', 'meeting.booked', 'email.clicked', 'email.unsubscribed')
    limit 2000
  ) x;
$$;

revoke execute on function public.scoring_save_draft(uuid, jsonb, int) from public, anon, authenticated;
revoke execute on function public.scoring_publish(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.scoring_facts(uuid, timestamptz, uuid[], uuid, int) from public, anon, authenticated;
revoke execute on function public.scoring_write(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.scoring_changed(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.scoring_save_draft(uuid, jsonb, int) to service_role;
grant execute on function public.scoring_publish(uuid, uuid) to service_role;
grant execute on function public.scoring_facts(uuid, timestamptz, uuid[], uuid, int) to service_role;
grant execute on function public.scoring_write(uuid, uuid, jsonb) to service_role;
grant execute on function public.scoring_changed(uuid, timestamptz) to service_role;
grant all on public.scoring_models, public.scoring_versions to service_role;
