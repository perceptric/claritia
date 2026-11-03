-- Routing by chat (docs/routing-chat-plan.md): the chat beside a workspace's routing setup, newest 40 messages kept.
-- Same shape as form_chats (046_form_ai.sql). Members read it; only the server writes it.

create table if not exists public.router_chats (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  -- [{ role: user|assistant, text, lines?: string[], ask?: { question, choices }, at }]
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.router_chats enable row level security;
drop policy if exists "members read" on public.router_chats;
create policy "members read" on public.router_chats for select using (is_member(workspace_id));
revoke all on public.router_chats from anon;
revoke insert, update, delete on public.router_chats from authenticated;

create or replace function public.router_chat_add(p_ws uuid, p_messages jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if jsonb_typeof(p_messages) <> 'array' then
    raise exception 'messages must be a list';
  end if;
  insert into router_chats (workspace_id, messages) values (p_ws, p_messages)
  on conflict (workspace_id) do update set
    messages = (select coalesce(jsonb_agg(m order by n), '[]'::jsonb) from (
      select m, n from (
        select m, n from jsonb_array_elements(router_chats.messages || excluded.messages) with ordinality as x(m, n)
        order by n desc limit 40) z) y),
    updated_at = now();
end;
$$;
revoke all on function public.router_chat_add(uuid, jsonb) from public, anon, authenticated;

-- Start over: clears the chat, not the setup.
create or replace function public.router_chat_clear(p_ws uuid) returns void
language sql security definer set search_path = public as $$
  delete from router_chats where workspace_id = p_ws;
$$;
revoke all on function public.router_chat_clear(uuid) from public, anon, authenticated;
