-- Email groups (docs/email-studio-plan.md, the Brew comparison, step 3): a group's emails side by side on one canvas
-- in Campaigns, like "Welcome series" with Welcome, Class reminder and Monthly news. Each email is still its own
-- campaign, sent on its own; the group only holds them together and in order.
--   email_groups         the groups, by workspace.
--   emails.group_id      the group an email is in (deleting a group leaves its emails in Campaigns), and its place.
--   email_group_save     make or rename a group.
--   email_group_delete   delete a group; its emails stay.
--   email_group_place    put an email in a group at a place (null: out of its group); the others close up.

create table if not exists public.email_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists email_groups_ws on public.email_groups (workspace_id, created_at);
alter table public.email_groups enable row level security;
drop policy if exists "members read" on public.email_groups;
create policy "members read" on public.email_groups for select using (is_member(workspace_id));
grant select on public.email_groups to authenticated;

alter table public.emails add column if not exists group_id uuid references public.email_groups (id) on delete set null;
alter table public.emails add column if not exists group_position int not null default 0;
create index if not exists emails_group on public.emails (group_id, group_position) where group_id is not null;

create or replace function public.email_group_save(p_ws uuid, p_id uuid, p_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  gid uuid;
  nm text := left(btrim(coalesce(p_name, '')), 80);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if nm = '' then raise exception 'Name the group'; end if;
  if p_id is null then
    insert into email_groups (workspace_id, name, created_by) values (p_ws, nm, auth.uid()) returning id into gid;
  else
    update email_groups set name = nm where id = p_id and workspace_id = p_ws returning id into gid;
    if gid is null then raise exception 'Group not found'; end if;
  end if;
  return gid;
end;
$$;

create or replace function public.email_group_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from email_groups where id = p_id and workspace_id = p_ws;
  return found;
end;
$$;

create or replace function public.email_group_place(p_ws uuid, p_email uuid, p_group uuid, p_position int) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  old_group uuid;
  pos int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select group_id into old_group from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast' for update;
  if not found then raise exception 'Email not found'; end if;
  if p_group is not null and not exists (select 1 from email_groups where id = p_group and workspace_id = p_ws) then raise exception 'Group not found'; end if;
  if p_group is null then
    update emails set group_id = null, group_position = 0 where id = p_email;
  else
    pos := greatest(0, least(coalesce(p_position, 1000000), (select count(*)::int from emails where group_id = p_group and id <> p_email)));
    update emails set group_id = p_group, group_position = -1 where id = p_email;
    -- Number the group again around the new place: 0, 1, 2 …
    with o as (
      select id, row_number() over (order by group_position, created_at, id) - 1 as i from emails where group_id = p_group and id <> p_email
    )
    update emails e set group_position = case when o.i < pos then o.i else o.i + 1 end from o where e.id = o.id;
    update emails set group_position = pos where id = p_email;
  end if;
  if old_group is not null and old_group is distinct from p_group then
    with o as (select id, row_number() over (order by group_position, created_at, id) - 1 as i from emails where group_id = old_group)
    update emails e set group_position = o.i from o where e.id = o.id;
  end if;
  return true;
end;
$$;

revoke execute on function public.email_group_save(uuid, uuid, text) from public, anon;
grant execute on function public.email_group_save(uuid, uuid, text) to authenticated, service_role;
revoke execute on function public.email_group_delete(uuid, uuid) from public, anon;
grant execute on function public.email_group_delete(uuid, uuid) to authenticated, service_role;
revoke execute on function public.email_group_place(uuid, uuid, uuid, int) from public, anon;
grant execute on function public.email_group_place(uuid, uuid, uuid, int) to authenticated, service_role;

notify pgrst, 'reload schema';
