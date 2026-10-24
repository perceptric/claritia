-- Workflows (docs/enrich-workflows-reports.md Part 2): a trigger, then steps, run once per step.
--   workflows: a draft (edited, revision-checked), the live version and the entry rule.
--   workflow_versions: each published body. A run stays on the version it started on.
--   workflow_emails: the email row each published email step sends (one per version and step).
--   workflow_runs: one contact going through, keyed so the same trigger event never starts two.
--   workflow_steps_done: the once-only ledger. A step writes its row before acting; a step whose row says done is
--   skipped when the run is picked up again.
--   workflow_watch: the contact fields live workflows start on, so field.changed events are only written for them.
--   email_templates: saved emails that workflows and broadcasts reuse.
--   New events: lead.band (score band changed), field.changed (a watched field), segment.entered and segment.left
--   for lists (dynamic segments already write theirs).
--   Emails carry merge values (first name, last name, company, title) and, for "from their rep", the rep's name and
--   reply-to address.
--   Nurtures move into workflows (production had none); their tables stay, unused, for one release.

-- Tables ------------------------------------------------------------------------------------------------------------

create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and length(draft::text) <= 400000),
  draft_revision int not null default 0,
  live_version int,
  -- What started it lives in the live body; this copy is for the scan's index.
  trigger_kind text,
  live_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_ws on public.workflows (workspace_id, updated_at desc);
create index if not exists workflows_live on public.workflows (trigger_kind) where status = 'live';
alter table public.workflows enable row level security;
create policy "members read" on public.workflows for select using (is_member(workspace_id));
revoke all on public.workflows from anon;
revoke insert, update, delete on public.workflows from authenticated;

create table if not exists public.workflow_versions (
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version int not null,
  body jsonb not null check (jsonb_typeof(body) = 'object'),
  note text check (length(note) <= 300),
  published_by uuid,
  published_at timestamptz not null default now(),
  primary key (workflow_id, version)
);
alter table public.workflow_versions enable row level security;
create policy "members read" on public.workflow_versions for select using (is_member(workspace_id));
revoke all on public.workflow_versions from anon;
revoke insert, update, delete on public.workflow_versions from authenticated;

create table if not exists public.workflow_emails (
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  version int not null,
  step_id text not null,
  email_id uuid not null references public.emails (id) on delete cascade,
  primary key (workflow_id, version, step_id)
);
alter table public.workflow_emails enable row level security;
create policy "members read" on public.workflow_emails for select using (exists (select 1 from workflows w where w.id = workflow_id and is_member(w.workspace_id)));
revoke all on public.workflow_emails from anon;
revoke insert, update, delete on public.workflow_emails from authenticated;

create table if not exists public.workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  version int not null,
  contact_id uuid references public.contacts (id) on delete cascade,
  -- ev:<event id>, manual:<contact>:<day>, date:<contact>:<date>, bc:<contact>
  key text not null check (length(key) <= 200),
  status text not null default 'active' check (status in ('active', 'waiting', 'done', 'exited', 'failed')),
  at_step text,
  next_at timestamptz not null default now(),
  -- A Wait until: { event, since, until, step }.
  wait jsonb,
  exit_reason text check (length(exit_reason) <= 60),
  error text check (length(error) <= 500),
  claimed_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  unique (workflow_id, key)
);
create index if not exists workflow_runs_due on public.workflow_runs (workspace_id, next_at) where status in ('active', 'waiting');
create index if not exists workflow_runs_contact on public.workflow_runs (contact_id, started_at desc);
create index if not exists workflow_runs_flow on public.workflow_runs (workflow_id, started_at desc);
alter table public.workflow_runs enable row level security;
create policy "members read" on public.workflow_runs for select using (is_member(workspace_id));
revoke all on public.workflow_runs from anon;
revoke insert, update, delete on public.workflow_runs from authenticated;

create table if not exists public.workflow_steps_done (
  run_id uuid not null references public.workflow_runs (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  step_id text not null,
  visit int not null default 1,
  status text not null check (status in ('running', 'done', 'skipped', 'failed', 'unknown')),
  result jsonb not null default '{}',
  at timestamptz not null default now(),
  primary key (run_id, step_id, visit)
);
create index if not exists workflow_steps_ws on public.workflow_steps_done (workspace_id, at desc);
alter table public.workflow_steps_done enable row level security;
create policy "members read" on public.workflow_steps_done for select using (is_member(workspace_id));
revoke all on public.workflow_steps_done from anon;
revoke insert, update, delete on public.workflow_steps_done from authenticated;

create table if not exists public.workflow_watch (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  workflow_id uuid not null references public.workflows (id) on delete cascade,
  key text not null check (length(key) <= 80),
  primary key (workflow_id, key)
);
create index if not exists workflow_watch_ws on public.workflow_watch (workspace_id, key);
alter table public.workflow_watch enable row level security;
revoke all on public.workflow_watch from anon, authenticated;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  body jsonb not null check (jsonb_typeof(body) = 'object' and length(body::text) <= 40000),
  created_by uuid,
  updated_at timestamptz not null default now()
);
create index if not exists email_templates_ws on public.email_templates (workspace_id, updated_at desc);
alter table public.email_templates enable row level security;
create policy "members read" on public.email_templates for select using (is_member(workspace_id));
revoke all on public.email_templates from anon;
revoke insert, update, delete on public.email_templates from authenticated;

