-- Routing recovery and review, stages H and I (docs/routing-workflow.md Sections 13, 15, 18-20, 22 and 24): what the
-- Activity drawer's actions, booking recovery and the Forms connection need on top of 095 and 096.
--
--   routing_reviews               the lifecycle (open, approved, in progress, resolved, dismissed) through one call
--                                 with a revision check; a child attempt's outcome lands on its parent's item; a
--                                 reviewer who leaves hands the item to a workspace owner.
--   router_runs.booking_active_at the booking session's last sign of life, for abandonment (Section 13).
--   router_runs booking reasons   + outcome_unknown (the calendar create may or may not have happened) and
--                                 provider_error (it didn't).
--   router_runs.sync_state        pending when a two-way CRM has to learn a new owner; complete or failed from the
--                                 sync log; a retry pushes that contact again (Section 22: the same step).
--   meetings -> runs              a routed meeting links to its run when it's made; its run is confirmed only once the
--                                 calendar holds the event; cancelled when it's cancelled. Attendance never touches
--                                 the owner, the quota or the queue.
--   routing_sources.when_off      what a disconnected form does with new leads: none (as before) or review.
--   forms -> routing_sources      a new form gets its explicit connection when it's made, matching what the form does
--                                 at each publish until a person edits the connection.
--   meeting_team_run              a booking-first team that gives an unowned contact its owner counts that allocation
--                                 in the owner's quota (no turn of the owner-first queue).
--   routing_screen_run/activity   the drawer's record: review revision, tasks, child runs, calendar and sync detail.
--
-- Adds columns, triggers and functions, replaces functions; deletes nothing; reassigns nobody. Safe to run twice.

-- Columns ----------------------------------------------------------------------------------------------------------

alter table public.router_runs add column if not exists booking_active_at timestamptz;
alter table public.router_runs drop constraint if exists router_runs_booking_reason_check;
alter table public.router_runs add constraint router_runs_booking_reason_check
  check (booking_reason is null or booking_reason in ('no_slots', 'calendar_disconnected', 'permission_error', 'timeout', 'unknown', 'slot_taken', 'outcome_unknown', 'provider_error'));
create index if not exists router_runs_meeting on public.router_runs (meeting_id) where meeting_id is not null;
create index if not exists router_runs_sync_open on public.router_runs (workspace_id, contact_id) where sync_state in ('pending', 'failed');

alter table public.routing_reviews drop constraint if exists routing_reviews_reason_check;
alter table public.routing_reviews add constraint routing_reviews_reason_check
  check (reason in ('spam', 'rule', 'source_mapping_mismatch', 'multiple_companies', 'no_eligible_recipient', 'no_default', 'source_disconnected'));
create index if not exists routing_reviews_reviewer on public.routing_reviews (workspace_id, reviewer) where state not in ('resolved', 'dismissed');

alter table public.routing_sources add column if not exists when_off text not null default 'none';
alter table public.routing_sources drop constraint if exists routing_sources_when_off_check;
alter table public.routing_sources add constraint routing_sources_when_off_check check (when_off in ('none', 'review'));

-- Review lifecycle (Section 18) ---------------------------------------------------------------------------------

/*
 * One review action, at the revision the person saw:
 *   approve   open -> approved_pending_execution (cleared for a child attempt; still in Needs review)
 *   start     open or approved -> in_progress, keeping the child attempt's operation id; a second start with another
 *             id gets the first one back, so the child is resumed, never committed twice
 *   back      in_progress -> approved_pending_execution (the child attempt didn't commit: decide again)
 *   dismiss   open or approved -> dismissed, with a reason (never while a child attempt is running)
 *   reopen    dismissed -> open
 * Resolution is never an action: only a child attempt's committed owner resolves an item (routing_runs_after).
 * Every action is in the audit log. Returns {id, state, revision, latest_action}.
 */
create or replace function public.routing_review_act(p_ws uuid, p_review uuid, p_action text, p_user uuid, p_reason text default null, p_revision int default null, p_op text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v routing_reviews%rowtype;
  r router_runs%rowtype;
  nxt text;
  act jsonb;
begin
  if p_action not in ('approve', 'start', 'back', 'dismiss', 'reopen') then raise exception 'invalid_configuration: action'; end if;
  select * into v from routing_reviews where id = p_review and workspace_id = p_ws for update;
  if v.id is null then raise exception 'not_found: review'; end if;
  -- Starting again with the operation already running is the same request (a retry), whatever the revision.
  if p_action = 'start' and v.state = 'in_progress' then
    return jsonb_build_object('id', v.id, 'state', v.state, 'revision', v.revision, 'latest_action', v.latest_action, 'op', v.latest_action->>'op');
  end if;
  if p_revision is not null and v.revision <> p_revision then raise exception 'draft_conflict: review'; end if;
  nxt := case p_action
    when 'approve' then case when v.state = 'open' then 'approved_pending_execution' end
    when 'start' then case when v.state in ('open', 'approved_pending_execution') then 'in_progress' end
    when 'back' then case when v.state = 'in_progress' then 'approved_pending_execution' end
    when 'dismiss' then case when v.state in ('open', 'approved_pending_execution') then 'dismissed' end
    when 'reopen' then case when v.state = 'dismissed' then 'open' end
  end;
  if nxt is null then
    if (p_action = 'approve' and v.state = 'approved_pending_execution') or (p_action = 'dismiss' and v.state = 'dismissed') or (p_action = 'reopen' and v.state = 'open') then
      return jsonb_build_object('id', v.id, 'state', v.state, 'revision', v.revision, 'latest_action', v.latest_action, 'repeat', true);
    end if;
    raise exception 'invalid_configuration: % from %', p_action, v.state;
  end if;
  if p_action = 'dismiss' and length(btrim(coalesce(p_reason, ''))) = 0 then raise exception 'invalid_configuration: reason'; end if;
  if p_action = 'start' and (p_op is null or p_op !~ '^[A-Za-z0-9_-]{8,80}$') then raise exception 'invalid_configuration: op'; end if;
  act := jsonb_strip_nulls(jsonb_build_object('action', p_action, 'by', p_user, 'at', now(), 'reason', left(nullif(btrim(p_reason), ''), 300),
                                               'op', case when p_action = 'start' then p_op end));
  update routing_reviews set state = nxt, revision = revision + 1, latest_action = act, updated_at = now() where id = v.id;
  -- The contact's "needs review" mark follows the item: a dismissed item clears it (unless another item is open).
  select * into r from router_runs where id = v.run_id;
  if v.contact_id is not null then
    if nxt = 'dismissed' then
      update contacts set route_status = null
      where id = v.contact_id and workspace_id = p_ws and route_status in ('held', 'unassigned')
        and not exists (select 1 from routing_reviews o where o.contact_id = v.contact_id and o.id <> v.id and o.state not in ('resolved', 'dismissed'));
    elsif p_action = 'reopen' and r.kind in ('held', 'unassigned') then
      update contacts set route_status = r.kind where id = v.contact_id and workspace_id = p_ws and route_status is null and owner_user_id is null;
    end if;
  end if;
  insert into audit_log (workspace_id, actor, action, target, data)
  values (p_ws, p_user, 'routing.review.' || p_action, v.id::text, jsonb_strip_nulls(jsonb_build_object('run', v.run_id, 'from', v.state, 'to', nxt, 'reason', act->>'reason', 'op', act->>'op')));
  return jsonb_build_object('id', v.id, 'state', nxt, 'revision', v.revision + 1, 'latest_action', act, 'op', act->>'op');
end;
$$;

/*
 * A child attempt that lands in review again doesn't open a second item for the same lead: its parent's item goes
 * back to open with the child linked and the child's reason. Any other held or unallocated run opens its own item.
 */
create or replace function public.routing_reviews_child() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  par uuid;
  rv uuid;
begin
  select parent_run_id into par from router_runs where id = new.run_id;
  if par is null then return new; end if;
  update routing_reviews set state = 'open', child_run_id = new.run_id, reason = new.reason, revision = revision + 1, updated_at = now(),
    latest_action = jsonb_build_object('action', 'child', 'run', new.run_id, 'result', 'review', 'at', now())
  where run_id = par and workspace_id = new.workspace_id and state not in ('resolved', 'dismissed')
  returning id into rv;
  if rv is not null then return null; end if;
  return new;
end;
$$;
drop trigger if exists routing_reviews_child on public.routing_reviews;
create trigger routing_reviews_child before insert on public.routing_reviews for each row execute function public.routing_reviews_child();

-- Two-way CRMs that push contacts (Section 22): a new owner is pending there until the sync log says otherwise.
create or replace function public.routing_sync_needed(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from sources s where s.workspace_id = p_ws and s.status = 'active' and s.settings->'objects'->>'contacts' = 'both');
$$;

-- Before a run is written: a new owner a two-way CRM has to learn makes its sync pending.
create or replace function public.routing_runs_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'owner' and new.effect = 'new' and coalesce(new.sync_state, 'not_required') = 'not_required' and routing_sync_needed(new.workspace_id) then
    new.sync_state := 'pending';
  end if;
  return new;
end;
$$;
drop trigger if exists routing_runs_before on public.router_runs;
create trigger routing_runs_before before insert on public.router_runs for each row execute function public.routing_runs_before();

/*
 * After a run is written, in the committer's transaction: a child attempt that committed an owner resolves its
 * parent's review item (Section 18 step 6); an assignment by hand is in the audit log with its reason.
 */
create or replace function public.routing_runs_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.parent_run_id is not null and new.kind = 'owner' then
    update routing_reviews set state = 'resolved', child_run_id = new.id, revision = revision + 1, updated_at = now(),
      latest_action = jsonb_build_object('action', 'resolved', 'run', new.id, 'owner', new.owner, 'by', new.by_user, 'at', now())
    where run_id = new.parent_run_id and workspace_id = new.workspace_id and state not in ('resolved', 'dismissed');
  end if;
  if new."by" = 'hand' then
    insert into audit_log (workspace_id, actor, action, target, data)
    values (new.workspace_id, new.by_user, 'routing.assign_by_hand', coalesce(new.contact_id::text, new.id::text), jsonb_strip_nulls(jsonb_build_object(
      'run', new.id, 'owner', new.owner, 'previous_owner', new.previous_owner, 'parent', new.parent_run_id,
      'reason', coalesce(new.trace->'manual'->>'reason', new.trace->'override'->>'reason'),
      'suggested', new.trace->'override'->>'suggested')));
  end if;
  return null;
end;
$$;
drop trigger if exists routing_runs_after on public.router_runs;
create trigger routing_runs_after after insert on public.router_runs for each row execute function public.routing_runs_after();

/*
 * A reviewer who leaves the workspace (Section 18): their open items go to the workspace's first owner, the admin
 * review responsibility, with the hand-over in the item's latest action. Nothing is ever left with nobody.
 */
create or replace function public.routing_reviewer_left() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  admin uuid;
begin
  if not exists (select 1 from routing_reviews v where v.workspace_id = old.workspace_id and v.reviewer = old.user_id and v.state not in ('resolved', 'dismissed')) then return null; end if;
  select w.user_id into admin from workspace_members w where w.workspace_id = old.workspace_id and w.user_id <> old.user_id order by (w.role = 'owner') desc, w.created_at limit 1;
  if admin is null then return null; end if;
  update routing_reviews set reviewer = admin, revision = revision + 1, updated_at = now(),
    latest_action = jsonb_build_object('action', 'escalated', 'from', old.user_id, 'to', admin, 'at', now())
  where workspace_id = old.workspace_id and reviewer = old.user_id and state not in ('resolved', 'dismissed');
  return null;
end;
$$;
drop trigger if exists routing_reviewer_left on public.workspace_members;
create trigger routing_reviewer_left after delete on public.workspace_members for each row execute function public.routing_reviewer_left();

-- Items whose reviewer had already left before this migration.
update routing_reviews v set
  reviewer = (select w.user_id from workspace_members w where w.workspace_id = v.workspace_id order by (w.role = 'owner') desc, w.created_at limit 1),
  revision = v.revision + 1, updated_at = now(),
  latest_action = jsonb_build_object('action', 'escalated', 'from', v.reviewer, 'at', now())
where v.state not in ('resolved', 'dismissed')
  and not exists (select 1 from workspace_members m where m.workspace_id = v.workspace_id and m.user_id = v.reviewer)
  and exists (select 1 from workspace_members w where w.workspace_id = v.workspace_id);

-- External sync (Section 22) -------------------------------------------------------------------------------------

-- The sync log's outgoing contact lines settle the runs waiting on them: complete, or failed with the step to retry.
create or replace function public.routing_sync_logged() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update router_runs r set sync_state = case when x.err then 'failed' else 'complete' end
  from (select n.workspace_id, n.local_id, bool_or(n.action = 'error') as err, max(n.at) as at
        from new_rows n where n.direction = 'out' and n.object = 'contact' and n.local_id is not null group by n.workspace_id, n.local_id) x
  where r.workspace_id = x.workspace_id and r.contact_id = x.local_id and r.sync_state in ('pending', 'failed') and r.created_at <= x.at;
  return null;
end;
$$;
drop trigger if exists routing_sync_logged on public.sync_log;
create trigger routing_sync_logged after insert on public.sync_log referencing new table as new_rows for each statement execute function public.routing_sync_logged();

/*
 * Retry sync (Section 18): push this run's contact to each two-way CRM again, through the sources' own push with the
 * same step (keyed per source and run). Never routes again, never touches the calendar. Returns how many pushes
 * were queued; with no two-way CRM left the run's sync isn't needed any more.
 */
create or replace function public.routing_sync_retry(p_ws uuid, p_run uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  s record;
  n int := 0;
begin
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then raise exception 'not_found: run'; end if;
  if r.kind <> 'owner' or r.contact_id is null or coalesce(r.sync_state, 'not_required') not in ('failed', 'pending') then
    return jsonb_build_object('state', r.sync_state, 'queued', 0);
  end if;
  for s in select so.id from sources so where so.workspace_id = p_ws and so.status = 'active' and so.settings->'objects'->>'contacts' = 'both' loop
    perform enqueue_job(p_ws, 'source_pull', s.id::text || ':route:' || r.id::text, jsonb_build_object('source_id', s.id, 'retry', jsonb_build_array(r.contact_id)), 0, 3);
    n := n + 1;
  end loop;
  update router_runs set sync_state = case when n > 0 then 'pending' else 'not_required' end where id = r.id;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, p_user, 'routing.sync_retry', r.id::text, jsonb_build_object('pushes', n));
  return jsonb_build_object('state', case when n > 0 then 'pending' else 'not_required' end, 'queued', n);
end;
$$;

-- Bookings and their runs (Section 15) -------------------------------------------------------------------------

-- True when a meeting's calendar side holds an event (a Zoom meeting made alone is an unfinished create).
create or replace function public.routing_meeting_placed(p_events jsonb) returns boolean
language sql immutable as $$
  select coalesce(jsonb_typeof(p_events) = 'object' and exists (select 1 from jsonb_each(p_events) e where jsonb_typeof(e.value) = 'object' and e.value ? 'event'), false);
$$;

-- Resolve a run's scheduling follow-ups (the no-slots one and the abandoned-booking one) once its meeting is confirmed.
create or replace function public.routing_followups_done(p_ws uuid, p_run uuid) returns void
language sql security definer set search_path = public as $$
  update tasks set done = true, done_at = now(), updated_at = now()
  where workspace_id = p_ws and dedupe_key in ('routing:' || p_run::text || ':schedule', 'routing:' || p_run::text || ':abandoned') and not done;
$$;

-- A meeting booked from a routed form fill: its run gets the meeting and waits for the calendar's event.
create or replace function public.routing_meeting_made() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if new.submission_id is null then return null; end if;
  update router_runs set meeting_id = new.id, booking_reason = null, booking_active_at = now(),
    booking_state = case when routing_meeting_placed(new.events) then 'confirmed' else 'pending_confirmation' end
  where workspace_id = new.workspace_id and key = 'form:' || new.submission_id::text and meeting_id is null and coalesce(booking_state, '') not in ('confirmed', 'cancelled')
  returning id into rid;
  if rid is not null and routing_meeting_placed(new.events) then perform routing_followups_done(new.workspace_id, rid); end if;
  return null;
end;
$$;
drop trigger if exists routing_meeting_made on public.meetings;
create trigger routing_meeting_made after insert on public.meetings for each row execute function public.routing_meeting_made();

/*
 * A routed meeting changed: the calendar now holds its event (confirmed, and the run's scheduling follow-ups done),
 * or it was cancelled (the booking only: the owner, the quota and the queue stay as they are). Held and no-show are
 * the meeting's attendance and leave the run as it is.
 */
create or replace function public.routing_meeting_changed() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  rid uuid;
begin
  if new.status = 'canceled' and old.status is distinct from 'canceled' then
    update router_runs set booking_state = 'cancelled', booking_reason = null where meeting_id = new.id and coalesce(booking_state, '') <> 'cancelled';
  elsif new.status in ('booked', 'held', 'no_show') and routing_meeting_placed(new.events) and not routing_meeting_placed(old.events) then
    for rid in
      update router_runs set booking_state = 'confirmed', booking_reason = null
      where meeting_id = new.id and coalesce(booking_state, '') in ('pending_confirmation', 'awaiting_selection', 'failed', 'abandoned', 'unavailable')
      returning id
    loop
      perform routing_followups_done(new.workspace_id, rid);
    end loop;
  end if;
  return null;
end;
$$;
drop trigger if exists routing_meeting_changed on public.meetings;
create trigger routing_meeting_changed after update of status, events on public.meetings for each row execute function public.routing_meeting_changed();

/*
 * The calendar work for a routed meeting stopped trying (worker-intel/jobs/calendars.ts meeting_sync). A failure that
 * proves no event was made (no calendar to write to, a sign-in that's gone) is failed: provider_error. Anything else
 * (a timeout, a provider error after the request went out) may have made the event: the run stays pending with
 * outcome_unknown until it's reconciled. Never a blind second create.
 */
create or replace function public.routing_meeting_failed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind <> 'calendar_failed' or coalesce(new.detail->>'action', 'create') <> 'create' then return null; end if;
  update router_runs set
    booking_state = case when new.detail->>'outcome' = 'failed' then 'failed' else 'pending_confirmation' end,
    booking_reason = case when new.detail->>'outcome' = 'failed' then 'provider_error' else 'outcome_unknown' end
  where meeting_id = new.meeting_id and booking_state = 'pending_confirmation';
  return null;
end;
$$;
drop trigger if exists routing_meeting_failed on public.meeting_events;
create trigger routing_meeting_failed after insert on public.meeting_events for each row execute function public.routing_meeting_failed();

/*
 * Check the calendar for a booking whose outcome is unknown or failed (Section 15): the calendar job for the same
 * meeting runs again with the same key, so the provider finds the event the first try made (Google: the event id is
 * the key; Microsoft: the transaction id; the fake provider: the key) instead of making a second one, and a missing
 * event is made once. Returns {state, queued}.
 */
create or replace function public.routing_booking_reconcile(p_ws uuid, p_run uuid, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  m meetings%rowtype;
begin
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then raise exception 'not_found: run'; end if;
  select * into m from meetings where id = r.meeting_id and workspace_id = p_ws;
  if m.id is null or r.booking_state not in ('pending_confirmation', 'failed') then return jsonb_build_object('state', r.booking_state, 'queued', false); end if;
  if routing_meeting_placed(m.events) then
    update router_runs set booking_state = 'confirmed', booking_reason = null where id = r.id;
    perform routing_followups_done(p_ws, r.id);
    return jsonb_build_object('state', 'confirmed', 'queued', false);
  end if;
  if m.status <> 'booked' then return jsonb_build_object('state', r.booking_state, 'queued', false); end if;
  perform enqueue_job(p_ws, 'meeting_sync', 'create:' || m.id::text, jsonb_build_object('meeting', m.id, 'action', 'create'), 0, 5);
  update router_runs set booking_state = 'pending_confirmation', booking_reason = 'outcome_unknown' where id = r.id;
  insert into audit_log (workspace_id, actor, action, target, data) values (p_ws, p_user, 'routing.booking_reconcile', r.id::text, jsonb_build_object('meeting', m.id));
  return jsonb_build_object('state', 'pending_confirmation', 'queued', true);
end;
$$;

-- A handoff's meeting and its run (096), now confirmed at once when the calendar already holds the event.
create or replace function public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  st text := p_state;
begin
  if p_state not in ('awaiting_selection', 'pending_confirmation', 'confirmed', 'failed', 'unavailable') then raise exception 'routing_run_meeting: state'; end if;
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then return null; end if;
  if p_meeting is not null and not exists (select 1 from meetings m where m.id = p_meeting and m.workspace_id = p_ws) then raise exception 'not_found: meeting'; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state <> 'confirmed' then return r.booking_state; end if;
  if st = 'pending_confirmation' and exists (select 1 from meetings m where m.id = p_meeting and routing_meeting_placed(m.events)) then st := 'confirmed'; end if;
  update router_runs set booking_state = st, booking_reason = p_reason, meeting_id = coalesce(p_meeting, meeting_id) where id = r.id;
  if st = 'confirmed' then perform routing_followups_done(p_ws, r.id); end if;
  return st;
end;
$$;

-- A run's booking state by key (095): a confirmation resolves both scheduling follow-ups.
create or replace function public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
begin
  select * into r from router_runs where workspace_id = p_ws and key = p_key for update;
  if r.id is null then return null; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state not in ('confirmed', 'cancelled') then return r.booking_state; end if;
  update router_runs set booking_state = p_state, booking_reason = p_reason where id = r.id;
  if p_state = 'confirmed' then perform routing_followups_done(p_ws, r.id); end if;
  return p_state;
end;
$$;

-- Abandonment (Section 13) --------------------------------------------------------------------------------------

-- How long a booking session may sit without a sign of life: the connection's setting, 30 minutes by default.
create or replace function public.routing_abandon_minutes(p_source uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select case when s.no_slots->>'abandonAfter' ~ '^\d{1,4}$' then least(greatest((s.no_slots->>'abandonAfter')::int, 5), 1440) end
                   from routing_sources s where s.id = p_source), 30);
$$;

/*
 * A sign of life from a run's booking session (times shown, fetched again, a slot tried): the session is active
 * now. One that was marked abandoned is waiting for a time again (a valid later resumption; both moments stay in
 * the contact's history). The abandonment check is queued for the end of the inactivity window.
 */
create or replace function public.routing_booking_touch(p_ws uuid, p_key text) returns text
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  mins int;
begin
  select * into r from router_runs where workspace_id = p_ws and key = p_key for update;
  if r.id is null or r.meeting_id is not null or coalesce(r.booking_state, '') not in ('awaiting_selection', 'abandoned') then return r.booking_state; end if;
  mins := routing_abandon_minutes(r.source_id);
  update router_runs set booking_active_at = now(), booking_state = 'awaiting_selection', booking_reason = null where id = r.id;
  if r.booking_state = 'abandoned' and r.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then perform contact_events_roll(); end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (p_ws, r.contact_id, 'lead.booking_resumed', jsonb_build_object('run_id', r.id), 'routing');
  end if;
  perform enqueue_job(p_ws, 'routing_abandon', r.id::text, jsonb_build_object('run', r.id), mins * 60, 3);
  return 'awaiting_selection';
end;
$$;

/*
 * The worker's abandonment check for one run (worker-intel/jobs/router.ts routing_abandon): still waiting for a
 * time and quiet for the whole window -> abandoned (the owner stays), with one linked follow-up for the owner only
 * when the connection asks for it. Active since -> {wait_s} until the window's new end. Anything else -> done.
 */
create or replace function public.routing_booking_abandon(p_run uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  mins int;
  due timestamptz;
  task uuid;
begin
  select * into r from router_runs where id = p_run for update;
  if r.id is null or r.meeting_id is not null or r.booking_state is distinct from 'awaiting_selection' then return jsonb_build_object('state', r.booking_state, 'done', true); end if;
  mins := routing_abandon_minutes(r.source_id);
  due := coalesce(r.booking_active_at, r.created_at) + make_interval(mins => mins);
  if due > now() then return jsonb_build_object('state', r.booking_state, 'wait_s', ceil(extract(epoch from due - now()))::int); end if;
  update router_runs set booking_state = 'abandoned' where id = r.id;
  if r.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then perform contact_events_roll(); end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (r.workspace_id, r.contact_id, 'lead.booking_abandoned', jsonb_build_object('run_id', r.id, 'after_min', mins), 'routing');
  end if;
  if coalesce((select (s.no_slots->>'abandonTask')::boolean from routing_sources s where s.id = r.source_id), false) then
    task := routing_followup(r.workspace_id, r.id, 'abandoned');
  end if;
  return jsonb_build_object('state', 'abandoned', 'done', true, 'task', task);
end;
$$;

-- Sources (Sections 8 and 24) -----------------------------------------------------------------------------------

-- A new form gets its explicit connection when it's made: the default policy's, booking when its draft books.
create or replace function public.routing_form_made() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sch jsonb := case when jsonb_typeof(new.draft) = 'object' then new.draft->'after'->'schedule' end;
  mt uuid;
begin
  mt := case when sch->>'tool' = 'claritia' and sch->>'meetingTypeId' ~ '^[0-9a-f-]{36}$' then (select t.id from meeting_types t where t.id = (sch->>'meetingTypeId')::uuid and t.workspace_id = new.workspace_id) end;
  insert into routing_sources (workspace_id, kind, form_id, policy_id, enabled, follows_default, outcome, meeting_type_id, completion, no_slots)
  values (new.workspace_id, 'form', new.id, (select p.id from routing_policies p where p.workspace_id = new.workspace_id and p.is_default), true, true,
          case when mt is not null then 'assign_and_calendar' else 'assign_only' end, mt,
          jsonb_strip_nulls(jsonb_build_object('from', 'form', 'auto', true, 'scheduler', case when sch->>'tool' is not null and sch->>'tool' <> 'claritia' then sch->>'tool' end)),
          jsonb_build_object('message', 'form', 'task', true, 'email_later', coalesce(sch->>'none', '') = 'later'))
  on conflict do nothing;
  return null;
end;
$$;
drop trigger if exists routing_form_made on public.forms;
create trigger routing_form_made after insert on public.forms for each row execute function public.routing_form_made();

/*
 * A new form's connection, made for it automatically and never edited by anyone (no staged change, no publish of
 * its own), keeps matching what the form does each time the form is published: assign and show the calendar when it
 * books with Claritia calendar, else assign only, as a form with no connection did before. The first change a person
 * makes in Forms or Routing goes through the draft and publish service, and from then on only that service changes it.
 */
create or replace function public.routing_form_published() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  sch jsonb := case when jsonb_typeof(new.body) = 'object' then new.body->'after'->'schedule' end;
  mt uuid;
begin
  mt := case when sch->>'tool' = 'claritia' and sch->>'meetingTypeId' ~ '^[0-9a-f-]{36}$' then (select t.id from meeting_types t where t.id = (sch->>'meetingTypeId')::uuid and t.workspace_id = new.workspace_id) end;
  update routing_sources set
    outcome = case when mt is not null then 'assign_and_calendar' else 'assign_only' end, meeting_type_id = mt,
    completion = jsonb_strip_nulls(jsonb_build_object('from', 'form', 'auto', true, 'scheduler', case when sch->>'tool' is not null and sch->>'tool' <> 'claritia' then sch->>'tool' end)),
    no_slots = no_slots || jsonb_build_object('email_later', coalesce(sch->>'none', '') = 'later'),
    updated_at = now()
  where form_id = new.form_id and kind = 'form' and completion->>'auto' = 'true' and updated_by is null and draft is null and live_revision = 1 and follows_default;
  return null;
end;
$$;
drop trigger if exists routing_form_published on public.form_versions;
create trigger routing_form_published after insert on public.form_versions for each row execute function public.routing_form_published();

-- Forms made between 095 and this migration without a connection get theirs now (the same rule as 095's).
do $$
declare
  w uuid;
begin
  for w in select distinct fm.workspace_id from forms fm where not exists (select 1 from routing_sources s where s.form_id = fm.id and s.kind = 'form') loop
    perform routing_migrate(w);
  end loop;
end;
$$;

-- The form's connection at submit (095), with what a disconnected one does with new leads.
create or replace function public.routing_source_resolve(p_form uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f forms%rowtype;
  s routing_sources%rowtype;
  live jsonb;
begin
  select * into f from forms where id = p_form;
  if f.id is null then return null; end if;
  select * into s from routing_sources where form_id = p_form and kind = 'form';
  if s.id is null then
    live := router_live(f.workspace_id);
    return jsonb_build_object('source', null, 'live', live);
  end if;
  if s.follows_default then
    live := router_live(f.workspace_id);
  elsif s.enabled and s.policy_id is not null then
    select case when p.is_default then router_live(f.workspace_id) else routing_live(f.workspace_id, p.id) end into live
    from routing_policies p where p.id = s.policy_id and p.archived_at is null;
  end if;
  return jsonb_build_object(
    'source', jsonb_build_object('id', s.id, 'revision', s.live_revision, 'enabled', s.enabled, 'follows_default', s.follows_default, 'policy_id', s.policy_id, 'outcome', s.outcome,
                                 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'completion', s.completion, 'no_slots', s.no_slots, 'when_off', s.when_off),
    'live', live);
end;
$$;

-- Publish (096), now carrying a staged connection's disconnected behavior too.
create or replace function public.routing_publish(p_ws uuid, p_policy uuid, p_config jsonb, p_note text, p_user uuid, p_key text default null,
  p_revision int default null, p_clear_draft boolean default true, p_sources jsonb default '[]') returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p routing_policies%rowtype;
  v int;
  s jsonb;
  src routing_sources%rowtype;
  done jsonb := '[]';
begin
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_configuration: config'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if p.archived_at is not null then raise exception 'invalid_configuration: archived'; end if;
  if p_key is not null then
    select version into v from routing_policy_versions where policy_id = p.id and publish_key = p_key;
    if v is not null then return jsonb_build_object('version', v, 'repeat', true); end if;
  end if;
  if p_revision is not null and p.draft_revision <> p_revision then raise exception 'draft_conflict'; end if;
  select greatest(coalesce((select max(version) from routing_policy_versions where policy_id = p.id), 0),
                  case when p.is_default then coalesce((select max(version) from router_versions where workspace_id = p_ws), 0) else 0 end) + 1 into v;
  for s in select x from jsonb_array_elements(case when jsonb_typeof(p_sources) = 'array' then p_sources else '[]' end) x loop
    select * into src from routing_sources where id = (s->>'id')::uuid and workspace_id = p_ws for update;
    if src.id is null then raise exception 'not_found: source'; end if;
    if src.draft is null or src.draft_revision <> (s->>'revision')::int then raise exception 'draft_conflict: source'; end if;
    if nullif(src.draft->>'policy_id', '')::uuid is distinct from p.id then raise exception 'invalid_configuration: source policy'; end if;
    update routing_sources set
      policy_id = p.id,
      enabled = coalesce((src.draft->>'enabled')::boolean, enabled),
      outcome = coalesce(src.draft->>'outcome', outcome),
      meeting_type_id = case when src.draft ? 'meeting_type_id' then nullif(src.draft->>'meeting_type_id', '')::uuid else meeting_type_id end,
      mappings = coalesce(src.draft->'mappings', mappings),
      completion = coalesce(src.draft->'completion', completion),
      no_slots = coalesce(src.draft->'no_slots', no_slots),
      when_off = case when src.draft->>'when_off' in ('none', 'review') then src.draft->>'when_off' else when_off end,
      live_revision = live_revision + 1, draft = null, follows_default = false, updated_by = p_user, updated_at = now()
    where id = src.id;
    done := done || jsonb_build_array(jsonb_build_object('id', src.id, 'revision', src.live_revision + 1));
  end loop;
  insert into routing_policy_versions (policy_id, workspace_id, version, config, note, published_by, publish_key, sources)
  values (p.id, p_ws, v, p_config, left(p_note, 300), p_user, p_key, done);
  update routing_policies set active_version = v, updated_at = now(),
    name = case when p_clear_draft and p.draft_name is not null then p.draft_name else name end,
    draft_name = case when p_clear_draft then null else draft_name end,
    draft = case when p_clear_draft then null else draft end, draft_base = case when p_clear_draft then null else draft_base end,
    draft_revision = draft_revision + case when p_clear_draft then 1 else 0 end
  where id = p.id;
  perform routing_sync_teams(p_ws, p_config);
  if p.is_default then
    insert into routers (workspace_id) values (p_ws) on conflict do nothing;
    insert into router_versions (workspace_id, version, body, note, published_by) values (p_ws, v, p_config, left(p_note, 300), p_user) on conflict do nothing;
    update routers set live_version = v, updated_at = now() where workspace_id = p_ws;
    perform routing_mirror_draft(p.id);
  end if;
  return jsonb_build_object('version', v, 'repeat', false, 'sources', done);
end;
$$;

-- Booking-first team types (084) and the quota (Section 12) ------------------------------------------------------

/*
 * A team meeting type's booking run (084). When it gives an unowned contact its owner, that is a committed new owner
 * allocation: it counts once in that person's quota (an assignment event with counted, never a turn of the
 * owner-first queue, which this booking-first mode doesn't use). A booking for a contact that already has an owner
 * changes no owner and counts nothing. The meeting is linked so its run follows the calendar.
 */
create or replace function public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version int, p_steps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k text := 'booking:' || p_meeting::text;
  rid uuid;
  cid uuid;
  c contacts%rowtype;
  q routing_quota%rowtype;
  gives boolean := false;
  placed boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || coalesce(p_queue, '-'), 0));
  select id into rid from router_runs where workspace_id = p_ws and key = k;
  if rid is not null then return rid; end if;
  select coalesce(p_contact, m.contact_id), routing_meeting_placed(m.events) into cid, placed from meetings m where m.id = p_meeting and m.workspace_id = p_ws;
  if not found then return null; end if;
  if cid is not null then
    select * into c from contacts where id = cid and workspace_id = p_ws and deleted_at is null for update;
  end if;
  gives := c.id is not null and c.owner_user_id is null and c.owner_crm_id is null;
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, steps, facts, ms,
                           assignment_state, booking_state, sync_state, previous_owner, effect, meeting_id)
  values (p_ws, c.id, k, 'booking', p_version, 'owner', p_owner, 'queue', p_queue, coalesce(p_steps, '[]'), jsonb_build_object('meeting', p_meeting), 0,
          'assigned', case when placed then 'confirmed' else 'pending_confirmation' end, 'not_required', c.owner_user_id, case when gives then 'new' else 'none' end, p_meeting)
  returning id into rid;
  if gives then
    q := routing_quota_current(p_ws, p_owner);
    update routing_quota set n = n + 1 where workspace_id = p_ws and user_id = p_owner and period_start = q.period_start;
    insert into routing_assignments (workspace_id, run_id, contact_id, user_id, previous_owner, team_id, counted, advanced, quota_period)
    values (p_ws, rid, c.id, p_owner, null, (select tk.team_id from routing_team_keys tk where tk.workspace_id = p_ws and tk.key = p_queue), true, false, q.period_start)
    on conflict (run_id) do nothing;
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
    values (p_ws, 'contact', c.id, 'owner', 'null'::jsonb, to_jsonb(p_owner), c.field_sources->'owner', 'routing', null);
    update contacts set owner_user_id = p_owner, route_status = null,
      owner_crm_id = (select l.crm_owner_id from crm_owner_links l where l.workspace_id = p_ws and l.user_id = p_owner order by l.updated_at desc limit 1),
      field_sources = coalesce(field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'routing', 'at', now())), updated_at = now()
    where id = c.id;
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (p_ws, c.id, 'lead.routed', jsonb_build_object('run_id', rid, 'owner', p_owner, 'by', 'queue', 'queue', p_queue, 'reason', 'booking'), 'routing');
  end if;
  return rid;
end;
$$;

-- The screens' reads (096, extended) ----------------------------------------------------------------------------

/*
 * Activity (096): errors also list bookings whose calendar outcome isn't known yet; each row carries its sync state.
 */
create or replace function public.routing_screen_activity(p_ws uuid, p_filter text, p_before timestamptz default null, p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'runs', coalesce((select jsonb_agg(x order by x->>'at' desc) from (
      select jsonb_build_object(
        'id', r.id, 'at', r.created_at, 'kind', r.kind, 'reason', r.reason, 'by', r.by, 'rule', r.rule_id, 'owner', r.owner, 'previous_owner', r.previous_owner,
        'policy_id', r.policy_id, 'policy', (select p.name from routing_policies p where p.id = r.policy_id), 'version', coalesce(r.policy_version, r.version),
        'source', case when r.source_id is null then null else (select coalesce(f.name, 'Internal handoff') from routing_sources s left join forms f on f.id = s.form_id where s.id = r.source_id) end,
        'assignment_state', r.assignment_state, 'booking_state', r.booking_state, 'booking_reason', r.booking_reason, 'sync_state', r.sync_state, 'effect', r.effect,
        'contact_id', r.contact_id, 'parent_run_id', r.parent_run_id, 'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
        'rule_name', coalesce(r.trace->'rules'->'matched'->>'name', (select s->'rule'->>'name' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'rules' limit 1)),
        'held', (select s->'signals' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'spam' and not coalesce((s->>'ok')::boolean, true) limit 1),
        'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer) from routing_reviews v where v.run_id = r.id)) x
      from router_runs r
      where r.workspace_id = p_ws and r.undone_at is null
        and (p_before is null or r.created_at < p_before)
        and case coalesce(p_filter, 'all')
              when 'review' then exists (select 1 from routing_reviews v where v.run_id = r.id and v.state not in ('resolved', 'dismissed'))
              when 'errors' then r.assignment_state = 'failed' or r.booking_state in ('unavailable', 'failed') or r.sync_state = 'failed'
                                 or (r.booking_state = 'pending_confirmation' and r.booking_reason = 'outcome_unknown')
              else true end
      order by r.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)) y), '[]'),
    'open_reviews', (select count(*) from routing_reviews v where v.workspace_id = p_ws and v.state not in ('resolved', 'dismissed')));
$$;

/*
 * One run for its drawer (096), with what the recovery actions need: the review item's revision and latest action,
 * the run's parent and child attempts, both follow-up tasks, the meeting's calendar side (the event reference, the
 * last calendar failure), the owner's calendar now, the sync detail, and the run's booking history.
 */
create or replace function public.routing_screen_run(p_ws uuid, p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'at', r.created_at, 'key', r.key, 'kind', r.kind, 'reason', r.reason, 'by', r.by, 'by_user', r.by_user, 'rule', r.rule_id, 'owner', r.owner,
    'previous_owner', r.previous_owner, 'policy_id', r.policy_id, 'policy', (select p.name from routing_policies p where p.id = r.policy_id), 'version', coalesce(r.policy_version, r.version),
    'source_id', r.source_id, 'source_revision', r.source_revision,
    'source', case when r.source_id is null then null else (select coalesce(f.name, 'Internal handoff') from routing_sources s left join forms f on f.id = s.form_id where s.id = r.source_id) end,
    'source_kind', (select s.kind from routing_sources s where s.id = r.source_id),
    'assignment_state', r.assignment_state, 'booking_state', r.booking_state, 'booking_reason', r.booking_reason, 'sync_state', r.sync_state, 'effect', r.effect,
    'booking_active_at', r.booking_active_at,
    'trace', r.trace, 'steps', r.steps, 'contact_id', r.contact_id, 'parent_run_id', r.parent_run_id,
    'submission_id', case when r.key like 'form:%' then substr(r.key, 6) end,
    'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
    'current_owner', (select c.owner_user_id from contacts c where c.id = r.contact_id and c.workspace_id = p_ws),
    'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer, 'at', v.created_at, 'latest_action', v.latest_action,
                                         'child_run_id', v.child_run_id, 'revision', v.revision, 'updated_at', v.updated_at)
               from routing_reviews v where v.run_id = r.id),
    'children', coalesce((select jsonb_agg(jsonb_build_object('id', ch.id, 'at', ch.created_at, 'kind', ch.kind, 'owner', ch.owner, 'by', ch.by, 'version', ch.policy_version) order by ch.created_at)
                          from router_runs ch where ch.parent_run_id = r.id and ch.workspace_id = p_ws), '[]'),
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'end', m.end_at, 'hosts', m.hosts, 'status', m.status, 'confirmed', routing_meeting_placed(m.events),
                                          'reference', 'create:' || m.id::text,
                                          'failed', (select e.detail || jsonb_build_object('at', e.at) from meeting_events e where e.meeting_id = m.id and e.kind = 'calendar_failed' order by e.id desc limit 1))
                from meetings m where m.id = r.meeting_id and m.workspace_id = p_ws),
    'tasks', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'done', t.done, 'assignee', t.assignee, 'at', t.created_at,
                                                          'purpose', split_part(t.dedupe_key, ':', 3)) order by t.created_at)
                       from tasks t where t.workspace_id = p_ws and t.dedupe_key in ('routing:' || r.id::text || ':schedule', 'routing:' || r.id::text || ':abandoned')), '[]'),
    'task', (select jsonb_build_object('id', t.id, 'title', t.title, 'done', t.done, 'assignee', t.assignee, 'at', t.created_at)
             from tasks t where t.workspace_id = p_ws and t.dedupe_key = 'routing:' || r.id::text || ':schedule'),
    'owner_calendar', case when r.owner is null then null else (
      select jsonb_build_object('provider', a.provider, 'status', a.status) from calendar_accounts a
      where a.workspace_id = p_ws and a.user_id = r.owner and a.provider <> 'zoom' order by (a.status = 'ok') desc, a.created_at limit 1) end,
    'sync', case when coalesce(r.sync_state, 'not_required') = 'not_required' then null else jsonb_build_object(
      'crms', (select count(*) from sources so where so.workspace_id = p_ws and so.status = 'active' and so.settings->'objects'->>'contacts' = 'both'),
      'error', (select l.error from sync_log l where l.workspace_id = p_ws and l.local_id = r.contact_id and l.direction = 'out' and l.object = 'contact' and l.action = 'error' and l.at >= r.created_at order by l.at desc limit 1)) end,
    'history', coalesce((select jsonb_agg(jsonb_build_object('kind', e.kind, 'at', e.at) order by e.at)
                         from contact_events e where e.workspace_id = p_ws and e.contact_id = r.contact_id and e.kind in ('lead.booking_abandoned', 'lead.booking_resumed')
                           and e.data->>'run_id' = r.id::text and e.at >= r.created_at), '[]'))
  from router_runs r where r.id = p_run and r.workspace_id = p_ws;
