-- Calendar and Routing as one system (docs/scheduling-plan.md Part 12). A meeting type can be hosted by a Routing team:
-- its people come from the live router's queue, the times are pooled, and the confirm takes the queue's turn with the
-- router's method and counts. The booking is written as a router run (reason 'booking'), so a rep's meetings and leads
-- share one rotation and one set of caps. A rep's days off (router_reps.out_dates) remove their times, and a paused
-- rep is left out of team times. Writes go through the server with the service role.

-- 'booking': a team meeting type gave the lead its rep.
alter table public.router_runs drop constraint if exists router_runs_reason_check;
alter table public.router_runs add constraint router_runs_reason_check
  check (reason in ('form', 'import', 'crm', 'api', 'again', 'let_through', 'score', 'manual', 'sla', 'booking'));

-- meeting_inputs from 066, with each host's days off and pause from Routing.
create or replace function public.meeting_inputs(p_ws uuid, p_users uuid[], p_from timestamptz, p_to timestamptz, p_schedule text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', u,
    'availability', coalesce(
      (select jsonb_build_object('tz', s.tz, 'weekly', s.weekly, 'overrides', s.overrides) from availability_schedules s
       where p_schedule is not null and s.workspace_id = p_ws and s.user_id = u and lower(s.name) = lower(p_schedule)),
      (select jsonb_build_object('tz', a.tz, 'weekly', a.weekly, 'overrides', a.overrides) from availability a where a.workspace_id = p_ws and a.user_id = u)),
    'connected', exists (select 1 from calendar_accounts c join calendar_lists l on l.account_id = c.id and l.write
                         where c.workspace_id = p_ws and c.user_id = u and c.status = 'ok' and c.provider <> 'zoom'),
    'reconnect', exists (select 1 from calendar_accounts c where c.workspace_id = p_ws and c.user_id = u and c.status = 'reconnect'),
    'busy', coalesce((select jsonb_agg(jsonb_build_array(b.start_at, b.end_at))
                      from busy_blocks b join calendar_accounts c on c.id = b.account_id
                      join calendar_lists l on l.account_id = b.account_id and l.calendar_id = b.calendar_id and l.busy
                      where c.workspace_id = p_ws and c.user_id = u and c.status = 'ok' and b.end_at > p_from and b.start_at < p_to), '[]'),
    'booked', coalesce((select jsonb_agg(jsonb_build_array(m.block_start, m.block_end, m.type_id, m.start_at, m.id))
                        from meetings m where m.workspace_id = p_ws and u = any(m.hosts) and meeting_holds(m)
                          and m.block_end > p_from - interval '7 days' and m.block_start < p_to), '[]'),
    'out_dates', coalesce((select r.out_dates from router_reps r where r.workspace_id = p_ws and r.user_id = u), '[]'),
    'paused_until', (select r.paused_until from router_reps r where r.workspace_id = p_ws and r.user_id = u)
  )), '[]')
  from unnest(p_users) u;
$$;

/*
 * A team meeting's run: the rep the queue's turn gave it, written once per meeting (the key is booking:<meeting>).
 * The contact takes the rep as owner only when it has none, so a lead's routed owner is never moved by a booking.
 * Returns the run id, or the existing one for a key seen before.
 */
create or replace function public.meeting_team_run(p_ws uuid, p_meeting uuid, p_contact uuid, p_queue text, p_owner uuid, p_version int, p_steps jsonb default '[]') returns uuid
language plpgsql security definer set search_path = public as $$
declare
  k text := 'booking:' || p_meeting::text;
  rid uuid;
  cid uuid;
  c contacts%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || coalesce(p_queue, '-'), 0));
  select id into rid from router_runs where workspace_id = p_ws and key = k;
  if rid is not null then return rid; end if;
  select coalesce(p_contact, m.contact_id) into cid from meetings m where m.id = p_meeting and m.workspace_id = p_ws;
  if not found then return null; end if;
  if cid is not null then
    select * into c from contacts where id = cid and workspace_id = p_ws and deleted_at is null for update;
  end if;
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, steps, facts, ms)
  values (p_ws, c.id, k, 'booking', p_version, 'owner', p_owner, 'queue', p_queue, coalesce(p_steps, '[]'), jsonb_build_object('meeting', p_meeting), 0)
  returning id into rid;
  if c.id is not null and c.owner_user_id is null and c.owner_crm_id is null then
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