alter table public.tasks add column if not exists idem_key text check (length(idem_key) <= 200);
create unique index if not exists tasks_idem on public.tasks (workspace_id, idem_key) where idem_key is not null;

alter table public.email_messages add column if not exists vars jsonb;
alter table public.email_messages add column if not exists from_name text check (length(from_name) <= 80);
alter table public.email_messages add column if not exists reply_to text check (length(reply_to) <= 254);

insert into public.source_kinds (kind, class) values ('workflow', 'product') on conflict do nothing;

-- Events workflows start on ---------------------------------------------------------------------------------------

create or replace function public.contacts_band_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.score_band is distinct from old.score_band and new.score_band is not null and new.deleted_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (new.workspace_id, new.id, 'lead.band', jsonb_build_object('from', old.score_band, 'to', new.score_band), 'score');
  end if;
  return new;
end;
$$;
drop trigger if exists contacts_band_event on public.contacts;
create trigger contacts_band_event after update of score_band on public.contacts for each row execute function public.contacts_band_event();

create or replace function public.field_history_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.object = 'contact' and exists (select 1 from workflow_watch w where w.workspace_id = new.workspace_id and w.key = new.key) then
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (new.workspace_id, new.record_id, 'field.changed', jsonb_build_object('key', new.key, 'old', new.old, 'new', new.new), coalesce(left(new.source, 40), 'field'));
  end if;
  return new;
end;
$$;
drop trigger if exists field_history_event on public.field_history;
create trigger field_history_event after insert on public.field_history for each row execute function public.field_history_event();

-- Lists (static segments) write their own entered and left events; dynamic ones already do in segment_refresh.
create or replace function public.segment_members_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  g segments%rowtype;
begin
  select * into g from segments where id = new.segment_id;
  if g.kind <> 'static' then return new; end if;
  if tg_op = 'INSERT' and new.left_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.entered', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  elsif tg_op = 'UPDATE' and old.left_at is null and new.left_at is not null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.left', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  elsif tg_op = 'UPDATE' and old.left_at is not null and new.left_at is null then
    insert into contact_events (workspace_id, contact_id, kind, data, source) values (g.workspace_id, new.contact_id, 'segment.entered', jsonb_build_object('segment_id', g.id, 'name', g.name), 'segment');
  end if;
  return new;
end;
$$;
drop trigger if exists segment_members_event on public.segment_members;
create trigger segment_members_event after insert or update of left_at on public.segment_members for each row execute function public.segment_members_event();

-- Editing (members) -------------------------------------------------------------------------------------------------

