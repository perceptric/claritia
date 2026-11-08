-- claritia: security. Built from the running database. Unused objects were removed in the move (see README.md).
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

-- row security: contact_events_2025_10
ALTER TABLE partitions.contact_events_2025_10 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2025_11
ALTER TABLE partitions.contact_events_2025_11 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2025_12
ALTER TABLE partitions.contact_events_2025_12 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_01
ALTER TABLE partitions.contact_events_2026_01 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_02
ALTER TABLE partitions.contact_events_2026_02 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_03
ALTER TABLE partitions.contact_events_2026_03 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_04
ALTER TABLE partitions.contact_events_2026_04 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_05
ALTER TABLE partitions.contact_events_2026_05 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_06
ALTER TABLE partitions.contact_events_2026_06 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_07
ALTER TABLE partitions.contact_events_2026_07 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_08
ALTER TABLE partitions.contact_events_2026_08 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_09
ALTER TABLE partitions.contact_events_2026_09 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_10
ALTER TABLE partitions.contact_events_2026_10 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_11
ALTER TABLE partitions.contact_events_2026_11 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2026_12
ALTER TABLE partitions.contact_events_2026_12 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2027_01
ALTER TABLE partitions.contact_events_2027_01 ENABLE ROW LEVEL SECURITY;

-- row security: contact_events_2027_02
ALTER TABLE partitions.contact_events_2027_02 ENABLE ROW LEVEL SECURITY;

-- row security: account_alert_log
ALTER TABLE public.account_alert_log ENABLE ROW LEVEL SECURITY;

-- row security: account_daily
ALTER TABLE public.account_daily ENABLE ROW LEVEL SECURITY;

-- row security: account_domains
ALTER TABLE public.account_domains ENABLE ROW LEVEL SECURITY;

-- row security: account_feedback
ALTER TABLE public.account_feedback ENABLE ROW LEVEL SECURITY;

-- row security: account_scores
ALTER TABLE public.account_scores ENABLE ROW LEVEL SECURITY;

-- row security: accounts
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- row security: activity_out
ALTER TABLE public.activity_out ENABLE ROW LEVEL SECURITY;

-- row security: ai_cache
ALTER TABLE public.ai_cache ENABLE ROW LEVEL SECURITY;

-- row security: ai_calls
ALTER TABLE public.ai_calls ENABLE ROW LEVEL SECURITY;

-- row security: alert_events
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;

-- row security: alert_settings
ALTER TABLE public.alert_settings ENABLE ROW LEVEL SECURITY;

-- row security: api_keys
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

-- row security: app_config
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- row security: app_links
ALTER TABLE public.app_links ENABLE ROW LEVEL SECURITY;

-- row security: app_pages
ALTER TABLE public.app_pages ENABLE ROW LEVEL SECURITY;

-- row security: audit_log
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- row security: availability
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;

-- row security: availability_schedules
ALTER TABLE public.availability_schedules ENABLE ROW LEVEL SECURITY;

-- row security: blocks
ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

-- row security: booking_profiles
ALTER TABLE public.booking_profiles ENABLE ROW LEVEL SECURITY;

-- row security: brand_kits
ALTER TABLE public.brand_kits ENABLE ROW LEVEL SECURITY;

-- row security: busy_blocks
ALTER TABLE public.busy_blocks ENABLE ROW LEVEL SECURITY;

-- row security: calendar_accounts
ALTER TABLE public.calendar_accounts ENABLE ROW LEVEL SECURITY;

-- row security: calendar_lists
ALTER TABLE public.calendar_lists ENABLE ROW LEVEL SECURITY;

-- row security: calendar_tokens
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;

-- row security: companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- row security: company_cache
ALTER TABLE public.company_cache ENABLE ROW LEVEL SECURITY;

-- row security: consents
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;

-- row security: contact_events
ALTER TABLE public.contact_events ENABLE ROW LEVEL SECURITY;

-- row security: contacts
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- row security: crm_owner_links
ALTER TABLE public.crm_owner_links ENABLE ROW LEVEL SECURITY;

-- row security: deliveries
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- row security: design_assets
ALTER TABLE public.design_assets ENABLE ROW LEVEL SECURITY;

-- row security: device_links
ALTER TABLE public.device_links ENABLE ROW LEVEL SECURITY;

-- row security: devices
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- row security: domain_aliases
ALTER TABLE public.domain_aliases ENABLE ROW LEVEL SECURITY;

-- row security: email_events
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

-- row security: email_messages
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

-- row security: email_templates
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- row security: email_tokens
ALTER TABLE public.email_tokens ENABLE ROW LEVEL SECURITY;

-- row security: email_versions
ALTER TABLE public.email_versions ENABLE ROW LEVEL SECURITY;

-- row security: emails
ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- row security: enrich_keys
ALTER TABLE public.enrich_keys ENABLE ROW LEVEL SECURITY;

-- row security: enrich_runs
ALTER TABLE public.enrich_runs ENABLE ROW LEVEL SECURITY;

-- row security: enrich_settings
ALTER TABLE public.enrich_settings ENABLE ROW LEVEL SECURITY;

-- row security: enrich_sources
ALTER TABLE public.enrich_sources ENABLE ROW LEVEL SECURITY;

-- row security: enrich_usage
ALTER TABLE public.enrich_usage ENABLE ROW LEVEL SECURITY;

-- row security: env_secret_values
ALTER TABLE public.env_secret_values ENABLE ROW LEVEL SECURITY;

-- row security: env_secrets
ALTER TABLE public.env_secrets ENABLE ROW LEVEL SECURITY;

-- row security: environments
ALTER TABLE public.environments ENABLE ROW LEVEL SECURITY;

-- row security: erasures
ALTER TABLE public.erasures ENABLE ROW LEVEL SECURITY;

-- row security: events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- row security: events_20261014
ALTER TABLE public.events_20261014 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261015
ALTER TABLE public.events_20261015 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261016
ALTER TABLE public.events_20261016 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261017
ALTER TABLE public.events_20261017 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261018
ALTER TABLE public.events_20261018 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261019
ALTER TABLE public.events_20261019 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261020
ALTER TABLE public.events_20261020 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261021
ALTER TABLE public.events_20261021 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261022
ALTER TABLE public.events_20261022 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261023
ALTER TABLE public.events_20261023 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261024
ALTER TABLE public.events_20261024 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261025
ALTER TABLE public.events_20261025 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261026
ALTER TABLE public.events_20261026 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261027
ALTER TABLE public.events_20261027 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261028
ALTER TABLE public.events_20261028 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261029
ALTER TABLE public.events_20261029 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261030
ALTER TABLE public.events_20261030 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261031
ALTER TABLE public.events_20261031 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261101
ALTER TABLE public.events_20261101 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261102
ALTER TABLE public.events_20261102 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261103
ALTER TABLE public.events_20261103 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261104
ALTER TABLE public.events_20261104 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261105
ALTER TABLE public.events_20261105 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261106
ALTER TABLE public.events_20261106 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261107
ALTER TABLE public.events_20261107 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261108
ALTER TABLE public.events_20261108 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261109
ALTER TABLE public.events_20261109 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261110
ALTER TABLE public.events_20261110 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261111
ALTER TABLE public.events_20261111 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261112
ALTER TABLE public.events_20261112 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261113
ALTER TABLE public.events_20261113 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261114
ALTER TABLE public.events_20261114 ENABLE ROW LEVEL SECURITY;

-- row security: events_20261115
ALTER TABLE public.events_20261115 ENABLE ROW LEVEL SECURITY;

-- policy: source_kinds everyone reads
CREATE POLICY "everyone reads" ON public.source_kinds FOR SELECT USING (true);

-- row security: explorations
ALTER TABLE public.explorations ENABLE ROW LEVEL SECURITY;

-- row security: field_history
ALTER TABLE public.field_history ENABLE ROW LEVEL SECURITY;

-- row security: field_order
ALTER TABLE public.field_order ENABLE ROW LEVEL SECURITY;

-- row security: field_settings
ALTER TABLE public.field_settings ENABLE ROW LEVEL SECURITY;

-- row security: field_writes
ALTER TABLE public.field_writes ENABLE ROW LEVEL SECURITY;

-- row security: fields
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;

-- row security: form_bookings
ALTER TABLE public.form_bookings ENABLE ROW LEVEL SECURITY;

-- row security: form_chats
ALTER TABLE public.form_chats ENABLE ROW LEVEL SECURITY;

-- row security: form_checks
ALTER TABLE public.form_checks ENABLE ROW LEVEL SECURITY;

-- row security: form_daily
ALTER TABLE public.form_daily ENABLE ROW LEVEL SECURITY;

-- row security: form_destination_secrets
ALTER TABLE public.form_destination_secrets ENABLE ROW LEVEL SECURITY;

-- row security: form_destinations
ALTER TABLE public.form_destinations ENABLE ROW LEVEL SECURITY;

-- row security: form_drafts
ALTER TABLE public.form_drafts ENABLE ROW LEVEL SECURITY;

-- row security: form_field_sessions
ALTER TABLE public.form_field_sessions ENABLE ROW LEVEL SECURITY;

-- row security: form_folders
ALTER TABLE public.form_folders ENABLE ROW LEVEL SECURITY;

-- row security: form_notify_sent
ALTER TABLE public.form_notify_sent ENABLE ROW LEVEL SECURITY;

-- row security: form_seen
ALTER TABLE public.form_seen ENABLE ROW LEVEL SECURITY;

-- row security: form_slug_moves
ALTER TABLE public.form_slug_moves ENABLE ROW LEVEL SECURITY;

-- row security: form_submissions
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;

-- row security: form_uploads
ALTER TABLE public.form_uploads ENABLE ROW LEVEL SECURITY;

-- row security: form_versions
ALTER TABLE public.form_versions ENABLE ROW LEVEL SECURITY;

-- row security: forms
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

-- row security: github_checks
ALTER TABLE public.github_checks ENABLE ROW LEVEL SECURITY;

-- row security: github_installations
ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;

-- row security: github_links
ALTER TABLE public.github_links ENABLE ROW LEVEL SECURITY;

-- row security: heals
ALTER TABLE public.heals ENABLE ROW LEVEL SECURITY;

-- row security: hook_events
ALTER TABLE public.hook_events ENABLE ROW LEVEL SECURITY;

-- row security: hop_nonces
ALTER TABLE public.hop_nonces ENABLE ROW LEVEL SECURITY;

-- row security: icp
ALTER TABLE public.icp ENABLE ROW LEVEL SECURITY;

-- row security: identifiers
ALTER TABLE public.identifiers ENABLE ROW LEVEL SECURITY;

-- row security: identity_evidence
ALTER TABLE public.identity_evidence ENABLE ROW LEVEL SECURITY;

-- row security: identity_settings
ALTER TABLE public.identity_settings ENABLE ROW LEVEL SECURITY;

-- row security: imports
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

-- row security: inbox_messages
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

-- row security: intent_params
ALTER TABLE public.intent_params ENABLE ROW LEVEL SECURITY;

-- row security: invites
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- row security: ip_cache
ALTER TABLE public.ip_cache ENABLE ROW LEVEL SECURITY;

-- row security: jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- row security: lead_score_marks
ALTER TABLE public.lead_score_marks ENABLE ROW LEVEL SECURITY;

-- row security: lead_settings
ALTER TABLE public.lead_settings ENABLE ROW LEVEL SECURITY;

-- row security: learned_networks
ALTER TABLE public.learned_networks ENABLE ROW LEVEL SECURITY;

-- row security: link_domains
ALTER TABLE public.link_domains ENABLE ROW LEVEL SECURITY;

-- row security: mailbox_sends
ALTER TABLE public.mailbox_sends ENABLE ROW LEVEL SECURITY;

-- row security: mailboxes
ALTER TABLE public.mailboxes ENABLE ROW LEVEL SECURITY;

-- row security: mappings
ALTER TABLE public.mappings ENABLE ROW LEVEL SECURITY;

-- row security: meeting_events
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;

-- row security: meeting_links
ALTER TABLE public.meeting_links ENABLE ROW LEVEL SECURITY;

-- row security: meeting_mails
ALTER TABLE public.meeting_mails ENABLE ROW LEVEL SECURITY;

-- row security: meeting_outcome_uses
ALTER TABLE public.meeting_outcome_uses ENABLE ROW LEVEL SECURITY;

-- row security: meeting_sync_leases
ALTER TABLE public.meeting_sync_leases ENABLE ROW LEVEL SECURITY;

-- row security: meeting_types
ALTER TABLE public.meeting_types ENABLE ROW LEVEL SECURITY;

-- row security: meetings
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- policy: saved_views members add
CREATE POLICY "members add" ON public.saved_views FOR INSERT WITH CHECK (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND (created_by = ( SELECT auth.uid() AS uid)) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

-- policy: blocks members all
CREATE POLICY "members all" ON public.blocks USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: environments members all
CREATE POLICY "members all" ON public.environments USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: github_links members all
CREATE POLICY "members all" ON public.github_links USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: projects members all
CREATE POLICY "members all" ON public.projects USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: schedules members all
CREATE POLICY "members all" ON public.schedules USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: tests members all
CREATE POLICY "members all" ON public.tests USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))) WITH CHECK ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: saved_views members change
CREATE POLICY "members change" ON public.saved_views FOR UPDATE USING (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid))))) WITH CHECK (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

-- policy: app_pages members delete
CREATE POLICY "members delete" ON public.app_pages FOR DELETE USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: env_secrets members delete
CREATE POLICY "members delete" ON public.env_secrets FOR DELETE USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: account_alert_log members read
CREATE POLICY "members read" ON public.account_alert_log FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: account_daily members read
CREATE POLICY "members read" ON public.account_daily FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: account_domains members read
CREATE POLICY "members read" ON public.account_domains FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: account_feedback members read
CREATE POLICY "members read" ON public.account_feedback FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: account_scores members read
CREATE POLICY "members read" ON public.account_scores FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: accounts members read
CREATE POLICY "members read" ON public.accounts FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: activity_out members read
CREATE POLICY "members read" ON public.activity_out FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: alert_settings members read
CREATE POLICY "members read" ON public.alert_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: api_keys members read
CREATE POLICY "members read" ON public.api_keys FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: app_links members read
CREATE POLICY "members read" ON public.app_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: app_pages members read
CREATE POLICY "members read" ON public.app_pages FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: availability members read
CREATE POLICY "members read" ON public.availability FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: availability_schedules members read
CREATE POLICY "members read" ON public.availability_schedules FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: booking_profiles members read
CREATE POLICY "members read" ON public.booking_profiles FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: brand_kits members read
CREATE POLICY "members read" ON public.brand_kits FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: calendar_accounts members read
CREATE POLICY "members read" ON public.calendar_accounts FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: calendar_lists members read
CREATE POLICY "members read" ON public.calendar_lists FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.calendar_accounts a
  WHERE ((a.id = calendar_lists.account_id) AND (a.workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))))));

-- policy: companies members read
CREATE POLICY "members read" ON public.companies FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: consents members read
CREATE POLICY "members read" ON public.consents FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: contact_events members read
CREATE POLICY "members read" ON public.contact_events FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: contacts members read
CREATE POLICY "members read" ON public.contacts FOR SELECT USING (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND (deleted_at IS NULL)));

-- policy: crm_owner_links members read
CREATE POLICY "members read" ON public.crm_owner_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: deliveries members read
CREATE POLICY "members read" ON public.deliveries FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: device_links members read
CREATE POLICY "members read" ON public.device_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: devices members read
CREATE POLICY "members read" ON public.devices FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: email_events members read
CREATE POLICY "members read" ON public.email_events FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: email_messages members read
CREATE POLICY "members read" ON public.email_messages FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: email_templates members read
CREATE POLICY "members read" ON public.email_templates FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: emails members read
CREATE POLICY "members read" ON public.emails FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: enrich_runs members read
CREATE POLICY "members read" ON public.enrich_runs FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: enrich_settings members read
CREATE POLICY "members read" ON public.enrich_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: enrich_sources members read
CREATE POLICY "members read" ON public.enrich_sources FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: enrich_usage members read
CREATE POLICY "members read" ON public.enrich_usage FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: env_secrets members read
CREATE POLICY "members read" ON public.env_secrets FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: events members read
CREATE POLICY "members read" ON public.events FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: explorations members read
CREATE POLICY "members read" ON public.explorations FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: field_history members read
CREATE POLICY "members read" ON public.field_history FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: field_order members read
CREATE POLICY "members read" ON public.field_order FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: field_settings members read
CREATE POLICY "members read" ON public.field_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: field_writes members read
CREATE POLICY "members read" ON public.field_writes FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: fields members read
CREATE POLICY "members read" ON public.fields FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_bookings members read
CREATE POLICY "members read" ON public.form_bookings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_chats members read
CREATE POLICY "members read" ON public.form_chats FOR SELECT USING (public.is_member(workspace_id));

-- policy: form_checks members read
CREATE POLICY "members read" ON public.form_checks FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_daily members read
CREATE POLICY "members read" ON public.form_daily FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_destinations members read
CREATE POLICY "members read" ON public.form_destinations FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_folders members read
CREATE POLICY "members read" ON public.form_folders FOR SELECT USING (public.is_member(workspace_id));

-- policy: form_submissions members read
CREATE POLICY "members read" ON public.form_submissions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: form_uploads members read
CREATE POLICY "members read" ON public.form_uploads FOR SELECT USING (public.is_member(workspace_id));

-- policy: form_versions members read
CREATE POLICY "members read" ON public.form_versions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: forms members read
CREATE POLICY "members read" ON public.forms FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: github_checks members read
CREATE POLICY "members read" ON public.github_checks FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: github_installations members read
CREATE POLICY "members read" ON public.github_installations FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: heals members read
CREATE POLICY "members read" ON public.heals FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: icp members read
CREATE POLICY "members read" ON public.icp FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: identifiers members read
CREATE POLICY "members read" ON public.identifiers FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: identity_evidence members read
CREATE POLICY "members read" ON public.identity_evidence FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: identity_settings members read
CREATE POLICY "members read" ON public.identity_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: imports members read
CREATE POLICY "members read" ON public.imports FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: inbox_messages members read
CREATE POLICY "members read" ON public.inbox_messages FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: intent_params members read
CREATE POLICY "members read" ON public.intent_params FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: invites members read
CREATE POLICY "members read" ON public.invites FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: lead_settings members read
CREATE POLICY "members read" ON public.lead_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: learned_networks members read
CREATE POLICY "members read" ON public.learned_networks FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: link_domains members read
CREATE POLICY "members read" ON public.link_domains FOR SELECT USING (public.is_member(workspace_id));

-- policy: mappings members read
CREATE POLICY "members read" ON public.mappings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: meeting_events members read
CREATE POLICY "members read" ON public.meeting_events FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meetings m
  WHERE ((m.id = meeting_events.meeting_id) AND (m.workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))))));

-- policy: meeting_links members read
CREATE POLICY "members read" ON public.meeting_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: meeting_mails members read
CREATE POLICY "members read" ON public.meeting_mails FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: meeting_types members read
CREATE POLICY "members read" ON public.meeting_types FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: meetings members read
CREATE POLICY "members read" ON public.meetings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: merge_proposals members read
CREATE POLICY "members read" ON public.merge_proposals FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: network_flags members read
CREATE POLICY "members read" ON public.network_flags FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: notes members read
CREATE POLICY "members read" ON public.notes FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: nurture_enrollments members read
CREATE POLICY "members read" ON public.nurture_enrollments FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: nurture_steps members read
CREATE POLICY "members read" ON public.nurture_steps FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: nurtures members read
CREATE POLICY "members read" ON public.nurtures FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: object_layouts members read
CREATE POLICY "members read" ON public.object_layouts FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: objects members read
CREATE POLICY "members read" ON public.objects FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: page_groups members read
CREATE POLICY "members read" ON public.page_groups FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: payment_accounts members read
CREATE POLICY "members read" ON public.payment_accounts FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: person_aliases members read
CREATE POLICY "members read" ON public.person_aliases FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: persons members read
CREATE POLICY "members read" ON public.persons FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: plan_usage members read
CREATE POLICY "members read" ON public.plan_usage FOR SELECT USING (public.is_member(workspace_id));

-- policy: plans members read
CREATE POLICY "members read" ON public.plans FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: poll_votes members read
CREATE POLICY "members read" ON public.poll_votes FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.meeting_links l
  WHERE ((l.id = poll_votes.link_id) AND (l.workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))))));

-- policy: qualify_settings members read
CREATE POLICY "members read" ON public.qualify_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: record_links members read
CREATE POLICY "members read" ON public.record_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: records members read
CREATE POLICY "members read" ON public.records FOR SELECT USING (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND (deleted_at IS NULL)));

-- policy: router_chats members read
CREATE POLICY "members read" ON public.router_chats FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: router_replays members read
CREATE POLICY "members read" ON public.router_replays FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: router_reps members read
CREATE POLICY "members read" ON public.router_reps FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: router_runs members read
CREATE POLICY "members read" ON public.router_runs FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: router_slas members read
CREATE POLICY "members read" ON public.router_slas FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: router_versions members read
CREATE POLICY "members read" ON public.router_versions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routers members read
CREATE POLICY "members read" ON public.routers FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_assignments members read
CREATE POLICY "members read" ON public.routing_assignments FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_policies members read
CREATE POLICY "members read" ON public.routing_policies FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_policy_versions members read
CREATE POLICY "members read" ON public.routing_policy_versions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_quota members read
CREATE POLICY "members read" ON public.routing_quota FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_reviews members read
CREATE POLICY "members read" ON public.routing_reviews FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_sources members read
CREATE POLICY "members read" ON public.routing_sources FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_team_keys members read
CREATE POLICY "members read" ON public.routing_team_keys FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_team_members members read
CREATE POLICY "members read" ON public.routing_team_members FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_teams members read
CREATE POLICY "members read" ON public.routing_teams FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: routing_test_evidence members read
CREATE POLICY "members read" ON public.routing_test_evidence FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: run_steps members read
CREATE POLICY "members read" ON public.run_steps FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: runs members read
CREATE POLICY "members read" ON public.runs FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: saved_views members read
CREATE POLICY "members read" ON public.saved_views FOR SELECT USING (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

-- policy: scheduler_links members read
CREATE POLICY "members read" ON public.scheduler_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: scoring_models members read
CREATE POLICY "members read" ON public.scoring_models FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: scoring_versions members read
CREATE POLICY "members read" ON public.scoring_versions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.scoring_models m
  WHERE ((m.id = scoring_versions.model_id) AND (m.workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))))));

-- policy: segment_members members read
CREATE POLICY "members read" ON public.segment_members FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: segments members read
CREATE POLICY "members read" ON public.segments FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: send_settings members read
CREATE POLICY "members read" ON public.send_settings FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: sending_domains members read
CREATE POLICY "members read" ON public.sending_domains FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: sessions members read
CREATE POLICY "members read" ON public.sessions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: signal_types members read
CREATE POLICY "members read" ON public.signal_types FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: signals members read
CREATE POLICY "members read" ON public.signals FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: site_daily members read
CREATE POLICY "members read" ON public.site_daily FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: sites members read
CREATE POLICY "members read" ON public.sites FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: source_links members read
CREATE POLICY "members read" ON public.source_links FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: source_runs members read
CREATE POLICY "members read" ON public.source_runs FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: sources members read
CREATE POLICY "members read" ON public.sources FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: submission_results members read
CREATE POLICY "members read" ON public.submission_results FOR SELECT USING (public.is_member(workspace_id));

-- policy: submissions members read
CREATE POLICY "members read" ON public.submissions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: subscriptions members read
CREATE POLICY "members read" ON public.subscriptions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: suite_connections members read
CREATE POLICY "members read" ON public.suite_connections FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: suppressions members read
CREATE POLICY "members read" ON public.suppressions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: sync_log members read
CREATE POLICY "members read" ON public.sync_log FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: tasks members read
CREATE POLICY "members read" ON public.tasks FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: test_proposals members read
CREATE POLICY "members read" ON public.test_proposals FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: test_versions members read
CREATE POLICY "members read" ON public.test_versions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: text_messages members read
CREATE POLICY "members read" ON public.text_messages FOR SELECT USING (public.is_member(workspace_id));

-- policy: topics members read
CREATE POLICY "members read" ON public.topics FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: tunnels members read
CREATE POLICY "members read" ON public.tunnels FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workflow_emails members read
CREATE POLICY "members read" ON public.workflow_emails FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.workflows w
  WHERE ((w.id = workflow_emails.workflow_id) AND (w.workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))))));

-- policy: workflow_folders members read
CREATE POLICY "members read" ON public.workflow_folders FOR SELECT USING (public.is_member(workspace_id));

-- policy: workflow_runs members read
CREATE POLICY "members read" ON public.workflow_runs FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workflow_steps_done members read
CREATE POLICY "members read" ON public.workflow_steps_done FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workflow_versions members read
CREATE POLICY "members read" ON public.workflow_versions FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workflows members read
CREATE POLICY "members read" ON public.workflows FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workspace_billing members read
CREATE POLICY "members read" ON public.workspace_billing FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workspace_members members read
CREATE POLICY "members read" ON public.workspace_members FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: workspaces members read
CREATE POLICY "members read" ON public.workspaces FOR SELECT USING ((id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: design_assets members read assets
CREATE POLICY "members read assets" ON public.design_assets FOR SELECT TO authenticated USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: email_versions members read email versions
CREATE POLICY "members read email versions" ON public.email_versions FOR SELECT TO authenticated USING ((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])));

-- policy: saved_views members remove
CREATE POLICY "members remove" ON public.saved_views FOR DELETE USING (((workspace_id = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[])) AND ((owner_id IS NULL) OR (owner_id = ( SELECT auth.uid() AS uid)))));

-- row security: merge_proposals
ALTER TABLE public.merge_proposals ENABLE ROW LEVEL SECURITY;

-- row security: network_flags
ALTER TABLE public.network_flags ENABLE ROW LEVEL SECURITY;

-- row security: notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- row security: nurture_enrollments
ALTER TABLE public.nurture_enrollments ENABLE ROW LEVEL SECURITY;

-- row security: nurture_marks
ALTER TABLE public.nurture_marks ENABLE ROW LEVEL SECURITY;

-- row security: nurture_steps
ALTER TABLE public.nurture_steps ENABLE ROW LEVEL SECURITY;

-- row security: nurtures
ALTER TABLE public.nurtures ENABLE ROW LEVEL SECURITY;

-- row security: oauth_codes
ALTER TABLE public.oauth_codes ENABLE ROW LEVEL SECURITY;

-- row security: object_layouts
ALTER TABLE public.object_layouts ENABLE ROW LEVEL SECURITY;

-- row security: objects
ALTER TABLE public.objects ENABLE ROW LEVEL SECURITY;

-- row security: opt_outs
ALTER TABLE public.opt_outs ENABLE ROW LEVEL SECURITY;

-- policy: mailboxes own read
CREATE POLICY "own read" ON public.mailboxes FOR SELECT USING (((user_id = auth.uid()) AND public.is_member(workspace_id)));

-- policy: ai_calls owners read
CREATE POLICY "owners read" ON public.ai_calls FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[])));

-- policy: audit_log owners read
CREATE POLICY "owners read" ON public.audit_log FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[])));

-- policy: privacy_exports owners read
CREATE POLICY "owners read" ON public.privacy_exports FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[])));

-- policy: privacy_requests owners read
CREATE POLICY "owners read" ON public.privacy_requests FOR SELECT USING ((workspace_id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[])));

-- policy: workspaces owners rename
CREATE POLICY "owners rename" ON public.workspaces FOR UPDATE USING ((id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[]))) WITH CHECK ((id = ANY (( SELECT public.my_owned_workspaces() AS my_owned_workspaces)::uuid[])));

-- row security: page_groups
ALTER TABLE public.page_groups ENABLE ROW LEVEL SECURITY;

-- row security: payment_accounts
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- row security: person_aliases
ALTER TABLE public.person_aliases ENABLE ROW LEVEL SECURITY;

-- row security: person_cache
ALTER TABLE public.person_cache ENABLE ROW LEVEL SECURITY;

-- row security: persons
ALTER TABLE public.persons ENABLE ROW LEVEL SECURITY;

-- row security: plan_usage
ALTER TABLE public.plan_usage ENABLE ROW LEVEL SECURITY;

-- row security: plans
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- row security: poll_votes
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- row security: privacy_exports
ALTER TABLE public.privacy_exports ENABLE ROW LEVEL SECURITY;

-- row security: privacy_requests
ALTER TABLE public.privacy_requests ENABLE ROW LEVEL SECURITY;

-- row security: projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- row security: qualify_settings
ALTER TABLE public.qualify_settings ENABLE ROW LEVEL SECURITY;

-- row security: record_links
ALTER TABLE public.record_links ENABLE ROW LEVEL SECURITY;

-- row security: records
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;

-- row security: router_alert_sent
ALTER TABLE public.router_alert_sent ENABLE ROW LEVEL SECURITY;

-- row security: router_chats
ALTER TABLE public.router_chats ENABLE ROW LEVEL SECURITY;

-- row security: router_replays
ALTER TABLE public.router_replays ENABLE ROW LEVEL SECURITY;

-- row security: router_reps
ALTER TABLE public.router_reps ENABLE ROW LEVEL SECURITY;

-- row security: router_runs
ALTER TABLE public.router_runs ENABLE ROW LEVEL SECURITY;

-- row security: router_secrets
ALTER TABLE public.router_secrets ENABLE ROW LEVEL SECURITY;

-- row security: router_slas
ALTER TABLE public.router_slas ENABLE ROW LEVEL SECURITY;

-- row security: router_versions
ALTER TABLE public.router_versions ENABLE ROW LEVEL SECURITY;

-- row security: routers
ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;

-- row security: routing_assignments
ALTER TABLE public.routing_assignments ENABLE ROW LEVEL SECURITY;

-- row security: routing_policies
ALTER TABLE public.routing_policies ENABLE ROW LEVEL SECURITY;

-- row security: routing_policy_versions
ALTER TABLE public.routing_policy_versions ENABLE ROW LEVEL SECURITY;

-- row security: routing_quota
ALTER TABLE public.routing_quota ENABLE ROW LEVEL SECURITY;

-- row security: routing_reviews
ALTER TABLE public.routing_reviews ENABLE ROW LEVEL SECURITY;

