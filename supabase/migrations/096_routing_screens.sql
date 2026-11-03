-- Routing screens, stages F and G (docs/routing-workflow.md Sections 4-8, 12, 14, 16-18): what the Policies, Teams
-- and Activity tabs, the lead tester, the publish review and Route & book need on top of 095.
--
--   routing_policies.draft_name   a rename waits in the draft and goes live with the next publish (Section 5).
--   routing_test_evidence         one row per dry run: the draft's fingerprint, the team revisions it used, who ran
--                                 it, when, on which source, and a short result. Never a business record: a test
--                                 writes only here (Section 16).
--   router_runs.meeting_id        the meeting a handoff booked for its run (Section 14).
--   routing_policy_draft          save a draft's config and name in one revision.
--   routing_publish               as 095, and a staged name goes live with the version.
--   routing_policy_archive        archive a policy no live source uses; restore one as a disconnected draft.
--   routing_handoff_stage         stage the internal handoff's connection (Contacts › Route & book).
--   routing_evidence_save         keep one dry run's evidence.
--   routing_run_meeting           link a handoff's meeting to its run and set the run's booking state.
--   routing_screen_*              the screens' reads, one call each, for workspace members.
--   router_action_count           the sidebar's dot also reads teams a v2 policy only names.
--   app_counts                    "Turn on routing" counts any published policy.
--
-- Adds a table and columns and replaces functions; deletes nothing. Safe to run twice.

alter table public.routing_policies add column if not exists draft_name text;
alter table public.routing_policies drop constraint if exists routing_policies_draft_name_check;
alter table public.routing_policies add constraint routing_policies_draft_name_check check (draft_name is null or length(btrim(draft_name)) between 1 and 80);

alter table public.router_runs add column if not exists meeting_id uuid;

create table if not exists public.routing_test_evidence (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  policy_id uuid not null references public.routing_policies (id) on delete cascade,
  -- The tested configuration: the draft body, the teams it names, and its sources' settings (evaluate.ts fingerprint).
  fingerprint text not null check (length(fingerprint) between 8 and 64),
  draft_revision int,
  tested text not null check (tested in ('draft', 'live')),
  version int,
  source_id uuid,
  -- The revisions of the teams the policy names, when it was tested.
  dependencies jsonb not null default '{}' check (jsonb_typeof(dependencies) = 'object'),
  -- {state, effect, recipient, rule, booking}: enough to say what the test showed.
  result jsonb not null default '{}' check (jsonb_typeof(result) = 'object'),
  by_user uuid,
  created_at timestamptz not null default now()
);
create index if not exists routing_test_evidence_policy on public.routing_test_evidence (policy_id, fingerprint, created_at desc);

alter table public.routing_test_evidence enable row level security;
revoke all on public.routing_test_evidence from anon;
revoke insert, update, delete on public.routing_test_evidence from authenticated;
drop policy if exists "members read" on public.routing_test_evidence;
create policy "members read" on public.routing_test_evidence for select using (workspace_id = ANY ((SELECT public.my_workspaces())::uuid[]));

-- Drafts ----------------------------------------------------------------------------------------------------------

/*
 * Save a draft's config and its name together, at the revision the editor read (routing_draft_save's check). A null
 * config keeps the draft as it is, or starts one from the live version, so a rename alone is a draft change too. A
 * null name keeps the staged name; the live name changes only when this draft is published.
 */