-- A lead's upcoming meetings with one host, for "Move their upcoming meeting too?" when the lead gets a new rep.
create or replace function public.meeting_upcoming_for(p_ws uuid, p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'host', m.hosts[1], 'start', m.start_at, 'end', m.end_at, 'block_start', m.block_start, 'block_end', m.block_end,
                                               'kind', t.kind) order by m.start_at), '[]')
  from meetings m left join meeting_types t on t.id = m.type_id
  where m.workspace_id = p_ws and m.contact_id = p_contact and m.status = 'booked' and m.start_at > now()
    and cardinality(m.hosts) = 1 and coalesce(t.kind, 'one') not in ('collective', 'double', 'group');
$$;

-- Fixing where the parts disagree (docs/scheduling-plan.md Part 13) -----------------------------------------------

/*
 * form_notify_info from 083, with what the alerts and auto-reply now wait on and link to:
 *   routing  'none' (no live router), 'pending' (live, the fill not routed yet) or 'done'
 *   booked   the lead booked since sending the form
 *   meet     the meeting the lead was offered: the routing rule's (or the fallback's), else the form's meeting type
 */
create or replace function public.form_notify_info(p_sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from submissions where id = p_sid),
  run as (select r.* from router_runs r, s where r.workspace_id = s.workspace_id and r.key = 'form:' || s.id::text),
  meet as (
    select coalesce(
      (select case when run.by = 'fallback' then v.body->'fallback'->>'meet'
                   else (select x->>'meet' from jsonb_array_elements(v.body->'rules'->'list') x where x->>'id' = run.rule_id limit 1) end
       from run join router_versions v on v.workspace_id = run.workspace_id and v.version = run.version where run.kind = 'owner'),
      (select fv.body->'after'->'schedule'->>'meetingTypeId' from s join form_versions fv on fv.form_id = s.form_id and fv.version = s.form_version)) as id
  )
  select jsonb_build_object(
    'submission', jsonb_build_object('id', s.id, 'workspace_id', s.workspace_id, 'form_id', s.form_id, 'values', s."values",
                                     'spam', s.spam, 'test', s.test, 'contact_id', s.contact_id, 'created_at', s.created_at),
    'form', f.name,
    'body', v.body,
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'email_class', c.email_class,
      'first_name', c.first_name, 'last_name', c.last_name, 'company', (select co.name from companies co where co.id = c.company_id),
      'owner', c.owner_user_id) end,
    'owner', case when c.owner_user_id is null then null else meeting_people(s.workspace_id, array[c.owner_user_id])->0 end,
    'handle', (select coalesce(bp.handle, bp.slug) from booking_profiles bp where bp.workspace_id = s.workspace_id and bp.user_id = c.owner_user_id),
    'workspace', (select name from workspaces w where w.id = s.workspace_id),
    'sealed', (select sealed from router_secrets r where r.workspace_id = s.workspace_id),
    'sending', meeting_sending(s.workspace_id),
    'sent', coalesce((select jsonb_agg(n.part) from form_notify_sent n where n.submission_id = s.id), '[]'),
    'routing', case when not exists (select 1 from routers rt where rt.workspace_id = s.workspace_id and rt.live_version is not null and rt.paused_at is null) then 'none'
                    when exists (select 1 from run) then 'done' else 'pending' end,
    'booked', exists (select 1 from meetings m where m.workspace_id = s.workspace_id and m.status in ('booked', 'pending_payment', 'held')
                        and (m.submission_id = s.id or (c.id is not null and m.contact_id = c.id and m.created_at >= s.created_at))),
    'meet', (select jsonb_build_object('id', t.id, 'slug', t.slug) from meeting_types t, meet
             where meet.id ~ '^[0-9a-f-]{36}$' and t.id = meet.id::uuid and t.workspace_id = s.workspace_id and t.active and not t.secret))
  from s
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id;
$$;

-- Whether a live journey that starts on "Didn't book after a form" covers this fill's form (all forms, or this one):
-- then the journey owns the follow-up and the "book later" email stays unsent.
create or replace function public.form_journey_follows(p_submission uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from submissions s
    join workflows w on w.workspace_id = s.workspace_id and w.status = 'live' and w.trigger_kind = 'not_booked'
    join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version
    where s.id = p_submission
      and (coalesce(jsonb_array_length(v.body->'trigger'->'forms'), 0) = 0 or v.body->'trigger'->'forms' ? s.form_id::text)
  );
