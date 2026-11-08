-- 139: The job pruner stops naming visitor identification job kinds, which nothing makes since 135.
CREATE OR REPLACE FUNCTION public.prune_jobs()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  k int;
  total int := 0;
begin
  loop
    delete from jobs where id in (
      select id from jobs
      where status in ('done', 'failed') and finished_at < now() - interval '1 day'
        and ((status = 'done' and (finished_at < now() - interval '7 days'
                                   or kind in ('calendar_refresh', 'send',
                                               'route', 'enrich_contact', 'qualify', 'workflow_run', 'score_refresh', 'calendar_watch')))
             or finished_at < now() - interval '30 days')
      limit 10000);
    get diagnostics k = row_count;
    total := total + k;
    exit when k < 10000 or total >= 200000;
  end loop;
end;
$function$;
