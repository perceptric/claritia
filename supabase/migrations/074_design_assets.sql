-- Uploaded images for emails and forms (docs/design-system.md Part 6). Run after 073. Safe to run more than once.
--
-- Files live in the public "assets" bucket under <workspace id>/<asset id>.<ext>, so mail apps can load them. Only
-- the server writes there (src/app/api/assets/route.ts), after checking each file by its bytes and taking out photo
-- metadata. design_assets lists them for the builder's Assets panel; members see their workspace's.

insert into storage.buckets (id, name, public) values ('assets', 'assets', true) on conflict (id) do update set public = true;

create table if not exists public.design_assets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  path text not null check (length(path) <= 200),
  url text not null check (length(url) <= 1000),
  name text not null default '' check (length(name) <= 200),
  kind text not null default 'image' check (kind in ('image', 'logo')),
  type text not null check (type in ('image/png', 'image/jpeg', 'image/gif', 'image/webp')),
  width int not null check (width > 0),
  height int not null check (height > 0),
  bytes int not null check (bytes > 0 and bytes <= 5242880),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists design_assets_ws on public.design_assets (workspace_id, created_at desc);
alter table public.design_assets enable row level security;
drop policy if exists "members read assets" on public.design_assets;
create policy "members read assets" on public.design_assets for select to authenticated using (is_member(workspace_id));

-- Add one (the server, after its checks). Up to 2,000 a workspace.
create or replace function public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width int, p_height int, p_bytes int) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  aid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'Workspace not found'; end if;
  if (select count(*) from design_assets where workspace_id = p_ws) >= 2000 then raise exception 'Up to 2,000 images'; end if;
  insert into design_assets (workspace_id, path, url, name, type, width, height, bytes, created_by)
  values (p_ws, p_path, p_url, left(coalesce(p_name, ''), 200), p_type, p_width, p_height, p_bytes, p_user) returning id into aid;
  return aid;
end;
$$;

-- Remove one from the list. Emails already sent keep showing it until the file goes (the server removes it).
create or replace function public.design_asset_delete(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  a design_assets%rowtype;
begin
  select * into a from design_assets where id = p_id;
  if a.id is null or not is_member(a.workspace_id) then raise exception 'Image not found'; end if;
  delete from design_assets where id = p_id;
  return a.path;
end;
$$;

do $$
begin
  revoke execute on function public.design_asset_add(uuid, uuid, text, text, text, text, int, int, int) from public, anon, authenticated;
  grant execute on function public.design_asset_add(uuid, uuid, text, text, text, text, int, int, int) to service_role;
  revoke execute on function public.design_asset_delete(uuid) from public, anon;
  grant execute on function public.design_asset_delete(uuid) to authenticated;
end;
$$;
