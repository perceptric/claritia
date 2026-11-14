-- Form Studio (docs/studio-v2-plan.md, Part 13): one form, many chats with Tia. The form keeps its page in
-- form_chats (112); each chat about it is a row here with its messages as the Studio shows them, who started it and
-- when it last changed. Tia reads a chat's last turns plus the form as it is now, so a new chat still knows the form.
-- Members read; the Studio's server route (/api/studio, modes thread-save and thread-delete) writes, after checking
-- the member. Each form's conversation so far moves into one chat, "Earlier chat"; the old fields in form_chats.body
-- (log, turns) stay as they were, so going back to the old Studio still works. Safe to run twice.

create table if not exists public.studio_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_chat_id uuid not null references public.form_chats (id) on delete cascade,
  title text not null default 'New chat' check (length(btrim(title)) between 1 and 120),
  created_by uuid,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and length(messages::text) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_threads_chat on public.studio_threads (form_chat_id, updated_at desc);
alter table public.studio_threads enable row level security;
drop policy if exists "members read" on public.studio_threads;
create policy "members read" on public.studio_threads for select using (is_member(workspace_id));
revoke all on public.studio_threads from anon;
revoke insert, update, delete on public.studio_threads from authenticated;

-- Each form's conversation so far, as its "Earlier chat": the messages it showed (body.log, without what was only
-- for the screen), or, when that's gone, its turns with Tia's words taken out of <say>. Only for a form that had a
-- conversation (a log with the owner's words, or turns) and no chat here yet. The same rule as earlierMessages in
-- src/lib/studio/threads.ts.
with src as (
  select
    c.id,
    c.workspace_id,
    c.created_by,
    c.updated_at,
    case
      when jsonb_typeof(c.body -> 'log') = 'array' and exists (select 1 from jsonb_array_elements(c.body -> 'log') m where jsonb_typeof(m) = 'object' and m ->> 'who' = 'me') then (
        select coalesce(jsonb_agg((m - 'live' - 'status') order by n), '[]'::jsonb)
        from jsonb_array_elements(c.body -> 'log') with ordinality as x (m, n)
        where jsonb_typeof(m) = 'object' and m ->> 'who' in ('me', 'ai')
      )
      when jsonb_typeof(c.body -> 'turns') = 'array' then (
        select coalesce(jsonb_agg(
          case when t ->> 'role' = 'user' then jsonb_build_object('who', 'me', 'text', coalesce(t ->> 'content', ''))
          else jsonb_build_object('who', 'ai', 'text', btrim(coalesce(substring(t ->> 'content' from '<say>(.*?)</say>'), t ->> 'content', '')))
          end order by n), '[]'::jsonb)
        from jsonb_array_elements(c.body -> 'turns') with ordinality as y (t, n)
        where jsonb_typeof(t) = 'object' and t ->> 'role' in ('user', 'assistant')
      )
      else '[]'::jsonb
    end as msgs
  from public.form_chats c
  where not exists (select 1 from public.studio_threads s where s.form_chat_id = c.id)
)
insert into public.studio_threads (workspace_id, form_chat_id, title, created_by, messages, created_at, updated_at)
select workspace_id, id, 'Earlier chat', created_by, msgs, updated_at, updated_at
from src
where jsonb_array_length(msgs) > 0 and length(msgs::text) <= 1000000;