create or replace function public.routing_policy_draft(p_ws uuid, p_policy uuid, p_config jsonb, p_name text, p_revision int, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p routing_policies%rowtype;
  cfg jsonb := p_config;
  n text := nullif(btrim(coalesce(p_name, '')), '');
  rev int;
begin
  if n is not null and length(n) > 80 then raise exception 'invalid_configuration: name'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws;
  if p.id is null then raise exception 'not_found'; end if;
  if cfg is null then
    cfg := coalesce(p.draft, (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version));
    if cfg is null then raise exception 'invalid_configuration: config'; end if;
  end if;
  rev := routing_draft_save(p_ws, p_policy, cfg, p_revision, p_user);
  if n is not null then
    update routing_policies set draft_name = case when n = name then null else n end where id = p.id;
  end if;
  return rev;
end;
$$;

-- Publish (Section 17): 095's one release, and a staged name goes live with the version. ---------------------------

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
  -- An empty list may arrive as an empty object from some callers.
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

-- Archive and restore (Section 5) ------------------------------------------------------------------------------------

/*
 * Archive a policy: refused while a live source still routes with it (the person moves or disconnects those first,
 * so no form is left pointing at nothing) and for the workspace's default policy. Connections staged to it are
 * dropped. Restoring brings it back as a draft with no source connected.
 */
create or replace function public.routing_policy_archive(p_ws uuid, p_policy uuid, p_archive boolean, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  p routing_policies%rowtype;
  live jsonb;
begin
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if not p_archive then
    update routing_policies set archived_at = null, updated_at = now() where id = p.id;
    return jsonb_build_object('archived', false);
  end if;
  if p.is_default then raise exception 'invalid_configuration: default'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', coalesce(f.name, 'Internal handoff'))), '[]') into live
  from routing_sources s left join forms f on f.id = s.form_id
  where s.workspace_id = p_ws and s.policy_id = p.id and s.enabled;
  if jsonb_array_length(live) > 0 then
    return jsonb_build_object('archived', false, 'sources', live);
  end if;
  update routing_sources set draft = null, draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now()
  where workspace_id = p_ws and nullif(draft->>'policy_id', '')::uuid = p.id;
  update routing_policies set archived_at = now(), updated_at = now() where id = p.id;
  return jsonb_build_object('archived', true);
end;
$$;

-- The handoff connection (Section 14) -----------------------------------------------------------------------------

/*
 * Stage a change to the workspace's internal handoff connection (Contacts › Route & book), made when there's none:
 * the same staged-then-published row a form's connection is, with the same checks.
 */
create or replace function public.routing_handoff_stage(p_ws uuid, p_draft jsonb, p_revision int, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s routing_sources%rowtype;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'invalid_configuration: draft'; end if;
  if nullif(p_draft->>'policy_id', '') is not null and not exists (select 1 from routing_policies where id = (p_draft->>'policy_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: policy';
  end if;
  if nullif(p_draft->>'meeting_type_id', '') is not null and not exists (select 1 from meeting_types where id = (p_draft->>'meeting_type_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: meeting type';
  end if;
  if coalesce(p_draft->>'outcome', 'assign_only') not in ('assign_only', 'assign_and_calendar') then raise exception 'invalid_configuration: outcome'; end if;
  if p_draft->>'outcome' = 'assign_and_calendar' and nullif(p_draft->>'meeting_type_id', '') is null then raise exception 'invalid_configuration: meeting type'; end if;
  insert into routing_sources (workspace_id, kind, follows_default) values (p_ws, 'handoff', false) on conflict do nothing;
  select * into s from routing_sources where workspace_id = p_ws and kind = 'handoff' for update;
  if p_revision is not null and s.draft_revision <> p_revision then raise exception 'draft_conflict: source'; end if;
  update routing_sources set draft = p_draft - 'mappings', draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'revision', s.draft_revision + 1, 'live_revision', s.live_revision, 'live_policy', s.policy_id);
end;
$$;

-- Test evidence (Section 16) ---------------------------------------------------------------------------------------

create or replace function public.routing_evidence_save(p_ws uuid, p_policy uuid, p_fingerprint text, p_revision int, p_tested text, p_version int, p_source uuid,
  p_deps jsonb, p_result jsonb, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  e routing_test_evidence%rowtype;
begin
  if not exists (select 1 from routing_policies where id = p_policy and workspace_id = p_ws) then raise exception 'not_found'; end if;
  if p_source is not null and not exists (select 1 from routing_sources where id = p_source and workspace_id = p_ws) then raise exception 'not_found: source'; end if;
  insert into routing_test_evidence (workspace_id, policy_id, fingerprint, draft_revision, tested, version, source_id, dependencies, result, by_user)
  values (p_ws, p_policy, p_fingerprint, p_revision, p_tested, p_version, p_source, coalesce(p_deps, '{}'), coalesce(p_result, '{}'), p_user)
  returning * into e;
  return jsonb_build_object('id', e.id, 'fingerprint', e.fingerprint, 'at', e.created_at);
end;
$$;

-- The newest completed dry run of exactly this configuration, if there is one.
create or replace function public.routing_evidence_latest(p_ws uuid, p_policy uuid, p_fingerprint text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', e.id, 'fingerprint', e.fingerprint, 'at', e.created_at, 'by', e.by_user, 'result', e.result, 'source_id', e.source_id)
  from routing_test_evidence e
  where e.workspace_id = p_ws and e.policy_id = p_policy and e.fingerprint = p_fingerprint and e.tested = 'draft'
  order by e.created_at desc limit 1;
$$;

-- A handoff's meeting (Section 14) -----------------------------------------------------------------------------------

/*
 * Link the meeting a handoff booked to its run and set the run's booking state (pending until the provider has the
 * event, then confirmed; failed keeps the assignment). A confirmed booking resolves the run's scheduling follow-up,
 * and is never moved back by a late answer.
 */
create or replace function public.routing_run_meeting(p_ws uuid, p_run uuid, p_meeting uuid, p_state text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
begin
  if p_state not in ('awaiting_selection', 'pending_confirmation', 'confirmed', 'failed', 'unavailable') then raise exception 'routing_run_meeting: state'; end if;
  select * into r from router_runs where id = p_run and workspace_id = p_ws for update;
  if r.id is null then return null; end if;
  if p_meeting is not null and not exists (select 1 from meetings m where m.id = p_meeting and m.workspace_id = p_ws) then raise exception 'not_found: meeting'; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state <> 'confirmed' then return r.booking_state; end if;
  update router_runs set booking_state = p_state, booking_reason = p_reason, meeting_id = coalesce(p_meeting, meeting_id) where id = r.id;
  if p_state = 'confirmed' then
    update tasks set done = true, done_at = now(), updated_at = now() where workspace_id = p_ws and dedupe_key = 'routing:' || r.id::text || ':schedule' and not done;
  end if;
  return p_state;
end;
$$;

-- A handoff's run by its operation key, with its booking: a second click finds it instead of committing again.
create or replace function public.routing_handoff_run(p_ws uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', r.id, 'owner', r.owner, 'effect', r.effect, 'meeting_id', r.meeting_id, 'booking_state', r.booking_state, 'assignment_state', r.assignment_state)
  from router_runs r where r.workspace_id = p_ws and r.key = p_key;
$$;

-- Where a handoff's meeting is: the provider has its event (confirmed), the calendar work failed for good, or neither yet.
create or replace function public.routing_handoff_status(p_ws uuid, p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('booking_state', r.booking_state,
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'confirmed', m.events <> '{}'::jsonb,
                                          'failed', exists (select 1 from meeting_events e where e.meeting_id = m.id and e.kind = 'calendar_failed'))
                from meetings m where m.id = r.meeting_id and m.workspace_id = p_ws))
  from router_runs r where r.id = p_run and r.workspace_id = p_ws;
$$;

-- The screens' reads ------------------------------------------------------------------------------------------------

/*
 * The Policies list and every editor's header in one read: each policy with its live and draft config, its staged
 * name, how many live sources route with it, how many changes are staged for it, and its last real run.
 */
create or replace function public.routing_screen_policies(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'name', p.name, 'draft_name', p.draft_name, 'is_default', p.is_default, 'archived', p.archived_at is not null,
    'active_version', p.active_version, 'draft_revision', p.draft_revision, 'draft', p.draft,
    'live', (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version),
    'live_sources', (select count(*) from routing_sources s where s.workspace_id = p.workspace_id and s.enabled
                       and (s.policy_id = p.id or (p.is_default and s.follows_default))),
    'staged', (select count(*) from routing_sources s where s.workspace_id = p.workspace_id and s.draft is not null
                 and (nullif(s.draft->>'policy_id', '')::uuid = p.id or s.policy_id = p.id)),
    'last_run', (select max(r.created_at) from router_runs r where r.workspace_id = p.workspace_id and r.policy_id = p.id),
    'created_at', p.created_at) order by p.archived_at nulls first, p.is_default desc, p.created_at), '[]')
  from routing_policies p where p.workspace_id = p_ws;
$$;

-- One policy's versions, newest first, with who published each and the sources it turned on.
create or replace function public.routing_screen_versions(p_ws uuid, p_policy uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('version', v.version, 'note', v.note, 'by', v.published_by, 'at', v.published_at, 'sources', v.sources, 'config', v.config) order by v.version desc), '[]')
  from routing_policy_versions v where v.policy_id = p_policy and v.workspace_id = p_ws;
$$;

/*
 * Every source connection in the workspace with what the editor shows: its form and the form's fields (for the
 * mapping table), the live and staged settings, and the policy it routes with now.
 */
create or replace function public.routing_screen_sources(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', s.id, 'kind', s.kind, 'form_id', s.form_id, 'name', coalesce(f.name, 'Internal handoff'),
        'enabled', s.enabled, 'policy_id', coalesce(s.policy_id, case when s.follows_default then (select d.id from routing_policies d where d.workspace_id = p_ws and d.is_default) end),
        'follows_default', s.follows_default, 'outcome', s.outcome, 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'no_slots', s.no_slots,
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

/*
 * Teams and the people in them, for the Teams tab and the editor's pickers: each team's members in position order
 * with its next position and revision, its keys, and every workspace member's routing state (status, out-of-office
 * dates and zone, today's committed count and cap, calendar).
 */
create or replace function public.routing_screen_teams(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'method', t.method, 'next', t.next_position, 'revision', t.revision,
        'keys', coalesce((select jsonb_agg(k.key order by k.key) from routing_team_keys k where k.team_id = t.id), '[]'),
        'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'position', m.position, 'weight', m.weight) order by m.position) from routing_team_members m where m.team_id = t.id), '[]'))
      order by t.created_at, t.name) from routing_teams t where t.workspace_id = p_ws and t.archived_at is null), '[]'),
    'people', coalesce((select jsonb_agg(jsonb_build_object(
        'id', w.user_id, 'role', w.role,
        'name', coalesce((select b.name from booking_profiles b where b.workspace_id = p_ws and b.user_id = w.user_id), (select u.email from auth.users u where u.id = w.user_id)),
        'email', (select u.email from auth.users u where u.id = w.user_id),
        'paused_until', r.paused_until, 'out_dates', coalesce(r.out_dates, '[]'), 'cap_day', r.cap_day, 'cap_week', r.cap_week, 'backup', r.backup,
        'tz', routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = w.user_id)),
        'today', coalesce((routing_quota_used(p_ws, w.user_id)->>'today')::int, 0),
        'calendar', (select a.provider from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status = 'ok' limit 1),
        'reconnect', exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status <> 'ok'),
        'out', (routing_member_state(p_ws, w.user_id)->>'out')::boolean)
      order by w.created_at) from workspace_members w left join router_reps r on r.workspace_id = w.workspace_id and r.user_id = w.user_id where w.workspace_id = p_ws), '[]'));
$$;

/*
 * Activity (Section 18): real runs, newest first, with their lead, source, policy and version, separate assignment,
 * booking and sync states, and their review item. p_filter: all, review (open and unfinished review items) or errors
 * (failed assignments, bookings that couldn't be offered or failed, failed syncs). p_before pages back by time.
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
        'contact_id', r.contact_id, 'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
        'rule_name', coalesce(r.trace->'rules'->'matched'->>'name', (select s->'rule'->>'name' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'rules' limit 1)),
        'held', (select s->'signals' from jsonb_array_elements(case when jsonb_typeof(r.steps) = 'array' then r.steps else '[]' end) s where s->>'step' = 'spam' and not coalesce((s->>'ok')::boolean, true) limit 1),
        'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer) from routing_reviews v where v.run_id = r.id)) x
      from router_runs r
      where r.workspace_id = p_ws and r.undone_at is null
        and (p_before is null or r.created_at < p_before)
        and case coalesce(p_filter, 'all')
              when 'review' then exists (select 1 from routing_reviews v where v.run_id = r.id and v.state not in ('resolved', 'dismissed'))
              when 'errors' then r.assignment_state = 'failed' or r.booking_state in ('unavailable', 'failed') or r.sync_state = 'failed'
              else true end
      order by r.created_at desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)) y), '[]'),
    'open_reviews', (select count(*) from routing_reviews v where v.workspace_id = p_ws and v.state not in ('resolved', 'dismissed')));
$$;

-- One run for its drawer: the run, its trace, review item, meeting and the contact's routing events.
create or replace function public.routing_screen_run(p_ws uuid, p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', r.id, 'at', r.created_at, 'key', r.key, 'kind', r.kind, 'reason', r.reason, 'by', r.by, 'by_user', r.by_user, 'rule', r.rule_id, 'owner', r.owner,
    'previous_owner', r.previous_owner, 'policy_id', r.policy_id, 'policy', (select p.name from routing_policies p where p.id = r.policy_id), 'version', coalesce(r.policy_version, r.version),
    'source_id', r.source_id, 'source_revision', r.source_revision,
    'source', case when r.source_id is null then null else (select coalesce(f.name, 'Internal handoff') from routing_sources s left join forms f on f.id = s.form_id where s.id = r.source_id) end,
    'assignment_state', r.assignment_state, 'booking_state', r.booking_state, 'booking_reason', r.booking_reason, 'sync_state', r.sync_state, 'effect', r.effect,
    'trace', r.trace, 'steps', r.steps, 'contact_id', r.contact_id, 'parent_run_id', r.parent_run_id,
    'lead', jsonb_build_object('name', r.facts->'lead'->>'name', 'email', r.facts->'lead'->>'email'),
    'current_owner', (select c.owner_user_id from contacts c where c.id = r.contact_id and c.workspace_id = p_ws),
    'review', (select jsonb_build_object('id', v.id, 'state', v.state, 'reason', v.reason, 'reviewer', v.reviewer, 'at', v.created_at, 'latest_action', v.latest_action, 'child_run_id', v.child_run_id)
               from routing_reviews v where v.run_id = r.id),
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'hosts', m.hosts, 'status', m.status, 'confirmed', m.events <> '{}'::jsonb)
                from meetings m where m.id = r.meeting_id and m.workspace_id = p_ws),
    'task', (select jsonb_build_object('id', t.id, 'title', t.title, 'done', t.done, 'assignee', t.assignee, 'at', t.created_at)
             from tasks t where t.workspace_id = p_ws and t.dedupe_key = 'routing:' || r.id::text || ':schedule'))
  from router_runs r where r.id = p_run and r.workspace_id = p_ws;
$$;

-- The sidebar's dot (094): rules and Everyone else pointing at a team the body only names read that team's members.
create or replace function public.router_action_count(p_ws uuid) returns int
language sql stable security definer set search_path = public as $$
  with b as (
    select coalesce(r.draft, v.body) as body
    from routers r
    left join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
    where r.workspace_id = p_ws
  ),
  arr as (
    select case when jsonb_typeof(b.body->'rules'->'list') = 'array' and coalesce((b.body->'rules'->>'on')::boolean, true) then b.body->'rules'->'list' else '[]'::jsonb end as rules,
           case when jsonb_typeof(b.body->'queues') = 'array' then b.body->'queues' else '[]'::jsonb end as queues,
           b.body->'fallback' as fb
    from b
  ),
  rules_on as (
    select x.r from arr cross join lateral jsonb_array_elements(arr.rules) as x(r)
    where coalesce((x.r->>'on')::boolean, true) and coalesce(x.r->>'then', 'queue') = 'queue'
  ),
  q as (
    select x.q->>'id' as id, case when jsonb_typeof(x.q->'members') = 'array' then x.q->'members' else '[]'::jsonb end as members
    from arr cross join lateral jsonb_array_elements(arr.queues) as x(q)
    union all
    select k.key, coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id) order by m.position) from routing_team_members m where m.team_id = k.team_id), '[]')
    from routing_team_keys k
    where k.workspace_id = p_ws and not exists (select 1 from arr, jsonb_array_elements(arr.queues) y where y->>'id' = k.key)
  ),
  used_q as (
    select r->>'queue' as id from rules_on
    union select fb->>'id' from arr where fb->>'kind' = 'queue'
  ),
  used_u as (
    select m->>'user' as u from q join used_q on used_q.id = q.id cross join lateral jsonb_array_elements(q.members) as m
    union select fb->>'id' from arr where fb->>'kind' = 'user'
  )
  select
    (select count(*) from used_u
      where used_u.u is not null
        and not exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id::text = used_u.u and a.provider <> 'zoom' and a.status = 'ok'))::int
  + (select count(*) from rules_on where not exists (select 1 from q where q.id = rules_on.r->>'queue' and jsonb_array_length(q.members) > 0))::int
  + (select count(*) from arr
      where not (coalesce(arr.fb->>'kind', '') = 'user' or exists (select 1 from q where arr.fb->>'kind' = 'queue' and q.id = arr.fb->>'id' and jsonb_array_length(q.members) > 0)))::int
$$;

-- "Turn on routing" (GetStarted): any published policy, not only the default one.
create or replace function public.app_counts(p_ws uuid, p_day_from timestamptz, p_day_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return jsonb_build_object(
    'review', (select count(*) from contacts c where c.workspace_id = p_ws and c.route_status in ('held', 'unassigned') and c.deleted_at is null),
    'meetings_today', (select count(*) from meetings m where m.workspace_id = p_ws and m.status in ('booked', 'held') and m.start_at >= p_day_from and m.start_at < p_day_to),
    'calendars', (select count(*) from (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = auth.uid() limit 1) x),
    'types', (select count(*) from (select 1 from meeting_types t where t.workspace_id = p_ws limit 1) x),
    'live_forms', (select count(*) from (select 1 from forms f where f.workspace_id = p_ws and f.status = 'live' limit 1) x),
    'routing', coalesce((select r.live_version is not null and r.live_version > 0 from routers r where r.workspace_id = p_ws), false)
               or exists (select 1 from routing_policies p where p.workspace_id = p_ws and p.active_version is not null and p.archived_at is null),
    'members', (select count(*) from (select 1 from workspace_members w where w.workspace_id = p_ws limit 2) x),
    'invites', (select count(*) from (select 1 from invites i where i.workspace_id = p_ws limit 1) x),
    'sources', (select count(*) from (select 1 from sources s where s.workspace_id = p_ws limit 1) x),
    'no_calendar', (select count(*) from workspace_members w
                     where w.workspace_id = p_ws
                       and not exists (select 1 from calendar_accounts a where a.workspace_id = p_ws and a.user_id = w.user_id and a.provider <> 'zoom' and a.status = 'ok')),
    'routing_draft', coalesce((select r.draft is not null from routers r where r.workspace_id = p_ws), false),
    'routing_paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false),
    'routing_action', router_action_count(p_ws)
  );
end;
$$;

-- Grants -----------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'routing_policy_draft(uuid, uuid, jsonb, text, int, uuid)',
    'routing_publish(uuid, uuid, jsonb, text, uuid, text, int, boolean, jsonb)',
    'routing_policy_archive(uuid, uuid, boolean, uuid)',
    'routing_handoff_stage(uuid, jsonb, int, uuid)',
    'routing_evidence_save(uuid, uuid, text, int, text, int, uuid, jsonb, jsonb, uuid)',
    'routing_evidence_latest(uuid, uuid, text)',
    'routing_run_meeting(uuid, uuid, uuid, text, text)', 'routing_handoff_run(uuid, text)', 'routing_handoff_status(uuid, uuid)',
    'routing_screen_policies(uuid)', 'routing_screen_versions(uuid, uuid)', 'routing_screen_sources(uuid)', 'routing_screen_teams(uuid)',
    'routing_screen_activity(uuid, text, timestamptz, int)', 'routing_screen_run(uuid, uuid)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.router_action_count(uuid) from public, anon, authenticated;
revoke execute on function public.app_counts(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.app_counts(uuid, timestamptz, timestamptz) to authenticated;
