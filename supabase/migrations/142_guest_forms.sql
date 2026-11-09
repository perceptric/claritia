-- Forms made from chat before signing up (docs/mcp.md, "Forms before sign-up"). ChatGPT or Claude makes a form for
-- someone with no account: it goes live at once in a workspace of its own with no members, held by a secret key the
-- app keeps (to change the form) and the person gets as a claim link. Claiming signs them in and makes them the
-- workspace's owner; an empty workspace made by that very sign-in is dropped, so a new account opens on the form.
--   Unclaimed, the form closes after 14 days (the public form read shows it paused). One address makes at most 20 a
--   day. The workspace is on the Free plan like any other, so the form carries the Claritia badge.

alter table public.workspaces add column if not exists guest_token_hash text unique check (guest_token_hash ~ '^[0-9a-f]{64}$');
alter table public.workspaces add column if not exists guest_until timestamptz;
alter table public.workspaces add column if not exists guest_ip_hash text check (guest_ip_hash ~ '^[0-9a-f]{64}$');
create index if not exists workspaces_guest_ip on public.workspaces (guest_ip_hash, created_at) where guest_ip_hash is not null;

-- A guest form, live as version 1: its id.
create or replace function public.guest_form_make(p_name text, p_token_hash text, p_ip_hash text, p_body jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  fid uuid;
  n text := left(coalesce(nullif(btrim(p_name), ''), 'Untitled form'), 120);
begin
  if (select count(*) from workspaces where guest_ip_hash = p_ip_hash and created_at > now() - interval '1 day') >= 20 then
    raise exception 'too_many_guest_forms';
  end if;
  insert into workspaces (name, named, guest_token_hash, guest_until, guest_ip_hash)
  values (left(n, 80), false, p_token_hash, now() + interval '14 days', p_ip_hash)
  returning id into ws;
  insert into forms (workspace_id, name, draft, kind, status, version, published_at)
  values (ws, n, p_body, 'built', 'live', 1, now())
  returning id into fid;
  insert into form_versions (form_id, workspace_id, version, body) values (fid, ws, 1, p_body);
  return fid;
end;
$$;

-- A new version of a guest form, by its key, while it's unclaimed and open: the new version number.
create or replace function public.guest_form_update(p_form uuid, p_token_hash text, p_name text, p_body jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  v int;
begin
  select fo.* into f from forms fo join workspaces w on w.id = fo.workspace_id
  where fo.id = p_form and w.guest_token_hash = p_token_hash and w.guest_until > now()
  for update of fo;
  if f.id is null then raise exception 'guest_form_not_found'; end if;
  v := f.version + 1;
  insert into form_versions (form_id, workspace_id, version, body) values (f.id, f.workspace_id, v, p_body);
  update forms set version = v, draft = p_body, draft_rev = draft_rev + 1, name = coalesce(nullif(left(btrim(p_name), 120), ''), name),
    published_at = now(), updated_at = now()
  where id = f.id;
  return v;
end;
$$;

-- A guest form's state for the public read and the claim page: open or closed, and its form.
create or replace function public.guest_state(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when w.guest_token_hash is null then null else jsonb_build_object('open', w.guest_until > now(), 'until', w.guest_until) end
  from workspaces w where w.id = p_ws;
$$;

/*
 * Claim by key: the person becomes the workspace's owner, and it stops being a guest one. An empty workspace this
 * person's first sign-in just made (unnamed, theirs alone, a day old at most, no forms, brands or meeting types) is
 * dropped, so they open on the claimed form. Answers { workspace_id, form_id }, or null for a wrong or used key.
 * A closed one can still be claimed: claiming opens it again.
 */
create or replace function public.guest_claim(p_token_hash text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  fid uuid;
  spare uuid;
begin
  if not exists (select 1 from auth.users where id = p_user) then raise exception 'no_user'; end if;
  select id into ws from workspaces where guest_token_hash = p_token_hash for update;
  if ws is null then return null; end if;
  select w.id into spare from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = p_user
  where not w.named and w.guest_token_hash is null and w.created_at > now() - interval '1 day'
    and (select count(*) from workspace_members x where x.workspace_id = w.id) = 1
    and (select count(*) from workspace_members x where x.user_id = p_user) = 1
    and not exists (select 1 from forms where workspace_id = w.id)
    and not exists (select 1 from brand_kits where workspace_id = w.id)
    and not exists (select 1 from meeting_types where workspace_id = w.id)
  limit 1;
  update workspaces set guest_token_hash = null, guest_until = null, guest_ip_hash = null where id = ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, p_user, 'owner') on conflict do nothing;
  if spare is not null then delete from workspaces where id = spare; end if;
  select id into fid from forms where workspace_id = ws order by created_at limit 1;
  return jsonb_build_object('workspace_id', ws, 'form_id', fid);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['guest_form_make(text, text, text, jsonb)', 'guest_form_update(uuid, text, text, jsonb)', 'guest_state(uuid)', 'guest_claim(text, uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
