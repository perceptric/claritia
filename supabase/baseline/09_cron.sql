-- scheduled jobs (pg_cron)
select cron.schedule('claritia-calendars', '* * * * *', $cron$select public.calendars_due()$cron$);
select cron.schedule('claritia-forms-keep', '37 3 * * *', $cron$select public.forms_keep_prune()$cron$);
select cron.schedule('claritia-inbox-prune', '29 3 * * *', $cron$select public.inbox_prune()$cron$);
select cron.schedule('claritia-meetings', '*/5 * * * *', $cron$select public.meetings_tick()$cron$);
select cron.schedule('claritia-minute', '* * * * *', $cron$select public.minute_tick()$cron$);
select cron.schedule('claritia-prune', '47 * * * *', $cron$select public.prune_tick()$cron$);
select cron.schedule('claritia-reports', '29 3 * * *', $cron$select public.reports_nightly()$cron$);
select cron.schedule('claritia-roll', '43 2 * * *', $cron$select public.contact_events_roll()$cron$);
select cron.schedule('claritia-router-prune', '41 3 * * *', $cron$select public.router_prune()$cron$);
select cron.schedule('claritia-router-sla', '* * * * *', $cron$select public.router_sla_due()$cron$);
select cron.schedule('claritia-track-prune', '41 4 * * *', $cron$select public.track_prune()$cron$);
select cron.schedule('claritia-webhook-prune', '17 4 * * *', $cron$select public.webhook_prune()$cron$);
select cron.schedule('claritia-workflows', '* * * * *', $cron$select public.workflows_tick()$cron$);
