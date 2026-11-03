-- Form settings (docs/forms-plan.md Part 6): team alerts, the auto-reply, an hourly limit and how long submissions
-- are kept. The settings live in the form's body (src/lib/forms/notify.ts); this adds what the server needs:
--   form_hour_count     submissions in the last hour, for the hourly limit (the submit route only).
--   form_notify_info    everything one submission's alert and auto-reply need, in one read (the form_notify job).
--   form_notify_sent    which parts went (each teammate's alert, slack, reply), so a retried job never sends one twice.
--   forms_keep_prune    nightly: deletes submissions older than their form keeps them. Contacts stay.
--   form_submissions_clear  a member deletes every submission of one form.

create table if not exists public.form_notify_sent (
  submission_id uuid not null references public.submissions (id) on delete cascade,
  -- 'alert:<address>' per teammate, 'slack', 'reply'.
  part text not null check (part ~ '^(alert:[^\s]{3,254}|slack|reply)$'),
  at timestamptz not null default now(),
  primary key (submission_id, part)
);
alter table public.form_notify_sent enable row level security;
revoke all on public.form_notify_sent from anon, authenticated;

create or replace function public.form_hour_count(p_form uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from submissions
  where form_id = p_form and not spam and not test and created_at > now() - interval '1 hour';
$$;

create or replace function public.form_notify_info(p_sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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
    'sent', coalesce((select jsonb_agg(n.part) from form_notify_sent n where n.submission_id = s.id), '[]'))
  from submissions s
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id
  where s.id = p_sid;
$$;

create or replace function public.form_notify_mark(p_sid uuid, p_part text) returns void
language sql security definer set search_path = public as $$
  insert into form_notify_sent (submission_id, part) values (p_sid, p_part) on conflict do nothing;
$$;

-- Each form's live version says how many days it keeps; a form with no live version keeps everything.
create or replace function public.forms_keep_prune() returns int
language plpgsql security definer set search_path = public as $$
declare
  n int := 0;
  k int;
  r record;
begin
  for r in
    select f.id, (v.body->'keep'->>'days')::int as days
    from forms f join form_versions v on v.form_id = f.id and v.version = f.version
    where f.version > 0 and v.body->'keep'->>'days' ~ '^[0-9]{1,5}$' and (v.body->'keep'->>'days')::int >= 1
  loop
    delete from submissions where form_id = r.id and created_at < now() - make_interval(days => r.days);
    get diagnostics k = row_count;
    n := n + k;
  end loop;
  return n;
end;
$$;

create or replace function public.form_submissions_clear(p_form uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  n int;
  ws uuid;
begin
  select workspace_id into ws from forms where id = p_form;
  if ws is null or not is_member(ws) then
    raise exception 'Form not found';
  end if;
  delete from submissions where form_id = p_form;
  get diagnostics n = row_count;
  return n;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['form_hour_count(uuid)', 'form_notify_info(uuid)', 'form_notify_mark(uuid, text)', 'forms_keep_prune()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
revoke execute on function public.form_submissions_clear(uuid) from public, anon;
grant execute on function public.form_submissions_clear(uuid) to authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-forms-keep', '37 3 * * *', 'select public.forms_keep_prune()');
  end if;
end;
$$;
