-- Two lookups into the jobs queue by a key inside the payload (docs/speed, Round 3 follow-up). Both read only the few
-- open jobs of one kind, so the indexes are partial and stay small however many finished jobs the table holds.
--   router_recent:     is a route job for this contact still waiting or running?
--   meeting_jobs_drop: the reminder and follow-up jobs still queued for a meeting that changed.
-- Safe to run twice. On a busy production table, create them `concurrently` by hand first; these then skip.

create index if not exists jobs_route_contact on public.jobs (workspace_id, (payload->>'contact'))
  where kind = 'route' and status in ('queued', 'running');

create index if not exists jobs_meeting_open on public.jobs ((payload->>'meeting'))
  where status = 'queued' and kind in ('meeting_remind', 'meeting_after');
