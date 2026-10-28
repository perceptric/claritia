-- Brand setup (docs/design-system.md Part 7.1). Run after 075. Safe to run more than once.
--
-- The scan now finds more than the 22 tokens: brand colors, heading sizes and a card shadow go into the kit's design
-- system draft as variables (never over ones the kit has), and the social links, company address and a short brief
-- Claude writes from the site's words are kept on the kit for the Social and Footer blocks and the AI.

alter table public.brand_kits
  add column if not exists social jsonb not null default '[]' check (jsonb_typeof(social) = 'array' and length(social::text) <= 4000),
  add column if not exists address text check (length(address) <= 300),
  add column if not exists brief text check (length(brief) <= 2000);

-- What the scan adds to the design system draft, merged in one statement: variables whose id and name the kit
-- doesn't have yet, and the email heading size when the kit sets none. Values were checked by the worker
-- (src/lib/brand/design.ts) and are read through readSystem wherever they're used.
create or replace function public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) returns void
language plpgsql security definer set search_path = public as $$
declare
  k brand_kits%rowtype;
  d jsonb;
  have jsonb;
  added jsonb;
begin
  select * into k from brand_kits where id = p_kit for update;
  if k.id is null then return; end if;
  d := coalesce(k.design, '{}');
  have := coalesce(d->'variables', '[]');
  select coalesce(jsonb_agg(v), '[]') into added from jsonb_array_elements(coalesce(p_vars, '[]')) v
   where not exists (select 1 from jsonb_array_elements(have) e where e->>'id' = v->>'id' or lower(e->>'name') = lower(v->>'name'));
  d := jsonb_set(d, '{variables}', have || added);
  if p_heading is not null and d #> '{email,globals,heading,base,font-size}' is null then
    d := jsonb_set(d, '{email}', coalesce(d->'email', '{}'));
    d := jsonb_set(d, '{email,globals}', coalesce(d #> '{email,globals}', '{}'));
    d := jsonb_set(d, '{email,globals,heading}', coalesce(d #> '{email,globals,heading}', '{}'));
    d := jsonb_set(d, '{email,globals,heading,base}', coalesce(d #> '{email,globals,heading,base}', '{}') || jsonb_build_object('font-size', p_heading));
  end if;
  update brand_kits set
    social = coalesce(p_social, social),
    address = coalesce(nullif(trim(p_address), ''), address),
    brief = coalesce(nullif(trim(p_brief), ''), brief),
    design = d,
    design_rev = case when d is distinct from k.design then design_rev + 1 else design_rev end,
    updated_at = now()
  where id = p_kit;
end;
$$;

do $$
begin
  revoke execute on function public.brand_scan_design(uuid, jsonb, text, jsonb, text, text) from public, anon, authenticated;
  grant execute on function public.brand_scan_design(uuid, jsonb, text, jsonb, text, text) to service_role;
end;
$$;
