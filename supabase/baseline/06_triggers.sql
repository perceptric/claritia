-- claritia: triggers. Built from the running database. Unused objects were removed in the move (see README.md).
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

-- trigger: api_keys api_keys_revoked
CREATE TRIGGER api_keys_revoked AFTER UPDATE OF revoked_at ON public.api_keys FOR EACH ROW EXECUTE FUNCTION public.api_keys_revoked();

-- trigger: workspace_billing billing_plan_changed
CREATE TRIGGER billing_plan_changed AFTER INSERT OR UPDATE OF plan ON public.workspace_billing FOR EACH ROW EXECUTE FUNCTION public.billing_plan_changed();

-- trigger: blocks blocks_touch
CREATE TRIGGER blocks_touch BEFORE UPDATE ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.blocks_touch();

-- trigger: blocks blocks_workspace
CREATE TRIGGER blocks_workspace BEFORE INSERT OR UPDATE OF project_id ON public.blocks FOR EACH ROW EXECUTE FUNCTION public.project_workspace();

-- trigger: companies companies_cleanup
CREATE TRIGGER companies_cleanup AFTER DELETE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.record_cleanup();

-- trigger: account_domains companies_follow_account
CREATE TRIGGER companies_follow_account AFTER INSERT ON public.account_domains FOR EACH ROW EXECUTE FUNCTION public.companies_follow_account();

-- trigger: contact_events contact_events_webhooks
CREATE TRIGGER contact_events_webhooks AFTER INSERT ON public.contact_events FOR EACH ROW EXECUTE FUNCTION public.contact_events_webhooks();

-- trigger: contacts contacts_band_event
CREATE TRIGGER contacts_band_event AFTER UPDATE OF score_band ON public.contacts FOR EACH ROW WHEN (((new.score_band IS DISTINCT FROM old.score_band) AND (new.score_band IS NOT NULL) AND (new.deleted_at IS NULL))) EXECUTE FUNCTION public.contacts_band_event();

-- trigger: contacts contacts_cleanup
CREATE TRIGGER contacts_cleanup AFTER DELETE ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.record_cleanup();

-- trigger: contacts contacts_crm_owner
CREATE TRIGGER contacts_crm_owner BEFORE UPDATE OF owner_crm_id ON public.contacts FOR EACH ROW WHEN (((new.owner_crm_id IS DISTINCT FROM old.owner_crm_id) AND (new.owner_crm_id IS NOT NULL) AND (NOT (new.owner_user_id IS DISTINCT FROM old.owner_user_id)))) EXECUTE FUNCTION public.contacts_crm_owner();

-- trigger: contacts contacts_enrich_new
CREATE TRIGGER contacts_enrich_new AFTER INSERT ON public.contacts FOR EACH ROW EXECUTE FUNCTION public.contacts_enrich_new();

-- trigger: identifiers contacts_follow_identifier
CREATE TRIGGER contacts_follow_identifier AFTER INSERT OR DELETE OR UPDATE OF person_id, value_clean ON public.identifiers FOR EACH ROW EXECUTE FUNCTION public.contacts_follow_identifier();

-- trigger: persons contacts_follow_merge
CREATE TRIGGER contacts_follow_merge AFTER UPDATE OF merged_into ON public.persons FOR EACH ROW EXECUTE FUNCTION public.contacts_follow_merge();

-- trigger: contacts contacts_owner_meeting_task
CREATE TRIGGER contacts_owner_meeting_task AFTER UPDATE ON public.contacts FOR EACH ROW WHEN (((new.owner_user_id IS DISTINCT FROM old.owner_user_id) AND (new.owner_user_id IS NOT NULL) AND (COALESCE(((new.field_sources -> 'owner'::text) ->> 's'::text), ''::text) = 'crm'::text))) EXECUTE FUNCTION public.contacts_owner_meeting_task();

-- trigger: contacts contacts_score_touch
CREATE TRIGGER contacts_score_touch BEFORE UPDATE OF score_band, owner_crm_id ON public.contacts FOR EACH ROW WHEN (((new.score_band IS DISTINCT FROM old.score_band) OR (new.owner_crm_id IS DISTINCT FROM old.owner_crm_id))) EXECUTE FUNCTION public.contacts_score_touch();

-- trigger: environments environment_workspace
CREATE TRIGGER environment_workspace BEFORE INSERT OR UPDATE OF project_id ON public.environments FOR EACH ROW EXECUTE FUNCTION public.environment_workspace();

-- trigger: erasures erasures_forget_person
CREATE TRIGGER erasures_forget_person AFTER INSERT ON public.erasures FOR EACH ROW EXECUTE FUNCTION public.person_cache_forget();