$$;

-- Whether Routing routed this lead in the last few minutes, or is about to (a route job waiting): a workflow's Route
-- step then does nothing, so a form trigger can't change the owner twice.
create or replace function public.router_recent(p_ws uuid, p_contact uuid, p_minutes int default 10) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from router_runs r where r.workspace_id = p_ws and r.contact_id = p_contact and r.undone_at is null
                   and r.reason <> 'booking' and r.created_at > now() - make_interval(mins => greatest(1, least(p_minutes, 1440))))
      or exists (select 1 from jobs j where j.workspace_id = p_ws and j.kind = 'route' and j.status in ('queued', 'running') and j.payload->>'contact' = p_contact::text);
$$;

/*
 * CRM owner changes (Part 13.7). When the CRM moves a lead to another owner (owner_crm_id changes and the owner wasn't
 * set in the same write), the lead's owner follows when that CRM owner is linked to a teammate. An upcoming meeting
 * stays with its host, and the new owner gets one task to take it over. Nothing moves on its own.
 */
create or replace function public.contacts_crm_owner() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  u uuid;
begin
  if new.owner_crm_id is distinct from old.owner_crm_id and new.owner_user_id is not distinct from old.owner_user_id and new.owner_crm_id is not null then
    u := router_owner_user(new.workspace_id, new.owner_crm_id);
    if u is not null and u is distinct from old.owner_user_id then
      new.owner_user_id := u;
      new.field_sources := coalesce(new.field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'crm', 'at', now()));
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists contacts_crm_owner on public.contacts;
create trigger contacts_crm_owner before update of owner_crm_id on public.contacts
  for each row execute function public.contacts_crm_owner();

create or replace function public.contacts_owner_meeting_task() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m record;
  who text;
  tz text;
begin
  if new.owner_user_id is null or new.owner_user_id is not distinct from old.owner_user_id or coalesce(new.field_sources->'owner'->>'s', '') <> 'crm' then
    return null;
  end if;
  who := coalesce(nullif(trim(concat_ws(' ', new.first_name, new.last_name)), ''), new.email, 'this lead');
  tz := coalesce((select a.tz from availability a where a.workspace_id = new.workspace_id and a.user_id = new.owner_user_id), 'UTC');
  for m in
    select x.id, x.start_at, coalesce(t.name, 'meeting') as name from meetings x left join meeting_types t on t.id = x.type_id
    where x.workspace_id = new.workspace_id and x.contact_id = new.id and x.status = 'booked' and x.start_at > now() and not (new.owner_user_id = any(x.hosts))
    order by x.start_at limit 3
  loop
    insert into tasks (workspace_id, object, record_id, title, due, assignee)
    select new.workspace_id, 'contact', new.id, left(format('Take over %s''s %s on %s?', who, m.name, to_char(m.start_at at time zone tz, 'Dy, Mon FMDD')), 300),
           (m.start_at at time zone tz)::date, new.owner_user_id
    where not exists (select 1 from tasks k where k.workspace_id = new.workspace_id and k.object = 'contact' and k.record_id = new.id and k.assignee = new.owner_user_id
                        and not k.done and k.title like 'Take over %' and k.due = (m.start_at at time zone tz)::date);
  end loop;
  return null;
end;
$$;
drop trigger if exists contacts_owner_meeting_task on public.contacts;
-- On any update: the owner may be set by contacts_crm_owner above, which "update of" wouldn't see.
create trigger contacts_owner_meeting_task after update on public.contacts
  for each row when (new.owner_user_id is distinct from old.owner_user_id) execute function public.contacts_owner_meeting_task();

do $$
declare
  f text;
begin
  foreach f in array array['meeting_inputs(uuid, uuid[], timestamptz, timestamptz, text)', 'meeting_team_run(uuid, uuid, uuid, text, uuid, int, jsonb)', 'meeting_upcoming_for(uuid, uuid)', 'form_notify_info(uuid)', 'form_journey_follows(uuid)', 'router_recent(uuid, uuid, int)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
