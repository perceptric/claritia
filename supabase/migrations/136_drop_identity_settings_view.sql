-- 136: The app now reads team_domains (135), so the identity_settings view that bridged the switch goes.
drop view if exists public.identity_settings;
