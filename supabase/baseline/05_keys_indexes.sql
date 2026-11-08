-- claritia: keys indexes. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- index: contact_events_contact
CREATE INDEX contact_events_contact ON ONLY public.contact_events USING btree (contact_id, at DESC);

-- index: contact_events_2025_10_contact_id_at_idx
CREATE INDEX contact_events_2025_10_contact_id_at_idx ON partitions.contact_events_2025_10 USING btree (contact_id, at DESC);

-- index: contact_events_ws
CREATE INDEX contact_events_ws ON ONLY public.contact_events USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2025_10_workspace_id_kind_at_idx
CREATE INDEX contact_events_2025_10_workspace_id_kind_at_idx ON partitions.contact_events_2025_10 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2025_11_contact_id_at_idx
CREATE INDEX contact_events_2025_11_contact_id_at_idx ON partitions.contact_events_2025_11 USING btree (contact_id, at DESC);

-- index: contact_events_2025_11_workspace_id_kind_at_idx
CREATE INDEX contact_events_2025_11_workspace_id_kind_at_idx ON partitions.contact_events_2025_11 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2025_12_contact_id_at_idx
CREATE INDEX contact_events_2025_12_contact_id_at_idx ON partitions.contact_events_2025_12 USING btree (contact_id, at DESC);

-- index: contact_events_2025_12_workspace_id_kind_at_idx
CREATE INDEX contact_events_2025_12_workspace_id_kind_at_idx ON partitions.contact_events_2025_12 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_01_contact_id_at_idx
CREATE INDEX contact_events_2026_01_contact_id_at_idx ON partitions.contact_events_2026_01 USING btree (contact_id, at DESC);

-- index: contact_events_2026_01_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_01_workspace_id_kind_at_idx ON partitions.contact_events_2026_01 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_02_contact_id_at_idx
CREATE INDEX contact_events_2026_02_contact_id_at_idx ON partitions.contact_events_2026_02 USING btree (contact_id, at DESC);

-- index: contact_events_2026_02_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_02_workspace_id_kind_at_idx ON partitions.contact_events_2026_02 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_03_contact_id_at_idx
CREATE INDEX contact_events_2026_03_contact_id_at_idx ON partitions.contact_events_2026_03 USING btree (contact_id, at DESC);

-- index: contact_events_2026_03_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_03_workspace_id_kind_at_idx ON partitions.contact_events_2026_03 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_04_contact_id_at_idx
CREATE INDEX contact_events_2026_04_contact_id_at_idx ON partitions.contact_events_2026_04 USING btree (contact_id, at DESC);

-- index: contact_events_2026_04_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_04_workspace_id_kind_at_idx ON partitions.contact_events_2026_04 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_05_contact_id_at_idx
CREATE INDEX contact_events_2026_05_contact_id_at_idx ON partitions.contact_events_2026_05 USING btree (contact_id, at DESC);

-- index: contact_events_2026_05_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_05_workspace_id_kind_at_idx ON partitions.contact_events_2026_05 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_06_contact_id_at_idx
CREATE INDEX contact_events_2026_06_contact_id_at_idx ON partitions.contact_events_2026_06 USING btree (contact_id, at DESC);

-- index: contact_events_2026_06_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_06_workspace_id_kind_at_idx ON partitions.contact_events_2026_06 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_07_contact_id_at_idx
CREATE INDEX contact_events_2026_07_contact_id_at_idx ON partitions.contact_events_2026_07 USING btree (contact_id, at DESC);

-- index: contact_events_2026_07_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_07_workspace_id_kind_at_idx ON partitions.contact_events_2026_07 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_08_contact_id_at_idx
CREATE INDEX contact_events_2026_08_contact_id_at_idx ON partitions.contact_events_2026_08 USING btree (contact_id, at DESC);

-- index: contact_events_2026_08_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_08_workspace_id_kind_at_idx ON partitions.contact_events_2026_08 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_09_contact_id_at_idx
CREATE INDEX contact_events_2026_09_contact_id_at_idx ON partitions.contact_events_2026_09 USING btree (contact_id, at DESC);

-- index: contact_events_2026_09_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_09_workspace_id_kind_at_idx ON partitions.contact_events_2026_09 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_10_contact_id_at_idx
CREATE INDEX contact_events_2026_10_contact_id_at_idx ON partitions.contact_events_2026_10 USING btree (contact_id, at DESC);

-- index: contact_events_2026_10_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_10_workspace_id_kind_at_idx ON partitions.contact_events_2026_10 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_11_contact_id_at_idx
CREATE INDEX contact_events_2026_11_contact_id_at_idx ON partitions.contact_events_2026_11 USING btree (contact_id, at DESC);

-- index: contact_events_2026_11_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_11_workspace_id_kind_at_idx ON partitions.contact_events_2026_11 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2026_12_contact_id_at_idx
CREATE INDEX contact_events_2026_12_contact_id_at_idx ON partitions.contact_events_2026_12 USING btree (contact_id, at DESC);

-- index: contact_events_2026_12_workspace_id_kind_at_idx
CREATE INDEX contact_events_2026_12_workspace_id_kind_at_idx ON partitions.contact_events_2026_12 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2027_01_contact_id_at_idx
CREATE INDEX contact_events_2027_01_contact_id_at_idx ON partitions.contact_events_2027_01 USING btree (contact_id, at DESC);

-- index: contact_events_2027_01_workspace_id_kind_at_idx
CREATE INDEX contact_events_2027_01_workspace_id_kind_at_idx ON partitions.contact_events_2027_01 USING btree (workspace_id, kind, at DESC);

-- index: contact_events_2027_02_contact_id_at_idx
CREATE INDEX contact_events_2027_02_contact_id_at_idx ON partitions.contact_events_2027_02 USING btree (contact_id, at DESC);

-- index: contact_events_2027_02_workspace_id_kind_at_idx
CREATE INDEX contact_events_2027_02_workspace_id_kind_at_idx ON partitions.contact_events_2027_02 USING btree (workspace_id, kind, at DESC);

-- index: activity_out_claimed_brin
CREATE INDEX activity_out_claimed_brin ON public.activity_out USING brin (claimed_at);

-- index: activity_out_sending
CREATE INDEX activity_out_sending ON public.activity_out USING btree (claimed_at) WHERE (status = 'sending'::text);

-- index: ai_cache_created_brin
CREATE INDEX ai_cache_created_brin ON public.ai_cache USING brin (created_at);

-- index: ai_calls_ws
CREATE INDEX ai_calls_ws ON public.ai_calls USING btree (workspace_id, at DESC);

-- index: alert_events_unsent
CREATE INDEX alert_events_unsent ON public.alert_events USING btree (created_at) WHERE (sent_at IS NULL);

-- index: api_keys_ws
CREATE INDEX api_keys_ws ON public.api_keys USING btree (workspace_id, created_at);

-- index: app_links_project
CREATE INDEX app_links_project ON public.app_links USING btree (project_id);

-- index: audit_log_ws
CREATE INDEX audit_log_ws ON public.audit_log USING btree (workspace_id, at DESC);

-- index: booking_profiles_handle
CREATE UNIQUE INDEX booking_profiles_handle ON public.booking_profiles USING btree (handle) WHERE (handle IS NOT NULL);

-- index: brand_kits_ws
CREATE INDEX brand_kits_ws ON public.brand_kits USING btree (workspace_id);

-- index: busy_blocks_account
CREATE INDEX busy_blocks_account ON public.busy_blocks USING btree (account_id, start_at);

-- index: calendar_accounts_due
CREATE INDEX calendar_accounts_due ON public.calendar_accounts USING btree (refreshed_at) WHERE (status = 'ok'::text);

-- index: calendar_accounts_user
CREATE INDEX calendar_accounts_user ON public.calendar_accounts USING btree (workspace_id, user_id);

-- index: companies_domain
CREATE UNIQUE INDEX companies_domain ON public.companies USING btree (workspace_id, domain) WHERE (domain IS NOT NULL);