-- row security: routing_sources
ALTER TABLE public.routing_sources ENABLE ROW LEVEL SECURITY;

-- row security: routing_team_keys
ALTER TABLE public.routing_team_keys ENABLE ROW LEVEL SECURITY;

-- row security: routing_team_members
ALTER TABLE public.routing_team_members ENABLE ROW LEVEL SECURITY;

-- row security: routing_teams
ALTER TABLE public.routing_teams ENABLE ROW LEVEL SECURITY;

-- row security: routing_test_evidence
ALTER TABLE public.routing_test_evidence ENABLE ROW LEVEL SECURITY;

-- row security: run_steps
ALTER TABLE public.run_steps ENABLE ROW LEVEL SECURITY;

-- row security: runs
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;

-- row security: salts
ALTER TABLE public.salts ENABLE ROW LEVEL SECURITY;

-- row security: saved_views
ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

-- row security: scheduler_links
ALTER TABLE public.scheduler_links ENABLE ROW LEVEL SECURITY;

-- row security: schedules
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

-- row security: scoring_models
ALTER TABLE public.scoring_models ENABLE ROW LEVEL SECURITY;

-- row security: scoring_versions
ALTER TABLE public.scoring_versions ENABLE ROW LEVEL SECURITY;

-- row security: segment_members
ALTER TABLE public.segment_members ENABLE ROW LEVEL SECURITY;

-- row security: segments
ALTER TABLE public.segments ENABLE ROW LEVEL SECURITY;

-- row security: send_settings
ALTER TABLE public.send_settings ENABLE ROW LEVEL SECURITY;

-- row security: sending_domains
ALTER TABLE public.sending_domains ENABLE ROW LEVEL SECURITY;

-- row security: sessions
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- row security: signal_types
ALTER TABLE public.signal_types ENABLE ROW LEVEL SECURITY;

-- row security: signals
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;

-- row security: site_daily
ALTER TABLE public.site_daily ENABLE ROW LEVEL SECURITY;

-- row security: site_rolled
ALTER TABLE public.site_rolled ENABLE ROW LEVEL SECURITY;

-- row security: sites
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- row security: slack_installs
ALTER TABLE public.slack_installs ENABLE ROW LEVEL SECURITY;

-- row security: source_event_keys
ALTER TABLE public.source_event_keys ENABLE ROW LEVEL SECURITY;

-- row security: source_kinds
ALTER TABLE public.source_kinds ENABLE ROW LEVEL SECURITY;

-- row security: source_links
ALTER TABLE public.source_links ENABLE ROW LEVEL SECURITY;

-- row security: source_runs
ALTER TABLE public.source_runs ENABLE ROW LEVEL SECURITY;

-- row security: source_secrets
ALTER TABLE public.source_secrets ENABLE ROW LEVEL SECURITY;

-- row security: sources
ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

-- row security: submission_results
ALTER TABLE public.submission_results ENABLE ROW LEVEL SECURITY;

-- row security: submission_track
ALTER TABLE public.submission_track ENABLE ROW LEVEL SECURITY;

-- row security: submissions
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- row security: subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- row security: suite_connections
ALTER TABLE public.suite_connections ENABLE ROW LEVEL SECURITY;

-- row security: suppressions
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;

-- row security: sync_log
ALTER TABLE public.sync_log ENABLE ROW LEVEL SECURITY;

-- row security: tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- row security: test_proposals
ALTER TABLE public.test_proposals ENABLE ROW LEVEL SECURITY;

-- row security: test_versions
ALTER TABLE public.test_versions ENABLE ROW LEVEL SECURITY;

-- row security: tests
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

-- row security: text_messages
ALTER TABLE public.text_messages ENABLE ROW LEVEL SECURITY;

-- row security: text_optouts
ALTER TABLE public.text_optouts ENABLE ROW LEVEL SECURITY;

-- row security: topics
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

-- row security: tunnels
ALTER TABLE public.tunnels ENABLE ROW LEVEL SECURITY;

-- row security: webhook_deliveries
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- row security: webhook_endpoints
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

-- row security: workflow_emails
ALTER TABLE public.workflow_emails ENABLE ROW LEVEL SECURITY;

-- row security: workflow_folders
ALTER TABLE public.workflow_folders ENABLE ROW LEVEL SECURITY;

-- row security: workflow_marks
ALTER TABLE public.workflow_marks ENABLE ROW LEVEL SECURITY;

-- row security: workflow_runs
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- row security: workflow_steps_done
ALTER TABLE public.workflow_steps_done ENABLE ROW LEVEL SECURITY;

-- row security: workflow_versions
ALTER TABLE public.workflow_versions ENABLE ROW LEVEL SECURITY;

-- row security: workflow_watch
ALTER TABLE public.workflow_watch ENABLE ROW LEVEL SECURITY;

-- row security: workflows
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

-- row security: workspace_billing
ALTER TABLE public.workspace_billing ENABLE ROW LEVEL SECURITY;

-- row security: workspace_members
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- row security: workspaces
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- policy: objects members read import files
CREATE POLICY "members read import files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'imports'::text) AND (((storage.foldername(name))[1])::uuid = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))));

-- policy: objects members read run files
CREATE POLICY "members read run files" ON storage.objects FOR SELECT TO authenticated USING (((bucket_id = 'runs'::text) AND (((storage.foldername(name))[1])::uuid = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))));

-- policy: objects members upload import files
CREATE POLICY "members upload import files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (((bucket_id = 'imports'::text) AND (((storage.foldername(name))[1])::uuid = ANY (( SELECT public.my_workspaces() AS my_workspaces)::uuid[]))));

-- acl: FUNCTION pg_reload_conf()
GRANT ALL ON FUNCTION pg_catalog.pg_reload_conf() TO postgres WITH GRANT OPTION;

-- acl: FUNCTION activity_candidates(p_source uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.activity_candidates(p_source uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_candidates(p_source uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.activity_candidates(p_source uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.activity_candidates(p_source uuid, p_limit integer) TO service_role;

-- acl: FUNCTION activity_claim(p_source uuid, p_events jsonb)
REVOKE ALL ON FUNCTION public.activity_claim(p_source uuid, p_events jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_claim(p_source uuid, p_events jsonb) TO anon;
GRANT ALL ON FUNCTION public.activity_claim(p_source uuid, p_events jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.activity_claim(p_source uuid, p_events jsonb) TO service_role;

-- acl: FUNCTION activity_done(p_source uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.activity_done(p_source uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.activity_done(p_source uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.activity_done(p_source uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.activity_done(p_source uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION activity_kinds()
GRANT ALL ON FUNCTION public.activity_kinds() TO anon;
GRANT ALL ON FUNCTION public.activity_kinds() TO authenticated;
GRANT ALL ON FUNCTION public.activity_kinds() TO service_role;

-- acl: FUNCTION ai_cache_get(p_ws uuid, p_kind text, p_key text)
REVOKE ALL ON FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) TO anon;
GRANT ALL ON FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.ai_cache_get(p_ws uuid, p_kind text, p_key text) TO service_role;

-- acl: FUNCTION ai_cache_hit(p_ws uuid, p_kind text, p_key text)
REVOKE ALL ON FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) TO anon;
GRANT ALL ON FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.ai_cache_hit(p_ws uuid, p_kind text, p_key text) TO service_role;

-- acl: FUNCTION ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer)
REVOKE ALL ON FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) TO anon;
GRANT ALL ON FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) TO authenticated;
GRANT ALL ON FUNCTION public.ai_cache_put(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_in integer, p_out integer) TO service_role;

-- acl: FUNCTION ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean)
REVOKE ALL ON FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) TO anon;
GRANT ALL ON FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) TO authenticated;
GRANT ALL ON FUNCTION public.ai_cache_store(p_ws uuid, p_kind text, p_key text, p_output jsonb, p_model text, p_usage jsonb, p_cost numeric, p_keep boolean) TO service_role;

-- acl: FUNCTION ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean)
REVOKE ALL ON FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) TO anon;
GRANT ALL ON FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) TO authenticated;
GRANT ALL ON FUNCTION public.ai_call_log(p_ws uuid, p_kind text, p_model text, p_usage jsonb, p_cost numeric, p_cached boolean) TO service_role;

-- acl: FUNCTION ai_credit_give(p_ws uuid, p_n integer)
REVOKE ALL ON FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.ai_credit_give(p_ws uuid, p_n integer) TO service_role;

-- acl: FUNCTION ai_credit_take(p_ws uuid, p_n integer)
REVOKE ALL ON FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) TO anon;
GRANT ALL ON FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) TO authenticated;
GRANT ALL ON FUNCTION public.ai_credit_take(p_ws uuid, p_n integer) TO service_role;

-- acl: FUNCTION alerts_on(p_project uuid, p_kind text)
REVOKE ALL ON FUNCTION public.alerts_on(p_project uuid, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.alerts_on(p_project uuid, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.alerts_on(p_project uuid, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.alerts_on(p_project uuid, p_kind text) TO service_role;

-- acl: FUNCTION alerts_send()
REVOKE ALL ON FUNCTION public.alerts_send() FROM PUBLIC;
GRANT ALL ON FUNCTION public.alerts_send() TO anon;
GRANT ALL ON FUNCTION public.alerts_send() TO authenticated;
GRANT ALL ON FUNCTION public.alerts_send() TO service_role;

-- acl: FUNCTION api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text)
REVOKE ALL ON FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) TO anon;
GRANT ALL ON FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) TO authenticated;
GRANT ALL ON FUNCTION public.api_hook_add(p_ws uuid, p_key uuid, p_via text, p_host text, p_sealed text, p_hint text, p_events text[], p_forms uuid[], p_description text) TO service_role;

-- acl: FUNCTION api_hook_remove(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.api_hook_remove(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION api_key_auth(p_hash text)
REVOKE ALL ON FUNCTION public.api_key_auth(p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_key_auth(p_hash text) TO anon;
GRANT ALL ON FUNCTION public.api_key_auth(p_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.api_key_auth(p_hash text) TO service_role;

-- acl: FUNCTION api_keys_revoked()
REVOKE ALL ON FUNCTION public.api_keys_revoked() FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_keys_revoked() TO anon;
GRANT ALL ON FUNCTION public.api_keys_revoked() TO authenticated;
GRANT ALL ON FUNCTION public.api_keys_revoked() TO service_role;

-- acl: FUNCTION api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer)
REVOKE ALL ON FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.api_recent(p_ws uuid, p_event text, p_form uuid, p_email text, p_limit integer) TO service_role;

-- acl: FUNCTION api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[])
REVOKE ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) TO anon;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[]) TO service_role;

-- acl: FUNCTION api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text)
REVOKE ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) TO anon;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) TO authenticated;
GRANT ALL ON FUNCTION public.api_start_runs(p_key uuid, p_project uuid, p_env uuid, p_tests uuid[], p_trigger text, p_base_url text) TO service_role;

-- acl: FUNCTION api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid)
REVOKE ALL ON FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.api_workflow_enter(p_ws uuid, p_workflow uuid, p_contact uuid) TO service_role;

-- acl: FUNCTION app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone)
REVOKE ALL ON FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.app_counts(p_ws uuid, p_day_from timestamp with time zone, p_day_to timestamp with time zone) TO service_role;

-- acl: FUNCTION app_start(p_ws uuid)
REVOKE ALL ON FUNCTION public.app_start(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.app_start(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.app_start(p_ws uuid) TO service_role;

-- acl: FUNCTION availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb)
REVOKE ALL ON FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) TO anon;
GRANT ALL ON FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.availability_save(p_ws uuid, p_user uuid, p_tz text, p_weekly jsonb, p_overrides jsonb) TO service_role;

-- acl: FUNCTION billing_plan_changed()
REVOKE ALL ON FUNCTION public.billing_plan_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.billing_plan_changed() TO anon;
GRANT ALL ON FUNCTION public.billing_plan_changed() TO authenticated;
GRANT ALL ON FUNCTION public.billing_plan_changed() TO service_role;

-- acl: FUNCTION blocks_touch()
REVOKE ALL ON FUNCTION public.blocks_touch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.blocks_touch() TO anon;
GRANT ALL ON FUNCTION public.blocks_touch() TO authenticated;
GRANT ALL ON FUNCTION public.blocks_touch() TO service_role;

