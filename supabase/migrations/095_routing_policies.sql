-- Routing policies (docs/routing-workflow.md, docs/routing-current-to-target.md): named policies with durable drafts
-- and immutable versions, source connections, teams with one shared queue each, a workspace-wide daily quota, and one
-- transactional committer for every real assignment.
--
--   routing_policies          a workspace's named policies: draft + revision, the active version, archived.
--   routing_policy_versions   immutable snapshots (an update is refused); a publish key makes a lost answer safe.
--   routing_sources           one connection per form (and the handoff entry): policy, outcome, meeting type, field
--                             mappings by field id, completion and no-slots settings, live and staged revisions.
--   routing_teams             reusable teams: stable member positions and one persisted next position.
--   routing_team_keys         the router bodies' queue ids, pointing at their team.
--   routing_quota             committed new owner allocations per member and period (the period keeps its zone).
--   routing_assignments       one event per committed run: recipient, previous owner, quota and queue effects.
--   routing_reviews           one item per held or unallocated run, with its named reviewer.
--   router_runs               + policy and source references, the separate states, previous owner, effect, trace.
--   tasks.dedupe_key          one follow-up per run and purpose.
--
-- Existing data: every workspace router becomes the default policy "Inbound" with all its versions and its draft;
-- `routers` and `router_versions` stay as a mirror written in the same transaction, so every older reader keeps
-- working. Bodies stay v1 (their live semantics are kept). Live queues become teams (identical per-rule copies folded
-- into one), each seeded with the member the old rule would have picked next. Every form gets an explicit
-- connection. Today's counts seed the quota. No contact is reassigned.
--
-- Writes go through these functions with the service role; members read their workspace's rows. Safe to run twice.

-- Tables ---------------------------------------------------------------------------------------------------------

create table if not exists public.routing_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  is_default boolean not null default false,
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_base int,
  draft_revision int not null default 0,
  draft_by uuid,
  draft_at timestamptz,
  active_version int,
  archived_at timestamptz,
  -- One policy per Create click: the same key again returns the first.
  create_key text check (length(create_key) <= 100),
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists routing_policies_default on public.routing_policies (workspace_id) where is_default;
create unique index if not exists routing_policies_create_key on public.routing_policies (workspace_id, create_key) where create_key is not null;
create index if not exists routing_policies_ws on public.routing_policies (workspace_id, created_at);

create table if not exists public.routing_policy_versions (
  policy_id uuid not null references public.routing_policies (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version int not null check (version > 0),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  note text check (length(note) <= 300),
  published_by uuid,
  published_at timestamptz not null default now(),
  publish_key text check (length(publish_key) <= 100),
  -- The source connections this release turned on, with their new revisions.
  sources jsonb not null default '[]' check (jsonb_typeof(sources) = 'array'),
  primary key (policy_id, version)
);
create unique index if not exists routing_policy_versions_key on public.routing_policy_versions (policy_id, publish_key) where publish_key is not null;

create or replace function public.routing_versions_frozen() returns trigger
language plpgsql as $$
begin
  raise exception 'Published routing versions are immutable';
end;
$$;
drop trigger if exists routing_versions_frozen on public.routing_policy_versions;
create trigger routing_versions_frozen before update on public.routing_policy_versions for each row execute function public.routing_versions_frozen();

create table if not exists public.routing_teams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  method text not null default 'rr' check (method in ('rr', 'weighted', 'load')),
  strict boolean not null default false,
  hours_only boolean not null default false,
  -- The position the next turn starts from: one shared queue for every rule and policy that points at the team.
  next_position int not null default 0 check (next_position >= 0),
  revision int not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routing_teams_ws on public.routing_teams (workspace_id);

create table if not exists public.routing_team_members (
  team_id uuid not null references public.routing_teams (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  -- Stable: a new member takes the next position; removing one never renumbers the others.
  position int not null check (position >= 0),
  weight int not null default 1 check (weight between 1 and 10),
  added_at timestamptz not null default now(),
  primary key (team_id, user_id),
  unique (team_id, position)
);
create index if not exists routing_team_members_user on public.routing_team_members (workspace_id, user_id);

create table if not exists public.routing_team_keys (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  key text not null check (key ~ '^[A-Za-z0-9_-]{1,40}$'),
  team_id uuid not null references public.routing_teams (id) on delete cascade,
  primary key (workspace_id, key)
);
create index if not exists routing_team_keys_team on public.routing_team_keys (team_id);

create table if not exists public.routing_sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('form', 'handoff')),
  form_id uuid references public.forms (id) on delete cascade,
  policy_id uuid references public.routing_policies (id) on delete set null,
  enabled boolean not null default false,
  outcome text not null default 'assign_only' check (outcome in ('assign_only', 'assign_and_calendar')),
  meeting_type_id uuid,
  -- [{field: "<form field id>", target: "company.employees", type: "integer", required?: bool}]
  mappings jsonb not null default '[]' check (jsonb_typeof(mappings) = 'array'),
  -- {from: "form"}: the form's own after-submit message or redirect (no second copy of it here).
  completion jsonb not null default '{"from": "form"}' check (jsonb_typeof(completion) = 'object'),
  -- {message: "form", task: true, email_later: false}
  no_slots jsonb not null default '{"message": "form", "task": true}' check (jsonb_typeof(no_slots) = 'object'),
  live_revision int not null default 1,
  -- The connection follows the workspace's default policy (Inbound), as every form did before policies: it routes
  -- whenever that policy is live and not paused. Off once a connection is published to a policy of its own.
  follows_default boolean not null default true,
  -- A staged change (from Forms or Routing), applied by a publish.
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_revision int not null default 0,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  check (kind <> 'form' or form_id is not null),
  check (not enabled or outcome <> 'assign_and_calendar' or meeting_type_id is not null)
);
create unique index if not exists routing_sources_form on public.routing_sources (form_id) where kind = 'form';
create unique index if not exists routing_sources_handoff on public.routing_sources (workspace_id) where kind = 'handoff';
create index if not exists routing_sources_policy on public.routing_sources (policy_id) where policy_id is not null;

create table if not exists public.routing_quota (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  tz text not null default 'UTC' check (length(tz) <= 60),
  n int not null default 0 check (n >= 0),
  primary key (workspace_id, user_id, period_start),
  check (period_end > period_start)
);

alter table public.routing_sources add column if not exists follows_default boolean not null default true;

alter table public.router_runs add column if not exists policy_id uuid;
alter table public.router_runs add column if not exists policy_version int;
alter table public.router_runs add column if not exists source_id uuid;
alter table public.router_runs add column if not exists source_revision int;
alter table public.router_runs add column if not exists parent_run_id uuid;
alter table public.router_runs add column if not exists assignment_state text;
alter table public.router_runs add column if not exists booking_state text;
alter table public.router_runs add column if not exists booking_reason text;
alter table public.router_runs add column if not exists sync_state text;
alter table public.router_runs add column if not exists previous_owner uuid;
alter table public.router_runs add column if not exists effect text;
alter table public.router_runs add column if not exists trace jsonb;
alter table public.router_runs add column if not exists team_id uuid;
alter table public.router_runs drop constraint if exists router_runs_assignment_state_check;
alter table public.router_runs add constraint router_runs_assignment_state_check
  check (assignment_state is null or assignment_state in ('pending', 'held_for_review', 'assigned', 'unassigned_needs_review', 'excluded', 'failed'));
alter table public.router_runs drop constraint if exists router_runs_booking_state_check;
alter table public.router_runs add constraint router_runs_booking_state_check
  check (booking_state is null or booking_state in ('not_requested', 'awaiting_selection', 'pending_confirmation', 'confirmed', 'unavailable', 'abandoned', 'cancelled', 'failed'));