-- trigger: explorations explorations_wake
CREATE TRIGGER explorations_wake AFTER INSERT ON public.explorations FOR EACH ROW EXECUTE FUNCTION public.explorations_wake();

-- trigger: field_history field_history_event
CREATE TRIGGER field_history_event AFTER INSERT ON public.field_history FOR EACH ROW EXECUTE FUNCTION public.field_history_event();

-- trigger: github_links github_links_prepare
CREATE TRIGGER github_links_prepare BEFORE INSERT OR UPDATE ON public.github_links FOR EACH ROW EXECUTE FUNCTION public.github_links_prepare();

-- trigger: heals heals_alert
CREATE TRIGGER heals_alert AFTER INSERT ON public.heals FOR EACH ROW EXECUTE FUNCTION public.heals_alert();

-- trigger: jobs jobs_drop_removed
CREATE TRIGGER jobs_drop_removed BEFORE INSERT ON public.jobs FOR EACH ROW EXECUTE FUNCTION public.jobs_drop_removed();

-- trigger: meeting_events meeting_events_webhooks
CREATE TRIGGER meeting_events_webhooks AFTER INSERT ON public.meeting_events FOR EACH ROW EXECUTE FUNCTION public.meeting_events_webhooks();

-- trigger: plans plans_wake
CREATE TRIGGER plans_wake AFTER INSERT ON public.plans FOR EACH ROW EXECUTE FUNCTION public.plans_wake();

-- trigger: projects projects_inbox
CREATE TRIGGER projects_inbox BEFORE INSERT OR UPDATE OF inbox_id ON public.projects FOR EACH ROW EXECUTE FUNCTION public.project_inbox();

-- trigger: projects projects_limit
CREATE TRIGGER projects_limit BEFORE INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.project_limit();

-- trigger: records records_cleanup
CREATE TRIGGER records_cleanup AFTER DELETE ON public.records FOR EACH ROW EXECUTE FUNCTION public.record_cleanup();

-- trigger: router_runs router_runs_wake_notify
CREATE TRIGGER router_runs_wake_notify AFTER INSERT ON public.router_runs FOR EACH ROW EXECUTE FUNCTION public.router_runs_wake_notify();

-- trigger: router_runs router_sla_start
CREATE TRIGGER router_sla_start AFTER INSERT ON public.router_runs FOR EACH ROW EXECUTE FUNCTION public.router_sla_start();

-- trigger: router_runs router_sla_undone
CREATE TRIGGER router_sla_undone AFTER UPDATE OF undone_at ON public.router_runs FOR EACH ROW EXECUTE FUNCTION public.router_sla_undone();

-- trigger: forms routing_form_made
CREATE TRIGGER routing_form_made AFTER INSERT ON public.forms FOR EACH ROW EXECUTE FUNCTION public.routing_form_made();

-- trigger: form_versions routing_form_published
CREATE TRIGGER routing_form_published AFTER INSERT ON public.form_versions FOR EACH ROW EXECUTE FUNCTION public.routing_form_published();

-- trigger: meetings routing_meeting_changed
CREATE TRIGGER routing_meeting_changed AFTER UPDATE OF status, events ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.routing_meeting_changed();

-- trigger: meeting_events routing_meeting_failed
CREATE TRIGGER routing_meeting_failed AFTER INSERT ON public.meeting_events FOR EACH ROW EXECUTE FUNCTION public.routing_meeting_failed();

-- trigger: meetings routing_meeting_made
CREATE TRIGGER routing_meeting_made AFTER INSERT ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.routing_meeting_made();

-- trigger: workspace_members routing_reviewer_left
CREATE TRIGGER routing_reviewer_left AFTER DELETE ON public.workspace_members FOR EACH ROW EXECUTE FUNCTION public.routing_reviewer_left();

-- trigger: routing_reviews routing_reviews_child
CREATE TRIGGER routing_reviews_child BEFORE INSERT ON public.routing_reviews FOR EACH ROW EXECUTE FUNCTION public.routing_reviews_child();

-- trigger: routing_reviews routing_reviews_spam
CREATE TRIGGER routing_reviews_spam BEFORE INSERT ON public.routing_reviews FOR EACH ROW EXECUTE FUNCTION public.routing_reviews_spam();

-- trigger: router_runs routing_runs_after
CREATE TRIGGER routing_runs_after AFTER INSERT ON public.router_runs FOR EACH ROW EXECUTE FUNCTION public.routing_runs_after();

-- trigger: router_runs routing_runs_before
CREATE TRIGGER routing_runs_before BEFORE INSERT ON public.router_runs FOR EACH ROW EXECUTE FUNCTION public.routing_runs_before();

-- trigger: sync_log routing_sync_logged
CREATE TRIGGER routing_sync_logged AFTER INSERT ON public.sync_log REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.routing_sync_logged();

