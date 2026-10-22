-- Forms (docs/form-builder.md, week 9): forms built in Claritia, the brand kit they take their look from, every
-- fill as a submission, and an outbox that sends each submission to each of the form's destinations.
--   A submission is saved before anything else happens. In the same transaction it becomes a contact (through
--   contacts_upsert, source 'form'), gets its consent with the exact wording shown, and gets one delivery per
--   destination with a job queued for it. A CRM or Slack being down can't lose a lead.
--   A fill sent twice (same form, same idem_key from the browser) is one submission, one contact and one delivery
--   per destination.
--   Drafts are saved by members. Publishing goes through the server, which checks the form against the schema in
--   src/lib/forms/schema.ts first; only the published version is ever served to visitors.

-- Brand kits ------------------------------------------------------------------------------------------------------

create table if not exists public.brand_kits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  site_id uuid references public.sites (id) on delete set null,
  name text not null check (length(name) between 1 and 120),
  -- The fixed token list in src/lib/forms/brand.ts. Nothing else from a site is kept.
  tokens jsonb not null default '{}' check (jsonb_typeof(tokens) = 'object' and length(tokens::text) <= 8000),
  logo_url text check (length(logo_url) <= 1000),
  source_url text check (length(source_url) <= 1000),
  notes text[] not null default '{}' check (cardinality(notes) <= 20),
  scanned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists brand_kits_ws on public.brand_kits (workspace_id);
alter table public.brand_kits enable row level security;
create policy "members read" on public.brand_kits for select using (is_member(workspace_id));
revoke all on public.brand_kits from anon;
revoke insert, update, delete on public.brand_kits from authenticated;

-- Forms -----------------------------------------------------------------------------------------------------------

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  -- draft: never published. live: takes fills. paused: the published version shows a closed message.
  status text not null default 'draft' check (status in ('draft', 'live', 'paused')),
  draft jsonb not null default '{}' check (jsonb_typeof(draft) = 'object' and length(draft::text) <= 65536),
  -- Bumped on every draft save, so two editors (or a person and the chat) never overwrite each other unseen.
  draft_rev int not null default 0,
  version int not null default 0,
  brand_kit_id uuid references public.brand_kits (id) on delete set null,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists forms_ws on public.forms (workspace_id, updated_at desc);
alter table public.forms enable row level security;
create policy "members read" on public.forms for select using (is_member(workspace_id));
revoke all on public.forms from anon;
revoke insert, update, delete on public.forms from authenticated;