alter table public.router_runs drop constraint if exists router_runs_booking_reason_check;
alter table public.router_runs add constraint router_runs_booking_reason_check
  check (booking_reason is null or booking_reason in ('no_slots', 'calendar_disconnected', 'permission_error', 'timeout', 'unknown', 'slot_taken'));
alter table public.router_runs drop constraint if exists router_runs_sync_state_check;
alter table public.router_runs add constraint router_runs_sync_state_check check (sync_state is null or sync_state in ('not_required', 'pending', 'complete', 'failed'));
alter table public.router_runs drop constraint if exists router_runs_effect_check;
alter table public.router_runs add constraint router_runs_effect_check check (effect is null or effect in ('new', 'retained', 'none'));
alter table public.router_runs drop constraint if exists router_runs_by_check;
alter table public.router_runs add constraint router_runs_by_check check (by in ('account', 'keep', 'queue', 'fallback', 'hand', 'rule', 'backup'));
create index if not exists router_runs_parent on public.router_runs (parent_run_id) where parent_run_id is not null;

create table if not exists public.routing_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  run_id uuid not null unique references public.router_runs (id) on delete cascade,
  contact_id uuid,
  user_id uuid not null,
  previous_owner uuid,
  team_id uuid,
  -- A quota charge (a new owner) and a queue turn (a team picked a new owner).
  counted boolean not null default false,
  advanced boolean not null default false,
  quota_period timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists routing_assignments_user on public.routing_assignments (workspace_id, user_id, created_at desc);

create table if not exists public.routing_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  run_id uuid not null unique references public.router_runs (id) on delete cascade,
  contact_id uuid,
  submission_id uuid,
  policy_id uuid,
  reason text not null check (reason in ('spam', 'rule', 'source_mapping_mismatch', 'multiple_companies', 'no_eligible_recipient', 'no_default')),
  state text not null default 'open' check (state in ('open', 'approved_pending_execution', 'in_progress', 'resolved', 'dismissed')),
  -- Never nobody: the policy's review owner, else a workspace owner.
  reviewer uuid not null,
  revision int not null default 1,
  child_run_id uuid,
  latest_action jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists routing_reviews_open on public.routing_reviews (workspace_id, state, created_at desc) where state not in ('resolved', 'dismissed');

alter table public.tasks add column if not exists dedupe_key text check (length(dedupe_key) <= 200);
create unique index if not exists tasks_dedupe on public.tasks (workspace_id, dedupe_key) where dedupe_key is not null;

do $$
declare
  t text;
begin
  foreach t in array array['routing_policies', 'routing_policy_versions', 'routing_teams', 'routing_team_members', 'routing_team_keys', 'routing_sources',
                           'routing_quota', 'routing_assignments', 'routing_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
    execute format('drop policy if exists "members read" on public.%I', t);
    execute format('create policy "members read" on public.%I for select using (workspace_id = ANY ((SELECT public.my_workspaces())::uuid[]))', t);
  end loop;
end;
$$;

-- Members and quota ------------------------------------------------------------------------------------------------

-- A time zone Postgres knows, else UTC.
create or replace function public.routing_zone(p_tz text) returns text
language plpgsql stable as $$
begin
  if p_tz is null or p_tz = '' then return 'UTC'; end if;
  perform now() at time zone p_tz;
  return p_tz;
exception when others then
  return 'UTC';
end;
$$;

/*
 * One member's state now, for the committer's recheck: in the workspace, paused, out of office (a calendar
 * out-of-office block covering now, or dates set by hand covering today in their zone), and their zone.
 */
create or replace function public.routing_member_state(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with z as (select routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user)) as tz),
  r as (select * from router_reps where workspace_id = p_ws and user_id = p_user)
  select jsonb_build_object(
    'member', exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user),
    'paused', coalesce((select r.paused_until > now() from r), false),
    'out', exists (select 1 from busy_blocks b join calendar_accounts c on c.id = b.account_id
                   where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.ooo and b.start_at <= now() and b.end_at > now())
           or exists (select 1 from r, jsonb_array_elements(r.out_dates) d
                      where jsonb_typeof(d) = 'object' and d->>'from' ~ '^\d{4}-\d{2}-\d{2}$' and d->>'to' ~ '^\d{4}-\d{2}-\d{2}$'
                        and (now() at time zone z.tz)::date between (d->>'from')::date and (d->>'to')::date),
    'tz', z.tz,
    'cap_day', (select r.cap_day from r),
    'cap_week', (select r.cap_week from r)
  ) from z;
$$;

/*
 * The member's current quota period, made when there's none. A period keeps the zone it started in, so changing
 * zone mid-day never clears or doubles today's count: the new zone starts at the next boundary.
 */
create or replace function public.routing_quota_current(p_ws uuid, p_user uuid) returns public.routing_quota
language plpgsql security definer set search_path = public as $$
declare
  q routing_quota%rowtype;
  tz text;
  d0 timestamptz;
  d1 timestamptz;
  prev timestamptz;
begin
  select * into q from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1;
  if q.workspace_id is not null then return q; end if;
  tz := routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user));
  d0 := date_trunc('day', now() at time zone tz) at time zone tz;
  d1 := (date_trunc('day', now() at time zone tz) + interval '1 day') at time zone tz;
  select max(period_end) into prev from routing_quota where workspace_id = p_ws and user_id = p_user and period_end <= now();
  d0 := greatest(d0, coalesce(prev, d0));
  if d1 <= d0 then d1 := d0 + interval '1 day'; end if;
  insert into routing_quota (workspace_id, user_id, period_start, period_end, tz, n) values (p_ws, p_user, d0, d1, tz, 0) on conflict do nothing;
  select * into q from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1;
  return q;
end;
$$;

