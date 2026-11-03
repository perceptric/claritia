-- The design system (docs/design-system.md Part 8). Run after 071. Safe to run more than once.
--
-- A brand kit becomes a design system in place: its tokens stay the built-in variables, and two new columns hold the
-- rest (src/lib/design/model.ts DesignSystem): `design` is the draft people edit, `design_live` is what live forms
-- use. "Publish styles" copies the draft to live, so editing a class never changes a live form by surprise.
-- `design_rev` goes up on every save; a save that names an older rev is refused, so two people editing the same
-- class never overwrite each other unseen. The server checks every design (readSystem) before it calls these.

alter table public.brand_kits
  add column if not exists design jsonb not null default '{}' check (jsonb_typeof(design) = 'object' and length(design::text) <= 400000),
  add column if not exists design_live jsonb not null default '{}' check (jsonb_typeof(design_live) = 'object' and length(design_live::text) <= 400000),
  add column if not exists design_rev int not null default 0,
  add column if not exists design_published_at timestamptz;

-- Save the draft. Returns the new rev; raises when someone saved since `p_rev`.
create or replace function public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev int) returns int
language plpgsql security definer set search_path = public as $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id for update;
  if k.id is null or not exists (select 1 from workspace_members where workspace_id = k.workspace_id and user_id = p_user) then
    raise exception 'Design system not found';
  end if;
  if k.design_rev <> p_rev then
    raise exception 'Changed elsewhere';
  end if;
  update brand_kits set design = p_design, design_rev = design_rev + 1, updated_at = now() where id = p_id;
  return k.design_rev + 1;
end;
$$;

-- What publishing would change: the live forms on this kit.
create or replace function public.brand_kit_design_uses(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id;
  if k.id is null or not is_member(k.workspace_id) then
    raise exception 'Design system not found';
  end if;
  return jsonb_build_object(
    'live_forms', (select count(*) from forms where brand_kit_id = p_id and status = 'live'),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from forms where brand_kit_id = p_id and status = 'live'), '[]'),
    'changed', k.design is distinct from k.design_live);
end;
$$;

-- Publish the draft: live forms pick it up on their next load (the public route caches for 10 seconds).
create or replace function public.brand_kit_design_publish(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id for update;
  if k.id is null or not is_member(k.workspace_id) then
    raise exception 'Design system not found';
  end if;
  update brand_kits set design_live = design, design_published_at = now() where id = p_id;
end;
$$;

-- The live form for <claritia-form>, now with the kit's published design.
create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = f.brand_kit_id
  where f.id = p_id and f.status in ('live', 'paused');
$$;

do $$
begin
  revoke execute on function public.brand_kit_design_save(uuid, uuid, jsonb, int) from public, anon, authenticated;
  grant execute on function public.brand_kit_design_save(uuid, uuid, jsonb, int) to service_role;
  revoke execute on function public.brand_kit_design_uses(uuid) from public, anon;
  grant execute on function public.brand_kit_design_uses(uuid) to authenticated;
  revoke execute on function public.brand_kit_design_publish(uuid) from public, anon;
  grant execute on function public.brand_kit_design_publish(uuid) to authenticated;
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
end;
$$;
