-- 160: versions and comments on the email canvas (docs/email-canvas-b5.md sections 4, 5 and 7).
--   emails.updated_by         who saved a draft last (for the Groups view's "who edited")
--   email_draft_save          records updated_by on every save
--   email_version_save        a member saves a version of an email's saved content (the row, never what a browser
--                             sends), skipped when the last version has the same content; 50 kept per email
--   email_comments            threads on an email or one of its parts; members read; the calls below write
--   email_comment_add         a new thread, or a reply in one
--   email_comment_resolve     resolve or reopen a thread
--   email_comment_delete      the author, or an owner or admin, deletes a comment (a thread's first comment takes
--                             its replies with it)

alter table public.emails add column if not exists updated_by uuid;

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
    where id = p_id and workspace_id = p_ws and kind = 'broadcast' and status = 'draft'
    returning id into eid;
    if eid is null then raise exception 'This email is not a draft anymore'; end if;
  end if;
  return eid;
end;
$$;

create or replace function public.email_version_save(p_ws uuid, p_email uuid, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  e record;
  last_doc jsonb;
  vid uuid;
  r text := 'em:' || p_email::text;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select doc, subject into e from emails where id = p_email and workspace_id = p_ws and kind = 'broadcast';
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

create table if not exists public.email_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email_id uuid not null references public.emails (id) on delete cascade,
  element_id text check (element_id is null or element_id ~ '^[a-z0-9]{1,24}$'),
  thread_id uuid,
  author uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index if not exists email_comments_email on public.email_comments (workspace_id, email_id, created_at);
create index if not exists email_comments_thread on public.email_comments (thread_id);
alter table public.email_comments enable row level security;
drop policy if exists "members read email comments" on public.email_comments;
create policy "members read email comments" on public.email_comments for select to authenticated using (is_member(workspace_id));

create or replace function public.email_comment_add(p_ws uuid, p_email uuid, p_element text, p_thread uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cid uuid;
  el text := nullif(p_element, '');
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if not exists (select 1 from emails where id = p_email and workspace_id = p_ws) then raise exception 'Email not found'; end if;
  if length(btrim(coalesce(p_body, ''))) not between 1 and 2000 then raise exception 'Write a comment of up to 2,000 characters'; end if;
  if p_thread is not null then
    select element_id into el from email_comments where id = p_thread and workspace_id = p_ws and email_id = p_email and thread_id = id;
    if not found then raise exception 'Thread not found'; end if;
  end if;
  insert into email_comments (workspace_id, email_id, element_id, thread_id, author, body)
  values (p_ws, p_email, el, p_thread, auth.uid(), btrim(p_body))
  returning id into cid;
  if p_thread is null then update email_comments set thread_id = cid where id = cid; end if;
  return cid;
end;
$$;

create or replace function public.email_comment_resolve(p_ws uuid, p_thread uuid, p_resolved boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  update email_comments set resolved_at = case when p_resolved then now() else null end, resolved_by = case when p_resolved then auth.uid() else null end
  where workspace_id = p_ws and thread_id = p_thread;
  return found;
end;
$$;

create or replace function public.email_comment_delete(p_ws uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  c record;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select id, author, thread_id into c from email_comments where id = p_id and workspace_id = p_ws;
  if not found then return false; end if;
  if c.author is distinct from auth.uid() and not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = auth.uid() and role in ('owner', 'admin')) then
    raise exception 'Only the author, or an owner or admin, can delete a comment';
  end if;
  if c.thread_id = c.id then delete from email_comments where workspace_id = p_ws and thread_id = c.id;
  else delete from email_comments where id = c.id; end if;
  return true;
end;
$$;

revoke execute on function public.email_version_save(uuid, uuid, text) from public, anon;
revoke execute on function public.email_comment_add(uuid, uuid, text, uuid, text) from public, anon;
revoke execute on function public.email_comment_resolve(uuid, uuid, boolean) from public, anon;
revoke execute on function public.email_comment_delete(uuid, uuid) from public, anon;
grant execute on function public.email_version_save(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.email_comment_add(uuid, uuid, text, uuid, text) to authenticated, service_role;
grant execute on function public.email_comment_resolve(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.email_comment_delete(uuid, uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
