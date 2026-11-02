-- Form Studio (docs/studio-v2-plan.md, Part 2): every form is one chat with Tia, kept on the server so it follows
-- the owner to any computer and teammates see it. A chat holds the page (HTML, its CSS, what happens after the send),
-- what was said and Tia's short memory, and points at its form once it's published. Members read; the Studio's
-- server route (/api/studio) writes, after checking the member. The brand's CSS Tia read from its site is kept on
-- the brand, so every chat in the brand shares it. Safe to run twice.

alter table public.brand_kits add column if not exists studio_css text check (studio_css is null or length(studio_css) <= 200000);

create table if not exists public.form_chats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid references public.forms (id) on delete set null,
  brand_kit_id uuid references public.brand_kits (id) on delete set null,
  name text not null default 'New form' check (length(btrim(name)) between 1 and 120),
  state text not null default 'new' check (state in ('new', 'draft', 'live', 'changed')),
  body jsonb not null default '{}' check (jsonb_typeof(body) = 'object' and length(body::text) <= 2000000),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists form_chats_ws on public.form_chats (workspace_id, updated_at desc);
create unique index if not exists form_chats_form on public.form_chats (form_id) where form_id is not null;
alter table public.form_chats enable row level security;
drop policy if exists "members read" on public.form_chats;
create policy "members read" on public.form_chats for select using (is_member(workspace_id));