-- Save a draft. p_revision is the revision the editor last saw; another save in between is refused, so two editors
-- never overwrite each other unseen. Returns { id, revision }.
create or replace function public.workflow_save(p_ws uuid, p_id uuid, p_name text, p_draft jsonb, p_revision int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the workflow'; end if;
  if p_id is null then
    if (select count(*) from workflows where workspace_id = p_ws) >= 100 then raise exception 'Up to 100 workflows'; end if;
    insert into workflows (workspace_id, name, draft, created_by) values (p_ws, left(trim(p_name), 120), coalesce(p_draft, '{}'), auth.uid()) returning * into w;
    return jsonb_build_object('id', w.id, 'revision', w.draft_revision);
  end if;
  select * into w from workflows where id = p_id and workspace_id = p_ws for update;
  if w.id is null then raise exception 'Workflow not found'; end if;
  if p_revision is not null and p_revision <> w.draft_revision then raise exception 'Someone else changed this workflow. Reload to see their changes.'; end if;
  update workflows set name = left(trim(p_name), 120), draft = coalesce(p_draft, draft), draft_revision = draft_revision + 1, updated_at = now() where id = p_id returning * into w;
  return jsonb_build_object('id', w.id, 'revision', w.draft_revision);
end;
$$;

-- Make live (server: the route checks the body and renders each email first). p_emails: [{ step, subject,
-- preheader, html, text, links, from_name, reply_to }]. Returns the new version.
create or replace function public.workflow_publish(p_id uuid, p_user uuid, p_body jsonb, p_emails jsonb, p_note text default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
  v int;
  e jsonb;
  eid uuid;
begin
  select * into w from workflows where id = p_id for update;
  if w.id is null then raise exception 'Workflow not found'; end if;
  v := coalesce((select max(version) from workflow_versions where workflow_id = p_id), 0) + 1;
  insert into workflow_versions (workflow_id, workspace_id, version, body, note, published_by) values (p_id, w.workspace_id, v, p_body, left(p_note, 300), p_user);
  for e in select * from jsonb_array_elements(coalesce(p_emails, '[]')) loop
    eid := email_create(w.workspace_id, p_user, jsonb_build_object('kind', 'journey', 'name', left(w.name || ': ' || coalesce(e->>'subject', ''), 200), 'subject', e->>'subject',
      'preheader', e->>'preheader', 'html', e->>'html', 'text', e->>'text', 'links', coalesce(e->'links', '[]'), 'marketing', true));
    insert into workflow_emails (workflow_id, version, step_id, email_id) values (p_id, v, e->>'step', eid);
  end loop;
  update workflows set status = 'live', live_version = v, trigger_kind = p_body->'trigger'->>'kind', live_at = coalesce(case when status = 'live' then live_at end, now()), draft = p_body, updated_at = now() where id = p_id;
  delete from workflow_watch where workflow_id = p_id;
  if p_body->'trigger'->>'kind' = 'field' then
    insert into workflow_watch (workspace_id, workflow_id, key) values (w.workspace_id, p_id, p_body->'trigger'->>'key') on conflict do nothing;
  end if;
  insert into audit_log (workspace_id, actor, action, target, data) values (w.workspace_id, p_user, 'workflow.publish', p_id::text, jsonb_build_object('version', v));
  return v;
end;
$$;

-- Pause keeps everyone where they are; live again picks them up. Draft only before the first publish.
create or replace function public.workflow_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  if p_status not in ('live', 'paused') then raise exception 'Pick live or paused'; end if;
  if p_status = 'live' and w.live_version is null then raise exception 'Make it live first'; end if;
  update workflows set status = p_status, updated_at = now() where id = p_id;
  insert into audit_log (workspace_id, actor, action, target) values (w.workspace_id, auth.uid(), 'workflow.' || p_status, p_id::text);
end;
$$;

create or replace function public.workflow_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  delete from workflows where id = p_id;
  insert into audit_log (workspace_id, actor, action, target, data) values (w.workspace_id, auth.uid(), 'workflow.delete', p_id::text, jsonb_build_object('name', w.name));
end;
$$;

-- Add contacts by hand to a live workflow. Returns how many started.
create or replace function public.workflow_enter(p_id uuid, p_contacts uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  w workflows%rowtype;
  n int;
begin
  select * into w from workflows where id = p_id;
  if w.id is null or not is_member(w.workspace_id) then raise exception 'Workflow not found'; end if;
  if w.status <> 'live' then raise exception 'Make the workflow live first'; end if;
  if cardinality(p_contacts) > 5000 then raise exception 'Up to 5,000 at a time'; end if;
  insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key, at_step)
  select w.workspace_id, w.id, w.live_version, c.id, 'manual:' || c.id || ':' || to_char(now(), 'YYYY-MM-DD'), null
  from contacts c where c.workspace_id = w.workspace_id and c.id = any(p_contacts) and c.deleted_at is null
    and workflow_may_start(w.id, c.id)
  on conflict (workflow_id, key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- A failed step, tried again by hand: the run goes back to it, now.
create or replace function public.workflow_retry(p_run uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  failed text;
begin
  select * into r from workflow_runs where id = p_run for update;
  if r.id is null or not is_member(r.workspace_id) then raise exception 'Run not found'; end if;
  select step_id into failed from workflow_steps_done where run_id = p_run and status = 'failed' order by at desc limit 1;
  if failed is null then raise exception 'Nothing failed on this run'; end if;
  delete from workflow_steps_done where run_id = p_run and step_id = failed;
  update workflow_runs set status = 'active', at_step = failed, next_at = now(), ended_at = null, exit_reason = null, claimed_at = null where id = p_run;
  insert into audit_log (workspace_id, actor, action, target, data) values (r.workspace_id, auth.uid(), 'workflow.retry', p_run::text, jsonb_build_object('step', failed));
end;
$$;

create or replace function public.email_template_save(p_ws uuid, p_id uuid, p_name text, p_body jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Name the template'; end if;
  if p_id is null then
    if (select count(*) from email_templates where workspace_id = p_ws) >= 200 then raise exception 'Up to 200 templates'; end if;
    insert into email_templates (workspace_id, name, body, created_by) values (p_ws, left(trim(p_name), 120), p_body, auth.uid()) returning id into tid;
  else
    update email_templates set name = left(trim(p_name), 120), body = p_body, updated_at = now() where id = p_id and workspace_id = p_ws returning id into tid;
    if tid is null then raise exception 'Template not found'; end if;
  end if;
  return tid;
end;
$$;

create or replace function public.email_template_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from email_templates where id = p_id;
  if ws is null or not is_member(ws) then raise exception 'Template not found'; end if;
  delete from email_templates where id = p_id;
end;
$$;

-- Starting runs (server) ----------------------------------------------------------------------------------------------

-- The entry rule: once ever, or again after the gap; and at most 20 runs at once per contact.
create or replace function public.workflow_may_start(p_workflow uuid, p_contact uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    (select count(*) from workflow_runs r where r.contact_id = p_contact and r.status in ('active', 'waiting')) < 20
    and case coalesce((select v.body->'entry'->>'mode' from workflows w join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version where w.id = p_workflow), 'once')
      when 'once' then not exists (select 1 from workflow_runs r where r.workflow_id = p_workflow and r.contact_id = p_contact)
      else not exists (select 1 from workflow_runs r where r.workflow_id = p_workflow and r.contact_id = p_contact
        and r.started_at > now() - make_interval(days => coalesce((select (v.body->'entry'->>'gapDays')::int from workflows w join workflow_versions v on v.workflow_id = w.id and v.version = w.live_version where w.id = p_workflow), 30)))
    end;
$$;

-- Read new trigger events for every live workflow and start a run for each. The scan reads back 15 minutes, because
-- a slow transaction can commit an event after a later one was read; a run's key is its event, so reading an event
-- twice starts nothing new. Only events since the workflow went live count. Returns how many runs started.
create or replace function public.workflow_scan() returns int
language plpgsql security definer set search_path = public as $$
declare
  w record;
  t jsonb;
  started int := 0;
  k int;
  since timestamptz;
begin
  for w in
    select f.id, f.workspace_id, f.live_version, f.live_at, v.body from workflows f join workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
    where f.status = 'live' and f.trigger_kind not in ('manual')
  loop
    t := w.body->'trigger';
    since := greatest(w.live_at, now() - interval '15 minutes');
    if t->>'kind' in ('form', 'meeting', 'not_booked', 'outcome', 'band', 'routed', 'segment', 'field', 'clicked') then
      insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
      select distinct on (e.contact_id) w.workspace_id, w.id, w.live_version, e.contact_id, 'ev:' || e.id::text
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = w.workspace_id and e.at >= since and e.at <= now()
        and case t->>'kind'
          when 'form' then e.kind = 'form.submitted' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'meeting' then e.kind = any(array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x))
            and (jsonb_array_length(coalesce(t->'types', '[]')) = 0 or t->'types' ? (e.data->>'type_id'))
          when 'not_booked' then e.kind = 'meeting.not_booked' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'outcome' then e.kind = 'lead.outcome' and t->'outcomes' ? (e.data->>'outcome')
          when 'band' then e.kind = 'lead.band' and (jsonb_array_length(coalesce(t->'bands', '[]')) = 0 or t->'bands' ? (e.data->>'to'))
          when 'routed' then (e.kind = 'lead.routed' and t->>'result' in ('routed', 'any')) or (e.kind = 'lead.unassigned' and t->>'result' in ('unassigned', 'any'))
          when 'segment' then e.kind = case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end and e.data->>'segment_id' = t->>'segment'
          when 'field' then e.kind = 'field.changed' and e.data->>'key' = t->>'key' and (coalesce(t->>'to', '') = '' or e.data->>'new' = to_jsonb(t->>'to')::text or e.data->'new' = to_jsonb(t->>'to'))
          when 'clicked' then e.kind = 'email.clicked' and (jsonb_array_length(coalesce(t->'emails', '[]')) = 0 or t->'emails' ? (e.data->>'email_id'))
          else false
        end
        and not exists (select 1 from workflow_runs r where r.workflow_id = w.id and r.key = 'ev:' || e.id::text)
        and workflow_may_start(w.id, e.contact_id)
      order by e.contact_id, e.at
      on conflict (workflow_id, key) do nothing;
      get diagnostics k = row_count;
      started := started + k;
    elsif t->>'kind' = 'broadcast' then
      -- Once, at its time, to everyone in the segment then.
      if (t->>'at')::timestamptz <= now() then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, m.contact_id, 'bc:' || m.contact_id
        from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
        where m.segment_id = (t->>'segment')::uuid and m.left_at is null
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
      end if;
    elsif t->>'kind' = 'date' then
      -- Each day after the hour: contacts whose date field, moved by the days, is today.
      if to_char(now(), 'HH24:MI') >= coalesce(t->>'time', '09:00') then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, c.id, 'date:' || c.id || ':' || current_date
        from contacts c
        where c.workspace_id = w.workspace_id and c.deleted_at is null
          and (case when t->>'field' like 'f.%' then c.fields->>substr(t->>'field', 3) else null end) ~ '^\d{4}-\d{2}-\d{2}'
          and (left(c.fields->>substr(t->>'field', 3), 10)::date + coalesce((t->>'days')::int, 0)) = current_date
          and workflow_may_start(w.id, c.id)
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
      end if;
    end if;
  end loop;
  return started;
end;
$$;

-- Workspaces with runs due get a workflow_run job (one at a time per workspace).
create or replace function public.workflow_due() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select distinct x.workspace_id from workflow_runs x join workflows w on w.id = x.workflow_id and w.status = 'live'
    where x.status in ('active', 'waiting') and x.next_at <= now()
    limit 500
  loop
    perform enqueue_job(r.workspace_id, 'workflow_run', r.workspace_id::text, '{}', 0, 3);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- Running (server) ------------------------------------------------------------------------------------------------

-- Due runs of live workflows, locked for this worker (a run claimed in the last 2 minutes by another is left).
create or replace function public.workflow_claim(p_ws uuid, p_limit int default 200) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ids uuid[];
begin
  ids := array(
    select x.id from workflow_runs x join workflows w on w.id = x.workflow_id and w.status = 'live'
    where x.workspace_id = p_ws and x.status in ('active', 'waiting') and x.next_at <= now() and (x.claimed_at is null or x.claimed_at < now() - interval '2 minutes')
    order by x.next_at limit least(greatest(p_limit, 1), 500)
    for update of x skip locked);
  update workflow_runs set claimed_at = now() where id = any(ids);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'workflow_id', r.workflow_id, 'workflow_name', w.name, 'version', r.version, 'contact_id', r.contact_id, 'at_step', r.at_step,
      'wait', r.wait, 'started_at', r.started_at, 'next_at', r.next_at, 'body', v.body) order by r.next_at)
    from workflow_runs r join workflows w on w.id = r.workflow_id join workflow_versions v on v.workflow_id = r.workflow_id and v.version = r.version
    where r.id = any(ids)), '[]');
end;
$$;

-- What a run's steps read about its contact.
create or replace function public.workflow_facts(p_run uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
      'title', c.title, 'seniority', c.seniority, 'department', c.department, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle,
      'lead_status', c.lead_status, 'score', c.score, 'score_band', c.score_band, 'qualify_outcome', c.qualify_outcome, 'timezone', c.timezone,
      'owner', c.owner_user_id, 'fields', c.fields, 'deleted', c.deleted_at is not null, 'merged_into', c.merged_into,
      'suppressed', exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'company', (select jsonb_strip_nulls(jsonb_build_object('name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size, 'employees', co.employees, 'country', co.country)) from companies co where co.id = c.company_id),
    'answers', coalesce((select s."values" from submissions s where s.contact_id = c.id and not s.test order by s.created_at desc limit 1), '{}'),
    'booked', exists (select 1 from meetings m where m.contact_id = c.id and m.created_at >= r.started_at and m.status in ('booked', 'held')),
    'tz', coalesce(c.timezone, (select timezone from send_settings where workspace_id = r.workspace_id)),
    'owner', (select jsonb_build_object('id', u.id, 'email', u.email,
                'name', coalesce((select nullif(trim(bp.name), '') from booking_profiles bp where bp.workspace_id = r.workspace_id and bp.user_id = u.id), split_part(u.email, '@', 1)))
              from auth.users u where u.id = c.owner_user_id))
  from workflow_runs r join contacts c on c.id = r.contact_id where r.id = p_run;
$$;

-- Before a step acts: its ledger row. Returns 'new' (go ahead) or the status a run already wrote (skip it).
create or replace function public.workflow_step_begin(p_run uuid, p_step text, p_visit int default 1) returns text
language plpgsql security definer set search_path = public as $$
declare
  st text;
  ws uuid;
begin
  select workspace_id into ws from workflow_runs where id = p_run;
  insert into workflow_steps_done (run_id, workspace_id, step_id, visit, status) values (p_run, ws, p_step, p_visit, 'running')
  on conflict (run_id, step_id, visit) do nothing;
  if found then return 'new'; end if;
  select status into st from workflow_steps_done where run_id = p_run and step_id = p_step and visit = p_visit;
  return st;
end;
$$;

-- After a step: its result, and where the run goes next, in one transaction. Returns whether the workflow is still
-- live, so a run stops after the current step when someone pauses it mid-run.
--   p_next: the next step id (null with p_run_status 'done' ends it). p_next_at: when (a Wait). p_wait: a Wait until.
create or replace function public.workflow_step_done(p_run uuid, p_step text, p_visit int, p_status text, p_result jsonb, p_next text, p_next_at timestamptz, p_wait jsonb, p_run_status text, p_exit text default null) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  wid uuid;
begin
  if p_step is not null then
    update workflow_steps_done set status = p_status, result = coalesce(p_result, '{}'), at = now() where run_id = p_run and step_id = p_step and visit = p_visit;
  end if;
  update workflow_runs set
    at_step = p_next,
    next_at = coalesce(p_next_at, now()),
    wait = p_wait,
    status = p_run_status,
    exit_reason = case when p_run_status in ('done', 'exited', 'failed') then coalesce(p_exit, exit_reason) else null end,
    ended_at = case when p_run_status in ('done', 'exited', 'failed') then now() else null end,
    claimed_at = null
  where id = p_run
  returning workflow_id into wid;
  return exists (select 1 from workflows where id = wid and status = 'live');
end;
$$;

-- A Wait until: whether the event happened since it began (and, for a segment or outcome, which).
create or replace function public.workflow_event_since(p_run uuid, p_kind text, p_since timestamptz) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workflow_runs r join contact_events e on e.contact_id = r.contact_id and e.workspace_id = r.workspace_id
                 where r.id = p_run and e.kind = p_kind and e.at >= p_since);
$$;

-- Send email: one message per run and step (the dedupe key), through the guard at send time. "From their rep" uses
-- the rep's name and reply-to address. Returns the message id, or null when one was queued before.
create or replace function public.workflow_email(p_run uuid, p_step text, p_vars jsonb, p_from_name text, p_reply_to text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  eid uuid;
  c contacts%rowtype;
  mid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  select email_id into eid from workflow_emails where workflow_id = r.workflow_id and version = r.version and step_id = p_step;
  if eid is null then raise exception 'This email was never made live'; end if;
  select * into c from contacts where id = r.contact_id and deleted_at is null;
  if c.id is null or coalesce(c.email_clean, '') = '' then return null; end if;
  insert into email_messages (workspace_id, email_id, contact_id, to_email, dedupe, vars, from_name, reply_to)
  values (r.workspace_id, eid, c.id, c.email_clean, 'wf:' || p_run || ':' || p_step, p_vars, left(p_from_name, 80), left(p_reply_to, 254))
  on conflict (workspace_id, dedupe) do nothing
  returning id into mid;
  if mid is not null then perform enqueue_job(r.workspace_id, 'send', r.workspace_id::text, '{}', 0, 3); end if;
  return mid;
end;
$$;

-- Create task: once per run and step.
create or replace function public.workflow_task(p_run uuid, p_step text, p_title text, p_assignee uuid, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  tid uuid;
begin
  select * into r from workflow_runs where id = p_run;
  insert into tasks (workspace_id, object, record_id, title, due, assignee, idem_key)
  values (r.workspace_id, 'contact', r.contact_id, left(p_title, 300), p_due,
          case when exists (select 1 from workspace_members m where m.workspace_id = r.workspace_id and m.user_id = p_assignee) then p_assignee end,
          'wf:' || p_run || ':' || p_step)
  on conflict (workspace_id, idem_key) where idem_key is not null do nothing
  returning id into tid;
  return tid;
end;
$$;

-- Add to or remove from a list.
create or replace function public.workflow_list(p_run uuid, p_action text, p_segment uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
begin
  select * into r from workflow_runs where id = p_run;
  if not exists (select 1 from segments where id = p_segment and workspace_id = r.workspace_id and kind = 'static') then return false; end if;
  if p_action = 'add' then
    insert into segment_members (workspace_id, segment_id, contact_id) values (r.workspace_id, p_segment, r.contact_id)
    on conflict (segment_id, contact_id) do update set left_at = null, entered_at = case when segment_members.left_at is null then segment_members.entered_at else now() end;
  else
    update segment_members set left_at = now() where segment_id = p_segment and contact_id = r.contact_id and left_at is null;
  end if;
  update segments set count = (select count(*) from segment_members where segment_id = p_segment and left_at is null), refreshed_at = now() where id = p_segment;
  return true;
end;
$$;

-- Push to the CRM: the contact counts as changed, and every source that takes pushes is asked to run.
create or replace function public.workflow_crm(p_run uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
  s record;
  n int := 0;
begin
  select * into r from workflow_runs where id = p_run;
  update contacts set updated_at = now() where id = r.contact_id;
  for s in select id, workspace_id from sources where workspace_id = r.workspace_id and kind in ('hubspot', 'salesforce', 'omniscient', 'pipedrive', 'attio', 'close') loop
    perform enqueue_job(s.workspace_id, 'crm_push', s.id::text, jsonb_build_object('source_id', s.id), 0, 5);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- A run whose contact was merged follows the contact it was merged into, unless that contact has a run of this
-- workflow already (going or finished): then one is enough, and this one ends. Returns whether it followed.
create or replace function public.workflow_follow(p_run uuid, p_contact uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  r workflow_runs%rowtype;
begin
  select * into r from workflow_runs where id = p_run for update;
  if not exists (select 1 from contacts c where c.id = p_contact and c.workspace_id = r.workspace_id and c.deleted_at is null) then return false; end if;
  if exists (select 1 from workflow_runs x where x.workflow_id = r.workflow_id and x.contact_id = p_contact and x.id <> r.id) then
    update workflow_runs set status = 'exited', exit_reason = 'merged into another run', ended_at = now(), claimed_at = null where id = p_run;
    return false;
  end if;
  update workflow_runs set contact_id = p_contact where id = p_run;
  return true;
end;
$$;

-- Slack: the workspace's Claritia app (sealed) and the teammate's email to DM.
create or replace function public.workflow_slack(p_run uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('sealed', (select s.sealed from slack_installs s where s.workspace_id = r.workspace_id),
    'email', (select u.email from auth.users u join workspace_members m on m.user_id = u.id and m.workspace_id = r.workspace_id where u.id = p_user))
  from workflow_runs r where r.id = p_run;
$$;

-- Try a contact: the same facts a run reads, for a contact not in the workflow (a member's own workspace only).
create or replace function public.workflow_preview_facts(p_contact uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_member(c.workspace_id) then jsonb_build_object(
    'contact', jsonb_build_object('id', c.id, 'email', c.email_clean, 'email_class', c.email_class, 'first_name', c.first_name, 'last_name', c.last_name,
      'title', c.title, 'seniority', c.seniority, 'department', c.department, 'country', c.country, 'region', c.region, 'lifecycle', c.lifecycle,
      'lead_status', c.lead_status, 'score', c.score, 'score_band', c.score_band, 'qualify_outcome', c.qualify_outcome, 'timezone', c.timezone,
      'owner', c.owner_user_id, 'fields', c.fields, 'deleted', false, 'merged_into', null,
      'suppressed', exists (select 1 from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean)),
    'company', (select jsonb_strip_nulls(jsonb_build_object('name', co.name, 'domain', co.domain, 'industry', co.industry, 'size', co.size, 'employees', co.employees, 'country', co.country)) from companies co where co.id = c.company_id),
    'answers', coalesce((select s."values" from submissions s where s.contact_id = c.id and not s.test order by s.created_at desc limit 1), '{}'),
    'booked', false,
    'tz', c.timezone,
    'owner', null) end
  from contacts c where c.id = p_contact and c.deleted_at is null;
$$;

-- Workflow emails get merge values and per-message sender overrides.
create or replace function public.send_claim(p_ws uuid, p_limit int default 14) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  s send_settings;
  room int;
  m record;
  g jsonb;
  out jsonb := '[]';
  d sending_domains;
  tries int;
begin
  update email_messages set status = 'unknown', error = 'The worker stopped mid-send; not sent again in case it went out'
  where workspace_id = p_ws and status = 'sending' and claimed_at < now() - interval '10 minutes';

  select * into s from send_settings where workspace_id = p_ws;
  if s.workspace_id is null or s.paused then return out; end if;
  room := s.per_day - (select count(*) from email_messages where workspace_id = p_ws and sent_at > now() - interval '1 day');
  if room <= 0 then return out; end if;

  for m in
    select x.id, x.to_email, x.contact_id, x.email_id, x.vars, x.from_name, x.reply_to from email_messages x
    where x.workspace_id = p_ws and x.status = 'queued' and x.send_after <= now()
    order by x.send_after, x.id
    limit least(greatest(coalesce(p_limit, 14), 1), room, 200)
    for update skip locked
  loop
    g := email_guard(m.id);
    if g is null then
      update email_messages set status = 'sending', claimed_at = now(), attempts = attempts + 1 where id = m.id returning attempts into tries;
      select * into d from verified_domain_for(p_ws, coalesce((select from_email from emails where id = m.email_id), s.from_email));
      out := out || jsonb_build_array((
        select jsonb_build_object(
          'id', m.id, 'to', m.to_email, 'contact_id', m.contact_id, 'email_id', e.id, 'kind', e.kind, 'marketing', e.marketing,
          'subject', e.subject, 'preheader', e.preheader, 'html', e.html, 'text', e.text, 'links', to_jsonb(e.links),
          'from_name', coalesce(m.from_name, e.from_name, s.from_name), 'from_email', coalesce(e.from_email, s.from_email),
          'reply_to', coalesce(m.reply_to, s.reply_to), 'address', s.address, 'topic', (select name from topics where id = e.topic_id),
          'mail_from', d.mail_from, 'per_second', s.per_second, 'attempts', tries, 'vars', m.vars)
        from emails e where e.id = m.email_id));
    elsif g->>'reason' = 'quiet' then
      update email_messages set send_after = (g->>'retry_at')::timestamptz where id = m.id;
    else
      update email_messages set status = 'skipped', skip_reason = g->>'reason' where id = m.id;
    end if;
  end loop;
  return out;
end;
$$;

-- The minute: start runs and move due ones (added to minute_tick's work).
create or replace function public.workflows_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform workflow_scan();
  perform workflow_due();
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('claritia-workflows') where exists (select 1 from cron.job where jobname = 'claritia-workflows');
    perform cron.schedule('claritia-workflows', '* * * * *', 'select public.workflows_tick()');
  end if;
end;
$$;

-- Nurtures into workflows ---------------------------------------------------------------------------------------------

-- Each nurture becomes a draft workflow: its trigger, its waits and emails (approval kept), and "leaves at stage" as a
-- goal. A live one is left for its owner to make live again from the editor (its emails get rendered there).
create or replace function public.nurture_to_workflow(p_nurture uuid) returns uuid
language sql security definer set search_path = public as $$
  insert into workflows (id, workspace_id, name, status, draft, created_by, created_at)
  select n.id, n.workspace_id, left(n.name, 120), 'draft',
    jsonb_build_object(
      'trigger', case when n.trigger->>'kind' = 'segment' then jsonb_build_object('kind', 'segment', 'segment', n.trigger->>'segment_id', 'on', 'entered')
                      else jsonb_build_object('kind', 'form', 'forms', jsonb_build_array(n.trigger->>'form_id')) end,
      'goals', case when cardinality(n.exit_stages) > 0 then jsonb_build_array(jsonb_build_object('kind', 'lifecycle', 'stages', to_jsonb(n.exit_stages))) else '[]'::jsonb end,
      'entry', jsonb_build_object('mode', 'once', 'gapDays', 30),
      'steps', coalesce((
        select jsonb_agg(x order by o) from (
          select st.position * 2 as o, jsonb_build_object('id', 'w' || st.position, 'kind', 'wait', 'days', st.wait_days, 'hours', 0) as x from nurture_steps st where st.nurture_id = n.id and st.wait_days > 0
          union all
          select st.position * 2 + 1, jsonb_build_object('id', 'e' || st.position, 'kind', 'email', 'from', 'team', 'approved', st.approved_at is not null, 'ai', st.ai,
            'email', jsonb_build_object('subject', e.subject, 'preheader', coalesce(e.preheader, ''), 'paragraphs', jsonb_build_array(e.text), 'cta_label', '', 'cta_url', ''))
          from nurture_steps st join emails e on e.id = st.email_id where st.nurture_id = n.id
        ) y), '[]'::jsonb)),
    n.created_by, n.created_at
  from nurtures n where n.id = p_nurture
  on conflict (id) do nothing
  returning id;
$$;
select nurture_to_workflow(id) from nurtures;

-- Counts for the screens -----------------------------------------------------------------------------------------------

-- The editor's numbers: who entered in 7 days, and each step's count in 7 days (steps done, skips left out).
create or replace function public.workflow_stats(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from workflows where id = p_id;
  if ws is null or not is_member(ws) then raise exception 'Workflow not found'; end if;
  return jsonb_build_object(
    'entered', (select count(*) from workflow_runs where workflow_id = p_id and started_at > now() - interval '7 days'),
    'active', (select count(*) from workflow_runs where workflow_id = p_id and status in ('active', 'waiting')),
    'steps', coalesce((select jsonb_object_agg(step_id, n) from (
      select d.step_id, count(*) as n from workflow_steps_done d join workflow_runs r on r.id = d.run_id
      where r.workflow_id = p_id and d.workspace_id = ws and d.at > now() - interval '7 days' and d.status = 'done'
      group by d.step_id) x), '{}'::jsonb));
end;
$$;

-- The list's numbers: people in each workflow now, and entries per day for 30 days (oldest first).
create or replace function public.workflows_overview(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return coalesce((
    select jsonb_object_agg(w.id, jsonb_build_object(
      'active', (select count(*) from workflow_runs r where r.workflow_id = w.id and r.status in ('active', 'waiting')),
      'days', (select jsonb_agg(coalesce(c.n, 0) order by d.day) from generate_series(current_date - 29, current_date, interval '1 day') as d(day)
               left join (select started_at::date as day, count(*) as n from workflow_runs r where r.workflow_id = w.id and r.started_at > current_date - 30 group by 1) c on c.day = d.day::date)))
    from workflows w where w.workspace_id = p_ws), '{}'::jsonb);
end;
$$;

-- Grants ------------------------------------------------------------------------------------------------------------

revoke execute on function public.workflow_save(uuid, uuid, text, jsonb, int) from public, anon;
revoke execute on function public.workflow_set_status(uuid, text) from public, anon;
revoke execute on function public.workflow_delete(uuid) from public, anon;
revoke execute on function public.workflow_enter(uuid, uuid[]) from public, anon;
revoke execute on function public.workflow_retry(uuid) from public, anon;
revoke execute on function public.email_template_save(uuid, uuid, text, jsonb) from public, anon;
revoke execute on function public.email_template_delete(uuid) from public, anon;
grant execute on function public.workflow_retry(uuid) to authenticated;
revoke execute on function public.workflow_stats(uuid) from public, anon;
revoke execute on function public.workflows_overview(uuid) from public, anon;
grant execute on function public.workflow_stats(uuid) to authenticated;
grant execute on function public.workflows_overview(uuid) to authenticated;
grant execute on function public.email_template_save(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.email_template_delete(uuid) to authenticated;
revoke execute on function public.workflow_preview_facts(uuid) from public, anon;
grant execute on function public.workflow_preview_facts(uuid) to authenticated;
grant execute on function public.workflow_save(uuid, uuid, text, jsonb, int) to authenticated;
grant execute on function public.workflow_set_status(uuid, text) to authenticated;
grant execute on function public.workflow_delete(uuid) to authenticated;
grant execute on function public.workflow_enter(uuid, uuid[]) to authenticated;
revoke execute on function public.workflow_publish(uuid, uuid, jsonb, jsonb, text) from public, anon, authenticated;
revoke execute on function public.workflow_may_start(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.workflow_scan() from public, anon, authenticated;
revoke execute on function public.workflow_due() from public, anon, authenticated;
revoke execute on function public.workflow_claim(uuid, int) from public, anon, authenticated;
revoke execute on function public.workflow_facts(uuid) from public, anon, authenticated;
revoke execute on function public.workflow_step_begin(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.workflow_step_done(uuid, text, int, text, jsonb, text, timestamptz, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.workflow_event_since(uuid, text, timestamptz) from public, anon, authenticated;
revoke execute on function public.workflow_email(uuid, text, jsonb, text, text) from public, anon, authenticated;
revoke execute on function public.workflow_task(uuid, text, text, uuid, date) from public, anon, authenticated;
revoke execute on function public.workflow_list(uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.workflow_crm(uuid) from public, anon, authenticated;
revoke execute on function public.workflows_tick() from public, anon, authenticated;
revoke execute on function public.workflow_follow(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.nurture_to_workflow(uuid) from public, anon, authenticated;
revoke execute on function public.workflow_slack(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.send_claim(uuid, int) from public, anon, authenticated;
revoke execute on function public.contacts_band_event() from public, anon, authenticated;
revoke execute on function public.field_history_event() from public, anon, authenticated;
revoke execute on function public.segment_members_event() from public, anon, authenticated;
grant execute on function public.workflow_publish(uuid, uuid, jsonb, jsonb, text) to service_role;
grant execute on function public.workflow_may_start(uuid, uuid) to service_role;
grant execute on function public.workflow_scan() to service_role;
grant execute on function public.workflow_due() to service_role;
grant execute on function public.workflow_claim(uuid, int) to service_role;
grant execute on function public.workflow_facts(uuid) to service_role;
grant execute on function public.workflow_step_begin(uuid, text, int) to service_role;
grant execute on function public.workflow_step_done(uuid, text, int, text, jsonb, text, timestamptz, jsonb, text, text) to service_role;
grant execute on function public.workflow_event_since(uuid, text, timestamptz) to service_role;
grant execute on function public.workflow_email(uuid, text, jsonb, text, text) to service_role;
grant execute on function public.workflow_task(uuid, text, text, uuid, date) to service_role;
grant execute on function public.workflow_list(uuid, text, uuid) to service_role;
grant execute on function public.workflow_crm(uuid) to service_role;
grant execute on function public.workflows_tick() to service_role;
grant execute on function public.workflow_follow(uuid, uuid) to service_role;
grant execute on function public.nurture_to_workflow(uuid) to service_role;
grant execute on function public.workflow_slack(uuid, uuid) to service_role;
grant execute on function public.send_claim(uuid, int) to service_role;
grant select, insert, update, delete on public.workflows, public.workflow_versions, public.workflow_emails, public.workflow_runs, public.workflow_steps_done, public.workflow_watch, public.email_templates to service_role;