-- Today's and this week's committed new allocations, read only (the facts): 0 when no period has started yet.
create or replace function public.routing_quota_used(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with cur as (select * from routing_quota where workspace_id = p_ws and user_id = p_user and period_start <= now() and period_end > now() order by period_start desc limit 1),
  z as (select coalesce((select tz from cur), routing_zone((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user))) as tz)
  select jsonb_build_object(
    'today', coalesce((select n from cur), 0),
    'week', coalesce((select sum(q.n) from routing_quota q, z where q.workspace_id = p_ws and q.user_id = p_user
                       and q.period_start >= date_trunc('week', now() at time zone z.tz) at time zone z.tz and q.period_start <= now()), 0)
  );
$$;

-- Teams ----------------------------------------------------------------------------------------------------------

/*
 * Start a team's queue where the old rule would have gone next (fewest leads from its queues in 30 days, then the
 * one who waited longest, then the order), so moving to the persisted queue doesn't reset fairness.
 */
create or replace function public.routing_team_seed(p_ws uuid, p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pos int;
begin
  select m.position into pos
  from routing_team_members m
  left join lateral (
    select count(*) n, max(r.created_at) last from router_runs r
    where r.workspace_id = p_ws and r.owner = m.user_id and r.kind = 'owner' and r.undone_at is null and r.created_at > now() - interval '30 days'
      and (r.team_id = p_team or r.queue_id in (select k.key from routing_team_keys k where k.team_id = p_team))
  ) h on true
  where m.team_id = p_team
  order by h.n, h.last nulls first, m.position
  limit 1;
  update routing_teams set next_position = coalesce(pos, 0) where id = p_team;
end;
$$;

-- Set a team's members to a list in order: those kept keep their position, new ones take the next, gone ones leave.
create or replace function public.routing_team_set_members(p_ws uuid, p_team uuid, p_members jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  changed boolean := false;
  m jsonb;
  v_user uuid;
  w int;
  n int;
begin
  with want as (select (x->>'user')::uuid as wu from jsonb_array_elements(coalesce(p_members, '[]')) x where x->>'user' ~ '^[0-9a-f-]{36}$'),
  gone as (delete from routing_team_members t where t.team_id = p_team and t.user_id not in (select wu from want) returning 1)
  select count(*) > 0 into changed from gone;
  for m in select x from jsonb_array_elements(coalesce(p_members, '[]')) x loop
    continue when not (m->>'user' ~ '^[0-9a-f-]{36}$');
    v_user := (m->>'user')::uuid;
    w := greatest(1, least(10, coalesce((m->>'weight')::int, 1)));
    update routing_team_members set weight = w where team_id = p_team and user_id = v_user and weight <> w;
    get diagnostics n = row_count;
    if n > 0 then changed := true; end if;
    if not exists (select 1 from routing_team_members where team_id = p_team and user_id = v_user) then
      insert into routing_team_members (team_id, workspace_id, user_id, position, weight)
      values (p_team, p_ws, v_user, coalesce((select max(position) + 1 from routing_team_members where team_id = p_team), 0), w);
      changed := true;
    end if;
  end loop;
  if changed then update routing_teams set revision = revision + 1, updated_at = now() where id = p_team; end if;
  return changed;
end;
$$;

/*
 * Make sure every queue a router body names has its team (the body's queue id is the team's key), with the body's
 * members. A queue the last build split off per rule (q_<rule id>, q_default) that is identical to another queue of
 * the body (members, order, weights, method, strict, hours) shares that queue's team. A key whose team is shared and
 * whose members now differ gets a team of its own. New teams start where the old rule would have gone next.
 */
create or replace function public.routing_sync_teams(p_ws uuid, p_body jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  q jsonb;
  twin jsonb;
  tid uuid;
  shared int;
  per_rule boolean;
  made int := 0;
  rule_stems text[];
begin
  if jsonb_typeof(p_body->'queues') is distinct from 'array' then return 0; end if;
  rule_stems := array(select left(regexp_replace('q_' || (r->>'id'), '[^a-zA-Z0-9_-]', '', 'g'), 36)
                      from jsonb_array_elements(case when jsonb_typeof(p_body->'rules'->'list') = 'array' then p_body->'rules'->'list' else '[]' end) r
                      where r->>'id' ~ '^[A-Za-z0-9_-]{1,40}$');
  -- Queues the last build made per rule go last, so the queue they were copied from has its team first.
  for q in
    select x from jsonb_array_elements(p_body->'queues') with ordinality t(x, i)
    where x->>'id' ~ '^[A-Za-z0-9_-]{1,40}$'
    order by (x->>'id' ~ '^q_default(_[0-9]+)?$' or regexp_replace(x->>'id', '_[0-9]+$', '') = any(rule_stems) or x->>'id' = any(rule_stems)), i
  loop
    per_rule := q->>'id' ~ '^q_default(_[0-9]+)?$' or q->>'id' = any(rule_stems) or regexp_replace(q->>'id', '_[0-9]+$', '') = any(rule_stems);
    select team_id into tid from routing_team_keys where workspace_id = p_ws and key = q->>'id';
    if tid is not null then
      select count(*) into shared from routing_team_keys where team_id = tid;
      if shared > 1 and coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight) order by m.position) from routing_team_members m where m.team_id = tid), '[]')
                        is distinct from (select coalesce(jsonb_agg(jsonb_build_object('user', x->>'user', 'weight', greatest(1, least(10, coalesce((x->>'weight')::int, 1))))), '[]') from jsonb_array_elements(coalesce(q->'members', '[]')) x) then
        -- Its members changed while the team is shared: this key gets its own team; the others keep theirs.
        delete from routing_team_keys where workspace_id = p_ws and key = q->>'id';
        tid := null;
      else
        update routing_teams set name = left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), method = coalesce(nullif(q->>'method', ''), 'rr'),
          strict = coalesce((q->>'strict')::boolean, false), hours_only = coalesce((q->>'hoursOnly')::boolean, false), updated_at = now()
        where id = tid and shared = 1
          and (name, method, strict, hours_only) is distinct from (left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), coalesce(nullif(q->>'method', ''), 'rr'), coalesce((q->>'strict')::boolean, false), coalesce((q->>'hoursOnly')::boolean, false));
        if shared = 1 then perform routing_team_set_members(p_ws, tid, q->'members'); end if;
        continue;
      end if;
    end if;
    if per_rule then
      select y into twin from jsonb_array_elements(p_body->'queues') y
      where y->>'id' <> q->>'id' and y->'members' = q->'members' and coalesce(y->>'method', 'rr') = coalesce(q->>'method', 'rr')
        and coalesce((y->>'strict')::boolean, false) = coalesce((q->>'strict')::boolean, false) and coalesce((y->>'hoursOnly')::boolean, false) = coalesce((q->>'hoursOnly')::boolean, false)
        and exists (select 1 from routing_team_keys k where k.workspace_id = p_ws and k.key = y->>'id')
      limit 1;
      if twin is not null then
        select team_id into tid from routing_team_keys where workspace_id = p_ws and key = twin->>'id';
        insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, q->>'id', tid) on conflict do nothing;
        continue;
      end if;
    end if;
    insert into routing_teams (workspace_id, name, method, strict, hours_only)
    values (p_ws, left(coalesce(nullif(btrim(q->>'name'), ''), 'Team'), 80), coalesce(nullif(q->>'method', ''), 'rr'), coalesce((q->>'strict')::boolean, false), coalesce((q->>'hoursOnly')::boolean, false))
    returning id into tid;
    insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, q->>'id', tid);
    perform routing_team_set_members(p_ws, tid, q->'members');
    update routing_teams set revision = 1 where id = tid;
    perform routing_team_seed(p_ws, tid);
    made := made + 1;
  end loop;
  return made;
end;
$$;

/*
 * Create or change a team (Section 12): its name, method and ordered members, saved at once (an operational change:
 * it affects the next assignment without a publish). p_revision: the team revision the editor read. p_key: the id
 * rules use for it (made from the team's id when new). A new member takes the next position; the queue is never
 * restarted. Returns {id, key, revision}.
 */
create or replace function public.routing_team_save(p_ws uuid, p_team uuid, p_name text, p_method text, p_members jsonb, p_revision int default null, p_key text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t routing_teams%rowtype;
  k text;
  n text := btrim(coalesce(p_name, ''));
  bad int;
begin
  if length(n) not between 1 and 80 then raise exception 'invalid_configuration: name'; end if;
  if coalesce(p_method, 'rr') not in ('rr', 'weighted', 'load') then raise exception 'invalid_configuration: method'; end if;
  if jsonb_typeof(coalesce(p_members, '[]')) <> 'array' then raise exception 'invalid_configuration: members'; end if;
  select count(*) into bad from jsonb_array_elements(coalesce(p_members, '[]')) x
  where not (x->>'user' ~ '^[0-9a-f-]{36}$') or not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id::text = x->>'user');
  if bad > 0 then raise exception 'invalid_configuration: member'; end if;
  if p_team is null then
    insert into routing_teams (workspace_id, name, method) values (p_ws, n, coalesce(p_method, 'rr')) returning * into t;
    k := coalesce(p_key, 't_' || replace(left(t.id::text, 13), '-', ''));
    insert into routing_team_keys (workspace_id, key, team_id) values (p_ws, k, t.id);
    perform routing_team_set_members(p_ws, t.id, p_members);
    update routing_teams set revision = 1 where id = t.id returning * into t;
  else
    select * into t from routing_teams where id = p_team and workspace_id = p_ws for update;
    if t.id is null then raise exception 'not_found: team'; end if;
    if p_revision is not null and t.revision <> p_revision then raise exception 'draft_conflict: team'; end if;
    if (t.name, t.method) is distinct from (n, coalesce(p_method, 'rr')) then
      update routing_teams set name = n, method = coalesce(p_method, 'rr'), revision = revision + 1, updated_at = now() where id = t.id;
    end if;
    perform routing_team_set_members(p_ws, t.id, p_members);
    select * into t from routing_teams where id = t.id;
    select key into k from routing_team_keys where team_id = t.id order by key limit 1;
  end if;
  return jsonb_build_object('id', t.id, 'key', k, 'revision', t.revision, 'next', t.next_position);
