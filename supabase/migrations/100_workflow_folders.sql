-- Workflow folders (docs/workflows.md): the Workflows page lists folders, each holding workflows. People make,
-- rename, reorder and delete folders; a deleted folder's workflows stay, outside any folder. A workspace with no
-- folders yet gets one per group it had (the lifecycle stages, then Workflows) the first time the page asks.

create table if not exists public.workflow_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists workflow_folders_ws on public.workflow_folders (workspace_id, position);
alter table public.workflow_folders enable row level security;
drop policy if exists "members read" on public.workflow_folders;
create policy "members read" on public.workflow_folders for select using (is_member(workspace_id));

alter table public.workflows add column if not exists folder_id uuid references public.workflow_folders (id) on delete set null;

-- The folders, made from the old groups the first time: one per lifecycle stage in use, then Workflows for the rest.
create or replace function public.workflow_folders_start(p_ws uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  st record;
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if exists (select 1 from workflow_folders where workspace_id = p_ws) then return 0; end if;
  for st in
    select x.stage, x.label, x.ord from (values ('trial', 'Trial', 1), ('pipeline', 'Pipeline', 2), ('customer', 'Customer', 3)) x(stage, label, ord)
    where exists (select 1 from workflows w where w.workspace_id = p_ws and w.stage = x.stage)
    order by x.ord
  loop
    insert into workflow_folders (workspace_id, name, position) values (p_ws, st.label, n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and stage = st.stage and folder_id is null;
    n := n + 1;
  end loop;
  insert into workflow_folders (workspace_id, name, position) values (p_ws, 'Workflows', n) returning id into fid;
  update workflows set folder_id = fid where workspace_id = p_ws and folder_id is null;
  return n + 1;
end;
$$;

-- Make a folder (no id) or rename one.
create or replace function public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Name the folder'; end if;
  if p_id is null then
    if (select count(*) from workflow_folders where workspace_id = p_ws) >= 50 then raise exception 'Up to 50 folders'; end if;
    insert into workflow_folders (workspace_id, name, position)
    values (p_ws, left(btrim(p_name), 60), coalesce((select max(position) + 1 from workflow_folders where workspace_id = p_ws), 0))
    returning id into fid;
    return fid;
  end if;
  update workflow_folders set name = left(btrim(p_name), 60) where id = p_id and workspace_id = p_ws returning id into fid;
  if fid is null then raise exception 'Folder not found'; end if;
  return fid;
end;
$$;

-- Delete a folder; its workflows stay, outside any folder.
create or replace function public.workflow_folder_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from workflow_folders where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

-- Move a folder up or down one place.
create or replace function public.workflow_folder_move(p_ws uuid, p_id uuid, p_by int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
  i int;
  j int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select array_agg(id order by position, created_at) into ids from workflow_folders where workspace_id = p_ws;
  i := array_position(ids, p_id);
  if i is null then raise exception 'Folder not found'; end if;
  j := i + sign(p_by)::int;
  if j < 1 or j > cardinality(ids) then return false; end if;
  ids[i] := ids[j];
  ids[j] := p_id;
  update workflow_folders f set position = x.ord - 1 from unnest(ids) with ordinality x(id, ord) where f.id = x.id;
  return true;
end;
$$;

-- Put a workflow in a folder (null: outside any folder).
create or replace function public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_folder is not null and not exists (select 1 from workflow_folders where id = p_folder and workspace_id = p_ws) then raise exception 'Folder not found'; end if;
  update workflows set folder_id = p_folder where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

revoke execute on function public.workflow_folders_start(uuid) from public, anon;
revoke execute on function public.workflow_folder_save(uuid, uuid, text) from public, anon;
revoke execute on function public.workflow_folder_delete(uuid, uuid) from public, anon;
revoke execute on function public.workflow_folder_move(uuid, uuid, int) from public, anon;
revoke execute on function public.workflow_set_folder(uuid, uuid, uuid) from public, anon;
grant execute on function public.workflow_folders_start(uuid) to authenticated;
grant execute on function public.workflow_folder_save(uuid, uuid, text) to authenticated;
grant execute on function public.workflow_folder_delete(uuid, uuid) to authenticated;
grant execute on function public.workflow_folder_move(uuid, uuid, int) to authenticated;
grant execute on function public.workflow_set_folder(uuid, uuid, uuid) to authenticated;
