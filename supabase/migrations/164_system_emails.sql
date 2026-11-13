-- System emails (docs/system-emails.md): the emails Claritia sends for every meeting (confirmed, moved, canceled,
-- reminder, no-show, pick a time, and the host's notes) as designs each workspace can change on the Emails canvas.
-- Each is an `emails` row of kind 'system' with its key; the canvas saves it like any draft (email_draft_save). The
-- meeting worker reads them (meeting_system_emails) and sends the design; a workspace without them, or an email whose
-- design can't be built, gets the built-in email as before. paused_at set means the team turned it off.

alter table public.emails drop constraint if exists emails_kind_check;
alter table public.emails add constraint emails_kind_check check (kind in ('broadcast', 'journey', 'one_to_one', 'test', 'system'));
alter table public.emails add column if not exists system_key text check (system_key is null or system_key ~ '^[a-z_]{1,30}$');
do $$ begin
  alter table public.emails add constraint emails_system_key check ((system_key is not null) = (kind = 'system') and (kind <> 'system' or status = 'draft'));
exception when duplicate_object then null; end $$;
create unique index if not exists emails_system_key on public.emails (workspace_id, system_key) where system_key is not null;

-- Drafts saved from the canvas: campaign drafts, automation emails and System emails (by id; never made here).
create or replace function public.email_draft_save(p_ws uuid, p_id uuid, p_name text, p_subject text, p_preheader text, p_doc jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
  n text := left(coalesce(nullif(btrim(p_name), ''), 'Untitled email'), 200);
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if p_doc is not null and jsonb_typeof(p_doc) <> 'object' then raise exception 'The email is not valid'; end if;
  if p_id is null then
    if (select count(*) from emails where workspace_id = p_ws and kind = 'broadcast' and status = 'draft') >= 500 then raise exception 'Up to 500 drafts'; end if;
    insert into emails (workspace_id, name, kind, subject, preheader, html, text, doc, status, created_by, updated_by)
    values (p_ws, n, 'broadcast', left(coalesce(btrim(p_subject), ''), 300), left(coalesce(p_preheader, ''), 300), '', '', p_doc, 'draft', auth.uid(), auth.uid())
    returning id into eid;
  else
    update emails set name = n, subject = left(coalesce(btrim(p_subject), ''), 300), preheader = left(coalesce(p_preheader, ''), 300), doc = p_doc, updated_at = now(), updated_by = auth.uid()
    where id = p_id and workspace_id = p_ws and status = 'draft' and (kind in ('broadcast', 'system') or (kind = 'journey' and workflow_id is not null))
    returning id into eid;
    if eid is null then raise exception 'This email is not a draft anymore'; end if;
  end if;
  return eid;
end;
$$;

-- Versions on the canvas work for System emails too.
create or replace function public.email_version_save(p_ws uuid, p_email uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e record;
  last_doc jsonb;
  vid uuid;
  r text := 'em:' || p_email::text;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select doc, subject into e from emails where id = p_email and workspace_id = p_ws and (kind in ('broadcast', 'system') or (kind = 'journey' and workflow_id is not null));
  if not found or e.doc is null then raise exception 'Email not found'; end if;
  select doc into last_doc from email_versions where workspace_id = p_ws and ref = r order by created_at desc limit 1;
  if last_doc is not null and last_doc = e.doc then return null; end if;
  insert into email_versions (workspace_id, ref, doc, subject, note, by_ai, created_by)
  values (p_ws, r, e.doc, left(coalesce(e.subject, ''), 200), left(coalesce(nullif(btrim(p_note), ''), 'Edited'), 300), false, auth.uid())
  returning id into vid;
  delete from email_versions where id in (select id from email_versions where workspace_id = p_ws and ref = r order by created_at desc offset 50);
  return vid;
end;
$$;

/*
 * The workspace's System emails, made from p_rows ([{ key, name, subject, preheader, doc }], in order) for any key
 * without one. Ones that exist are never overwritten (the team may have changed them); their place follows p_rows.
 * Answers every System email in order, with `off` and `made` (made now).
 */
create or replace function public.system_email_ensure(p_ws uuid, p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s jsonb;
  i int := 0;
  made text[] := '{}';
  fresh boolean;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 30 then raise exception 'Bad emails'; end if;
  for s in select * from jsonb_array_elements(p_rows) loop
    if coalesce(s->>'key', '') !~ '^[a-z_]{1,30}$' then raise exception 'Bad key'; end if;
    if jsonb_typeof(s->'doc') is distinct from 'object' then raise exception 'Bad email'; end if;
    insert into emails (workspace_id, name, kind, subject, preheader, html, text, doc, status, system_key, group_position, created_by, updated_by)
    values (p_ws, left(coalesce(nullif(btrim(s->>'name'), ''), s->>'key'), 200), 'system', left(coalesce(btrim(s->>'subject'), ''), 300),
            left(coalesce(s->>'preheader', ''), 300), '', '', s->'doc', 'draft', s->>'key', i, auth.uid(), null)
    on conflict (workspace_id, system_key) where system_key is not null do update set group_position = excluded.group_position
    returning (xmax = 0) into fresh;
    if fresh then made := made || (s->>'key'); end if;
    i := i + 1;
  end loop;
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'key', e.system_key, 'subject', e.subject, 'preheader', e.preheader, 'doc', e.doc, 'off', e.paused_at is not null,
      'updated_at', e.updated_at, 'made', e.system_key = any(made)) order by e.group_position)
    from emails e where e.workspace_id = p_ws and e.kind = 'system'), '[]');
end;
$$;

-- Turns one System email on or off. The worker never turns off the ones that carry the calendar invite.
create or replace function public.system_email_turn(p_ws uuid, p_id uuid, p_on boolean) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  eid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  update emails set paused_at = case when p_on then null else coalesce(paused_at, now()) end, updated_at = now(), updated_by = auth.uid()
  where id = p_id and workspace_id = p_ws and kind = 'system'
  returning id into eid;
  if eid is null then raise exception 'Email not found'; end if;
  return p_on;
end;
$$;

-- For the meeting worker: the workspace's System emails and its brand kits (their published styles), or null.
create or replace function public.meeting_system_emails(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when not exists (select 1 from emails where workspace_id = p_ws and kind = 'system') then null else jsonb_build_object(
    'emails', (select jsonb_agg(jsonb_build_object('key', e.system_key, 'subject', e.subject, 'preheader', e.preheader, 'doc', e.doc, 'off', e.paused_at is not null))
               from emails e where e.workspace_id = p_ws and e.kind = 'system'),
    'kits', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'tokens', k.tokens, 'logo_url', k.logo_url, 'design_live', k.design_live) order by k.created_at)
               from brand_kits k where k.workspace_id = p_ws), '[]'::jsonb)) end;
$$;

revoke execute on function public.system_email_ensure(uuid, jsonb) from public, anon;
grant execute on function public.system_email_ensure(uuid, jsonb) to authenticated, service_role;
revoke execute on function public.system_email_turn(uuid, uuid, boolean) from public, anon;
grant execute on function public.system_email_turn(uuid, uuid, boolean) to authenticated, service_role;
revoke execute on function public.meeting_system_emails(uuid) from public, anon, authenticated;
grant execute on function public.meeting_system_emails(uuid) to service_role;

notify pgrst, 'reload schema';
