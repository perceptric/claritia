# Claritia database baseline

The full schema of the database on the Hostinger server, built on 2026-11-08 when the database moved off Supabase cloud.
A new database is these files run in order, then any migration added after this date.

| File | Holds |
|---|---|
| 00_extensions_schemas.sql | Extensions and the app's own schemas |
| 01_types.sql | Enum and composite types |
| 02_functions.sql | Functions |
| 03_tables.sql | Tables, each with its sequences, defaults and keys |
| 04_views.sql | Views |
| 05_keys_indexes.sql | Foreign keys and indexes |
| 06_triggers.sql | Triggers |
| 07_security.sql | Row level security, policies and grants |
| 08_realtime.sql | Tables sent over Realtime |
| 09_cron.sql | Scheduled jobs |

## Removed in the move

Nothing in the code, in another database function, view, policy, trigger or scheduled job used these.

Tables (2): `account_alert_rules`, `free_runs`

Functions (137): `accept_proposal`, `account_detail`, `account_feedback_add`, `account_timeline`, `accounts_list`, `add_site`, `brand_kit_book`, `brand_kit_design_uses`, `brand_kit_fonts`, `brand_kit_reading`, `brand_kit_save`, `cancel_exploration`, `company_detail`, `contact_detail`, `contacts_export_log`, `contacts_merge`, `crm_owner_ids`, `decide_merge`, `dismiss_proposal`, `email_queue`, `email_test_send`, `enrich_backfill_count`, `enrich_backfill_page`, `enrich_backfill_start`, `enrich_cache_get`, `enrich_cache_put`, `enrich_load`, `enrich_load_email`, `enrich_overview`, `enrich_refund`, `enrich_run_log`, `enrich_settings_save`, `enrich_spend`, `enrich_step_rates`, `enrich_write`, `field_add`, `field_delete`, `field_order_save`, `field_settings_save`, `field_update`, `fields_order`, `form_booking_stats`, `form_chat_add`, `form_check_now`, `form_field_stats`, `form_notify_mark`, `form_rename`, `form_submission_keys`, `import_claim`, `import_lookup`, `import_progress`, `import_undo_run`, `imports_files_pruned`, `imports_files_to_prune`, `imports_finish`, `imports_start`, `jobs_waiting`, `journeys_create`, `layout_save`, `lead_rescore_now`, `lead_settings_save`, `lifecycle_facts`, `list_add`, `list_remove`, `mapping_save`, `mark_kiosk`, `meetings_week_stats`, `note_delete`, `note_save`, `nurture_delete`, `nurture_remove_contact`, `nurture_save`, `nurture_set_status`, `nurture_step_approve`, `nurture_step_change`, `nurture_steps_save`, `nurture_to_workflow`, `object_delete`, `object_save`, `opportunities_for`, `person_detail`, `privacy_find`, `privacy_request`, `product_event_names`, `qualify_load`, `qualify_store`, `record_create`, `record_detail`, `records_bulk_set`, `records_delete`, `records_group_counts`, `records_search`, `remove_site`, `report_email`, `report_form_dropoff`, `report_forms`, `report_funnel`, `report_people`, `report_reps`, `report_speed`, `router_sla_of`, `router_sla_stats`, `routing_migrate`, `routing_team_turns`, `routing_week_stats`, `scoring_changed`, `scoring_facts`, `scoring_publish`, `scoring_save_draft`, `scoring_write`, `segment_delete`, `segment_preview`, `segment_refresh_now`, `segment_save`, `set_icp`, `set_identity_domains`, `set_page_groups`, `signals_feed_stats`, `slack_install_info`, `source_by_account`, `source_pause`, `source_settings_save`, `source_sync_now`, `start_exploration`, `start_plan`, `task_delete`, `task_save`, `unlink_device`, `unmerge_person`, `update_site`, `visitor_journey`, `visitors_counts`, `visitors_live_since`, `workflow_crm`, `workflow_enter`, `workflow_task`, `workflows_overview`

Scheduled jobs (09_cron.sql) are created paused on the new server and switched on at cutover.

## Migrations that had never run on the live database

These were in the repo but missing from the live database. They ran on the new one.

- 125_share_sends.sql (only part of it had run)
- 126_form_folders.sql
- 133_signup.sql
- 134_photo_sizes.sql

The old Supabase project keeps everything above until it is deleted.
