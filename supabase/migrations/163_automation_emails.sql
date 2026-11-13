-- One home for every email (docs/email-unify-plan.md, E3): each email step of an automation has an editing copy in
-- `emails` (kind 'journey', with its workflow and step), so it opens on the Emails canvas like any campaign. Publishing
-- still makes the version's own copies (workflow_publish, 069), so what's sent never changes under a running version.
-- The editing copies are drafts: they're never sent from here.

alter table public.emails add column if not exists workflow_id uuid references public.workflows (id) on delete cascade;
alter table public.emails add column if not exists step_id text check (step_id is null or step_id ~ '^[A-Za-z0-9_-]{1,40}$');
do $$ begin
  alter table public.emails add constraint emails_workflow_step check ((workflow_id is null) = (step_id is null) and (workflow_id is null or (kind = 'journey' and status = 'draft')));
exception when duplicate_object then null; end $$;
create unique index if not exists emails_workflow_step on public.emails (workflow_id, step_id) where workflow_id is not null;

-- Drafts saved from the canvas: a campaign draft as before, or an automation's email (by id; never made here).
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
    where id = p_id and workspace_id = p_ws and status = 'draft' and (kind = 'broadcast' or (kind = 'journey' and workflow_id is not null))
    returning id into eid;
    if eid is null then raise exception 'This email is not a draft anymore'; end if;
  end if;
  return eid;
end;
$$;

-- Versions on the canvas work for automation emails too.
create or replace function public.email_version_save(p_ws uuid, p_email uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e record;
  last_doc jsonb;
  vid uuid;
  r text := 'em:' || p_email::text;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select doc, subject into e from emails where id = p_email and workspace_id = p_ws and (kind = 'broadcast' or (kind = 'journey' and workflow_id is not null));
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
 * The editing copies of one automation's emails, made to match its email steps: p_steps is the steps in order,
 * [{ step, subject, preheader, doc }]. A step without a copy gets one from what the step holds; a copy whose step is
 * gone goes; each copy's place follows its step. Copies that exist are never overwritten (the canvas may have newer
 * words). Answers every copy with `made` true for the ones made now.
 */
create or replace function public.workflow_email_ensure(p_ws uuid, p_wf uuid, p_steps jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
  s jsonb;
  i int := 0;
  made text[] := '{}';
  keep text[] := '{}';
  fresh boolean;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into w from workflows where id = p_wf and workspace_id = p_ws;
  if w.id is null then raise exception 'Automation not found'; end if;
  if jsonb_typeof(p_steps) <> 'array' or jsonb_array_length(p_steps) > 100 then raise exception 'Bad steps'; end if;
  for s in select * from jsonb_array_elements(p_steps) loop
    if coalesce(s->>'step', '') !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'Bad step'; end if;
    if jsonb_typeof(s->'doc') is distinct from 'object' then raise exception 'Bad email'; end if;
    keep := keep || (s->>'step');
    insert into emails (workspace_id, name, kind, subject, preheader, html, text, doc, status, workflow_id, step_id, group_position, created_by, updated_by)
    values (p_ws, left(coalesce(nullif(btrim(s->>'subject'), ''), 'Email ' || (i + 1)), 200), 'journey', left(coalesce(btrim(s->>'subject'), ''), 300),
            left(coalesce(s->>'preheader', ''), 300), '', '', s->'doc', 'draft', p_wf, s->>'step', i, auth.uid(), auth.uid())
    on conflict (workflow_id, step_id) where workflow_id is not null do update set group_position = excluded.group_position
    returning (xmax = 0) into fresh;
    if fresh then made := made || (s->>'step'); end if;
    i := i + 1;
  end loop;
  delete from emails where workflow_id = p_wf and workspace_id = p_ws and not (step_id = any(keep));
  return coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'step', e.step_id, 'subject', e.subject, 'preheader', e.preheader, 'doc', e.doc, 'updated_at', e.updated_at, 'made', e.step_id = any(made)) order by e.group_position)
    from emails e where e.workflow_id = p_wf and e.workspace_id = p_ws), '[]');
end;
$$;

revoke execute on function public.workflow_email_ensure(uuid, uuid, jsonb) from public, anon;
grant execute on function public.workflow_email_ensure(uuid, uuid, jsonb) to authenticated, service_role;
