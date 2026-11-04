-- Production catch-up, November 4 2026 (scripts/check-migrations.sql showed these missing): 105, 109-111, 115-119, 122
-- and 123, with 114 and 121 (safe to run again), in order, in one transaction: it all goes in or nothing changes.
-- Tested on a copy of production's state: afterwards its schema matches a database that ran every migration in order.
begin;

-- ===== 105_form_result_events.sql =====
-- Interactive forms: the funnel counts results (docs/interactive-forms-plan.md Part 7). A visitor who saw a result
-- screen counts once per form every 30 minutes, the same way views and starts do. Run after 104. Safe to run more
-- than once.

alter table public.form_daily add column if not exists results int not null default 0;
alter table public.form_seen drop constraint if exists form_seen_kind_check;
alter table public.form_seen add constraint form_seen_kind_check check (kind in ('view', 'start', 'result'));

create or replace function public.form_seen(p_form uuid, p_vid text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  hit boolean;
begin
  if p_kind not in ('view', 'start', 'result') or p_vid !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null then return false; end if;
  insert into form_seen (form_id, vid, kind, at) values (p_form, p_vid, p_kind, now())
  on conflict (form_id, vid, kind) do update set at = now() where form_seen.at < now() - interval '30 minutes'
  returning true into hit;
  if not coalesce(hit, false) then return false; end if;
  insert into form_daily (form_id, workspace_id, day, views, starts, results)
  values (p_form, f.workspace_id, (now() at time zone ws_tz(f.workspace_id))::date, (p_kind = 'view')::int, (p_kind = 'start')::int, (p_kind = 'result')::int)
  on conflict (form_id, day) do update set views = form_daily.views + excluded.views, starts = form_daily.starts + excluded.starts, results = form_daily.results + excluded.results;
  return true;
end;
$$;

-- ===== 109_form_live_kit.sql =====
-- A published form keeps the brand kit it was published with (docs/form-kinds-plan.md, step 0). Before this, the
-- public form read the form's current kit, so picking another kit in the builder changed the live form at once,
-- without Publish. Now Publish copies the kit over, and the live form reads that copy.

alter table forms add column if not exists live_kit_id uuid references brand_kits(id) on delete set null;
update forms set live_kit_id = brand_kit_id where version > 0 and live_kit_id is null;

create or replace function public.form_publish(p_id uuid, p_user uuid, p_body jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  v int;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not exists (select 1 from workspace_members where workspace_id = f.workspace_id and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  v := f.version + 1;
  insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, p_user);
  update forms set version = v, live_kit_id = brand_kit_id, status = case when status = 'paused' then 'paused' else 'live' end, published_at = now(), updated_at = now() where id = p_id;
  return v;
end;
$$;

create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

-- A fill started before a publish is checked against the version the visitor saw, so publishing never loses it.
create or replace function public.form_version_body(p_form uuid, p_version int) returns jsonb
language sql stable security definer set search_path = public as $$
  select body from form_versions where form_id = p_form and version = p_version;
$$;

do $$
begin
  revoke execute on function public.form_version_body(uuid, int) from public, anon, authenticated;
  grant execute on function public.form_version_body(uuid, int) to service_role;
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  revoke execute on function public.form_publish(uuid, uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
end;
$$;

-- ===== 110_form_pay_resume.sql =====
-- Forms step 3 (docs/form-kinds-plan.md): payments on the workspace's own Stripe account, and save and finish later.
--   A form with a payment block opens Stripe Checkout on the connected account (the same Connect Standard account
--   paid meetings use) after the fill is saved; the submission keeps the payment's state, which the webhook moves to
--   paid, expired or failed. A visitor can save a long form and get a link by email that opens it where they stopped.

alter table submissions add column if not exists payment jsonb check (payment is null or jsonb_typeof(payment) = 'object');

-- Merge a patch into a submission's payment (service role: the submit route and the Stripe webhook).
create or replace function public.submission_payment(p_sid uuid, p_patch jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update submissions set payment = coalesce(payment, '{}'::jsonb) || p_patch where id = p_sid returning payment;
$$;

-- Saved fills, by a token sent to the visitor's email. Kept 30 days.
create table if not exists public.form_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  email text not null check (length(email) between 3 and 320),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  step int not null default 0 check (step between 0 and 100),
  page text check (length(page) <= 1000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists form_drafts_form on public.form_drafts (form_id, created_at desc);
alter table public.form_drafts enable row level security;
revoke all on public.form_drafts from anon, authenticated;

create or replace function public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step int, p_page text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  did uuid;
begin
  select f.workspace_id into ws from forms f where f.id = p_form and f.status = 'live';
  if ws is null then
    raise exception 'This form isn''t taking answers';
  end if;
  -- At most 200 saves a form an hour from everyone: a script can't fill the table.
  if (select count(*) from form_drafts where form_id = p_form and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many saves';
  end if;
  delete from form_drafts where expires_at < now();
  insert into form_drafts (workspace_id, form_id, token, email, answers, step, page) values (ws, p_form, p_token, p_email, p_answers, p_step, p_page) returning form_drafts.id into did;
  return did;
end;
$$;

create or replace function public.form_draft_get(p_form uuid, p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('answers', answers, 'step', step, 'email', email, 'page', page)
  from form_drafts where form_id = p_form and token = p_token and expires_at > now();
$$;

-- What the resume email needs: the form's name, its workspace and the draft.
create or replace function public.form_draft_info(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('form', f.name, 'form_id', f.id, 'workspace_id', d.workspace_id, 'email', d.email, 'token', d.token, 'page', d.page,
           'workspace', (select name from workspaces w where w.id = d.workspace_id), 'sending', meeting_sending(d.workspace_id))
  from form_drafts d join forms f on f.id = d.form_id where d.id = p_id and d.expires_at > now();
$$;

do $$
begin
  revoke execute on function public.submission_payment(uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.submission_payment(uuid, jsonb) to service_role;
  revoke execute on function public.form_draft_save(uuid, text, text, jsonb, int, text) from public, anon, authenticated;
  grant execute on function public.form_draft_save(uuid, text, text, jsonb, int, text) to service_role;
  revoke execute on function public.form_draft_get(uuid, text) from public, anon, authenticated;
  grant execute on function public.form_draft_get(uuid, text) to service_role;
  revoke execute on function public.form_draft_info(uuid) from public, anon, authenticated;
  grant execute on function public.form_draft_info(uuid) to service_role;
end;
$$;

-- ===== 111_brand_skin.sql =====
-- The brand skin (docs/brand-skin.md): the stylesheet Claude writes from the site's real controls, read in a browser
-- by the runner's brand scan, and the font files it uses. Every form in the kit's brand wears it, live and in previews.

alter table brand_kits add column if not exists skin jsonb check (skin is null or (jsonb_typeof(skin) = 'object' and length(skin::text) <= 60000));

-- Saved by the runner (service role) once the skin is written.
create or replace function public.brand_kit_skin(p_kit uuid, p_skin jsonb) returns void
language sql security definer set search_path = public as $$
  update brand_kits set skin = p_skin, updated_at = now() where id = p_kit;
$$;

-- The live form also carries its kit's skin.
create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url, 'design', coalesce(k.design_live, '{}'::jsonb),
           'kit_id', k.id, 'skin', k.skin)
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

do $$
begin
  revoke execute on function public.brand_kit_skin(uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.brand_kit_skin(uuid, jsonb) to service_role;
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
end;
$$;

-- ===== 114_whole_team.sql =====
-- The team every workspace starts with (router key q_everyone) reads "Whole team": teams aren't only sales, and the
-- old names ("Everyone", then "All reps") read badly next to "Everyone else". Only teams still on an old name change;
-- a team someone renamed keeps its name. Router bodies are read the same way in src/lib/router/check.ts (cleanBody).

update public.routing_teams t
set name = 'Whole team', revision = t.revision + 1, updated_at = now()
where t.name in ('All reps', 'Everyone')
  and exists (select 1 from public.routing_team_keys k where k.team_id = t.id and k.key = 'q_everyone');

-- ===== 115_routing_past.sql =====
-- Past fills as rule fields (src/lib/router/conditions.ts PAST_FIELDS): what the person did before this send, read
-- only when a rule tests one. The person is the contact, or the live contact with this email.
--   sent_form: an earlier real send (not spam, not a test) of this form; of any form when no form is given (a
--     booking page). The send being routed now (p_skip) never counts.
--   has_meeting: a booked meeting that hasn't started yet.
--   days_since_booked: whole days since they last booked a meeting that wasn't canceled; null when they never did.

create index if not exists meetings_guest_email on public.meetings (workspace_id, lower(guest_email));

create or replace function public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cid uuid := p_contact;
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  sent boolean := false;
  upcoming boolean := false;
  last_booked timestamptz;
begin
  if cid is null and em is not null then
    select c.id into cid from contacts c where c.workspace_id = p_ws and c.email_clean = em and c.deleted_at is null limit 1;
  end if;
  if cid is not null and em is null then
    select c.email_clean into em from contacts c where c.id = cid and c.workspace_id = p_ws;
  end if;
  if cid is not null then
    select exists (
      select 1 from submissions s
      where s.workspace_id = p_ws and s.contact_id = cid and not s.spam and not s.test
        and (p_form is null or s.form_id = p_form) and (p_skip is null or s.id <> p_skip)
    ) into sent;
  end if;
  if cid is not null or em is not null then
    select
      coalesce(bool_or(m.status = 'booked' and m.start_at > now()), false),
      max(m.created_at) filter (where m.status in ('booked', 'held', 'no_show'))
    into upcoming, last_booked
    from meetings m
    where m.workspace_id = p_ws and ((cid is not null and m.contact_id = cid) or (em is not null and lower(m.guest_email) = em));
  end if;
  return jsonb_build_object(
    'sent_form', sent,
    'has_meeting', upcoming,
    'days_since_booked', case when last_booked is null then null else floor(extract(epoch from (now() - last_booked)) / 86400)::int end
  );
end $$;

revoke all on function public.routing_past(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.routing_past(uuid, uuid, text, uuid, uuid) to service_role;

-- ===== 116_forms_meetings_workflows.sql =====
-- Claritia is Forms, Meetings and Workflows. The CRM screens, Enrichment, Scoring, Visitors and CRM sync are gone from
-- the app and the workers, so nothing runs their jobs any more. This stops the database from queuing them, clears the
-- ones already waiting, and pauses live workflows started by a trigger that's gone. Webhooks from outside form and
-- meeting tools stay (source_hook), and so do deliveries to the tools a form sends to (deliver). No data is deleted:
-- contacts, companies and the rest stay in their tables, and forms, meetings and routing keep using contacts.

-- The job kinds no worker runs now.
create or replace function public.job_kind_removed(p_kind text) returns boolean
language sql immutable as $$
  select p_kind in (
    'stitch', 'device_reset', 'stitch_evidence', 'rebuild', 'privacy', 'identity_changed', 'ip_lookup',
    'enrich_company', 'enrich_contact', 'enrich_backfill', 'qualify', 'score_account', 'account_alert', 'score_refresh',
    'import_file', 'import_undo', 'source_pull', 'crm_push', 'crm_activity', 'segment_refresh'
  )
$$;

-- Every way in (enqueue_job, enqueue_jobs and the database's own functions) inserts into jobs, so one check here
-- covers them all: a removed kind is dropped instead of waiting forever.
create or replace function public.jobs_drop_removed() returns trigger
language plpgsql as $$
begin
  if public.job_kind_removed(new.kind) then return null; end if;
  return new;
end $$;

drop trigger if exists jobs_drop_removed on public.jobs;
create trigger jobs_drop_removed before insert on public.jobs for each row execute function public.jobs_drop_removed();

delete from public.jobs where status in ('queued', 'running') and public.job_kind_removed(kind);

-- Live workflows started by a removed trigger (qualify outcome, score band, segment, field change, product event,
-- date, broadcast, added by hand) stop; they stay as drafts to change or delete.
update public.workflows set status = 'paused', updated_at = now()
where status = 'live' and trigger_kind in ('outcome', 'band', 'segment', 'field', 'product', 'date', 'broadcast', 'manual');

-- Routing no longer waits on a two-way CRM to learn a new owner: nothing syncs it now (097's routing_sync_needed).
create or replace function public.routing_sync_needed(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select false;
$$;
update public.router_runs set sync_state = 'not_required' where sync_state in ('pending', 'failed');

revoke execute on function public.job_kind_removed(text) from public, anon, authenticated;
revoke execute on function public.jobs_drop_removed() from public, anon, authenticated;

-- ===== 117_form_links.sql =====
-- Sharing step 2 (docs/sharing-plan.md): a form's own link ending and emailing its link.
--
-- A form's link can end in a short name: /f/<workspace>/<ending> (the workspace's booking_slug, 053, the same name its
-- meeting links use). The id link /f/<form id> always keeps working, so a printed QR code never breaks. A changed or
-- removed ending still opens its form for 90 days, and no other form can take it meanwhile.

alter table public.forms add column if not exists slug text check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$');
create unique index if not exists forms_slug on public.forms (workspace_id, slug) where slug is not null;

create table if not exists public.form_slug_moves (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  form_id uuid not null references public.forms (id) on delete cascade,
  until timestamptz not null,
  primary key (workspace_id, slug)
);
alter table public.form_slug_moves enable row level security;
revoke all on public.form_slug_moves from anon, authenticated;

-- The form's link parts for its Share tab: the workspace's name in links (made the first time) and the ending.
create or replace function public.form_link(p_form uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  return jsonb_build_object('ws', booking_slug_ensure(f.workspace_id), 'slug', f.slug);
end $$;

-- Set or clear a form's ending. Taken by another form, or by another form's old ending still within its 90 days: refused.
create or replace function public.form_set_slug(p_form uuid, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms;
  s text := nullif(lower(trim(coalesce(p_slug, ''))), '');
begin
  select * into f from forms where id = p_form for update;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  if s is not null and s !~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' then
    raise exception 'Use lowercase letters, numbers and dashes, up to 50';
  end if;
  if s is not distinct from f.slug then return form_link(p_form); end if;
  if s is not null and (
    exists (select 1 from forms o where o.workspace_id = f.workspace_id and o.slug = s and o.id <> f.id)
    or exists (select 1 from form_slug_moves m where m.workspace_id = f.workspace_id and m.slug = s and m.form_id <> f.id and m.until > now())
  ) then
    raise exception 'That ending is taken';
  end if;
  -- The old ending keeps opening this form for 90 days.
  if f.slug is not null then
    insert into form_slug_moves (workspace_id, slug, form_id, until) values (f.workspace_id, f.slug, f.id, now() + interval '90 days')
    on conflict (workspace_id, slug) do update set form_id = excluded.form_id, until = excluded.until;
  end if;
  if s is not null then delete from form_slug_moves where workspace_id = f.workspace_id and slug = s; end if;
  update forms set slug = s, updated_at = now() where id = f.id;
  return form_link(p_form);
end $$;

-- The form an ending opens (server): {id, slug} for a current one, {id, slug, moved: true} for an old one within its
-- 90 days (the page redirects to the current link), null for none.
create or replace function public.form_by_slug(p_ws text, p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('id', f.id, 'slug', f.slug) from forms f join workspaces w on w.id = f.workspace_id
     where w.booking_slug = lower(p_ws) and f.slug = lower(p_slug) limit 1),
    (select jsonb_build_object('id', f.id, 'slug', f.slug, 'moved', true) from form_slug_moves m
     join workspaces w on w.id = m.workspace_id join forms f on f.id = m.form_id
     where w.booking_slug = lower(p_ws) and m.slug = lower(p_slug) and m.until > now() limit 1)
  );
$$;

-- Email a form's link (server): one email, queued to each address once. A repeat call adds nothing; suppressed and
-- bounced addresses are skipped by the send guard as for every email.
create or replace function public.email_queue_to(p_email uuid, p_to text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  n int;
begin
  select * into e from emails where id = p_email;
  if e.id is null then raise exception 'Email not found'; end if;
  if cardinality(p_to) > 50 then raise exception 'Up to 50 addresses at once'; end if;
  insert into email_messages (workspace_id, email_id, to_email, dedupe)
  select e.workspace_id, e.id, a, e.id::text || ':' || a
  from (select distinct lower(trim(x)) as a from unnest(p_to) x) t
  where a ~ '^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$'
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform enqueue_job(e.workspace_id, 'send', e.workspace_id::text, '{}', 0, 3); end if;
  return n;
end $$;

revoke execute on function public.form_by_slug(text, text) from public, anon, authenticated;
revoke execute on function public.email_queue_to(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.form_link(uuid) from public, anon;
revoke execute on function public.form_set_slug(uuid, text) from public, anon;
grant execute on function public.form_link(uuid) to authenticated;
grant execute on function public.form_set_slug(uuid, text) to authenticated;

-- ===== 118_link_domains.sql =====
-- Sharing step 4 (docs/sharing-plan.md): a workspace's own address for its links. One custom domain a workspace,
-- like forms.acme.com, on paid plans: forms.acme.com/<ending> opens a form, /book/<type> a meeting, / the team's
-- booking page. It serves only once its DNS points at Claritia and its certificate is ready (status 'active'), and
-- stops when a re-check finds the DNS pointing elsewhere ('failed'). One hostname is never two workspaces'.

create table if not exists public.link_domains (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  hostname text not null unique check (length(hostname) <= 253 and hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'failed')),
  dns_ok boolean not null default false,
  cert_ok boolean not null default false,
  last_error text check (length(last_error) <= 300),
  checked_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.link_domains enable row level security;
drop policy if exists "members read" on public.link_domains;
create policy "members read" on public.link_domains for select using (is_member(workspace_id));
revoke all on public.link_domains from anon;
revoke insert, update, delete on public.link_domains from authenticated;

-- The workspace name in links for a domain that serves (server, for the proxy): null for any other host.
create or replace function public.link_domain_host(p_host text) returns text
language sql stable security definer set search_path = public as $$
  select w.booking_slug from link_domains d join workspaces w on w.id = d.workspace_id
  where d.hostname = lower(p_host) and d.status = 'active' and w.booking_slug is not null;
$$;

-- Whether a workspace name in links exists (server, for workspace subdomains).
create or replace function public.link_slug_exists(p_slug text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from workspaces where booking_slug = lower(p_slug));
$$;

revoke execute on function public.link_domain_host(text) from public, anon, authenticated;
revoke execute on function public.link_slug_exists(text) from public, anon, authenticated;

-- ===== 119_workflow_defaults.sql =====
-- The starting workflows (docs/workflows.md, "The starting set"): every workspace gets two folders the first time
-- anyone opens Workflows. Notification holds Form announcement and Meeting announcement. Follow-up holds Form follow-up,
-- Meeting follow-up and No-show follow-up. They are drafts with unapproved emails, so nothing sends until someone
-- reads each email and publishes. The bodies come from the app (src/lib/workflows/templates.ts, STARTING); this
-- files them once per workspace, ahead of any older folders, and marks the workspace so a deleted one stays deleted.

alter table public.workspaces add column if not exists workflow_defaults_at timestamptz;

-- No more empty "Workflows" folder for a new workspace: folders made from the old groups only when there is
-- something to file.
create or replace function public.workflow_folders_start(p_ws uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  st record;
  fid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if exists (select 1 from workflow_folders where workspace_id = p_ws) then return 0; end if;
  for st in
    select x.stage, x.label, x.ord from (values ('trial', 'Trial', 1), ('pipeline', 'Pipeline', 2), ('customer', 'Customer', 3)) x(stage, label, ord)
    where exists (select 1 from workflows w where w.workspace_id = p_ws and w.stage = x.stage)
    order by x.ord
  loop
    insert into workflow_folders (workspace_id, name, position) values (p_ws, st.label, n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and stage = st.stage and folder_id is null;
    n := n + 1;
  end loop;
  if exists (select 1 from workflows where workspace_id = p_ws and folder_id is null) then
    insert into workflow_folders (workspace_id, name, position) values (p_ws, 'Workflows', n) returning id into fid;
    update workflows set folder_id = fid where workspace_id = p_ws and folder_id is null;
    n := n + 1;
  end if;
  return n;
end;
$$;

-- p_items: [{ folder, name, draft }] in order. Returns how many workflows it made: 0 after the first time.
create or replace function public.workflow_defaults(p_ws uuid, p_items jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  names text[];
  fname text;
  fid uuid;
  made int := 0;
  i int;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 10 then raise exception 'Bad starting workflows'; end if;
  perform pg_advisory_xact_lock(hashtext('workflow_folders:' || p_ws::text));
  if (select workflow_defaults_at from workspaces where id = p_ws) is not null then return 0; end if;
  update workspaces set workflow_defaults_at = now() where id = p_ws;
  if (select count(*) from workflows where workspace_id = p_ws) + jsonb_array_length(p_items) > 100 then return 0; end if;

  -- The starting folders go first, in the order they're named; older folders move down after them.
  select array_agg(f order by o) into names from (
    select it2->>'folder' f, min(o) o from jsonb_array_elements(p_items) with ordinality x(it2, o) group by it2->>'folder'
  ) g;
  if (select count(*) from workflow_folders where workspace_id = p_ws) + coalesce(array_length(names, 1), 0) > 50 then return 0; end if;
  update workflow_folders set position = position + coalesce(array_length(names, 1), 0) where workspace_id = p_ws;
  for i in 1 .. coalesce(array_length(names, 1), 0) loop
    fname := left(btrim(coalesce(names[i], '')), 60);
    if fname = '' then raise exception 'Name the folder'; end if;
    insert into workflow_folders (workspace_id, name, position) values (p_ws, fname, i - 1);
  end loop;

  for it in select * from jsonb_array_elements(p_items) loop
    if coalesce(btrim(it->>'name'), '') = '' or jsonb_typeof(it->'draft') <> 'object' then raise exception 'Bad starting workflows'; end if;
    select id into fid from workflow_folders where workspace_id = p_ws and name = left(btrim(it->>'folder'), 60) order by position limit 1;
    insert into workflows (workspace_id, name, draft, folder_id, created_by)
    values (p_ws, left(btrim(it->>'name'), 120), it->'draft', fid, auth.uid());
    made := made + 1;
  end loop;
  return made;
end;
$$;

revoke execute on function public.workflow_defaults(uuid, jsonb) from public, anon;
grant execute on function public.workflow_defaults(uuid, jsonb) to authenticated;

-- ===== 121_seat_words.sql =====
-- Plan limits say seats, the word the pricing page uses (docs/pricing.md): a seat is a teammate people can book.
-- Only the messages change; the checks are the same as in 120_plans.sql.

create or replace function public.plan_check_type(p_ws uuid, p_id uuid, p_type jsonb) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  p text := workspace_plan(p_ws);
  v_kind text := coalesce(p_type ->> 'kind', 'one');
  v_active boolean := coalesce((p_type ->> 'active')::boolean, true);
  types_cap int := (plan_caps(p)).meeting_types;
  others int;
  n_hosts int;
begin
  if v_kind in ('group') and p = 'free' then return 'Group meetings are on Starter and up.'; end if;
  if v_kind in ('round_robin', 'collective') and p in ('free', 'starter') then return 'Team meetings are on Pro and up.'; end if;
  if v_kind in ('owner_first', 'double') and p <> 'business' then return 'This kind of meeting is on Business.'; end if;
  if p = 'free' and v_active and (p_type -> 'settings' -> 'price') is not null and jsonb_typeof(p_type -> 'settings' -> 'price') = 'object' then
    return 'Paid meetings are on Starter and up.';
  end if;
  if not v_active then return null; end if;
  if types_cap is not null then
    select count(*) into others from meeting_types where workspace_id = p_ws and active and id is distinct from p_id;
    if others + 1 > types_cap then return 'Free has 1 meeting type. Upgrade to add more.'; end if;
  end if;
  if p = 'free' then
    select count(distinct u) into n_hosts from (
      select u from meeting_types t, lateral plan_type_hosts(t.hosts, t.owner_user_id) u
      where t.workspace_id = p_ws and t.active and t.id is distinct from p_id
      union select u from plan_type_hosts(p_type -> 'hosts', nullif(p_type ->> 'owner_user_id', '')::uuid) u
    ) x;
    if n_hosts > 1 then return 'Free has 1 seat. Upgrade to add more.'; end if;
  end if;
  return null;
end;
$$;

create or replace function public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  cap int := (plan_caps(workspace_plan(p_ws))).calendars;
  n int;
begin
  if cap is null or p_provider in ('zoom', 'fake') then return null; end if;
  if exists (select 1 from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider = p_provider and lower(account_email) = lower(p_email)) then
    return null;
  end if;
  select count(*) into n from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider not in ('zoom', 'fake');
  if n + 1 > cap then
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Your plan has %s calendars for each seat. Upgrade to add more.', cap) end;
  end if;
  return null;
end;
$$;

revoke execute on function public.plan_check_type(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.plan_check_type(uuid, uuid, jsonb) to service_role;
revoke execute on function public.plan_check_calendar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_check_calendar(uuid, uuid, text, text) to service_role;

-- ===== 122_seat_pricing.sql =====
-- Per-seat pricing (docs/pricing.md, November 2026): every paid plan connects 6 calendar accounts per seat, as
-- Calendly does, and Free keeps 1. The other limits are unchanged from 120_plans.sql. A paid plan's calendar limit
-- is now the same on every plan, so its message no longer offers an upgrade.

create or replace function public.plan_caps(p_plan text, out submissions int, out ai_credits int, out calendars int, out meeting_types int)
language sql immutable set search_path = public as $$
  select case p_plan when 'starter' then 2000 when 'pro' then 5000 when 'business' then null else 250 end,
         case p_plan when 'starter' then 500 when 'pro' then 2000 when 'business' then 5000 else 100 end,
         case p_plan when 'starter' then 6 when 'pro' then 6 when 'business' then 6 else 1 end,
         case p_plan when 'starter' then null when 'pro' then null when 'business' then null else 1 end;
$$;

create or replace function public.plan_check_calendar(p_ws uuid, p_user uuid, p_provider text, p_email text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  cap int := (plan_caps(workspace_plan(p_ws))).calendars;
  n int;
begin
  if cap is null or p_provider in ('zoom', 'fake') then return null; end if;
  if exists (select 1 from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider = p_provider and lower(account_email) = lower(p_email)) then
    return null;
  end if;
  select count(*) into n from calendar_accounts where workspace_id = p_ws and user_id = p_user and provider not in ('zoom', 'fake');
  if n + 1 > cap then
    return case when cap = 1 then 'Free has 1 calendar. Upgrade to add more.' else format('Each seat can connect %s calendars.', cap) end;
  end if;
  return null;
end;
$$;

revoke execute on function public.plan_check_calendar(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_check_calendar(uuid, uuid, text, text) to service_role;

-- ===== 123_forms_to_studio.sql =====
-- Every form is a Form Studio page (docs/forms-chat-plan.md Part 8).
--
-- 1. form_public no longer hands out the old form look (the kit's tokens, its skin and its design system). It hands
--    out what turns an older form into a page as it's read: the kit's Studio stylesheet and its notes (a gallery
--    style's kit is noted "style:<id>"), with the logo as before.
-- 2. form_to_studio keeps an older form as a page for good, in one step: the draft only while it's still the older
--    kind, and the live version published again as a page only while it's still the version that was read. The form's
--    state, its look and when it was published stay as they were.
-- 3. A page holds its HTML, its CSS and the brand's stylesheet, so a form and a version may be up to a million
--    characters (from 65,536).

create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'logo_url', k.logo_url, 'studio_css', k.studio_css, 'kit_notes', coalesce(to_jsonb(k.notes), '[]'::jsonb))
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = coalesce(f.live_kit_id, f.brand_kit_id)
  where f.id = p_id and f.status in ('live', 'paused');
$$;

create or replace function public.form_to_studio(p_id uuid, p_version int, p_body jsonb, p_draft jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  v int;
  did_draft boolean := false;
  did_live boolean := false;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null then
    return jsonb_build_object('draft', false, 'live', false);
  end if;
  v := f.version;
  if p_draft is not null and jsonb_typeof(p_draft) = 'object' and p_draft ? 'page'
     and not (f.draft ? 'page') and not (f.draft ? 'capture') then
    update forms set draft = p_draft, draft_rev = draft_rev + 1, updated_at = now() where id = p_id;
    did_draft := true;
  end if;
  if p_body is not null and jsonb_typeof(p_body) = 'object' and p_body ? 'page' and f.version > 0 and f.version = p_version
     and exists (select 1 from form_versions where form_id = p_id and version = f.version and not (body ? 'page') and not (body ? 'capture')) then
    v := f.version + 1;
    insert into form_versions (form_id, workspace_id, version, body, published_by) values (p_id, f.workspace_id, v, p_body, null);
    update forms set version = v where id = p_id;
    did_live := true;
  end if;
  return jsonb_build_object('draft', did_draft, 'live', did_live, 'version', v);
end;
$$;

alter table public.forms drop constraint if exists forms_draft_check;
alter table public.forms add constraint forms_draft_check check (jsonb_typeof(draft) = 'object' and length(draft::text) <= 1000000);
alter table public.form_versions drop constraint if exists form_versions_body_check;
alter table public.form_versions add constraint form_versions_body_check check (jsonb_typeof(body) = 'object' and length(body::text) <= 1000000);

do $$
begin
  revoke execute on function public.form_public(uuid) from public, anon, authenticated;
  grant execute on function public.form_public(uuid) to service_role;
  revoke execute on function public.form_to_studio(uuid, int, jsonb, jsonb) from public, anon, authenticated;
  grant execute on function public.form_to_studio(uuid, int, jsonb, jsonb) to service_role;
end;
$$;

commit;
