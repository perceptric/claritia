-- Booking pages on the design system (docs/design-system.md Part 3.5). Run after 076. Safe to run more than once.
--
-- The kit a booking page gets now carries its published design too, so the pages draw the brand's variables and
-- booking styles (src/lib/design/book.ts). Only the published copy: a draft never reaches guests.

create or replace function public.book_kit(p_ws uuid, p_form uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = p_form and f.workspace_id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb)) from brand_kits k where k.workspace_id = p_ws order by k.created_at desc limit 1),
    jsonb_build_object('tokens', '{}'::jsonb, 'logo_url', null, 'design', '{}'::jsonb)
  );
$$;