-- acl: FUNCTION book_contact(p_ws uuid, p_email text)
REVOKE ALL ON FUNCTION public.book_contact(p_ws uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_contact(p_ws uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.book_contact(p_ws uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.book_contact(p_ws uuid, p_email text) TO service_role;

-- acl: FUNCTION book_kit(p_ws uuid, p_form uuid)
REVOKE ALL ON FUNCTION public.book_kit(p_ws uuid, p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_kit(p_ws uuid, p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.book_kit(p_ws uuid, p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_kit(p_ws uuid, p_form uuid) TO service_role;

-- acl: FUNCTION book_link(p_hash text, p_id uuid)
REVOKE ALL ON FUNCTION public.book_link(p_hash text, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_link(p_hash text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.book_link(p_hash text, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_link(p_hash text, p_id uuid) TO service_role;

-- acl: FUNCTION book_meeting(p_hash text, p_id uuid)
REVOKE ALL ON FUNCTION public.book_meeting(p_hash text, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_meeting(p_hash text, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.book_meeting(p_hash text, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_meeting(p_hash text, p_id uuid) TO service_role;

-- acl: FUNCTION book_page(p_ws text, p_slug text, p_form uuid, p_handle text)
REVOKE ALL ON FUNCTION public.book_page(p_ws text, p_slug text, p_form uuid, p_handle text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_page(p_ws text, p_slug text, p_form uuid, p_handle text) TO anon;
GRANT ALL ON FUNCTION public.book_page(p_ws text, p_slug text, p_form uuid, p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.book_page(p_ws text, p_slug text, p_form uuid, p_handle text) TO service_role;

-- acl: FUNCTION book_profiles(p_ws uuid, p_users uuid[])
REVOKE ALL ON FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) TO anon;
GRANT ALL ON FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.book_profiles(p_ws uuid, p_users uuid[]) TO service_role;

-- acl: FUNCTION book_target(p_ws text, p_slug text, p_form uuid)
REVOKE ALL ON FUNCTION public.book_target(p_ws text, p_slug text, p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_target(p_ws text, p_slug text, p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.book_target(p_ws text, p_slug text, p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_target(p_ws text, p_slug text, p_form uuid) TO service_role;

-- acl: FUNCTION book_turnstile(p_ws uuid)
REVOKE ALL ON FUNCTION public.book_turnstile(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_turnstile(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.book_turnstile(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_turnstile(p_ws uuid) TO service_role;

-- acl: FUNCTION book_ws(p_ws uuid)
REVOKE ALL ON FUNCTION public.book_ws(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.book_ws(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.book_ws(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.book_ws(p_ws uuid) TO service_role;

-- acl: FUNCTION booking_handle_free(p_handle text, p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.booking_handle_free(p_handle text, p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION booking_handle_set(p_ws uuid, p_user uuid, p_handle text)
REVOKE ALL ON FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) TO anon;
GRANT ALL ON FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.booking_handle_set(p_ws uuid, p_user uuid, p_handle text) TO service_role;

-- acl: FUNCTION booking_look(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.booking_look(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_look(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.booking_look(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.booking_look(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION booking_look_save(p_ws uuid, p_user uuid, p_look jsonb)
REVOKE ALL ON FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) TO anon;
GRANT ALL ON FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.booking_look_save(p_ws uuid, p_user uuid, p_look jsonb) TO service_role;

-- acl: FUNCTION booking_page_info(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.booking_page_info(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text)
REVOKE ALL ON FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) TO anon;
GRANT ALL ON FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) TO authenticated;
GRANT ALL ON FUNCTION public.booking_profile_save(p_ws uuid, p_user uuid, p_slug text, p_name text, p_headline text, p_photo text) TO service_role;

-- acl: FUNCTION booking_record(p_source uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.booking_record(p_source uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_record(p_source uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.booking_record(p_source uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.booking_record(p_source uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION booking_reserved(p_handle text)
GRANT ALL ON FUNCTION public.booking_reserved(p_handle text) TO anon;
GRANT ALL ON FUNCTION public.booking_reserved(p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.booking_reserved(p_handle text) TO service_role;

-- acl: FUNCTION booking_resolve(p_handle text)
REVOKE ALL ON FUNCTION public.booking_resolve(p_handle text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_resolve(p_handle text) TO anon;
GRANT ALL ON FUNCTION public.booking_resolve(p_handle text) TO authenticated;
GRANT ALL ON FUNCTION public.booking_resolve(p_handle text) TO service_role;

-- acl: FUNCTION booking_slug_ensure(p_ws uuid)
REVOKE ALL ON FUNCTION public.booking_slug_ensure(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.booking_slug_ensure(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.booking_slug_ensure(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.booking_slug_ensure(p_ws uuid) TO service_role;

-- acl: FUNCTION brand_kit_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.brand_kit_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_kit_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.brand_kit_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.brand_kit_delete(p_id uuid) TO service_role;

-- acl: FUNCTION brand_kit_design_publish(p_id uuid)
REVOKE ALL ON FUNCTION public.brand_kit_design_publish(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_kit_design_publish(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.brand_kit_design_publish(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.brand_kit_design_publish(p_id uuid) TO service_role;

-- acl: FUNCTION brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer)
REVOKE ALL ON FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) TO anon;
GRANT ALL ON FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) TO authenticated;
GRANT ALL ON FUNCTION public.brand_kit_design_save(p_user uuid, p_id uuid, p_design jsonb, p_rev integer) TO service_role;

-- acl: FUNCTION brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text)
REVOKE ALL ON FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) TO anon;
GRANT ALL ON FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) TO authenticated;
GRANT ALL ON FUNCTION public.brand_kit_quick(p_kit uuid, p_tokens jsonb, p_logo_url text) TO service_role;

-- acl: FUNCTION brand_kit_skin(p_kit uuid, p_skin jsonb)
REVOKE ALL ON FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) TO anon;
GRANT ALL ON FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.brand_kit_skin(p_kit uuid, p_skin jsonb) TO service_role;

-- acl: FUNCTION brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text)
REVOKE ALL ON FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) TO anon;
GRANT ALL ON FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) TO authenticated;
GRANT ALL ON FUNCTION public.brand_scan_design(p_kit uuid, p_vars jsonb, p_heading text, p_social jsonb, p_address text, p_brief text) TO service_role;

-- acl: FUNCTION brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text)
REVOKE ALL ON FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) TO anon;
GRANT ALL ON FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.brand_scan_finish(p_kit uuid, p_tokens jsonb, p_logo_url text, p_notes text[], p_site_forms jsonb, p_error text) TO service_role;

-- acl: FUNCTION brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid)
REVOKE ALL ON FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.brand_scan_start(p_user uuid, p_ws uuid, p_url text, p_kit uuid, p_form uuid) TO service_role;

-- acl: FUNCTION busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb)
REVOKE ALL ON FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.busy_replace(p_account uuid, p_calendar text, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO service_role;

-- acl: FUNCTION calendar_account(p_account uuid)
REVOKE ALL ON FUNCTION public.calendar_account(p_account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_account(p_account uuid) TO anon;
GRANT ALL ON FUNCTION public.calendar_account(p_account uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_account(p_account uuid) TO service_role;

-- acl: FUNCTION calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb)
REVOKE ALL ON FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_busy_save(p_account uuid, p_from timestamp with time zone, p_to timestamp with time zone, p_rows jsonb) TO service_role;

-- acl: FUNCTION calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone)
REVOKE ALL ON FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_channels_save(p_account uuid, p_channels jsonb, p_watch_due timestamp with time zone) TO service_role;

-- acl: FUNCTION calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb)
REVOKE ALL ON FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb) TO anon;
GRANT ALL ON FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text, p_calendars jsonb) TO service_role;

-- acl: FUNCTION calendar_disconnect(p_account uuid)
REVOKE ALL ON FUNCTION public.calendar_disconnect(p_account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_disconnect(p_account uuid) TO anon;
GRANT ALL ON FUNCTION public.calendar_disconnect(p_account uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_disconnect(p_account uuid) TO service_role;

-- acl: FUNCTION calendar_hook(p_account uuid, p_channel text)
REVOKE ALL ON FUNCTION public.calendar_hook(p_account uuid, p_channel text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_hook(p_account uuid, p_channel text) TO anon;
GRANT ALL ON FUNCTION public.calendar_hook(p_account uuid, p_channel text) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_hook(p_account uuid, p_channel text) TO service_role;

-- acl: FUNCTION calendar_lists_save(p_account uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_lists_save(p_account uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION calendar_lists_sync(p_account uuid, p_calendars jsonb)
REVOKE ALL ON FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) TO anon;
GRANT ALL ON FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_lists_sync(p_account uuid, p_calendars jsonb) TO service_role;

-- acl: FUNCTION calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone)
REVOKE ALL ON FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_live_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone) TO service_role;

-- acl: FUNCTION calendar_reconnect(p_account uuid, p_reason text)
REVOKE ALL ON FUNCTION public.calendar_reconnect(p_account uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_reconnect(p_account uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.calendar_reconnect(p_account uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_reconnect(p_account uuid, p_reason text) TO service_role;

-- acl: FUNCTION calendar_reconnect_info(p_account uuid)
REVOKE ALL ON FUNCTION public.calendar_reconnect_info(p_account uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_reconnect_info(p_account uuid) TO anon;
GRANT ALL ON FUNCTION public.calendar_reconnect_info(p_account uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_reconnect_info(p_account uuid) TO service_role;

-- acl: FUNCTION calendar_token_save(p_account uuid, p_sealed text)
REVOKE ALL ON FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_token_save(p_account uuid, p_sealed text) TO service_role;

-- acl: FUNCTION calendars_due()
REVOKE ALL ON FUNCTION public.calendars_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendars_due() TO anon;
GRANT ALL ON FUNCTION public.calendars_due() TO authenticated;
GRANT ALL ON FUNCTION public.calendars_due() TO service_role;

-- acl: FUNCTION cancel_invite(p_id uuid)
REVOKE ALL ON FUNCTION public.cancel_invite(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancel_invite(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.cancel_invite(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.cancel_invite(p_id uuid) TO service_role;

-- acl: TABLE explorations
GRANT ALL ON TABLE public.explorations TO anon;
GRANT ALL ON TABLE public.explorations TO authenticated;
GRANT ALL ON TABLE public.explorations TO service_role;

-- acl: FUNCTION claim_exploration(p_worker text)
REVOKE ALL ON FUNCTION public.claim_exploration(p_worker text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_exploration(p_worker text) TO anon;
GRANT ALL ON FUNCTION public.claim_exploration(p_worker text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_exploration(p_worker text) TO service_role;

-- acl: TABLE jobs
GRANT ALL ON TABLE public.jobs TO anon;
GRANT ALL ON TABLE public.jobs TO authenticated;
GRANT ALL ON TABLE public.jobs TO service_role;

-- acl: FUNCTION claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer)
REVOKE ALL ON FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.claim_job(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer) TO service_role;

-- acl: FUNCTION claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer)
REVOKE ALL ON FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer) TO anon;
GRANT ALL ON FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer) TO authenticated;
GRANT ALL ON FUNCTION public.claim_job_lane(p_kinds text[], p_worker text, p_lease_s integer, p_limit integer, p_max_priority integer) TO service_role;

-- acl: TABLE plans
GRANT ALL ON TABLE public.plans TO anon;
GRANT ALL ON TABLE public.plans TO authenticated;
GRANT ALL ON TABLE public.plans TO service_role;

-- acl: FUNCTION claim_plan(p_worker text)
REVOKE ALL ON FUNCTION public.claim_plan(p_worker text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_plan(p_worker text) TO anon;
GRANT ALL ON FUNCTION public.claim_plan(p_worker text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_plan(p_worker text) TO service_role;

-- acl: TABLE runs
GRANT ALL ON TABLE public.runs TO anon;
GRANT ALL ON TABLE public.runs TO authenticated;
GRANT ALL ON TABLE public.runs TO service_role;

-- acl: FUNCTION claim_run(p_worker text)
REVOKE ALL ON FUNCTION public.claim_run(p_worker text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.claim_run(p_worker text) TO anon;
GRANT ALL ON FUNCTION public.claim_run(p_worker text) TO authenticated;
GRANT ALL ON FUNCTION public.claim_run(p_worker text) TO service_role;

-- acl: FUNCTION companies_follow_account()
REVOKE ALL ON FUNCTION public.companies_follow_account() FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_follow_account() TO anon;
GRANT ALL ON FUNCTION public.companies_follow_account() TO authenticated;
GRANT ALL ON FUNCTION public.companies_follow_account() TO service_role;

-- acl: FUNCTION companies_upsert(p_ws uuid, p_source text, p_rows jsonb)
REVOKE ALL ON FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.companies_upsert(p_ws uuid, p_source text, p_rows jsonb) TO service_role;

-- acl: FUNCTION complaints_check(p_ws uuid)
REVOKE ALL ON FUNCTION public.complaints_check(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.complaints_check(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.complaints_check(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.complaints_check(p_ws uuid) TO service_role;

-- acl: FUNCTION contact_events_roll()
REVOKE ALL ON FUNCTION public.contact_events_roll() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_events_roll() TO anon;
GRANT ALL ON FUNCTION public.contact_events_roll() TO authenticated;
GRANT ALL ON FUNCTION public.contact_events_roll() TO service_role;

-- acl: FUNCTION contact_events_webhooks()
REVOKE ALL ON FUNCTION public.contact_events_webhooks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_events_webhooks() TO anon;
GRANT ALL ON FUNCTION public.contact_events_webhooks() TO authenticated;
GRANT ALL ON FUNCTION public.contact_events_webhooks() TO service_role;

-- acl: FUNCTION contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb)
REVOKE ALL ON FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) TO anon;
GRANT ALL ON FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) TO service_role;

-- acl: FUNCTION contact_ids_by_email(p_ws uuid, p_emails text[])
REVOKE ALL ON FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) TO anon;
GRANT ALL ON FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) TO authenticated;
GRANT ALL ON FUNCTION public.contact_ids_by_email(p_ws uuid, p_emails text[]) TO service_role;

-- acl: FUNCTION contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid)
REVOKE ALL ON FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.contact_update(p_id uuid, p_source text, p_values jsonb, p_by uuid) TO service_role;

-- acl: TABLE contacts
GRANT ALL ON TABLE public.contacts TO anon;
GRANT ALL ON TABLE public.contacts TO authenticated;
GRANT ALL ON TABLE public.contacts TO service_role;

-- acl: FUNCTION contact_vals(c public.contacts)
REVOKE ALL ON FUNCTION public.contact_vals(c public.contacts) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contact_vals(c public.contacts) TO anon;
GRANT ALL ON FUNCTION public.contact_vals(c public.contacts) TO authenticated;
GRANT ALL ON FUNCTION public.contact_vals(c public.contacts) TO service_role;

-- acl: FUNCTION contacts_band_event()
REVOKE ALL ON FUNCTION public.contacts_band_event() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_band_event() TO anon;
GRANT ALL ON FUNCTION public.contacts_band_event() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_band_event() TO service_role;

-- acl: FUNCTION contacts_crm_owner()
GRANT ALL ON FUNCTION public.contacts_crm_owner() TO anon;
GRANT ALL ON FUNCTION public.contacts_crm_owner() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_crm_owner() TO service_role;

-- acl: FUNCTION contacts_delete(p_ws uuid, p_ids uuid[])
REVOKE ALL ON FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.contacts_delete(p_ws uuid, p_ids uuid[]) TO service_role;

-- acl: FUNCTION contacts_enrich_new()
REVOKE ALL ON FUNCTION public.contacts_enrich_new() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_enrich_new() TO anon;
GRANT ALL ON FUNCTION public.contacts_enrich_new() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_enrich_new() TO service_role;

-- acl: FUNCTION contacts_follow_identifier()
REVOKE ALL ON FUNCTION public.contacts_follow_identifier() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_follow_identifier() TO anon;
GRANT ALL ON FUNCTION public.contacts_follow_identifier() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_follow_identifier() TO service_role;

-- acl: FUNCTION contacts_follow_merge()
REVOKE ALL ON FUNCTION public.contacts_follow_merge() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_follow_merge() TO anon;
GRANT ALL ON FUNCTION public.contacts_follow_merge() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_follow_merge() TO service_role;

-- acl: FUNCTION contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer)
REVOKE ALL ON FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.contacts_list(p_ws uuid, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO service_role;

-- acl: FUNCTION contacts_owner_crm_set(p_ws uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.contacts_owner_crm_set(p_ws uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION contacts_owner_meeting_task()
GRANT ALL ON FUNCTION public.contacts_owner_meeting_task() TO anon;
GRANT ALL ON FUNCTION public.contacts_owner_meeting_task() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_owner_meeting_task() TO service_role;

-- acl: FUNCTION contacts_score_touch()
REVOKE ALL ON FUNCTION public.contacts_score_touch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_score_touch() TO anon;
GRANT ALL ON FUNCTION public.contacts_score_touch() TO authenticated;
GRANT ALL ON FUNCTION public.contacts_score_touch() TO service_role;

-- acl: FUNCTION contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid)
REVOKE ALL ON FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO anon;
GRANT ALL ON FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO authenticated;
GRANT ALL ON FUNCTION public.contacts_upsert(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO service_role;

-- acl: FUNCTION contacts_where(p_ws uuid, p_filters jsonb)
REVOKE ALL ON FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) TO anon;
GRANT ALL ON FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.contacts_where(p_ws uuid, p_filters jsonb) TO service_role;

-- acl: FUNCTION create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text)
REVOKE ALL ON FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) TO anon;
GRANT ALL ON FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.create_api_key(p_workspace uuid, p_name text, p_prefix text, p_hash text) TO service_role;

-- acl: FUNCTION crm_seed(p_ws uuid)
REVOKE ALL ON FUNCTION public.crm_seed(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.crm_seed(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.crm_seed(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.crm_seed(p_ws uuid) TO service_role;

-- acl: FUNCTION decide_heal(p_heal uuid, p_status text)
REVOKE ALL ON FUNCTION public.decide_heal(p_heal uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.decide_heal(p_heal uuid, p_status text) TO anon;
GRANT ALL ON FUNCTION public.decide_heal(p_heal uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.decide_heal(p_heal uuid, p_status text) TO service_role;

-- acl: FUNCTION deliveries_create_anyway(p_ids uuid[])
REVOKE ALL ON FUNCTION public.deliveries_create_anyway(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deliveries_create_anyway(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.deliveries_create_anyway(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.deliveries_create_anyway(p_ids uuid[]) TO service_role;

-- acl: FUNCTION deliveries_held(p_destination uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.deliveries_held(p_destination uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deliveries_held(p_destination uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.deliveries_held(p_destination uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.deliveries_held(p_destination uuid, p_limit integer) TO service_role;

-- acl: FUNCTION deliveries_replay(p_ids uuid[])
REVOKE ALL ON FUNCTION public.deliveries_replay(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.deliveries_replay(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.deliveries_replay(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.deliveries_replay(p_ids uuid[]) TO service_role;

-- acl: FUNCTION deliveries_sweep()
REVOKE ALL ON FUNCTION public.deliveries_sweep() FROM PUBLIC;
GRANT ALL ON FUNCTION public.deliveries_sweep() TO anon;
GRANT ALL ON FUNCTION public.deliveries_sweep() TO authenticated;
GRANT ALL ON FUNCTION public.deliveries_sweep() TO service_role;

-- acl: FUNCTION delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text)
REVOKE ALL ON FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.delivery_finish(p_id uuid, p_status text, p_external_id text, p_external_url text, p_error text) TO service_role;

-- acl: FUNCTION delivery_take(p_id uuid, p_lease_s integer)
REVOKE ALL ON FUNCTION public.delivery_take(p_id uuid, p_lease_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delivery_take(p_id uuid, p_lease_s integer) TO anon;
GRANT ALL ON FUNCTION public.delivery_take(p_id uuid, p_lease_s integer) TO authenticated;
GRANT ALL ON FUNCTION public.delivery_take(p_id uuid, p_lease_s integer) TO service_role;

-- acl: FUNCTION design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer)
REVOKE ALL ON FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) TO anon;
GRANT ALL ON FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION public.design_asset_add(p_ws uuid, p_user uuid, p_path text, p_url text, p_name text, p_type text, p_width integer, p_height integer, p_bytes integer) TO service_role;

-- acl: FUNCTION design_asset_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.design_asset_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.design_asset_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.design_asset_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.design_asset_delete(p_id uuid) TO service_role;

-- acl: FUNCTION domain_checks_due()
REVOKE ALL ON FUNCTION public.domain_checks_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.domain_checks_due() TO anon;
GRANT ALL ON FUNCTION public.domain_checks_due() TO authenticated;
GRANT ALL ON FUNCTION public.domain_checks_due() TO service_role;

-- acl: FUNCTION drop_old_event_partitions(p_keep_days integer)
REVOKE ALL ON FUNCTION public.drop_old_event_partitions(p_keep_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.drop_old_event_partitions(p_keep_days integer) TO anon;
GRANT ALL ON FUNCTION public.drop_old_event_partitions(p_keep_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.drop_old_event_partitions(p_keep_days integer) TO service_role;

-- acl: FUNCTION email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb)
REVOKE ALL ON FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb) TO anon;
GRANT ALL ON FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.email_click(p_message uuid, p_link integer, p_human boolean, p_data jsonb) TO service_role;

-- acl: FUNCTION email_create(p_ws uuid, p_user uuid, p_values jsonb)
REVOKE ALL ON FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) TO anon;
GRANT ALL ON FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.email_create(p_ws uuid, p_user uuid, p_values jsonb) TO service_role;

-- acl: FUNCTION email_event_apply(p_event jsonb)
REVOKE ALL ON FUNCTION public.email_event_apply(p_event jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_event_apply(p_event jsonb) TO anon;
GRANT ALL ON FUNCTION public.email_event_apply(p_event jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.email_event_apply(p_event jsonb) TO service_role;

-- acl: FUNCTION email_guard(p_message uuid, p_now timestamp with time zone)
REVOKE ALL ON FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.email_guard(p_message uuid, p_now timestamp with time zone) TO service_role;

-- acl: FUNCTION email_hash(p text)
GRANT ALL ON FUNCTION public.email_hash(p text) TO anon;
GRANT ALL ON FUNCTION public.email_hash(p text) TO authenticated;
GRANT ALL ON FUNCTION public.email_hash(p text) TO service_role;

-- acl: FUNCTION email_queue_test(p_email uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.email_queue_test(p_email uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_queue_test(p_email uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.email_queue_test(p_email uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.email_queue_test(p_email uuid, p_user uuid) TO service_role;

-- acl: FUNCTION email_queue_to(p_email uuid, p_to text[])
REVOKE ALL ON FUNCTION public.email_queue_to(p_email uuid, p_to text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_queue_to(p_email uuid, p_to text[]) TO anon;
GRANT ALL ON FUNCTION public.email_queue_to(p_email uuid, p_to text[]) TO authenticated;
GRANT ALL ON FUNCTION public.email_queue_to(p_email uuid, p_to text[]) TO service_role;

-- acl: FUNCTION email_template_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.email_template_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_template_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.email_template_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.email_template_delete(p_id uuid) TO service_role;

-- acl: FUNCTION email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb)
REVOKE ALL ON FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) TO service_role;

-- acl: FUNCTION email_test_ready(p_ws uuid)
REVOKE ALL ON FUNCTION public.email_test_ready(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_test_ready(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.email_test_ready(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.email_test_ready(p_ws uuid) TO service_role;

-- acl: FUNCTION email_unsubscribe(p_message uuid, p_scope text)
REVOKE ALL ON FUNCTION public.email_unsubscribe(p_message uuid, p_scope text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_unsubscribe(p_message uuid, p_scope text) TO anon;
GRANT ALL ON FUNCTION public.email_unsubscribe(p_message uuid, p_scope text) TO authenticated;
GRANT ALL ON FUNCTION public.email_unsubscribe(p_message uuid, p_scope text) TO service_role;

-- acl: FUNCTION email_unsubscribe_info(p_message uuid)
REVOKE ALL ON FUNCTION public.email_unsubscribe_info(p_message uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_unsubscribe_info(p_message uuid) TO anon;
GRANT ALL ON FUNCTION public.email_unsubscribe_info(p_message uuid) TO authenticated;
GRANT ALL ON FUNCTION public.email_unsubscribe_info(p_message uuid) TO service_role;

-- acl: FUNCTION email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean)
REVOKE ALL ON FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) TO anon;
GRANT ALL ON FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) TO authenticated;
GRANT ALL ON FUNCTION public.email_version_add(p_ws uuid, p_user uuid, p_ref text, p_doc jsonb, p_subject text, p_note text, p_ai boolean) TO service_role;

-- acl: FUNCTION enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer)
REVOKE ALL ON FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer) TO anon;
GRANT ALL ON FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_job(p_workspace uuid, p_kind text, p_key text, p_payload jsonb, p_delay_s integer, p_max_attempts integer) TO service_role;

-- acl: FUNCTION enqueue_jobs(p_jobs jsonb)
REVOKE ALL ON FUNCTION public.enqueue_jobs(p_jobs jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_jobs jsonb) TO anon;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_jobs jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_jobs jsonb) TO service_role;

-- acl: FUNCTION enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer)
REVOKE ALL ON FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer) TO anon;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer) TO authenticated;
GRANT ALL ON FUNCTION public.enqueue_jobs(p_workspace uuid, p_kind text, p_jobs jsonb, p_max_attempts integer) TO service_role;

-- acl: FUNCTION enrich_backfill_where(p_ws uuid, p_filter jsonb)
REVOKE ALL ON FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) TO anon;
GRANT ALL ON FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.enrich_backfill_where(p_ws uuid, p_filter jsonb) TO service_role;

-- acl: FUNCTION enrich_cap(p_ws uuid)
REVOKE ALL ON FUNCTION public.enrich_cap(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enrich_cap(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.enrich_cap(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.enrich_cap(p_ws uuid) TO service_role;

-- acl: FUNCTION enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean)
REVOKE ALL ON FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean) TO anon;
GRANT ALL ON FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean) TO authenticated;
GRANT ALL ON FUNCTION public.enrich_write_company(p_ws uuid, p_source text, p_company jsonb, p_create boolean) TO service_role;

-- acl: FUNCTION ensure_workspace()
REVOKE ALL ON FUNCTION public.ensure_workspace() FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_workspace() TO anon;
GRANT ALL ON FUNCTION public.ensure_workspace() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_workspace() TO service_role;

-- acl: FUNCTION environment_workspace()
REVOKE ALL ON FUNCTION public.environment_workspace() FROM PUBLIC;
GRANT ALL ON FUNCTION public.environment_workspace() TO anon;
GRANT ALL ON FUNCTION public.environment_workspace() TO authenticated;
GRANT ALL ON FUNCTION public.environment_workspace() TO service_role;

-- acl: FUNCTION events_ingest(p_source uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.events_ingest(p_source uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text)
GRANT ALL ON FUNCTION public.evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text) TO anon;
GRANT ALL ON FUNCTION public.evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text) TO authenticated;
GRANT ALL ON FUNCTION public.evidence_names(e_identifiers jsonb, i_kind text, i_clean text, i_raw text) TO service_role;

-- acl: FUNCTION explorations_wake()
REVOKE ALL ON FUNCTION public.explorations_wake() FROM PUBLIC;
GRANT ALL ON FUNCTION public.explorations_wake() TO anon;
GRANT ALL ON FUNCTION public.explorations_wake() TO authenticated;
GRANT ALL ON FUNCTION public.explorations_wake() TO service_role;

-- acl: FUNCTION extend_job(p_id uuid, p_worker text, p_lease_s integer)
REVOKE ALL ON FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer) TO anon;
GRANT ALL ON FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer) TO authenticated;
GRANT ALL ON FUNCTION public.extend_job(p_id uuid, p_worker text, p_lease_s integer) TO service_role;

-- acl: FUNCTION field_classes(p_ws uuid, p_object text)
REVOKE ALL ON FUNCTION public.field_classes(p_ws uuid, p_object text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.field_classes(p_ws uuid, p_object text) TO anon;
GRANT ALL ON FUNCTION public.field_classes(p_ws uuid, p_object text) TO authenticated;
GRANT ALL ON FUNCTION public.field_classes(p_ws uuid, p_object text) TO service_role;

-- acl: FUNCTION field_history_event()
REVOKE ALL ON FUNCTION public.field_history_event() FROM PUBLIC;
GRANT ALL ON FUNCTION public.field_history_event() TO anon;
GRANT ALL ON FUNCTION public.field_history_event() TO authenticated;
GRANT ALL ON FUNCTION public.field_history_event() TO service_role;

-- acl: FUNCTION field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb)
REVOKE ALL ON FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) TO anon;
GRANT ALL ON FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.field_value(p_ws uuid, p_type text, p_options jsonb, p_label text, p_value jsonb) TO service_role;

-- acl: FUNCTION fill_query(p_q text)
REVOKE ALL ON FUNCTION public.fill_query(p_q text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.fill_query(p_q text) TO anon;
GRANT ALL ON FUNCTION public.fill_query(p_q text) TO authenticated;
GRANT ALL ON FUNCTION public.fill_query(p_q text) TO service_role;

-- acl: FUNCTION finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer)
REVOKE ALL ON FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer) TO anon;
GRANT ALL ON FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer) TO authenticated;
GRANT ALL ON FUNCTION public.finish_job(p_id uuid, p_worker text, p_ok boolean, p_error text, p_retry_s integer) TO service_role;

-- acl: FUNCTION fire_due_schedules()
REVOKE ALL ON FUNCTION public.fire_due_schedules() FROM PUBLIC;
GRANT ALL ON FUNCTION public.fire_due_schedules() TO anon;
GRANT ALL ON FUNCTION public.fire_due_schedules() TO authenticated;
GRANT ALL ON FUNCTION public.fire_due_schedules() TO service_role;

-- acl: FUNCTION first_touch_fill(p_older interval)
REVOKE ALL ON FUNCTION public.first_touch_fill(p_older interval) FROM PUBLIC;
GRANT ALL ON FUNCTION public.first_touch_fill(p_older interval) TO anon;
GRANT ALL ON FUNCTION public.first_touch_fill(p_older interval) TO authenticated;
GRANT ALL ON FUNCTION public.first_touch_fill(p_older interval) TO service_role;

-- acl: FUNCTION form_booking_ctx(p_submission uuid, p_type uuid)
REVOKE ALL ON FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) TO anon;
GRANT ALL ON FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_booking_ctx(p_submission uuid, p_type uuid) TO service_role;

-- acl: FUNCTION form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid)
REVOKE ALL ON FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) TO anon;
GRANT ALL ON FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) TO service_role;

-- acl: FUNCTION form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid)
REVOKE ALL ON FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) TO anon;
GRANT ALL ON FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) TO service_role;

-- acl: FUNCTION form_by_slug(p_ws text, p_slug text)
REVOKE ALL ON FUNCTION public.form_by_slug(p_ws text, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_by_slug(p_ws text, p_slug text) TO anon;
GRANT ALL ON FUNCTION public.form_by_slug(p_ws text, p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.form_by_slug(p_ws text, p_slug text) TO service_role;

-- acl: FUNCTION form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text)
REVOKE ALL ON FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) TO anon;
GRANT ALL ON FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.form_check_finish(p_id uuid, p_status text, p_steps jsonb, p_submission uuid, p_error text) TO service_role;

-- acl: FUNCTION form_check_progress(p_form uuid, p_since timestamp with time zone)
REVOKE ALL ON FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.form_check_progress(p_form uuid, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION form_check_start(p_form uuid)
REVOKE ALL ON FUNCTION public.form_check_start(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_check_start(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_check_start(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_check_start(p_form uuid) TO service_role;

-- acl: FUNCTION form_checks_due()
REVOKE ALL ON FUNCTION public.form_checks_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_checks_due() TO anon;
GRANT ALL ON FUNCTION public.form_checks_due() TO authenticated;
GRANT ALL ON FUNCTION public.form_checks_due() TO service_role;

-- acl: FUNCTION form_contact_write(p_ws uuid, p_row jsonb)
REVOKE ALL ON FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_contact_write(p_ws uuid, p_row jsonb) TO service_role;

-- acl: FUNCTION form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text)
REVOKE ALL ON FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid, p_kind text) TO service_role;

-- acl: FUNCTION form_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.form_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.form_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_delete(p_id uuid) TO service_role;

-- acl: FUNCTION form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone)
REVOKE ALL ON FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.form_deliveries_by_dest(p_form uuid, p_status text, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION form_destination_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.form_destination_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_destination_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.form_destination_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_destination_delete(p_id uuid) TO service_role;

-- acl: FUNCTION form_destination_pause(p_id uuid, p_paused boolean)
REVOKE ALL ON FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) TO anon;
GRANT ALL ON FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) TO authenticated;
GRANT ALL ON FUNCTION public.form_destination_pause(p_id uuid, p_paused boolean) TO service_role;

-- acl: FUNCTION form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text)
REVOKE ALL ON FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text, p_config jsonb, p_mode text, p_sealed text) TO service_role;

-- acl: FUNCTION form_draft_get(p_form uuid, p_token text)
REVOKE ALL ON FUNCTION public.form_draft_get(p_form uuid, p_token text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_draft_get(p_form uuid, p_token text) TO anon;
GRANT ALL ON FUNCTION public.form_draft_get(p_form uuid, p_token text) TO authenticated;
GRANT ALL ON FUNCTION public.form_draft_get(p_form uuid, p_token text) TO service_role;

-- acl: FUNCTION form_draft_info(p_id uuid)
REVOKE ALL ON FUNCTION public.form_draft_info(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_draft_info(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.form_draft_info(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_draft_info(p_id uuid) TO service_role;

-- acl: FUNCTION form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text)
REVOKE ALL ON FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) TO anon;
GRANT ALL ON FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) TO authenticated;
GRANT ALL ON FUNCTION public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step integer, p_page text) TO service_role;

-- acl: FUNCTION form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean)
REVOKE ALL ON FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) TO anon;
GRANT ALL ON FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) TO authenticated;
GRANT ALL ON FUNCTION public.form_field_seen(p_form uuid, p_vid text, p_version integer, p_fields jsonb, p_left text, p_step integer, p_sent boolean) TO service_role;

-- acl: FUNCTION form_fill_channels(p_form uuid, p_filters jsonb)
REVOKE ALL ON FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_fill_channels(p_form uuid, p_filters jsonb) TO service_role;

-- acl: FUNCTION form_fill_count(p_form uuid, p_filters jsonb)
REVOKE ALL ON FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_fill_count(p_form uuid, p_filters jsonb) TO service_role;

-- acl: FUNCTION form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.form_fill_ids(p_form uuid, p_filters jsonb, p_after_at timestamp with time zone, p_after_id uuid, p_limit integer) TO service_role;

-- acl: FUNCTION form_fill_set(p_form uuid, p_f jsonb)
REVOKE ALL ON FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_fill_set(p_form uuid, p_f jsonb) TO service_role;

-- acl: FUNCTION form_folder_delete(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.form_folder_delete(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_folder_delete(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_folder_delete(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION form_folder_move(p_ws uuid, p_id uuid, p_by integer)
REVOKE ALL ON FUNCTION public.form_folder_move(p_ws uuid, p_id uuid, p_by integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_folder_move(p_ws uuid, p_id uuid, p_by integer) TO authenticated;
GRANT ALL ON FUNCTION public.form_folder_move(p_ws uuid, p_id uuid, p_by integer) TO service_role;

-- acl: FUNCTION form_folder_save(p_ws uuid, p_id uuid, p_name text)
REVOKE ALL ON FUNCTION public.form_folder_save(p_ws uuid, p_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_folder_save(p_ws uuid, p_id uuid, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.form_folder_save(p_ws uuid, p_id uuid, p_name text) TO service_role;

-- acl: FUNCTION form_hour_count(p_form uuid)
REVOKE ALL ON FUNCTION public.form_hour_count(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_hour_count(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_hour_count(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_hour_count(p_form uuid) TO service_role;

-- acl: FUNCTION form_journey_follows(p_submission uuid)
REVOKE ALL ON FUNCTION public.form_journey_follows(p_submission uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_journey_follows(p_submission uuid) TO anon;
GRANT ALL ON FUNCTION public.form_journey_follows(p_submission uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_journey_follows(p_submission uuid) TO service_role;

-- acl: FUNCTION form_left_early(p_form uuid, p_from date, p_limit integer)
REVOKE ALL ON FUNCTION public.form_left_early(p_form uuid, p_from date, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_left_early(p_form uuid, p_from date, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.form_left_early(p_form uuid, p_from date, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.form_left_early(p_form uuid, p_from date, p_limit integer) TO service_role;

-- acl: FUNCTION form_link(p_form uuid)
REVOKE ALL ON FUNCTION public.form_link(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_link(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_link(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_link(p_form uuid) TO service_role;

-- acl: FUNCTION form_member(p_form uuid)
REVOKE ALL ON FUNCTION public.form_member(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_member(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_member(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_member(p_form uuid) TO service_role;

-- acl: FUNCTION form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid)
REVOKE ALL ON FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) TO anon;
GRANT ALL ON FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) TO service_role;

-- acl: FUNCTION form_not_booked_targets(p_submission uuid)
REVOKE ALL ON FUNCTION public.form_not_booked_targets(p_submission uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_not_booked_targets(p_submission uuid) TO anon;
GRANT ALL ON FUNCTION public.form_not_booked_targets(p_submission uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_not_booked_targets(p_submission uuid) TO service_role;

-- acl: FUNCTION form_notify_claim(p_sid uuid, p_parts text[])
REVOKE ALL ON FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) TO anon;
GRANT ALL ON FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) TO authenticated;
GRANT ALL ON FUNCTION public.form_notify_claim(p_sid uuid, p_parts text[]) TO service_role;

-- acl: FUNCTION form_notify_info(p_sid uuid)
REVOKE ALL ON FUNCTION public.form_notify_info(p_sid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_notify_info(p_sid uuid) TO anon;
GRANT ALL ON FUNCTION public.form_notify_info(p_sid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_notify_info(p_sid uuid) TO service_role;

-- acl: FUNCTION form_notify_unclaim(p_sid uuid, p_parts text[])
REVOKE ALL ON FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) TO anon;
GRANT ALL ON FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) TO authenticated;
GRANT ALL ON FUNCTION public.form_notify_unclaim(p_sid uuid, p_parts text[]) TO service_role;

-- acl: FUNCTION form_page_stats(p_form uuid)
REVOKE ALL ON FUNCTION public.form_page_stats(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_page_stats(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_page_stats(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_page_stats(p_form uuid) TO service_role;

-- acl: FUNCTION form_public(p_id uuid)
REVOKE ALL ON FUNCTION public.form_public(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_public(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.form_public(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_public(p_id uuid) TO service_role;

-- acl: FUNCTION form_publish(p_id uuid, p_user uuid, p_body jsonb)
REVOKE ALL ON FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_publish(p_id uuid, p_user uuid, p_body jsonb) TO service_role;

-- acl: FUNCTION form_results_columns(p_form uuid, p_cols text[])
REVOKE ALL ON FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) TO anon;
GRANT ALL ON FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) TO authenticated;
GRANT ALL ON FUNCTION public.form_results_columns(p_form uuid, p_cols text[]) TO service_role;

-- acl: FUNCTION form_results_request(p_form uuid, p_sid uuid, p_key text)
REVOKE ALL ON FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) TO anon;
GRANT ALL ON FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.form_results_request(p_form uuid, p_sid uuid, p_key text) TO service_role;

-- acl: FUNCTION form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid)
REVOKE ALL ON FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid) TO anon;
GRANT ALL ON FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev integer, p_brand_kit uuid) TO service_role;

-- acl: FUNCTION form_seen(p_form uuid, p_vid text, p_kind text)
REVOKE ALL ON FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.form_seen(p_form uuid, p_vid text, p_kind text) TO service_role;

-- acl: FUNCTION form_seen_pages(p_form uuid, p_since timestamp with time zone)
REVOKE ALL ON FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.form_seen_pages(p_form uuid, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION form_set_folder(p_ws uuid, p_id uuid, p_folder uuid)
REVOKE ALL ON FUNCTION public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_set_folder(p_ws uuid, p_id uuid, p_folder uuid) TO service_role;

-- acl: FUNCTION form_set_slug(p_form uuid, p_slug text)
REVOKE ALL ON FUNCTION public.form_set_slug(p_form uuid, p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_set_slug(p_form uuid, p_slug text) TO anon;
GRANT ALL ON FUNCTION public.form_set_slug(p_form uuid, p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.form_set_slug(p_form uuid, p_slug text) TO service_role;

-- acl: FUNCTION form_set_status(p_id uuid, p_status text)
REVOKE ALL ON FUNCTION public.form_set_status(p_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_set_status(p_id uuid, p_status text) TO anon;
GRANT ALL ON FUNCTION public.form_set_status(p_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.form_set_status(p_id uuid, p_status text) TO service_role;

-- acl: FUNCTION form_submissions_clear(p_form uuid)
REVOKE ALL ON FUNCTION public.form_submissions_clear(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_submissions_clear(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.form_submissions_clear(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_submissions_clear(p_form uuid) TO service_role;

-- acl: FUNCTION form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean)
REVOKE ALL ON FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO anon;
GRANT ALL ON FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO authenticated;
GRANT ALL ON FUNCTION public.form_submit(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO service_role;

-- acl: FUNCTION form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean)
REVOKE ALL ON FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO anon;
GRANT ALL ON FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO authenticated;
GRANT ALL ON FUNCTION public.form_submit_all(p_form uuid, p_version integer, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb, p_consent jsonb, p_country text, p_spam text, p_test boolean) TO service_role;

-- acl: FUNCTION form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb)
REVOKE ALL ON FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) TO anon;
GRANT ALL ON FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.form_to_studio(p_id uuid, p_version integer, p_body jsonb, p_draft jsonb) TO service_role;

-- acl: FUNCTION form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer)
REVOKE ALL ON FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) TO anon;
GRANT ALL ON FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) TO authenticated;
GRANT ALL ON FUNCTION public.form_upload_add(p_form uuid, p_field text, p_path text, p_name text, p_kind text, p_bytes integer) TO service_role;

-- acl: FUNCTION form_upload_path(p_id uuid)
REVOKE ALL ON FUNCTION public.form_upload_path(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_upload_path(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.form_upload_path(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_upload_path(p_id uuid) TO service_role;

-- acl: FUNCTION form_uploads_attach(p_sid uuid, p_ids uuid[])
REVOKE ALL ON FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.form_uploads_attach(p_sid uuid, p_ids uuid[]) TO service_role;

-- acl: FUNCTION form_uploads_of(p_sid uuid)
REVOKE ALL ON FUNCTION public.form_uploads_of(p_sid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_uploads_of(p_sid uuid) TO anon;
GRANT ALL ON FUNCTION public.form_uploads_of(p_sid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.form_uploads_of(p_sid uuid) TO service_role;

-- acl: FUNCTION form_uploads_stale()
REVOKE ALL ON FUNCTION public.form_uploads_stale() FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_uploads_stale() TO anon;
GRANT ALL ON FUNCTION public.form_uploads_stale() TO authenticated;
GRANT ALL ON FUNCTION public.form_uploads_stale() TO service_role;

-- acl: FUNCTION form_version_body(p_form uuid, p_version integer)
REVOKE ALL ON FUNCTION public.form_version_body(p_form uuid, p_version integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.form_version_body(p_form uuid, p_version integer) TO anon;
GRANT ALL ON FUNCTION public.form_version_body(p_form uuid, p_version integer) TO authenticated;
GRANT ALL ON FUNCTION public.form_version_body(p_form uuid, p_version integer) TO service_role;

-- acl: FUNCTION forms_keep_prune()
REVOKE ALL ON FUNCTION public.forms_keep_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.forms_keep_prune() TO anon;
GRANT ALL ON FUNCTION public.forms_keep_prune() TO authenticated;
GRANT ALL ON FUNCTION public.forms_keep_prune() TO service_role;

-- acl: FUNCTION forms_list(p_ws uuid)
REVOKE ALL ON FUNCTION public.forms_list(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.forms_list(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.forms_list(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.forms_list(p_ws uuid) TO service_role;

-- acl: FUNCTION github_links_prepare()
REVOKE ALL ON FUNCTION public.github_links_prepare() FROM PUBLIC;
GRANT ALL ON FUNCTION public.github_links_prepare() TO anon;
GRANT ALL ON FUNCTION public.github_links_prepare() TO authenticated;
GRANT ALL ON FUNCTION public.github_links_prepare() TO service_role;

-- acl: TABLE github_checks
GRANT ALL ON TABLE public.github_checks TO anon;
GRANT ALL ON TABLE public.github_checks TO authenticated;
GRANT ALL ON TABLE public.github_checks TO service_role;

-- acl: FUNCTION github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text)
REVOKE ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text) TO anon;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text) TO authenticated;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text) TO service_role;

-- acl: FUNCTION github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer)
REVOKE ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer) TO anon;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer) TO authenticated;
GRANT ALL ON FUNCTION public.github_start_check(p_link uuid, p_sha text, p_pr integer, p_base_url text, p_test_ids uuid[], p_selection jsonb, p_ai_calls integer) TO service_role;

-- acl: FUNCTION github_sync()
REVOKE ALL ON FUNCTION public.github_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.github_sync() TO anon;
GRANT ALL ON FUNCTION public.github_sync() TO authenticated;
GRANT ALL ON FUNCTION public.github_sync() TO service_role;

-- acl: FUNCTION heals_alert()
REVOKE ALL ON FUNCTION public.heals_alert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.heals_alert() TO anon;
GRANT ALL ON FUNCTION public.heals_alert() TO authenticated;
GRANT ALL ON FUNCTION public.heals_alert() TO service_role;

-- acl: FUNCTION hook_events_done(p_ids bigint[])
REVOKE ALL ON FUNCTION public.hook_events_done(p_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hook_events_done(p_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.hook_events_done(p_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.hook_events_done(p_ids bigint[]) TO service_role;

-- acl: FUNCTION hook_events_take(p_source uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.hook_events_take(p_source uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hook_events_take(p_source uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.hook_events_take(p_source uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.hook_events_take(p_source uuid, p_limit integer) TO service_role;

-- acl: FUNCTION hook_fill(p_sub uuid)
REVOKE ALL ON FUNCTION public.hook_fill(p_sub uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hook_fill(p_sub uuid) TO anon;
GRANT ALL ON FUNCTION public.hook_fill(p_sub uuid) TO authenticated;
GRANT ALL ON FUNCTION public.hook_fill(p_sub uuid) TO service_role;

-- acl: FUNCTION hook_stage(p_source uuid, p_dedupe text, p_body jsonb)
REVOKE ALL ON FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.hook_stage(p_source uuid, p_dedupe text, p_body jsonb) TO service_role;

-- acl: FUNCTION hook_stage_many(p_source uuid, p_events jsonb)
REVOKE ALL ON FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) TO anon;
GRANT ALL ON FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.hook_stage_many(p_source uuid, p_events jsonb) TO service_role;

-- acl: FUNCTION icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text)
GRANT ALL ON FUNCTION public.icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text) TO anon;
GRANT ALL ON FUNCTION public.icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text) TO authenticated;
GRANT ALL ON FUNCTION public.icp_fit(p_rules jsonb, p_industry text, p_size text, p_country text) TO service_role;

-- acl: FUNCTION import_undo(p_import uuid)
REVOKE ALL ON FUNCTION public.import_undo(p_import uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.import_undo(p_import uuid) TO anon;
GRANT ALL ON FUNCTION public.import_undo(p_import uuid) TO authenticated;
GRANT ALL ON FUNCTION public.import_undo(p_import uuid) TO service_role;

-- acl: FUNCTION inbox_prune()
REVOKE ALL ON FUNCTION public.inbox_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.inbox_prune() TO anon;
GRANT ALL ON FUNCTION public.inbox_prune() TO authenticated;
GRANT ALL ON FUNCTION public.inbox_prune() TO service_role;

-- acl: FUNCTION invite_info(p_id uuid, p_sent_for timestamp with time zone)
REVOKE ALL ON FUNCTION public.invite_info(p_id uuid, p_sent_for timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_info(p_id uuid, p_sent_for timestamp with time zone) TO service_role;

-- acl: FUNCTION invite_member(p_ws uuid, p_email text)
REVOKE ALL ON FUNCTION public.invite_member(p_ws uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invite_member(p_ws uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.invite_member(p_ws uuid, p_email text) TO service_role;

-- acl: FUNCTION is_member(ws uuid)
REVOKE ALL ON FUNCTION public.is_member(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_member(ws uuid) TO anon;
GRANT ALL ON FUNCTION public.is_member(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_member(ws uuid) TO service_role;

-- acl: FUNCTION is_owner(ws uuid)
REVOKE ALL ON FUNCTION public.is_owner(ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_owner(ws uuid) TO anon;
GRANT ALL ON FUNCTION public.is_owner(ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_owner(ws uuid) TO service_role;

-- acl: FUNCTION job_key_running(p_ws uuid, p_kind text, p_key text)
REVOKE ALL ON FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) TO anon;
GRANT ALL ON FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.job_key_running(p_ws uuid, p_kind text, p_key text) TO service_role;

-- acl: FUNCTION job_key_waiting(p_ws uuid, p_kind text, p_key text)
REVOKE ALL ON FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) TO anon;
GRANT ALL ON FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.job_key_waiting(p_ws uuid, p_kind text, p_key text) TO service_role;

-- acl: FUNCTION job_kind_removed(p_kind text)
REVOKE ALL ON FUNCTION public.job_kind_removed(p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_kind_removed(p_kind text) TO anon;
GRANT ALL ON FUNCTION public.job_kind_removed(p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.job_kind_removed(p_kind text) TO service_role;

-- acl: FUNCTION job_priority(p_kind text, p_payload jsonb)
REVOKE ALL ON FUNCTION public.job_priority(p_kind text, p_payload jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.job_priority(p_kind text, p_payload jsonb) TO anon;
GRANT ALL ON FUNCTION public.job_priority(p_kind text, p_payload jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.job_priority(p_kind text, p_payload jsonb) TO service_role;

-- acl: FUNCTION jobs_drop_removed()
REVOKE ALL ON FUNCTION public.jobs_drop_removed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.jobs_drop_removed() TO anon;
GRANT ALL ON FUNCTION public.jobs_drop_removed() TO authenticated;
GRANT ALL ON FUNCTION public.jobs_drop_removed() TO service_role;

-- acl: FUNCTION journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb)
REVOKE ALL ON FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) TO anon;
GRANT ALL ON FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.journey_create(p_ws uuid, p_user uuid, p_name text, p_stage text, p_journey text, p_draft jsonb) TO service_role;

-- acl: FUNCTION lead_route(p_contact uuid)
REVOKE ALL ON FUNCTION public.lead_route(p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_route(p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.lead_route(p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.lead_route(p_contact uuid) TO service_role;

-- acl: FUNCTION lead_score_rows(p_ws uuid, p_ids uuid[])
REVOKE ALL ON FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.lead_score_rows(p_ws uuid, p_ids uuid[]) TO service_role;

-- acl: FUNCTION lead_scores_due()
REVOKE ALL ON FUNCTION public.lead_scores_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_scores_due() TO anon;
GRANT ALL ON FUNCTION public.lead_scores_due() TO authenticated;
GRANT ALL ON FUNCTION public.lead_scores_due() TO service_role;

-- acl: FUNCTION lead_scores_refresh(p_ws uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.lead_scores_refresh(p_ws uuid, p_limit integer) TO service_role;

-- acl: FUNCTION link_domain_host(p_host text)
REVOKE ALL ON FUNCTION public.link_domain_host(p_host text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_domain_host(p_host text) TO anon;
GRANT ALL ON FUNCTION public.link_domain_host(p_host text) TO authenticated;
GRANT ALL ON FUNCTION public.link_domain_host(p_host text) TO service_role;

-- acl: FUNCTION link_slug_exists(p_slug text)
REVOKE ALL ON FUNCTION public.link_slug_exists(p_slug text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.link_slug_exists(p_slug text) TO anon;
GRANT ALL ON FUNCTION public.link_slug_exists(p_slug text) TO authenticated;
GRANT ALL ON FUNCTION public.link_slug_exists(p_slug text) TO service_role;

-- acl: FUNCTION local_hour(p_at timestamp with time zone, p_tz text)
REVOKE ALL ON FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) TO anon;
GRANT ALL ON FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) TO authenticated;
GRANT ALL ON FUNCTION public.local_hour(p_at timestamp with time zone, p_tz text) TO service_role;

-- acl: FUNCTION mailbox_broken(p_id uuid, p_error text)
REVOKE ALL ON FUNCTION public.mailbox_broken(p_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_broken(p_id uuid, p_error text) TO anon;
GRANT ALL ON FUNCTION public.mailbox_broken(p_id uuid, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_broken(p_id uuid, p_error text) TO service_role;

-- acl: FUNCTION mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text)
REVOKE ALL ON FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_connect(p_ws uuid, p_user uuid, p_provider text, p_email text, p_sealed text) TO service_role;

-- acl: FUNCTION mailbox_disconnect(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_disconnect(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION mailbox_for(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_for(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION mailbox_limit(p_provider text)
GRANT ALL ON FUNCTION public.mailbox_limit(p_provider text) TO anon;
GRANT ALL ON FUNCTION public.mailbox_limit(p_provider text) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_limit(p_provider text) TO service_role;

-- acl: FUNCTION mailbox_sent(p_id uuid)
REVOKE ALL ON FUNCTION public.mailbox_sent(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_sent(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.mailbox_sent(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_sent(p_id uuid) TO service_role;

-- acl: FUNCTION mailbox_token_save(p_id uuid, p_sealed text)
REVOKE ALL ON FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.mailbox_token_save(p_id uuid, p_sealed text) TO service_role;

-- acl: FUNCTION make_event_partitions(p_days_ahead integer)
REVOKE ALL ON FUNCTION public.make_event_partitions(p_days_ahead integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.make_event_partitions(p_days_ahead integer) TO anon;
GRANT ALL ON FUNCTION public.make_event_partitions(p_days_ahead integer) TO authenticated;
GRANT ALL ON FUNCTION public.make_event_partitions(p_days_ahead integer) TO service_role;

-- acl: FUNCTION meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid)
REVOKE ALL ON FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_book(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid) TO service_role;

-- acl: FUNCTION meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean)
REVOKE ALL ON FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean) TO anon;
GRANT ALL ON FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_book_all(p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_source text, p_token_hash text, p_status text, p_contact uuid, p_submission uuid, p_link uuid, p_seats integer, p_rr boolean, p_location jsonb, p_booked_by uuid, p_sealed text, p_team jsonb, p_contact_row jsonb, p_sync boolean) TO service_role;

-- acl: FUNCTION meeting_book_later_info(p_submission uuid, p_type uuid)
REVOKE ALL ON FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_book_later_info(p_submission uuid, p_type uuid) TO service_role;

-- acl: FUNCTION meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone)
GRANT ALL ON FUNCTION public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_calendar_busy(p_ws uuid, p_user uuid, p_from timestamp with time zone, p_to timestamp with time zone) TO service_role;

-- acl: FUNCTION meeting_calendar_failed(p_meeting uuid, p_detail jsonb)
REVOKE ALL ON FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_calendar_failed(p_meeting uuid, p_detail jsonb) TO service_role;

-- acl: FUNCTION meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb)
REVOKE ALL ON FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_calendar_save(p_meeting uuid, p_events jsonb, p_location jsonb) TO service_role;

-- acl: FUNCTION meeting_cancel_guest(p_id uuid, p_reason text)
REVOKE ALL ON FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_cancel_guest(p_id uuid, p_reason text) TO service_role;

-- acl: FUNCTION meeting_contact_make(p_meeting uuid, p_row jsonb)
REVOKE ALL ON FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_contact_make(p_meeting uuid, p_row jsonb) TO service_role;

-- acl: FUNCTION meeting_events_webhooks()
REVOKE ALL ON FUNCTION public.meeting_events_webhooks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_events_webhooks() TO anon;
GRANT ALL ON FUNCTION public.meeting_events_webhooks() TO authenticated;
GRANT ALL ON FUNCTION public.meeting_events_webhooks() TO service_role;

-- acl: TABLE meetings
GRANT ALL ON TABLE public.meetings TO anon;
GRANT ALL ON TABLE public.meetings TO authenticated;
GRANT ALL ON TABLE public.meetings TO service_role;

-- acl: FUNCTION meeting_holds(m public.meetings)
REVOKE ALL ON FUNCTION public.meeting_holds(m public.meetings) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_holds(m public.meetings) TO anon;
GRANT ALL ON FUNCTION public.meeting_holds(m public.meetings) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_holds(m public.meetings) TO service_role;

-- acl: FUNCTION meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid)
REVOKE ALL ON FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_host_action(p_ws uuid, p_id uuid, p_status text, p_reason text, p_by uuid) TO service_role;

-- acl: FUNCTION meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text)
REVOKE ALL ON FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text) TO anon;
GRANT ALL ON FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamp with time zone, p_to timestamp with time zone, p_schedule text) TO service_role;

-- acl: FUNCTION meeting_invite_info(p_meeting uuid)
REVOKE ALL ON FUNCTION public.meeting_invite_info(p_meeting uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_invite_info(p_meeting uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_invite_info(p_meeting uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_invite_info(p_meeting uuid) TO service_role;

-- acl: FUNCTION meeting_jobs_drop(p_meeting uuid, p_keep text[])
REVOKE ALL ON FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[]) TO anon;
GRANT ALL ON FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[]) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_jobs_drop(p_meeting uuid, p_keep text[]) TO service_role;

-- acl: FUNCTION meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text)
REVOKE ALL ON FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_mail_done(p_id uuid, p_outcome text, p_provider_id text, p_error text) TO service_role;

-- acl: FUNCTION meeting_mail_done_many(p_rows jsonb)
REVOKE ALL ON FUNCTION public.meeting_mail_done_many(p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_mail_done_many(p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_mail_done_many(p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_mail_done_many(p_rows jsonb) TO service_role;

-- acl: FUNCTION meeting_mail_event(p_event jsonb)
REVOKE ALL ON FUNCTION public.meeting_mail_event(p_event jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_mail_event(p_event jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_mail_event(p_event jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_mail_event(p_event jsonb) TO service_role;

-- acl: FUNCTION meeting_mail_info(p_meeting uuid)
REVOKE ALL ON FUNCTION public.meeting_mail_info(p_meeting uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_mail_info(p_meeting uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_mail_info(p_meeting uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_mail_info(p_meeting uuid) TO service_role;

-- acl: FUNCTION meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean)
REVOKE ALL ON FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean) TO anon;
GRANT ALL ON FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_mail_start(p_ws uuid, p_meeting uuid, p_submission uuid, p_kind text, p_to text, p_dedupe text, p_optional boolean) TO service_role;

-- acl: FUNCTION meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid)
REVOKE ALL ON FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_manage_info(p_ws uuid, p_id uuid, p_by uuid) TO service_role;

-- acl: FUNCTION meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone)
REVOKE ALL ON FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_move(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO service_role;

-- acl: FUNCTION meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone)
REVOKE ALL ON FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone) TO service_role;

-- acl: FUNCTION meeting_outcome(p_meeting uuid, p_status text, p_nonce text)
REVOKE ALL ON FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) TO anon;
GRANT ALL ON FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_outcome(p_meeting uuid, p_status text, p_nonce text) TO service_role;

-- acl: FUNCTION meeting_pay(p_id uuid, p_payment jsonb)
REVOKE ALL ON FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_pay(p_id uuid, p_payment jsonb) TO service_role;

-- acl: FUNCTION meeting_payment(p_id uuid, p_patch jsonb)
REVOKE ALL ON FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_payment(p_id uuid, p_patch jsonb) TO service_role;

-- acl: FUNCTION meeting_people(p_ws uuid, p_users uuid[])
REVOKE ALL ON FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) TO anon;
GRANT ALL ON FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_people(p_ws uuid, p_users uuid[]) TO service_role;

-- acl: FUNCTION meeting_seat(m public.meetings)
REVOKE ALL ON FUNCTION public.meeting_seat(m public.meetings) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_seat(m public.meetings) TO anon;
GRANT ALL ON FUNCTION public.meeting_seat(m public.meetings) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_seat(m public.meetings) TO service_role;

-- acl: FUNCTION meeting_sending(p_ws uuid)
REVOKE ALL ON FUNCTION public.meeting_sending(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_sending(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_sending(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_sending(p_ws uuid) TO service_role;

-- acl: FUNCTION meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid)
REVOKE ALL ON FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_status(p_id uuid, p_status text, p_reason text, p_by uuid) TO service_role;

-- acl: FUNCTION meeting_sync_inputs(p_meeting uuid)
REVOKE ALL ON FUNCTION public.meeting_sync_inputs(p_meeting uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_sync_inputs(p_meeting uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_sync_inputs(p_meeting uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_sync_inputs(p_meeting uuid) TO service_role;

-- acl: FUNCTION meeting_sync_lease(p_meeting uuid, p_job text, p_s integer)
REVOKE ALL ON FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer) TO anon;
GRANT ALL ON FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_sync_lease(p_meeting uuid, p_job text, p_s integer) TO service_role;

-- acl: FUNCTION meeting_sync_release(p_meeting uuid, p_job text)
REVOKE ALL ON FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) TO anon;
GRANT ALL ON FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_sync_release(p_meeting uuid, p_job text) TO service_role;

-- acl: FUNCTION meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb)
REVOKE ALL ON FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb) TO anon;
GRANT ALL ON FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version integer, p_steps jsonb) TO service_role;

-- acl: FUNCTION meeting_timeline(p_meeting uuid, p_kind text)
REVOKE ALL ON FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_timeline(p_meeting uuid, p_kind text) TO service_role;

-- acl: FUNCTION meeting_token_keep(p_id uuid, p_hash text, p_sealed text)
REVOKE ALL ON FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_token_keep(p_id uuid, p_hash text, p_sealed text) TO service_role;

-- acl: FUNCTION meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text)
REVOKE ALL ON FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_token_rotate(p_id uuid, p_old text, p_hash text, p_sealed text) TO service_role;

-- acl: FUNCTION meeting_type_delete(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_type_delete(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION meeting_type_get(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_type_get(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION meeting_type_locked(p_settings jsonb, p_locked text[])
REVOKE ALL ON FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) TO anon;
GRANT ALL ON FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_type_locked(p_settings jsonb, p_locked text[]) TO service_role;

-- acl: FUNCTION meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[])
REVOKE ALL ON FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) TO anon;
GRANT ALL ON FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_type_push(p_ws uuid, p_template uuid, p_users uuid[]) TO service_role;

-- acl: FUNCTION meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid)
REVOKE ALL ON FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_type_save(p_ws uuid, p_id uuid, p_type jsonb, p_by uuid) TO service_role;

-- acl: FUNCTION meeting_upcoming_for(p_ws uuid, p_contact uuid)
REVOKE ALL ON FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meeting_upcoming_for(p_ws uuid, p_contact uuid) TO service_role;

-- acl: FUNCTION meetings_auto_held(p_limit integer)
REVOKE ALL ON FUNCTION public.meetings_auto_held(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meetings_auto_held(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.meetings_auto_held(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.meetings_auto_held(p_limit integer) TO service_role;

-- acl: FUNCTION meetings_members(p_ws uuid)
REVOKE ALL ON FUNCTION public.meetings_members(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meetings_members(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.meetings_members(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meetings_members(p_ws uuid) TO service_role;

-- acl: FUNCTION meetings_role(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.meetings_role(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.meetings_role(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.meetings_role(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.meetings_role(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION meetings_tick()
REVOKE ALL ON FUNCTION public.meetings_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.meetings_tick() TO anon;
GRANT ALL ON FUNCTION public.meetings_tick() TO authenticated;
GRANT ALL ON FUNCTION public.meetings_tick() TO service_role;

-- acl: FUNCTION member_remove(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.member_remove(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.member_remove(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.member_remove(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.member_remove(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb)
REVOKE ALL ON FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) TO anon;
GRANT ALL ON FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.merge_values(p_classes jsonb, p_source text, p_import uuid, p_old jsonb, p_src jsonb, p_new jsonb) TO service_role;

-- acl: FUNCTION minute_tick()
REVOKE ALL ON FUNCTION public.minute_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.minute_tick() TO anon;
GRANT ALL ON FUNCTION public.minute_tick() TO authenticated;
GRANT ALL ON FUNCTION public.minute_tick() TO service_role;

-- acl: FUNCTION my_owned_workspaces()
REVOKE ALL ON FUNCTION public.my_owned_workspaces() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_owned_workspaces() TO anon;
GRANT ALL ON FUNCTION public.my_owned_workspaces() TO authenticated;
GRANT ALL ON FUNCTION public.my_owned_workspaces() TO service_role;

-- acl: FUNCTION my_workspaces()
REVOKE ALL ON FUNCTION public.my_workspaces() FROM PUBLIC;
GRANT ALL ON FUNCTION public.my_workspaces() TO anon;
GRANT ALL ON FUNCTION public.my_workspaces() TO authenticated;
GRANT ALL ON FUNCTION public.my_workspaces() TO service_role;

-- acl: FUNCTION next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer)
REVOKE ALL ON FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) TO anon;
GRANT ALL ON FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) TO authenticated;
GRANT ALL ON FUNCTION public.next_local_hour(p_at timestamp with time zone, p_tz text, p_hour integer) TO service_role;

-- acl: FUNCTION nurture_advance(p_limit integer)
REVOKE ALL ON FUNCTION public.nurture_advance(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nurture_advance(p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.nurture_advance(p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.nurture_advance(p_limit integer) TO service_role;

-- acl: FUNCTION nurture_enroll(p_nurture uuid)
REVOKE ALL ON FUNCTION public.nurture_enroll(p_nurture uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nurture_enroll(p_nurture uuid) TO anon;
GRANT ALL ON FUNCTION public.nurture_enroll(p_nurture uuid) TO authenticated;
GRANT ALL ON FUNCTION public.nurture_enroll(p_nurture uuid) TO service_role;

-- acl: FUNCTION nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[])
REVOKE ALL ON FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[]) TO anon;
GRANT ALL ON FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[]) TO authenticated;
GRANT ALL ON FUNCTION public.nurture_step_save(p_nurture uuid, p_step uuid, p_wait_days integer, p_subject text, p_preheader text, p_html text, p_text text, p_links text[], p_ai boolean, p_notes text[]) TO service_role;

-- acl: FUNCTION oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text)
REVOKE ALL ON FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) TO anon;
GRANT ALL ON FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) TO authenticated;
GRANT ALL ON FUNCTION public.oauth_code_add(p_hash text, p_client text, p_ws uuid, p_user uuid, p_redirect text, p_challenge text) TO service_role;

-- acl: FUNCTION oauth_code_use(p_hash text, p_client text)
REVOKE ALL ON FUNCTION public.oauth_code_use(p_hash text, p_client text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.oauth_code_use(p_hash text, p_client text) TO anon;
GRANT ALL ON FUNCTION public.oauth_code_use(p_hash text, p_client text) TO authenticated;
GRANT ALL ON FUNCTION public.oauth_code_use(p_hash text, p_client text) TO service_role;

-- acl: FUNCTION oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text)
REVOKE ALL ON FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) TO anon;
GRANT ALL ON FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) TO authenticated;
GRANT ALL ON FUNCTION public.oauth_key_make(p_hash text, p_name text, p_prefix text, p_key_hash text) TO service_role;

-- acl: FUNCTION object_where(p_ws uuid, p_object text, p_filters jsonb)
REVOKE ALL ON FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) TO anon;
GRANT ALL ON FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.object_where(p_ws uuid, p_object text, p_filters jsonb) TO service_role;

-- acl: TABLE tunnels
GRANT ALL ON TABLE public.tunnels TO anon;
GRANT ALL ON TABLE public.tunnels TO authenticated;
GRANT ALL ON TABLE public.tunnels TO service_role;

-- acl: FUNCTION open_tunnel(p_workspace uuid)
REVOKE ALL ON FUNCTION public.open_tunnel(p_workspace uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.open_tunnel(p_workspace uuid) TO anon;
GRANT ALL ON FUNCTION public.open_tunnel(p_workspace uuid) TO authenticated;
GRANT ALL ON FUNCTION public.open_tunnel(p_workspace uuid) TO service_role;

-- acl: FUNCTION opportunities_ingest(p_source uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.opportunities_ingest(p_source uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION opportunities_remove(p_source uuid, p_ids text[])
REVOKE ALL ON FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) TO anon;
GRANT ALL ON FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.opportunities_remove(p_source uuid, p_ids text[]) TO service_role;

-- acl: FUNCTION payment_account_set(p_ws uuid, p_account text, p_ready boolean)
REVOKE ALL ON FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) TO anon;
GRANT ALL ON FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) TO authenticated;
GRANT ALL ON FUNCTION public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) TO service_role;

-- acl: FUNCTION person_cache_forget()
REVOKE ALL ON FUNCTION public.person_cache_forget() FROM PUBLIC;
GRANT ALL ON FUNCTION public.person_cache_forget() TO anon;
GRANT ALL ON FUNCTION public.person_cache_forget() TO authenticated;
GRANT ALL ON FUNCTION public.person_cache_forget() TO service_role;

-- acl: FUNCTION person_for_email(p_ws uuid, p_email text)
REVOKE ALL ON FUNCTION public.person_for_email(p_ws uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.person_for_email(p_ws uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.person_for_email(p_ws uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.person_for_email(p_ws uuid, p_email text) TO service_role;

-- acl: FUNCTION person_name(p_first text, p_last text)
GRANT ALL ON FUNCTION public.person_name(p_first text, p_last text) TO anon;
GRANT ALL ON FUNCTION public.person_name(p_first text, p_last text) TO authenticated;
GRANT ALL ON FUNCTION public.person_name(p_first text, p_last text) TO service_role;

-- acl: FUNCTION plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer)
GRANT ALL ON FUNCTION public.plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer) TO anon;
GRANT ALL ON FUNCTION public.plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer) TO authenticated;
GRANT ALL ON FUNCTION public.plan_caps(p_plan text, OUT submissions integer, OUT ai_credits integer, OUT calendars integer, OUT meeting_types integer) TO service_role;

-- acl: FUNCTION plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text)
REVOKE ALL ON FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) TO anon;
GRANT ALL ON FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) TO service_role;

-- acl: FUNCTION plan_check_type(p_ws uuid, p_id uuid, p_type jsonb)
REVOKE ALL ON FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) TO anon;
GRANT ALL ON FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) TO service_role;

-- acl: FUNCTION plan_hosts(p_ws uuid)
REVOKE ALL ON FUNCTION public.plan_hosts(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_hosts(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.plan_hosts(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_hosts(p_ws uuid) TO service_role;

-- acl: FUNCTION plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer)
GRANT ALL ON FUNCTION public.plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer) TO anon;
GRANT ALL ON FUNCTION public.plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer) TO authenticated;
GRANT ALL ON FUNCTION public.plan_limits(p_plan text, OUT projects integer, OUT minutes integer, OUT credits integer) TO service_role;

-- acl: FUNCTION plan_month()
GRANT ALL ON FUNCTION public.plan_month() TO anon;
GRANT ALL ON FUNCTION public.plan_month() TO authenticated;
GRANT ALL ON FUNCTION public.plan_month() TO service_role;

-- acl: FUNCTION plan_status(p_ws uuid)
REVOKE ALL ON FUNCTION public.plan_status(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.plan_status(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.plan_status(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_status(p_ws uuid) TO service_role;

-- acl: FUNCTION plan_type_hosts(p_hosts jsonb, p_owner uuid)
GRANT ALL ON FUNCTION public.plan_type_hosts(p_hosts jsonb, p_owner uuid) TO anon;
GRANT ALL ON FUNCTION public.plan_type_hosts(p_hosts jsonb, p_owner uuid) TO authenticated;
GRANT ALL ON FUNCTION public.plan_type_hosts(p_hosts jsonb, p_owner uuid) TO service_role;

-- acl: FUNCTION plans_wake()
REVOKE ALL ON FUNCTION public.plans_wake() FROM PUBLIC;
GRANT ALL ON FUNCTION public.plans_wake() TO anon;
GRANT ALL ON FUNCTION public.plans_wake() TO authenticated;
GRANT ALL ON FUNCTION public.plans_wake() TO service_role;

-- acl: FUNCTION poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid)
REVOKE ALL ON FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid) TO anon;
GRANT ALL ON FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.poll_book(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid) TO service_role;

-- acl: FUNCTION poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb)
REVOKE ALL ON FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb) TO anon;
GRANT ALL ON FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.poll_book_all(p_link uuid, p_hosts uuid[], p_start timestamp with time zone, p_end timestamp with time zone, p_block_start timestamp with time zone, p_block_end timestamp with time zone, p_guest jsonb, p_token_hash text, p_location jsonb, p_booked_by uuid, p_sealed text, p_contact_row jsonb) TO service_role;

-- acl: FUNCTION poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[])
REVOKE ALL ON FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO anon;
GRANT ALL ON FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO authenticated;
GRANT ALL ON FUNCTION public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO service_role;

-- acl: FUNCTION poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[])
REVOKE ALL ON FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO anon;
GRANT ALL ON FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO authenticated;
GRANT ALL ON FUNCTION public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamp with time zone[]) TO service_role;

-- acl: FUNCTION product_events_sync()
REVOKE ALL ON FUNCTION public.product_events_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.product_events_sync() TO anon;
GRANT ALL ON FUNCTION public.product_events_sync() TO authenticated;
GRANT ALL ON FUNCTION public.product_events_sync() TO service_role;

-- acl: FUNCTION project_inbox()
REVOKE ALL ON FUNCTION public.project_inbox() FROM PUBLIC;
GRANT ALL ON FUNCTION public.project_inbox() TO anon;
GRANT ALL ON FUNCTION public.project_inbox() TO authenticated;
GRANT ALL ON FUNCTION public.project_inbox() TO service_role;

-- acl: FUNCTION project_limit()
REVOKE ALL ON FUNCTION public.project_limit() FROM PUBLIC;
GRANT ALL ON FUNCTION public.project_limit() TO anon;
GRANT ALL ON FUNCTION public.project_limit() TO authenticated;
GRANT ALL ON FUNCTION public.project_limit() TO service_role;

-- acl: FUNCTION project_workspace()
REVOKE ALL ON FUNCTION public.project_workspace() FROM PUBLIC;
GRANT ALL ON FUNCTION public.project_workspace() TO anon;
GRANT ALL ON FUNCTION public.project_workspace() TO authenticated;
GRANT ALL ON FUNCTION public.project_workspace() TO service_role;

-- acl: FUNCTION prune_batch(p_table regclass, p_where text, p_max integer)
REVOKE ALL ON FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer) TO anon;
GRANT ALL ON FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer) TO authenticated;
GRANT ALL ON FUNCTION public.prune_batch(p_table regclass, p_where text, p_max integer) TO service_role;

-- acl: FUNCTION prune_history()
REVOKE ALL ON FUNCTION public.prune_history() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_history() TO anon;
GRANT ALL ON FUNCTION public.prune_history() TO authenticated;
GRANT ALL ON FUNCTION public.prune_history() TO service_role;

-- acl: FUNCTION prune_jobs()
REVOKE ALL ON FUNCTION public.prune_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_jobs() TO anon;
GRANT ALL ON FUNCTION public.prune_jobs() TO authenticated;
GRANT ALL ON FUNCTION public.prune_jobs() TO service_role;

-- acl: FUNCTION prune_sync()
REVOKE ALL ON FUNCTION public.prune_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_sync() TO anon;
GRANT ALL ON FUNCTION public.prune_sync() TO authenticated;
GRANT ALL ON FUNCTION public.prune_sync() TO service_role;

-- acl: FUNCTION prune_tick()
REVOKE ALL ON FUNCTION public.prune_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.prune_tick() TO anon;
GRANT ALL ON FUNCTION public.prune_tick() TO authenticated;
GRANT ALL ON FUNCTION public.prune_tick() TO service_role;

-- acl: FUNCTION push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[])
REVOKE ALL ON FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.push_candidates(p_source uuid, p_after text, p_limit integer, p_ids uuid[]) TO service_role;

-- acl: FUNCTION valid_steps(steps jsonb, allow_use boolean)
GRANT ALL ON FUNCTION public.valid_steps(steps jsonb, allow_use boolean) TO anon;
GRANT ALL ON FUNCTION public.valid_steps(steps jsonb, allow_use boolean) TO authenticated;
GRANT ALL ON FUNCTION public.valid_steps(steps jsonb, allow_use boolean) TO service_role;

-- acl: TABLE environments
GRANT ALL ON TABLE public.environments TO anon;
GRANT ALL ON TABLE public.environments TO authenticated;
GRANT ALL ON TABLE public.environments TO service_role;

-- acl: TABLE tests
GRANT ALL ON TABLE public.tests TO anon;
GRANT ALL ON TABLE public.tests TO authenticated;
GRANT ALL ON TABLE public.tests TO service_role;

-- acl: FUNCTION queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid)
REVOKE ALL ON FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid) TO anon;
GRANT ALL ON FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid) TO authenticated;
GRANT ALL ON FUNCTION public.queue_run(t public.tests, e public.environments, p_trigger text, p_by uuid, p_schedule uuid) TO service_role;

-- acl: FUNCTION record_cleanup()
REVOKE ALL ON FUNCTION public.record_cleanup() FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_cleanup() TO anon;
GRANT ALL ON FUNCTION public.record_cleanup() TO authenticated;
GRANT ALL ON FUNCTION public.record_cleanup() TO service_role;

-- acl: FUNCTION record_exists(p_ws uuid, p_object text, p_record uuid)
REVOKE ALL ON FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) TO anon;
GRANT ALL ON FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) TO authenticated;
GRANT ALL ON FUNCTION public.record_exists(p_ws uuid, p_object text, p_record uuid) TO service_role;

-- acl: FUNCTION record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text)
REVOKE ALL ON FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.record_heal(p_run uuid, p_position integer, p_label text, p_old text, p_new text, p_error text) TO service_role;

-- acl: FUNCTION record_set(p_object text, p_id uuid, p_key text, p_value jsonb)
REVOKE ALL ON FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) TO anon;
GRANT ALL ON FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.record_set(p_object text, p_id uuid, p_key text, p_value jsonb) TO service_role;

-- acl: FUNCTION records_ingest(p_source uuid, p_object text, p_rows jsonb)
REVOKE ALL ON FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.records_ingest(p_source uuid, p_object text, p_rows jsonb) TO service_role;

-- acl: FUNCTION records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer)
REVOKE ALL ON FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO anon;
GRANT ALL ON FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO authenticated;
GRANT ALL ON FUNCTION public.records_list(p_ws uuid, p_object text, p_filters jsonb, p_sort text, p_desc boolean, p_limit integer, p_offset integer) TO service_role;

-- acl: FUNCTION recover_jobs()
REVOKE ALL ON FUNCTION public.recover_jobs() FROM PUBLIC;
GRANT ALL ON FUNCTION public.recover_jobs() TO anon;
GRANT ALL ON FUNCTION public.recover_jobs() TO authenticated;
GRANT ALL ON FUNCTION public.recover_jobs() TO service_role;

-- acl: FUNCTION release_job(p_id uuid, p_worker text, p_error text)
REVOKE ALL ON FUNCTION public.release_job(p_id uuid, p_worker text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.release_job(p_id uuid, p_worker text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.release_job(p_id uuid, p_worker text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.release_job(p_id uuid, p_worker text, p_error text) TO service_role;

-- acl: FUNCTION report_bounds(p_ws uuid, p_from date, p_to date)
REVOKE ALL ON FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) TO anon;
GRANT ALL ON FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) TO authenticated;
GRANT ALL ON FUNCTION public.report_bounds(p_ws uuid, p_from date, p_to date) TO service_role;

-- acl: FUNCTION report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone)
REVOKE ALL ON FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.report_facts(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO service_role;

-- acl: FUNCTION report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text)
REVOKE ALL ON FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) TO anon;
GRANT ALL ON FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) TO authenticated;
GRANT ALL ON FUNCTION public.report_funnel_range(p_ws uuid, p_from date, p_to date, p_by text) TO service_role;

-- acl: FUNCTION report_ids(p_ws uuid, p_roots uuid[])
REVOKE ALL ON FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) TO anon;
GRANT ALL ON FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.report_ids(p_ws uuid, p_roots uuid[]) TO service_role;

-- acl: FUNCTION report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone)
REVOKE ALL ON FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.report_leads(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone) TO service_role;

-- acl: FUNCTION report_spam(p_contact uuid)
REVOKE ALL ON FUNCTION public.report_spam(p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_spam(p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.report_spam(p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_spam(p_contact uuid) TO service_role;

-- acl: FUNCTION report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb)
REVOKE ALL ON FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) TO anon;
GRANT ALL ON FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.report_speed_sum(p_ws uuid, p_start timestamp with time zone, p_end timestamp with time zone, p_facts jsonb) TO service_role;

-- acl: FUNCTION report_visits(p_ws uuid, p_from date, p_to date, p_by text)
REVOKE ALL ON FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text) TO anon;
GRANT ALL ON FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text) TO authenticated;
GRANT ALL ON FUNCTION public.report_visits(p_ws uuid, p_from date, p_to date, p_by text) TO service_role;

-- acl: FUNCTION report_won_stages(p_ws uuid)
REVOKE ALL ON FUNCTION public.report_won_stages(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.report_won_stages(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.report_won_stages(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.report_won_stages(p_ws uuid) TO service_role;

-- acl: FUNCTION reports_nightly()
REVOKE ALL ON FUNCTION public.reports_nightly() FROM PUBLIC;
GRANT ALL ON FUNCTION public.reports_nightly() TO anon;
GRANT ALL ON FUNCTION public.reports_nightly() TO authenticated;
GRANT ALL ON FUNCTION public.reports_nightly() TO service_role;

-- acl: FUNCTION retry_run(p_run uuid)
REVOKE ALL ON FUNCTION public.retry_run(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.retry_run(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.retry_run(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.retry_run(p_run uuid) TO service_role;

-- acl: FUNCTION revoke_api_key(p_key uuid)
REVOKE ALL ON FUNCTION public.revoke_api_key(p_key uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.revoke_api_key(p_key uuid) TO anon;
GRANT ALL ON FUNCTION public.revoke_api_key(p_key uuid) TO authenticated;
GRANT ALL ON FUNCTION public.revoke_api_key(p_key uuid) TO service_role;

-- acl: FUNCTION router_action_count(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_action_count(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_action_count(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_action_count(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_action_count(p_ws uuid) TO service_role;

-- acl: FUNCTION router_alert_claim(p_run uuid, p_parts text[])
REVOKE ALL ON FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) TO anon;
GRANT ALL ON FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) TO authenticated;
GRANT ALL ON FUNCTION public.router_alert_claim(p_run uuid, p_parts text[]) TO service_role;

-- acl: FUNCTION router_alert_info(p_run uuid)
REVOKE ALL ON FUNCTION public.router_alert_info(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_alert_info(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.router_alert_info(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_alert_info(p_run uuid) TO service_role;

-- acl: FUNCTION router_alert_unclaim(p_run uuid, p_parts text[])
REVOKE ALL ON FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) TO anon;
GRANT ALL ON FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) TO authenticated;
GRANT ALL ON FUNCTION public.router_alert_unclaim(p_run uuid, p_parts text[]) TO service_role;

-- acl: FUNCTION router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid)
REVOKE ALL ON FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) TO service_role;

-- acl: FUNCTION router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid)
REVOKE ALL ON FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_assign_many(p_ws uuid, p_contacts uuid[], p_owner uuid, p_by uuid) TO service_role;

-- acl: FUNCTION router_chat_add(p_ws uuid, p_messages jsonb)
REVOKE ALL ON FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) TO anon;
GRANT ALL ON FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.router_chat_add(p_ws uuid, p_messages jsonb) TO service_role;

-- acl: FUNCTION router_chat_clear(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_chat_clear(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_chat_clear(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_chat_clear(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_chat_clear(p_ws uuid) TO service_role;

-- acl: FUNCTION router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb)
REVOKE ALL ON FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb) TO anon;
GRANT ALL ON FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version integer, p_result jsonb, p_steps jsonb, p_facts jsonb, p_ms integer, p_set_company boolean, p_by_user uuid, p_pick jsonb) TO service_role;

-- acl: FUNCTION router_crm_user(p_ws uuid, p_crm text)
REVOKE ALL ON FUNCTION public.router_crm_user(p_ws uuid, p_crm text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_crm_user(p_ws uuid, p_crm text) TO anon;
GRANT ALL ON FUNCTION public.router_crm_user(p_ws uuid, p_crm text) TO authenticated;
GRANT ALL ON FUNCTION public.router_crm_user(p_ws uuid, p_crm text) TO service_role;

-- acl: FUNCTION router_draft_drop(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_draft_drop(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_draft_drop(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_draft_drop(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_draft_drop(p_ws uuid) TO service_role;

-- acl: FUNCTION router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid)
REVOKE ALL ON FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_draft_save(p_ws uuid, p_body jsonb, p_revision integer, p_user uuid) TO service_role;

-- acl: FUNCTION router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text)
REVOKE ALL ON FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO anon;
GRANT ALL ON FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO authenticated;
GRANT ALL ON FUNCTION public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO service_role;

-- acl: FUNCTION router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text)
REVOKE ALL ON FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO anon;
GRANT ALL ON FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO authenticated;
GRANT ALL ON FUNCTION public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO service_role;

-- acl: FUNCTION router_facts_more(p_contact uuid)
REVOKE ALL ON FUNCTION public.router_facts_more(p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_facts_more(p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.router_facts_more(p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_facts_more(p_contact uuid) TO service_role;

-- acl: FUNCTION router_fields_src(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_fields_src(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_fields_src(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_fields_src(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_fields_src(p_ws uuid) TO service_role;

-- acl: FUNCTION router_lists_save(p_ws uuid, p_allow text[], p_block text[])
REVOKE ALL ON FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) TO anon;
GRANT ALL ON FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) TO authenticated;
GRANT ALL ON FUNCTION public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) TO service_role;

-- acl: FUNCTION router_live(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_live(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_live(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_live(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_live(p_ws uuid) TO service_role;

-- acl: FUNCTION router_live_screen(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_live_screen(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_live_screen(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_live_screen(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_live_screen(p_ws uuid) TO service_role;

-- acl: FUNCTION router_members(p_ws uuid)
REVOKE ALL ON FUNCTION public.router_members(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_members(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.router_members(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_members(p_ws uuid) TO service_role;

-- acl: FUNCTION router_owner_user(p_ws uuid, p_value text)
REVOKE ALL ON FUNCTION public.router_owner_user(p_ws uuid, p_value text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_owner_user(p_ws uuid, p_value text) TO anon;
GRANT ALL ON FUNCTION public.router_owner_user(p_ws uuid, p_value text) TO authenticated;
GRANT ALL ON FUNCTION public.router_owner_user(p_ws uuid, p_value text) TO service_role;

-- acl: FUNCTION router_pause(p_ws uuid, p_paused boolean, p_user uuid)
REVOKE ALL ON FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_pause(p_ws uuid, p_paused boolean, p_user uuid) TO service_role;

-- acl: FUNCTION router_pick(p_ws uuid, p_pick jsonb)
REVOKE ALL ON FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) TO anon;
GRANT ALL ON FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.router_pick(p_ws uuid, p_pick jsonb) TO service_role;

-- acl: FUNCTION router_prune()
REVOKE ALL ON FUNCTION public.router_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_prune() TO anon;
GRANT ALL ON FUNCTION public.router_prune() TO authenticated;
GRANT ALL ON FUNCTION public.router_prune() TO service_role;

-- acl: FUNCTION router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean)
REVOKE ALL ON FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean) TO anon;
GRANT ALL ON FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean) TO authenticated;
GRANT ALL ON FUNCTION public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean) TO service_role;

-- acl: FUNCTION router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid)
REVOKE ALL ON FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid) TO anon;
GRANT ALL ON FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[], p_import uuid) TO service_role;

-- acl: FUNCTION router_recent(p_ws uuid, p_contact uuid, p_minutes integer)
REVOKE ALL ON FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer) TO anon;
GRANT ALL ON FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer) TO authenticated;
GRANT ALL ON FUNCTION public.router_recent(p_ws uuid, p_contact uuid, p_minutes integer) TO service_role;

-- acl: FUNCTION router_rep_facts(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_rep_facts(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb)
REVOKE ALL ON FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) TO service_role;

-- acl: FUNCTION router_runs_wake_notify()
REVOKE ALL ON FUNCTION public.router_runs_wake_notify() FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_runs_wake_notify() TO anon;
GRANT ALL ON FUNCTION public.router_runs_wake_notify() TO authenticated;
GRANT ALL ON FUNCTION public.router_runs_wake_notify() TO service_role;

-- acl: FUNCTION router_sla_acted(p_run uuid)
REVOKE ALL ON FUNCTION public.router_sla_acted(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_acted(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.router_sla_acted(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_acted(p_run uuid) TO service_role;

-- acl: FUNCTION router_sla_due()
REVOKE ALL ON FUNCTION public.router_sla_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_due() TO anon;
GRANT ALL ON FUNCTION public.router_sla_due() TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_due() TO service_role;

-- acl: FUNCTION router_sla_info(p_run uuid)
REVOKE ALL ON FUNCTION public.router_sla_info(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_info(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.router_sla_info(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_info(p_run uuid) TO service_role;

-- acl: FUNCTION router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_mark(p_ws uuid, p_contact uuid, p_user uuid) TO service_role;

-- acl: FUNCTION router_sla_start()
REVOKE ALL ON FUNCTION public.router_sla_start() FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_start() TO anon;
GRANT ALL ON FUNCTION public.router_sla_start() TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_start() TO service_role;

-- acl: FUNCTION router_sla_undone()
REVOKE ALL ON FUNCTION public.router_sla_undone() FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_sla_undone() TO anon;
GRANT ALL ON FUNCTION public.router_sla_undone() TO authenticated;
GRANT ALL ON FUNCTION public.router_sla_undone() TO service_role;

-- acl: FUNCTION router_spam(p_ws uuid, p_contacts uuid[])
REVOKE ALL ON FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) TO anon;
GRANT ALL ON FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.router_spam(p_ws uuid, p_contacts uuid[]) TO service_role;

-- acl: FUNCTION router_stats(p_ws uuid, p_days integer)
REVOKE ALL ON FUNCTION public.router_stats(p_ws uuid, p_days integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_stats(p_ws uuid, p_days integer) TO anon;
GRANT ALL ON FUNCTION public.router_stats(p_ws uuid, p_days integer) TO authenticated;
GRANT ALL ON FUNCTION public.router_stats(p_ws uuid, p_days integer) TO service_role;

-- acl: FUNCTION router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb)
REVOKE ALL ON FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) TO anon;
GRANT ALL ON FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) TO service_role;

-- acl: FUNCTION router_undo(p_ws uuid, p_contact uuid)
REVOKE ALL ON FUNCTION public.router_undo(p_ws uuid, p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.router_undo(p_ws uuid, p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.router_undo(p_ws uuid, p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.router_undo(p_ws uuid, p_contact uuid) TO service_role;

-- acl: FUNCTION routing_abandon_minutes(p_source uuid)
REVOKE ALL ON FUNCTION public.routing_abandon_minutes(p_source uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_abandon_minutes(p_source uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_abandon_minutes(p_source uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_abandon_minutes(p_source uuid) TO service_role;

-- acl: FUNCTION routing_booking_abandon(p_run uuid)
REVOKE ALL ON FUNCTION public.routing_booking_abandon(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_booking_abandon(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_booking_abandon(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_booking_abandon(p_run uuid) TO service_role;

-- acl: FUNCTION routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) TO service_role;

-- acl: FUNCTION routing_booking_touch(p_ws uuid, p_key text)
REVOKE ALL ON FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) TO anon;
GRANT ALL ON FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_booking_touch(p_ws uuid, p_key text) TO service_role;

-- acl: FUNCTION routing_commit(p jsonb)
REVOKE ALL ON FUNCTION public.routing_commit(p jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_commit(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.routing_commit(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.routing_commit(p jsonb) TO service_role;

-- acl: FUNCTION routing_default_policy(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_default_policy(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_default_policy(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_default_policy(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_default_policy(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_draft_drop(p_ws uuid, p_policy uuid)
REVOKE ALL ON FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_draft_drop(p_ws uuid, p_policy uuid) TO service_role;

-- acl: FUNCTION routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision integer, p_user uuid) TO service_role;

-- acl: FUNCTION routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text)
REVOKE ALL ON FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) TO anon;
GRANT ALL ON FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) TO service_role;

-- acl: FUNCTION routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision integer, p_tested text, p_version integer, p_source uuid, p_deps jsonb, p_result jsonb, p_user uuid) TO service_role;

-- acl: FUNCTION routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text)
REVOKE ALL ON FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO anon;
GRANT ALL ON FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text, p_email_class text) TO service_role;

-- acl: FUNCTION routing_followup(p_ws uuid, p_run uuid, p_purpose text)
REVOKE ALL ON FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) TO anon;
GRANT ALL ON FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) TO service_role;

-- acl: FUNCTION routing_followups_done(p_ws uuid, p_run uuid)
REVOKE ALL ON FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_followups_done(p_ws uuid, p_run uuid) TO service_role;

-- acl: FUNCTION routing_form_made()
REVOKE ALL ON FUNCTION public.routing_form_made() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_form_made() TO anon;
GRANT ALL ON FUNCTION public.routing_form_made() TO authenticated;
GRANT ALL ON FUNCTION public.routing_form_made() TO service_role;

-- acl: FUNCTION routing_form_published()
REVOKE ALL ON FUNCTION public.routing_form_published() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_form_published() TO anon;
GRANT ALL ON FUNCTION public.routing_form_published() TO authenticated;
GRANT ALL ON FUNCTION public.routing_form_published() TO service_role;

-- acl: FUNCTION routing_handoff_run(p_ws uuid, p_key text)
REVOKE ALL ON FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) TO anon;
GRANT ALL ON FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_handoff_run(p_ws uuid, p_key text) TO service_role;

-- acl: FUNCTION routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision integer, p_user uuid) TO service_role;

-- acl: FUNCTION routing_handoff_status(p_ws uuid, p_run uuid)
REVOKE ALL ON FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_handoff_status(p_ws uuid, p_run uuid) TO service_role;

-- acl: FUNCTION routing_held(p_ws uuid, p_mode text, p_limit integer)
REVOKE ALL ON FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.routing_held(p_ws uuid, p_mode text, p_limit integer) TO service_role;

-- acl: FUNCTION routing_live(p_ws uuid, p_policy uuid)
REVOKE ALL ON FUNCTION public.routing_live(p_ws uuid, p_policy uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_live(p_ws uuid, p_policy uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_live(p_ws uuid, p_policy uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_live(p_ws uuid, p_policy uuid) TO service_role;

-- acl: FUNCTION routing_meeting_changed()
REVOKE ALL ON FUNCTION public.routing_meeting_changed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_meeting_changed() TO anon;
GRANT ALL ON FUNCTION public.routing_meeting_changed() TO authenticated;
GRANT ALL ON FUNCTION public.routing_meeting_changed() TO service_role;

-- acl: FUNCTION routing_meeting_failed()
REVOKE ALL ON FUNCTION public.routing_meeting_failed() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_meeting_failed() TO anon;
GRANT ALL ON FUNCTION public.routing_meeting_failed() TO authenticated;
GRANT ALL ON FUNCTION public.routing_meeting_failed() TO service_role;

-- acl: FUNCTION routing_meeting_made()
REVOKE ALL ON FUNCTION public.routing_meeting_made() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_meeting_made() TO anon;
GRANT ALL ON FUNCTION public.routing_meeting_made() TO authenticated;
GRANT ALL ON FUNCTION public.routing_meeting_made() TO service_role;

-- acl: FUNCTION routing_meeting_placed(p_events jsonb)
REVOKE ALL ON FUNCTION public.routing_meeting_placed(p_events jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_meeting_placed(p_events jsonb) TO anon;
GRANT ALL ON FUNCTION public.routing_meeting_placed(p_events jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.routing_meeting_placed(p_events jsonb) TO service_role;

-- acl: FUNCTION routing_member_state(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_member_state(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION routing_mirror_draft(p_policy uuid)
REVOKE ALL ON FUNCTION public.routing_mirror_draft(p_policy uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_mirror_draft(p_policy uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_mirror_draft(p_policy uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_mirror_draft(p_policy uuid) TO service_role;

-- acl: FUNCTION routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid)
REVOKE ALL ON FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) TO service_role;

-- acl: FUNCTION routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) TO service_role;

-- acl: FUNCTION routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) TO service_role;

-- acl: FUNCTION routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision integer, p_user uuid) TO service_role;

-- acl: FUNCTION routing_policy_get(p_ws uuid, p_policy uuid)
REVOKE ALL ON FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_policy_get(p_ws uuid, p_policy uuid) TO service_role;

-- acl: FUNCTION routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb)
REVOKE ALL ON FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb) TO anon;
GRANT ALL ON FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text, p_revision integer, p_clear_draft boolean, p_sources jsonb) TO service_role;

-- acl: FUNCTION routing_publish_lookup(p_policy uuid, p_key text)
REVOKE ALL ON FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) TO anon;
GRANT ALL ON FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_publish_lookup(p_policy uuid, p_key text) TO service_role;

-- acl: TABLE routing_quota
GRANT ALL ON TABLE public.routing_quota TO anon;
GRANT ALL ON TABLE public.routing_quota TO authenticated;
GRANT ALL ON TABLE public.routing_quota TO service_role;

-- acl: FUNCTION routing_quota_current(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_quota_current(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION routing_quota_used(p_ws uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_quota_used(p_ws uuid, p_user uuid) TO service_role;

-- acl: FUNCTION routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone)
REVOKE ALL ON FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.routing_reps_screen(p_ws uuid, p_day timestamp with time zone, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text)
REVOKE ALL ON FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text) TO anon;
GRANT ALL ON FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text, p_revision integer, p_op text) TO service_role;

-- acl: FUNCTION routing_reviewer_left()
REVOKE ALL ON FUNCTION public.routing_reviewer_left() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_reviewer_left() TO anon;
GRANT ALL ON FUNCTION public.routing_reviewer_left() TO authenticated;
GRANT ALL ON FUNCTION public.routing_reviewer_left() TO service_role;

-- acl: FUNCTION routing_reviews_child()
REVOKE ALL ON FUNCTION public.routing_reviews_child() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_reviews_child() TO anon;
GRANT ALL ON FUNCTION public.routing_reviews_child() TO authenticated;
GRANT ALL ON FUNCTION public.routing_reviews_child() TO service_role;

-- acl: FUNCTION routing_reviews_spam()
GRANT ALL ON FUNCTION public.routing_reviews_spam() TO anon;
GRANT ALL ON FUNCTION public.routing_reviews_spam() TO authenticated;
GRANT ALL ON FUNCTION public.routing_reviews_spam() TO service_role;

-- acl: FUNCTION routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text)
REVOKE ALL ON FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text) TO service_role;

-- acl: FUNCTION routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text)
REVOKE ALL ON FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text) TO anon;
GRANT ALL ON FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text) TO service_role;

-- acl: FUNCTION routing_runs_after()
REVOKE ALL ON FUNCTION public.routing_runs_after() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_runs_after() TO anon;
GRANT ALL ON FUNCTION public.routing_runs_after() TO authenticated;
GRANT ALL ON FUNCTION public.routing_runs_after() TO service_role;

-- acl: FUNCTION routing_runs_before()
REVOKE ALL ON FUNCTION public.routing_runs_before() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_runs_before() TO anon;
GRANT ALL ON FUNCTION public.routing_runs_before() TO authenticated;
GRANT ALL ON FUNCTION public.routing_runs_before() TO service_role;

-- acl: FUNCTION routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer)
REVOKE ALL ON FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamp with time zone, p_limit integer) TO service_role;

-- acl: FUNCTION routing_screen_policies(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_screen_policies(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_policies(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_policies(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_policies(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_screen_run(p_ws uuid, p_run uuid)
REVOKE ALL ON FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_run(p_ws uuid, p_run uuid) TO service_role;

-- acl: FUNCTION routing_screen_sources(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_screen_sources(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_sources(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_sources(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_sources(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_screen_teams(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_screen_teams(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_teams(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_teams(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_teams(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_screen_versions(p_ws uuid, p_policy uuid)
REVOKE ALL ON FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_screen_versions(p_ws uuid, p_policy uuid) TO service_role;

-- acl: FUNCTION routing_source_resolve(p_form uuid)
REVOKE ALL ON FUNCTION public.routing_source_resolve(p_form uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_source_resolve(p_form uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_source_resolve(p_form uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_source_resolve(p_form uuid) TO service_role;

-- acl: FUNCTION routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision integer, p_user uuid) TO service_role;

-- acl: FUNCTION routing_sync_logged()
REVOKE ALL ON FUNCTION public.routing_sync_logged() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_sync_logged() TO anon;
GRANT ALL ON FUNCTION public.routing_sync_logged() TO authenticated;
GRANT ALL ON FUNCTION public.routing_sync_logged() TO service_role;

-- acl: FUNCTION routing_sync_needed(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_sync_needed(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_sync_needed(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_sync_needed(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_sync_needed(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) TO service_role;

-- acl: FUNCTION routing_sync_teams(p_ws uuid, p_body jsonb)
REVOKE ALL ON FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.routing_sync_teams(p_ws uuid, p_body jsonb) TO service_role;

-- acl: FUNCTION routing_team_list(p_ws uuid)
REVOKE ALL ON FUNCTION public.routing_team_list(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_team_list(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_team_list(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_team_list(p_ws uuid) TO service_role;

-- acl: FUNCTION routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text)
REVOKE ALL ON FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text) TO anon;
GRANT ALL ON FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision integer, p_key text) TO service_role;

-- acl: FUNCTION routing_team_seed(p_ws uuid, p_team uuid)
REVOKE ALL ON FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) TO anon;
GRANT ALL ON FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) TO authenticated;
GRANT ALL ON FUNCTION public.routing_team_seed(p_ws uuid, p_team uuid) TO service_role;

-- acl: FUNCTION routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb)
REVOKE ALL ON FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) TO anon;
GRANT ALL ON FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) TO service_role;

-- acl: FUNCTION routing_versions_frozen()
REVOKE ALL ON FUNCTION public.routing_versions_frozen() FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_versions_frozen() TO anon;
GRANT ALL ON FUNCTION public.routing_versions_frozen() TO authenticated;
GRANT ALL ON FUNCTION public.routing_versions_frozen() TO service_role;

-- acl: FUNCTION routing_zone(p_tz text)
REVOKE ALL ON FUNCTION public.routing_zone(p_tz text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.routing_zone(p_tz text) TO anon;
GRANT ALL ON FUNCTION public.routing_zone(p_tz text) TO authenticated;
GRANT ALL ON FUNCTION public.routing_zone(p_tz text) TO service_role;

-- acl: FUNCTION rr_turns(p_type uuid)
REVOKE ALL ON FUNCTION public.rr_turns(p_type uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.rr_turns(p_type uuid) TO anon;
GRANT ALL ON FUNCTION public.rr_turns(p_type uuid) TO authenticated;
GRANT ALL ON FUNCTION public.rr_turns(p_type uuid) TO service_role;

-- acl: FUNCTION runs_alert()
REVOKE ALL ON FUNCTION public.runs_alert() FROM PUBLIC;
GRANT ALL ON FUNCTION public.runs_alert() TO anon;
GRANT ALL ON FUNCTION public.runs_alert() TO authenticated;
GRANT ALL ON FUNCTION public.runs_alert() TO service_role;

-- acl: FUNCTION runs_github_sync()
REVOKE ALL ON FUNCTION public.runs_github_sync() FROM PUBLIC;
GRANT ALL ON FUNCTION public.runs_github_sync() TO anon;
GRANT ALL ON FUNCTION public.runs_github_sync() TO authenticated;
GRANT ALL ON FUNCTION public.runs_github_sync() TO service_role;

-- acl: FUNCTION runs_wake()
REVOKE ALL ON FUNCTION public.runs_wake() FROM PUBLIC;
GRANT ALL ON FUNCTION public.runs_wake() TO anon;
GRANT ALL ON FUNCTION public.runs_wake() TO authenticated;
GRANT ALL ON FUNCTION public.runs_wake() TO service_role;

-- acl: FUNCTION save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean)
REVOKE ALL ON FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean) TO anon;
GRANT ALL ON FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean) TO authenticated;
GRANT ALL ON FUNCTION public.save_alert_settings(p_project uuid, p_emails text[], p_on_failure boolean, p_on_heal boolean, p_slack_sealed text, p_slack_hint text, p_clear_slack boolean) TO service_role;

-- acl: FUNCTION save_written_lock(p_run uuid, p_lock text)
REVOKE ALL ON FUNCTION public.save_written_lock(p_run uuid, p_lock text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_written_lock(p_run uuid, p_lock text) TO anon;
GRANT ALL ON FUNCTION public.save_written_lock(p_run uuid, p_lock text) TO authenticated;
GRANT ALL ON FUNCTION public.save_written_lock(p_run uuid, p_lock text) TO service_role;

-- acl: FUNCTION schedule_delete(p_ws uuid, p_user uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.schedule_delete(p_ws uuid, p_user uuid, p_id uuid) TO service_role;

-- acl: FUNCTION schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone)
GRANT ALL ON FUNCTION public.schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.schedule_next(p_every text, p_hour integer, p_minute integer, p_weekday integer, p_tz text, p_from timestamp with time zone) TO service_role;

-- acl: FUNCTION schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb)
REVOKE ALL ON FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) TO anon;
GRANT ALL ON FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.schedule_save(p_ws uuid, p_user uuid, p_id uuid, p_name text, p_tz text, p_weekly jsonb, p_overrides jsonb) TO service_role;

-- acl: FUNCTION scheduler_for(p_submission uuid, p_tool text)
REVOKE ALL ON FUNCTION public.scheduler_for(p_submission uuid, p_tool text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.scheduler_for(p_submission uuid, p_tool text) TO anon;
GRANT ALL ON FUNCTION public.scheduler_for(p_submission uuid, p_tool text) TO authenticated;
GRANT ALL ON FUNCTION public.scheduler_for(p_submission uuid, p_tool text) TO service_role;

-- acl: FUNCTION scheduler_link_ok(p_tool text, p_url text)
REVOKE ALL ON FUNCTION public.scheduler_link_ok(p_tool text, p_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.scheduler_link_ok(p_tool text, p_url text) TO anon;
GRANT ALL ON FUNCTION public.scheduler_link_ok(p_tool text, p_url text) TO authenticated;
GRANT ALL ON FUNCTION public.scheduler_link_ok(p_tool text, p_url text) TO service_role;

-- acl: FUNCTION scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text)
REVOKE ALL ON FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) TO anon;
GRANT ALL ON FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) TO authenticated;
GRANT ALL ON FUNCTION public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) TO service_role;

-- acl: FUNCTION schedules_prepare()
REVOKE ALL ON FUNCTION public.schedules_prepare() FROM PUBLIC;
GRANT ALL ON FUNCTION public.schedules_prepare() TO anon;
GRANT ALL ON FUNCTION public.schedules_prepare() TO authenticated;
GRANT ALL ON FUNCTION public.schedules_prepare() TO service_role;

-- acl: FUNCTION segment_members_event()
REVOKE ALL ON FUNCTION public.segment_members_event() FROM PUBLIC;
GRANT ALL ON FUNCTION public.segment_members_event() TO anon;
GRANT ALL ON FUNCTION public.segment_members_event() TO authenticated;
GRANT ALL ON FUNCTION public.segment_members_event() TO service_role;

-- acl: FUNCTION segment_refresh(p_id uuid)
REVOKE ALL ON FUNCTION public.segment_refresh(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.segment_refresh(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.segment_refresh(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.segment_refresh(p_id uuid) TO service_role;

-- acl: FUNCTION segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer)
REVOKE ALL ON FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) TO anon;
GRANT ALL ON FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) TO authenticated;
GRANT ALL ON FUNCTION public.segment_sql(p_ws uuid, p_node jsonb, p_path text[], p_depth integer) TO service_role;

-- acl: FUNCTION segment_where(p_ws uuid, p_rules jsonb)
REVOKE ALL ON FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) TO anon;
GRANT ALL ON FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.segment_where(p_ws uuid, p_rules jsonb) TO service_role;

-- acl: FUNCTION segments_due()
REVOKE ALL ON FUNCTION public.segments_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.segments_due() TO anon;
GRANT ALL ON FUNCTION public.segments_due() TO authenticated;
GRANT ALL ON FUNCTION public.segments_due() TO service_role;

-- acl: FUNCTION send_claim(p_ws uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.send_claim(p_ws uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_claim(p_ws uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.send_claim(p_ws uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.send_claim(p_ws uuid, p_limit integer) TO service_role;

-- acl: FUNCTION send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer)
REVOKE ALL ON FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer) TO anon;
GRANT ALL ON FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer) TO authenticated;
GRANT ALL ON FUNCTION public.send_done(p_id uuid, p_outcome text, p_provider_id text, p_error text, p_delay_s integer) TO service_role;

-- acl: FUNCTION send_done_many(p_rows jsonb)
REVOKE ALL ON FUNCTION public.send_done_many(p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_done_many(p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.send_done_many(p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.send_done_many(p_rows jsonb) TO service_role;

-- acl: FUNCTION send_resume(p_ws uuid)
REVOKE ALL ON FUNCTION public.send_resume(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_resume(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.send_resume(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_resume(p_ws uuid) TO service_role;

-- acl: TABLE send_settings
GRANT ALL ON TABLE public.send_settings TO anon;
GRANT ALL ON TABLE public.send_settings TO authenticated;
GRANT ALL ON TABLE public.send_settings TO service_role;

-- acl: FUNCTION send_settings_of(p_ws uuid)
REVOKE ALL ON FUNCTION public.send_settings_of(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_settings_of(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.send_settings_of(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.send_settings_of(p_ws uuid) TO service_role;

-- acl: FUNCTION send_settings_save(p_ws uuid, p_values jsonb)
REVOKE ALL ON FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) TO anon;
GRANT ALL ON FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.send_settings_save(p_ws uuid, p_values jsonb) TO service_role;

-- acl: TABLE sending_domains
GRANT ALL ON TABLE public.sending_domains TO anon;
GRANT ALL ON TABLE public.sending_domains TO authenticated;
GRANT ALL ON TABLE public.sending_domains TO service_role;

-- acl: FUNCTION sending_domain_add(p_ws uuid, p_domain text)
REVOKE ALL ON FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) TO anon;
GRANT ALL ON FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) TO authenticated;
GRANT ALL ON FUNCTION public.sending_domain_add(p_ws uuid, p_domain text) TO service_role;

-- acl: FUNCTION sending_domain_check_now(p_id uuid)
REVOKE ALL ON FUNCTION public.sending_domain_check_now(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_domain_check_now(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sending_domain_check_now(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sending_domain_check_now(p_id uuid) TO service_role;

-- acl: FUNCTION sending_domain_load(p_id uuid)
REVOKE ALL ON FUNCTION public.sending_domain_load(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_domain_load(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sending_domain_load(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sending_domain_load(p_id uuid) TO service_role;

-- acl: FUNCTION sending_domain_remove(p_id uuid)
REVOKE ALL ON FUNCTION public.sending_domain_remove(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_domain_remove(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.sending_domain_remove(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.sending_domain_remove(p_id uuid) TO service_role;

-- acl: FUNCTION sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text)
REVOKE ALL ON FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.sending_domain_update(p_id uuid, p_provider_id text, p_records jsonb, p_status text, p_error text) TO service_role;

-- acl: FUNCTION sends_due()
REVOKE ALL ON FUNCTION public.sends_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sends_due() TO anon;
GRANT ALL ON FUNCTION public.sends_due() TO authenticated;
GRANT ALL ON FUNCTION public.sends_due() TO service_role;

-- acl: FUNCTION set_secret(p_env uuid, p_name text, p_sealed text)
REVOKE ALL ON FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.set_secret(p_env uuid, p_name text, p_sealed text) TO service_role;

-- acl: FUNCTION site_daily_roll(p_ws uuid, p_day date)
REVOKE ALL ON FUNCTION public.site_daily_roll(p_ws uuid, p_day date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.site_daily_roll(p_ws uuid, p_day date) TO anon;
GRANT ALL ON FUNCTION public.site_daily_roll(p_ws uuid, p_day date) TO authenticated;
GRANT ALL ON FUNCTION public.site_daily_roll(p_ws uuid, p_day date) TO service_role;

-- acl: FUNCTION site_health(p_ws uuid)
REVOKE ALL ON FUNCTION public.site_health(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.site_health(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.site_health(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.site_health(p_ws uuid) TO service_role;

-- acl: FUNCTION slack_book_info(p_ws uuid, p_user uuid, p_email text)
REVOKE ALL ON FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.slack_book_info(p_ws uuid, p_user uuid, p_email text) TO service_role;

-- acl: FUNCTION slack_caller(p_team text, p_email text)
REVOKE ALL ON FUNCTION public.slack_caller(p_team text, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slack_caller(p_team text, p_email text) TO anon;
GRANT ALL ON FUNCTION public.slack_caller(p_team text, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.slack_caller(p_team text, p_email text) TO service_role;

-- acl: FUNCTION slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text)
REVOKE ALL ON FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.slack_install_save(p_ws uuid, p_user uuid, p_team text, p_team_name text, p_bot text, p_sealed text) TO service_role;

-- acl: FUNCTION slack_install_token(p_team text)
REVOKE ALL ON FUNCTION public.slack_install_token(p_team text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.slack_install_token(p_team text) TO anon;
GRANT ALL ON FUNCTION public.slack_install_token(p_team text) TO authenticated;
GRANT ALL ON FUNCTION public.slack_install_token(p_team text) TO service_role;

-- acl: FUNCTION source_class(p_kind text)
REVOKE ALL ON FUNCTION public.source_class(p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_class(p_kind text) TO anon;
GRANT ALL ON FUNCTION public.source_class(p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.source_class(p_kind text) TO service_role;

-- acl: FUNCTION source_columns_save(p_id uuid, p_object text, p_cols jsonb)
REVOKE ALL ON FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) TO anon;
GRANT ALL ON FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.source_columns_save(p_id uuid, p_object text, p_cols jsonb) TO service_role;

-- acl: FUNCTION source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text)
REVOKE ALL ON FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text) TO anon;
GRANT ALL ON FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.source_connect(p_ws uuid, p_user uuid, p_kind text, p_name text, p_account text, p_sealed text, p_settings jsonb, p_hook_sealed text) TO service_role;

-- acl: FUNCTION source_cursor_save(p_id uuid, p_object text, p_cursor jsonb)
REVOKE ALL ON FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) TO anon;
GRANT ALL ON FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.source_cursor_save(p_id uuid, p_object text, p_cursor jsonb) TO service_role;

-- acl: FUNCTION source_disconnect(p_id uuid)
REVOKE ALL ON FUNCTION public.source_disconnect(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_disconnect(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.source_disconnect(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.source_disconnect(p_id uuid) TO service_role;

-- acl: FUNCTION source_links_delete(p_source uuid, p_object text, p_external text[])
REVOKE ALL ON FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) TO anon;
GRANT ALL ON FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) TO authenticated;
GRANT ALL ON FUNCTION public.source_links_delete(p_source uuid, p_object text, p_external text[]) TO service_role;

-- acl: FUNCTION source_links_get(p_source uuid, p_object text, p_external text[])
REVOKE ALL ON FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) TO anon;
GRANT ALL ON FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) TO authenticated;
GRANT ALL ON FUNCTION public.source_links_get(p_source uuid, p_object text, p_external text[]) TO service_role;

-- acl: FUNCTION source_links_put(p_source uuid, p_object text, p_rows jsonb)
REVOKE ALL ON FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.source_links_put(p_source uuid, p_object text, p_rows jsonb) TO service_role;

-- acl: FUNCTION source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean)
REVOKE ALL ON FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) TO anon;
GRANT ALL ON FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) TO authenticated;
GRANT ALL ON FUNCTION public.source_list_sync(p_source uuid, p_external text, p_name text, p_emails text[], p_replace boolean) TO service_role;

-- acl: FUNCTION source_load(p_id uuid)
REVOKE ALL ON FUNCTION public.source_load(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_load(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.source_load(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.source_load(p_id uuid) TO service_role;

-- acl: FUNCTION source_push_cursor_save(p_id uuid, p_cursor text)
REVOKE ALL ON FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) TO anon;
GRANT ALL ON FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) TO authenticated;
GRANT ALL ON FUNCTION public.source_push_cursor_save(p_id uuid, p_cursor text) TO service_role;

-- acl: FUNCTION source_ran(p_id uuid, p_error text)
REVOKE ALL ON FUNCTION public.source_ran(p_id uuid, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_ran(p_id uuid, p_error text) TO anon;
GRANT ALL ON FUNCTION public.source_ran(p_id uuid, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.source_ran(p_id uuid, p_error text) TO service_role;

-- acl: FUNCTION source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text)
REVOKE ALL ON FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) TO anon;
GRANT ALL ON FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.source_run_log(p_id uuid, p_object text, p_direction text, p_started timestamp with time zone, p_counts jsonb, p_error text) TO service_role;

-- acl: FUNCTION source_secret_save(p_id uuid, p_sealed text)
REVOKE ALL ON FUNCTION public.source_secret_save(p_id uuid, p_sealed text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.source_secret_save(p_id uuid, p_sealed text) TO anon;
GRANT ALL ON FUNCTION public.source_secret_save(p_id uuid, p_sealed text) TO authenticated;
GRANT ALL ON FUNCTION public.source_secret_save(p_id uuid, p_sealed text) TO service_role;

-- acl: FUNCTION source_settings_ok(p jsonb)
GRANT ALL ON FUNCTION public.source_settings_ok(p jsonb) TO anon;
GRANT ALL ON FUNCTION public.source_settings_ok(p jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.source_settings_ok(p jsonb) TO service_role;

-- acl: FUNCTION sources_due()
REVOKE ALL ON FUNCTION public.sources_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sources_due() TO anon;
GRANT ALL ON FUNCTION public.sources_due() TO authenticated;
GRANT ALL ON FUNCTION public.sources_due() TO service_role;

-- acl: FUNCTION start_run(p_test uuid, p_env uuid, p_trigger text)
REVOKE ALL ON FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text) TO anon;
GRANT ALL ON FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text) TO authenticated;
GRANT ALL ON FUNCTION public.start_run(p_test uuid, p_env uuid, p_trigger text) TO service_role;

-- acl: FUNCTION submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb)
REVOKE ALL ON FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) TO anon;
GRANT ALL ON FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submission_accept(p_sid uuid, p_contact jsonb, p_consent jsonb) TO service_role;

-- acl: FUNCTION submission_not_booked(p_submission uuid)
REVOKE ALL ON FUNCTION public.submission_not_booked(p_submission uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_not_booked(p_submission uuid) TO anon;
GRANT ALL ON FUNCTION public.submission_not_booked(p_submission uuid) TO authenticated;
GRANT ALL ON FUNCTION public.submission_not_booked(p_submission uuid) TO service_role;

-- acl: FUNCTION submission_payment(p_sid uuid, p_patch jsonb)
REVOKE ALL ON FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) TO anon;
GRANT ALL ON FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submission_payment(p_sid uuid, p_patch jsonb) TO service_role;

-- acl: FUNCTION submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb)
REVOKE ALL ON FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) TO anon;
GRANT ALL ON FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submission_release(p_sid uuid, p_contact jsonb, p_consent jsonb) TO service_role;

-- acl: FUNCTION submission_result_get(p_sid uuid)
REVOKE ALL ON FUNCTION public.submission_result_get(p_sid uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_result_get(p_sid uuid) TO anon;
GRANT ALL ON FUNCTION public.submission_result_get(p_sid uuid) TO authenticated;
GRANT ALL ON FUNCTION public.submission_result_get(p_sid uuid) TO service_role;

-- acl: FUNCTION submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb)
REVOKE ALL ON FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) TO anon;
GRANT ALL ON FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.submission_result_save(p_sid uuid, p_engine integer, p_outcome_id text, p_outcome_title text, p_values jsonb, p_constants jsonb) TO service_role;

-- acl: FUNCTION submissions_count()
REVOKE ALL ON FUNCTION public.submissions_count() FROM PUBLIC;
GRANT ALL ON FUNCTION public.submissions_count() TO anon;
GRANT ALL ON FUNCTION public.submissions_count() TO authenticated;
GRANT ALL ON FUNCTION public.submissions_count() TO service_role;

-- acl: FUNCTION submissions_delete(p_ids uuid[])
REVOKE ALL ON FUNCTION public.submissions_delete(p_ids uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submissions_delete(p_ids uuid[]) TO anon;
GRANT ALL ON FUNCTION public.submissions_delete(p_ids uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.submissions_delete(p_ids uuid[]) TO service_role;

-- acl: FUNCTION submissions_first_touch()
REVOKE ALL ON FUNCTION public.submissions_first_touch() FROM PUBLIC;
GRANT ALL ON FUNCTION public.submissions_first_touch() TO anon;
GRANT ALL ON FUNCTION public.submissions_first_touch() TO authenticated;
GRANT ALL ON FUNCTION public.submissions_first_touch() TO service_role;

-- acl: FUNCTION submissions_mark_spam(p_ids uuid[], p_spam boolean)
REVOKE ALL ON FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) TO anon;
GRANT ALL ON FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) TO authenticated;
GRANT ALL ON FUNCTION public.submissions_mark_spam(p_ids uuid[], p_spam boolean) TO service_role;

-- acl: FUNCTION submissions_webhooks()
REVOKE ALL ON FUNCTION public.submissions_webhooks() FROM PUBLIC;
GRANT ALL ON FUNCTION public.submissions_webhooks() TO anon;
GRANT ALL ON FUNCTION public.submissions_webhooks() TO authenticated;
GRANT ALL ON FUNCTION public.submissions_webhooks() TO service_role;

-- acl: FUNCTION suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid)
REVOKE ALL ON FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO anon;
GRANT ALL ON FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO authenticated;
GRANT ALL ON FUNCTION public.suppress(p_ws uuid, p_source text, p_rows jsonb, p_import uuid) TO service_role;

-- acl: FUNCTION sync_log_add(p_source uuid, p_rows jsonb)
REVOKE ALL ON FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) TO anon;
GRANT ALL ON FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.sync_log_add(p_source uuid, p_rows jsonb) TO service_role;

-- acl: FUNCTION sync_retry(p_ids bigint[])
REVOKE ALL ON FUNCTION public.sync_retry(p_ids bigint[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_retry(p_ids bigint[]) TO anon;
GRANT ALL ON FUNCTION public.sync_retry(p_ids bigint[]) TO authenticated;
GRANT ALL ON FUNCTION public.sync_retry(p_ids bigint[]) TO service_role;

-- acl: FUNCTION team(p_ws uuid)
REVOKE ALL ON FUNCTION public.team(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.team(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.team(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.team(p_ws uuid) TO service_role;

-- acl: FUNCTION test_bump()
REVOKE ALL ON FUNCTION public.test_bump() FROM PUBLIC;
GRANT ALL ON FUNCTION public.test_bump() TO anon;
GRANT ALL ON FUNCTION public.test_bump() TO authenticated;
GRANT ALL ON FUNCTION public.test_bump() TO service_role;

-- acl: FUNCTION test_save_version()
REVOKE ALL ON FUNCTION public.test_save_version() FROM PUBLIC;
GRANT ALL ON FUNCTION public.test_save_version() TO anon;
GRANT ALL ON FUNCTION public.test_save_version() TO authenticated;
GRANT ALL ON FUNCTION public.test_save_version() TO service_role;

-- acl: FUNCTION text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text)
REVOKE ALL ON FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) TO anon;
GRANT ALL ON FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) TO authenticated;
GRANT ALL ON FUNCTION public.text_consent_add(p_ws uuid, p_contact uuid, p_email text, p_phone text, p_wording text, p_source text) TO service_role;

-- acl: FUNCTION text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text)
REVOKE ALL ON FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.text_done(p_id uuid, p_status text, p_sid text, p_from text, p_error text) TO service_role;

-- acl: FUNCTION text_optout(p_sender text, p_phone text, p_stop boolean)
REVOKE ALL ON FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) TO anon;
GRANT ALL ON FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) TO authenticated;
GRANT ALL ON FUNCTION public.text_optout(p_sender text, p_phone text, p_stop boolean) TO service_role;

-- acl: FUNCTION text_source_for(p_account text)
REVOKE ALL ON FUNCTION public.text_source_for(p_account text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_source_for(p_account text) TO anon;
GRANT ALL ON FUNCTION public.text_source_for(p_account text) TO authenticated;
GRANT ALL ON FUNCTION public.text_source_for(p_account text) TO service_role;

-- acl: FUNCTION text_status(p_sid text, p_status text, p_error text)
REVOKE ALL ON FUNCTION public.text_status(p_sid text, p_status text, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_status(p_sid text, p_status text, p_error text) TO anon;
GRANT ALL ON FUNCTION public.text_status(p_sid text, p_status text, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.text_status(p_sid text, p_status text, p_error text) TO service_role;

-- acl: FUNCTION text_take(p_id uuid)
REVOKE ALL ON FUNCTION public.text_take(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.text_take(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.text_take(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.text_take(p_id uuid) TO service_role;

-- acl: FUNCTION topic_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.topic_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.topic_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.topic_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.topic_delete(p_id uuid) TO service_role;

-- acl: FUNCTION topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean)
REVOKE ALL ON FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) TO anon;
GRANT ALL ON FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) TO authenticated;
GRANT ALL ON FUNCTION public.topic_save(p_ws uuid, p_id uuid, p_name text, p_default_on boolean) TO service_role;

-- acl: FUNCTION touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone)
GRANT ALL ON FUNCTION public.touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.touch_from_fill(h jsonb, p_form uuid, p_at timestamp with time zone) TO service_role;

-- acl: FUNCTION track_booked(p_sub uuid)
REVOKE ALL ON FUNCTION public.track_booked(p_sub uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.track_booked(p_sub uuid) TO anon;
GRANT ALL ON FUNCTION public.track_booked(p_sub uuid) TO authenticated;
GRANT ALL ON FUNCTION public.track_booked(p_sub uuid) TO service_role;

-- acl: FUNCTION track_keep(p_sub uuid, p_info jsonb)
REVOKE ALL ON FUNCTION public.track_keep(p_sub uuid, p_info jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.track_keep(p_sub uuid, p_info jsonb) TO anon;
GRANT ALL ON FUNCTION public.track_keep(p_sub uuid, p_info jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.track_keep(p_sub uuid, p_info jsonb) TO service_role;

-- acl: FUNCTION track_prune()
REVOKE ALL ON FUNCTION public.track_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.track_prune() TO anon;
GRANT ALL ON FUNCTION public.track_prune() TO authenticated;
GRANT ALL ON FUNCTION public.track_prune() TO service_role;

-- acl: FUNCTION track_take(p_sub uuid)
REVOKE ALL ON FUNCTION public.track_take(p_sub uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.track_take(p_sub uuid) TO anon;
GRANT ALL ON FUNCTION public.track_take(p_sub uuid) TO authenticated;
GRANT ALL ON FUNCTION public.track_take(p_sub uuid) TO service_role;

-- acl: FUNCTION try_numeric(v text)
GRANT ALL ON FUNCTION public.try_numeric(v text) TO anon;
GRANT ALL ON FUNCTION public.try_numeric(v text) TO authenticated;
GRANT ALL ON FUNCTION public.try_numeric(v text) TO service_role;

-- acl: FUNCTION try_timestamptz(v text)
GRANT ALL ON FUNCTION public.try_timestamptz(v text) TO anon;
GRANT ALL ON FUNCTION public.try_timestamptz(v text) TO authenticated;
GRANT ALL ON FUNCTION public.try_timestamptz(v text) TO service_role;

-- acl: FUNCTION verified_domain_for(p_ws uuid, p_email text)
REVOKE ALL ON FUNCTION public.verified_domain_for(p_ws uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.verified_domain_for(p_ws uuid, p_email text) TO anon;
GRANT ALL ON FUNCTION public.verified_domain_for(p_ws uuid, p_email text) TO authenticated;
GRANT ALL ON FUNCTION public.verified_domain_for(p_ws uuid, p_email text) TO service_role;

-- acl: FUNCTION visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer)
REVOKE ALL ON FUNCTION public.visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.visitors_list(p_ws uuid, p_show text, p_before timestamp with time zone, p_limit integer) TO service_role;

-- acl: FUNCTION visitors_live(p_ws uuid, p_hours integer, p_limit integer)
REVOKE ALL ON FUNCTION public.visitors_live(p_ws uuid, p_hours integer, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.visitors_live(p_ws uuid, p_hours integer, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.visitors_live(p_ws uuid, p_hours integer, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.visitors_live(p_ws uuid, p_hours integer, p_limit integer) TO service_role;

-- acl: FUNCTION wake_runner()
REVOKE ALL ON FUNCTION public.wake_runner() FROM PUBLIC;
GRANT ALL ON FUNCTION public.wake_runner() TO anon;
GRANT ALL ON FUNCTION public.wake_runner() TO authenticated;
GRANT ALL ON FUNCTION public.wake_runner() TO service_role;

-- acl: FUNCTION web_daily()
REVOKE ALL ON FUNCTION public.web_daily() FROM PUBLIC;
GRANT ALL ON FUNCTION public.web_daily() TO anon;
GRANT ALL ON FUNCTION public.web_daily() TO authenticated;
GRANT ALL ON FUNCTION public.web_daily() TO service_role;

-- acl: FUNCTION webhook_delete(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_delete(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_deliveries_list(p_ws uuid, p_endpoint uuid, p_limit integer) TO service_role;

-- acl: FUNCTION webhook_done(p_id uuid, p_status text, p_code integer, p_error text)
REVOKE ALL ON FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) TO anon;
GRANT ALL ON FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_done(p_id uuid, p_status text, p_code integer, p_error text) TO service_role;

-- acl: FUNCTION webhook_freeze(p_id uuid, p_body jsonb)
REVOKE ALL ON FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_freeze(p_id uuid, p_body jsonb) TO service_role;

-- acl: FUNCTION webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb)
REVOKE ALL ON FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) TO anon;
GRANT ALL ON FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_meeting_body(p_meeting uuid, p_event text, p_event_id bigint, p_at timestamp with time zone, p_detail jsonb) TO service_role;

-- acl: FUNCTION webhook_prune()
REVOKE ALL ON FUNCTION public.webhook_prune() FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_prune() TO anon;
GRANT ALL ON FUNCTION public.webhook_prune() TO authenticated;
GRANT ALL ON FUNCTION public.webhook_prune() TO service_role;

-- acl: FUNCTION webhook_resend(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_resend(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone)
REVOKE ALL ON FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_routed_body(p_id uuid, p_ws uuid, p_contact uuid, p_kind text, p_data jsonb, p_at timestamp with time zone) TO service_role;

-- acl: FUNCTION webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid)
REVOKE ALL ON FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) TO anon;
GRANT ALL ON FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_save(p_ws uuid, p_id uuid, p_host text, p_sealed text, p_hint text, p_events text[], p_description text, p_active boolean, p_by uuid) TO service_role;

-- acl: FUNCTION webhook_sealed(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_sealed(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION webhook_take(p_id uuid)
REVOKE ALL ON FUNCTION public.webhook_take(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_take(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.webhook_take(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_take(p_id uuid) TO service_role;

-- acl: FUNCTION webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb)
REVOKE ALL ON FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) TO anon;
GRANT ALL ON FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.webhook_test_add(p_ws uuid, p_endpoint uuid, p_event text, p_body jsonb) TO service_role;

-- acl: FUNCTION webhooks_list(p_ws uuid)
REVOKE ALL ON FUNCTION public.webhooks_list(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.webhooks_list(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.webhooks_list(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.webhooks_list(p_ws uuid) TO service_role;

-- acl: FUNCTION workflow_claim(p_ws uuid, p_limit integer)
REVOKE ALL ON FUNCTION public.workflow_claim(p_ws uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_claim(p_ws uuid, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.workflow_claim(p_ws uuid, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_claim(p_ws uuid, p_limit integer) TO service_role;

-- acl: FUNCTION workflow_defaults(p_ws uuid, p_items jsonb)
REVOKE ALL ON FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) TO anon;
GRANT ALL ON FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_defaults(p_ws uuid, p_items jsonb) TO service_role;

-- acl: FUNCTION workflow_delete(p_id uuid)
REVOKE ALL ON FUNCTION public.workflow_delete(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_delete(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_delete(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_delete(p_id uuid) TO service_role;

-- acl: FUNCTION workflow_due()
REVOKE ALL ON FUNCTION public.workflow_due() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_due() TO anon;
GRANT ALL ON FUNCTION public.workflow_due() TO authenticated;
GRANT ALL ON FUNCTION public.workflow_due() TO service_role;

-- acl: FUNCTION workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text)
REVOKE ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) TO anon;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) TO service_role;

-- acl: FUNCTION workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid)
REVOKE ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text, p_from_user uuid) TO service_role;

-- acl: FUNCTION workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone)
REVOKE ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) TO anon;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone) TO service_role;

-- acl: FUNCTION workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text)
REVOKE ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) TO anon;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_event_since(p_run uuid, p_kind text, p_since timestamp with time zone, p_name text) TO service_role;

-- acl: FUNCTION workflow_facts(p_run uuid)
REVOKE ALL ON FUNCTION public.workflow_facts(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_facts(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_facts(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_facts(p_run uuid) TO service_role;

-- acl: FUNCTION workflow_folder_delete(p_ws uuid, p_id uuid)
REVOKE ALL ON FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_folder_delete(p_ws uuid, p_id uuid) TO service_role;

-- acl: FUNCTION workflow_folder_move(p_ws uuid, p_id uuid, p_by integer)
REVOKE ALL ON FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) TO anon;
GRANT ALL ON FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_folder_move(p_ws uuid, p_id uuid, p_by integer) TO service_role;

-- acl: FUNCTION workflow_folder_save(p_ws uuid, p_id uuid, p_name text)
REVOKE ALL ON FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) TO anon;
GRANT ALL ON FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_folder_save(p_ws uuid, p_id uuid, p_name text) TO service_role;

-- acl: FUNCTION workflow_folders_start(p_ws uuid)
REVOKE ALL ON FUNCTION public.workflow_folders_start(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_folders_start(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_folders_start(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_folders_start(p_ws uuid) TO service_role;

-- acl: FUNCTION workflow_follow(p_run uuid, p_contact uuid)
REVOKE ALL ON FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_follow(p_run uuid, p_contact uuid) TO service_role;

-- acl: FUNCTION workflow_list(p_run uuid, p_action text, p_segment uuid)
REVOKE ALL ON FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_list(p_run uuid, p_action text, p_segment uuid) TO service_role;

-- acl: FUNCTION workflow_may_start(p_workflow uuid, p_contact uuid)
REVOKE ALL ON FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_may_start(p_workflow uuid, p_contact uuid) TO service_role;

-- acl: FUNCTION workflow_meeting_changed()
GRANT ALL ON FUNCTION public.workflow_meeting_changed() TO anon;
GRANT ALL ON FUNCTION public.workflow_meeting_changed() TO authenticated;
GRANT ALL ON FUNCTION public.workflow_meeting_changed() TO service_role;

-- acl: FUNCTION workflow_meetings(p_run uuid)
REVOKE ALL ON FUNCTION public.workflow_meetings(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_meetings(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_meetings(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_meetings(p_run uuid) TO service_role;

-- acl: FUNCTION workflow_preview_facts(p_contact uuid)
REVOKE ALL ON FUNCTION public.workflow_preview_facts(p_contact uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_preview_facts(p_contact uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_preview_facts(p_contact uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_preview_facts(p_contact uuid) TO service_role;

-- acl: FUNCTION workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text)
REVOKE ALL ON FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text) TO anon;
GRANT ALL ON FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text) TO service_role;

-- acl: FUNCTION workflow_reminders_live(p_ws uuid)
REVOKE ALL ON FUNCTION public.workflow_reminders_live(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_reminders_live(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_reminders_live(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_reminders_live(p_ws uuid) TO service_role;

-- acl: FUNCTION workflow_retry(p_run uuid)
REVOKE ALL ON FUNCTION public.workflow_retry(p_run uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_retry(p_run uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_retry(p_run uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_retry(p_run uuid) TO service_role;

-- acl: FUNCTION workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer)
REVOKE ALL ON FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) TO anon;
GRANT ALL ON FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision integer) TO service_role;

-- acl: FUNCTION workflow_scan()
REVOKE ALL ON FUNCTION public.workflow_scan() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_scan() TO anon;
GRANT ALL ON FUNCTION public.workflow_scan() TO authenticated;
GRANT ALL ON FUNCTION public.workflow_scan() TO service_role;

-- acl: FUNCTION workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid)
REVOKE ALL ON FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_set_folder(p_ws uuid, p_id uuid, p_folder uuid) TO service_role;

-- acl: FUNCTION workflow_set_status(p_id uuid, p_status text)
REVOKE ALL ON FUNCTION public.workflow_set_status(p_id uuid, p_status text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_set_status(p_id uuid, p_status text) TO anon;
GRANT ALL ON FUNCTION public.workflow_set_status(p_id uuid, p_status text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_set_status(p_id uuid, p_status text) TO service_role;

-- acl: FUNCTION workflow_slack(p_run uuid, p_user uuid)
REVOKE ALL ON FUNCTION public.workflow_slack(p_run uuid, p_user uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_slack(p_run uuid, p_user uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_slack(p_run uuid, p_user uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_slack(p_run uuid, p_user uuid) TO service_role;

-- acl: FUNCTION workflow_stats(p_id uuid)
REVOKE ALL ON FUNCTION public.workflow_stats(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_stats(p_id uuid) TO anon;
GRANT ALL ON FUNCTION public.workflow_stats(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_stats(p_id uuid) TO service_role;

-- acl: FUNCTION workflow_step_begin(p_run uuid, p_step text, p_visit integer)
REVOKE ALL ON FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer) TO anon;
GRANT ALL ON FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_step_begin(p_run uuid, p_step text, p_visit integer) TO service_role;

-- acl: FUNCTION workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text)
REVOKE ALL ON FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text) TO anon;
GRANT ALL ON FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_step_done(p_run uuid, p_step text, p_visit integer, p_status text, p_result jsonb, p_next text, p_next_at timestamp with time zone, p_wait jsonb, p_run_status text, p_exit text) TO service_role;

-- acl: FUNCTION workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb)
REVOKE ALL ON FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) TO anon;
GRANT ALL ON FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_text(p_run uuid, p_step text, p_channel text, p_body text, p_template text, p_vars jsonb, p_meeting uuid, p_meeting_start timestamp with time zone, p_fallback jsonb) TO service_role;

-- acl: FUNCTION workflow_unclaim(p_runs uuid[])
REVOKE ALL ON FUNCTION public.workflow_unclaim(p_runs uuid[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflow_unclaim(p_runs uuid[]) TO anon;
GRANT ALL ON FUNCTION public.workflow_unclaim(p_runs uuid[]) TO authenticated;
GRANT ALL ON FUNCTION public.workflow_unclaim(p_runs uuid[]) TO service_role;

-- acl: FUNCTION workflows_tick()
REVOKE ALL ON FUNCTION public.workflows_tick() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workflows_tick() TO anon;
GRANT ALL ON FUNCTION public.workflows_tick() TO authenticated;
GRANT ALL ON FUNCTION public.workflows_tick() TO service_role;

-- acl: FUNCTION workspace_brand_set(p_ws uuid, p_kit uuid)
REVOKE ALL ON FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_brand_set(p_ws uuid, p_kit uuid) TO service_role;

-- acl: FUNCTION workspace_name_set(p_ws uuid, p_name text)
REVOKE ALL ON FUNCTION public.workspace_name_set(p_ws uuid, p_name text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_name_set(p_ws uuid, p_name text) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_name_set(p_ws uuid, p_name text) TO service_role;

-- acl: FUNCTION workspace_people(p_ws uuid)
REVOKE ALL ON FUNCTION public.workspace_people(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_people(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_people(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_people(p_ws uuid) TO service_role;

-- acl: FUNCTION workspace_plan(p_ws uuid)
REVOKE ALL ON FUNCTION public.workspace_plan(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_plan(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_plan(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_plan(p_ws uuid) TO service_role;

-- acl: FUNCTION workspace_source(p_ws uuid, p_kind text)
REVOKE ALL ON FUNCTION public.workspace_source(p_ws uuid, p_kind text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_source(p_ws uuid, p_kind text) TO anon;
GRANT ALL ON FUNCTION public.workspace_source(p_ws uuid, p_kind text) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_source(p_ws uuid, p_kind text) TO service_role;

-- acl: FUNCTION workspace_usage(p_workspace uuid)
REVOKE ALL ON FUNCTION public.workspace_usage(p_workspace uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspace_usage(p_workspace uuid) TO anon;
GRANT ALL ON FUNCTION public.workspace_usage(p_workspace uuid) TO authenticated;
GRANT ALL ON FUNCTION public.workspace_usage(p_workspace uuid) TO service_role;

-- acl: FUNCTION workspaces_named()
GRANT ALL ON FUNCTION public.workspaces_named() TO anon;
GRANT ALL ON FUNCTION public.workspaces_named() TO authenticated;
GRANT ALL ON FUNCTION public.workspaces_named() TO service_role;

-- acl: FUNCTION workspaces_seed_crm()
REVOKE ALL ON FUNCTION public.workspaces_seed_crm() FROM PUBLIC;
GRANT ALL ON FUNCTION public.workspaces_seed_crm() TO anon;
GRANT ALL ON FUNCTION public.workspaces_seed_crm() TO authenticated;
GRANT ALL ON FUNCTION public.workspaces_seed_crm() TO service_role;

-- acl: FUNCTION ws_tz(p_ws uuid)
REVOKE ALL ON FUNCTION public.ws_tz(p_ws uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ws_tz(p_ws uuid) TO anon;
GRANT ALL ON FUNCTION public.ws_tz(p_ws uuid) TO authenticated;
GRANT ALL ON FUNCTION public.ws_tz(p_ws uuid) TO service_role;

-- acl: TABLE contact_events
GRANT ALL ON TABLE public.contact_events TO anon;
GRANT ALL ON TABLE public.contact_events TO authenticated;
GRANT ALL ON TABLE public.contact_events TO service_role;

-- acl: TABLE account_alert_log
GRANT ALL ON TABLE public.account_alert_log TO anon;
GRANT ALL ON TABLE public.account_alert_log TO authenticated;
GRANT ALL ON TABLE public.account_alert_log TO service_role;

-- acl: TABLE account_daily
GRANT ALL ON TABLE public.account_daily TO anon;
GRANT ALL ON TABLE public.account_daily TO authenticated;
GRANT ALL ON TABLE public.account_daily TO service_role;

-- acl: TABLE account_domains
GRANT ALL ON TABLE public.account_domains TO anon;
GRANT ALL ON TABLE public.account_domains TO authenticated;
GRANT ALL ON TABLE public.account_domains TO service_role;

-- acl: TABLE account_feedback
GRANT ALL ON TABLE public.account_feedback TO anon;
GRANT ALL ON TABLE public.account_feedback TO authenticated;
GRANT ALL ON TABLE public.account_feedback TO service_role;

-- acl: TABLE account_scores
GRANT ALL ON TABLE public.account_scores TO anon;
GRANT ALL ON TABLE public.account_scores TO authenticated;
GRANT ALL ON TABLE public.account_scores TO service_role;

-- acl: TABLE accounts
GRANT ALL ON TABLE public.accounts TO anon;
GRANT ALL ON TABLE public.accounts TO authenticated;
GRANT ALL ON TABLE public.accounts TO service_role;

-- acl: TABLE activity_out
GRANT ALL ON TABLE public.activity_out TO anon;
GRANT ALL ON TABLE public.activity_out TO authenticated;
GRANT ALL ON TABLE public.activity_out TO service_role;

-- acl: TABLE ai_cache
GRANT ALL ON TABLE public.ai_cache TO anon;
GRANT ALL ON TABLE public.ai_cache TO authenticated;
GRANT ALL ON TABLE public.ai_cache TO service_role;

-- acl: TABLE ai_calls
GRANT ALL ON TABLE public.ai_calls TO anon;
GRANT ALL ON TABLE public.ai_calls TO authenticated;
GRANT ALL ON TABLE public.ai_calls TO service_role;

-- acl: SEQUENCE ai_calls_id_seq
GRANT ALL ON SEQUENCE public.ai_calls_id_seq TO anon;
GRANT ALL ON SEQUENCE public.ai_calls_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.ai_calls_id_seq TO service_role;

-- acl: TABLE alert_events
GRANT ALL ON TABLE public.alert_events TO anon;
GRANT ALL ON TABLE public.alert_events TO authenticated;
GRANT ALL ON TABLE public.alert_events TO service_role;

-- acl: TABLE alert_settings
GRANT ALL ON TABLE public.alert_settings TO anon;
GRANT ALL ON TABLE public.alert_settings TO authenticated;
GRANT ALL ON TABLE public.alert_settings TO service_role;

-- acl: COLUMN alert_settings.project_id
GRANT SELECT(project_id) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.workspace_id
GRANT SELECT(workspace_id) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.slack_hint
GRANT SELECT(slack_hint) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.emails
GRANT SELECT(emails) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.on_failure
GRANT SELECT(on_failure) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.on_heal
GRANT SELECT(on_heal) ON TABLE public.alert_settings TO authenticated;

-- acl: COLUMN alert_settings.updated_at
GRANT SELECT(updated_at) ON TABLE public.alert_settings TO authenticated;

-- acl: TABLE api_keys
GRANT ALL ON TABLE public.api_keys TO anon;
GRANT ALL ON TABLE public.api_keys TO authenticated;
GRANT ALL ON TABLE public.api_keys TO service_role;

-- acl: COLUMN api_keys.id
GRANT SELECT(id) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.workspace_id
GRANT SELECT(workspace_id) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.name
GRANT SELECT(name) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.prefix
GRANT SELECT(prefix) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.created_by
GRANT SELECT(created_by) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.created_at
GRANT SELECT(created_at) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.last_used_at
GRANT SELECT(last_used_at) ON TABLE public.api_keys TO authenticated;

-- acl: COLUMN api_keys.revoked_at
GRANT SELECT(revoked_at) ON TABLE public.api_keys TO authenticated;

-- acl: TABLE app_config
GRANT ALL ON TABLE public.app_config TO anon;
GRANT ALL ON TABLE public.app_config TO authenticated;
GRANT ALL ON TABLE public.app_config TO service_role;

-- acl: TABLE app_links
GRANT ALL ON TABLE public.app_links TO anon;
GRANT ALL ON TABLE public.app_links TO authenticated;
GRANT ALL ON TABLE public.app_links TO service_role;

-- acl: TABLE app_pages
GRANT ALL ON TABLE public.app_pages TO anon;
GRANT ALL ON TABLE public.app_pages TO authenticated;
GRANT ALL ON TABLE public.app_pages TO service_role;

-- acl: TABLE audit_log
GRANT ALL ON TABLE public.audit_log TO anon;
GRANT ALL ON TABLE public.audit_log TO authenticated;
GRANT ALL ON TABLE public.audit_log TO service_role;

-- acl: TABLE availability
GRANT ALL ON TABLE public.availability TO anon;
GRANT ALL ON TABLE public.availability TO authenticated;
GRANT ALL ON TABLE public.availability TO service_role;

-- acl: TABLE availability_schedules
GRANT ALL ON TABLE public.availability_schedules TO anon;
GRANT ALL ON TABLE public.availability_schedules TO authenticated;
GRANT ALL ON TABLE public.availability_schedules TO service_role;

-- acl: TABLE blocks
GRANT ALL ON TABLE public.blocks TO anon;
GRANT ALL ON TABLE public.blocks TO authenticated;
GRANT ALL ON TABLE public.blocks TO service_role;

-- acl: TABLE booking_profiles
GRANT ALL ON TABLE public.booking_profiles TO anon;
GRANT ALL ON TABLE public.booking_profiles TO authenticated;
GRANT ALL ON TABLE public.booking_profiles TO service_role;

-- acl: TABLE brand_kits
GRANT ALL ON TABLE public.brand_kits TO anon;
GRANT ALL ON TABLE public.brand_kits TO authenticated;
GRANT ALL ON TABLE public.brand_kits TO service_role;

-- acl: TABLE busy_blocks
GRANT ALL ON TABLE public.busy_blocks TO anon;
GRANT ALL ON TABLE public.busy_blocks TO authenticated;
GRANT ALL ON TABLE public.busy_blocks TO service_role;

-- acl: TABLE calendar_accounts
GRANT ALL ON TABLE public.calendar_accounts TO anon;
GRANT ALL ON TABLE public.calendar_accounts TO authenticated;
GRANT ALL ON TABLE public.calendar_accounts TO service_role;

-- acl: TABLE calendar_lists
GRANT ALL ON TABLE public.calendar_lists TO anon;
GRANT ALL ON TABLE public.calendar_lists TO authenticated;
GRANT ALL ON TABLE public.calendar_lists TO service_role;

-- acl: TABLE calendar_tokens
GRANT ALL ON TABLE public.calendar_tokens TO anon;
GRANT ALL ON TABLE public.calendar_tokens TO authenticated;
GRANT ALL ON TABLE public.calendar_tokens TO service_role;

-- acl: TABLE companies
GRANT ALL ON TABLE public.companies TO anon;
GRANT ALL ON TABLE public.companies TO authenticated;
GRANT ALL ON TABLE public.companies TO service_role;

-- acl: TABLE company_cache
GRANT ALL ON TABLE public.company_cache TO anon;
GRANT ALL ON TABLE public.company_cache TO authenticated;
GRANT ALL ON TABLE public.company_cache TO service_role;

-- acl: TABLE consents
GRANT ALL ON TABLE public.consents TO anon;
GRANT ALL ON TABLE public.consents TO authenticated;
GRANT ALL ON TABLE public.consents TO service_role;

-- acl: TABLE crm_owner_links
GRANT ALL ON TABLE public.crm_owner_links TO anon;
GRANT ALL ON TABLE public.crm_owner_links TO authenticated;
GRANT ALL ON TABLE public.crm_owner_links TO service_role;

-- acl: TABLE deliveries
GRANT ALL ON TABLE public.deliveries TO anon;
GRANT ALL ON TABLE public.deliveries TO authenticated;
GRANT ALL ON TABLE public.deliveries TO service_role;

-- acl: TABLE design_assets
GRANT ALL ON TABLE public.design_assets TO anon;
GRANT ALL ON TABLE public.design_assets TO authenticated;
GRANT ALL ON TABLE public.design_assets TO service_role;

-- acl: TABLE device_links
GRANT ALL ON TABLE public.device_links TO anon;
GRANT ALL ON TABLE public.device_links TO authenticated;
GRANT ALL ON TABLE public.device_links TO service_role;

-- acl: TABLE devices
GRANT ALL ON TABLE public.devices TO anon;
GRANT ALL ON TABLE public.devices TO authenticated;
GRANT ALL ON TABLE public.devices TO service_role;

-- acl: TABLE domain_aliases
GRANT ALL ON TABLE public.domain_aliases TO anon;
GRANT ALL ON TABLE public.domain_aliases TO authenticated;
GRANT ALL ON TABLE public.domain_aliases TO service_role;

-- acl: TABLE email_events
GRANT ALL ON TABLE public.email_events TO anon;
GRANT ALL ON TABLE public.email_events TO authenticated;
GRANT ALL ON TABLE public.email_events TO service_role;

-- acl: SEQUENCE email_events_id_seq
GRANT ALL ON SEQUENCE public.email_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.email_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.email_events_id_seq TO service_role;

-- acl: TABLE email_messages
GRANT ALL ON TABLE public.email_messages TO anon;
GRANT ALL ON TABLE public.email_messages TO authenticated;
GRANT ALL ON TABLE public.email_messages TO service_role;

-- acl: TABLE email_templates
GRANT ALL ON TABLE public.email_templates TO anon;
GRANT ALL ON TABLE public.email_templates TO authenticated;
GRANT ALL ON TABLE public.email_templates TO service_role;

-- acl: TABLE email_tokens
GRANT ALL ON TABLE public.email_tokens TO anon;
GRANT ALL ON TABLE public.email_tokens TO authenticated;
GRANT ALL ON TABLE public.email_tokens TO service_role;

-- acl: TABLE email_versions
GRANT ALL ON TABLE public.email_versions TO anon;
GRANT ALL ON TABLE public.email_versions TO authenticated;
GRANT ALL ON TABLE public.email_versions TO service_role;

-- acl: TABLE emails
GRANT ALL ON TABLE public.emails TO anon;
GRANT ALL ON TABLE public.emails TO authenticated;
GRANT ALL ON TABLE public.emails TO service_role;

-- acl: TABLE enrich_keys
GRANT ALL ON TABLE public.enrich_keys TO anon;
GRANT ALL ON TABLE public.enrich_keys TO authenticated;
GRANT ALL ON TABLE public.enrich_keys TO service_role;

-- acl: TABLE enrich_runs
GRANT ALL ON TABLE public.enrich_runs TO anon;
GRANT ALL ON TABLE public.enrich_runs TO authenticated;
GRANT ALL ON TABLE public.enrich_runs TO service_role;

-- acl: SEQUENCE enrich_runs_id_seq
GRANT ALL ON SEQUENCE public.enrich_runs_id_seq TO anon;
GRANT ALL ON SEQUENCE public.enrich_runs_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.enrich_runs_id_seq TO service_role;

-- acl: TABLE enrich_settings
GRANT ALL ON TABLE public.enrich_settings TO anon;
GRANT ALL ON TABLE public.enrich_settings TO authenticated;
GRANT ALL ON TABLE public.enrich_settings TO service_role;

-- acl: TABLE enrich_sources
GRANT ALL ON TABLE public.enrich_sources TO anon;
GRANT ALL ON TABLE public.enrich_sources TO authenticated;
GRANT ALL ON TABLE public.enrich_sources TO service_role;

-- acl: TABLE enrich_usage
GRANT ALL ON TABLE public.enrich_usage TO anon;
GRANT ALL ON TABLE public.enrich_usage TO authenticated;
GRANT ALL ON TABLE public.enrich_usage TO service_role;

-- acl: TABLE env_secret_values
GRANT ALL ON TABLE public.env_secret_values TO anon;
GRANT ALL ON TABLE public.env_secret_values TO authenticated;
GRANT ALL ON TABLE public.env_secret_values TO service_role;

-- acl: TABLE env_secrets
GRANT ALL ON TABLE public.env_secrets TO anon;
GRANT ALL ON TABLE public.env_secrets TO authenticated;
GRANT ALL ON TABLE public.env_secrets TO service_role;

-- acl: TABLE erasures
GRANT ALL ON TABLE public.erasures TO anon;
GRANT ALL ON TABLE public.erasures TO authenticated;
GRANT ALL ON TABLE public.erasures TO service_role;

-- acl: TABLE events
GRANT ALL ON TABLE public.events TO anon;
GRANT ALL ON TABLE public.events TO authenticated;
GRANT ALL ON TABLE public.events TO service_role;

-- acl: TABLE events_20261014
GRANT ALL ON TABLE public.events_20261014 TO anon;
GRANT ALL ON TABLE public.events_20261014 TO authenticated;
GRANT ALL ON TABLE public.events_20261014 TO service_role;

-- acl: TABLE events_20261015
GRANT ALL ON TABLE public.events_20261015 TO anon;
GRANT ALL ON TABLE public.events_20261015 TO authenticated;
GRANT ALL ON TABLE public.events_20261015 TO service_role;

-- acl: TABLE events_20261016
GRANT ALL ON TABLE public.events_20261016 TO anon;
GRANT ALL ON TABLE public.events_20261016 TO authenticated;
GRANT ALL ON TABLE public.events_20261016 TO service_role;

-- acl: TABLE events_20261017
GRANT ALL ON TABLE public.events_20261017 TO anon;
GRANT ALL ON TABLE public.events_20261017 TO authenticated;
GRANT ALL ON TABLE public.events_20261017 TO service_role;

-- acl: TABLE events_20261018
GRANT ALL ON TABLE public.events_20261018 TO anon;
GRANT ALL ON TABLE public.events_20261018 TO authenticated;
GRANT ALL ON TABLE public.events_20261018 TO service_role;

-- acl: TABLE events_20261019
GRANT ALL ON TABLE public.events_20261019 TO anon;
GRANT ALL ON TABLE public.events_20261019 TO authenticated;
GRANT ALL ON TABLE public.events_20261019 TO service_role;

-- acl: TABLE events_20261020
GRANT ALL ON TABLE public.events_20261020 TO anon;
GRANT ALL ON TABLE public.events_20261020 TO authenticated;
GRANT ALL ON TABLE public.events_20261020 TO service_role;

-- acl: TABLE events_20261021
GRANT ALL ON TABLE public.events_20261021 TO anon;
GRANT ALL ON TABLE public.events_20261021 TO authenticated;
GRANT ALL ON TABLE public.events_20261021 TO service_role;

-- acl: TABLE events_20261022
GRANT ALL ON TABLE public.events_20261022 TO anon;
GRANT ALL ON TABLE public.events_20261022 TO authenticated;
GRANT ALL ON TABLE public.events_20261022 TO service_role;

-- acl: TABLE events_20261023
GRANT ALL ON TABLE public.events_20261023 TO anon;
GRANT ALL ON TABLE public.events_20261023 TO authenticated;
GRANT ALL ON TABLE public.events_20261023 TO service_role;

-- acl: TABLE events_20261024
GRANT ALL ON TABLE public.events_20261024 TO anon;
GRANT ALL ON TABLE public.events_20261024 TO authenticated;
GRANT ALL ON TABLE public.events_20261024 TO service_role;

-- acl: TABLE events_20261025
GRANT ALL ON TABLE public.events_20261025 TO anon;
GRANT ALL ON TABLE public.events_20261025 TO authenticated;
GRANT ALL ON TABLE public.events_20261025 TO service_role;

-- acl: TABLE events_20261026
GRANT ALL ON TABLE public.events_20261026 TO anon;
GRANT ALL ON TABLE public.events_20261026 TO authenticated;
GRANT ALL ON TABLE public.events_20261026 TO service_role;

-- acl: TABLE events_20261027
GRANT ALL ON TABLE public.events_20261027 TO anon;
GRANT ALL ON TABLE public.events_20261027 TO authenticated;
GRANT ALL ON TABLE public.events_20261027 TO service_role;

-- acl: TABLE events_20261028
GRANT ALL ON TABLE public.events_20261028 TO anon;
GRANT ALL ON TABLE public.events_20261028 TO authenticated;
GRANT ALL ON TABLE public.events_20261028 TO service_role;

-- acl: TABLE events_20261029
GRANT ALL ON TABLE public.events_20261029 TO anon;
GRANT ALL ON TABLE public.events_20261029 TO authenticated;
GRANT ALL ON TABLE public.events_20261029 TO service_role;

-- acl: TABLE events_20261030
GRANT ALL ON TABLE public.events_20261030 TO anon;
GRANT ALL ON TABLE public.events_20261030 TO authenticated;
GRANT ALL ON TABLE public.events_20261030 TO service_role;

-- acl: TABLE events_20261031
GRANT ALL ON TABLE public.events_20261031 TO anon;
GRANT ALL ON TABLE public.events_20261031 TO authenticated;
GRANT ALL ON TABLE public.events_20261031 TO service_role;

-- acl: TABLE events_20261101
GRANT ALL ON TABLE public.events_20261101 TO anon;
GRANT ALL ON TABLE public.events_20261101 TO authenticated;
GRANT ALL ON TABLE public.events_20261101 TO service_role;

-- acl: TABLE events_20261102
GRANT ALL ON TABLE public.events_20261102 TO anon;
GRANT ALL ON TABLE public.events_20261102 TO authenticated;
GRANT ALL ON TABLE public.events_20261102 TO service_role;

-- acl: TABLE events_20261103
GRANT ALL ON TABLE public.events_20261103 TO anon;
GRANT ALL ON TABLE public.events_20261103 TO authenticated;
GRANT ALL ON TABLE public.events_20261103 TO service_role;

-- acl: TABLE events_20261104
GRANT ALL ON TABLE public.events_20261104 TO anon;
GRANT ALL ON TABLE public.events_20261104 TO authenticated;
GRANT ALL ON TABLE public.events_20261104 TO service_role;

-- acl: TABLE events_20261105
GRANT ALL ON TABLE public.events_20261105 TO anon;
GRANT ALL ON TABLE public.events_20261105 TO authenticated;
GRANT ALL ON TABLE public.events_20261105 TO service_role;

-- acl: TABLE events_20261106
GRANT ALL ON TABLE public.events_20261106 TO anon;
GRANT ALL ON TABLE public.events_20261106 TO authenticated;
GRANT ALL ON TABLE public.events_20261106 TO service_role;

-- acl: TABLE events_20261107
GRANT ALL ON TABLE public.events_20261107 TO anon;
GRANT ALL ON TABLE public.events_20261107 TO authenticated;
GRANT ALL ON TABLE public.events_20261107 TO service_role;

-- acl: TABLE events_20261108
GRANT ALL ON TABLE public.events_20261108 TO anon;
GRANT ALL ON TABLE public.events_20261108 TO authenticated;
GRANT ALL ON TABLE public.events_20261108 TO service_role;

-- acl: TABLE events_20261109
GRANT ALL ON TABLE public.events_20261109 TO anon;
GRANT ALL ON TABLE public.events_20261109 TO authenticated;
GRANT ALL ON TABLE public.events_20261109 TO service_role;

-- acl: TABLE events_20261110
GRANT ALL ON TABLE public.events_20261110 TO anon;
GRANT ALL ON TABLE public.events_20261110 TO authenticated;
GRANT ALL ON TABLE public.events_20261110 TO service_role;

-- acl: TABLE events_20261111
GRANT ALL ON TABLE public.events_20261111 TO anon;
GRANT ALL ON TABLE public.events_20261111 TO authenticated;
GRANT ALL ON TABLE public.events_20261111 TO service_role;

-- acl: TABLE events_20261112
GRANT ALL ON TABLE public.events_20261112 TO anon;
GRANT ALL ON TABLE public.events_20261112 TO authenticated;
GRANT ALL ON TABLE public.events_20261112 TO service_role;

-- acl: TABLE events_20261113
GRANT ALL ON TABLE public.events_20261113 TO anon;
GRANT ALL ON TABLE public.events_20261113 TO authenticated;
GRANT ALL ON TABLE public.events_20261113 TO service_role;

-- acl: TABLE events_20261114
GRANT ALL ON TABLE public.events_20261114 TO anon;
GRANT ALL ON TABLE public.events_20261114 TO authenticated;
GRANT ALL ON TABLE public.events_20261114 TO service_role;

-- acl: TABLE events_20261115
GRANT ALL ON TABLE public.events_20261115 TO anon;
GRANT ALL ON TABLE public.events_20261115 TO authenticated;
GRANT ALL ON TABLE public.events_20261115 TO service_role;

-- acl: TABLE field_history
GRANT ALL ON TABLE public.field_history TO anon;
GRANT ALL ON TABLE public.field_history TO authenticated;
GRANT ALL ON TABLE public.field_history TO service_role;

-- acl: SEQUENCE field_history_id_seq
GRANT ALL ON SEQUENCE public.field_history_id_seq TO anon;
GRANT ALL ON SEQUENCE public.field_history_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.field_history_id_seq TO service_role;

-- acl: TABLE field_order
GRANT ALL ON TABLE public.field_order TO anon;
GRANT ALL ON TABLE public.field_order TO authenticated;
GRANT ALL ON TABLE public.field_order TO service_role;

-- acl: TABLE field_settings
GRANT ALL ON TABLE public.field_settings TO anon;
GRANT ALL ON TABLE public.field_settings TO authenticated;
GRANT ALL ON TABLE public.field_settings TO service_role;

-- acl: TABLE field_writes
GRANT ALL ON TABLE public.field_writes TO anon;
GRANT ALL ON TABLE public.field_writes TO authenticated;
GRANT ALL ON TABLE public.field_writes TO service_role;

-- acl: TABLE fields
GRANT ALL ON TABLE public.fields TO anon;
GRANT ALL ON TABLE public.fields TO authenticated;
GRANT ALL ON TABLE public.fields TO service_role;

-- acl: TABLE form_bookings
GRANT ALL ON TABLE public.form_bookings TO anon;
GRANT ALL ON TABLE public.form_bookings TO authenticated;
GRANT ALL ON TABLE public.form_bookings TO service_role;

-- acl: TABLE form_chats
GRANT ALL ON TABLE public.form_chats TO anon;
GRANT ALL ON TABLE public.form_chats TO authenticated;
GRANT ALL ON TABLE public.form_chats TO service_role;

-- acl: TABLE form_checks
GRANT ALL ON TABLE public.form_checks TO anon;
GRANT ALL ON TABLE public.form_checks TO authenticated;
GRANT ALL ON TABLE public.form_checks TO service_role;

-- acl: TABLE form_daily
GRANT ALL ON TABLE public.form_daily TO anon;
GRANT ALL ON TABLE public.form_daily TO authenticated;
GRANT ALL ON TABLE public.form_daily TO service_role;

-- acl: TABLE form_destination_secrets
GRANT ALL ON TABLE public.form_destination_secrets TO anon;
GRANT ALL ON TABLE public.form_destination_secrets TO authenticated;
GRANT ALL ON TABLE public.form_destination_secrets TO service_role;

-- acl: TABLE form_destinations
GRANT ALL ON TABLE public.form_destinations TO anon;
GRANT ALL ON TABLE public.form_destinations TO authenticated;
GRANT ALL ON TABLE public.form_destinations TO service_role;

-- acl: TABLE form_drafts
GRANT ALL ON TABLE public.form_drafts TO anon;
GRANT ALL ON TABLE public.form_drafts TO authenticated;
GRANT ALL ON TABLE public.form_drafts TO service_role;

-- acl: TABLE form_field_sessions
GRANT ALL ON TABLE public.form_field_sessions TO anon;
GRANT ALL ON TABLE public.form_field_sessions TO authenticated;
GRANT ALL ON TABLE public.form_field_sessions TO service_role;

-- acl: TABLE form_folders
GRANT ALL ON TABLE public.form_folders TO anon;
GRANT ALL ON TABLE public.form_folders TO authenticated;
GRANT ALL ON TABLE public.form_folders TO service_role;

-- acl: TABLE form_notify_sent
GRANT ALL ON TABLE public.form_notify_sent TO anon;
GRANT ALL ON TABLE public.form_notify_sent TO authenticated;
GRANT ALL ON TABLE public.form_notify_sent TO service_role;

-- acl: TABLE form_seen
GRANT ALL ON TABLE public.form_seen TO anon;
GRANT ALL ON TABLE public.form_seen TO authenticated;
GRANT ALL ON TABLE public.form_seen TO service_role;

-- acl: TABLE form_slug_moves
GRANT ALL ON TABLE public.form_slug_moves TO anon;
GRANT ALL ON TABLE public.form_slug_moves TO authenticated;
GRANT ALL ON TABLE public.form_slug_moves TO service_role;

-- acl: TABLE form_submissions
GRANT ALL ON TABLE public.form_submissions TO anon;
GRANT ALL ON TABLE public.form_submissions TO authenticated;
GRANT ALL ON TABLE public.form_submissions TO service_role;

-- acl: TABLE form_uploads
GRANT ALL ON TABLE public.form_uploads TO anon;
GRANT ALL ON TABLE public.form_uploads TO authenticated;
GRANT ALL ON TABLE public.form_uploads TO service_role;

-- acl: TABLE form_versions
GRANT ALL ON TABLE public.form_versions TO anon;
GRANT ALL ON TABLE public.form_versions TO authenticated;
GRANT ALL ON TABLE public.form_versions TO service_role;

-- acl: TABLE forms
GRANT ALL ON TABLE public.forms TO anon;
GRANT ALL ON TABLE public.forms TO authenticated;
GRANT ALL ON TABLE public.forms TO service_role;

-- acl: TABLE github_installations
GRANT ALL ON TABLE public.github_installations TO anon;
GRANT ALL ON TABLE public.github_installations TO authenticated;
GRANT ALL ON TABLE public.github_installations TO service_role;

-- acl: TABLE github_links
GRANT ALL ON TABLE public.github_links TO anon;
GRANT ALL ON TABLE public.github_links TO authenticated;
GRANT ALL ON TABLE public.github_links TO service_role;

-- acl: TABLE heals
GRANT ALL ON TABLE public.heals TO anon;
GRANT ALL ON TABLE public.heals TO authenticated;
GRANT ALL ON TABLE public.heals TO service_role;

-- acl: TABLE hook_events
GRANT ALL ON TABLE public.hook_events TO anon;
GRANT ALL ON TABLE public.hook_events TO authenticated;
GRANT ALL ON TABLE public.hook_events TO service_role;

-- acl: SEQUENCE hook_events_id_seq
GRANT ALL ON SEQUENCE public.hook_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.hook_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.hook_events_id_seq TO service_role;

-- acl: TABLE hop_nonces
GRANT ALL ON TABLE public.hop_nonces TO anon;
GRANT ALL ON TABLE public.hop_nonces TO authenticated;
GRANT ALL ON TABLE public.hop_nonces TO service_role;

-- acl: TABLE icp
GRANT ALL ON TABLE public.icp TO anon;
GRANT ALL ON TABLE public.icp TO authenticated;
GRANT ALL ON TABLE public.icp TO service_role;

-- acl: TABLE identifiers
GRANT ALL ON TABLE public.identifiers TO anon;
GRANT ALL ON TABLE public.identifiers TO authenticated;
GRANT ALL ON TABLE public.identifiers TO service_role;

-- acl: TABLE identity_evidence
GRANT ALL ON TABLE public.identity_evidence TO anon;
GRANT ALL ON TABLE public.identity_evidence TO authenticated;
GRANT ALL ON TABLE public.identity_evidence TO service_role;

-- acl: TABLE identity_settings
GRANT ALL ON TABLE public.identity_settings TO anon;
GRANT ALL ON TABLE public.identity_settings TO authenticated;
GRANT ALL ON TABLE public.identity_settings TO service_role;

-- acl: COLUMN identity_settings.workspace_id
GRANT SELECT(workspace_id) ON TABLE public.identity_settings TO authenticated;

-- acl: COLUMN identity_settings.own_domains
GRANT SELECT(own_domains) ON TABLE public.identity_settings TO authenticated;

-- acl: COLUMN identity_settings.partner_domains
GRANT SELECT(partner_domains) ON TABLE public.identity_settings TO authenticated;

-- acl: COLUMN identity_settings.office_nets
GRANT SELECT(office_nets) ON TABLE public.identity_settings TO authenticated;

-- acl: COLUMN identity_settings.updated_at
GRANT SELECT(updated_at) ON TABLE public.identity_settings TO authenticated;

-- acl: TABLE imports
GRANT ALL ON TABLE public.imports TO anon;
GRANT ALL ON TABLE public.imports TO authenticated;
GRANT ALL ON TABLE public.imports TO service_role;

-- acl: TABLE inbox_messages
GRANT ALL ON TABLE public.inbox_messages TO anon;
GRANT ALL ON TABLE public.inbox_messages TO authenticated;
GRANT ALL ON TABLE public.inbox_messages TO service_role;

-- acl: TABLE intent_params
GRANT ALL ON TABLE public.intent_params TO anon;
GRANT ALL ON TABLE public.intent_params TO authenticated;
GRANT ALL ON TABLE public.intent_params TO service_role;

-- acl: TABLE invites
GRANT ALL ON TABLE public.invites TO anon;
GRANT ALL ON TABLE public.invites TO authenticated;
GRANT ALL ON TABLE public.invites TO service_role;

-- acl: TABLE ip_cache
GRANT ALL ON TABLE public.ip_cache TO anon;
GRANT ALL ON TABLE public.ip_cache TO authenticated;
GRANT ALL ON TABLE public.ip_cache TO service_role;

-- acl: TABLE lead_score_marks
GRANT ALL ON TABLE public.lead_score_marks TO anon;
GRANT ALL ON TABLE public.lead_score_marks TO authenticated;
GRANT ALL ON TABLE public.lead_score_marks TO service_role;

-- acl: TABLE lead_settings
GRANT ALL ON TABLE public.lead_settings TO anon;
GRANT ALL ON TABLE public.lead_settings TO authenticated;
GRANT ALL ON TABLE public.lead_settings TO service_role;

-- acl: TABLE learned_networks
GRANT ALL ON TABLE public.learned_networks TO anon;
GRANT ALL ON TABLE public.learned_networks TO authenticated;
GRANT ALL ON TABLE public.learned_networks TO service_role;

-- acl: TABLE link_domains
GRANT ALL ON TABLE public.link_domains TO anon;
GRANT ALL ON TABLE public.link_domains TO authenticated;
GRANT ALL ON TABLE public.link_domains TO service_role;

-- acl: TABLE mailbox_sends
GRANT ALL ON TABLE public.mailbox_sends TO anon;
GRANT ALL ON TABLE public.mailbox_sends TO authenticated;
GRANT ALL ON TABLE public.mailbox_sends TO service_role;

-- acl: TABLE mailboxes
GRANT ALL ON TABLE public.mailboxes TO anon;
GRANT ALL ON TABLE public.mailboxes TO authenticated;
GRANT ALL ON TABLE public.mailboxes TO service_role;

-- acl: COLUMN mailboxes.id
GRANT SELECT(id) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.workspace_id
GRANT SELECT(workspace_id) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.user_id
GRANT SELECT(user_id) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.provider
GRANT SELECT(provider) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.email
GRANT SELECT(email) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.status
GRANT SELECT(status) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.error
GRANT SELECT(error) ON TABLE public.mailboxes TO authenticated;

-- acl: COLUMN mailboxes.created_at
GRANT SELECT(created_at) ON TABLE public.mailboxes TO authenticated;

-- acl: TABLE mappings
GRANT ALL ON TABLE public.mappings TO anon;
GRANT ALL ON TABLE public.mappings TO authenticated;
GRANT ALL ON TABLE public.mappings TO service_role;

-- acl: TABLE meeting_events
GRANT ALL ON TABLE public.meeting_events TO anon;
GRANT ALL ON TABLE public.meeting_events TO authenticated;
GRANT ALL ON TABLE public.meeting_events TO service_role;

-- acl: SEQUENCE meeting_events_id_seq
GRANT ALL ON SEQUENCE public.meeting_events_id_seq TO anon;
GRANT ALL ON SEQUENCE public.meeting_events_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.meeting_events_id_seq TO service_role;

-- acl: TABLE meeting_links
GRANT ALL ON TABLE public.meeting_links TO anon;
GRANT ALL ON TABLE public.meeting_links TO authenticated;
GRANT ALL ON TABLE public.meeting_links TO service_role;

-- acl: TABLE meeting_mails
GRANT ALL ON TABLE public.meeting_mails TO anon;
GRANT ALL ON TABLE public.meeting_mails TO authenticated;
GRANT ALL ON TABLE public.meeting_mails TO service_role;

-- acl: TABLE meeting_outcome_uses
GRANT ALL ON TABLE public.meeting_outcome_uses TO anon;
GRANT ALL ON TABLE public.meeting_outcome_uses TO authenticated;
GRANT ALL ON TABLE public.meeting_outcome_uses TO service_role;

-- acl: TABLE meeting_sync_leases
GRANT ALL ON TABLE public.meeting_sync_leases TO anon;
GRANT ALL ON TABLE public.meeting_sync_leases TO authenticated;
GRANT ALL ON TABLE public.meeting_sync_leases TO service_role;

-- acl: TABLE meeting_types
GRANT ALL ON TABLE public.meeting_types TO anon;
GRANT ALL ON TABLE public.meeting_types TO authenticated;
GRANT ALL ON TABLE public.meeting_types TO service_role;

-- acl: TABLE merge_proposals
GRANT ALL ON TABLE public.merge_proposals TO anon;
GRANT ALL ON TABLE public.merge_proposals TO authenticated;
GRANT ALL ON TABLE public.merge_proposals TO service_role;

-- acl: TABLE network_flags
GRANT ALL ON TABLE public.network_flags TO anon;
GRANT ALL ON TABLE public.network_flags TO authenticated;
GRANT ALL ON TABLE public.network_flags TO service_role;

-- acl: TABLE notes
GRANT ALL ON TABLE public.notes TO anon;
GRANT ALL ON TABLE public.notes TO authenticated;
GRANT ALL ON TABLE public.notes TO service_role;

-- acl: TABLE nurture_enrollments
GRANT ALL ON TABLE public.nurture_enrollments TO anon;
GRANT ALL ON TABLE public.nurture_enrollments TO authenticated;
GRANT ALL ON TABLE public.nurture_enrollments TO service_role;

-- acl: TABLE nurture_marks
GRANT ALL ON TABLE public.nurture_marks TO anon;
GRANT ALL ON TABLE public.nurture_marks TO authenticated;
GRANT ALL ON TABLE public.nurture_marks TO service_role;

-- acl: TABLE nurture_steps
GRANT ALL ON TABLE public.nurture_steps TO anon;
GRANT ALL ON TABLE public.nurture_steps TO authenticated;
GRANT ALL ON TABLE public.nurture_steps TO service_role;

-- acl: TABLE nurtures
GRANT ALL ON TABLE public.nurtures TO anon;
GRANT ALL ON TABLE public.nurtures TO authenticated;
GRANT ALL ON TABLE public.nurtures TO service_role;

-- acl: TABLE oauth_codes
GRANT ALL ON TABLE public.oauth_codes TO anon;
GRANT ALL ON TABLE public.oauth_codes TO authenticated;
GRANT ALL ON TABLE public.oauth_codes TO service_role;

-- acl: TABLE object_layouts
GRANT ALL ON TABLE public.object_layouts TO anon;
GRANT ALL ON TABLE public.object_layouts TO authenticated;
GRANT ALL ON TABLE public.object_layouts TO service_role;

-- acl: TABLE objects
GRANT ALL ON TABLE public.objects TO anon;
GRANT ALL ON TABLE public.objects TO authenticated;
GRANT ALL ON TABLE public.objects TO service_role;

-- acl: TABLE opt_outs
GRANT ALL ON TABLE public.opt_outs TO anon;
GRANT ALL ON TABLE public.opt_outs TO authenticated;
GRANT ALL ON TABLE public.opt_outs TO service_role;

-- acl: TABLE page_groups
GRANT ALL ON TABLE public.page_groups TO anon;
GRANT ALL ON TABLE public.page_groups TO authenticated;
GRANT ALL ON TABLE public.page_groups TO service_role;

-- acl: TABLE payment_accounts
GRANT ALL ON TABLE public.payment_accounts TO anon;
GRANT ALL ON TABLE public.payment_accounts TO authenticated;
GRANT ALL ON TABLE public.payment_accounts TO service_role;

-- acl: TABLE person_aliases
GRANT ALL ON TABLE public.person_aliases TO anon;
GRANT ALL ON TABLE public.person_aliases TO authenticated;
GRANT ALL ON TABLE public.person_aliases TO service_role;

-- acl: TABLE person_cache
GRANT ALL ON TABLE public.person_cache TO anon;
GRANT ALL ON TABLE public.person_cache TO authenticated;
GRANT ALL ON TABLE public.person_cache TO service_role;

-- acl: TABLE persons
GRANT ALL ON TABLE public.persons TO anon;
GRANT ALL ON TABLE public.persons TO authenticated;
GRANT ALL ON TABLE public.persons TO service_role;

-- acl: TABLE plan_usage
GRANT ALL ON TABLE public.plan_usage TO anon;
GRANT ALL ON TABLE public.plan_usage TO authenticated;
GRANT ALL ON TABLE public.plan_usage TO service_role;

-- acl: TABLE poll_votes
GRANT ALL ON TABLE public.poll_votes TO anon;
GRANT ALL ON TABLE public.poll_votes TO authenticated;
GRANT ALL ON TABLE public.poll_votes TO service_role;

-- acl: TABLE privacy_exports
GRANT ALL ON TABLE public.privacy_exports TO anon;
GRANT ALL ON TABLE public.privacy_exports TO authenticated;
GRANT ALL ON TABLE public.privacy_exports TO service_role;

-- acl: TABLE privacy_requests
GRANT ALL ON TABLE public.privacy_requests TO anon;
GRANT ALL ON TABLE public.privacy_requests TO authenticated;
GRANT ALL ON TABLE public.privacy_requests TO service_role;

-- acl: TABLE projects
GRANT ALL ON TABLE public.projects TO anon;
GRANT ALL ON TABLE public.projects TO authenticated;
GRANT ALL ON TABLE public.projects TO service_role;

-- acl: TABLE qualify_settings
GRANT ALL ON TABLE public.qualify_settings TO anon;
GRANT ALL ON TABLE public.qualify_settings TO authenticated;
GRANT ALL ON TABLE public.qualify_settings TO service_role;

-- acl: TABLE record_links
GRANT ALL ON TABLE public.record_links TO anon;
GRANT ALL ON TABLE public.record_links TO authenticated;
GRANT ALL ON TABLE public.record_links TO service_role;

-- acl: TABLE records
GRANT ALL ON TABLE public.records TO anon;
GRANT ALL ON TABLE public.records TO authenticated;
GRANT ALL ON TABLE public.records TO service_role;

-- acl: TABLE router_alert_sent
GRANT ALL ON TABLE public.router_alert_sent TO anon;
GRANT ALL ON TABLE public.router_alert_sent TO authenticated;
GRANT ALL ON TABLE public.router_alert_sent TO service_role;

-- acl: TABLE router_chats
GRANT ALL ON TABLE public.router_chats TO anon;
GRANT ALL ON TABLE public.router_chats TO authenticated;
GRANT ALL ON TABLE public.router_chats TO service_role;

-- acl: TABLE router_replays
GRANT ALL ON TABLE public.router_replays TO anon;
GRANT ALL ON TABLE public.router_replays TO authenticated;
GRANT ALL ON TABLE public.router_replays TO service_role;

-- acl: TABLE router_reps
GRANT ALL ON TABLE public.router_reps TO anon;
GRANT ALL ON TABLE public.router_reps TO authenticated;
GRANT ALL ON TABLE public.router_reps TO service_role;

-- acl: TABLE router_runs
GRANT ALL ON TABLE public.router_runs TO anon;
GRANT ALL ON TABLE public.router_runs TO authenticated;
GRANT ALL ON TABLE public.router_runs TO service_role;

-- acl: TABLE router_secrets
GRANT ALL ON TABLE public.router_secrets TO anon;
GRANT ALL ON TABLE public.router_secrets TO authenticated;
GRANT ALL ON TABLE public.router_secrets TO service_role;

-- acl: TABLE router_slas
GRANT ALL ON TABLE public.router_slas TO anon;
GRANT ALL ON TABLE public.router_slas TO authenticated;
GRANT ALL ON TABLE public.router_slas TO service_role;

-- acl: TABLE router_versions
GRANT ALL ON TABLE public.router_versions TO anon;
GRANT ALL ON TABLE public.router_versions TO authenticated;
GRANT ALL ON TABLE public.router_versions TO service_role;

-- acl: TABLE routers
GRANT ALL ON TABLE public.routers TO anon;
GRANT ALL ON TABLE public.routers TO authenticated;
GRANT ALL ON TABLE public.routers TO service_role;

-- acl: TABLE routing_assignments
GRANT ALL ON TABLE public.routing_assignments TO anon;
GRANT ALL ON TABLE public.routing_assignments TO authenticated;
GRANT ALL ON TABLE public.routing_assignments TO service_role;

-- acl: TABLE routing_policies
GRANT ALL ON TABLE public.routing_policies TO anon;
GRANT ALL ON TABLE public.routing_policies TO authenticated;
GRANT ALL ON TABLE public.routing_policies TO service_role;

-- acl: TABLE routing_policy_versions
GRANT ALL ON TABLE public.routing_policy_versions TO anon;
GRANT ALL ON TABLE public.routing_policy_versions TO authenticated;
GRANT ALL ON TABLE public.routing_policy_versions TO service_role;

-- acl: TABLE routing_reviews
GRANT ALL ON TABLE public.routing_reviews TO anon;
GRANT ALL ON TABLE public.routing_reviews TO authenticated;
GRANT ALL ON TABLE public.routing_reviews TO service_role;

-- acl: TABLE routing_sources
GRANT ALL ON TABLE public.routing_sources TO anon;
GRANT ALL ON TABLE public.routing_sources TO authenticated;
GRANT ALL ON TABLE public.routing_sources TO service_role;

-- acl: TABLE routing_team_keys
GRANT ALL ON TABLE public.routing_team_keys TO anon;
GRANT ALL ON TABLE public.routing_team_keys TO authenticated;
GRANT ALL ON TABLE public.routing_team_keys TO service_role;

-- acl: TABLE routing_team_members
GRANT ALL ON TABLE public.routing_team_members TO anon;
GRANT ALL ON TABLE public.routing_team_members TO authenticated;
GRANT ALL ON TABLE public.routing_team_members TO service_role;

-- acl: TABLE routing_teams
GRANT ALL ON TABLE public.routing_teams TO anon;
GRANT ALL ON TABLE public.routing_teams TO authenticated;
GRANT ALL ON TABLE public.routing_teams TO service_role;

-- acl: TABLE routing_test_evidence
GRANT ALL ON TABLE public.routing_test_evidence TO anon;
GRANT ALL ON TABLE public.routing_test_evidence TO authenticated;
GRANT ALL ON TABLE public.routing_test_evidence TO service_role;

-- acl: TABLE run_steps
GRANT ALL ON TABLE public.run_steps TO anon;
GRANT ALL ON TABLE public.run_steps TO authenticated;
GRANT ALL ON TABLE public.run_steps TO service_role;

-- acl: TABLE salts
GRANT ALL ON TABLE public.salts TO anon;
GRANT ALL ON TABLE public.salts TO authenticated;
GRANT ALL ON TABLE public.salts TO service_role;

-- acl: TABLE saved_views
GRANT ALL ON TABLE public.saved_views TO anon;
GRANT ALL ON TABLE public.saved_views TO authenticated;
GRANT ALL ON TABLE public.saved_views TO service_role;

-- acl: COLUMN saved_views.name
GRANT UPDATE(name) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.filters
GRANT UPDATE(filters) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.columns
GRANT UPDATE(columns) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.sort
GRANT UPDATE(sort) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.layout
GRANT UPDATE(layout) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.group_by
GRANT UPDATE(group_by) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views.owner_id
GRANT UPDATE(owner_id) ON TABLE public.saved_views TO authenticated;

-- acl: COLUMN saved_views."position"
GRANT UPDATE("position") ON TABLE public.saved_views TO authenticated;

-- acl: TABLE scheduler_links
GRANT ALL ON TABLE public.scheduler_links TO anon;
GRANT ALL ON TABLE public.scheduler_links TO authenticated;
GRANT ALL ON TABLE public.scheduler_links TO service_role;

-- acl: TABLE schedules
GRANT ALL ON TABLE public.schedules TO anon;
GRANT ALL ON TABLE public.schedules TO authenticated;
GRANT ALL ON TABLE public.schedules TO service_role;

-- acl: TABLE scoring_models
GRANT ALL ON TABLE public.scoring_models TO anon;
GRANT ALL ON TABLE public.scoring_models TO authenticated;
GRANT ALL ON TABLE public.scoring_models TO service_role;

-- acl: TABLE scoring_versions
GRANT ALL ON TABLE public.scoring_versions TO anon;
GRANT ALL ON TABLE public.scoring_versions TO authenticated;
GRANT ALL ON TABLE public.scoring_versions TO service_role;

-- acl: TABLE segment_members
GRANT ALL ON TABLE public.segment_members TO anon;
GRANT ALL ON TABLE public.segment_members TO authenticated;
GRANT ALL ON TABLE public.segment_members TO service_role;

-- acl: TABLE segments
GRANT ALL ON TABLE public.segments TO anon;
GRANT ALL ON TABLE public.segments TO authenticated;
GRANT ALL ON TABLE public.segments TO service_role;

-- acl: TABLE sessions
GRANT ALL ON TABLE public.sessions TO anon;
GRANT ALL ON TABLE public.sessions TO authenticated;
GRANT ALL ON TABLE public.sessions TO service_role;

-- acl: TABLE signal_types
GRANT ALL ON TABLE public.signal_types TO anon;
GRANT ALL ON TABLE public.signal_types TO authenticated;
GRANT ALL ON TABLE public.signal_types TO service_role;

-- acl: TABLE signals
GRANT ALL ON TABLE public.signals TO anon;
GRANT ALL ON TABLE public.signals TO authenticated;
GRANT ALL ON TABLE public.signals TO service_role;

-- acl: TABLE site_daily
GRANT ALL ON TABLE public.site_daily TO anon;
GRANT ALL ON TABLE public.site_daily TO authenticated;
GRANT ALL ON TABLE public.site_daily TO service_role;

-- acl: TABLE site_rolled
GRANT ALL ON TABLE public.site_rolled TO anon;
GRANT ALL ON TABLE public.site_rolled TO authenticated;
GRANT ALL ON TABLE public.site_rolled TO service_role;

-- acl: TABLE sites
GRANT ALL ON TABLE public.sites TO anon;
GRANT ALL ON TABLE public.sites TO authenticated;
GRANT ALL ON TABLE public.sites TO service_role;

-- acl: TABLE slack_installs
GRANT ALL ON TABLE public.slack_installs TO anon;
GRANT ALL ON TABLE public.slack_installs TO authenticated;
GRANT ALL ON TABLE public.slack_installs TO service_role;

-- acl: TABLE source_event_keys
GRANT ALL ON TABLE public.source_event_keys TO anon;
GRANT ALL ON TABLE public.source_event_keys TO authenticated;
GRANT ALL ON TABLE public.source_event_keys TO service_role;

-- acl: TABLE source_kinds
GRANT ALL ON TABLE public.source_kinds TO anon;
GRANT ALL ON TABLE public.source_kinds TO authenticated;
GRANT ALL ON TABLE public.source_kinds TO service_role;

-- acl: TABLE source_links
GRANT ALL ON TABLE public.source_links TO anon;
GRANT ALL ON TABLE public.source_links TO authenticated;
GRANT ALL ON TABLE public.source_links TO service_role;

-- acl: TABLE source_runs
GRANT ALL ON TABLE public.source_runs TO anon;
GRANT ALL ON TABLE public.source_runs TO authenticated;
GRANT ALL ON TABLE public.source_runs TO service_role;

-- acl: TABLE source_secrets
GRANT ALL ON TABLE public.source_secrets TO anon;
GRANT ALL ON TABLE public.source_secrets TO authenticated;
GRANT ALL ON TABLE public.source_secrets TO service_role;

-- acl: TABLE sources
GRANT ALL ON TABLE public.sources TO anon;
GRANT ALL ON TABLE public.sources TO authenticated;
GRANT ALL ON TABLE public.sources TO service_role;

-- acl: TABLE submission_results
GRANT ALL ON TABLE public.submission_results TO anon;
GRANT ALL ON TABLE public.submission_results TO authenticated;
GRANT ALL ON TABLE public.submission_results TO service_role;

-- acl: TABLE submission_track
GRANT ALL ON TABLE public.submission_track TO anon;
GRANT ALL ON TABLE public.submission_track TO authenticated;
GRANT ALL ON TABLE public.submission_track TO service_role;

-- acl: TABLE submissions
GRANT ALL ON TABLE public.submissions TO anon;
GRANT ALL ON TABLE public.submissions TO authenticated;
GRANT ALL ON TABLE public.submissions TO service_role;

-- acl: TABLE subscriptions
GRANT ALL ON TABLE public.subscriptions TO anon;
GRANT ALL ON TABLE public.subscriptions TO authenticated;
GRANT ALL ON TABLE public.subscriptions TO service_role;

-- acl: TABLE suite_connections
GRANT ALL ON TABLE public.suite_connections TO anon;
GRANT ALL ON TABLE public.suite_connections TO authenticated;
GRANT ALL ON TABLE public.suite_connections TO service_role;

-- acl: COLUMN suite_connections.workspace_id
GRANT SELECT(workspace_id) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.product
GRANT SELECT(product) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.base_url
GRANT SELECT(base_url) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.key_hint
GRANT SELECT(key_hint) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.brand
GRANT SELECT(brand) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.status
GRANT SELECT(status) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.error
GRANT SELECT(error) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.checked_at
GRANT SELECT(checked_at) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.connected_by
GRANT SELECT(connected_by) ON TABLE public.suite_connections TO authenticated;

-- acl: COLUMN suite_connections.created_at
GRANT SELECT(created_at) ON TABLE public.suite_connections TO authenticated;

-- acl: TABLE suppressions
GRANT ALL ON TABLE public.suppressions TO anon;
GRANT ALL ON TABLE public.suppressions TO authenticated;
GRANT ALL ON TABLE public.suppressions TO service_role;

-- acl: TABLE sync_log
GRANT ALL ON TABLE public.sync_log TO anon;
GRANT ALL ON TABLE public.sync_log TO authenticated;
GRANT ALL ON TABLE public.sync_log TO service_role;

-- acl: SEQUENCE sync_log_id_seq
GRANT ALL ON SEQUENCE public.sync_log_id_seq TO anon;
GRANT ALL ON SEQUENCE public.sync_log_id_seq TO authenticated;
GRANT ALL ON SEQUENCE public.sync_log_id_seq TO service_role;

-- acl: TABLE tasks
GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;

-- acl: TABLE test_proposals
GRANT ALL ON TABLE public.test_proposals TO anon;
GRANT ALL ON TABLE public.test_proposals TO authenticated;
GRANT ALL ON TABLE public.test_proposals TO service_role;

-- acl: TABLE test_versions
GRANT ALL ON TABLE public.test_versions TO anon;
GRANT ALL ON TABLE public.test_versions TO authenticated;
GRANT ALL ON TABLE public.test_versions TO service_role;

-- acl: TABLE text_messages
GRANT ALL ON TABLE public.text_messages TO anon;
GRANT ALL ON TABLE public.text_messages TO authenticated;
GRANT ALL ON TABLE public.text_messages TO service_role;

-- acl: TABLE text_optouts
GRANT ALL ON TABLE public.text_optouts TO anon;
GRANT ALL ON TABLE public.text_optouts TO authenticated;
GRANT ALL ON TABLE public.text_optouts TO service_role;

-- acl: TABLE topics
GRANT ALL ON TABLE public.topics TO anon;
GRANT ALL ON TABLE public.topics TO authenticated;
GRANT ALL ON TABLE public.topics TO service_role;

-- acl: TABLE webhook_deliveries
GRANT ALL ON TABLE public.webhook_deliveries TO anon;
GRANT ALL ON TABLE public.webhook_deliveries TO authenticated;
GRANT ALL ON TABLE public.webhook_deliveries TO service_role;

-- acl: TABLE webhook_endpoints
GRANT ALL ON TABLE public.webhook_endpoints TO anon;
GRANT ALL ON TABLE public.webhook_endpoints TO authenticated;
GRANT ALL ON TABLE public.webhook_endpoints TO service_role;

-- acl: TABLE workflow_emails
GRANT ALL ON TABLE public.workflow_emails TO anon;
GRANT ALL ON TABLE public.workflow_emails TO authenticated;
GRANT ALL ON TABLE public.workflow_emails TO service_role;

-- acl: TABLE workflow_folders
GRANT ALL ON TABLE public.workflow_folders TO anon;
GRANT ALL ON TABLE public.workflow_folders TO authenticated;
GRANT ALL ON TABLE public.workflow_folders TO service_role;

-- acl: TABLE workflow_marks
GRANT ALL ON TABLE public.workflow_marks TO anon;
GRANT ALL ON TABLE public.workflow_marks TO authenticated;
GRANT ALL ON TABLE public.workflow_marks TO service_role;

-- acl: TABLE workflow_runs
GRANT ALL ON TABLE public.workflow_runs TO anon;
GRANT ALL ON TABLE public.workflow_runs TO authenticated;
GRANT ALL ON TABLE public.workflow_runs TO service_role;

-- acl: TABLE workflow_steps_done
GRANT ALL ON TABLE public.workflow_steps_done TO anon;
GRANT ALL ON TABLE public.workflow_steps_done TO authenticated;
GRANT ALL ON TABLE public.workflow_steps_done TO service_role;

-- acl: TABLE workflow_versions
GRANT ALL ON TABLE public.workflow_versions TO anon;
GRANT ALL ON TABLE public.workflow_versions TO authenticated;
GRANT ALL ON TABLE public.workflow_versions TO service_role;

-- acl: TABLE workflow_watch
GRANT ALL ON TABLE public.workflow_watch TO anon;
GRANT ALL ON TABLE public.workflow_watch TO authenticated;
GRANT ALL ON TABLE public.workflow_watch TO service_role;

-- acl: TABLE workflows
GRANT ALL ON TABLE public.workflows TO anon;
GRANT ALL ON TABLE public.workflows TO authenticated;
GRANT ALL ON TABLE public.workflows TO service_role;

-- acl: TABLE workspace_billing
GRANT ALL ON TABLE public.workspace_billing TO anon;
GRANT ALL ON TABLE public.workspace_billing TO authenticated;
GRANT ALL ON TABLE public.workspace_billing TO service_role;

-- acl: TABLE workspace_members
GRANT ALL ON TABLE public.workspace_members TO anon;
GRANT ALL ON TABLE public.workspace_members TO authenticated;
GRANT ALL ON TABLE public.workspace_members TO service_role;

-- acl: TABLE workspaces
GRANT ALL ON TABLE public.workspaces TO anon;
GRANT ALL ON TABLE public.workspaces TO authenticated;
GRANT ALL ON TABLE public.workspaces TO service_role;

-- acl: COLUMN workspaces.name
GRANT UPDATE(name) ON TABLE public.workspaces TO authenticated;

-- default acl: DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- default acl: DEFAULT PRIVILEGES FOR TABLES
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;
