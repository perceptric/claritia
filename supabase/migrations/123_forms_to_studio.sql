-- Every form is a Form Studio page (docs/forms-chat-plan.md Part 8).
--
-- 1. form_public no longer hands out the old form look (the kit's tokens, its skin and its design system). It hands
--    out what turns an older form into a page as it's read: the kit's Studio stylesheet and its notes (a gallery
--    style's kit is noted "style:<id>"), with the logo as before.
-- 2. form_to_studio keeps an older form as a page for good, in one step: the draft only while it's still the older
--    kind, and the live version published again as a page only while it's still the version that was read. The form's
--    state, its look and when it was published stay as they were.
-- 3. A page holds its HTML, its CSS and the brand's stylesheet, so a form and a version may be up to a million
--    characters (from 65,536).

create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'logo_url', k.logo_url, 'studio_css', k.studio_css, 'kit_notes', coalesce(to_jsonb(k.notes), '[]'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

create or replace function public.form_to_studio(p_id uuid, p_version int, p_body jsonb, p_draft jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  v int;
  did_draft boolean := false;
  did_live boolean := false;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null then
    return jsonb_build_object('draft', false, 'live', false);
  end if;
  v := f.version;
  if p_draft is not null and jsonb_typeof(p_draft) = 'object' and p_draft ? 'page'
     and not (f.draft ? 'page') and not (f.draft ? 'capture') then
    update forms set draft = p_draft, draft_rev = draft_rev + 1, updated_at = now() where id = p_id;
    did_draft := true;
  end if;
  if p_body is not null and jsonb_typeof(p_body) = 'object' and p_body ? 'page' and f.version > 0 and f.version = p_version
     and exists (select 1 from form_versions where form_id = p_id and version = f.version and not (body ? 'page') and not (body ? 'capture')) then
    v := f.version + 1;
    insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, null);
    update forms set version = v where id = p_id;
    did_live := true;
  end if;
  return jsonb_build_object('draft', did_draft, 'live', did_live, 'version', v);
end;
$$;

alter table public.forms drop constraint if exists forms_draft_check;
alter table public.forms add constraint forms_draft_check check (jsonb_typeof(draft) = 'object' and length(draft::text) <= 1000000);
alter table public.form_versions drop constraint if exists form_versions_body_check;
alter table public.form_versions add constraint form_versions_body_check check (jsonb_typeof(body) = 'object' and length(body::text) <= 1000000);

do $$
begin
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
  revoke execute on function public.form_to_studio(uuid, int, jsonb, jsonb) from public, anon, authenticated;
  grant execute on function public.form_to_studio(uuid, int, jsonb, jsonb) to service_role;
end;
$$;
