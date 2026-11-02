-- Forms and form templates (docs/form-templates.md, M6 forms in docs/marketing-platform.md).
--   A form is a schema (pages of fields, show-if logic, an end screen) plus settings, copied from a template or
--   started blank. Live forms answer at /f/<slug> and in the embed script. The template catalog lives in code
--   (src/lib/forms/templates); template_id and template_version remember where a form came from.
--   Submissions are written by the server only, after it checks every answer again (src/lib/forms/answers.ts),
--   through form_submit: the submission, the counter, the contact's form.submitted activity and the consent row
--   with the exact words the visitor saw, in one transaction.
--   Uploaded files live in the private "form-files" bucket under <workspace id>/<form id>/<upload id>/<name>.
--   Members read their workspace's rows; every write goes through the server with the service role.

-- Forms -------------------------------------------------------------------------------------------------------

create table if not exists public.forms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 60),
  status text not null default 'draft' check (status in ('draft', 'live', 'closed')),
  schema jsonb not null check (jsonb_typeof(schema) = 'object' and length(schema::text) <= 200000),
  settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object' and length(settings::text) <= 20000),
  template_id text check (length(template_id) <= 80),
  template_version int,
  -- Collects health details: stays a draft until the workspace confirms a BAA (baa_confirmed_at).
  phi boolean not null default false,
  baa_confirmed_at timestamptz,
  submissions int not null default 0,
  last_submission_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (status <> 'live' or not phi or baa_confirmed_at is not null)
);
create index if not exists forms_ws on public.forms (workspace_id, updated_at desc);
alter table public.forms enable row level security;
create policy "members read" on public.forms for select using (is_member(workspace_id));
revoke all on public.forms from anon;
revoke insert, update, delete on public.forms from authenticated;

-- Submissions -------------------------------------------------------------------------------------------------

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  answers jsonb not null check (jsonb_typeof(answers) = 'object' and length(answers::text) <= 300000),
  score int,
  -- utm_*, page, referrer, country, region policy, user agent.
  meta jsonb not null default '{}' check (jsonb_typeof(meta) = 'object' and length(meta::text) <= 20000),
  ip_hash text check (length(ip_hash) <= 64),
  at timestamptz not null default now()
);
create index if not exists form_submissions_form on public.form_submissions (form_id, at desc);
create index if not exists form_submissions_contact on public.form_submissions (contact_id) where contact_id is not null;
create index if not exists form_submissions_ip on public.form_submissions (workspace_id, ip_hash, at desc) where ip_hash is not null;
alter table public.form_submissions enable row level security;
create policy "members read" on public.form_submissions for select using (is_member(workspace_id));
revoke all on public.form_submissions from anon;
revoke insert, update, delete on public.form_submissions from authenticated;

-- Which templates get used, for the gallery's order and to see which ones to improve.
create table if not exists public.form_template_uses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  template_id text not null check (length(template_id) <= 80),
  form_id uuid references public.forms (id) on delete set null,
  at timestamptz not null default now()
);
create index if not exists form_template_uses_template on public.form_template_uses (template_id);
alter table public.form_template_uses enable row level security;
create policy "members read" on public.form_template_uses for select using (is_member(workspace_id));
revoke all on public.form_template_uses from anon;
revoke insert, update, delete on public.form_template_uses from authenticated;

-- Tailor's step cache: the same form and the same business description replay the saved answer with no model
-- call. Server only.
create table if not exists public.form_tailor_cache (
  key text primary key check (key ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (length(result::text) <= 200000),
  at timestamptz not null default now()
);
alter table public.form_tailor_cache enable row level security;
revoke all on public.form_tailor_cache from anon, authenticated;

-- Files ------------------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public) values ('form-files', 'form-files', false) on conflict (id) do nothing;
create policy "members read form files" on storage.objects for select to authenticated
  using (bucket_id = 'form-files' and is_member(((storage.foldername(name))[1])::uuid));

-- Saving ------------------------------------------------------------------------------------------------------

