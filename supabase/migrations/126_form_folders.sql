-- Form folders (docs/forms-plan.md, Folders): Forms in the sidebar opens onto folders, each holding forms, like
-- Fillout's workspaces. People make, rename, reorder and delete folders; a deleted folder's forms stay, outside any
-- folder (All forms). A form is put in a folder from its row or its page.

create table if not exists public.form_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists form_folders_ws on public.form_folders (workspace_id, position);
alter table public.form_folders enable row level security;
drop policy if exists "members read" on public.form_folders;
create policy "members read" on public.form_folders for select using (is_member(workspace_id));

alter table public.forms add column if not exists folder_id uuid references public.form_folders (id) on delete set null;
create index if not exists forms_folder on public.forms (folder_id) where folder_id is not null;

-- Make a folder (no id) or rename one.
create or replace function public.form_folder_save(p_ws uuid, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name the folder'; end if;
  if p_id is null then
    if (select count(*) from form_folders where workspace_id = p_ws) >= 100 then raise exception 'Up to 100 folders'; end if;
    insert into form_folders (workspace_id, name, position)
    values (p_ws, left(btrim(p_name), 60), coalesce((select max(position) + 1 from form_folders where workspace_id = p_ws), 0))
    returning id into fid;
    return fid;
  end if;
  update form_folders set name = left(btrim(p_name), 60) where id = p_id and workspace_id = p_ws returning id into fid;
  if fid is null then raise exception 'Folder not found'; end if;
  return fid;
end;
$$;

-- Delete a folder; its forms stay, outside any folder.
create or replace function public.form_folder_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from form_folders where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

-- Move a folder up or down one place.
create or replace function public.form_folder_move(p_ws uuid, p_id uuid, p_by int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  i int;
  j int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select array_agg(id order by position, created_at) into ids from form_folders where workspace_id = p_ws;
  i := array_position(ids, p_id);
  if i is null then raise exception 'Folder not found'; end if;
  j := i + sign(p_by)::int;
  if j < 1 or j > cardinality(ids) then return false; end if;
  ids[i] := ids[j];
  ids[j] := p_id;
  update form_folders f set position = x.ord - 1 from unnest(ids) with ordinality x(id, ord) where f.id = x.id;
  return true;
end;
$$;

-- Put a form in a folder (null: outside any folder).
create or replace function public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_folder is not null and not exists (select 1 from form_folders where id = p_folder and workspace_id = p_ws) then raise exception 'Folder not found'; end if;
  update forms set folder_id = p_folder where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

revoke execute on function public.form_folder_save(uuid, uuid, text) from public, anon;
revoke execute on function public.form_folder_delete(uuid, uuid) from public, anon;
revoke execute on function public.form_folder_move(uuid, uuid, int) from public, anon;
revoke execute on function public.form_set_folder(uuid, uuid, uuid) from public, anon;
grant execute on function public.form_folder_save(uuid, uuid, text) to authenticated;
grant execute on function public.form_folder_delete(uuid, uuid) to authenticated;
grant execute on function public.form_folder_move(uuid, uuid, int) to authenticated;
grant execute on function public.form_set_folder(uuid, uuid, uuid) to authenticated;
