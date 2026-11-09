-- 140: The jobs queue stops naming visitor identification job kinds: nothing has made them since 135, so the list of
-- removed kinds and the bulk lane drop them.
CREATE OR REPLACE FUNCTION public.job_kind_removed(p_kind text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select p_kind in (
    'enrich_company', 'enrich_contact', 'enrich_backfill', 'qualify', 'score_refresh',
    'import_file', 'import_undo', 'source_pull', 'crm_push', 'crm_activity', 'segment_refresh'
  )
$function$;

CREATE OR REPLACE FUNCTION public.job_priority(p_kind text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS smallint
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select (case
    when p_payload->>'lane' = 'urgent' then 0
    when p_payload->>'lane' = 'bulk' then 2
    when p_kind = 'route' then
      case when p_payload->>'reason' in ('form', 'sla') then 0
           when p_payload->>'reason' in ('import', 'crm', 'again') then 2
           else 1 end
    when p_kind in ('meeting_sync', 'meeting_notify', 'meeting_remind', 'meeting_after', 'meeting_webhook', 'meeting_book_later',
                    'meeting_team_run', 'form_notify', 'form_not_booked', 'router_alert', 'router_sla', 'deliver', 'calendar_watch') then 0
    when p_kind in ('enrich_contact', 'qualify', 'enrich_backfill', 'import_file', 'import_undo', 'source_pull', 'score_refresh',
                    'segment_refresh', 'deliver_held') then 2
    when p_kind in ('brand_scan', 'form_qa') then 3
    else 1 end)::smallint;
$function$;