-- Every published version, so old submissions keep the fields they were sent with.
create table if not exists public.form_versions (
  form_id uuid not null references public.forms (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  version int not null,
  body jsonb not null check (jsonb_typeof(body) = 'object' and length(body::text) <= 65536),
  published_by uuid,
  at timestamptz not null default now(),
  primary key (form_id, version)
);
alter table public.form_versions enable row level security;
create policy "members read" on public.form_versions for select using (is_member(workspace_id));
revoke all on public.form_versions from anon;
revoke insert, update, delete on public.form_versions from authenticated;

-- Destinations ----------------------------------------------------------------------------------------------------
-- kind 'source': a connected tool (HubSpot, Salesforce, Omniscient and every other connector with a push), through
--   the same push and links as the two-way sync. kind 'slack': an incoming webhook. kind 'webhook': a signed POST.
--   Addresses and signing secrets are sealed in form_destination_secrets, which nobody but the server reads.

create table if not exists public.form_destinations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  kind text not null check (kind in ('source', 'slack', 'webhook')),
  source_id uuid references public.sources (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  -- What's safe to show: the webhook's host, the Slack channel label. Never the address or secret.
  config jsonb not null default '{}' check (jsonb_typeof(config) = 'object' and length(config::text) <= 4000),
  mode text not null default 'upsert' check (mode in ('upsert', 'create', 'update')),
  paused boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  check ((kind = 'source') = (source_id is not null))
);
create index if not exists form_destinations_form on public.form_destinations (form_id, position);
create unique index if not exists form_destinations_source on public.form_destinations (form_id, source_id) where source_id is not null;
alter table public.form_destinations enable row level security;
create policy "members read" on public.form_destinations for select using (is_member(workspace_id));
revoke all on public.form_destinations from anon;
revoke insert, update, delete on public.form_destinations from authenticated;

create table if not exists public.form_destination_secrets (
  destination_id uuid primary key references public.form_destinations (id) on delete cascade,
  sealed text not null,
  updated_at timestamptz not null default now()
);
alter table public.form_destination_secrets enable row level security;
revoke all on public.form_destination_secrets from anon, authenticated;

-- Submissions -----------------------------------------------------------------------------------------------------

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  -- A deleted form keeps its leads; the version body is gone with it.
  form_id uuid references public.forms (id) on delete set null,
  form_version int not null,
  contact_id uuid references public.contacts (id) on delete set null,
  idem_key text not null check (idem_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  "values" jsonb not null default '{}' check (jsonb_typeof("values") = 'object' and length("values"::text) <= 32768),
  -- Hidden fields: UTMs, page, referrer and any static values the form carries.
  hidden jsonb not null default '{}' check (jsonb_typeof(hidden) = 'object' and length(hidden::text) <= 8000),
  -- { given: bool, wording: text } as shown to the visitor, or {} when the form asked nothing.
  consent jsonb not null default '{}' check (jsonb_typeof(consent) = 'object'),
  country text check (country ~ '^[A-Z]{2}$'),
  spam boolean not null default false,
  spam_reason text check (length(spam_reason) <= 60),
  test boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists submissions_idem on public.submissions (workspace_id, idem_key);
create index if not exists submissions_form on public.submissions (form_id, created_at desc);
create index if not exists submissions_contact on public.submissions (contact_id) where contact_id is not null;
alter table public.submissions enable row level security;
create policy "members read" on public.submissions for select using (is_member(workspace_id));
revoke all on public.submissions from anon;
revoke insert, update, delete on public.submissions from authenticated;

-- One row per submission per destination. queued: waiting for its job. sending: a job holds it until lease_until.
-- retrying: the last try failed and the job queue will try again. done, failed: finished. held: its destination is
-- paused. skipped: nothing to send (a test submission to a destination that skips tests, or the tool is gone).
create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  submission_id uuid not null references public.submissions (id) on delete cascade,
  destination_id uuid not null references public.form_destinations (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'retrying', 'done', 'failed', 'held', 'skipped')),
  attempts int not null default 0,
  lease_until timestamptz,
  external_id text check (length(external_id) <= 200),
  external_url text check (length(external_url) <= 1000),
  error text check (length(error) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  done_at timestamptz,
  unique (submission_id, destination_id)
);
create index if not exists deliveries_destination on public.deliveries (destination_id, created_at);
create index if not exists deliveries_open on public.deliveries (status, updated_at) where status in ('queued', 'sending', 'retrying');
create index if not exists deliveries_failed on public.deliveries (workspace_id, created_at desc) where status = 'failed';
alter table public.deliveries enable row level security;
create policy "members read" on public.deliveries for select using (is_member(workspace_id));
revoke all on public.deliveries from anon;
revoke insert, update, delete on public.deliveries from authenticated;

-- Member actions ----------------------------------------------------------------------------------------------

create or replace function public.form_create(p_ws uuid, p_name text, p_draft jsonb, p_brand_kit uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if not is_member(p_ws) then
    raise exception 'Workspace not found';
  end if;
  if p_brand_kit is not null and not exists (select 1 from brand_kits where id = p_brand_kit and workspace_id = p_ws) then
    raise exception 'Brand kit not found';
  end if;
  insert into forms (workspace_id, name, draft, brand_kit_id, created_by)
  values (p_ws, coalesce(nullif(trim(left(p_name, 120)), ''), 'Untitled form'), coalesce(p_draft, '{}'), p_brand_kit, auth.uid())
  returning id into fid;
  return fid;
end;
$$;

-- Save the draft. p_rev is the draft_rev the editor loaded; a newer one means someone else saved in between.
create or replace function public.form_save(p_id uuid, p_name text, p_draft jsonb, p_rev int, p_brand_kit uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if f.draft_rev <> p_rev then
    raise exception 'This form changed in another window. Reload to see the latest.';
  end if;
  if p_brand_kit is not null and not exists (select 1 from brand_kits where id = p_brand_kit and workspace_id = f.workspace_id) then
    raise exception 'Brand kit not found';
  end if;
  update forms set name = coalesce(nullif(trim(left(p_name, 120)), ''), name), draft = coalesce(p_draft, draft),
         brand_kit_id = p_brand_kit, draft_rev = draft_rev + 1, updated_at = now()
  where id = p_id;
  return f.draft_rev + 1;
end;
$$;

create or replace function public.form_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if p_status not in ('live', 'paused') then
    raise exception 'Pick live or paused';
  end if;
  if f.version = 0 then
    raise exception 'Publish the form first';
  end if;
  update forms set status = p_status, updated_at = now() where id = p_id;
end;
$$;

-- Delete a form: its versions and destinations go; its submissions and contacts stay.
create or replace function public.form_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  delete from forms where id = p_id;
end;
$$;

create or replace function public.form_destination_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  d form_destinations%rowtype;
begin
  select * into d from form_destinations where id = p_id;
  if d.id is null or not is_member(d.workspace_id) then
    raise exception 'Destination not found';
  end if;
  delete from form_destinations where id = p_id;
end;
$$;

-- Pause holds new deliveries; turning it back on sends the held ones, oldest first, through one job.
create or replace function public.form_destination_pause(p_id uuid, p_paused boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  d form_destinations%rowtype;
begin
  select * into d from form_destinations where id = p_id for update;
  if d.id is null or not is_member(d.workspace_id) then
    raise exception 'Destination not found';
  end if;
  update form_destinations set paused = p_paused where id = p_id;
  if not p_paused and exists (select 1 from deliveries where destination_id = p_id and status = 'held') then
    perform enqueue_job(d.workspace_id, 'deliver_held', p_id::text, jsonb_build_object('destination_id', p_id), 0, 6);
  end if;
end;
$$;

-- Send deliveries again: failed ones, or done ones on purpose. Each gets a fresh set of tries.
create or replace function public.deliveries_replay(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  d record;
  n int := 0;
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  for d in
    select x.id, x.workspace_id, x.destination_id, fd.paused from deliveries x join form_destinations fd on fd.id = x.destination_id
    where x.id = any(p_ids) and x.status in ('failed', 'done', 'skipped') and is_member(x.workspace_id)
    order by x.created_at
    for update of x
  loop
    update deliveries set status = case when d.paused then 'held' else 'queued' end, attempts = 0, error = null, lease_until = null, updated_at = now()
    where id = d.id;
    if not d.paused then
      perform enqueue_job(d.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- The server's side ---------------------------------------------------------------------------------------------

-- Publish a draft the server has checked. Returns the new version.
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
  update forms set version = v, status = case when status = 'paused' then 'paused' else 'live' end, published_at = now(), updated_at = now() where id = p_id;
  return v;
end;
$$;

-- What the public route needs: the live version and the brand kit's tokens (the route drops workspace_id before
-- answering). Null when the form isn't live or paused.
create or replace function public.form_public(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', f.id, 'workspace_id', f.workspace_id, 'version', f.version, 'status', f.status, 'body', v.body,
           'tokens', coalesce(k.tokens, '{}'::jsonb), 'logo_url', k.logo_url)
  from forms f
  join form_versions v on v.form_id = f.id and v.version = f.version
  left join brand_kits k on k.id = f.brand_kit_id
  where f.id = p_id and f.status in ('live', 'paused');
$$;

-- Add or change a brand kit with tokens the server has checked (src/lib/forms/brand.ts).
create or replace function public.brand_kit_save(p_user uuid, p_ws uuid, p_id uuid, p_name text, p_tokens jsonb, p_logo_url text default null,
  p_source_url text default null, p_notes text[] default '{}', p_site uuid default null, p_scanned boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  kid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Workspace not found';
  end if;
  if p_site is not null and not exists (select 1 from sites where id = p_site and workspace_id = p_ws) then
    raise exception 'Site not found';
  end if;
  if p_id is null then
    insert into brand_kits (workspace_id, site_id, name, tokens, logo_url, source_url, notes, scanned_at)
    values (p_ws, p_site, left(p_name, 120), p_tokens, p_logo_url, p_source_url, coalesce(p_notes, '{}'), case when p_scanned then now() end)
    returning id into kid;
  else
    update brand_kits set name = left(p_name, 120), tokens = p_tokens, logo_url = p_logo_url, source_url = coalesce(p_source_url, source_url),
           notes = coalesce(p_notes, notes), site_id = coalesce(p_site, site_id), scanned_at = case when p_scanned then now() else scanned_at end, updated_at = now()
    where id = p_id and workspace_id = p_ws returning id into kid;
    if kid is null then
      raise exception 'Brand kit not found';
    end if;
  end if;
  return kid;
end;
$$;

create or replace function public.brand_kit_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  k brand_kits%rowtype;
begin
  select * into k from brand_kits where id = p_id;
  if k.id is null or not is_member(k.workspace_id) then
    raise exception 'Brand kit not found';
  end if;
  delete from brand_kits where id = p_id;
end;
$$;

-- Add or change a destination. The route has checked the person is a member and sealed any secret.
create or replace function public.form_destination_save(p_user uuid, p_form uuid, p_id uuid, p_kind text, p_source uuid, p_name text,
  p_config jsonb, p_mode text, p_sealed text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  did uuid;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not exists (select 1 from workspace_members where workspace_id = f.workspace_id and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  if p_source is not null and not exists (select 1 from sources where id = p_source and workspace_id = f.workspace_id and status <> 'disconnected') then
    raise exception 'Connect that tool first';
  end if;
  if p_kind in ('slack', 'webhook') and p_id is null and p_sealed is null then
    raise exception 'Add the address';
  end if;
  if p_id is null then
    insert into form_destinations (workspace_id, form_id, kind, source_id, name, config, mode, position)
    values (f.workspace_id, p_form, p_kind, p_source, left(p_name, 120), coalesce(p_config, '{}'), coalesce(p_mode, 'upsert'),
            coalesce((select max(position) + 1 from form_destinations where form_id = p_form), 0))
    returning id into did;
  else
    update form_destinations set name = left(p_name, 120), config = coalesce(p_config, config), mode = coalesce(p_mode, mode)
    where id = p_id and form_id = p_form returning id into did;
    if did is null then
      raise exception 'Destination not found';
    end if;
  end if;
  if p_sealed is not null then
    insert into form_destination_secrets (destination_id, sealed) values (did, p_sealed)
    on conflict (destination_id) do update set sealed = excluded.sealed, updated_at = now();
  end if;
  return did;
end;
$$;

-- A fill, from the public route after its checks. One transaction: the submission, the contact, the consent,
-- the activity, and a delivery with a queued job for each destination. A repeat of the same idem_key returns the
-- first submission and changes nothing.
--   p_contact: one contacts_upsert row (email cleaned by the route), or null for spam.
--   p_consent: { given, wording } as shown, or {}.
create or replace function public.form_submit(p_form uuid, p_version int, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb,
  p_consent jsonb, p_country text, p_spam text, p_test boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  sid uuid;
  cid uuid;
  up jsonb;
  d record;
begin
  select * into f from forms where id = p_form;
  -- A test fill (the Test button) also runs on a paused form.
  if f.id is null or (f.status <> 'live' and not (coalesce(p_test, false) and f.status = 'paused')) then
    raise exception 'This form isn''t taking answers';
  end if;
  if not exists (select 1 from form_versions where form_id = p_form and version = p_version) then
    raise exception 'Unknown form version';
  end if;

  insert into submissions (workspace_id, form_id, form_version, idem_key, "values", hidden, consent, country, spam, spam_reason, test)
  values (f.workspace_id, p_form, p_version, p_idem, coalesce(p_values, '{}'), coalesce(p_hidden, '{}'), coalesce(p_consent, '{}'),
          nullif(p_country, ''), p_spam is not null, p_spam, coalesce(p_test, false))
  on conflict (workspace_id, idem_key) do nothing
  returning id into sid;
  if sid is null then
    select id, contact_id into sid, cid from submissions where workspace_id = f.workspace_id and idem_key = p_idem;
    return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', true);
  end if;
  if p_spam is not null or p_contact is null then
    return jsonb_build_object('id', sid, 'contact_id', null, 'repeat', false);
  end if;

  -- The basis comes from the consent box below, never from the row.
  up := contacts_upsert(f.workspace_id, 'form', jsonb_build_array(p_contact - 'basis'));
  cid := (up->'ids'->>0)::uuid;
  update submissions set contact_id = cid where id = sid;

  if cid is not null and coalesce((p_consent->>'given')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'opt_in', 'granted', 'form', left(p_consent->>'wording', 2000));
  end if;
  if cid is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (f.workspace_id, cid, 'form.submitted',
            jsonb_strip_nulls(jsonb_build_object('form_id', p_form, 'form', f.name, 'submission_id', sid, 'page', p_hidden->>'page',
              'utm_source', p_hidden->>'utm_source', 'utm_campaign', p_hidden->>'utm_campaign', 'test', case when p_test then true end)), 'form');
  end if;

  for d in select id, paused from form_destinations where form_id = p_form order by position, created_at loop
    insert into deliveries (workspace_id, submission_id, destination_id, status)
    values (f.workspace_id, sid, d.id, case when d.paused then 'held' else 'queued' end);
  end loop;
  for d in select x.id from deliveries x where x.submission_id = sid and x.status = 'queued' loop
    perform enqueue_job(f.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
  end loop;
  return jsonb_build_object('id', sid, 'contact_id', cid, 'repeat', false);
end;
$$;

-- Take one delivery for a try: everything the sender needs, with a lease so a second job can't send it at the same
-- time. Null when it's finished, held, leased by another try, or gone.
create or replace function public.delivery_take(p_id uuid, p_lease_s int default 120) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  x deliveries%rowtype;
  dst form_destinations%rowtype;
begin
  select * into x from deliveries where id = p_id for update;
  if x.id is null or x.status in ('done', 'failed', 'skipped') then
    return null;
  end if;
  if x.status = 'sending' and x.lease_until > now() then
    return null;
  end if;
  select * into dst from form_destinations where id = x.destination_id;
  if dst.paused then
    update deliveries set status = 'held', lease_until = null, updated_at = now() where id = p_id;
    return null;
  end if;
  update deliveries set status = 'sending', attempts = attempts + 1, lease_until = now() + make_interval(secs => greatest(p_lease_s, 10)), updated_at = now()
  where id = p_id;
  return (
    select jsonb_build_object(
      'delivery', to_jsonb(x) || jsonb_build_object('attempts', x.attempts + 1),
      'destination', to_jsonb(dst),
      'sealed', (select sealed from form_destination_secrets where destination_id = dst.id),
      'submission', to_jsonb(s),
      'form', jsonb_build_object('id', f.id, 'name', f.name, 'body', v.body),
      'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name,
                   'title', c.title, 'phone', c.phone, 'country', c.country, 'company', co.name, 'company_domain', co.domain) end)
    from submissions s
    left join forms f on f.id = s.form_id
    left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
    left join contacts c on c.id = s.contact_id and c.deleted_at is null
    left join companies co on co.id = c.company_id
    where s.id = x.submission_id
  );
end;
$$;

-- How a try ended. 'retrying' keeps the delivery open for the job queue's next try.
create or replace function public.delivery_finish(p_id uuid, p_status text, p_external_id text default null, p_external_url text default null,
  p_error text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('done', 'failed', 'retrying', 'skipped') then
    raise exception 'Bad status %', p_status;
  end if;
  update deliveries set status = p_status, lease_until = null,
         external_id = coalesce(left(p_external_id, 200), external_id), external_url = coalesce(left(p_external_url, 1000), external_url),
         error = case when p_status in ('done', 'skipped') then null else left(p_error, 1000) end,
         done_at = case when p_status in ('done', 'failed', 'skipped') then now() end, updated_at = now()
  where id = p_id and status = 'sending';
end;
$$;

-- Held deliveries of a destination that was turned back on, oldest first, as a list of ids. Nothing while it's
-- still paused.
create or replace function public.deliveries_held(p_destination uuid, p_limit int default 100) returns jsonb
language sql security definer set search_path = public as $$
  with picked as (
    select id from deliveries
    where destination_id = p_destination and status = 'held'
      and not exists (select 1 from form_destinations where id = p_destination and paused)
    order by created_at limit least(p_limit, 500)
    for update skip locked
  ), moved as (
    update deliveries d set status = 'queued', updated_at = now() from picked where d.id = picked.id returning d.id, d.created_at
  )
  select coalesce(jsonb_agg(id order by created_at), '[]'::jsonb) from moved;
$$;

-- Deliveries left 'sending' by a worker that died on its last try, or 'queued' with no job (a lost enqueue), each
-- hour: the first become failed, the second get a job again.
create or replace function public.deliveries_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  d record;
begin
  update deliveries x set status = 'failed', error = coalesce(x.error, 'The sender stopped answering'), lease_until = null, done_at = now(), updated_at = now()
  where x.status in ('sending', 'retrying') and x.updated_at < now() - interval '12 hours'
    and not exists (select 1 from jobs j where j.kind = 'deliver' and j.key = x.id::text and j.status in ('queued', 'running'));
  get diagnostics n = row_count;
  for d in
    select x.id, x.workspace_id from deliveries x
    where x.status = 'queued' and x.updated_at < now() - interval '10 minutes'
      and not exists (select 1 from jobs j where j.kind = 'deliver' and j.key = x.id::text and j.status in ('queued', 'running'))
    limit 1000
  loop
    perform enqueue_job(d.workspace_id, 'deliver', d.id::text, jsonb_build_object('delivery_id', d.id), 0, 6);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.minute_tick() returns void
language plpgsql security definer set search_path = public as $$
begin
  perform fire_due_schedules();
  if exists (select 1 from runs where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from explorations where status = 'queued' and created_at < now() - interval '20 seconds')
     or exists (select 1 from plans where status = 'queued' and created_at < now() - interval '20 seconds') then
    perform wake_runner();
  end if;
  if exists (select 1 from github_checks where status = 'pending' and coalesce(synced_at, created_at) < now() - interval '1 minute') then
    perform github_sync();
  end if;
  if exists (select 1 from alert_events where sent_at is null) then
    perform alerts_send();
  end if;
  perform sources_due();
  if extract(minute from now())::int % 5 = 0 then
    perform segments_due();
  end if;
  if extract(minute from now()) = 7 then
    perform prune_jobs();
  end if;
  if extract(minute from now()) = 23 then
    perform deliveries_sweep();
  end if;
  if extract(hour from now()) = 3 and extract(minute from now()) = 17 then
    perform contact_events_roll();
    perform prune_history();
    perform prune_sync();
  end if;
end;
$$;
revoke execute on function public.minute_tick() from public, anon, authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'form_publish(uuid, uuid, jsonb)', 'form_public(uuid)', 'brand_kit_save(uuid, uuid, uuid, text, jsonb, text, text, text[], uuid, boolean)', 'form_destination_save(uuid, uuid, uuid, text, uuid, text, jsonb, text, text)',
    'form_submit(uuid, int, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)', 'delivery_take(uuid, int)',
    'delivery_finish(uuid, text, text, text, text)', 'deliveries_held(uuid, int)', 'deliveries_sweep()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  foreach f in array array['form_create(uuid, text, jsonb, uuid)', 'form_save(uuid, text, jsonb, int, uuid)', 'form_set_status(uuid, text)',
    'form_delete(uuid)', 'brand_kit_delete(uuid)', 'form_destination_delete(uuid)', 'form_destination_pause(uuid, boolean)', 'deliveries_replay(uuid[])'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
