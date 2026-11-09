-- One-click sign-in for ChatGPT, Claude and other MCP apps (docs/mcp.md, "Connect from ChatGPT or Claude").
--   The MCP sign-in spec has each app register itself (RFC 7591) before it signs in: /api/oauth/register keeps the
--   app's name and return addresses here and answers with a client id (mcp_...). These apps have no secret; their
--   sign-in must carry a PKCE check (S256). The rest is the sign-in Zapier uses (127): the person approves in
--   Claritia, the code turns into an API key named after the app, and revoking the key signs the app out.
--   An app that registered but never signed in is dropped after 7 days.

create table if not exists public.oauth_clients (
  id text primary key check (id ~ '^mcp_[A-Za-z0-9_-]{20,64}$'),
  name text not null check (length(name) between 1 and 60),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists oauth_clients_created on public.oauth_clients (created_at) where used_at is null;
alter table public.oauth_clients enable row level security;
revoke all on public.oauth_clients from anon, authenticated;

alter table public.oauth_codes drop constraint if exists oauth_codes_client_check;
alter table public.oauth_codes add constraint oauth_codes_client_check
  check (client in ('zapier', 'make', 'activepieces') or client ~ '^mcp_[A-Za-z0-9_-]{20,64}$');

create or replace function public.oauth_client_add(p_id text, p_name text, p_redirects text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from oauth_clients where used_at is null and created_at < now() - interval '7 days';
  insert into oauth_clients (id, name, redirect_uris) values (p_id, p_name, p_redirects);
end;
$$;

-- An app that registered: { name, redirect_uris }, or null.
create or replace function public.oauth_client_get(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', name, 'redirect_uris', to_jsonb(redirect_uris)) from oauth_clients where id = p_id;
$$;

-- As in 127, and a registered app is marked as used once someone approves it, so it's kept.
create or replace function public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  delete from oauth_codes where created_at < now() - interval '1 day';
  insert into oauth_codes (code_hash, client, workspace_id, user_id, redirect_uri, challenge, expires_at)
  values (p_hash, p_client, p_ws, p_user, p_redirect, nullif(p_challenge, ''), now() + interval '10 minutes');
  update oauth_clients set used_at = now() where id = p_client and used_at is null;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['oauth_client_add(text, text, text[])', 'oauth_client_get(text)', 'oauth_code_add(text, text, uuid, uuid, text, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