$$;

-- Sources for the screens (096), with each connection's disconnected behavior and whether it still follows its form.
create or replace function public.routing_screen_sources(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'form_id', s.form_id, 'name', coalesce(f.name, 'Internal handoff'),
        'enabled', s.enabled, 'policy_id', coalesce(s.policy_id, case when s.follows_default then (select d.id from routing_policies d where d.workspace_id = p_ws and d.is_default) end),
        'follows_default', s.follows_default, 'outcome', s.outcome, 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'no_slots', s.no_slots, 'when_off', s.when_off,
        'auto', s.completion->>'auto' = 'true' and s.updated_by is null and s.draft is null and s.live_revision = 1 and s.follows_default,
        'live_revision', s.live_revision, 'draft', s.draft, 'draft_revision', s.draft_revision) order by s.kind desc, f.name)
      from routing_sources s left join forms f on f.id = s.form_id where s.workspace_id = p_ws), '[]'),
    'forms', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'name', f.name, 'status', f.status,
        'fields', coalesce((select jsonb_agg(jsonb_build_object('id', x->>'id', 'key', x->>'key', 'type', x->>'type', 'label', x->>'label', 'options', x->'options'))
                            from form_versions v,
                                 jsonb_array_elements(case when jsonb_typeof(v.body->'steps') = 'array' then v.body->'steps' else '[]' end) st,
                                 jsonb_array_elements(case when jsonb_typeof(st->'fields') = 'array' then st->'fields' else '[]' end) x
                            where v.form_id = f.id and v.version = f.version), '[]')) order by f.name)
      from forms f where f.workspace_id = p_ws), '[]'),
    'meeting_types', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'minutes', (t.settings->'lengths'->>0)::int) order by t.name)
      from meeting_types t where t.workspace_id = p_ws and t.active and t.template_id is null), '[]'));
