-- The brand skin (docs/brand-skin.md): the stylesheet Claude writes from the site's real controls, read in a browser
-- by the runner's brand scan, and the font files it uses. Every form in the kit's brand wears it, live and in previews.

alter table brand_kits add column if not exists skin jsonb check (skin is null or (jsonb_typeof(skin) = 'object' and length(skin::text) <= 60000));

-- Saved by the runner (service role) once the skin is written.
create or replace function public.brand_kit_skin(p_kit uuid, p_skin jsonb) returns void
language sql security definer set search_path = public as $$
  update brand_kits set skin = p_skin, updated_at = now() where id = p_kit;
$$;

-- The live form also carries its kit's skin.
create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb),
           'kit_id', k.id, 'skin', k.skin)
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

do $$
begin
  revoke execute on function public.brand_kit_skin(uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.brand_kit_skin(uuid, jsonb) to service_role;
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
end;
$$;
