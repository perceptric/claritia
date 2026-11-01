-- A published form keeps the brand kit it was published with (docs/form-kinds-plan.md, step 0). Before this, the
-- public form read the form's current kit, so picking another kit in the builder changed the live form at once,
-- without Publish. Now Publish copies the kit over, and the live form reads that copy.

alter table forms add column if not exists live_kit_id uuid references brand_kits(id) on delete set null;
update forms set live_kit_id = brand_kit_id where version > 0 and live_kit_id is null;

create or replace function public.form_publish(p_id uuid, p_user uuid, p_body jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  v int;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not exists (select 1 from workspace_members where workspace_id = f.workspace_id and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  v := f.version + 1;
  insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, p_user);
  update forms set version = v, live_kit_id = brand_kit_id, status = case when status = 'paused' then 'paused' else 'live' end, published_at = now(), updated_at = now() where id = p_id;
  return v;
end;
$$;

create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

-- A fill started before a publish is checked against the version the visitor saw, so publishing never loses it.
create or replace function public.form_version_body(p_form uuid, p_version int) returns jsonb
language sql stable security definer set search_path = public as $$
  select body from form_versions where form_id = p_form and version = p_version;
$$;

do $$
begin
  revoke execute on function public.form_version_body(uuid, int) from public, anon, authenticated;
  grant execute on function public.form_version_body(uuid, int) to service_role;
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  revoke execute on function public.form_publish(uuid, uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
end;
$$;
