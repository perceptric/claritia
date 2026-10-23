-- The CRM, closer to Omniscient (docs/crm.md, Part "Fields and notes"): a rating field type; option colors and a
-- description on custom fields (in options[].color and config.description, so no new columns); and notes and tasks
-- on every record: contacts, companies, opportunities and custom objects.
--   notes: what someone wrote about a record, newest first, editable by its author and by owners.
--   tasks: a to-do on a record, with a due date and a teammate, done or not.

alter table public.fields drop constraint if exists fields_type_check;
alter table public.fields add constraint fields_type_check check (type in ('text', 'long_text', 'number', 'currency', 'percent', 'date', 'datetime',
  'select', 'multi_select', 'checkbox', 'url', 'email', 'phone', 'user', 'relation', 'rating'));

-- A custom field's value checked against its type: 034's, plus rating (a whole number from 1 to 5).
create or replace function public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t text := jsonb_typeof(p_value);
  s text;
  allowed text[];
begin
  if p_value is null or t = 'null' or p_value = '""'::jsonb or p_value = '[]'::jsonb then
    return null;
  end if;
  s := case when t = 'string' then trim(p_value #>> '{}') else p_value #>> '{}' end;
  allowed := array(select coalesce(o->>'value', o #>> '{}') from jsonb_array_elements(coalesce(p_options, '[]')) o);
  case p_type
    when 'number', 'currency', 'percent' then
      if try_numeric(s) is null then raise exception '%: enter a number', p_label; end if;
      return to_jsonb(try_numeric(s));
    when 'date' then
      if s !~ '^\d{4}-\d{2}-\d{2}$' or try_timestamptz(s) is null then raise exception '%: enter a date like 2026-03-31', p_label; end if;
      return to_jsonb(s);
    when 'datetime' then
      if try_timestamptz(s) is null then raise exception '%: enter a date and time', p_label; end if;
      return to_jsonb(try_timestamptz(s));
    when 'checkbox' then
      if lower(s) in ('true', 'yes', '1') then return 'true'::jsonb; end if;
      if lower(s) in ('false', 'no', '0') then return 'false'::jsonb; end if;
      raise exception '%: yes or no', p_label;
    when 'select' then
      if not s = any(allowed) then raise exception '%: pick one of its values', p_label; end if;
      return to_jsonb(s);
    when 'multi_select' then
      if t <> 'array' or exists (select 1 from jsonb_array_elements_text(p_value) x where not x = any(allowed)) then
        raise exception '%: pick from its values', p_label;
      end if;
      return (select coalesce(jsonb_agg(distinct x), '[]') from jsonb_array_elements_text(p_value) x);
    when 'url' then
      if s !~* '^https?://[^\s]+$' or length(s) > 2000 then raise exception '%: enter a web address starting with https://', p_label; end if;
      return to_jsonb(s);
    when 'email' then
      if s !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(s) > 320 then raise exception '%: enter an email', p_label; end if;
      return to_jsonb(lower(s));
    when 'phone' then
      if length(s) > 50 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
    when 'user' then
      if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id::text = s) then raise exception '%: pick a teammate', p_label; end if;
      return to_jsonb(s);
    when 'rating' then
      if s !~ '^[1-5]$' then raise exception '%: pick 1 to 5', p_label; end if;
      return to_jsonb(s::int);
    when 'long_text' then
      if length(s) > 20000 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
    when 'relation' then
      raise exception '%: links are set with record_link', p_label;
    else
      if length(s) > 500 then raise exception '%: too long', p_label; end if;
      return to_jsonb(s);
  end case;
end;
$$;

-- Notes ---------------------------------------------------------------------------------------------------------

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  object text not null check (object ~ '^[a-z][a-z0-9_]{0,39}$'),
  record_id uuid not null,
  body text not null check (length(body) between 1 and 20000),
  author uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notes_record on public.notes (workspace_id, object, record_id, created_at desc);
alter table public.notes enable row level security;
create policy "members read" on public.notes for select using (is_member(workspace_id));
revoke all on public.notes from anon;
revoke insert, update, delete on public.notes from authenticated;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  object text not null check (object ~ '^[a-z][a-z0-9_]{0,39}$'),
  record_id uuid not null,
  title text not null check (length(title) between 1 and 300),
  due date,
  assignee uuid,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_record on public.tasks (workspace_id, object, record_id, done, due);
create index if not exists tasks_mine on public.tasks (workspace_id, assignee, done, due);
alter table public.tasks enable row level security;
create policy "members read" on public.tasks for select using (is_member(workspace_id));
revoke all on public.tasks from anon;
revoke insert, update, delete on public.tasks from authenticated;

-- Whether a record exists in the workspace, for any object.
create or replace function public.record_exists(p_ws uuid, p_object text, p_record uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case p_object
    when 'contact' then exists (select 1 from contacts where id = p_record and workspace_id = p_ws)
    when 'company' then exists (select 1 from companies where id = p_record and workspace_id = p_ws)
    else exists (select 1 from records r join objects o on o.id = r.object_id where r.id = p_record and r.workspace_id = p_ws and o.key = p_object)
  end;
$$;

-- Add a note (p_id null) or change one. Authors change their own notes; owners change any.
create or replace function public.note_save(p_ws uuid, p_object text, p_record uuid, p_id uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  nid uuid;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Write something first';
  end if;
  if p_id is null then
    if not record_exists(p_ws, p_object, p_record) then
      raise exception 'Record not found';
    end if;
    insert into notes (workspace_id, object, record_id, body, author) values (p_ws, p_object, p_record, left(trim(p_body), 20000), auth.uid()) returning id into nid;
  else
    update notes set body = left(trim(p_body), 20000), updated_at = now()
    where id = p_id and workspace_id = p_ws and (author = auth.uid() or is_owner(p_ws)) returning id into nid;
    if nid is null then
      raise exception 'Note not found';
    end if;
  end if;
  return nid;
end;
$$;

create or replace function public.note_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  n notes%rowtype;
begin
  select * into n from notes where id = p_id;
  if n.id is null or not is_member(n.workspace_id) or not (n.author = auth.uid() or is_owner(n.workspace_id)) then
    raise exception 'Note not found';
  end if;
  delete from notes where id = p_id;
end;
$$;

-- Add a task (p_id null) or change one. Anyone in the workspace can tick a task off or change it.
create or replace function public.task_save(p_ws uuid, p_object text, p_record uuid, p_id uuid, p_title text, p_due date, p_assignee uuid, p_done boolean)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Name the task';
  end if;
  if p_assignee is not null and not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_assignee) then
    raise exception 'Pick a teammate';
  end if;
  if p_id is null then
    if not record_exists(p_ws, p_object, p_record) then
      raise exception 'Record not found';
    end if;
    insert into tasks (workspace_id, object, record_id, title, due, assignee, done, done_at, created_by)
    values (p_ws, p_object, p_record, left(trim(p_title), 300), p_due, p_assignee, coalesce(p_done, false), case when p_done then now() end, auth.uid())
    returning id into tid;
  else
    update tasks set title = left(trim(p_title), 300), due = p_due, assignee = p_assignee, done = coalesce(p_done, done),
      done_at = case when coalesce(p_done, done) and not done then now() when not coalesce(p_done, done) then null else done_at end, updated_at = now()
    where id = p_id and workspace_id = p_ws returning id into tid;
    if tid is null then
      raise exception 'Task not found';
    end if;
  end if;
  return tid;
end;
$$;

create or replace function public.task_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  t tasks%rowtype;
begin
  select * into t from tasks where id = p_id;
  if t.id is null or not is_member(t.workspace_id) then
    raise exception 'Task not found';
  end if;
  delete from tasks where id = p_id;
end;
$$;

revoke execute on function public.record_exists(uuid, text, uuid) from public, anon, authenticated;
do $$
declare
  f text;
begin
  foreach f in array array['note_save(uuid, text, uuid, uuid, text)', 'note_delete(uuid)', 'task_save(uuid, text, uuid, uuid, text, date, uuid, boolean)', 'task_delete(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- A deleted record takes its notes and tasks with it.
create or replace function public.record_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from notes where workspace_id = old.workspace_id and record_id = old.id;
  delete from tasks where workspace_id = old.workspace_id and record_id = old.id;
  return old;
end;
$$;
revoke execute on function public.record_cleanup() from public, anon, authenticated;
drop trigger if exists contacts_cleanup on public.contacts;
create trigger contacts_cleanup after delete on public.contacts for each row execute function public.record_cleanup();
drop trigger if exists companies_cleanup on public.companies;
create trigger companies_cleanup after delete on public.companies for each row execute function public.record_cleanup();
drop trigger if exists records_cleanup on public.records;
create trigger records_cleanup after delete on public.records for each row execute function public.record_cleanup();
