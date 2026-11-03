-- Brand capture (docs/brand-capture.md). Run after 106. Safe to run more than once.
--
-- The workspace's brand: one brand kit is the workspace's own (workspaces.brand_kit_id), set by the first site the
-- workspace scans (onboarding) and changeable in Brand. New forms, booking pages and the meeting editor wear it.
-- The quick read: the web server reads a site's look from its HTML and stylesheets the moment it's entered and saves
-- it here (brand_kit_quick), so the kit is ready in seconds. The runner's full scan replaces it when it finishes; a
-- full scan that fails keeps the quick look instead of leaving the kit empty.

alter table public.workspaces add column if not exists brand_kit_id uuid references public.brand_kits (id) on delete set null;
alter table public.brand_kits add column if not exists quick_at timestamptz;

-- The first kit a workspace makes becomes its brand.
create or replace function public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid default null, p_form uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  kid uuid := p_kit;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Workspace not found';
  end if;
  if p_url !~ '^https?://[^\s/]+' or length(p_url) > 1000 then
    raise exception 'Enter the site''s address';
  end if;
  if kid is null then
    insert into brand_kits (workspace_id, name, source_url, scan_status)
    values (p_ws, left(substring(p_url from '^https?://(?:www\.)?([^/:?#]+)'), 120), p_url, 'scanning')
    returning id into kid;
  else
    update brand_kits set source_url = p_url, scan_status = 'scanning', scan_error = null, updated_at = now() where id = kid and workspace_id = p_ws;
    if not found then
      raise exception 'Brand kit not found';
    end if;
  end if;
  update workspaces set brand_kit_id = kid where id = p_ws and brand_kit_id is null;
  if p_form is not null then
    update forms set brand_kit_id = kid, updated_at = now()
    where id = p_form and workspace_id = p_ws and brand_kit_id is null;
  end if;
  perform enqueue_job(p_ws, 'brand_scan', kid::text, jsonb_build_object('kit_id', kid, 'url', p_url), 0, 3);
  perform wake_runner();
  return kid;
end;
$$;

-- The quick read's look, while the full scan runs. Never over a finished full scan.
create or replace function public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  if jsonb_typeof(p_tokens) <> 'object' or length(p_tokens::text) > 8000 then return false; end if;
  update brand_kits set
    tokens = p_tokens,
    logo_url = coalesce(logo_url, left(p_logo_url, 1000)),
    scan_status = 'done',
    quick_at = now(),
    scanned_at = coalesce(scanned_at, now()),
    updated_at = now()
  where id = p_kit and (scanned_at is null or quick_at is not null) and (tokens = '{}'::jsonb or quick_at is not null);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- A full scan that fails keeps a look the quick read found; only a kit with nothing is "failed".
create or replace function public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) returns void
language sql security definer set search_path = public as $$
  update brand_kits set
    tokens = case when p_error is null then p_tokens else tokens end,
    logo_url = case when p_error is null then coalesce(p_logo_url, logo_url) else logo_url end,
    notes = case when p_error is null then coalesce(p_notes, '{}') else notes end,
    site_forms = case when p_error is null then coalesce(p_site_forms, '[]') else site_forms end,
    scan_status = case when p_error is null or tokens <> '{}'::jsonb then 'done' else 'failed' end,
    scan_error = left(p_error, 500),
    quick_at = case when p_error is null then null else quick_at end,
    scanned_at = case when p_error is null then now() else scanned_at end,
    updated_at = now()
  where id = p_kit;
$$;

-- Set the workspace's brand (members).
create or replace function public.workspace_brand_set(p_ws uuid, p_kit uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_kit is not null and not exists (select 1 from brand_kits where id = p_kit and workspace_id = p_ws) then raise exception 'Brand kit not found'; end if;
  update workspaces set brand_kit_id = p_kit where id = p_ws;
end;
$$;

-- Booking pages: the form's kit when opened from a form, else the workspace's brand, else its newest kit.
create or replace function public.book_kit(p_ws uuid, p_form uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = p_form and f.workspace_id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from workspaces w join brand_kits k on k.id = w.brand_kit_id where w.id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from brand_kits k where k.workspace_id = p_ws order by k.created_at desc limit 1),
    jsonb_build_object('tokens', '{}'::jsonb, 'logo_url', null, 'design', '{}'::jsonb)
  );
$$;

-- Workspaces that already have kits: their oldest one (the onboarding scan) is their brand.
update workspaces w set brand_kit_id = (select k.id from brand_kits k where k.workspace_id = w.id and k.tokens <> '{}'::jsonb order by k.created_at limit 1)
where w.brand_kit_id is null;

revoke execute on function public.brand_kit_quick(uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function public.workspace_brand_set(uuid, uuid) from public, anon;
grant execute on function public.workspace_brand_set(uuid, uuid) to authenticated;
