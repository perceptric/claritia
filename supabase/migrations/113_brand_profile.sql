-- Form Studio (docs/studio-v2-plan.md 6.1): what the brand's site told Tia about it (its industry, language, country
-- and other languages), kept on the brand so every chat follows the industry's recipe. The owner can change it with
-- one click. Safe to run twice.

alter table public.brand_kits add column if not exists studio_profile jsonb check (studio_profile is null or (jsonb_typeof(studio_profile) = 'object' and length(studio_profile::text) <= 2000));
