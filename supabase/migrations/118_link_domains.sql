-- Sharing step 4 (docs/sharing-plan.md): a workspace's own address for its links. One custom domain a workspace,
-- like forms.acme.com, on paid plans: forms.acme.com/<ending> opens a form, /book/<type> a meeting, / the team's
-- booking page. It serves only once its DNS points at Claritia and its certificate is ready (status 'active'), and
-- stops when a re-check finds the DNS pointing elsewhere ('failed'). One hostname is never two workspaces'.

create table if not exists public.link_domains (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  hostname text not null unique check (length(hostname) <= 253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  dns_ok boolean not null default false,
  cert_ok boolean not null default false,
  last_error text check (length(last_error) <= 300),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.link_domains enable row level security;
drop policy if exists "members read" on public.link_domains;
create policy "members read" on public.link_domains for select using (is_member(workspace_id));
revoke all on public.link_domains from anon;
revoke insert, update, delete on public.link_domains from authenticated;

-- The workspace name in links for a domain that serves (server, for the proxy): null for any other host.
create or replace function public.link_domain_host(p_host text) returns text
language sql stable security definer set search_path = public as $$
  select w.booking_slug from link_domains d join workspaces w on w.id = d.workspace_id
  where d.hostname = lower(p_host) and d.status = 'active' and w.booking_slug is not null;
$$;

-- Whether a workspace name in links exists (server, for workspace subdomains).
create or replace function public.link_slug_exists(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces where booking_slug = lower(p_slug));
$$;

revoke execute on function public.link_domain_host(text) from public, anon, authenticated;
revoke execute on function public.link_slug_exists(text) from public, anon, authenticated;