$$;

-- Grants -----------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'routing_review_act(uuid, uuid, text, uuid, text, int, text)', 'routing_sync_needed(uuid)', 'routing_sync_retry(uuid, uuid, uuid)',
    'routing_followups_done(uuid, uuid)', 'routing_booking_reconcile(uuid, uuid, uuid)', 'routing_run_meeting(uuid, uuid, uuid, text, text)',
    'routing_run_booking(uuid, text, text, text)', 'routing_abandon_minutes(uuid)', 'routing_booking_touch(uuid, text)', 'routing_booking_abandon(uuid)',
    'routing_source_resolve(uuid)', 'routing_publish(uuid, uuid, jsonb, text, uuid, text, int, boolean, jsonb)',
    'meeting_team_run(uuid, uuid, uuid, text, uuid, int, jsonb)', 'routing_screen_activity(uuid, text, timestamptz, int)', 'routing_screen_run(uuid, uuid)',
    'routing_screen_sources(uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
-- Trigger functions run as their tables' writers; nobody calls them.
revoke execute on function public.routing_reviews_child() from public, anon, authenticated;
revoke execute on function public.routing_runs_before() from public, anon, authenticated;
revoke execute on function public.routing_runs_after() from public, anon, authenticated;
revoke execute on function public.routing_reviewer_left() from public, anon, authenticated;
revoke execute on function public.routing_sync_logged() from public, anon, authenticated;
revoke execute on function public.routing_meeting_made() from public, anon, authenticated;
revoke execute on function public.routing_meeting_changed() from public, anon, authenticated;
revoke execute on function public.routing_meeting_failed() from public, anon, authenticated;
revoke execute on function public.routing_form_made() from public, anon, authenticated;
revoke execute on function public.routing_form_published() from public, anon, authenticated;
revoke execute on function public.routing_meeting_placed(jsonb) from public, anon, authenticated;
