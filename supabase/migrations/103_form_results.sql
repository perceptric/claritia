-- Interactive forms, step 2 (docs/interactive-forms-plan.md Part 7): the result a submission reached, kept as it was.
-- The server works out every calc and the outcome again from the published version, and saves them here once. A
-- later version with new prices or formulas never rewrites an old result. Safe to run more than once. Run after 102.

create table if not exists public.submission_results (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid references public.forms (id) on delete set null,
  form_version int not null,
  -- The formula engine's version, so a result can be read the way it was worked out.
  engine int not null default 1,
  outcome_id text check (outcome_id ~ '^[a-z0-9]{1,24}$'),
  outcome_title text check (length(outcome_title) <= 300),
  -- Each calc by field key, as numbers (null when it couldn't be worked out).
  "values" jsonb not null default '{}' check (jsonb_typeof("values") = 'object' and length("values"::text) <= 16000),
  -- The settings used, private ones included: this table is never public.
  constants jsonb not null default '{}' check (jsonb_typeof(constants) = 'object' and length(constants::text) <= 16000),
  created_at timestamptz not null default now()
);
create index if not exists submission_results_form on public.submission_results (form_id, created_at desc);
create index if not exists submission_results_outcome on public.submission_results (form_id, outcome_id);
alter table public.submission_results enable row level security;
drop policy if exists "members read" on public.submission_results;
create policy "members read" on public.submission_results for select using (is_member(workspace_id));
revoke all on public.submission_results from anon;
revoke insert, update, delete on public.submission_results from authenticated;

-- Save a submission's result once. A repeat send (same submission) keeps the first result.
create or replace function public.submission_result_save(p_sid uuid, p_engine int, p_outcome_id text, p_outcome_title text,
  p_values jsonb, p_constants jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s record;
  n int;
begin
  select workspace_id, form_id, form_version into s from submissions where id = p_sid;
  if not found then raise exception 'Submission not found'; end if;
  insert into submission_results (submission_id, workspace_id, form_id, form_version, engine, outcome_id, outcome_title, "values", constants)
  values (p_sid, s.workspace_id, s.form_id, s.form_version, coalesce(p_engine, 1), p_outcome_id, left(p_outcome_title, 300),
    coalesce(p_values, '{}'), coalesce(p_constants, '{}'))
  on conflict (submission_id) do nothing;
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function public.submission_result_save(uuid, int, text, text, jsonb, jsonb) from public, anon, authenticated;