-- trigger: routing_policy_versions routing_versions_frozen
CREATE TRIGGER routing_versions_frozen BEFORE UPDATE ON public.routing_policy_versions FOR EACH ROW EXECUTE FUNCTION public.routing_versions_frozen();

-- trigger: runs runs_alert
CREATE TRIGGER runs_alert AFTER UPDATE OF status ON public.runs FOR EACH ROW WHEN (((old.status IS DISTINCT FROM new.status) AND (new.status = 'failed'::text))) EXECUTE FUNCTION public.runs_alert();

-- trigger: runs runs_github_sync
CREATE TRIGGER runs_github_sync AFTER UPDATE OF status ON public.runs FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.runs_github_sync();

-- trigger: runs runs_wake
CREATE TRIGGER runs_wake AFTER INSERT OR UPDATE OF status ON public.runs FOR EACH ROW EXECUTE FUNCTION public.runs_wake();

-- trigger: schedules schedules_prepare
CREATE TRIGGER schedules_prepare BEFORE INSERT OR UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.schedules_prepare();

-- trigger: segment_members segment_members_event
CREATE TRIGGER segment_members_event AFTER INSERT OR UPDATE OF left_at ON public.segment_members FOR EACH ROW EXECUTE FUNCTION public.segment_members_event();

-- trigger: submissions submissions_count
CREATE TRIGGER submissions_count AFTER INSERT OR UPDATE OF spam ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.submissions_count();

-- trigger: submissions submissions_first_touch
CREATE TRIGGER submissions_first_touch AFTER INSERT OR UPDATE OF contact_id ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.submissions_first_touch();

-- trigger: submissions submissions_webhooks
CREATE TRIGGER submissions_webhooks AFTER INSERT ON public.submissions FOR EACH ROW EXECUTE FUNCTION public.submissions_webhooks();

-- trigger: tests tests_bump
CREATE TRIGGER tests_bump BEFORE UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.test_bump();

-- trigger: tests tests_save_version
CREATE TRIGGER tests_save_version AFTER INSERT OR UPDATE ON public.tests FOR EACH ROW EXECUTE FUNCTION public.test_save_version();

-- trigger: tests tests_workspace
CREATE TRIGGER tests_workspace BEFORE INSERT OR UPDATE OF project_id ON public.tests FOR EACH ROW EXECUTE FUNCTION public.project_workspace();

-- trigger: meetings workflow_meeting_changed
CREATE TRIGGER workflow_meeting_changed AFTER UPDATE OF start_at, status ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.workflow_meeting_changed();

-- trigger: workspaces workspaces_named
CREATE TRIGGER workspaces_named BEFORE UPDATE OF name ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.workspaces_named();

-- trigger: workspaces workspaces_seed_crm
CREATE TRIGGER workspaces_seed_crm AFTER INSERT ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.workspaces_seed_crm();

-- event trigger: issue_graphql_placeholder
CREATE EVENT TRIGGER issue_graphql_placeholder ON sql_drop
         WHEN TAG IN ('DROP EXTENSION')
   EXECUTE FUNCTION extensions.set_graphql_placeholder();

ALTER EVENT TRIGGER issue_graphql_placeholder OWNER TO supabase_admin;

-- event trigger: issue_pg_cron_access
CREATE EVENT TRIGGER issue_pg_cron_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_cron_access();

ALTER EVENT TRIGGER issue_pg_cron_access OWNER TO supabase_admin;

-- event trigger: issue_pg_graphql_access
CREATE EVENT TRIGGER issue_pg_graphql_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_graphql_access();

ALTER EVENT TRIGGER issue_pg_graphql_access OWNER TO supabase_admin;

-- event trigger: issue_pg_net_access
CREATE EVENT TRIGGER issue_pg_net_access ON ddl_command_end
         WHEN TAG IN ('CREATE EXTENSION')
   EXECUTE FUNCTION extensions.grant_pg_net_access();

ALTER EVENT TRIGGER issue_pg_net_access OWNER TO supabase_admin;

-- event trigger: pgrst_ddl_watch
CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end
   EXECUTE FUNCTION extensions.pgrst_ddl_watch();

ALTER EVENT TRIGGER pgrst_ddl_watch OWNER TO supabase_admin;

-- event trigger: pgrst_drop_watch
CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop
   EXECUTE FUNCTION extensions.pgrst_drop_watch();

ALTER EVENT TRIGGER pgrst_drop_watch OWNER TO supabase_admin;

--
-- PostgreSQL database dump complete
--

\unrestrict vCP1Kyc84vZkJ5ntguA21MUMI2rqCiiDXIP31WEqhdKdQ1qncZinOEAWxHsyj7C
