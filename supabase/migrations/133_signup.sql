-- Signup (docs/signup.md): an invite now sends an email, someone in more than one workspace picks which one opens
-- (a workspace they just joined opens first), and a new workspace asks for its name once.

-- A workspace made on first sign-in is named after the email until its owner names it.
alter table public.workspaces add column if not exists named boolean not null default true;

create or replace function public.workspaces_named() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.name is distinct from old.name then new.named := true; end if;
  return new;
end;
$$;
drop trigger if exists workspaces_named on public.workspaces;
create trigger workspaces_named before update of name on public.workspaces for each row execute function public.workspaces_named();

-- As before (044), with a new workspace marked unnamed.
create or replace function public.ensure_workspace() returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  v_email text;
  inv record;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select u.email into v_email from auth.users u where u.id = auth.uid();
  for inv in select * from invites i where lower(i.email) = lower(v_email) and i.accepted_at is null and i.expires_at > now() order by i.created_at loop
    insert into workspace_members (workspace_id, user_id, role) values (inv.workspace_id, auth.uid(), 'member') on conflict do nothing;
    update invites set accepted_at = now() where id = inv.id;
  end loop;
  select workspace_id into ws from workspace_members where user_id = auth.uid() order by created_at limit 1;
  if ws is not null then
    return ws;
  end if;
  insert into workspaces (name, named)
  values (coalesce(nullif(split_part(coalesce(v_email, ''), '@', 1), ''), 'My') || '''s workspace', false)
  returning id into ws;
  insert into workspace_members (workspace_id, user_id, role) values (ws, auth.uid(), 'owner');
  return ws;
end;
$$;

-- The workspace to open and the ones to switch to. One joined from an invite in this very call opens first; then the
-- one picked on this computer (p_ws), if still a member; then the first.
drop function if exists public.app_start();
create or replace function public.app_start(p_ws uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_first uuid := ensure_workspace();
  v_joined uuid;
  v_ws uuid;
  out jsonb;
begin
  select i.workspace_id into v_joined
  from invites i join auth.users u on lower(u.email) = lower(i.email)
  where u.id = auth.uid() and i.accepted_at = now()
  order by i.accepted_at desc limit 1;
  v_ws := case
    when v_joined is not null then v_joined
    when p_ws is not null and exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = auth.uid()) then p_ws
    else v_first end;
  select jsonb_build_object(
      'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'named', w.named, 'features', to_jsonb(coalesce(w.features, '{}'::text[]))),
      'role', m.role,
      'workspaces', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'role', xm.role) order by lower(x.name), x.id), '[]')
                     from workspace_members xm join workspaces x on x.id = xm.workspace_id where xm.user_id = auth.uid()))
    into out
  from workspaces w join workspace_members m on m.workspace_id = w.id and m.user_id = auth.uid()
  where w.id = v_ws;
  if out is null then raise exception 'Workspace not found'; end if;
  return out;
end;
$$;

-- The owner names the workspace (the first-sign-in step and Settings › Workspace).
create or replace function public.workspace_name_set(p_ws uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  n text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can rename it'; end if;
  if length(n) < 1 or length(n) > 80 then raise exception 'Use 1 to 80 characters'; end if;
  update workspaces set name = n, named = true where id = p_ws;
end;
$$;

-- As before (044), and the invite email goes out through the jobs queue. Inviting the same person again sends again.
create or replace function public.invite_member(p_ws uuid, p_email text) returns void
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
  inv invites;
begin
  if not is_owner(p_ws) then
    raise exception 'Only the workspace owner can invite people';
  end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email doesn''t look right';
  end if;
  if exists (select 1 from workspace_members m join auth.users u on u.id = m.user_id where m.workspace_id = p_ws and lower(u.email) = e) then
    raise exception '% is already on the team', e;
  end if;
  insert into invites (workspace_id, email, invited_by) values (p_ws, e, auth.uid())
  on conflict (workspace_id, email) do update set invited_by = excluded.invited_by, created_at = now(), expires_at = now() + interval '30 days', accepted_at = null
  returning * into inv;
  insert into audit_log (workspace_id, actor, action, target) values (p_ws, auth.uid(), 'team.invite', e);
  perform enqueue_job(p_ws, 'invite_email', inv.id::text || ':' || (extract(epoch from inv.created_at) * 1000000)::bigint::text,
                      jsonb_build_object('invite', inv.id, 'sent_for', inv.created_at), 0, 5);
end;
$$;

-- What the invite email says. Null when the invite was canceled, used, expired or sent again since (sent_for).
create or replace function public.invite_info(p_id uuid, p_sent_for timestamptz) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', i.email,
    'workspace', w.name,
    'inviter', coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), ''), u.email),
    'inviter_email', lower(u.email))
  from invites i
  join workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.id = p_id and i.accepted_at is null and i.expires_at > now()
    and (p_sent_for is null or i.created_at = p_sent_for);
$$;

revoke execute on function public.app_start(uuid) from public, anon;
grant execute on function public.app_start(uuid) to authenticated;
revoke execute on function public.workspace_name_set(uuid, text) from public, anon;
grant execute on function public.workspace_name_set(uuid, text) to authenticated;
revoke execute on function public.invite_member(uuid, text) from public, anon;
grant execute on function public.invite_member(uuid, text) to authenticated;
revoke execute on function public.invite_info(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.invite_info(uuid, timestamptz) to service_role;

notify pgrst, 'reload schema';
