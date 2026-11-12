-- Campaign drafts (docs/email-studio-plan.md Part 3): a one-off email written in the Email Studio, with Tia, before
-- it's sent. The email keeps its block document (`doc`, src/lib/design/email/doc.ts) while it's a draft; the HTML and
-- text are made from it when it's sent (Part 5). A draft may have no subject yet; anything past draft needs one.
--   email_draft_save     make a draft (no id) or save one, by a member of the workspace; only drafts change
--   email_draft_delete   delete a draft that never sent anything

alter table public.emails add column if not exists doc jsonb check (doc is null or (jsonb_typeof(doc) = 'object' and length(doc::text) <= 400000));
alter table public.emails drop constraint if exists emails_subject_check;
alter table public.emails add constraint emails_subject_check check (length(subject) <= 300 and (status = 'draft' or length(subject) >= 1));

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
    insert into emails (workspace_id, name, kind, subject, preheader, html, text, doc, status, created_by)
    values (p_ws, n, 'broadcast', left(coalesce(btrim(p_subject), ''), 300), left(coalesce(p_preheader, ''), 300), '', '', p_doc, 'draft', auth.uid())
    returning id into eid;
  else
    update emails set name = n, subject = left(coalesce(btrim(p_subject), ''), 300), preheader = left(coalesce(p_preheader, ''), 300), doc = p_doc, updated_at = now()
    where id = p_id and workspace_id = p_ws and kind = 'broadcast' and status = 'draft'
    returning id into eid;
    if eid is null then raise exception 'This email is not a draft anymore'; end if;
  end if;
  return eid;
end;
$$;

create or replace function public.email_draft_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  delete from emails e where e.id = p_id and e.workspace_id = p_ws and e.kind = 'broadcast' and e.status = 'draft'
    and not exists (select 1 from email_messages m where m.email_id = e.id);
  return found;
end;
$$;

revoke execute on function public.email_draft_save(uuid, uuid, text, text, text, jsonb) from public, anon;
revoke execute on function public.email_draft_delete(uuid, uuid) from public, anon;
grant execute on function public.email_draft_save(uuid, uuid, text, text, text, jsonb) to authenticated, service_role;
grant execute on function public.email_draft_delete(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