-- Custom contact fields a form needs (src/lib/forms/fields.ts planFields): p_fields [{key, label, type, options}]
-- are made when missing; p_extend [{key, options}] adds options to a pick list. A key someone made in the
-- meantime with another type stops the save, so answers never land in a field of the wrong type.
create or replace function public.form_fields_apply(p_ws uuid, p_fields jsonb, p_extend jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
  pos int;
begin
  -- An empty list can arrive as {} from some clients.
  if jsonb_typeof(p_fields) is distinct from 'array' then p_fields := '[]'; end if;
  if jsonb_typeof(p_extend) is distinct from 'array' then p_extend := '[]'; end if;
  select coalesce(max(position), 0) into pos from fields where workspace_id = p_ws and object = 'contact';
  for r in select * from jsonb_to_recordset(p_fields) as x(key text, label text, type text, options jsonb) loop
    pos := pos + 1;
    insert into fields (workspace_id, object, key, label, type, options, position)
    values (p_ws, 'contact', r.key, left(r.label, 80), r.type, coalesce(r.options, '[]'), pos)
    on conflict (workspace_id, object, key) do nothing;
    if (select type from fields where workspace_id = p_ws and object = 'contact' and key = r.key) <> r.type then
      raise exception 'The contact field % changed. Try again.', r.key;
    end if;
  end loop;
  for r in select * from jsonb_to_recordset(p_extend) as x(key text, options jsonb) loop
    update fields f set options = f.options || (
        select coalesce(jsonb_agg(o), '[]') from jsonb_array_elements(r.options) o
        where not exists (select 1 from jsonb_array_elements(f.options) e
                          where lower(coalesce(e->>'value', e #>> '{}')) = lower(o #>> '{}') or lower(coalesce(e->>'label', e #>> '{}')) = lower(o #>> '{}'))),
      updated_at = now()
    where f.workspace_id = p_ws and f.object = 'contact' and f.key = r.key and f.type in ('select', 'multi_select')
      and jsonb_array_length(f.options) + jsonb_array_length(r.options) <= 100;
  end loop;
end;
$$;

-- A new form, with the contact fields it needs, in one go. Returns the form's id.
create or replace function public.form_create(p_ws uuid, p_user uuid, p_name text, p_slug text, p_schema jsonb, p_settings jsonb, p_template text,
  p_version int, p_phi boolean, p_status text, p_fields jsonb, p_extend jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  fid uuid;
begin
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Workspace not found';
  end if;
  perform form_fields_apply(p_ws, p_fields, p_extend);
  insert into forms (workspace_id, name, slug, status, schema, settings, template_id, template_version, phi, created_by, published_at)
  values (p_ws, p_name, p_slug, p_status, p_schema, coalesce(p_settings, '{}'), p_template, p_version, coalesce(p_phi, false), p_user,
          case when p_status = 'live' then now() end)
  returning id into fid;
  if p_template is not null then
    insert into form_template_uses (workspace_id, template_id, form_id) values (p_ws, p_template, fid);
  end if;
  return fid;
end;
$$;

-- Save a form's name, schema and settings, with any contact fields it now needs.
create or replace function public.form_save(p_form uuid, p_user uuid, p_name text, p_schema jsonb, p_settings jsonb, p_fields jsonb, p_extend jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null or not exists (select 1 from workspace_members where workspace_id = ws and user_id = p_user) then
    raise exception 'Form not found';
  end if;
  perform form_fields_apply(ws, p_fields, p_extend);
  update forms set name = p_name, schema = p_schema, settings = coalesce(p_settings, '{}'), updated_at = now() where id = p_form;
end;
$$;

-- Submitting ---------------------------------------------------------------------------------------------------

-- Whether a submission may go ahead: the form is live and the network hasn't sent 20 in 10 minutes. Checked before
-- the contact is written, so a script can't fill the contacts table; form_submit checks again.
create or replace function public.form_can_submit(p_form uuid, p_ip_hash text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from forms f where f.id = p_form and f.status = 'live'
    and (p_ip_hash is null or (select count(*) from form_submissions s where s.workspace_id = f.workspace_id and s.ip_hash = p_ip_hash
                                and s.at > now() - interval '10 minutes') < 20));
$$;

-- One submission, already checked by the server. p_consent: { basis, wording, explicit }, or null when the form
-- has consent off. A ticked box always records an opt-in with its words; a notice records a basis only for a
-- contact with no consent yet, so it never lowers an opt-in someone gave before.
create or replace function public.form_submit(p_form uuid, p_contact uuid, p_answers jsonb, p_score int, p_meta jsonb, p_ip_hash text, p_consent jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  sid uuid;
  recent int;
  basis text := p_consent->>'basis';
begin
  select * into f from forms where id = p_form for update;
  if f.id is null or f.status <> 'live' then
    raise exception 'Form not found';
  end if;
  if p_contact is not null and not exists (select 1 from contacts where id = p_contact and workspace_id = f.workspace_id and deleted_at is null) then
    raise exception 'Contact not found';
  end if;
  if basis is not null and basis not in ('opt_in', 'soft_opt_in', 'legitimate_interest', 'none') then
    raise exception 'Unknown basis %', basis;
  end if;
  -- More than 20 from one network in 10 minutes across the workspace's forms is a script, not people.
  if p_ip_hash is not null then
    select count(*) into recent from form_submissions where workspace_id = f.workspace_id and ip_hash = p_ip_hash and at > now() - interval '10 minutes';
    if recent >= 20 then
      raise exception 'Too many submissions';
    end if;
  end if;

  insert into form_submissions (workspace_id, form_id, contact_id, answers, score, meta, ip_hash)
  values (f.workspace_id, f.id, p_contact, coalesce(p_answers, '{}'), p_score, coalesce(p_meta, '{}'), p_ip_hash)
  returning id into sid;
  update forms set submissions = submissions + 1, last_submission_at = now() where id = f.id;

  if p_contact is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (f.workspace_id, p_contact, 'form.submitted', jsonb_build_object('form_id', f.id, 'form', f.name, 'submission_id', sid), 'form');

    if basis is not null then
      if (p_consent->>'explicit')::boolean is true
         or not exists (select 1 from consents c where c.contact_id = p_contact and c.channel = 'email') then
        insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
        values (f.workspace_id, p_contact, 'email', basis, case when basis = 'none' then 'none' else 'granted' end, 'form', left(p_consent->>'wording', 2000));
      end if;
    end if;
  end if;
  return sid;
end;
$$;

do $$
begin
  execute 'revoke execute on function public.form_submit(uuid, uuid, jsonb, int, jsonb, text, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.form_submit(uuid, uuid, jsonb, int, jsonb, text, jsonb) to service_role';
  execute 'revoke execute on function public.form_can_submit(uuid, text) from public, anon, authenticated';
  execute 'grant execute on function public.form_can_submit(uuid, text) to service_role';
  execute 'revoke execute on function public.form_fields_apply(uuid, jsonb, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.form_fields_apply(uuid, jsonb, jsonb) to service_role';
  execute 'revoke execute on function public.form_create(uuid, uuid, text, text, jsonb, jsonb, text, int, boolean, text, jsonb, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.form_create(uuid, uuid, text, text, jsonb, jsonb, text, int, boolean, text, jsonb, jsonb) to service_role';
  execute 'revoke execute on function public.form_save(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) from public, anon, authenticated';
  execute 'grant execute on function public.form_save(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb) to service_role';
end;
$$;
