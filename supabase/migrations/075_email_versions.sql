-- Versions of emails built with blocks (docs/design-system.md Part 7.2). Run after 074. Safe to run more than once.
--
-- Every change the AI makes to an email is saved as a version, and so is the email as it was before the AI's first
-- change, so any of them can be brought back from the builder's version menu. Hand edits save into the email itself.
-- `ref` names the email: "wf:<workflow id>:<step id>" or "tpl:<template id>". The last 50 per email are kept.

create table if not exists public.email_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  ref text not null check (length(ref) between 1 and 120),
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and length(doc::text) <= 400000),
  subject text not null default '' check (length(subject) <= 200),
  note text not null default '' check (length(note) <= 300),
  by_ai boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists email_versions_ref on public.email_versions (workspace_id, ref, created_at desc);
alter table public.email_versions enable row level security;
drop policy if exists "members read email versions" on public.email_versions;
create policy "members read email versions" on public.email_versions for select to authenticated using (is_member(workspace_id));

create or replace function public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  vid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'Workspace not found'; end if;
  insert into email_versions (workspace_id, ref, doc, subject, note, by_ai, created_by)
  values (p_ws, p_ref, p_doc, left(coalesce(p_subject, ''), 200), left(coalesce(p_note, ''), 300), p_ai, p_user) returning id into vid;
  delete from email_versions where id in (
    select id from email_versions where workspace_id = p_ws and ref = p_ref order by created_at desc offset 50);
  return vid;
end;
$$;

do $$
begin
  revoke execute on function public.email_version_add(uuid, uuid, text, jsonb, text, text, boolean) from public, anon, authenticated;
  grant execute on function public.email_version_add(uuid, uuid, text, jsonb, text, text, boolean) to service_role;
end;
$$;