end;
$$;

-- Policies -------------------------------------------------------------------------------------------------------

/*
 * The workspace's default policy, made from its router when there's none yet: named Inbound, with every router
 * version (same numbers, same bodies), the draft and its revision. Returns null for a workspace with no router.
 */
create or replace function public.routing_default_policy(p_ws uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  r routers%rowtype;
begin
  select id into pid from routing_policies where workspace_id = p_ws and is_default;
  if pid is null then
    select * into r from routers where workspace_id = p_ws;
    if r.workspace_id is null then return null; end if;
    insert into routing_policies (workspace_id, name, is_default, draft, draft_base, draft_revision, draft_by, draft_at, active_version, created_at)
    values (p_ws, 'Inbound', true, r.draft, r.draft_base, r.draft_revision, r.draft_by, r.draft_at, r.live_version, r.created_at)
    on conflict do nothing
    returning id into pid;
    if pid is null then select id into pid from routing_policies where workspace_id = p_ws and is_default; end if;
  end if;
  -- Versions published the old way (or before this ran) are copied as they are; the pointer follows the router's.
  insert into routing_policy_versions (policy_id, workspace_id, version, config, note, published_by, published_at)
  select pid, v.workspace_id, v.version, v.body, v.note, v.published_by, v.published_at
  from router_versions v where v.workspace_id = p_ws
    and not exists (select 1 from routing_policy_versions x where x.policy_id = pid and x.version = v.version);
  update routing_policies p set active_version = r2.live_version
  from routers r2 where p.id = pid and r2.workspace_id = p_ws and r2.live_version is not null and p.active_version is distinct from r2.live_version
    and r2.live_version > coalesce(p.active_version, 0);
  return pid;
end;
$$;

-- Create a policy. The same create key again (a double click, a retry) returns the first one.
create or replace function public.routing_policy_create(p_ws uuid, p_name text, p_config jsonb, p_key text, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  n text := btrim(coalesce(p_name, ''));
begin
  if length(n) not between 1 and 80 then raise exception 'invalid_configuration: name'; end if;
  if p_config is not null and jsonb_typeof(p_config) <> 'object' then raise exception 'invalid_configuration: config'; end if;
  if p_key is not null then
    select id into pid from routing_policies where workspace_id = p_ws and create_key = p_key;
    if pid is not null then return jsonb_build_object('id', pid, 'created', false); end if;
  end if;
  insert into routing_policies (workspace_id, name, draft, draft_revision, draft_by, draft_at, create_key, created_by)
  values (p_ws, n, p_config, 1, p_user, now(), p_key, p_user)
  on conflict (workspace_id, create_key) where create_key is not null do nothing
  returning id into pid;
  if pid is null then
    select id into pid from routing_policies where workspace_id = p_ws and create_key = p_key;
    return jsonb_build_object('id', pid, 'created', false);
  end if;
  return jsonb_build_object('id', pid, 'created', true);
end;
$$;

-- Mirror the default policy's draft onto the router row the older screens read.
create or replace function public.routing_mirror_draft(p_policy uuid) returns void
language sql security definer set search_path = public as $$
  update routers r set draft = p.draft, draft_base = p.draft_base, draft_revision = p.draft_revision, draft_by = p.draft_by, draft_at = p.draft_at, updated_at = now()
  from routing_policies p where p.id = p_policy and p.is_default and r.workspace_id = p.workspace_id;
$$;

/*
 * Save a policy's draft when it's still the revision the editor read (null: whatever is there). Returns the new
 * revision, or raises draft_conflict. A draft never touches the live version.
 */
create or replace function public.routing_draft_save(p_ws uuid, p_policy uuid, p_config jsonb, p_revision int, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  p routing_policies%rowtype;
begin
  if jsonb_typeof(p_config) is distinct from 'object' then raise exception 'invalid_configuration: config'; end if;
  select * into p from routing_policies where id = p_policy and workspace_id = p_ws for update;
  if p.id is null then raise exception 'not_found'; end if;
  if p.archived_at is not null then raise exception 'invalid_configuration: archived'; end if;
  if p_revision is not null and p.draft_revision <> p_revision then raise exception 'draft_conflict'; end if;
  update routing_policies set draft = p_config, draft_base = case when p.draft is null then p.active_version else coalesce(p.draft_base, p.active_version) end,
    draft_revision = p.draft_revision + 1, draft_by = p_user, draft_at = now(), updated_at = now()
  where id = p.id;
  perform routing_mirror_draft(p.id);
  return p.draft_revision + 1;
end;
$$;

create or replace function public.routing_draft_drop(p_ws uuid, p_policy uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  rev int;
begin
  update routing_policies set draft = null, draft_base = null, draft_revision = draft_revision + 1, updated_at = now()
  where id = p_policy and workspace_id = p_ws returning draft_revision into rev;
  if rev is null then raise exception 'not_found'; end if;
  perform routing_mirror_draft(p_policy);
  return rev;
end;
$$;

/*
 * Publish one release (Section 17): the policy's config as its next immutable version, plus any staged source
 * connections, in one transaction. p_revision: the draft revision the person reviewed (a newer draft is a conflict,
 * never an overwrite); null publishes p_config as it is (a restore). p_key: the operation id; the same key again
 * returns the version it made instead of making another. p_sources: [{id, revision}] staged connections to turn on,
 * each still at the staged revision the person reviewed. The default policy's version is mirrored onto the router.
 */
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
  -- Staged connections, checked and turned on with the version.
  for s in select x from jsonb_array_elements(coalesce(p_sources, '[]')) x loop
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
    draft = case when p_clear_draft then null else draft end, draft_base = case when p_clear_draft then null else draft_base end,
    draft_revision = draft_revision + case when p_clear_draft then 1 else 0 end
  where id = p.id;
  -- The teams the body names, as the body has them (the current Routing screens edit members in the body).
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

-- A publish whose answer was lost (Section 17): the version its operation id made, if it made one.
create or replace function public.routing_publish_lookup(p_policy uuid, p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', version, 'repeat', true) from routing_policy_versions where policy_id = p_policy and publish_key = p_key;
$$;

-- A policy's live version: its config, number, and whether the workspace has routing paused.
create or replace function public.routing_live(p_ws uuid, p_policy uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('policy_id', p.id, 'version', v.version, 'body', v.config,
                            'paused', coalesce((select r.paused_at is not null from routers r where r.workspace_id = p_ws), false))
  from routing_policies p join routing_policy_versions v on v.policy_id = p.id and v.version = p.active_version
  where p.id = p_policy and p.workspace_id = p_ws and p.archived_at is null;
$$;

/*
 * One policy for its editor and the publish check: name, state, the draft and its revision, the live version and
 * config, and its sources (live and staged).
 */
create or replace function public.routing_policy_get(p_ws uuid, p_policy uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'is_default', p.is_default, 'archived', p.archived_at is not null,
    'draft', p.draft, 'draft_revision', p.draft_revision, 'draft_base', p.draft_base,
    'active_version', p.active_version,
    'live', (select v.config from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version),
    'sources', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'kind', s.kind, 'form_id', s.form_id, 'name', coalesce(f.name, 'Internal handoff'),
                                                             'enabled', s.enabled, 'policy_id', coalesce(s.policy_id, case when p.is_default and s.follows_default then p.id end),
                                                             'follows_default', s.follows_default, 'outcome', s.outcome, 'meeting_type_id', s.meeting_type_id,
                                                             'live_revision', s.live_revision, 'draft', s.draft, 'draft_revision', s.draft_revision) order by f.name)
                         from routing_sources s left join forms f on f.id = s.form_id
                         where s.workspace_id = p.workspace_id
                           and (s.policy_id = p.id or nullif(s.draft->>'policy_id', '')::uuid = p.id or (p.is_default and s.follows_default))), '[]'))
  from routing_policies p where p.id = p_policy and p.workspace_id = p_ws;
$$;

-- The workspace's teams by key, with members in position order (the publish check and the tester read them).
create or replace function public.routing_team_list(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(k.key, jsonb_build_object('id', t.id, 'name', t.name, 'method', t.method, 'strict', t.strict, 'hoursOnly', t.hours_only,
    'next', t.next_position, 'revision', t.revision,
    'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight, 'position', m.position) order by m.position)
                         from routing_team_members m where m.team_id = t.id), '[]'))), '{}')
  from routing_team_keys k join routing_teams t on t.id = k.team_id
  where k.workspace_id = p_ws and t.archived_at is null;
