-- The form chat and the brand scan (docs/form-builder.md Parts 4 and 5, week 10).
--   AI steps replay from ai_cache (042_nurture.sql) by the hash of everything they read, and never call the model
--   twice for the same inputs (the CLAUDE.md rule). ai_calls: one row per model call with its tokens and cost, for the monthly bill.
--   form_chats: the chat beside each form, newest 40 messages kept.
--   Brand kits gain the scan's state, and the forms found on the site, which the chat reads.

-- ai_cache and its functions come from 042_nurture.sql.

create table if not exists public.ai_calls (
  id bigint generated always as identity primary key,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  kind text not null check (kind ~ '^[a-z_]{2,40}$'),
  model text not null check (length(model) <= 60),
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  web_searches int not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  cached boolean not null default false,
  at timestamptz not null default now()
);
create index if not exists ai_calls_ws on public.ai_calls (workspace_id, at desc);
alter table public.ai_calls enable row level security;
create policy "owners read" on public.ai_calls for select using (is_owner(workspace_id));
revoke all on public.ai_calls from anon;
revoke insert, update, delete on public.ai_calls from authenticated;

create table if not exists public.form_chats (
  form_id uuid primary key references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- [{ role: user|assistant, text, lines?: string[], ask?: { question, choices }, at }]
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array'),
  updated_at timestamptz not null default now()
);
alter table public.form_chats enable row level security;
create policy "members read" on public.form_chats for select using (is_member(workspace_id));
revoke all on public.form_chats from anon;
revoke insert, update, delete on public.form_chats from authenticated;

alter table public.brand_kits add column if not exists scan_status text check (scan_status in ('scanning', 'done', 'failed'));
alter table public.brand_kits add column if not exists scan_error text check (length(scan_error) <= 500);
-- Forms found on the site's pages: [{ url, fields: [{ label, type }] }].
alter table public.brand_kits add column if not exists site_forms jsonb not null default '[]' check (jsonb_typeof(site_forms) = 'array' and length(site_forms::text) <= 20000);

-- The server's side ---------------------------------------------------------------------------------------------

create or replace function public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) returns void
language sql security definer set search_path = public as $$
  insert into ai_calls (workspace_id, kind, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches, cost_usd, cached)
  values (p_ws, p_kind, left(p_model, 60), coalesce((p_usage->>'input')::int, 0), coalesce((p_usage->>'output')::int, 0),
          coalesce((p_usage->>'cache_read')::int, 0), coalesce((p_usage->>'cache_write')::int, 0), coalesce((p_usage->>'searches')::int, 0),
          coalesce(p_cost, 0), coalesce(p_cached, false));
$$;

-- Add chat messages; only the newest 40 are kept.
create or replace function public.form_chat_add(p_form uuid, p_messages jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null then
    raise exception 'Form not found';
  end if;
  insert into form_chats (form_id, workspace_id, messages) values (p_form, ws, p_messages)
  on conflict (form_id) do update set
    messages = (select coalesce(jsonb_agg(m order by n), '[]'::jsonb) from (
      select m, n from jsonb_array_elements(form_chats.messages || excluded.messages) with ordinality as x(m, n)
      order by n desc limit 40) y),
    updated_at = now();
end;
$$;

-- Start a scan of a site into a kit (a new one named after the host, or the kit given). The runner picks it up.
create or replace function public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid default null, p_form uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  kid uuid := p_kit;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Workspace not found';
  end if;
  if p_url !~ '^https?://[^\s/]+' or length(p_url) > 1000 then
    raise exception 'Enter the site''s address';
  end if;
  if kid is null then
    insert into brand_kits (workspace_id, name, source_url, scan_status)
    values (p_ws, left(substring(p_url from '^https?://(?:www\.)?([^/:?#]+)'), 120), p_url, 'scanning')
    returning id into kid;
  else
    update brand_kits set source_url = p_url, scan_status = 'scanning', scan_error = null, updated_at = now() where id = kid and workspace_id = p_ws;
    if not found then
      raise exception 'Brand kit not found';
    end if;
  end if;
  if p_form is not null then
    update forms set brand_kit_id = kid, updated_at = now()
    where id = p_form and workspace_id = p_ws and brand_kit_id is null;
  end if;
  perform enqueue_job(p_ws, 'brand_scan', kid::text, jsonb_build_object('kit_id', kid, 'url', p_url), 0, 3);
  perform wake_runner();
  return kid;
end;
$$;

create or replace function public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) returns void
language sql security definer set search_path = public as $$
  update brand_kits set
    tokens = case when p_error is null then p_tokens else tokens end,
    logo_url = case when p_error is null then coalesce(p_logo_url, logo_url) else logo_url end,
    notes = case when p_error is null then coalesce(p_notes, '{}') else notes end,
    site_forms = case when p_error is null then coalesce(p_site_forms, '[]') else site_forms end,
    scan_status = case when p_error is null then 'done' else 'failed' end,
    scan_error = left(p_error, 500),
    scanned_at = case when p_error is null then now() else scanned_at end,
    updated_at = now()
  where id = p_kit;
$$;

-- minute_tick prunes the step cache: see 048_form_checks.sql.

do $$
declare
  f text;
begin
  foreach f in array array['ai_call_log(uuid, text, text, jsonb, numeric, boolean)',
    'form_chat_add(uuid, jsonb)', 'brand_scan_start(uuid, uuid, text, uuid, uuid)', 'brand_scan_finish(uuid, jsonb, text, text[], jsonb, text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
