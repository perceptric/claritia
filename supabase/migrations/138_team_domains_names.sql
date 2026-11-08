-- 138: team_domains (135) takes its own name on its keys and checks.
alter table public.team_domains rename constraint identity_settings_pkey to team_domains_pkey;
alter table public.team_domains rename constraint identity_settings_workspace_id_fkey to team_domains_workspace_id_fkey;
alter table public.team_domains rename constraint identity_settings_own_domains_check to team_domains_own_domains_check;
alter table public.team_domains rename constraint identity_settings_partner_domains_check to team_domains_partner_domains_check;
