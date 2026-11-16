-- Composio holds the sign-in for most tools (docs/sources-setup.md, "Composio"; src/lib/sources/composio.ts). Each
-- source keeps the Composio connected account it signs in with, next to its sealed sign-in (which holds it too): the
-- card shows Reconnect for a row still on the old path (null here), and a reconnect removes the account it replaces.
-- An id, not a secret: without the server's COMPOSIO_API_KEY it reaches nothing. source_connect takes it as one more
-- argument and sets it on every connect (null for a connection made the old way). Safe to run twice.

alter table public.sources add column if not exists composio_account text check (length(composio_account) <= 100);

drop function if exists public.source_connect(uuid, uuid, text, text, text, text, jsonb, text);

create or replace function public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text,
  p_settings jsonb default '{}', p_hook_sealed text default null, p_composio text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  old_account text;
  existed boolean;
begin
  select true, account into existed, old_account from sources where workspace_id = p_ws and kind = p_kind;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user and role = 'owner') then
    raise exception 'Only owners can connect tools';
  end if;
  if not source_settings_ok(coalesce(p_settings, '{}')) then
    raise exception 'Bad settings';
  end if;
  insert into sources (workspace_id, kind, name, account, settings, created_by, status, next_run_at, composio_account)
  values (p_ws, p_kind, left(p_name, 120), left(p_account, 200), coalesce(p_settings, '{}'), p_user, 'active', now(), left(p_composio, 100))
  on conflict (workspace_id, kind) do update set
    name = excluded.name,
    -- Another account on the other side starts over: old links point at the old account.
    cursors = case when sources.account is distinct from excluded.account then '{}' else sources.cursors end,
    push_cursor = case when sources.account is distinct from excluded.account then null else sources.push_cursor end,
    account = excluded.account,
    settings = sources.settings || excluded.settings,
    composio_account = excluded.composio_account,
    status = 'active', last_error = null, errors_in_row = 0, next_run_at = now()
  returning id into sid;
  if existed and old_account is distinct from p_account then
    delete from source_links where source_id = sid;
  end if;
  insert into source_secrets (source_id, sealed, hook_sealed) values (sid, p_sealed, p_hook_sealed)
  on conflict (source_id) do update set sealed = excluded.sealed, hook_sealed = coalesce(excluded.hook_sealed, source_secrets.hook_sealed), updated_at = now();
  perform enqueue_job(p_ws, 'source_pull', sid::text, jsonb_build_object('source_id', sid), 0, 5);
  return sid;
end;
$$;

revoke execute on function public.source_connect(uuid, uuid, text, text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.source_connect(uuid, uuid, text, text, text, text, jsonb, text, text) to service_role;