$$;

-- The old calls, now the default policy's (the current Routing screens, the jobs and the tests use them) ------------

create or replace function public.router_draft_save(p_ws uuid, p_body jsonb, p_revision int, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  pid := routing_default_policy(p_ws);
  begin
    return routing_draft_save(p_ws, pid, p_body, p_revision, p_user);
  exception when others then
    if sqlerrm like 'draft_conflict%' then raise exception 'conflict'; end if;
    raise;
  end;
end;
$$;

create or replace function public.router_draft_drop(p_ws uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  pid uuid := routing_default_policy(p_ws);
begin
  if pid is not null then perform routing_draft_drop(p_ws, pid); end if;
end;
$$;

create or replace function public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  pid := routing_default_policy(p_ws);
  return (routing_publish(p_ws, pid, p_body, p_note, p_user, null, null, p_clear_draft, '[]')->>'version')::int;
end;
$$;

-- The live body: the default policy's active version; a router written straight to its tables is read as it is.
create or replace function public.router_live(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('version', v.version, 'body', v.config, 'paused', r.paused_at is not null, 'policy_id', p.id)
     from routing_policies p join routing_policy_versions v on v.policy_id = p.id and v.version = p.active_version
     join routers r on r.workspace_id = p.workspace_id and r.live_version = p.active_version
     where p.workspace_id = p_ws and p.is_default),
    (select jsonb_build_object('version', v.version, 'body', v.body, 'paused', r.paused_at is not null)
     from routers r join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
     where r.workspace_id = p_ws));
$$;

create or replace function public.router_live_screen(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(p_ws) then (select x - 'paused' - 'policy_id' from router_live(p_ws) x) end;
$$;

-- Sources --------------------------------------------------------------------------------------------------------

/*
 * What a form's next real submission runs (Section 17): its connection's live revision and the policy's active
 * version, resolved together. A form with no connection row uses the workspace's default policy, as forms always
 * have; a connection that's off, or a policy with nothing live, routes nothing.
 */
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
                                 'meeting_type_id', s.meeting_type_id, 'mappings', s.mappings, 'completion', s.completion, 'no_slots', s.no_slots),
    'live', live);
end;
$$;

/*
 * Stage a change to a connection (Forms and Routing edit the same row): the policy, outcome, meeting type, mappings
 * and settings it should have after the next publish. p_revision: the staged revision the editor read. Everything it
 * names must be in the workspace.
 */
