-- The starting workflows (docs/workflows.md, "The starting set"): every workspace gets two folders the first time
-- anyone opens Workflows. Notification holds Form announcement and Meeting announcement. Follow-up holds Form follow-up,
-- Meeting follow-up and No-show follow-up. They are drafts with unapproved emails, so nothing sends until someone
-- reads each email and publishes. The bodies come from the app (src/lib/workflows/templates.ts, STARTING); this
-- files them once per workspace, ahead of any older folders, and marks the workspace so a deleted one stays deleted.

alter table public.workspaces add column if not exists workflow_defaults_at timestamptz;

-- No more empty "Workflows" folder for a new workspace: folders made from the old groups only when there is
-- something to file.
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
  if exists (select 1 from workflows where workspace_id = p_ws and folder_id is null) then
    insert into workflow_folders (workspace_id, name, position) values (p_ws, 'Workflows', n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and folder_id is null;
    n := n + 1;
  end if;
  return n;
end;
$$;

-- p_items: [{ folder, name, draft }] in order. Returns how many workflows it made: 0 after the first time.
create or replace function public.workflow_defaults(p_ws uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  names text[];
  fname text;
  fid uuid;
  made int := 0;
  i int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then raise exception 'Bad starting workflows'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if (select workflow_defaults_at from workspaces where id = p_ws) is not null then return 0; end if;
  update workspaces set workflow_defaults_at = now() where id = p_ws;
  if (select count(*) from workflows where workspace_id = p_ws) + jsonb_array_length(p_items) > 100 then return 0; end if;

  -- The starting folders go first, in the order they're named; older folders move down after them.
  select array_agg(f order by o) into names from (
    select it2->>'folder' f, min(o) o from jsonb_array_elements(p_items) with ordinality x(it2, o) group by it2->>'folder'
  ) g;
  if (select count(*) from workflow_folders where workspace_id = p_ws) + coalesce(array_length(names, 1), 0) > 50 then return 0; end if;
  update workflow_folders set position = position + coalesce(array_length(names, 1), 0) where workspace_id = p_ws;
  for i in 1 .. coalesce(array_length(names, 1), 0) loop
    fname := left(btrim(coalesce(names[i], '')), 60);
    if fname = '' then raise exception 'Name the folder'; end if;
    insert into workflow_folders (workspace_id, name, position) values (p_ws, fname, i - 1);
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'name'), '') = '' or jsonb_typeof(it->'draft') <> 'object' then raise exception 'Bad starting workflows'; end if;
    select id into fid from workflow_folders where workspace_id = p_ws and name = left(btrim(it->>'folder'), 60) order by position limit 1;
    insert into workflows (workspace_id, name, draft, folder_id, created_by)
    values (p_ws, left(btrim(it->>'name'), 120), it->'draft', fid, auth.uid());
    made := made + 1;
  end loop;
  return made;
end;
$$;

revoke execute on function public.workflow_defaults(uuid, jsonb) from public, anon;
grant execute on function public.workflow_defaults(uuid, jsonb) to authenticated;
