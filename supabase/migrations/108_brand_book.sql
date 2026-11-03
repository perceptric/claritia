-- The brand book (docs/brand-capture.md). Run after 107. Safe to run more than once.
--
-- The deep read (the site's pages, stylesheets, font files, logo and words) and Claude's brand book from it: colors by
-- role, type, buttons, corners, imagery, voice and rules. The book sets the kit's tokens; the runner's browser scan
-- fills only what the book left out.

alter table public.brand_kits add column if not exists book jsonb check (book is null or (jsonb_typeof(book) = 'object' and length(book::text) <= 20000));
alter table public.brand_kits add column if not exists faces jsonb not null default '[]' check (jsonb_typeof(faces) = 'array' and length(faces::text) <= 20000);
alter table public.brand_kits add column if not exists logo_svg text check (length(logo_svg) <= 60000);
alter table public.brand_kits add column if not exists book_status text check (book_status in ('reading', 'done', 'failed'));
alter table public.brand_kits add column if not exists book_at timestamptz;

-- The book and what it brings: tokens, font files, the logo drawing.
create or replace function public.brand_kit_book(p_kit uuid, p_book jsonb, p_faces jsonb, p_tokens jsonb, p_logo_svg text, p_logo_url text) returns void
language sql security definer set search_path = public as $$
  update brand_kits set
    book = p_book,
    faces = coalesce(p_faces, '[]'),
    tokens = case when p_tokens is null or p_tokens = '{}'::jsonb then tokens else p_tokens end,
    logo_svg = coalesce(p_logo_svg, logo_svg),
    logo_url = coalesce(logo_url, p_logo_url),
    book_status = case when p_book is null then 'failed' else 'done' end,
    book_at = now(),
    scan_status = case when p_book is not null or tokens <> '{}'::jsonb then 'done' else scan_status end,
    updated_at = now()
  where id = p_kit;
$$;

-- The book is being written.
create or replace function public.brand_kit_reading(p_kit uuid) returns void
language sql security definer set search_path = public as $$
  update brand_kits set book_status = 'reading', updated_at = now() where id = p_kit;
$$;

-- The runner's browser scan: with a book, it only fills what the book left out (the book's values win).
create or replace function public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) returns void
language sql security definer set search_path = public as $$
  update brand_kits set
    tokens = case when p_error is not null then tokens when book is not null then p_tokens || tokens else p_tokens end,
    logo_url = case when p_error is null then coalesce(logo_url, p_logo_url) else logo_url end,
    notes = case when p_error is null then coalesce(p_notes, '{}') else notes end,
    site_forms = case when p_error is null then coalesce(p_site_forms, '[]') else site_forms end,
    scan_status = case when p_error is null or tokens <> '{}'::jsonb then 'done' else 'failed' end,
    scan_error = left(p_error, 500),
    quick_at = case when p_error is null then null else quick_at end,
    scanned_at = case when p_error is null then now() else scanned_at end,
    updated_at = now()
  where id = p_kit;
$$;

-- The site's own font files for a kit, for its fonts stylesheet (public: font addresses are public on the site).
create or replace function public.brand_kit_fonts(p_kit uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('faces', faces, 'heading', book->'type'->'heading'->>'family', 'body', book->'type'->'body'->>'family') from brand_kits where id = p_kit;
$$;

revoke execute on function public.brand_kit_book(uuid, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.brand_kit_reading(uuid) from public, anon, authenticated;
revoke execute on function public.brand_kit_fonts(uuid) from public, anon, authenticated;