create or replace function public.routing_source_stage(p_ws uuid, p_form uuid, p_draft jsonb, p_revision int, p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s routing_sources%rowtype;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' then raise exception 'invalid_configuration: draft'; end if;
  if not exists (select 1 from forms where id = p_form and workspace_id = p_ws) then raise exception 'not_found: form'; end if;
  if nullif(p_draft->>'policy_id', '') is not null and not exists (select 1 from routing_policies where id = (p_draft->>'policy_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: policy';
  end if;
  if nullif(p_draft->>'meeting_type_id', '') is not null and not exists (select 1 from meeting_types where id = (p_draft->>'meeting_type_id')::uuid and workspace_id = p_ws) then
    raise exception 'not_found: meeting type';
  end if;
  if coalesce(p_draft->>'outcome', 'assign_only') not in ('assign_only', 'assign_and_calendar') then raise exception 'invalid_configuration: outcome'; end if;
  if p_draft->>'outcome' = 'assign_and_calendar' and coalesce((p_draft->>'enabled')::boolean, true) and nullif(p_draft->>'meeting_type_id', '') is null then
    raise exception 'invalid_configuration: meeting type';
  end if;
  if p_draft ? 'mappings' and jsonb_typeof(p_draft->'mappings') <> 'array' then raise exception 'invalid_configuration: mappings'; end if;
  insert into routing_sources (workspace_id, kind, form_id) values (p_ws, 'form', p_form) on conflict do nothing;
  select * into s from routing_sources where form_id = p_form and kind = 'form' for update;
  if p_revision is not null and s.draft_revision <> p_revision then raise exception 'draft_conflict: source'; end if;
  update routing_sources set draft = p_draft, draft_revision = draft_revision + 1, updated_by = p_user, updated_at = now() where id = s.id;
  return jsonb_build_object('id', s.id, 'revision', s.draft_revision + 1, 'live_revision', s.live_revision, 'live_policy', s.policy_id);
end;
$$;

-- Commit (Section 22) --------------------------------------------------------------------------------------------

/*
 * Write one routing decision, once. In order: claim the request key (a key seen before returns its first result);
 * lock the contact and read its owner before anything is written (a different owner than the caller expected is
 * 'stale': decide again); for a team pick, lock the team, then the candidates' quota rows in id order (one order for
 * every caller, so two teams sharing a person never deadlock), and take the first eligible member from the team's
 * next position; check a new owner's cap on the locked count; then write the run and trace, the assignment event, the
 * quota count, the queue's next position, the owner (with field history and the CRM owner link), the review item for
 * a held or unallocated lead, the timeline line and the alert job. All in this one transaction: if anything fails,
 * nothing is counted, no turn is taken. Keeping the owner a contact already has costs no count and no turn.
 *
 * p: {ws, contact, key, reason, decision: {kind, user, by, queue, rule, reason}, steps, trace, facts, ms, by_user,
 *     policy_id, policy_version, source_id, source_revision, parent_run, set_company, reviewer, booking_state,
 *     expect_owner?, pick?: {queue, method, candidates: [{user, weight}]}, recheck: {away, caps}}
 */
create or replace function public.routing_commit(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ws uuid := nullif(p->>'ws', '')::uuid;
  cid uuid := nullif(p->>'contact', '')::uuid;
  k text := p->>'key';
  d jsonb := coalesce(p->'decision', '{}');
  kind text := d->>'kind';
  by_ text := d->>'by';
  owner uuid := nullif(d->>'user', '')::uuid;
  qkey text := d->>'queue';
  ex router_runs%rowtype;
  c contacts%rowtype;
  t routing_teams%rowtype;
  prev uuid;
  st jsonb;
  qr routing_quota%rowtype;
  wk int;
  eff text := 'none';
  counted boolean := false;
  advanced boolean := false;
  pos int;
  rid uuid;
  crm text;
  cands uuid[];
  m record;
  reviewer uuid;
  rreason text;
  steps jsonb := coalesce(p->'steps', '[]');
  trace jsonb := p->'trace';
  away boolean := coalesce((p->'recheck'->>'away')::boolean, by_ in ('queue', 'fallback'));
  caps boolean := coalesce((p->'recheck'->>'caps')::boolean, by_ = 'queue');
  state text;
  pk jsonb;
  e jsonb;
  out_steps jsonb := '[]';
begin
  if ws is null or cid is null or k is null or length(k) > 200 or kind is null or kind not in ('owner', 'held', 'unassigned') then raise exception 'routing_commit: bad request'; end if;
  if kind = 'owner' and owner is null and not (p ? 'pick') then raise exception 'routing_commit: no owner'; end if;

  -- 1. The request identity.
  perform pg_advisory_xact_lock(hashtextextended('routing-req:' || ws::text || ':' || k, 0));
  select * into ex from router_runs where workspace_id = ws and key = k;
  if ex.id is not null then
    return jsonb_build_object('status', 'dup', 'id', ex.id, 'kind', ex.kind, 'owner', ex.owner, 'by', ex."by", 'queue', ex.queue_id, 'rule', ex.rule_id,
                              'effect', ex.effect, 'assignment_state', ex.assignment_state, 'policy_version', ex.policy_version);
  end if;

  -- 2. The contact and its owner, read before anything is written.
  select * into c from contacts where id = cid and workspace_id = ws and deleted_at is null for update;
  if c.id is null then return jsonb_build_object('status', 'gone'); end if;
  prev := coalesce(c.owner_user_id, router_owner_user(ws, c.owner_crm_id));
  if p ? 'expect_owner' and prev is distinct from nullif(p->>'expect_owner', '')::uuid then
    return jsonb_build_object('status', 'stale', 'reason', 'ownership_changed', 'owner', prev);
  end if;

  -- 3. Who, checked again under the locks.
  if kind = 'owner' and p ? 'pick' then
    select tm.* into t from routing_team_keys tk join routing_teams tm on tm.id = tk.team_id
    where tk.workspace_id = ws and tk.key = p->'pick'->>'queue' for update of tm;
    if t.id is null then
      -- A queue with no team yet (a body written straight to the router's tables): the old pick from fresh counts.
      pk := router_pick(ws, p->'pick');
      if pk is null then return jsonb_build_object('status', 'stale', 'reason', 'no_eligible_recipient'); end if;
      owner := (pk->>'user')::uuid;
      steps := router_steps_pick(steps, qkey, owner, pk);
    else
      cands := array(select (x->>'user')::uuid from jsonb_array_elements(coalesce(p->'pick'->'candidates', '[]')) x where x->>'user' ~ '^[0-9a-f-]{36}$');
      for m in select u from unnest(cands) u order by u loop
        perform routing_quota_current(ws, m.u);
      end loop;
      perform 1 from routing_quota q where q.workspace_id = ws and q.user_id = any(cands) and q.period_start <= now() and q.period_end > now() order by q.user_id for update;
      owner := null;
      for m in
        select tmm.user_id u, tmm.position
        from routing_team_members tmm
        where tmm.team_id = t.id and tmm.user_id = any(cands)
        order by
          case when t.method = 'rr' then (tmm.position < t.next_position)::int else 0 end,
          case when t.method = 'load' then (router_rep_facts(ws, tmm.user_id)->>'meetings_week')::numeric
               when t.method = 'weighted' then (select count(*) from router_runs r where r.workspace_id = ws and r.owner = tmm.user_id and r.kind = 'owner' and r.undone_at is null
                                                  and r.created_at > now() - interval '30 days' and (r.team_id = t.id or r.queue_id in (select key from routing_team_keys where team_id = t.id)))::numeric / tmm.weight
               else 0 end,
          tmm.position
      loop
        st := routing_member_state(ws, m.u);
        continue when not (st->>'member')::boolean or (st->>'paused')::boolean or (st->>'out')::boolean;
        if m.u is distinct from prev then
          qr := routing_quota_current(ws, m.u);
          wk := (routing_quota_used(ws, m.u)->>'week')::int;
          continue when (st->>'cap_day') is not null and qr.n >= (st->>'cap_day')::int;
          continue when (st->>'cap_week') is not null and wk >= (st->>'cap_week')::int;
        end if;
        owner := m.u;
        pos := m.position;
        exit;
      end loop;
      if owner is null then return jsonb_build_object('status', 'stale', 'reason', 'no_eligible_recipient'); end if;
    end if;
  elsif kind = 'owner' then
    st := routing_member_state(ws, owner);
    if not (st->>'member')::boolean then return jsonb_build_object('status', 'stale', 'reason', 'not_member', 'user', owner); end if;
    if away and ((st->>'paused')::boolean or (st->>'out')::boolean) then return jsonb_build_object('status', 'stale', 'reason', 'away', 'user', owner); end if;
    if caps and owner is distinct from prev then
      qr := routing_quota_current(ws, owner);
      select * into qr from routing_quota where workspace_id = ws and user_id = owner and period_start = qr.period_start for update;
      wk := (routing_quota_used(ws, owner)->>'week')::int;
      if ((st->>'cap_day') is not null and qr.n >= (st->>'cap_day')::int) or ((st->>'cap_week') is not null and wk >= (st->>'cap_week')::int) then
        return jsonb_build_object('status', 'stale', 'reason', 'cap', 'user', owner);
      end if;
    end if;
  end if;

  if kind = 'owner' then
    eff := case when owner is not distinct from prev then 'retained' else 'new' end;
    counted := eff = 'new';
    advanced := eff = 'new' and t.id is not null and t.method = 'rr';
  end if;
  state := case kind when 'owner' then 'assigned' when 'held' then 'held_for_review' else 'unassigned_needs_review' end;

  -- The run's lines and trace say who was taken under the lock.
  if kind = 'owner' and qkey is not null and t.id is not null then
    for e in select x from jsonb_array_elements(steps) x loop
      if e->>'step' = 'queue' and e->'queue'->>'id' = qkey then
        e := e || jsonb_build_object('picked', owner, 'next', t.next_position) || case when eff = 'retained' then '{"retained": true}'::jsonb else '{}'::jsonb end;
      elsif e->>'step' in ('fallback', 'backup') and e ? 'picked' then
        e := e || jsonb_build_object('picked', owner);
      end if;
      out_steps := out_steps || jsonb_build_array(e);
    end loop;
    steps := out_steps;
  end if;
  if jsonb_typeof(trace) = 'object' then
    trace := jsonb_set(jsonb_set(trace, '{assignment,recipient}', coalesce(to_jsonb(owner), 'null')), '{assignment,effect}', to_jsonb(eff));
    trace := jsonb_set(trace, '{assignment,previousOwner}', coalesce(to_jsonb(prev), 'null'));
    if kind = 'owner' then trace := jsonb_set(trace, '{distribution,suggested}', to_jsonb(owner)); end if;
  end if;

  -- 4. The run, the assignment event, the count and the queue.
  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, by_user,
                           policy_id, policy_version, source_id, source_revision, parent_run_id, assignment_state, booking_state, sync_state, previous_owner, effect, trace, team_id)
  values (ws, c.id, k, coalesce(p->>'reason', 'api'), nullif(p->>'policy_version', '')::int, kind, case when kind = 'owner' then owner end, case when kind = 'owner' then by_ end,
          case when kind = 'owner' then qkey end, d->>'rule', steps, coalesce(p->'facts', '{}'), nullif(p->>'ms', '')::int, nullif(p->>'by_user', '')::uuid,
          nullif(p->>'policy_id', '')::uuid, nullif(p->>'policy_version', '')::int, nullif(p->>'source_id', '')::uuid, nullif(p->>'source_revision', '')::int,
          nullif(p->>'parent_run', '')::uuid, state, coalesce(nullif(p->>'booking_state', ''), 'not_requested'), 'not_required', prev, eff, trace, t.id)
  returning id into rid;

  if kind = 'owner' then
    if counted then
      qr := routing_quota_current(ws, owner);
      update routing_quota set n = n + 1 where workspace_id = ws and user_id = owner and period_start = qr.period_start;
    end if;
    if advanced then update routing_teams set next_position = pos + 1 where id = t.id; end if;
    insert into routing_assignments (workspace_id, run_id, contact_id, user_id, previous_owner, team_id, counted, advanced, quota_period)
    values (ws, rid, c.id, owner, prev, t.id, counted, advanced, case when counted then qr.period_start end);

    -- 5. The owner. Retention writes nothing; a company's owner is never changed by a contact's assignment unless asked.
    if c.owner_user_id is distinct from owner then
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
      values (ws, 'contact', c.id, 'owner', to_jsonb(c.owner_user_id), to_jsonb(owner), c.field_sources->'owner', 'routing', nullif(p->>'by_user', '')::uuid);
    end if;
    crm := case when router_crm_user(ws, c.owner_crm_id) = owner then c.owner_crm_id
                else (select l.crm_owner_id from crm_owner_links l where l.workspace_id = ws and l.user_id = owner order by l.updated_at desc limit 1) end;
    update contacts set owner_user_id = owner, owner_crm_id = coalesce(crm, owner_crm_id), route_status = null,
      field_sources = case when c.owner_user_id is distinct from owner then coalesce(field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'routing', 'at', now())) else field_sources end,
      updated_at = case when c.owner_user_id is distinct from owner or c.route_status is not null then now() else updated_at end
    where id = c.id and (owner_user_id is distinct from owner or route_status is not null or owner_crm_id is distinct from coalesce(crm, owner_crm_id));
    if coalesce((p->>'set_company')::boolean, false) and c.company_id is not null then
      update companies set owner_user_id = owner, updated_at = now() where id = c.company_id and owner_user_id is null and owner_crm_id is null;
    end if;
  else
    -- Held or unallocated: the existing owner stays; one review item with a named reviewer.
    update contacts set route_status = kind where id = c.id;
    reviewer := nullif(p->>'reviewer', '')::uuid;
    if reviewer is null or not exists (select 1 from workspace_members w where w.workspace_id = ws and w.user_id = reviewer) then
      select w.user_id into reviewer from workspace_members w where w.workspace_id = ws order by (w.role = 'owner') desc, w.created_at limit 1;
    end if;
    rreason := coalesce(d->>'reason', case when kind = 'held' then case when d->'signals' ? 'rule' then 'rule' else 'spam' end else 'no_eligible_recipient' end);
    if reviewer is not null then
      insert into routing_reviews (workspace_id, run_id, contact_id, submission_id, policy_id, reason, reviewer)
      values (ws, rid, c.id, nullif(p->>'submission', '')::uuid, nullif(p->>'policy_id', '')::uuid, rreason, reviewer);
    end if;
  end if;

  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (ws, c.id, case kind when 'owner' then 'lead.routed' when 'held' then 'lead.held' else 'lead.unassigned' end,
          jsonb_strip_nulls(jsonb_build_object('run_id', rid, 'owner', case when kind = 'owner' then owner end, 'by', by_, 'queue', qkey, 'rule', d->>'rule',
                                               'reason', p->>'reason', 'effect', eff, 'previous_owner', prev)), 'routing');
  -- 6. Downstream work goes through the jobs queue, run after this commits.
  if kind <> 'held' then
    perform enqueue_job(ws, 'router_alert', rid::text, jsonb_build_object('run', rid), 0, 5);
  end if;
  return jsonb_build_object('status', 'ok', 'id', rid, 'kind', kind, 'owner', case when kind = 'owner' then owner end, 'effect', eff, 'steps', steps,
                            'assignment_state', state, 'previous_owner', prev, 'counted', counted, 'advanced', advanced);
end;
$$;

-- The old commit call, kept for its callers (manual assign, the response-time job): the same committer.
create or replace function public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version int, p_result jsonb, p_steps jsonb, p_facts jsonb,
  p_ms int, p_set_company boolean default false, p_by_user uuid default null, p_pick jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return routing_commit(jsonb_strip_nulls(jsonb_build_object(
    'ws', p_ws, 'contact', p_contact, 'key', p_key, 'reason', p_reason, 'policy_version', p_version, 'decision', p_result, 'steps', p_steps, 'facts', p_facts,
    'ms', p_ms, 'set_company', p_set_company, 'by_user', p_by_user, 'pick', p_pick,
    'policy_id', (select id from routing_policies where workspace_id = p_ws and is_default),
    'recheck', jsonb_build_object('away', p_result->>'by' in ('queue', 'fallback'), 'caps', p_result->>'by' = 'queue'))));
end;
$$;

-- Facts ----------------------------------------------------------------------------------------------------------

/*
 * router_facts_full with what policies add: each team the body names as the database has it (members in position
 * order and the next position; their members' facts too), counts from the quota (committed new allocations), and
 * how the company was found (the contact's own link, one domain match, several, or none).
 */
create or replace function public.routing_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text default null,
  p_email_class text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb;
  teams jsonb;
  users uuid[];
  c contacts%rowtype;
  dom text;
  n int;
begin
  select coalesce(jsonb_object_agg(tk.key, jsonb_build_object(
           'id', tm.id, 'name', tm.name, 'method', tm.method, 'strict', tm.strict, 'hoursOnly', tm.hours_only, 'next', tm.next_position,
           'members', coalesce((select jsonb_agg(jsonb_build_object('user', m.user_id, 'weight', m.weight, 'position', m.position) order by m.position)
                                from routing_team_members m where m.team_id = tm.id), '[]'))), '{}')
  into teams
  from routing_team_keys tk join routing_teams tm on tm.id = tk.team_id
  where tk.workspace_id = p_ws and tk.key = any(coalesce(p_queues, '{}')) and tm.archived_at is null;
  users := array(select distinct u from unnest(coalesce(p_users, '{}') || array(
             select (m->>'user')::uuid from jsonb_each(teams) t(k, v), jsonb_array_elements(v->'members') m)) u);
  f := router_facts_full(p_ws, p_contact, p_key, users, p_queues, p_email, p_email_class);
  if f is null or f ? 'existing' then return f; end if;
  f := jsonb_set(f, '{reps}', coalesce((select jsonb_object_agg(r.key, r.value || routing_quota_used(p_ws, r.key::uuid)) from jsonb_each(f->'reps') r), '{}'));
  select * into c from contacts where id = p_contact and workspace_id = p_ws;
  dom := f->>'domain';
  if c.company_id is not null and f->'company' is not null and f->'company' <> 'null'::jsonb then
    n := -1;
  elsif dom is null or coalesce(c.email_class, p_email_class, 'work') = 'free' then
    n := 0;
  else
    -- The email's own domain is one match; otherwise every parent domain that is a company is a possible match.
    select case when bool_or(domain = dom) then 1 else count(*) end into n
    from companies where workspace_id = p_ws and deleted_at is null and merged_into is null and (domain = dom or dom like '%.' || domain);
  end if;
  return f || jsonb_build_object('teams', teams, 'company_match', jsonb_build_object(
    'kind', case when n = -1 then 'linked' when n = 0 then 'none' when n = 1 then 'domain' else 'ambiguous' end, 'count', greatest(n, 1) * (n <> 0)::int));
end;
$$;

-- Follow-ups and booking state -----------------------------------------------------------------------------------

/*
 * One follow-up task per run and purpose (Section 19), for the run's owner on its contact: a retried no-slots
 * lookup reuses it. Returns the task's id, or null when the run has no owner or contact.
 */
create or replace function public.routing_followup(p_ws uuid, p_run uuid, p_purpose text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
  k text := 'routing:' || p_run::text || ':' || p_purpose;
  tid uuid;
begin
  if p_purpose not in ('schedule', 'abandoned') then raise exception 'routing_followup: unknown purpose'; end if;
  select * into r from router_runs where id = p_run and workspace_id = p_ws;
  if r.id is null or r.owner is null or r.contact_id is null then return null; end if;
  insert into tasks (workspace_id, object, record_id, title, due, assignee, dedupe_key)
  values (p_ws, 'contact', r.contact_id, case p_purpose when 'schedule' then 'Arrange a meeting time' else 'Follow up on the unfinished booking' end, current_date, r.owner, k)
  on conflict (workspace_id, dedupe_key) where dedupe_key is not null do nothing
  returning id into tid;
  if tid is null then select id into tid from tasks where workspace_id = p_ws and dedupe_key = k; end if;
  return tid;
end;
$$;

/*
 * A run's booking state (Section 15), by the run's key. A confirmed booking resolves the run's open scheduling
 * follow-up; a confirmed or cancelled booking is never moved back to waiting by a late read.
 */
create or replace function public.routing_run_booking(p_ws uuid, p_key text, p_state text, p_reason text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  r router_runs%rowtype;
begin
  select * into r from router_runs where workspace_id = p_ws and key = p_key for update;
  if r.id is null then return null; end if;
  if r.booking_state in ('confirmed', 'cancelled') and p_state not in ('confirmed', 'cancelled') then return r.booking_state; end if;
  update router_runs set booking_state = p_state, booking_reason = p_reason where id = r.id;
  if p_state = 'confirmed' then
    update tasks set done = true, done_at = now(), updated_at = now() where workspace_id = p_ws and dedupe_key = 'routing:' || r.id::text || ':schedule' and not done;
  end if;
  return p_state;
end;
$$;

-- Moving today's router over (safe to run again) -------------------------------------------------------------------

/*
 * Move one workspace over: its router becomes the default policy (versions and draft as they are), its live queues
 * become teams, every form gets an explicit connection matching what it does today, and today's counts seed the
 * quota. Writes no owner. Runs for every workspace below; safe to run again.
 */
create or replace function public.routing_migrate(p_ws uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pid uuid;
  lv int;
  b jsonb;
  f record;
  sch jsonb;
  mt uuid;
  teams int := 0;
  sources int := 0;
begin
  -- 1. The router as the default policy; its live queues as teams.
  select live_version into lv from routers where workspace_id = p_ws;
  pid := routing_default_policy(p_ws);
  if lv is not null and not exists (select 1 from routing_team_keys k where k.workspace_id = p_ws) then
    select v.body into b from router_versions v where v.workspace_id = p_ws and v.version = lv;
    if b is not null then teams := routing_sync_teams(p_ws, b); end if;
  end if;

  -- 2. Every form gets an explicit connection: a form booking with Claritia calendar shows the assigned owner's
  -- calendar for its meeting type; every other form assigns only (an outside scheduler link works as before). Each
  -- follows the default policy, as today: it routes whenever that is live.
  for f in select fm.id, fm.version from forms fm where fm.workspace_id = p_ws and not exists (select 1 from routing_sources s where s.form_id = fm.id and s.kind = 'form') loop
    select v.body->'after'->'schedule' into sch from form_versions v where v.form_id = f.id and v.version = f.version;
    mt := case when sch->>'tool' = 'claritia' and sch->>'meetingTypeId' ~ '^[0-9a-f-]{36}$' then (select t.id from meeting_types t where t.id = (sch->>'meetingTypeId')::uuid and t.workspace_id = p_ws) end;
    insert into routing_sources (workspace_id, kind, form_id, policy_id, enabled, follows_default, outcome, meeting_type_id, completion, no_slots)
    values (p_ws, 'form', f.id, pid, true, true,
            case when mt is not null then 'assign_and_calendar' else 'assign_only' end, mt,
            jsonb_strip_nulls(jsonb_build_object('from', 'form', 'scheduler', case when sch->>'tool' is not null and sch->>'tool' <> 'claritia' then sch->>'tool' end)),
            jsonb_build_object('message', 'form', 'task', true, 'email_later', coalesce(sch->>'none', '') = 'later'))
    on conflict do nothing;
    sources := sources + 1;
  end loop;

  -- 3. Today's counts, so caps don't start again at zero: the leads each rep got today from queues and fallbacks.
  insert into routing_quota (workspace_id, user_id, period_start, period_end, tz, n)
  select x.workspace_id, x.owner, x.d0, x.d1, x.tz, x.n
  from (
    select r.workspace_id, r.owner, z.tz,
           date_trunc('day', now() at time zone z.tz) at time zone z.tz as d0,
           (date_trunc('day', now() at time zone z.tz) + interval '1 day') at time zone z.tz as d1,
           count(*) filter (where r.created_at >= date_trunc('day', now() at time zone z.tz) at time zone z.tz)::int as n
    from router_runs r
    cross join lateral (select routing_zone((select av.tz from availability av where av.workspace_id = r.workspace_id and av.user_id = r.owner)) as tz) z
    where r.workspace_id = p_ws and r.kind = 'owner' and r.undone_at is null and r.by in ('queue', 'fallback') and r.owner is not null and r.created_at > now() - interval '2 days'
    group by r.workspace_id, r.owner, z.tz
  ) x
  where x.n > 0 and not exists (select 1 from routing_quota q where q.workspace_id = x.workspace_id and q.user_id = x.owner and q.period_end > now())
  on conflict do nothing;
  return jsonb_build_object('policy', pid, 'teams', teams, 'sources', sources);
end;
$$;

do $$
declare
  w uuid;
begin
  for w in select r.workspace_id from routers r union select fm.workspace_id from forms fm loop
    perform routing_migrate(w);
  end loop;
end;
$$;

-- Grants ---------------------------------------------------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'routing_member_state(uuid, uuid)', 'routing_quota_current(uuid, uuid)', 'routing_quota_used(uuid, uuid)', 'routing_team_seed(uuid, uuid)',
    'routing_team_set_members(uuid, uuid, jsonb)', 'routing_sync_teams(uuid, jsonb)', 'routing_default_policy(uuid)', 'routing_policy_create(uuid, text, jsonb, text, uuid)',
    'routing_mirror_draft(uuid)', 'routing_draft_save(uuid, uuid, jsonb, int, uuid)', 'routing_draft_drop(uuid, uuid)',
    'routing_publish(uuid, uuid, jsonb, text, uuid, text, int, boolean, jsonb)', 'routing_live(uuid, uuid)', 'router_draft_save(uuid, jsonb, int, uuid)',
    'router_draft_drop(uuid)', 'router_publish(uuid, jsonb, text, uuid, boolean)', 'router_live(uuid)', 'routing_source_resolve(uuid)',
    'routing_source_stage(uuid, uuid, jsonb, int, uuid)', 'routing_commit(jsonb)',
    'router_commit(uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, boolean, uuid, jsonb)',
    'routing_policy_get(uuid, uuid)', 'routing_team_list(uuid)', 'routing_publish_lookup(uuid, text)',
    'routing_facts(uuid, uuid, text, uuid[], text[], text, text)', 'routing_team_save(uuid, uuid, text, text, jsonb, int, text)', 'routing_followup(uuid, uuid, text)', 'routing_run_booking(uuid, text, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.routing_versions_frozen() from public, anon, authenticated;
revoke execute on function public.routing_zone(text) from public, anon;
revoke execute on function public.router_live_screen(uuid) from public, anon;
grant execute on function public.router_live_screen(uuid) to authenticated;
