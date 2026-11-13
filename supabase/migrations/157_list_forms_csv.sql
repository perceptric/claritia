-- Lists that fill from forms, and CSV imports with a history (docs/email-studio-plan.md, the Brew comparison, step 2).
--   list_forms          a list fills from these forms: each fill that isn't spam or a test joins the list, which also
--                       starts any "Joined a list" automation (153). Set from the list in Audiences, or from the form's
--                       On Submission ("Add to a list"); both read and write the same rows.
--   list_form_set       add or remove one form from one list, for members of the workspace.
--   submissions trigger a fill joins its form's lists when it gets its person: on insert, or later when a held fill is
--                       released (submission_release) or a spam mark is cleared.
--   contact_import_log  one row per import: the file, the list, what was added, left out and held.
--   contact_imports     (155) also keeps the file's name, and holds up to 5,000 people.

create table if not exists public.list_forms (
  list_id uuid not null references public.lists (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, form_id)
);
create index if not exists list_forms_form on public.list_forms (form_id);
alter table public.list_forms enable row level security;
drop policy if exists "members read" on public.list_forms;
create policy "members read" on public.list_forms for select using (is_member(workspace_id));
grant select on public.list_forms to authenticated;

create or replace function public.list_form_set(p_ws uuid, p_list uuid, p_form uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if not exists (select 1 from lists where id = p_list and workspace_id = p_ws) then raise exception 'List not found'; end if;
  if not exists (select 1 from forms where id = p_form and workspace_id = p_ws) then raise exception 'Form not found'; end if;
  if p_on then
    insert into list_forms (list_id, form_id, workspace_id) values (p_list, p_form, p_ws) on conflict do nothing;
  else
    delete from list_forms where list_id = p_list and form_id = p_form;
  end if;
  return p_on;
end;
$$;

create or replace function public.submission_joins_lists() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into list_members (list_id, contact_id, workspace_id)
  select lf.list_id, new.contact_id, new.workspace_id from list_forms lf
  where lf.form_id = new.form_id and lf.workspace_id = new.workspace_id
  on conflict (list_id, contact_id) do nothing;
  return null;
end;
$$;
drop trigger if exists submissions_join_lists on public.submissions;
create trigger submissions_join_lists after insert or update of contact_id, spam on public.submissions
  for each row when (new.contact_id is not null and not new.spam and not new.test and new.form_id is not null)
  execute function public.submission_joins_lists();

create table if not exists public.contact_import_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  list_id uuid references public.lists (id) on delete set null,
  list_name text not null default '' check (length(list_name) <= 80),
  file_name text not null default '' check (length(file_name) <= 200),
  rows_in int not null default 0 check (rows_in >= 0),
  added int not null default 0 check (added >= 0),
  created int not null default 0 check (created >= 0),
  skipped int not null default 0 check (skipped >= 0),
  disposable int not null default 0 check (disposable >= 0),
  shared int not null default 0 check (shared >= 0),
  held int not null default 0 check (held >= 0),
  consent boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists contact_import_log_ws on public.contact_import_log (workspace_id, created_at desc);
alter table public.contact_import_log enable row level security;
drop policy if exists "members read" on public.contact_import_log;
create policy "members read" on public.contact_import_log for select using (is_member(workspace_id));
grant select on public.contact_import_log to authenticated;

alter table public.contact_imports add column if not exists file_name text not null default '' check (length(file_name) <= 200);
alter table public.contact_imports drop constraint if exists contact_imports_people_check;
alter table public.contact_imports add constraint contact_imports_people_check check (jsonb_typeof(people) = 'array' and jsonb_array_length(people) between 1 and 5000);

revoke execute on function public.list_form_set(uuid, uuid, uuid, boolean) from public, anon;
grant execute on function public.list_form_set(uuid, uuid, uuid, boolean) to authenticated, service_role;

notify pgrst, 'reload schema';
