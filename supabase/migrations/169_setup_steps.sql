-- The guided setup after sign-up (src/components/app/Welcome.tsx, docs/signup.md): each finished or skipped step is a
-- row in audit_log ('setup.team', 'setup.calendar', 'setup.form', 'setup.invite', 'setup.done' and the same with
-- '.skip'), so the sign-up funnel can be counted, and finishing queues one welcome email (welcome_email on
-- claritia-intel). Safe to run twice.

create or replace function public.setup_step(p_ws uuid, p_step text, p_data jsonb default '{}') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(p_ws) then raise exception 'Only the workspace owner can set it up'; end if;
  if p_step is null or p_step !~ '^(team|calendar|form|invite|done)(\.skip)?$' then raise exception 'Unknown setup step'; end if;
  -- Once each: a step done again (another tab, a retry) isn't counted twice.
  if exists (select 1 from audit_log a where a.workspace_id = p_ws and a.action = 'setup.' || p_step) then return; end if;
  insert into audit_log (workspace_id, actor, action, data)
  values (p_ws, auth.uid(), 'setup.' || p_step, coalesce(p_data, '{}') - 'user');
  if p_step = 'done' then
    perform enqueue_job(p_ws, 'welcome_email', p_ws::text,
                        jsonb_build_object('user', auth.uid(), 'form', nullif(p_data->>'form', '')), 0, 5);
  end if;
end;
$$;

-- What the welcome email says. Null when the person is no longer on the workspace.
create or replace function public.welcome_info(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'email', lower(u.email),
    'name', coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'), ''), nullif(btrim(u.raw_user_meta_data->>'name'), '')),
    'workspace', w.name)
  from workspace_members m
  join workspaces w on w.id = m.workspace_id
  join auth.users u on u.id = m.user_id
  where m.workspace_id = p_ws and m.user_id = p_user;
$$;

revoke execute on function public.setup_step(uuid, text, jsonb) from public, anon;
grant execute on function public.setup_step(uuid, text, jsonb) to authenticated;
revoke execute on function public.welcome_info(uuid, uuid) from public, anon, authenticated;
grant execute on function public.welcome_info(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
