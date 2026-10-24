-- The router (docs/router.md, docs/router-ux.md): one per workspace, with a live version and a draft, reps' presence
-- and caps, every run kept with its steps and facts, CRM owners linked to teammates, and replays. The decision itself is
-- made in TypeScript (src/lib/router/engine.ts) from the facts router_facts reads; router_commit writes the result
-- under a lock on the queue, so two leads at once never take the same turn. Writes go through the app's server routes
-- and the worker with the service role; members read.

create table if not exists public.routers (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  live_version int,
  -- The draft being edited, the version it started from, and a counter for two people saving at once.
  draft jsonb check (draft is null or jsonb_typeof(draft) = 'object'),
  draft_base int,
  draft_revision int not null default 0,
  draft_by uuid,
  draft_at timestamptz,
  -- Allow and block lists take effect at once, outside versions (Held's "Allow domain" and "Block").
  allow text[] not null default '{}' check (cardinality(allow) <= 2000),
  block text[] not null default '{}' check (cardinality(block) <= 2000),
  -- The Slack channel alerts go to: its label for the screens; the webhook itself is sealed in router_secrets.
  alert_label text check (length(alert_label) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.router_secrets (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  sealed text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.router_versions (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version int not null check (version > 0),
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  note text check (length(note) <= 300),
  published_by uuid,
  published_at timestamptz not null default now(),
  primary key (workspace_id, version)
);

create table if not exists public.router_reps (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null,
  -- 'infinity' is "until I turn it back on".
  paused_until timestamptz,
  -- Out-of-office dates set by hand, in the rep's own time zone: [{from: "2026-10-28", to: "2026-10-31"}].
  out_dates jsonb not null default '[]' check (jsonb_typeof(out_dates) = 'array'),
  backup uuid,
  cap_day int check (cap_day between 1 and 1000),
  cap_week int check (cap_week between 1 and 5000),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.router_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  -- Once per lead per reason: the fill id, the import row, the API's idempotency key.
  key text not null check (length(key) <= 200),
  reason text not null check (reason in ('form', 'import', 'crm', 'api', 'again', 'let_through', 'score', 'manual')),
  version int,
  kind text not null check (kind in ('owner', 'held', 'unassigned')),
  owner uuid,
  by text check (by in ('account', 'keep', 'queue', 'fallback', 'hand')),
  queue_id text check (length(queue_id) <= 40),
  rule_id text check (length(rule_id) <= 40),
  steps jsonb not null default '[]',
  facts jsonb not null default '{}',
  ms int,
  -- A run taken back (the lead marked spam, or routed again): its turn no longer counts.
  undone_at timestamptz,
  by_user uuid,
  created_at timestamptz not null default now(),
  unique (workspace_id, key)
);
create index if not exists router_runs_ws on public.router_runs (workspace_id, created_at desc);
create index if not exists router_runs_contact on public.router_runs (contact_id, created_at desc) where contact_id is not null;
create index if not exists router_runs_turns on public.router_runs (workspace_id, queue_id, created_at) where kind = 'owner' and undone_at is null;
create index if not exists router_runs_owner on public.router_runs (workspace_id, owner, created_at) where kind = 'owner' and undone_at is null;

create table if not exists public.crm_owner_links (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source_id uuid not null references public.sources (id) on delete cascade,
  crm_owner_id text not null check (length(crm_owner_id) <= 100),
  label text check (length(label) <= 200),
  user_id uuid,
  updated_at timestamptz not null default now(),
  primary key (source_id, crm_owner_id)
);
create index if not exists crm_owner_links_user on public.crm_owner_links (workspace_id, user_id) where user_id is not null;

create table if not exists public.router_replays (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  total int not null default 0,
  done int not null default 0,
  result jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);

-- Held, spam and unassigned leads, for the Held tab and to stop routing a lead marked spam.
alter table public.contacts add column if not exists route_status text check (route_status in ('held', 'spam', 'unassigned'));
create index if not exists contacts_route_status on public.contacts (workspace_id, route_status) where route_status is not null;

-- The router's source kind for field history and the timeline: a form-class source.
insert into public.source_kinds (kind, class) values ('routing', 'manual') on conflict do nothing;

do $$
declare
  t text;
begin
  foreach t in array array['routers', 'router_versions', 'router_reps', 'router_runs', 'crm_owner_links', 'router_replays', 'router_secrets'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete on public.%I from authenticated', t);
  end loop;
end;
$$;
create policy "members read" on public.routers for select using (is_member(workspace_id));
create policy "members read" on public.router_versions for select using (is_member(workspace_id));
create policy "members read" on public.router_reps for select using (is_member(workspace_id));
create policy "members read" on public.router_runs for select using (is_member(workspace_id));
create policy "members read" on public.crm_owner_links for select using (is_member(workspace_id));
create policy "members read" on public.router_replays for select using (is_member(workspace_id));
revoke select on public.router_secrets from authenticated;

-- Facts --------------------------------------------------------------------------------------------------------

-- A CRM owner as a teammate, through crm_owner_links (any of the workspace's sources).
create or replace function public.router_crm_user(p_ws uuid, p_crm text) returns uuid
language sql stable security definer set search_path = public as $$
  select l.user_id from crm_owner_links l
  where l.workspace_id = p_ws and l.crm_owner_id = p_crm and l.user_id is not null
  order by l.updated_at desc limit 1;
$$;

-- An owner value as a teammate: a member's id as is, else a CRM owner id through the links.
create or replace function public.router_owner_user(p_ws uuid, p_value text) returns uuid
language sql stable security definer set search_path = public as $$
  select case
    when p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         and exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_value::uuid) then p_value::uuid
    when nullif(trim(p_value), '') is not null then router_crm_user(p_ws, trim(p_value))
  end;
$$;

/*
 * One rep's state now: name, membership, time zone and hours (the engine works out "in hours"), pause, out of office
 * (the latest end of a calendar out-of-office block covering now, and the dates set by hand), backup, caps, and leads
 * routed to them today and this week in their own time zone, with meetings this week.
 */
create or replace function public.router_rep_facts(p_ws uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with a as (select coalesce((select av.tz from availability av where av.workspace_id = p_ws and av.user_id = p_user), 'UTC') as tz),
  z as (select tz, (date_trunc('day', now() at time zone tz) at time zone tz) as day0, (date_trunc('week', now() at time zone tz) at time zone tz) as week0 from a)
  select jsonb_build_object(
    'name', coalesce((select nullif(trim(bp.name), '') from booking_profiles bp where bp.workspace_id = p_ws and bp.user_id = p_user),
                     (select split_part(u.email, '@', 1) from auth.users u where u.id = p_user), 'Someone'),
    'member', exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = p_user),
    'tz', z.tz,
    'availability', (select jsonb_build_object('tz', av.tz, 'weekly', av.weekly, 'overrides', av.overrides) from availability av where av.workspace_id = p_ws and av.user_id = p_user),
    'paused_until', r.paused_until,
    'out_dates', coalesce(r.out_dates, '[]'),
    'calendar_out_until', (select max(b.end_at) from busy_blocks b join calendar_accounts c on c.id = b.account_id
                           where c.workspace_id = p_ws and c.user_id = p_user and c.status = 'ok' and b.ooo and b.start_at <= now() and b.end_at > now()),
    'backup', r.backup,
    'cap_day', r.cap_day,
    'cap_week', r.cap_week,
    'today', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.day0),
    'week', (select count(*) from router_runs x where x.workspace_id = p_ws and x.owner = p_user and x.kind = 'owner' and x.undone_at is null and x.by in ('queue', 'fallback') and x.created_at >= z.week0),
    'meetings_week', (select count(*) from meetings m where m.workspace_id = p_ws and p_user = any(m.hosts) and m.status in ('booked', 'held')
                      and m.start_at >= z.week0 and m.start_at < z.week0 + interval '7 days')
  )
  from z left join router_reps r on r.workspace_id = p_ws and r.user_id = p_user;
$$;

/*
 * Everything the engine needs for one lead, in one read. p_users: the reps the body names (queues, fallback); the
 * owners found here and every backup are added. p_queues: the body's queue ids, for their 30-day counts. A key seen
 * before returns that run instead, so the caller writes nothing.
 */
create or replace function public.router_facts(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text default null, p_email_class text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c contacts%rowtype;
  co companies%rowtype;
  dom text;
  opp_name text;
  opp_owner text;
  sub_id uuid;
  sub_form uuid;
  sub_values jsonb;
  sub_hidden jsonb;
  users uuid[];
  ex router_runs%rowtype;
  rt routers%rowtype;
begin
  if p_key is not null then
    select * into ex from router_runs where workspace_id = p_ws and key = p_key;
    if ex.id is not null then
      return jsonb_build_object('existing', jsonb_build_object('id', ex.id, 'kind', ex.kind, 'owner', ex.owner, 'by', ex."by", 'queue', ex.queue_id, 'rule', ex.rule_id));
    end if;
  end if;
  select * into c from contacts where id = p_contact and workspace_id = p_ws and deleted_at is null;
  -- The Test panel with an email no contact has yet: a lead with only that email.
  if c.id is null and p_contact is null and nullif(trim(p_email), '') is not null then
    c.email := lower(trim(p_email));
    c.email_clean := c.email;
    c.email_class := p_email_class;
    c.fields := '{}';
  elsif c.id is null then
    return null;
  end if;
  dom := lower(nullif(split_part(coalesce(c.email_clean, c.email, ''), '@', 2), ''));
  if c.company_id is not null then
    select * into co from companies where id = c.company_id and deleted_at is null;
  end if;
  if co.id is null and dom is not null and coalesce(c.email_class, 'work') not in ('free') then
    select * into co from companies where workspace_id = p_ws and deleted_at is null and merged_into is null
      and (domain = dom or dom like '%.' || domain)
    order by (owner_user_id is not null or owner_crm_id is not null) desc, length(domain) desc, created_at limit 1;
  end if;
  -- The open opportunity on the company, most recently changed first.
  if co.id is not null then
    select r.name, r.fields->>'owner' into opp_name, opp_owner
    from records r join objects o on o.id = r.object_id and o.key = 'opportunity'
    join record_links l on l.from_id = r.id and l.to_object = 'company' and l.to_id = co.id
    where r.workspace_id = p_ws and r.deleted_at is null and nullif(r.fields->>'owner', '') is not null
      and coalesce((select (opt->>'kind') from fields f, jsonb_array_elements(f.options) opt
                    where f.workspace_id = p_ws and f.object = 'opportunity' and f.key = 'stage' and opt->>'value' = r.fields->>'stage' limit 1), 'open') = 'open'
    order by r.updated_at desc limit 1;
  end if;
  -- The fill this route is for, or the contact's latest.
  select s.id, s.form_id, s."values", s.hidden into sub_id, sub_form, sub_values, sub_hidden from submissions s
  where c.id is not null and s.workspace_id = p_ws and s.contact_id = c.id
  order by (p_key is not null and p_key = 'form:' || s.id::text) desc, s.created_at desc limit 1;
  select * into rt from routers where workspace_id = p_ws;

  users := array(select distinct u from unnest(
    coalesce(p_users, '{}')
    || array[c.owner_user_id, router_owner_user(p_ws, c.owner_crm_id), co.owner_user_id, router_owner_user(p_ws, co.owner_crm_id), router_owner_user(p_ws, opp_owner)]
  ) u where u is not null);
  users := array(select distinct u from unnest(users || array(select r.backup from router_reps r where r.workspace_id = p_ws and r.user_id = any(users) and r.backup is not null)) u);

  return jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email, 'email_clean', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
                                  'title', c.title, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle, 'lead_status', c.lead_status, 'score', c.score,
                                  'score_band', c.score_band, 'fields', c.fields, 'route_status', c.route_status),
    'domain', dom,
    'owner', jsonb_build_object('user', case when c.owner_user_id is not null then c.owner_user_id else router_owner_user(p_ws, c.owner_crm_id) end, 'crm', c.owner_crm_id),
    'company', case when co.id is null then null else jsonb_build_object(
      'id', co.id, 'name', coalesce(co.name, co.domain), 'domain', co.domain, 'country', co.country, 'industry', co.industry, 'size', co.size, 'fields', co.fields,
      'owner', coalesce(co.owner_user_id, router_owner_user(p_ws, co.owner_crm_id)), 'owner_crm', co.owner_crm_id,
      'opp_owner', router_owner_user(p_ws, opp_owner), 'opp_name', opp_name) end,
    'submission', case when sub_id is null then null else jsonb_build_object('id', sub_id, 'form_id', sub_form, 'values', sub_values, 'hidden', sub_hidden) end,
    'recent', (select count(*) from submissions s where s.workspace_id = p_ws and s.contact_id = c.id and s.created_at > now() - interval '1 hour'),
    'reps', coalesce((select jsonb_object_agg(u, router_rep_facts(p_ws, u)) from unnest(users) u), '{}'),
    'counts', coalesce((select jsonb_object_agg(q, coalesce((
        select jsonb_object_agg(x.owner, jsonb_build_object('n', x.n, 'last', x.last))
        from (select owner, count(*) as n, max(created_at) as last from router_runs
              where workspace_id = p_ws and queue_id = q and kind = 'owner' and undone_at is null and created_at > now() - interval '30 days'
              group by owner) x), '{}'))
      from unnest(coalesce(p_queues, '{}')) q), '{}'),
    'lists', jsonb_build_object('allow', to_jsonb(coalesce(rt.allow, '{}')), 'block', to_jsonb(coalesce(rt.block, '{}')))
  );
end;
$$;

-- Commit ---------------------------------------------------------------------------------------------------------

/*
 * The queue's turn, taken under its lock with fresh counts (docs/router.md 3.6): the engine names the reps who could
 * take the lead (`candidates`, in the queue's order, with weights); this picks the one whose turn it is now, so two
 * leads read at the same moment still go to different reps. Caps are checked on fresh counts. Returns the pick, its
 * count, the counts of the rest and the window, or null when none can take it.
 */
create or replace function public.router_pick(p_ws uuid, p_pick jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q text := p_pick->>'queue';
  m text := coalesce(p_pick->>'method', 'rr');
  best jsonb;
  win int;
  rows jsonb := '[]';
  x record;
begin
  select count(*) into win from router_runs where workspace_id = p_ws and queue_id = q and kind = 'owner' and undone_at is null and created_at > now() - interval '30 days';
  for x in
    select (c->>'user')::uuid as u, greatest(1, least(10, coalesce((c->>'weight')::int, 1))) as w, ord,
           (select count(*) from router_runs r where r.workspace_id = p_ws and r.queue_id = q and r.owner = (c->>'user')::uuid and r.kind = 'owner'
              and r.undone_at is null and r.created_at > now() - interval '30 days') as n,
           (select max(r.created_at) from router_runs r where r.workspace_id = p_ws and r.queue_id = q and r.owner = (c->>'user')::uuid and r.kind = 'owner'
              and r.undone_at is null and r.created_at > now() - interval '30 days') as last,
           router_rep_facts(p_ws, (c->>'user')::uuid) as rf
    from jsonb_array_elements(coalesce(p_pick->'candidates', '[]')) with ordinality t(c, ord)
  loop
    rows := rows || jsonb_build_object('user', x.u, 'n', case when m = 'load' then (x.rf->>'meetings_week')::int else x.n end,
      'score', case when m = 'load' then (x.rf->>'meetings_week')::numeric when m = 'weighted' then x.n::numeric / x.w else x.n::numeric end,
      'last', coalesce(extract(epoch from x.last), 0), 'ord', x.ord,
      'ok', (x.rf->>'member')::boolean
            and not (x.rf->>'paused_until' is not null and (x.rf->>'paused_until')::timestamptz > now())
            and not (x.rf->>'cap_day' is not null and (x.rf->>'today')::int >= (x.rf->>'cap_day')::int)
            and not (x.rf->>'cap_week' is not null and (x.rf->>'week')::int >= (x.rf->>'cap_week')::int));
  end loop;
  select r into best from jsonb_array_elements(rows) r where (r->>'ok')::boolean
  order by (r->>'score')::numeric, (r->>'last')::numeric, (r->>'ord')::int limit 1;
  if best is null then return null; end if;
  return jsonb_build_object('user', best->>'user', 'n', (best->>'n')::int, 'window', win,
    'rest', coalesce((select jsonb_object_agg(r->>'user', jsonb_build_object('n', (r->>'n')::int, 'ok', (r->>'ok')::boolean)) from jsonb_array_elements(rows) r where r->>'user' <> best->>'user'), '{}'));
end;
$$;

-- Set a run's queue (or fallback) line to the pick router_pick made: the picked rep, their count, and the others' counts.
create or replace function public.router_steps_pick(p_steps jsonb, p_queue text, p_owner uuid, p_pick jsonb) returns jsonb
language plpgsql immutable as $$
declare
  out jsonb := '[]';
  e jsonb;
  o jsonb;
  others jsonb;
  prev text;
begin
  for e in select x from jsonb_array_elements(coalesce(p_steps, '[]')) x loop
    if e->>'step' = 'queue' and e->'queue'->>'id' = p_queue then
      others := '[]';
      for o in select x from jsonb_array_elements(coalesce(e->'others', '[]')) x loop
        continue when o->>'user' = p_owner::text;
        if not (o ? 'why') and p_pick->'rest' ? (o->>'user') then
          o := o || jsonb_build_object('n', (p_pick->'rest'->(o->>'user')->>'n')::int);
        end if;
        others := others || jsonb_build_array(o);
      end loop;
      prev := e->>'picked';
      if prev is not null and prev <> p_owner::text and p_pick->'rest' ? prev then
        others := others || jsonb_build_array(jsonb_build_object('user', prev, 'n', (p_pick->'rest'->prev->>'n')::int));
      end if;
      e := e || jsonb_build_object('picked', p_owner, 'pickedN', (p_pick->>'n')::int, 'window', (p_pick->>'window')::int, 'others', others);
    elsif e->>'step' = 'fallback' and e->'queue'->>'id' = p_queue then
      e := e || jsonb_build_object('picked', p_owner);
    end if;
    out := out || jsonb_build_array(e);
  end loop;
  return out;
end;
$$;

/*
 * Write a decision. Under a lock on the queue (or the workspace's router for picks outside a queue), it checks the key
 * wasn't used meanwhile ('dup'), and that a rep picked from a queue or as fallback can still take it: a member, not
 * paused, and under their caps by a fresh count ('stale': the caller decides again with fresh facts). Then it writes the
 * run, the owner (with field history, and the CRM owner for two-way CRMs through the links), the status for held and
 * unassigned, the company owner when asked, a line on the timeline, and the alert job.
 */
create or replace function public.router_commit(p_ws uuid, p_contact uuid, p_key text, p_reason text, p_version int, p_result jsonb, p_steps jsonb, p_facts jsonb,
  p_ms int, p_set_company boolean default false, p_by_user uuid default null, p_pick jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  k text := p_result->>'kind';
  owner uuid := nullif(p_result->>'user', '')::uuid;
  by_ text := p_result->>'by';
  q text := p_result->>'queue';
  ex router_runs%rowtype;
  c contacts%rowtype;
  rf jsonb;
  rid uuid;
  crm text;
  pk jsonb;
  steps jsonb := coalesce(p_steps, '[]');
begin
  perform pg_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || coalesce(q, '-'), 0));
  select * into ex from router_runs where workspace_id = p_ws and key = p_key;
  if ex.id is not null then
    return jsonb_build_object('status', 'dup', 'id', ex.id, 'kind', ex.kind, 'owner', ex.owner);
  end if;
  select * into c from contacts where id = p_contact and workspace_id = p_ws and deleted_at is null for update;
  if c.id is null then return jsonb_build_object('status', 'gone'); end if;
  -- A queue's pick is taken here, under the lock, from fresh counts; the run's queue (or fallback) line is set to it.
  if k = 'owner' and p_pick is not null then
    pk := router_pick(p_ws, p_pick);
    if pk is null then return jsonb_build_object('status', 'stale', 'user', owner); end if;
    owner := (pk->>'user')::uuid;
    steps := router_steps_pick(steps, q, owner, pk);
  elsif k = 'owner' and by_ in ('queue', 'fallback') then
    rf := router_rep_facts(p_ws, owner);
    if not (rf->>'member')::boolean
       or (rf->>'paused_until' is not null and (rf->>'paused_until')::timestamptz > now())
       or (by_ = 'queue' and rf->>'cap_day' is not null and (rf->>'today')::int >= (rf->>'cap_day')::int)
       or (by_ = 'queue' and rf->>'cap_week' is not null and (rf->>'week')::int >= (rf->>'cap_week')::int) then
      return jsonb_build_object('status', 'stale', 'user', owner);
    end if;
  elsif k = 'owner' and not exists (select 1 from workspace_members m where m.workspace_id = p_ws and m.user_id = owner) then
    return jsonb_build_object('status', 'stale', 'user', owner);
  end if;

  insert into router_runs (workspace_id, contact_id, key, reason, version, kind, owner, by, queue_id, rule_id, steps, facts, ms, by_user)
  values (p_ws, p_contact, p_key, p_reason, p_version, k, case when k = 'owner' then owner end, case when k = 'owner' then by_ end,
          case when k = 'owner' then q end, case when k = 'owner' then p_result->>'rule' end, steps, coalesce(p_facts, '{}'), p_ms, p_by_user)
  returning id into rid;

  if k = 'owner' then
    if c.owner_user_id is distinct from owner then
      insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source, by)
      values (p_ws, 'contact', c.id, 'owner', to_jsonb(c.owner_user_id), to_jsonb(owner), c.field_sources->'owner', 'routing', p_by_user);
    end if;
    -- The owner's CRM id for two-way CRMs: kept when it's already theirs, else the one linked to them.
    crm := case when router_crm_user(p_ws, c.owner_crm_id) = owner then c.owner_crm_id
                else (select l.crm_owner_id from crm_owner_links l where l.workspace_id = p_ws and l.user_id = owner order by l.updated_at desc limit 1) end;
    update contacts set owner_user_id = owner, owner_crm_id = coalesce(crm, owner_crm_id), route_status = null,
      field_sources = coalesce(field_sources, '{}') || jsonb_build_object('owner', jsonb_build_object('s', 'routing', 'at', now())), updated_at = now()
    where id = c.id;
    if p_set_company and c.company_id is not null then
      update companies set owner_user_id = owner, updated_at = now() where id = c.company_id and owner_user_id is null and owner_crm_id is null;
    end if;
  else
    update contacts set route_status = k where id = c.id;
  end if;

  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (p_ws, c.id, case k when 'owner' then 'lead.routed' when 'held' then 'lead.held' else 'lead.unassigned' end,
          jsonb_strip_nulls(jsonb_build_object('run_id', rid, 'owner', case when k = 'owner' then owner end, 'by', by_, 'queue', q, 'rule', p_result->>'rule', 'reason', p_reason)), 'routing');

  if k <> 'held' then
    perform enqueue_job(p_ws, 'router_alert', rid::text, jsonb_build_object('run', rid), 0, 5);
  end if;
  return jsonb_build_object('status', 'ok', 'id', rid, 'owner', case when k = 'owner' then owner end, 'steps', steps);
end;
$$;

-- Taking a run back: the lead was marked spam or is routed again; its turn no longer counts.
create or replace function public.router_undo(p_ws uuid, p_contact uuid) returns int
language sql security definer set search_path = public as $$
  with u as (update router_runs set undone_at = now() where workspace_id = p_ws and contact_id = p_contact and undone_at is null returning 1)
  select count(*)::int from u;
$$;

-- Versions -------------------------------------------------------------------------------------------------------

-- Save the draft when it's still the revision the editor read. Returns the new revision, or raises 'conflict'.
create or replace function public.router_draft_save(p_ws uuid, p_body jsonb, p_revision int, p_user uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r routers%rowtype;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  select * into r from routers where workspace_id = p_ws for update;
  if p_revision is not null and r.draft_revision <> p_revision then raise exception 'conflict'; end if;
  update routers set draft = p_body, draft_base = coalesce(case when r.draft is null then r.live_version else r.draft_base end, r.live_version),
    draft_revision = r.draft_revision + 1, draft_by = p_user, draft_at = now(), updated_at = now()
  where workspace_id = p_ws;
  return r.draft_revision + 1;
end;
$$;

create or replace function public.router_draft_drop(p_ws uuid) returns void
language sql security definer set search_path = public as $$
  update routers set draft = null, draft_base = null, draft_revision = draft_revision + 1, updated_at = now() where workspace_id = p_ws;
$$;

-- Make a body live as the next version (a publish, or a roll back's copy). Clears the draft when it's the one published.
create or replace function public.router_publish(p_ws uuid, p_body jsonb, p_note text, p_user uuid, p_clear_draft boolean default true) returns int
language plpgsql security definer set search_path = public as $$
declare
  v int;
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  perform 1 from routers where workspace_id = p_ws for update;
  select coalesce(max(version), 0) + 1 into v from router_versions where workspace_id = p_ws;
  insert into router_versions (workspace_id, version, body, note, published_by) values (p_ws, v, p_body, left(p_note, 300), p_user);
  update routers set live_version = v, updated_at = now(),
    draft = case when p_clear_draft then null else draft end, draft_base = case when p_clear_draft then null else draft_base end,
    draft_revision = draft_revision + case when p_clear_draft then 1 else 0 end
  where workspace_id = p_ws;
  return v;
end;
$$;

-- What the server needs to route: the live body and version (null when there's no router).
create or replace function public.router_live(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('version', v.version, 'body', v.body)
  from routers r join router_versions v on v.workspace_id = r.workspace_id and v.version = r.live_version
  where r.workspace_id = p_ws;
$$;

-- Reps and lists ---------------------------------------------------------------------------------------------------

-- Change one rep's pause, out-of-office dates, backup or caps; keys left out stay as they are.
create or replace function public.router_rep_save(p_ws uuid, p_user uuid, p_patch jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then raise exception 'not_member'; end if;
  insert into router_reps (workspace_id, user_id) values (p_ws, p_user) on conflict do nothing;
  update router_reps set
    paused_until = case when p_patch ? 'paused_until' then nullif(p_patch->>'paused_until', '')::timestamptz else paused_until end,
    out_dates = case when p_patch ? 'out_dates' and jsonb_typeof(p_patch->'out_dates') = 'array' then p_patch->'out_dates' else out_dates end,
    backup = case when p_patch ? 'backup' then nullif(p_patch->>'backup', '')::uuid else backup end,
    cap_day = case when p_patch ? 'cap_day' then nullif(p_patch->>'cap_day', '')::int else cap_day end,
    cap_week = case when p_patch ? 'cap_week' then nullif(p_patch->>'cap_week', '')::int else cap_week end,
    updated_at = now()
  where workspace_id = p_ws and user_id = p_user;
end;
$$;

create or replace function public.router_lists_save(p_ws uuid, p_allow text[], p_block text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into routers (workspace_id) values (p_ws) on conflict do nothing;
  update routers set allow = coalesce(p_allow, allow), block = coalesce(p_block, block), updated_at = now() where workspace_id = p_ws;
end;
$$;

-- Mark a lead spam: its runs are taken back and it isn't routed again until let through.
create or replace function public.router_spam(p_ws uuid, p_contacts uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  update router_runs set undone_at = now() where workspace_id = p_ws and contact_id = any(p_contacts) and undone_at is null;
  update contacts set route_status = 'spam' where workspace_id = p_ws and id = any(p_contacts);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Give a lead to a rep by hand (Unassigned's Assign): a run like any other, so the log and counts stay whole.
create or replace function public.router_assign(p_ws uuid, p_contact uuid, p_owner uuid, p_by uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  return router_commit(p_ws, p_contact, 'hand:' || p_contact::text || ':' || extract(epoch from clock_timestamp())::text, 'manual',
    (select live_version from routers where workspace_id = p_ws), jsonb_build_object('kind', 'owner', 'user', p_owner, 'by', 'hand'),
    jsonb_build_array(jsonb_build_object('step', 'hand', 'ok', true, 'user', p_owner, 'by_user', p_by)), '{}', 0, false, p_by);
end;
$$;

-- Counts for the editor's lines (docs/router-ux.md 4.2): per step result, rule and queue, over the last p_days.
create or replace function public.router_stats(p_ws uuid, p_days int default 7) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from router_runs where workspace_id = p_ws and created_at > now() - make_interval(days => least(greatest(p_days, 1), 90)))
  select jsonb_build_object(
    'total', (select count(*) from r),
    'held', (select count(*) from r where kind = 'held'),
    'unassigned', (select count(*) from r where kind = 'unassigned'),
    'by', coalesce((select jsonb_object_agg(by, n) from (select by, count(*) n from r where kind = 'owner' group by by) x), '{}'),
    'rules', coalesce((select jsonb_object_agg(rule_id, n) from (select rule_id, count(*) n from r where rule_id is not null group by rule_id) x), '{}'),
    'queues', coalesce((select jsonb_object_agg(queue_id, n) from (select queue_id, count(*) n from r where queue_id is not null group by queue_id) x), '{}'),
    'p95_ms', (select percentile_cont(0.95) within group (order by ms) from r where ms is not null)
  );
$$;

-- Today's MQL routing hands over to the router once one is live -------------------------------------------------------

create or replace function public.lead_route(p_contact uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c contacts;
  co companies;
  s lead_settings;
  r jsonb;
  owners jsonb;
  pick jsonb;
  idx int := 0;
  rule_name text;
  turn int;
  vals jsonb := '{}';
begin
  select * into c from contacts where id = p_contact and deleted_at is null for update;
  if c.id is null then return null; end if;
  -- A live router decides the owner (worker-intel/jobs/router.ts); the MQL stage and the timeline stay here.
  if exists (select 1 from routers where workspace_id = c.workspace_id and live_version is not null) then
    if c.lifecycle is null or c.lifecycle in ('subscriber', 'lead') then
      perform contact_update(c.id, 'scoring', jsonb_build_object('lifecycle', 'mql'));
    end if;
    update contacts set qualified_at = now() where id = c.id;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (c.workspace_id, c.id, 'lead.qualified', jsonb_strip_nulls(jsonb_build_object('score', c.score, 'rule', 'router')), 'scoring');
    perform enqueue_job(c.workspace_id, 'route', 'score:' || c.id::text || ':' || to_char(now(), 'YYYY-MM-DD'),
                        jsonb_build_object('contact', c.id, 'reason', 'score', 'key', 'score:' || c.id::text || ':' || to_char(now(), 'YYYY-MM-DD')), 0, 5);
    return 'router';
  end if;
  select * into s from lead_settings where workspace_id = c.workspace_id;
  select * into co from companies where id = c.company_id;
  if coalesce((s.routing->>'respect_owner')::boolean, true) and (c.owner_user_id is not null or c.owner_crm_id is not null) then
    owners := null;
    rule_name := 'kept_owner';
  else
    for r in select * from jsonb_array_elements(coalesce(s.routing->'rules', '[]')) loop
      if (jsonb_array_length(coalesce(r->'countries', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'countries') x where upper(x) = coalesce(co.country, c.country)))
         and (jsonb_array_length(coalesce(r->'industries', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'industries') x where lower(x) = lower(co.industry)))
         and (jsonb_array_length(coalesce(r->'sizes', '[]')) = 0 or exists (select 1 from jsonb_array_elements_text(r->'sizes') x where lower(x) = lower(co.size)))
         and jsonb_array_length(coalesce(r->'owners', '[]')) > 0 then
        owners := r->'owners';
        rule_name := coalesce(r->>'name', 'Rule ' || (idx + 1));
        exit;
      end if;
      idx := idx + 1;
    end loop;
    if owners is null and jsonb_array_length(coalesce(s.routing->'default'->'owners', '[]')) > 0 then
      owners := s.routing->'default'->'owners';
      rule_name := 'default';
      idx := -1;
    end if;
  end if;
  if owners is not null then
    turn := coalesce((s.turns->>idx::text)::int, 0);
    pick := owners->(turn % jsonb_array_length(owners));
    update lead_settings set turns = turns || jsonb_build_object(idx::text, turn + 1) where workspace_id = c.workspace_id;
    if nullif(pick->>'user_id', '') is not null and exists (select 1 from workspace_members where workspace_id = c.workspace_id and user_id::text = pick->>'user_id') then
      vals := vals || jsonb_build_object('owner', pick->>'user_id');
    end if;
    if nullif(pick->>'crm_owner_id', '') is not null then
      update contacts set owner_crm_id = left(pick->>'crm_owner_id', 100) where id = c.id;
    end if;
  end if;
  if c.lifecycle is null or c.lifecycle in ('subscriber', 'lead') then
    vals := vals || jsonb_build_object('lifecycle', 'mql');
  end if;
  if vals <> '{}' then perform contact_update(c.id, 'scoring', vals); end if;
  update contacts set qualified_at = now() where id = c.id;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (c.workspace_id, c.id, 'lead.qualified', jsonb_strip_nulls(jsonb_build_object('score', c.score, 'rule', rule_name, 'owner', pick)), 'scoring');
  return rule_name;
end;
$$;

-- Queue background routes (docs/router-ux.md W8 and W9): new CRM contacts with no owner there, or an import's new
-- contacts, when the workspace has a live router. Contacts that already have an owner, or were marked spam, are left
-- alone. One job per contact, keyed so a second call queues nothing more.
create or replace function public.router_queue(p_ws uuid, p_reason text, p_contacts uuid[] default null, p_import uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  c record;
  n int := 0;
  k text;
begin
  if p_reason not in ('crm', 'import') then raise exception 'bad reason'; end if;
  if not exists (select 1 from routers where workspace_id = p_ws and live_version is not null) then return 0; end if;
  for c in
    select x.id from contacts x
    where x.workspace_id = p_ws and x.deleted_at is null and x.owner_user_id is null and x.owner_crm_id is null
      and coalesce(x.route_status, '') <> 'spam'
      and ((p_contacts is not null and x.id = any(p_contacts)) or (p_import is not null and x.import_id = p_import))
    limit 50000
  loop
    k := p_reason || ':' || c.id::text;
    perform enqueue_job(p_ws, 'route', k, jsonb_build_object('contact', c.id, 'reason', p_reason, 'key', k), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- What one alert needs (worker-intel/jobs/router.ts): the run, the Slack webhook (sealed), the owner, and the
-- workspace owners' emails for leads no one could take.
create or replace function public.router_alert_info(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'run', jsonb_build_object('id', r.id, 'workspace_id', r.workspace_id, 'contact_id', r.contact_id, 'kind', r.kind, 'owner', r.owner, 'by', r."by", 'reason', r.reason,
                              'queue_id', r.queue_id, 'rule_id', r.rule_id, 'steps', r.steps, 'facts', r.facts, 'undone', r.undone_at is not null),
    'sealed', (select sealed from router_secrets s where s.workspace_id = r.workspace_id),
    'owner', case when r.owner is null then null else meeting_people(r.workspace_id, array[r.owner])->0 end,
    'admins', coalesce((select jsonb_agg(lower(u.email)) from workspace_members m join auth.users u on u.id = m.user_id
                        where m.workspace_id = r.workspace_id and m.role = 'owner' and u.email is not null), '[]'),
    'workspace', (select name from workspaces w where w.id = r.workspace_id),
    'form', (select f.name from forms f where f.id::text = r.facts->'values'->>'lead.form'),
    'sending', meeting_sending(r.workspace_id))
  from router_runs r where r.id = p_run;
$$;

-- Runs kept 13 months; replays 7 days. On their own cron entry, so this file doesn't redefine minute_tick.
create or replace function public.router_prune() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from router_runs where created_at < now() - interval '13 months';
  get diagnostics n = row_count;
  delete from router_replays where created_at < now() - interval '7 days';
  return n;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-router-prune', '17 3 * * *', 'select public.router_prune()');
  end if;
end $$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'router_crm_user(uuid, text)', 'router_owner_user(uuid, text)', 'router_rep_facts(uuid, uuid)', 'router_facts(uuid, uuid, text, uuid[], text[], text, text)',
    'router_pick(uuid, jsonb)', 'router_commit(uuid, uuid, text, text, int, jsonb, jsonb, jsonb, int, boolean, uuid, jsonb)', 'router_undo(uuid, uuid)',
    'router_draft_save(uuid, jsonb, int, uuid)', 'router_draft_drop(uuid)', 'router_publish(uuid, jsonb, text, uuid, boolean)', 'router_live(uuid)',
    'router_rep_save(uuid, uuid, jsonb)', 'router_lists_save(uuid, text[], text[])', 'router_spam(uuid, uuid[])', 'router_assign(uuid, uuid, uuid, uuid)',
    'router_stats(uuid, int)', 'router_prune()', 'router_alert_info(uuid)', 'router_queue(uuid, text, uuid[], uuid)', 'router_steps_pick(jsonb, text, uuid, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
