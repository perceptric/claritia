-- File uploads on forms (docs/forms-plan.md 3.1, docs/interactive-forms-plan.md 3.1). Run after 105. Safe to run more
-- than once. A visitor's file goes to the private form-uploads bucket the moment it's picked (the upload route
-- checks its size and kind by its bytes); the answer is the upload's token. The fill's save links the uploads to the
-- submission. Only workspace members read them, through a signed link that lasts minutes. Uploads never linked to a
-- submission are deleted after a day, with their files.
--
--   form_upload_add       a checked upload, before the submit (service role)
--   form_uploads_attach   link a fill's uploads to its submission: only this form's, never one already linked
--   form_upload_path      a member's read of one upload's path, for the signed link (members only)
--   form_uploads_stale    the paths of uploads never linked, older than a day, and forgets them (the nightly job)

insert into storage.buckets (id, name, public) values ('form-uploads', 'form-uploads', false) on conflict (id) do nothing;

create table if not exists public.form_uploads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  field_id text not null check (field_id ~ '^[a-z0-9]{1,24}$'),
  submission_id uuid references public.submissions (id) on delete cascade,
  path text not null check (length(path) <= 400),
  name text not null check (length(name) between 1 and 120),
  kind text not null check (length(kind) <= 100),
  bytes int not null check (bytes > 0 and bytes <= 20971520),
  created_at timestamptz not null default now()
);
create index if not exists form_uploads_submission on public.form_uploads (submission_id) where submission_id is not null;
create index if not exists form_uploads_loose on public.form_uploads (created_at) where submission_id is null;
alter table public.form_uploads enable row level security;
drop policy if exists "members read" on public.form_uploads;
create policy "members read" on public.form_uploads for select using (is_member(workspace_id));
revoke all on public.form_uploads from anon;
revoke insert, update, delete on public.form_uploads from authenticated;

create or replace function public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  id uuid;
begin
  select workspace_id into ws from forms where forms.id = p_form;
  if ws is null then raise exception 'Form not found'; end if;
  insert into form_uploads (workspace_id, form_id, field_id, path, name, kind, bytes) values (ws, p_form, p_field, p_path, p_name, p_kind, p_bytes) returning form_uploads.id into id;
  return id;
end;
$$;

create or replace function public.form_uploads_attach(p_sid uuid, p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update form_uploads u set submission_id = p_sid
  from submissions s
  where s.id = p_sid and u.id = any(p_ids) and u.form_id = s.form_id and u.submission_id is null;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function public.form_upload_path(p_id uuid) returns text
language sql stable security definer set search_path = public as $$
  select path from form_uploads where id = p_id and is_member(workspace_id);
$$;

create or replace function public.form_uploads_stale() returns text[]
language plpgsql security definer set search_path = public as $$
declare
  paths text[];
begin
  with gone as (delete from form_uploads where submission_id is null and created_at < now() - interval '1 day' returning path)
  select coalesce(array_agg(path), '{}') into paths from gone;
  return paths;
end;
$$;

revoke execute on function public.form_upload_add(uuid, text, text, text, text, int) from public, anon, authenticated;
revoke execute on function public.form_uploads_attach(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function public.form_uploads_stale() from public, anon, authenticated;
revoke execute on function public.form_upload_path(uuid) from public, anon;
grant execute on function public.form_upload_path(uuid) to authenticated;
