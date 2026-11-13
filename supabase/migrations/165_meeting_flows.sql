-- The meeting workflows (docs/workflows-plan.md, Part A; src/lib/workflows/meetingFlows.ts): the emails Claritia sends
-- for every meeting, shown and edited as workflows. Each is a live workflow with a meeting_kind, whose Meeting email
-- steps name a System email (164). The meeting worker still sends them; it reads here which are on (a paused workflow,
-- or one without that step, sends nothing) and when reminders go (the Reminders workflow's Delay steps). Booking
-- confirmed, Meeting moved and Meeting canceled carry the calendar invite, so they can't be paused or deleted.

alter table public.workflows add column if not exists meeting_kind text
  check (meeting_kind is null or meeting_kind in ('confirmed', 'reminders', 'moved', 'canceled', 'after', 'no_show', 'pick_time'));
create unique index if not exists workflows_meeting_kind on public.workflows (workspace_id, meeting_kind) where meeting_kind is not null;

/*
 * The workspace's meeting workflows, made live from p_items ([{ kind, name, body }]) for any kind it doesn't have,
 * in a "Meetings" folder at the top. The first time any are made, the older starting workflows they replace
 * (p_retire, by name) go where they were never published, so nobody gets two emails. Existing ones are never changed.
 * Answers every meeting workflow: [{ id, kind, name, status }].
 */
create or replace function public.meeting_flows_ensure(p_ws uuid, p_items jsonb, p_retire text[] default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  fid uuid;
  wid uuid;
  made int := 0;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then raise exception 'Bad meeting workflows'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(it->>'kind', '') not in ('confirmed', 'reminders', 'moved', 'canceled', 'after', 'no_show', 'pick_time') then raise exception 'Bad meeting workflow'; end if;
    if exists (select 1 from workflows where workspace_id = p_ws and meeting_kind = it->>'kind') then continue; end if;
    if jsonb_typeof(it->'body') <> 'object' or coalesce(btrim(it->>'name'), '') = '' then raise exception 'Bad meeting workflow'; end if;
    if (select count(*) from workflows where workspace_id = p_ws) >= 100 then exit; end if;
    if fid is null then
      select id into fid from workflow_folders where workspace_id = p_ws and name = 'Meetings' order by position limit 1;
      if fid is null then
        update workflow_folders set position = position + 1 where workspace_id = p_ws;
        insert into workflow_folders (workspace_id, name, position) values (p_ws, 'Meetings', 0) returning id into fid;
      end if;
    end if;
    insert into workflows (workspace_id, name, draft, folder_id, status, live_version, trigger_kind, live_at, meeting_kind, created_by)
    values (p_ws, left(btrim(it->>'name'), 120), it->'body', fid, 'live', 1, it->'body'->'trigger'->>'kind', now(), it->>'kind', auth.uid())
    returning id into wid;
    insert into workflow_versions (workflow_id, workspace_id, version, body, note, published_by) values (wid, p_ws, 1, it->'body', 'Starting version', auth.uid());
    made := made + 1;
  end loop;
  if made > 0 and coalesce(array_length(p_retire, 1), 0) > 0 then
    delete from workflows where workspace_id = p_ws and meeting_kind is null and live_version is null and name = any(p_retire);
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'kind', w.meeting_kind, 'name', w.name, 'status', w.status)
      order by array_position(array['confirmed', 'reminders', 'moved', 'canceled', 'after', 'no_show', 'pick_time'], w.meeting_kind))
    from workflows w where w.workspace_id = p_ws and w.meeting_kind is not null), '[]');
end;
$$;

-- The workflows that carry the calendar invite stay live and stay.
create or replace function public.workflow_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  if p_status not in ('live', 'paused') then raise exception 'Pick live or paused'; end if;
  if p_status = 'live' and w.live_version is null then raise exception 'Make it live first'; end if;
  if p_status = 'paused' and w.meeting_kind in ('confirmed', 'moved', 'canceled') then raise exception 'This workflow sends the calendar invite, so it stays on'; end if;
  update workflows set status = p_status, updated_at = now() where id = p_id;
  insert into audit_log (workspace_id, actor, action, target) values (w.workspace_id, auth.uid(), 'workflow.' || p_status, p_id::text);
end;
$$;

create or replace function public.workflow_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  if w.meeting_kind in ('confirmed', 'moved', 'canceled') then raise exception 'This workflow sends the calendar invite, so it stays'; end if;
  delete from workflows where id = p_id;
  insert into audit_log (workspace_id, actor, action, target, data) values (w.workspace_id, auth.uid(), 'workflow.delete', p_id::text, jsonb_build_object('name', w.name));
end;
$$;

-- A workflow's own "Before the meeting" reminders stop the meeting's built-in ones (101); the meeting workflows are
-- the built-in ones, so they don't count here.
create or replace function public.workflow_reminders_live(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from workflows w
    join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
    where w.workspace_id = p_ws and w.status = 'live' and w.meeting_kind is null and v.body->'trigger'->>'kind' = 'meeting'
      and jsonb_path_exists(v.body->'steps', '$.** ? (@.kind == "wait" && @.before == "meeting")'));
$$;

-- For the meeting worker: the System emails, the brand kits and the meeting workflows (their status and live body).
-- Null when the workspace has none of either.
create or replace function public.meeting_system_emails(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from emails where workspace_id = p_ws and kind = 'system')
              and not exists (select 1 from workflows where workspace_id = p_ws and meeting_kind is not null) then null else jsonb_build_object(
    'emails', coalesce((select jsonb_agg(jsonb_build_object('key', e.system_key, 'subject', e.subject, 'preheader', e.preheader, 'doc', e.doc, 'off', e.paused_at is not null))
               from emails e where e.workspace_id = p_ws and e.kind = 'system'), '[]'::jsonb),
    'kits', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'tokens', k.tokens, 'logo_url', k.logo_url, 'design_live', k.design_live) order by k.created_at)
               from brand_kits k where k.workspace_id = p_ws), '[]'::jsonb),
    'flows', coalesce((select jsonb_agg(jsonb_build_object('kind', w.meeting_kind, 'status', w.status, 'body', v.body))
               from workflows w left join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
               where w.workspace_id = p_ws and w.meeting_kind is not null), '[]'::jsonb)) end;
$$;

revoke execute on function public.meeting_flows_ensure(uuid, jsonb, text[]) from public, anon;
grant execute on function public.meeting_flows_ensure(uuid, jsonb, text[]) to authenticated, service_role;
revoke execute on function public.meeting_system_emails(uuid) from public, anon, authenticated;
grant execute on function public.meeting_system_emails(uuid) to service_role;

notify pgrst, 'reload schema';
