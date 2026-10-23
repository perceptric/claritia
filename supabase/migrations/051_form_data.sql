-- Form studio, Data tab (docs/form-studio.md 2.1 "Data", build step 6): what a form answer does to a value the
-- contact already has. Each contact or custom field on a form says Overwrite (always), Only fill if empty
-- (if_empty) or Never; src/lib/forms/overwrite.ts works out the policy for each contact value a fill carries and
-- sends it as p_contact.overwrite ({ "<key>": "always" | "if_empty" | "never" }, keys as contact_vals names them:
-- email, first_name, last_name, title, phone, country, region, company, f.<custom key>).
--   - A new contact gets every value, whatever the policy ("Never" means never change one that's there).
--   - An existing contact: "never" values and "if_empty" values over a filled one are left out of the write;
--     "always" values, and "if_empty" values over a blank (null, "" or an empty list), are set even where field
--     order would keep an older value, with field_history and field_sources as for any change.
--   - A value with no policy (a country from the visitor's location, a company from the email's domain) merges by
--     field order, as before.
-- Fills for one email run one at a time (an advisory lock), so a second fill sees the contact the first made.

-- Set values on one contact whatever their sources rank. Blanks never clear. Returns how many changed.
create or replace function public.contact_force(p_ws uuid, p_id uuid, p_source text, p_vals jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare
  c contacts%rowtype;
  old jsonb;
  src jsonb;
  k text;
  v jsonb;
  n int := 0;
begin
  select * into c from contacts where id = p_id and workspace_id = p_ws and deleted_at is null for update;
  if c.id is null then
    return 0;
  end if;
  old := contact_vals(c);
  src := coalesce(c.field_sources, '{}');
  for k, v in select key, value from jsonb_each(coalesce(p_vals, '{}')) loop
    continue when v is null or v in ('null'::jsonb, '""'::jsonb, '[]'::jsonb);
    continue when old->k is not distinct from v;
    case k
      when 'email' then update contacts set email = v #>> '{}' where id = p_id;
      when 'first_name' then update contacts set first_name = v #>> '{}' where id = p_id;
      when 'last_name' then update contacts set last_name = v #>> '{}' where id = p_id;
      when 'title' then update contacts set title = v #>> '{}' where id = p_id;
      when 'phone' then update contacts set phone = v #>> '{}' where id = p_id;
      when 'country' then update contacts set country = v #>> '{}' where id = p_id;
      when 'region' then update contacts set region = v #>> '{}' where id = p_id;
      when 'company' then update contacts set company_id = (v #>> '{}')::uuid where id = p_id;
      else
        continue when k !~ '^f\.[a-z][a-z0-9_]{0,39}$';
        update contacts set fields = coalesce(fields, '{}') || jsonb_build_object(substr(k, 3), v) where id = p_id;
    end case;
    insert into field_history (workspace_id, object, record_id, key, old, new, old_source, source)
    values (p_ws, 'contact', p_id, k, old->k, v, src->k, p_source);
    src := src || jsonb_build_object(k, jsonb_build_object('s', p_source, 'at', now()));
    n := n + 1;
  end loop;
  if n > 0 then
    update contacts set field_sources = src, updated_at = now() where id = p_id;
  end if;
  return n;
end;
$$;

-- A fill's contact: contacts_upsert (source 'form') with the row's overwrite policy applied. Returns what
-- contacts_upsert returns. A row without a policy writes exactly as before.
create or replace function public.form_contact_write(p_ws uuid, p_row jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pol jsonb := case when jsonb_typeof(p_row->'overwrite') = 'object' then p_row->'overwrite' else '{}'::jsonb end;
  r jsonb := p_row - 'basis' - 'overwrite';
  ec text := lower(btrim(coalesce(p_row->>'email_clean', '')));
  c contacts%rowtype;
  old jsonb;
  k text;
  p text;
  empty boolean;
  force text[] := '{}';
  up jsonb;
  cid uuid;
  vals jsonb := '{}';
  comp uuid;
begin
  if ec = '' or pol = '{}'::jsonb then
    return contacts_upsert(p_ws, 'form', jsonb_build_array(r));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('contact:' || p_ws::text || ':' || ec, 0));
  select * into c from contacts where workspace_id = p_ws and email_clean = ec and deleted_at is null for update;
  if c.id is not null then
    old := contact_vals(c);
    for k, p in select key, value #>> '{}' from jsonb_each(pol) loop
      continue when k !~ '^(email|first_name|last_name|title|phone|country|region|company|f\.[a-z][a-z0-9_]{0,39})$'
                 or p is null or p not in ('always', 'if_empty', 'never');
      empty := old->k is null or old->k in ('null'::jsonb, '""'::jsonb, '[]'::jsonb) or (jsonb_typeof(old->k) = 'string' and btrim(old->>k) = '');
      if p = 'never' or (p = 'if_empty' and not empty) then
        r := case when k = 'company' then r - 'company_name' - 'company_domain'
                  when k like 'f.%' then jsonb_set(r, '{fields}', coalesce(r->'fields', '{}'::jsonb) - substr(k, 3))
                  else r - k end;
      else
        force := force || k;
      end if;
    end loop;
  end if;

  up := contacts_upsert(p_ws, 'form', jsonb_build_array(r));
  cid := (up->'ids'->>0)::uuid;

  if c.id is not null and cid = c.id and cardinality(force) > 0 then
    foreach k in array force loop
      if k = 'company' then
        comp := case
          when nullif(lower(btrim(r->>'company_domain')), '') is not null
            then (select id from companies where workspace_id = p_ws and domain = lower(btrim(r->>'company_domain')))
          when nullif(btrim(r->>'company_name'), '') is not null
            then (select id from companies where workspace_id = p_ws and domain is null and lower(name) = lower(btrim(r->>'company_name')) limit 1)
        end;
        if comp is not null then
          vals := vals || jsonb_build_object('company', comp::text);
        end if;
      elsif k like 'f.%' then
        if r->'fields'->substr(k, 3) is not null then
          vals := vals || jsonb_build_object(k, r->'fields'->substr(k, 3));
        end if;
      elsif nullif(btrim(r->>k), '') is not null then
        vals := vals || jsonb_build_object(k, case when k = 'country' then upper(btrim(r->>k)) else btrim(r->>k) end);
      end if;
    end loop;
    perform contact_force(p_ws, cid, 'form', vals);
  end if;
  return up;
end;
$$;

-- form_submit as in 045_form_builder.sql, with the contact written through form_contact_write.
create or replace function public.form_submit(p_form uuid, p_version int, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb,
  p_consent jsonb, p_country text, p_spam text, p_test boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  sid uuid;
  cid uuid;
  up jsonb;
  d record;
  topic uuid;
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

  -- The basis comes from the consent box below, never from the row; the overwrite policy is applied here.
  up := form_contact_write(f.workspace_id, p_contact);
  cid := (up->'ids'->>0)::uuid;
  update submissions set contact_id = cid where id = sid;

  if cid is not null and coalesce((p_consent->>'given')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'opt_in', 'granted', 'form', left(p_consent->>'wording', 2000));
    -- An opt-in joins the form's topic, when it has one.
    topic := (select (v.body->'consent'->>'topicId')::uuid from form_versions v
              where v.form_id = p_form and v.version = p_version and v.body->'consent'->>'topicId' ~ '^[0-9a-f-]{36}$');
    if topic is not null and exists (select 1 from topics where id = topic and workspace_id = f.workspace_id) then
      insert into subscriptions (workspace_id, contact_id, topic_id, status) values (f.workspace_id, cid, topic, 'subscribed')
      on conflict (contact_id, topic_id) do update set status = 'subscribed', at = now();
    end if;
  elsif cid is not null and coalesce((p_consent->>'notice')::boolean, false) then
    insert into consents (workspace_id, contact_id, channel, basis, status, source, wording)
    values (f.workspace_id, cid, 'email', 'legitimate_interest', 'granted', 'form', left(p_consent->>'wording', 2000));
  end if;
  if cid is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    -- The same shape as 041_forms.sql, which nurture triggers, lead scoring and CRM activity read.
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (f.workspace_id, cid, 'form.submitted',
            jsonb_strip_nulls(jsonb_build_object('form_id', p_form, 'form_name', f.name, 'submission_id', sid, 'answers', coalesce(p_values, '{}'),
              'utm', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(coalesce(p_hidden, '{}'))
                      where key ~ '^(first_)?(utm_(source|medium|campaign|term|content)|gclid|fbclid|li_fat_id|msclkid)$'),
              'page', p_hidden->>'page', 'referrer', p_hidden->>'referrer', 'test', case when p_test then true end)), 'form');
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

do $$
declare
  f text;
begin
  foreach f in array array['contact_force(uuid, uuid, text, jsonb)', 'form_contact_write(uuid, jsonb)',
    'form_submit(uuid, int, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