-- index: companies_domain_trgm
CREATE INDEX companies_domain_trgm ON public.companies USING gin (domain extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

-- index: companies_name
CREATE UNIQUE INDEX companies_name ON public.companies USING btree (workspace_id, lower(name)) WHERE (domain IS NULL);

-- index: companies_name_trgm
CREATE INDEX companies_name_trgm ON public.companies USING gin (name extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

-- index: companies_updated
CREATE INDEX companies_updated ON public.companies USING btree (workspace_id, updated_at);

-- index: consents_contact
CREATE INDEX consents_contact ON public.consents USING btree (contact_id, channel, at DESC);

-- index: contacts_company
CREATE INDEX contacts_company ON public.contacts USING btree (company_id) WHERE (company_id IS NOT NULL);

-- index: contacts_email
CREATE UNIQUE INDEX contacts_email ON public.contacts USING btree (workspace_id, email_clean) WHERE (deleted_at IS NULL);

-- index: contacts_email_trgm
CREATE INDEX contacts_email_trgm ON public.contacts USING gin (email extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

-- index: contacts_import
CREATE INDEX contacts_import ON public.contacts USING btree (import_id) WHERE (import_id IS NOT NULL);

-- index: contacts_merged
CREATE INDEX contacts_merged ON public.contacts USING btree (merged_into) WHERE (merged_into IS NOT NULL);

-- index: contacts_name_trgm
CREATE INDEX contacts_name_trgm ON public.contacts USING gin (public.person_name(first_name, last_name) extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

-- index: contacts_no_touch
CREATE INDEX contacts_no_touch ON public.contacts USING btree (created_at) WHERE (first_touch IS NULL);

-- index: contacts_owner
CREATE INDEX contacts_owner ON public.contacts USING btree (workspace_id, owner_user_id) WHERE (deleted_at IS NULL);

-- index: contacts_route_status
CREATE INDEX contacts_route_status ON public.contacts USING btree (workspace_id, route_status) WHERE (route_status IS NOT NULL);

-- index: contacts_score_due
CREATE INDEX contacts_score_due ON public.contacts USING btree (workspace_id, scored_at NULLS FIRST) WHERE (deleted_at IS NULL);

-- index: contacts_source_ids
CREATE INDEX contacts_source_ids ON public.contacts USING gin (source_ids);

-- index: contacts_updated
CREATE INDEX contacts_updated ON public.contacts USING btree (workspace_id, updated_at DESC) WHERE (deleted_at IS NULL);

-- index: contacts_ws_created
CREATE INDEX contacts_ws_created ON public.contacts USING btree (workspace_id, created_at);

-- index: contacts_ws_id
CREATE INDEX contacts_ws_id ON public.contacts USING btree (workspace_id, id) WHERE (deleted_at IS NULL);

-- index: crm_owner_links_owner
CREATE INDEX crm_owner_links_owner ON public.crm_owner_links USING btree (workspace_id, crm_owner_id) WHERE (user_id IS NOT NULL);

-- index: crm_owner_links_user
CREATE INDEX crm_owner_links_user ON public.crm_owner_links USING btree (workspace_id, user_id) WHERE (user_id IS NOT NULL);

-- index: deliveries_destination
CREATE INDEX deliveries_destination ON public.deliveries USING btree (destination_id, created_at);

-- index: deliveries_failed
CREATE INDEX deliveries_failed ON public.deliveries USING btree (workspace_id, created_at DESC) WHERE (status = 'failed'::text);

-- index: deliveries_failed_dest
CREATE INDEX deliveries_failed_dest ON public.deliveries USING btree (destination_id) WHERE (status = 'failed'::text);

-- index: deliveries_open
CREATE INDEX deliveries_open ON public.deliveries USING btree (status, updated_at) WHERE (status = ANY (ARRAY['queued'::text, 'sending'::text, 'retrying'::text]));

-- index: design_assets_ws
CREATE INDEX design_assets_ws ON public.design_assets USING btree (workspace_id, created_at DESC);

-- index: email_events_message
CREATE INDEX email_events_message ON public.email_events USING btree (message_id, at);

-- index: email_events_ws
CREATE INDEX email_events_ws ON public.email_events USING btree (workspace_id, kind, at DESC);

-- index: email_messages_contact
CREATE INDEX email_messages_contact ON public.email_messages USING btree (contact_id, sent_at DESC) WHERE (contact_id IS NOT NULL);

-- index: email_messages_due
CREATE INDEX email_messages_due ON public.email_messages USING btree (send_after) WHERE (status = 'queued'::text);

-- index: email_messages_email
CREATE INDEX email_messages_email ON public.email_messages USING btree (email_id);

-- index: email_messages_ready
CREATE INDEX email_messages_ready ON public.email_messages USING btree (workspace_id, send_after) WHERE (status = 'queued'::text);

-- index: email_messages_sending
CREATE INDEX email_messages_sending ON public.email_messages USING btree (claimed_at) WHERE (status = 'sending'::text);

-- index: email_messages_sent
CREATE INDEX email_messages_sent ON public.email_messages USING btree (workspace_id, sent_at DESC) WHERE (sent_at IS NOT NULL);

-- index: email_messages_ws_created
CREATE INDEX email_messages_ws_created ON public.email_messages USING btree (workspace_id, created_at);

-- index: email_templates_ws
CREATE INDEX email_templates_ws ON public.email_templates USING btree (workspace_id, updated_at DESC);

-- index: email_versions_ref
CREATE INDEX email_versions_ref ON public.email_versions USING btree (workspace_id, ref, created_at DESC);

-- index: emails_form
CREATE INDEX emails_form ON public.emails USING btree (form_id, created_at DESC) WHERE (form_id IS NOT NULL);

-- index: emails_ws
CREATE INDEX emails_ws ON public.emails USING btree (workspace_id, created_at DESC);

-- index: enrich_runs_company
CREATE INDEX enrich_runs_company ON public.enrich_runs USING btree (company_id) WHERE (company_id IS NOT NULL);

-- index: enrich_runs_contact
CREATE INDEX enrich_runs_contact ON public.enrich_runs USING btree (contact_id, created_at DESC);

-- index: enrich_runs_ws
CREATE INDEX enrich_runs_ws ON public.enrich_runs USING btree (workspace_id, created_at DESC);

-- index: erasures_hash
CREATE INDEX erasures_hash ON public.erasures USING btree (value_hash);

-- index: explorations_project
CREATE INDEX explorations_project ON public.explorations USING btree (project_id, created_at DESC);

-- index: explorations_queue
CREATE INDEX explorations_queue ON public.explorations USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- index: field_history_at_brin
CREATE INDEX field_history_at_brin ON public.field_history USING brin (at);

-- index: field_history_import
CREATE INDEX field_history_import ON public.field_history USING btree (import_id) WHERE (import_id IS NOT NULL);

-- index: field_history_record
CREATE INDEX field_history_record ON public.field_history USING btree (record_id, at DESC);

-- index: form_bookings_contact
CREATE INDEX form_bookings_contact ON public.form_bookings USING btree (contact_id) WHERE (contact_id IS NOT NULL);

-- index: form_bookings_submission
CREATE INDEX form_bookings_submission ON public.form_bookings USING btree (submission_id) WHERE (submission_id IS NOT NULL);

-- index: form_chats_form
CREATE UNIQUE INDEX form_chats_form ON public.form_chats USING btree (form_id) WHERE (form_id IS NOT NULL);

-- index: form_chats_ws
CREATE INDEX form_chats_ws ON public.form_chats USING btree (workspace_id, updated_at DESC);

-- index: form_checks_form
CREATE INDEX form_checks_form ON public.form_checks USING btree (form_id, started_at DESC);

-- index: form_checks_started_brin
CREATE INDEX form_checks_started_brin ON public.form_checks USING brin (started_at);

-- index: form_checks_submission
CREATE INDEX form_checks_submission ON public.form_checks USING btree (submission_id) WHERE (submission_id IS NOT NULL);

-- index: form_daily_ws
CREATE INDEX form_daily_ws ON public.form_daily USING btree (workspace_id, day);

-- index: form_destinations_form
CREATE INDEX form_destinations_form ON public.form_destinations USING btree (form_id, "position");

-- index: form_destinations_source
CREATE UNIQUE INDEX form_destinations_source ON public.form_destinations USING btree (form_id, source_id) WHERE (source_id IS NOT NULL);

-- index: form_drafts_form
CREATE INDEX form_drafts_form ON public.form_drafts USING btree (form_id, created_at DESC);

-- index: form_field_sessions_day
CREATE INDEX form_field_sessions_day ON public.form_field_sessions USING btree (form_id, day);

-- index: form_field_sessions_day_brin
CREATE INDEX form_field_sessions_day_brin ON public.form_field_sessions USING brin (day);

-- index: form_field_sessions_left
CREATE INDEX form_field_sessions_left ON public.form_field_sessions USING btree (form_id, started_at DESC) WHERE (NOT sent);

-- index: form_field_sessions_ws
CREATE INDEX form_field_sessions_ws ON public.form_field_sessions USING btree (workspace_id, day);

-- index: form_folders_ws
CREATE INDEX form_folders_ws ON public.form_folders USING btree (workspace_id, "position");

-- index: form_seen_at_brin
CREATE INDEX form_seen_at_brin ON public.form_seen USING brin (at);

-- index: form_submissions_contact
CREATE INDEX form_submissions_contact ON public.form_submissions USING btree (contact_id) WHERE (contact_id IS NOT NULL);

-- index: form_submissions_form
CREATE INDEX form_submissions_form ON public.form_submissions USING btree (form_id, created_at DESC);

-- index: form_submissions_ip
CREATE INDEX form_submissions_ip ON public.form_submissions USING btree (form_id, ip_hash, created_at DESC);

-- index: form_uploads_loose
CREATE INDEX form_uploads_loose ON public.form_uploads USING btree (created_at) WHERE (submission_id IS NULL);

-- index: form_uploads_submission
CREATE INDEX form_uploads_submission ON public.form_uploads USING btree (submission_id) WHERE (submission_id IS NOT NULL);

-- index: forms_folder
CREATE INDEX forms_folder ON public.forms USING btree (folder_id) WHERE (folder_id IS NOT NULL);

-- index: forms_slug
CREATE UNIQUE INDEX forms_slug ON public.forms USING btree (workspace_id, slug) WHERE (slug IS NOT NULL);

-- index: forms_ws
CREATE INDEX forms_ws ON public.forms USING btree (workspace_id, created_at DESC);

-- index: forms_ws_updated
CREATE INDEX forms_ws_updated ON public.forms USING btree (workspace_id, updated_at DESC);

-- index: github_checks_open
CREATE UNIQUE INDEX github_checks_open ON public.github_checks USING btree (link_id, head_sha, base_url) WHERE (status = 'pending'::text);

-- index: github_checks_pending
CREATE INDEX github_checks_pending ON public.github_checks USING btree (created_at) WHERE (status = 'pending'::text);

-- index: github_checks_runs
CREATE INDEX github_checks_runs ON public.github_checks USING gin (run_ids) WHERE (status = 'pending'::text);

-- index: github_installations_ws
CREATE INDEX github_installations_ws ON public.github_installations USING btree (workspace_id);

-- index: github_links_repo
CREATE INDEX github_links_repo ON public.github_links USING btree (repo_id) WHERE enabled;

-- index: heals_project
CREATE INDEX heals_project ON public.heals USING btree (project_id, status, created_at DESC);

-- index: heals_test
CREATE INDEX heals_test ON public.heals USING btree (test_id, "position", status);

-- index: hook_events_done_brin
CREATE INDEX hook_events_done_brin ON public.hook_events USING brin (done_at);

-- index: hook_events_open
CREATE INDEX hook_events_open ON public.hook_events USING btree (source_id, id) WHERE (done_at IS NULL);

-- index: hook_events_received_brin
CREATE INDEX hook_events_received_brin ON public.hook_events USING brin (received_at);

-- index: imports_ws
CREATE INDEX imports_ws ON public.imports USING btree (workspace_id, created_at DESC);

-- index: inbox_messages_external
CREATE UNIQUE INDEX inbox_messages_external ON public.inbox_messages USING btree (external_id);

-- index: inbox_messages_received
CREATE INDEX inbox_messages_received ON public.inbox_messages USING btree (received_at);

-- index: inbox_messages_to
CREATE INDEX inbox_messages_to ON public.inbox_messages USING btree (project_id, to_address, received_at DESC);

-- index: jobs_finished
CREATE INDEX jobs_finished ON public.jobs USING btree (finished_at) WHERE (status = ANY (ARRAY['done'::text, 'failed'::text]));

-- index: jobs_lane
CREATE INDEX jobs_lane ON public.jobs USING btree (priority, run_after) WHERE (status = 'queued'::text);

-- index: jobs_meeting_open
CREATE INDEX jobs_meeting_open ON public.jobs USING btree (((payload ->> 'meeting'::text))) WHERE ((status = 'queued'::text) AND (kind = ANY (ARRAY['meeting_remind'::text, 'meeting_after'::text])));

-- index: jobs_one_waiting
CREATE UNIQUE INDEX jobs_one_waiting ON public.jobs USING btree (workspace_id, kind, key) NULLS NOT DISTINCT WHERE ((status = 'queued'::text) AND (key <> ''::text));

-- index: jobs_open_key
CREATE INDEX jobs_open_key ON public.jobs USING btree (kind, workspace_id, key) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- index: jobs_ready
CREATE INDEX jobs_ready ON public.jobs USING btree (kind, run_after) WHERE (status = 'queued'::text);

-- index: jobs_route_contact
CREATE INDEX jobs_route_contact ON public.jobs USING btree (workspace_id, ((payload ->> 'contact'::text))) WHERE ((kind = 'route'::text) AND (status = ANY (ARRAY['queued'::text, 'running'::text])));

-- index: jobs_running
CREATE INDEX jobs_running ON public.jobs USING btree (kind, locked_until) WHERE (status = 'running'::text);

-- index: mailbox_sends_at
CREATE INDEX mailbox_sends_at ON public.mailbox_sends USING btree (mailbox_id, at);

-- index: meeting_events_meeting
CREATE INDEX meeting_events_meeting ON public.meeting_events USING btree (meeting_id, at);

-- index: meeting_links_ws
CREATE INDEX meeting_links_ws ON public.meeting_links USING btree (workspace_id, created_at DESC);

-- index: meeting_mails_created_brin
CREATE INDEX meeting_mails_created_brin ON public.meeting_mails USING brin (created_at);

-- index: meeting_mails_meeting
CREATE INDEX meeting_mails_meeting ON public.meeting_mails USING btree (meeting_id, created_at) WHERE (meeting_id IS NOT NULL);

-- index: meeting_mails_provider
CREATE INDEX meeting_mails_provider ON public.meeting_mails USING btree (provider_id) WHERE (provider_id IS NOT NULL);

-- index: meeting_mails_submission
CREATE INDEX meeting_mails_submission ON public.meeting_mails USING btree (submission_id) WHERE (submission_id IS NOT NULL);

-- index: meeting_mails_to
CREATE INDEX meeting_mails_to ON public.meeting_mails USING btree (to_email, created_at DESC) WHERE (status = 'sent'::text);

-- index: meeting_outcome_uses_meeting
CREATE INDEX meeting_outcome_uses_meeting ON public.meeting_outcome_uses USING btree (meeting_id);

-- index: meetings_booked_end
CREATE INDEX meetings_booked_end ON public.meetings USING btree (end_at) WHERE (status = 'booked'::text);

-- index: meetings_contact
CREATE INDEX meetings_contact ON public.meetings USING btree (contact_id) WHERE (contact_id IS NOT NULL);

-- index: meetings_guest_email
CREATE INDEX meetings_guest_email ON public.meetings USING btree (workspace_id, lower(guest_email));

-- index: meetings_holding
CREATE INDEX meetings_holding ON public.meetings USING btree (workspace_id, block_end) INCLUDE (hosts, block_start, type_id, start_at) WHERE (status = ANY (ARRAY['booked'::text, 'pending_payment'::text]));

-- index: meetings_hosts
CREATE INDEX meetings_hosts ON public.meetings USING gin (hosts);

-- index: meetings_one_per_submission
CREATE UNIQUE INDEX meetings_one_per_submission ON public.meetings USING btree (submission_id) WHERE ((submission_id IS NOT NULL) AND (status = 'booked'::text));

-- index: meetings_rr
CREATE INDEX meetings_rr ON public.meetings USING btree (type_id, created_at) WHERE rr;

-- index: meetings_submission
CREATE INDEX meetings_submission ON public.meetings USING btree (submission_id) WHERE (submission_id IS NOT NULL);

-- index: meetings_type_start
CREATE INDEX meetings_type_start ON public.meetings USING btree (type_id, start_at);

-- index: meetings_ws_created
CREATE INDEX meetings_ws_created ON public.meetings USING btree (workspace_id, created_at);

-- index: meetings_ws_start
CREATE INDEX meetings_ws_start ON public.meetings USING btree (workspace_id, start_at DESC);

-- index: notes_record
CREATE INDEX notes_record ON public.notes USING btree (workspace_id, object, record_id, created_at DESC);

-- index: notes_record_id
CREATE INDEX notes_record_id ON public.notes USING btree (record_id);

-- index: nurture_enrollments_contact
CREATE INDEX nurture_enrollments_contact ON public.nurture_enrollments USING btree (contact_id);

-- index: nurture_enrollments_due
CREATE INDEX nurture_enrollments_due ON public.nurture_enrollments USING btree (next_at) WHERE (status = 'active'::text);

-- index: nurtures_ws
CREATE INDEX nurtures_ws ON public.nurtures USING btree (workspace_id, created_at DESC);

-- index: oauth_codes_created
CREATE INDEX oauth_codes_created ON public.oauth_codes USING btree (created_at);

-- index: person_cache_hash
CREATE INDEX person_cache_hash ON public.person_cache USING btree (public.email_hash(email_clean));

-- index: plans_project
CREATE INDEX plans_project ON public.plans USING btree (project_id, created_at DESC);

-- index: plans_queue
CREATE INDEX plans_queue ON public.plans USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- index: privacy_requests_ws
CREATE INDEX privacy_requests_ws ON public.privacy_requests USING btree (workspace_id, requested_at DESC);

-- index: projects_inbox
CREATE UNIQUE INDEX projects_inbox ON public.projects USING btree (inbox_id);

-- index: projects_ws
CREATE INDEX projects_ws ON public.projects USING btree (workspace_id, created_at);

-- index: record_links_from
CREATE INDEX record_links_from ON public.record_links USING btree (from_id);

-- index: record_links_to
CREATE INDEX record_links_to ON public.record_links USING btree (to_id);

-- index: records_name_trgm
CREATE INDEX records_name_trgm ON public.records USING gin (name extensions.gin_trgm_ops) WHERE (deleted_at IS NULL);

-- index: records_object
CREATE INDEX records_object ON public.records USING btree (object_id, updated_at DESC) WHERE (deleted_at IS NULL);

-- index: records_source_ids
CREATE INDEX records_source_ids ON public.records USING gin (source_ids);

-- index: router_replays_created_brin
CREATE INDEX router_replays_created_brin ON public.router_replays USING brin (created_at);

-- index: router_runs_contact
CREATE INDEX router_runs_contact ON public.router_runs USING btree (contact_id, created_at DESC) WHERE (contact_id IS NOT NULL);

-- index: router_runs_created_brin
CREATE INDEX router_runs_created_brin ON public.router_runs USING brin (created_at);

-- index: router_runs_meeting
CREATE INDEX router_runs_meeting ON public.router_runs USING btree (meeting_id) WHERE (meeting_id IS NOT NULL);

-- index: router_runs_owner
CREATE INDEX router_runs_owner ON public.router_runs USING btree (workspace_id, owner, created_at) WHERE ((kind = 'owner'::text) AND (undone_at IS NULL));

-- index: router_runs_parent
CREATE INDEX router_runs_parent ON public.router_runs USING btree (parent_run_id) WHERE (parent_run_id IS NOT NULL);

-- index: router_runs_sync_open
CREATE INDEX router_runs_sync_open ON public.router_runs USING btree (workspace_id, contact_id) WHERE (sync_state = ANY (ARRAY['pending'::text, 'failed'::text]));

-- index: router_runs_turns
CREATE INDEX router_runs_turns ON public.router_runs USING btree (workspace_id, queue_id, created_at) WHERE ((kind = 'owner'::text) AND (undone_at IS NULL));

-- index: router_runs_ws
CREATE INDEX router_runs_ws ON public.router_runs USING btree (workspace_id, created_at DESC);

-- index: router_slas_contact
CREATE INDEX router_slas_contact ON public.router_slas USING btree (contact_id, started_at DESC);

-- index: router_slas_nudge
CREATE INDEX router_slas_nudge ON public.router_slas USING btree (nudge_at) WHERE ((status = 'open'::text) AND (nudged_at IS NULL));

-- index: router_slas_open
CREATE INDEX router_slas_open ON public.router_slas USING btree (due_at) WHERE (status = 'open'::text);

-- index: router_slas_user
CREATE INDEX router_slas_user ON public.router_slas USING btree (workspace_id, user_id, started_at DESC);

-- index: routing_assignments_user
CREATE INDEX routing_assignments_user ON public.routing_assignments USING btree (workspace_id, user_id, created_at DESC);

-- index: routing_policies_create_key
CREATE UNIQUE INDEX routing_policies_create_key ON public.routing_policies USING btree (workspace_id, create_key) WHERE (create_key IS NOT NULL);

-- index: routing_policies_default
CREATE UNIQUE INDEX routing_policies_default ON public.routing_policies USING btree (workspace_id) WHERE is_default;

-- index: routing_policies_ws
CREATE INDEX routing_policies_ws ON public.routing_policies USING btree (workspace_id, created_at);

-- index: routing_policy_versions_key
CREATE UNIQUE INDEX routing_policy_versions_key ON public.routing_policy_versions USING btree (policy_id, publish_key) WHERE (publish_key IS NOT NULL);

-- index: routing_reviews_open
CREATE INDEX routing_reviews_open ON public.routing_reviews USING btree (workspace_id, state, created_at DESC) WHERE (state <> ALL (ARRAY['resolved'::text, 'dismissed'::text]));

-- index: routing_reviews_reviewer
CREATE INDEX routing_reviews_reviewer ON public.routing_reviews USING btree (workspace_id, reviewer) WHERE (state <> ALL (ARRAY['resolved'::text, 'dismissed'::text]));

-- index: routing_sources_form
CREATE UNIQUE INDEX routing_sources_form ON public.routing_sources USING btree (form_id) WHERE (kind = 'form'::text);

-- index: routing_sources_handoff
CREATE UNIQUE INDEX routing_sources_handoff ON public.routing_sources USING btree (workspace_id) WHERE (kind = 'handoff'::text);

-- index: routing_sources_policy
CREATE INDEX routing_sources_policy ON public.routing_sources USING btree (policy_id) WHERE (policy_id IS NOT NULL);

-- index: routing_team_keys_team
CREATE INDEX routing_team_keys_team ON public.routing_team_keys USING btree (team_id);

-- index: routing_team_members_user
CREATE INDEX routing_team_members_user ON public.routing_team_members USING btree (workspace_id, user_id);

-- index: routing_teams_ws
CREATE INDEX routing_teams_ws ON public.routing_teams USING btree (workspace_id);

-- index: routing_test_evidence_policy
CREATE INDEX routing_test_evidence_policy ON public.routing_test_evidence USING btree (policy_id, fingerprint, created_at DESC);

-- index: runs_project
CREATE INDEX runs_project ON public.runs USING btree (project_id, created_at DESC);

-- index: runs_queue
CREATE INDEX runs_queue ON public.runs USING btree (status, created_at) WHERE (status = ANY (ARRAY['queued'::text, 'running'::text]));

-- index: runs_test
CREATE INDEX runs_test ON public.runs USING btree (test_id, created_at DESC);

-- index: saved_views_ws
CREATE INDEX saved_views_ws ON public.saved_views USING btree (workspace_id, screen, created_at);

-- index: schedules_due
CREATE INDEX schedules_due ON public.schedules USING btree (next_run_at) WHERE enabled;

-- index: scoring_models_ws
CREATE INDEX scoring_models_ws ON public.scoring_models USING btree (workspace_id, "position");

-- index: segment_members_contact
CREATE INDEX segment_members_contact ON public.segment_members USING btree (contact_id);

-- index: segments_source
CREATE UNIQUE INDEX segments_source ON public.segments USING btree (source_id, external_id) WHERE (source_id IS NOT NULL);

-- index: sending_domains_domain
CREATE UNIQUE INDEX sending_domains_domain ON public.sending_domains USING btree (domain);

-- index: sending_domains_ws
CREATE INDEX sending_domains_ws ON public.sending_domains USING btree (workspace_id);

-- index: source_event_keys_at_brin
CREATE INDEX source_event_keys_at_brin ON public.source_event_keys USING brin (at);

-- index: source_links_local
CREATE UNIQUE INDEX source_links_local ON public.source_links USING btree (source_id, object, local_id) WHERE (deleted_at IS NULL);

-- index: source_links_record
CREATE INDEX source_links_record ON public.source_links USING btree (local_id);

-- index: source_runs_source
CREATE INDEX source_runs_source ON public.source_runs USING btree (source_id, started_at DESC);

-- index: source_runs_started_brin
CREATE INDEX source_runs_started_brin ON public.source_runs USING brin (started_at);

-- index: sources_account
CREATE INDEX sources_account ON public.sources USING btree (kind, account);

-- index: sources_due
CREATE INDEX sources_due ON public.sources USING btree (next_run_at) WHERE (status = 'active'::text);

-- index: submission_results_form
CREATE INDEX submission_results_form ON public.submission_results USING btree (form_id, created_at DESC);

-- index: submission_results_outcome
CREATE INDEX submission_results_outcome ON public.submission_results USING btree (form_id, outcome_id);

-- index: submission_track_created
CREATE INDEX submission_track_created ON public.submission_track USING btree (created_at);

-- index: submissions_booking
CREATE INDEX submissions_booking ON public.submissions USING btree (form_id) WHERE (booking_shown_at IS NOT NULL);

-- index: submissions_contact
CREATE INDEX submissions_contact ON public.submissions USING btree (contact_id) WHERE (contact_id IS NOT NULL);

-- index: submissions_form
CREATE INDEX submissions_form ON public.submissions USING btree (form_id, created_at DESC);

-- index: submissions_form_leads
CREATE INDEX submissions_form_leads ON public.submissions USING btree (form_id, created_at DESC) WHERE ((NOT spam) AND (NOT test));

-- index: submissions_form_page
CREATE INDEX submissions_form_page ON public.submissions USING btree (form_id, created_at DESC, id DESC);

-- index: submissions_idem
CREATE UNIQUE INDEX submissions_idem ON public.submissions USING btree (workspace_id, idem_key);

-- index: submissions_search
CREATE INDEX submissions_search ON public.submissions USING gin (search);

-- index: submissions_spam
CREATE INDEX submissions_spam ON public.submissions USING btree (created_at) WHERE spam;

-- index: submissions_ws_created
CREATE INDEX submissions_ws_created ON public.submissions USING btree (workspace_id, created_at);

-- index: sync_log_at_brin
CREATE INDEX sync_log_at_brin ON public.sync_log USING brin (at);

-- index: sync_log_errors
CREATE INDEX sync_log_errors ON public.sync_log USING btree (source_id, at DESC) WHERE (action = 'error'::text);

-- index: sync_log_source
CREATE INDEX sync_log_source ON public.sync_log USING btree (source_id, at DESC);

-- index: sync_log_ws
CREATE INDEX sync_log_ws ON public.sync_log USING btree (workspace_id, at DESC);

-- index: tasks_dedupe
CREATE UNIQUE INDEX tasks_dedupe ON public.tasks USING btree (workspace_id, dedupe_key) WHERE (dedupe_key IS NOT NULL);

-- index: tasks_idem
CREATE UNIQUE INDEX tasks_idem ON public.tasks USING btree (workspace_id, idem_key) WHERE (idem_key IS NOT NULL);

-- index: tasks_mine
CREATE INDEX tasks_mine ON public.tasks USING btree (workspace_id, assignee, done, due);

-- index: tasks_record
CREATE INDEX tasks_record ON public.tasks USING btree (workspace_id, object, record_id, done, due);

-- index: tasks_record_id
CREATE INDEX tasks_record_id ON public.tasks USING btree (record_id);

-- index: test_proposals_project
CREATE INDEX test_proposals_project ON public.test_proposals USING btree (project_id, status, created_at DESC);

-- index: tests_project
CREATE INDEX tests_project ON public.tests USING btree (project_id, use_case, name);

-- index: text_messages_contact
CREATE INDEX text_messages_contact ON public.text_messages USING btree (contact_id, created_at DESC);

-- index: text_messages_sid
CREATE INDEX text_messages_sid ON public.text_messages USING btree (sid) WHERE (sid IS NOT NULL);

-- index: topics_name
CREATE UNIQUE INDEX topics_name ON public.topics USING btree (workspace_id, lower(name));

-- index: tunnels_open
CREATE INDEX tunnels_open ON public.tunnels USING btree (workspace_id, last_seen_at DESC) WHERE (disconnected_at IS NULL);

-- index: webhook_deliveries_created_brin
CREATE INDEX webhook_deliveries_created_brin ON public.webhook_deliveries USING brin (created_at);

-- index: webhook_deliveries_endpoint
CREATE INDEX webhook_deliveries_endpoint ON public.webhook_deliveries USING btree (endpoint_id, created_at DESC);

-- index: webhook_deliveries_ref
CREATE UNIQUE INDEX webhook_deliveries_ref ON public.webhook_deliveries USING btree (endpoint_id, ref) WHERE (ref IS NOT NULL);

-- index: webhook_endpoints_key
CREATE INDEX webhook_endpoints_key ON public.webhook_endpoints USING btree (api_key_id) WHERE (api_key_id IS NOT NULL);

-- index: webhook_endpoints_ws
CREATE INDEX webhook_endpoints_ws ON public.webhook_endpoints USING btree (workspace_id, created_at);

-- index: workflow_folders_ws
CREATE INDEX workflow_folders_ws ON public.workflow_folders USING btree (workspace_id, "position");

-- index: workflow_runs_contact
CREATE INDEX workflow_runs_contact ON public.workflow_runs USING btree (contact_id, started_at DESC);

-- index: workflow_runs_due
CREATE INDEX workflow_runs_due ON public.workflow_runs USING btree (workspace_id, next_at) WHERE (status = ANY (ARRAY['active'::text, 'waiting'::text]));

-- index: workflow_runs_flow
CREATE INDEX workflow_runs_flow ON public.workflow_runs USING btree (workflow_id, started_at DESC);

-- index: workflow_runs_next
CREATE INDEX workflow_runs_next ON public.workflow_runs USING btree (next_at) WHERE (status = ANY (ARRAY['active'::text, 'waiting'::text]));

-- index: workflow_steps_ws
CREATE INDEX workflow_steps_ws ON public.workflow_steps_done USING btree (workspace_id, at DESC);

-- index: workflow_watch_ws
CREATE INDEX workflow_watch_ws ON public.workflow_watch USING btree (workspace_id, key);

-- index: workflows_live
CREATE INDEX workflows_live ON public.workflows USING btree (trigger_kind) WHERE (status = 'live'::text);

-- index: workflows_ws
CREATE INDEX workflows_ws ON public.workflows USING btree (workspace_id, updated_at DESC);

-- index: workspace_members_user
CREATE INDEX workspace_members_user ON public.workspace_members USING btree (user_id);

-- index attach: contact_events_2025_10_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2025_10_contact_id_at_idx;

-- index attach: contact_events_2025_10_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2025_10_pkey;

-- index attach: contact_events_2025_10_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2025_10_workspace_id_kind_at_idx;

-- index attach: contact_events_2025_11_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2025_11_contact_id_at_idx;

-- index attach: contact_events_2025_11_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2025_11_pkey;

-- index attach: contact_events_2025_11_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2025_11_workspace_id_kind_at_idx;

-- index attach: contact_events_2025_12_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2025_12_contact_id_at_idx;

-- index attach: contact_events_2025_12_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2025_12_pkey;

-- index attach: contact_events_2025_12_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2025_12_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_01_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_01_contact_id_at_idx;

-- index attach: contact_events_2026_01_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_01_pkey;

-- index attach: contact_events_2026_01_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_01_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_02_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_02_contact_id_at_idx;

-- index attach: contact_events_2026_02_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_02_pkey;

-- index attach: contact_events_2026_02_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_02_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_03_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_03_contact_id_at_idx;

-- index attach: contact_events_2026_03_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_03_pkey;

-- index attach: contact_events_2026_03_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_03_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_04_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_04_contact_id_at_idx;

-- index attach: contact_events_2026_04_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_04_pkey;

-- index attach: contact_events_2026_04_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_04_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_05_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_05_contact_id_at_idx;

-- index attach: contact_events_2026_05_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_05_pkey;

-- index attach: contact_events_2026_05_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_05_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_06_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_06_contact_id_at_idx;

-- index attach: contact_events_2026_06_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_06_pkey;

-- index attach: contact_events_2026_06_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_06_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_07_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_07_contact_id_at_idx;

-- index attach: contact_events_2026_07_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_07_pkey;

-- index attach: contact_events_2026_07_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_07_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_08_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_08_contact_id_at_idx;

-- index attach: contact_events_2026_08_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_08_pkey;

-- index attach: contact_events_2026_08_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_08_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_09_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_09_contact_id_at_idx;

-- index attach: contact_events_2026_09_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_09_pkey;

-- index attach: contact_events_2026_09_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_09_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_10_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_10_contact_id_at_idx;

-- index attach: contact_events_2026_10_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_10_pkey;

-- index attach: contact_events_2026_10_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_10_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_11_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_11_contact_id_at_idx;

-- index attach: contact_events_2026_11_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_11_pkey;

-- index attach: contact_events_2026_11_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_11_workspace_id_kind_at_idx;

-- index attach: contact_events_2026_12_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2026_12_contact_id_at_idx;

-- index attach: contact_events_2026_12_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2026_12_pkey;

-- index attach: contact_events_2026_12_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2026_12_workspace_id_kind_at_idx;

-- index attach: contact_events_2027_01_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2027_01_contact_id_at_idx;

-- index attach: contact_events_2027_01_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2027_01_pkey;

-- index attach: contact_events_2027_01_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2027_01_workspace_id_kind_at_idx;

-- index attach: contact_events_2027_02_contact_id_at_idx
ALTER INDEX public.contact_events_contact ATTACH PARTITION partitions.contact_events_2027_02_contact_id_at_idx;

-- index attach: contact_events_2027_02_pkey
ALTER INDEX public.contact_events_pkey ATTACH PARTITION partitions.contact_events_2027_02_pkey;

-- index attach: contact_events_2027_02_workspace_id_kind_at_idx
ALTER INDEX public.contact_events_ws ATTACH PARTITION partitions.contact_events_2027_02_workspace_id_kind_at_idx;

-- fk constraint: activity_out activity_out_source_id_fkey
ALTER TABLE ONLY public.activity_out
    ADD CONSTRAINT activity_out_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: activity_out activity_out_workspace_id_fkey
ALTER TABLE ONLY public.activity_out
    ADD CONSTRAINT activity_out_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ai_cache ai_cache_workspace_id_fkey
ALTER TABLE ONLY public.ai_cache
    ADD CONSTRAINT ai_cache_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: ai_calls ai_calls_workspace_id_fkey
ALTER TABLE ONLY public.ai_calls
    ADD CONSTRAINT ai_calls_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: alert_events alert_events_heal_id_fkey
ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_heal_id_fkey FOREIGN KEY (heal_id) REFERENCES public.heals(id) ON DELETE CASCADE;

-- fk constraint: alert_events alert_events_project_id_fkey
ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: alert_events alert_events_run_id_fkey
ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;

-- fk constraint: alert_events alert_events_workspace_id_fkey
ALTER TABLE ONLY public.alert_events
    ADD CONSTRAINT alert_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: alert_settings alert_settings_project_id_fkey
ALTER TABLE ONLY public.alert_settings
    ADD CONSTRAINT alert_settings_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: alert_settings alert_settings_workspace_id_fkey
ALTER TABLE ONLY public.alert_settings
    ADD CONSTRAINT alert_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: api_keys api_keys_workspace_id_fkey
ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: app_links app_links_from_page_fkey
ALTER TABLE ONLY public.app_links
    ADD CONSTRAINT app_links_from_page_fkey FOREIGN KEY (from_page) REFERENCES public.app_pages(id) ON DELETE CASCADE;

-- fk constraint: app_links app_links_project_id_fkey
ALTER TABLE ONLY public.app_links
    ADD CONSTRAINT app_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: app_links app_links_to_page_fkey
ALTER TABLE ONLY public.app_links
    ADD CONSTRAINT app_links_to_page_fkey FOREIGN KEY (to_page) REFERENCES public.app_pages(id) ON DELETE CASCADE;

-- fk constraint: app_links app_links_workspace_id_fkey
ALTER TABLE ONLY public.app_links
    ADD CONSTRAINT app_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: app_pages app_pages_exploration_id_fkey
ALTER TABLE ONLY public.app_pages
    ADD CONSTRAINT app_pages_exploration_id_fkey FOREIGN KEY (exploration_id) REFERENCES public.explorations(id) ON DELETE SET NULL;

-- fk constraint: app_pages app_pages_project_id_fkey
ALTER TABLE ONLY public.app_pages
    ADD CONSTRAINT app_pages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: app_pages app_pages_workspace_id_fkey
ALTER TABLE ONLY public.app_pages
    ADD CONSTRAINT app_pages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: audit_log audit_log_workspace_id_fkey
ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: availability_schedules availability_schedules_workspace_id_fkey
ALTER TABLE ONLY public.availability_schedules
    ADD CONSTRAINT availability_schedules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: availability availability_workspace_id_fkey
ALTER TABLE ONLY public.availability
    ADD CONSTRAINT availability_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: blocks blocks_project_id_fkey
ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: blocks blocks_workspace_id_fkey
ALTER TABLE ONLY public.blocks
    ADD CONSTRAINT blocks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: booking_profiles booking_profiles_workspace_id_fkey
ALTER TABLE ONLY public.booking_profiles
    ADD CONSTRAINT booking_profiles_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: brand_kits brand_kits_site_id_fkey
ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_site_id_fkey FOREIGN KEY (site_id) REFERENCES public.sites(id) ON DELETE SET NULL;

-- fk constraint: brand_kits brand_kits_workspace_id_fkey
ALTER TABLE ONLY public.brand_kits
    ADD CONSTRAINT brand_kits_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: busy_blocks busy_blocks_account_id_fkey
ALTER TABLE ONLY public.busy_blocks
    ADD CONSTRAINT busy_blocks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.calendar_accounts(id) ON DELETE CASCADE;

-- fk constraint: calendar_accounts calendar_accounts_workspace_id_fkey
ALTER TABLE ONLY public.calendar_accounts
    ADD CONSTRAINT calendar_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: calendar_lists calendar_lists_account_id_fkey
ALTER TABLE ONLY public.calendar_lists
    ADD CONSTRAINT calendar_lists_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.calendar_accounts(id) ON DELETE CASCADE;

-- fk constraint: calendar_tokens calendar_tokens_account_id_fkey
ALTER TABLE ONLY public.calendar_tokens
    ADD CONSTRAINT calendar_tokens_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.calendar_accounts(id) ON DELETE CASCADE;

-- fk constraint: companies companies_workspace_id_fkey
ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: consents consents_contact_id_fkey
ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: consents consents_workspace_id_fkey
ALTER TABLE ONLY public.consents
    ADD CONSTRAINT consents_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: contact_events contact_events_contact_id_fkey
ALTER TABLE public.contact_events
    ADD CONSTRAINT contact_events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: contact_events contact_events_workspace_id_fkey
ALTER TABLE public.contact_events
    ADD CONSTRAINT contact_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: contacts contacts_company_id_fkey
ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- fk constraint: contacts contacts_workspace_id_fkey
ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: crm_owner_links crm_owner_links_source_id_fkey
ALTER TABLE ONLY public.crm_owner_links
    ADD CONSTRAINT crm_owner_links_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: crm_owner_links crm_owner_links_workspace_id_fkey
ALTER TABLE ONLY public.crm_owner_links
    ADD CONSTRAINT crm_owner_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: deliveries deliveries_destination_id_fkey
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.form_destinations(id) ON DELETE CASCADE;

-- fk constraint: deliveries deliveries_submission_id_fkey
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: deliveries deliveries_workspace_id_fkey
ALTER TABLE ONLY public.deliveries
    ADD CONSTRAINT deliveries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: design_assets design_assets_workspace_id_fkey
ALTER TABLE ONLY public.design_assets
    ADD CONSTRAINT design_assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_events email_events_message_id_fkey
ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.email_messages(id) ON DELETE CASCADE;

-- fk constraint: email_events email_events_workspace_id_fkey
ALTER TABLE ONLY public.email_events
    ADD CONSTRAINT email_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_messages email_messages_contact_id_fkey
ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: email_messages email_messages_email_id_fkey
ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;

-- fk constraint: email_messages email_messages_workspace_id_fkey
ALTER TABLE ONLY public.email_messages
    ADD CONSTRAINT email_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_templates email_templates_workspace_id_fkey
ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_tokens email_tokens_workspace_id_fkey
ALTER TABLE ONLY public.email_tokens
    ADD CONSTRAINT email_tokens_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: email_versions email_versions_workspace_id_fkey
ALTER TABLE ONLY public.email_versions
    ADD CONSTRAINT email_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: emails emails_form_id_fkey
ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE SET NULL;

-- fk constraint: emails emails_topic_id_fkey
ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

-- fk constraint: emails emails_workspace_id_fkey
ALTER TABLE ONLY public.emails
    ADD CONSTRAINT emails_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: enrich_keys enrich_keys_workspace_id_fkey
ALTER TABLE ONLY public.enrich_keys
    ADD CONSTRAINT enrich_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: enrich_runs enrich_runs_company_id_fkey
ALTER TABLE ONLY public.enrich_runs
    ADD CONSTRAINT enrich_runs_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;

-- fk constraint: enrich_runs enrich_runs_contact_id_fkey
ALTER TABLE ONLY public.enrich_runs
    ADD CONSTRAINT enrich_runs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: enrich_runs enrich_runs_workspace_id_fkey
ALTER TABLE ONLY public.enrich_runs
    ADD CONSTRAINT enrich_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: enrich_settings enrich_settings_workspace_id_fkey
ALTER TABLE ONLY public.enrich_settings
    ADD CONSTRAINT enrich_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: enrich_sources enrich_sources_workspace_id_fkey
ALTER TABLE ONLY public.enrich_sources
    ADD CONSTRAINT enrich_sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: enrich_usage enrich_usage_workspace_id_fkey
ALTER TABLE ONLY public.enrich_usage
    ADD CONSTRAINT enrich_usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: env_secret_values env_secret_values_secret_id_fkey
ALTER TABLE ONLY public.env_secret_values
    ADD CONSTRAINT env_secret_values_secret_id_fkey FOREIGN KEY (secret_id) REFERENCES public.env_secrets(id) ON DELETE CASCADE;

-- fk constraint: env_secrets env_secrets_environment_id_fkey
ALTER TABLE ONLY public.env_secrets
    ADD CONSTRAINT env_secrets_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

-- fk constraint: env_secrets env_secrets_workspace_id_fkey
ALTER TABLE ONLY public.env_secrets
    ADD CONSTRAINT env_secrets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: environments environments_project_id_fkey
ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: environments environments_workspace_id_fkey
ALTER TABLE ONLY public.environments
    ADD CONSTRAINT environments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: erasures erasures_workspace_id_fkey
ALTER TABLE ONLY public.erasures
    ADD CONSTRAINT erasures_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: explorations explorations_environment_id_fkey
ALTER TABLE ONLY public.explorations
    ADD CONSTRAINT explorations_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE SET NULL;

-- fk constraint: explorations explorations_project_id_fkey
ALTER TABLE ONLY public.explorations
    ADD CONSTRAINT explorations_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: explorations explorations_sign_in_test_id_fkey
ALTER TABLE ONLY public.explorations
    ADD CONSTRAINT explorations_sign_in_test_id_fkey FOREIGN KEY (sign_in_test_id) REFERENCES public.tests(id) ON DELETE SET NULL;

-- fk constraint: explorations explorations_workspace_id_fkey
ALTER TABLE ONLY public.explorations
    ADD CONSTRAINT explorations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: field_history field_history_workspace_id_fkey
ALTER TABLE ONLY public.field_history
    ADD CONSTRAINT field_history_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: field_order field_order_workspace_id_fkey
ALTER TABLE ONLY public.field_order
    ADD CONSTRAINT field_order_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: field_settings field_settings_workspace_id_fkey
ALTER TABLE ONLY public.field_settings
    ADD CONSTRAINT field_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: field_writes field_writes_contact_id_fkey
ALTER TABLE ONLY public.field_writes
    ADD CONSTRAINT field_writes_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: field_writes field_writes_workspace_id_fkey
ALTER TABLE ONLY public.field_writes
    ADD CONSTRAINT field_writes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: fields fields_workspace_id_fkey
ALTER TABLE ONLY public.fields
    ADD CONSTRAINT fields_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_bookings form_bookings_contact_id_fkey
ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: form_bookings form_bookings_source_id_fkey
ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE SET NULL;

-- fk constraint: form_bookings form_bookings_submission_id_fkey
ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE SET NULL;

-- fk constraint: form_bookings form_bookings_workspace_id_fkey
ALTER TABLE ONLY public.form_bookings
    ADD CONSTRAINT form_bookings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_chats form_chats_form_id_fkey
ALTER TABLE ONLY public.form_chats
    ADD CONSTRAINT form_chats_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_chats form_chats_workspace_id_fkey
ALTER TABLE ONLY public.form_chats
    ADD CONSTRAINT form_chats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_checks form_checks_form_id_fkey
ALTER TABLE ONLY public.form_checks
    ADD CONSTRAINT form_checks_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_checks form_checks_submission_id_fkey
ALTER TABLE ONLY public.form_checks
    ADD CONSTRAINT form_checks_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE SET NULL;

-- fk constraint: form_checks form_checks_workspace_id_fkey
ALTER TABLE ONLY public.form_checks
    ADD CONSTRAINT form_checks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_daily form_daily_form_id_fkey
ALTER TABLE ONLY public.form_daily
    ADD CONSTRAINT form_daily_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_daily form_daily_workspace_id_fkey
ALTER TABLE ONLY public.form_daily
    ADD CONSTRAINT form_daily_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_destination_secrets form_destination_secrets_destination_id_fkey
ALTER TABLE ONLY public.form_destination_secrets
    ADD CONSTRAINT form_destination_secrets_destination_id_fkey FOREIGN KEY (destination_id) REFERENCES public.form_destinations(id) ON DELETE CASCADE;

-- fk constraint: form_destinations form_destinations_form_id_fkey
ALTER TABLE ONLY public.form_destinations
    ADD CONSTRAINT form_destinations_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_destinations form_destinations_source_id_fkey
ALTER TABLE ONLY public.form_destinations
    ADD CONSTRAINT form_destinations_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: form_destinations form_destinations_workspace_id_fkey
ALTER TABLE ONLY public.form_destinations
    ADD CONSTRAINT form_destinations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_drafts form_drafts_form_id_fkey
ALTER TABLE ONLY public.form_drafts
    ADD CONSTRAINT form_drafts_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_drafts form_drafts_workspace_id_fkey
ALTER TABLE ONLY public.form_drafts
    ADD CONSTRAINT form_drafts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_field_sessions form_field_sessions_form_id_fkey
ALTER TABLE ONLY public.form_field_sessions
    ADD CONSTRAINT form_field_sessions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_field_sessions form_field_sessions_workspace_id_fkey
ALTER TABLE ONLY public.form_field_sessions
    ADD CONSTRAINT form_field_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_folders form_folders_workspace_id_fkey
ALTER TABLE ONLY public.form_folders
    ADD CONSTRAINT form_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_notify_sent form_notify_sent_submission_id_fkey
ALTER TABLE ONLY public.form_notify_sent
    ADD CONSTRAINT form_notify_sent_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: form_seen form_seen_form_id_fkey
ALTER TABLE ONLY public.form_seen
    ADD CONSTRAINT form_seen_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_slug_moves form_slug_moves_form_id_fkey
ALTER TABLE ONLY public.form_slug_moves
    ADD CONSTRAINT form_slug_moves_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_slug_moves form_slug_moves_workspace_id_fkey
ALTER TABLE ONLY public.form_slug_moves
    ADD CONSTRAINT form_slug_moves_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_submissions form_submissions_contact_id_fkey
ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: form_submissions form_submissions_form_id_fkey
ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_submissions form_submissions_workspace_id_fkey
ALTER TABLE ONLY public.form_submissions
    ADD CONSTRAINT form_submissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_uploads form_uploads_form_id_fkey
ALTER TABLE ONLY public.form_uploads
    ADD CONSTRAINT form_uploads_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_uploads form_uploads_submission_id_fkey
ALTER TABLE ONLY public.form_uploads
    ADD CONSTRAINT form_uploads_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: form_uploads form_uploads_workspace_id_fkey
ALTER TABLE ONLY public.form_uploads
    ADD CONSTRAINT form_uploads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: form_versions form_versions_form_id_fkey
ALTER TABLE ONLY public.form_versions
    ADD CONSTRAINT form_versions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: form_versions form_versions_workspace_id_fkey
ALTER TABLE ONLY public.form_versions
    ADD CONSTRAINT form_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: forms forms_brand_kit_id_fkey
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_brand_kit_id_fkey FOREIGN KEY (brand_kit_id) REFERENCES public.brand_kits(id) ON DELETE SET NULL;

-- fk constraint: forms forms_folder_id_fkey
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.form_folders(id) ON DELETE SET NULL;

-- fk constraint: forms forms_live_kit_id_fkey
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_live_kit_id_fkey FOREIGN KEY (live_kit_id) REFERENCES public.brand_kits(id) ON DELETE SET NULL;

-- fk constraint: forms forms_workspace_id_fkey
ALTER TABLE ONLY public.forms
    ADD CONSTRAINT forms_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: github_checks github_checks_link_id_fkey
ALTER TABLE ONLY public.github_checks
    ADD CONSTRAINT github_checks_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.github_links(id) ON DELETE CASCADE;

-- fk constraint: github_checks github_checks_workspace_id_fkey
ALTER TABLE ONLY public.github_checks
    ADD CONSTRAINT github_checks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: github_installations github_installations_workspace_id_fkey
ALTER TABLE ONLY public.github_installations
    ADD CONSTRAINT github_installations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: github_links github_links_environment_id_fkey
ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

-- fk constraint: github_links github_links_installation_id_fkey
ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_installation_id_fkey FOREIGN KEY (installation_id) REFERENCES public.github_installations(id) ON DELETE CASCADE;

-- fk constraint: github_links github_links_project_id_fkey
ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: github_links github_links_workspace_id_fkey
ALTER TABLE ONLY public.github_links
    ADD CONSTRAINT github_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: heals heals_project_id_fkey
ALTER TABLE ONLY public.heals
    ADD CONSTRAINT heals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: heals heals_run_id_fkey
ALTER TABLE ONLY public.heals
    ADD CONSTRAINT heals_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE SET NULL;

-- fk constraint: heals heals_test_id_fkey
ALTER TABLE ONLY public.heals
    ADD CONSTRAINT heals_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;

-- fk constraint: heals heals_workspace_id_fkey
ALTER TABLE ONLY public.heals
    ADD CONSTRAINT heals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: hook_events hook_events_source_id_fkey
ALTER TABLE ONLY public.hook_events
    ADD CONSTRAINT hook_events_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: hook_events hook_events_workspace_id_fkey
ALTER TABLE ONLY public.hook_events
    ADD CONSTRAINT hook_events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: imports imports_workspace_id_fkey
ALTER TABLE ONLY public.imports
    ADD CONSTRAINT imports_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: inbox_messages inbox_messages_project_id_fkey
ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: inbox_messages inbox_messages_workspace_id_fkey
ALTER TABLE ONLY public.inbox_messages
    ADD CONSTRAINT inbox_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: invites invites_invited_by_fkey
ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- fk constraint: invites invites_workspace_id_fkey
ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: jobs jobs_workspace_id_fkey
ALTER TABLE ONLY public.jobs
    ADD CONSTRAINT jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: lead_score_marks lead_score_marks_workspace_id_fkey
ALTER TABLE ONLY public.lead_score_marks
    ADD CONSTRAINT lead_score_marks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: lead_settings lead_settings_workspace_id_fkey
ALTER TABLE ONLY public.lead_settings
    ADD CONSTRAINT lead_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: link_domains link_domains_workspace_id_fkey
ALTER TABLE ONLY public.link_domains
    ADD CONSTRAINT link_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: mailbox_sends mailbox_sends_mailbox_id_fkey
ALTER TABLE ONLY public.mailbox_sends
    ADD CONSTRAINT mailbox_sends_mailbox_id_fkey FOREIGN KEY (mailbox_id) REFERENCES public.mailboxes(id) ON DELETE CASCADE;

-- fk constraint: mailboxes mailboxes_workspace_id_fkey
ALTER TABLE ONLY public.mailboxes
    ADD CONSTRAINT mailboxes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: mappings mappings_source_id_fkey
ALTER TABLE ONLY public.mappings
    ADD CONSTRAINT mappings_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: mappings mappings_workspace_id_fkey
ALTER TABLE ONLY public.mappings
    ADD CONSTRAINT mappings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: meeting_events meeting_events_meeting_id_fkey
ALTER TABLE ONLY public.meeting_events
    ADD CONSTRAINT meeting_events_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

-- fk constraint: meeting_links meeting_links_type_id_fkey
ALTER TABLE ONLY public.meeting_links
    ADD CONSTRAINT meeting_links_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.meeting_types(id) ON DELETE CASCADE;

-- fk constraint: meeting_links meeting_links_workspace_id_fkey
ALTER TABLE ONLY public.meeting_links
    ADD CONSTRAINT meeting_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: meeting_mails meeting_mails_meeting_id_fkey
ALTER TABLE ONLY public.meeting_mails
    ADD CONSTRAINT meeting_mails_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

-- fk constraint: meeting_mails meeting_mails_submission_id_fkey
ALTER TABLE ONLY public.meeting_mails
    ADD CONSTRAINT meeting_mails_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE SET NULL;

-- fk constraint: meeting_mails meeting_mails_workspace_id_fkey
ALTER TABLE ONLY public.meeting_mails
    ADD CONSTRAINT meeting_mails_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: meeting_outcome_uses meeting_outcome_uses_meeting_id_fkey
ALTER TABLE ONLY public.meeting_outcome_uses
    ADD CONSTRAINT meeting_outcome_uses_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

-- fk constraint: meeting_sync_leases meeting_sync_leases_meeting_id_fkey
ALTER TABLE ONLY public.meeting_sync_leases
    ADD CONSTRAINT meeting_sync_leases_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE CASCADE;

-- fk constraint: meeting_types meeting_types_template_id_fkey
ALTER TABLE ONLY public.meeting_types
    ADD CONSTRAINT meeting_types_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.meeting_types(id) ON DELETE SET NULL;

-- fk constraint: meeting_types meeting_types_workspace_id_fkey
ALTER TABLE ONLY public.meeting_types
    ADD CONSTRAINT meeting_types_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: meetings meetings_contact_id_fkey
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: meetings meetings_link_id_fkey
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.meeting_links(id) ON DELETE SET NULL;

-- fk constraint: meetings meetings_submission_id_fkey
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE SET NULL;

-- fk constraint: meetings meetings_type_id_fkey
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_type_id_fkey FOREIGN KEY (type_id) REFERENCES public.meeting_types(id) ON DELETE SET NULL;

-- fk constraint: meetings meetings_workspace_id_fkey
ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: notes notes_workspace_id_fkey
ALTER TABLE ONLY public.notes
    ADD CONSTRAINT notes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: nurture_enrollments nurture_enrollments_contact_id_fkey
ALTER TABLE ONLY public.nurture_enrollments
    ADD CONSTRAINT nurture_enrollments_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: nurture_enrollments nurture_enrollments_nurture_id_fkey
ALTER TABLE ONLY public.nurture_enrollments
    ADD CONSTRAINT nurture_enrollments_nurture_id_fkey FOREIGN KEY (nurture_id) REFERENCES public.nurtures(id) ON DELETE CASCADE;

-- fk constraint: nurture_enrollments nurture_enrollments_workspace_id_fkey
ALTER TABLE ONLY public.nurture_enrollments
    ADD CONSTRAINT nurture_enrollments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: nurture_marks nurture_marks_nurture_id_fkey
ALTER TABLE ONLY public.nurture_marks
    ADD CONSTRAINT nurture_marks_nurture_id_fkey FOREIGN KEY (nurture_id) REFERENCES public.nurtures(id) ON DELETE CASCADE;

-- fk constraint: nurture_steps nurture_steps_email_id_fkey
ALTER TABLE ONLY public.nurture_steps
    ADD CONSTRAINT nurture_steps_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id);

-- fk constraint: nurture_steps nurture_steps_nurture_id_fkey
ALTER TABLE ONLY public.nurture_steps
    ADD CONSTRAINT nurture_steps_nurture_id_fkey FOREIGN KEY (nurture_id) REFERENCES public.nurtures(id) ON DELETE CASCADE;

-- fk constraint: nurture_steps nurture_steps_workspace_id_fkey
ALTER TABLE ONLY public.nurture_steps
    ADD CONSTRAINT nurture_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: nurtures nurtures_topic_id_fkey
ALTER TABLE ONLY public.nurtures
    ADD CONSTRAINT nurtures_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

-- fk constraint: nurtures nurtures_workspace_id_fkey
ALTER TABLE ONLY public.nurtures
    ADD CONSTRAINT nurtures_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: oauth_codes oauth_codes_key_id_fkey
ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_key_id_fkey FOREIGN KEY (key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;

-- fk constraint: oauth_codes oauth_codes_workspace_id_fkey
ALTER TABLE ONLY public.oauth_codes
    ADD CONSTRAINT oauth_codes_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: object_layouts object_layouts_workspace_id_fkey
ALTER TABLE ONLY public.object_layouts
    ADD CONSTRAINT object_layouts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: objects objects_workspace_id_fkey
ALTER TABLE ONLY public.objects
    ADD CONSTRAINT objects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: payment_accounts payment_accounts_workspace_id_fkey
ALTER TABLE ONLY public.payment_accounts
    ADD CONSTRAINT payment_accounts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: plan_usage plan_usage_workspace_id_fkey
ALTER TABLE ONLY public.plan_usage
    ADD CONSTRAINT plan_usage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: plans plans_project_id_fkey
ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: plans plans_workspace_id_fkey
ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: poll_votes poll_votes_link_id_fkey
ALTER TABLE ONLY public.poll_votes
    ADD CONSTRAINT poll_votes_link_id_fkey FOREIGN KEY (link_id) REFERENCES public.meeting_links(id) ON DELETE CASCADE;

-- fk constraint: privacy_requests privacy_requests_workspace_id_fkey
ALTER TABLE ONLY public.privacy_requests
    ADD CONSTRAINT privacy_requests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: projects projects_workspace_id_fkey
ALTER TABLE ONLY public.projects
    ADD CONSTRAINT projects_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: qualify_settings qualify_settings_workspace_id_fkey
ALTER TABLE ONLY public.qualify_settings
    ADD CONSTRAINT qualify_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: record_links record_links_field_id_fkey
ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_field_id_fkey FOREIGN KEY (field_id) REFERENCES public.fields(id) ON DELETE CASCADE;

-- fk constraint: record_links record_links_workspace_id_fkey
ALTER TABLE ONLY public.record_links
    ADD CONSTRAINT record_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: records records_object_id_fkey
ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_object_id_fkey FOREIGN KEY (object_id) REFERENCES public.objects(id) ON DELETE CASCADE;

-- fk constraint: records records_workspace_id_fkey
ALTER TABLE ONLY public.records
    ADD CONSTRAINT records_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_alert_sent router_alert_sent_run_id_fkey
ALTER TABLE ONLY public.router_alert_sent
    ADD CONSTRAINT router_alert_sent_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.router_runs(id) ON DELETE CASCADE;

-- fk constraint: router_chats router_chats_workspace_id_fkey
ALTER TABLE ONLY public.router_chats
    ADD CONSTRAINT router_chats_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_replays router_replays_workspace_id_fkey
ALTER TABLE ONLY public.router_replays
    ADD CONSTRAINT router_replays_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_reps router_reps_workspace_id_fkey
ALTER TABLE ONLY public.router_reps
    ADD CONSTRAINT router_reps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_runs router_runs_contact_id_fkey
ALTER TABLE ONLY public.router_runs
    ADD CONSTRAINT router_runs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: router_runs router_runs_workspace_id_fkey
ALTER TABLE ONLY public.router_runs
    ADD CONSTRAINT router_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_secrets router_secrets_workspace_id_fkey
ALTER TABLE ONLY public.router_secrets
    ADD CONSTRAINT router_secrets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_slas router_slas_contact_id_fkey
ALTER TABLE ONLY public.router_slas
    ADD CONSTRAINT router_slas_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: router_slas router_slas_run_id_fkey
ALTER TABLE ONLY public.router_slas
    ADD CONSTRAINT router_slas_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.router_runs(id) ON DELETE CASCADE;

-- fk constraint: router_slas router_slas_workspace_id_fkey
ALTER TABLE ONLY public.router_slas
    ADD CONSTRAINT router_slas_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: router_versions router_versions_workspace_id_fkey
ALTER TABLE ONLY public.router_versions
    ADD CONSTRAINT router_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routers routers_workspace_id_fkey
ALTER TABLE ONLY public.routers
    ADD CONSTRAINT routers_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_assignments routing_assignments_run_id_fkey
ALTER TABLE ONLY public.routing_assignments
    ADD CONSTRAINT routing_assignments_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.router_runs(id) ON DELETE CASCADE;

-- fk constraint: routing_assignments routing_assignments_workspace_id_fkey
ALTER TABLE ONLY public.routing_assignments
    ADD CONSTRAINT routing_assignments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_policies routing_policies_workspace_id_fkey
ALTER TABLE ONLY public.routing_policies
    ADD CONSTRAINT routing_policies_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_policy_versions routing_policy_versions_policy_id_fkey
ALTER TABLE ONLY public.routing_policy_versions
    ADD CONSTRAINT routing_policy_versions_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.routing_policies(id) ON DELETE CASCADE;

-- fk constraint: routing_policy_versions routing_policy_versions_workspace_id_fkey
ALTER TABLE ONLY public.routing_policy_versions
    ADD CONSTRAINT routing_policy_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_quota routing_quota_workspace_id_fkey
ALTER TABLE ONLY public.routing_quota
    ADD CONSTRAINT routing_quota_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_reviews routing_reviews_run_id_fkey
ALTER TABLE ONLY public.routing_reviews
    ADD CONSTRAINT routing_reviews_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.router_runs(id) ON DELETE CASCADE;

-- fk constraint: routing_reviews routing_reviews_workspace_id_fkey
ALTER TABLE ONLY public.routing_reviews
    ADD CONSTRAINT routing_reviews_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_sources routing_sources_form_id_fkey
ALTER TABLE ONLY public.routing_sources
    ADD CONSTRAINT routing_sources_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE CASCADE;

-- fk constraint: routing_sources routing_sources_policy_id_fkey
ALTER TABLE ONLY public.routing_sources
    ADD CONSTRAINT routing_sources_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.routing_policies(id) ON DELETE SET NULL;

-- fk constraint: routing_sources routing_sources_workspace_id_fkey
ALTER TABLE ONLY public.routing_sources
    ADD CONSTRAINT routing_sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_team_keys routing_team_keys_team_id_fkey
ALTER TABLE ONLY public.routing_team_keys
    ADD CONSTRAINT routing_team_keys_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.routing_teams(id) ON DELETE CASCADE;

-- fk constraint: routing_team_keys routing_team_keys_workspace_id_fkey
ALTER TABLE ONLY public.routing_team_keys
    ADD CONSTRAINT routing_team_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_team_members routing_team_members_team_id_fkey
ALTER TABLE ONLY public.routing_team_members
    ADD CONSTRAINT routing_team_members_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.routing_teams(id) ON DELETE CASCADE;

-- fk constraint: routing_team_members routing_team_members_workspace_id_fkey
ALTER TABLE ONLY public.routing_team_members
    ADD CONSTRAINT routing_team_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_teams routing_teams_workspace_id_fkey
ALTER TABLE ONLY public.routing_teams
    ADD CONSTRAINT routing_teams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: routing_test_evidence routing_test_evidence_policy_id_fkey
ALTER TABLE ONLY public.routing_test_evidence
    ADD CONSTRAINT routing_test_evidence_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES public.routing_policies(id) ON DELETE CASCADE;

-- fk constraint: routing_test_evidence routing_test_evidence_workspace_id_fkey
ALTER TABLE ONLY public.routing_test_evidence
    ADD CONSTRAINT routing_test_evidence_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: run_steps run_steps_run_id_fkey
ALTER TABLE ONLY public.run_steps
    ADD CONSTRAINT run_steps_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.runs(id) ON DELETE CASCADE;

-- fk constraint: run_steps run_steps_workspace_id_fkey
ALTER TABLE ONLY public.run_steps
    ADD CONSTRAINT run_steps_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: runs runs_api_key_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE SET NULL;

-- fk constraint: runs runs_environment_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE SET NULL;

-- fk constraint: runs runs_project_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: runs runs_retried_as_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_retried_as_fkey FOREIGN KEY (retried_as) REFERENCES public.runs(id) ON DELETE SET NULL;

-- fk constraint: runs runs_retry_of_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_retry_of_fkey FOREIGN KEY (retry_of) REFERENCES public.runs(id) ON DELETE SET NULL;

-- fk constraint: runs runs_schedule_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.schedules(id) ON DELETE SET NULL;

-- fk constraint: runs runs_test_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE SET NULL;

-- fk constraint: runs runs_workspace_id_fkey
ALTER TABLE ONLY public.runs
    ADD CONSTRAINT runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: saved_views saved_views_workspace_id_fkey
ALTER TABLE ONLY public.saved_views
    ADD CONSTRAINT saved_views_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: scheduler_links scheduler_links_workspace_id_fkey
ALTER TABLE ONLY public.scheduler_links
    ADD CONSTRAINT scheduler_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: schedules schedules_environment_id_fkey
ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_environment_id_fkey FOREIGN KEY (environment_id) REFERENCES public.environments(id) ON DELETE CASCADE;

-- fk constraint: schedules schedules_project_id_fkey
ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: schedules schedules_workspace_id_fkey
ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: scoring_models scoring_models_workspace_id_fkey
ALTER TABLE ONLY public.scoring_models
    ADD CONSTRAINT scoring_models_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: scoring_versions scoring_versions_model_id_fkey
ALTER TABLE ONLY public.scoring_versions
    ADD CONSTRAINT scoring_versions_model_id_fkey FOREIGN KEY (model_id) REFERENCES public.scoring_models(id) ON DELETE CASCADE;

-- fk constraint: segment_members segment_members_contact_id_fkey
ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: segment_members segment_members_segment_id_fkey
ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES public.segments(id) ON DELETE CASCADE;

-- fk constraint: segment_members segment_members_workspace_id_fkey
ALTER TABLE ONLY public.segment_members
    ADD CONSTRAINT segment_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: segments segments_source_id_fkey
ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE SET NULL;

-- fk constraint: segments segments_workspace_id_fkey
ALTER TABLE ONLY public.segments
    ADD CONSTRAINT segments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: send_settings send_settings_workspace_id_fkey
ALTER TABLE ONLY public.send_settings
    ADD CONSTRAINT send_settings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: sending_domains sending_domains_workspace_id_fkey
ALTER TABLE ONLY public.sending_domains
    ADD CONSTRAINT sending_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: sites sites_workspace_id_fkey
ALTER TABLE ONLY public.sites
    ADD CONSTRAINT sites_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: slack_installs slack_installs_workspace_id_fkey
ALTER TABLE ONLY public.slack_installs
    ADD CONSTRAINT slack_installs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: source_event_keys source_event_keys_source_id_fkey
ALTER TABLE ONLY public.source_event_keys
    ADD CONSTRAINT source_event_keys_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: source_links source_links_source_id_fkey
ALTER TABLE ONLY public.source_links
    ADD CONSTRAINT source_links_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: source_links source_links_workspace_id_fkey
ALTER TABLE ONLY public.source_links
    ADD CONSTRAINT source_links_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: source_runs source_runs_source_id_fkey
ALTER TABLE ONLY public.source_runs
    ADD CONSTRAINT source_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: source_runs source_runs_workspace_id_fkey
ALTER TABLE ONLY public.source_runs
    ADD CONSTRAINT source_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: source_secrets source_secrets_source_id_fkey
ALTER TABLE ONLY public.source_secrets
    ADD CONSTRAINT source_secrets_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: sources sources_workspace_id_fkey
ALTER TABLE ONLY public.sources
    ADD CONSTRAINT sources_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: submission_results submission_results_form_id_fkey
ALTER TABLE ONLY public.submission_results
    ADD CONSTRAINT submission_results_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE SET NULL;

-- fk constraint: submission_results submission_results_submission_id_fkey
ALTER TABLE ONLY public.submission_results
    ADD CONSTRAINT submission_results_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: submission_results submission_results_workspace_id_fkey
ALTER TABLE ONLY public.submission_results
    ADD CONSTRAINT submission_results_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: submission_track submission_track_submission_id_fkey
ALTER TABLE ONLY public.submission_track
    ADD CONSTRAINT submission_track_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: submission_track submission_track_workspace_id_fkey
ALTER TABLE ONLY public.submission_track
    ADD CONSTRAINT submission_track_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: submissions submissions_booking_type_id_fkey
ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_booking_type_id_fkey FOREIGN KEY (booking_type_id) REFERENCES public.meeting_types(id) ON DELETE SET NULL;

-- fk constraint: submissions submissions_contact_id_fkey
ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: submissions submissions_form_id_fkey
ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_form_id_fkey FOREIGN KEY (form_id) REFERENCES public.forms(id) ON DELETE SET NULL;

-- fk constraint: submissions submissions_workspace_id_fkey
ALTER TABLE ONLY public.submissions
    ADD CONSTRAINT submissions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: subscriptions subscriptions_contact_id_fkey
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: subscriptions subscriptions_topic_id_fkey
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;

-- fk constraint: subscriptions subscriptions_workspace_id_fkey
ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: suite_connections suite_connections_workspace_id_fkey
ALTER TABLE ONLY public.suite_connections
    ADD CONSTRAINT suite_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: suppressions suppressions_workspace_id_fkey
ALTER TABLE ONLY public.suppressions
    ADD CONSTRAINT suppressions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: sync_log sync_log_source_id_fkey
ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.sources(id) ON DELETE CASCADE;

-- fk constraint: sync_log sync_log_workspace_id_fkey
ALTER TABLE ONLY public.sync_log
    ADD CONSTRAINT sync_log_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: tasks tasks_workspace_id_fkey
ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: team_domains team_domains_workspace_id_fkey
ALTER TABLE ONLY public.team_domains
    ADD CONSTRAINT team_domains_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: test_proposals test_proposals_plan_id_fkey
ALTER TABLE ONLY public.test_proposals
    ADD CONSTRAINT test_proposals_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id) ON DELETE SET NULL;

-- fk constraint: test_proposals test_proposals_project_id_fkey
ALTER TABLE ONLY public.test_proposals
    ADD CONSTRAINT test_proposals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: test_proposals test_proposals_test_id_fkey
ALTER TABLE ONLY public.test_proposals
    ADD CONSTRAINT test_proposals_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE SET NULL;

-- fk constraint: test_proposals test_proposals_workspace_id_fkey
ALTER TABLE ONLY public.test_proposals
    ADD CONSTRAINT test_proposals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: test_versions test_versions_test_id_fkey
ALTER TABLE ONLY public.test_versions
    ADD CONSTRAINT test_versions_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;

-- fk constraint: test_versions test_versions_workspace_id_fkey
ALTER TABLE ONLY public.test_versions
    ADD CONSTRAINT test_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: tests tests_project_id_fkey
ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- fk constraint: tests tests_workspace_id_fkey
ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: text_messages text_messages_contact_id_fkey
ALTER TABLE ONLY public.text_messages
    ADD CONSTRAINT text_messages_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;

-- fk constraint: text_messages text_messages_workspace_id_fkey
ALTER TABLE ONLY public.text_messages
    ADD CONSTRAINT text_messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: topics topics_workspace_id_fkey
ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: tunnels tunnels_api_key_id_fkey
ALTER TABLE ONLY public.tunnels
    ADD CONSTRAINT tunnels_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;

-- fk constraint: tunnels tunnels_workspace_id_fkey
ALTER TABLE ONLY public.tunnels
    ADD CONSTRAINT tunnels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: webhook_deliveries webhook_deliveries_endpoint_id_fkey
ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_endpoint_id_fkey FOREIGN KEY (endpoint_id) REFERENCES public.webhook_endpoints(id) ON DELETE CASCADE;

-- fk constraint: webhook_deliveries webhook_deliveries_submission_id_fkey
ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_submission_id_fkey FOREIGN KEY (submission_id) REFERENCES public.submissions(id) ON DELETE CASCADE;

-- fk constraint: webhook_deliveries webhook_deliveries_workspace_id_fkey
ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: webhook_endpoints webhook_endpoints_api_key_id_fkey
ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE CASCADE;

-- fk constraint: webhook_endpoints webhook_endpoints_workspace_id_fkey
ALTER TABLE ONLY public.webhook_endpoints
    ADD CONSTRAINT webhook_endpoints_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflow_emails workflow_emails_email_id_fkey
ALTER TABLE ONLY public.workflow_emails
    ADD CONSTRAINT workflow_emails_email_id_fkey FOREIGN KEY (email_id) REFERENCES public.emails(id) ON DELETE CASCADE;

-- fk constraint: workflow_emails workflow_emails_workflow_id_fkey
ALTER TABLE ONLY public.workflow_emails
    ADD CONSTRAINT workflow_emails_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

-- fk constraint: workflow_folders workflow_folders_workspace_id_fkey
ALTER TABLE ONLY public.workflow_folders
    ADD CONSTRAINT workflow_folders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflow_marks workflow_marks_workflow_id_fkey
ALTER TABLE ONLY public.workflow_marks
    ADD CONSTRAINT workflow_marks_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

-- fk constraint: workflow_runs workflow_runs_contact_id_fkey
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE CASCADE;

-- fk constraint: workflow_runs workflow_runs_workflow_id_fkey
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

-- fk constraint: workflow_runs workflow_runs_workspace_id_fkey
ALTER TABLE ONLY public.workflow_runs
    ADD CONSTRAINT workflow_runs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflow_steps_done workflow_steps_done_run_id_fkey
ALTER TABLE ONLY public.workflow_steps_done
    ADD CONSTRAINT workflow_steps_done_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.workflow_runs(id) ON DELETE CASCADE;

-- fk constraint: workflow_steps_done workflow_steps_done_workspace_id_fkey
ALTER TABLE ONLY public.workflow_steps_done
    ADD CONSTRAINT workflow_steps_done_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflow_versions workflow_versions_workflow_id_fkey
ALTER TABLE ONLY public.workflow_versions
    ADD CONSTRAINT workflow_versions_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

-- fk constraint: workflow_versions workflow_versions_workspace_id_fkey
ALTER TABLE ONLY public.workflow_versions
    ADD CONSTRAINT workflow_versions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflow_watch workflow_watch_workflow_id_fkey
ALTER TABLE ONLY public.workflow_watch
    ADD CONSTRAINT workflow_watch_workflow_id_fkey FOREIGN KEY (workflow_id) REFERENCES public.workflows(id) ON DELETE CASCADE;

-- fk constraint: workflow_watch workflow_watch_workspace_id_fkey
ALTER TABLE ONLY public.workflow_watch
    ADD CONSTRAINT workflow_watch_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workflows workflows_folder_id_fkey
ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.workflow_folders(id) ON DELETE SET NULL;

-- fk constraint: workflows workflows_workspace_id_fkey
ALTER TABLE ONLY public.workflows
    ADD CONSTRAINT workflows_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspace_billing workspace_billing_workspace_id_fkey
ALTER TABLE ONLY public.workspace_billing
    ADD CONSTRAINT workspace_billing_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspace_members workspace_members_user_id_fkey
ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- fk constraint: workspace_members workspace_members_workspace_id_fkey
ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- fk constraint: workspaces workspaces_brand_kit_id_fkey
ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_brand_kit_id_fkey FOREIGN KEY (brand_kit_id) REFERENCES public.brand_kits(id) ON DELETE SET NULL;
