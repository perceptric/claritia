-- Instant booking on form submit (docs/meetings-scheduler.md Part 2). A fill that books with Claritia calendar gets
-- times in the form; the booking goes through meeting_book with the fill's submission. Here:
--   submissions.booking_shown_at  when times were first shown (the booking token's 2 hours run from it, so a retried
--                                 send gets the same token); booking_type_id the meeting type shown;
--   submissions.not_booked_at     set by the book-later job (submission_not_booked) when the lead didn't book;
--   meetings_one_per_submission   one live meeting per fill, so two clicks at once can't book twice;
--   form_booking_ctx              what the server needs to offer and book for a fill, in one read;
--   form_booking_shown            marks the times shown and queues meeting_book_later once per submission;
--   form_booking_stats            booked, not booked and the booking rate for a form's Results tab (members).

alter table public.submissions add column if not exists booking_shown_at timestamptz;
alter table public.submissions add column if not exists booking_type_id uuid references public.meeting_types (id) on delete set null;
alter table public.submissions add column if not exists not_booked_at timestamptz;
create index if not exists submissions_booking on public.submissions (form_id) where booking_shown_at is not null;

create unique index if not exists meetings_one_per_submission on public.meetings (submission_id) where submission_id is not null and status = 'booked';

create or replace function public.form_booking_ctx(p_submission uuid, p_type uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'workspace_id', s.workspace_id,
    'contact_id', s.contact_id,
    'spam', s.spam,
    'email', c.email,
    'first_name', c.first_name,
    'last_name', c.last_name,
    'owner', c.owner_user_id,
    'shown_at', s.booking_shown_at,
    'type', (select jsonb_build_object('id', t.id, 'workspace_id', t.workspace_id, 'slug', t.slug, 'name', t.name, 'kind', t.kind, 'hosts', t.hosts,
                                       'settings', t.settings, 'secret', t.secret, 'active', t.active, 'owner_user_id', t.owner_user_id,
                                       'template_id', t.template_id, 'locked', to_jsonb(t.locked))
             from meeting_types t where t.id = p_type and t.workspace_id = s.workspace_id and t.active),
    'meeting', (select jsonb_build_object('id', m.id, 'start', m.start_at, 'end', m.end_at, 'hosts', to_jsonb(m.hosts))
                from meetings m where m.submission_id = s.id and m.status = 'booked' order by m.created_at desc limit 1),
    'profiles', coalesce((select jsonb_object_agg(p.user_id, jsonb_build_object('name', p.name, 'photo', p.photo_url))
                          from booking_profiles p
                          where p.workspace_id = s.workspace_id
                            and (p.user_id = c.owner_user_id
                                 or p.user_id in (select (h->>'user_id')::uuid from meeting_types t, jsonb_array_elements(t.hosts) h
                                                  where t.id = p_type and h->>'user_id' ~ '^[0-9a-f-]{36}$'))), '{}'::jsonb)
  )
  from submissions s left join contacts c on c.id = s.contact_id
  where s.id = p_submission;
$$;

-- The first showing wins: a retried send, or two at once, changes nothing and queues nothing more.
create or replace function public.form_booking_shown(p_submission uuid, p_type uuid, p_owner uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
  s submissions%rowtype;
begin
  update submissions set booking_shown_at = now(), booking_type_id = p_type
  where id = p_submission and booking_shown_at is null
  returning * into s;
  if s.id is null then
    select booking_shown_at into t from submissions where id = p_submission;
    return t;
  end if;
  perform enqueue_job(s.workspace_id, 'meeting_book_later', 'book_later:' || p_submission::text,
    jsonb_strip_nulls(jsonb_build_object('submission', p_submission, 'type', p_type, 'owner', p_owner)), 600, 3);
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.offered', jsonb_strip_nulls(jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', p_type, 'owner', p_owner)), 'form');
  end if;
  return s.booking_shown_at;
end;
$$;

-- For the book-later job: mark a fill not booked when times were shown and no meeting came of it. True when it marked.
create or replace function public.submission_not_booked(p_submission uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  s submissions%rowtype;
begin
  update submissions x set not_booked_at = now()
  where x.id = p_submission and x.booking_shown_at is not null and x.not_booked_at is null
    and not exists (select 1 from meetings m where m.submission_id = x.id and m.status in ('booked', 'held', 'no_show', 'pending_payment'))
  returning * into s;
  if s.id is null then return false; end if;
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.not_booked', jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', s.booking_type_id), 'form');
  end if;
  return true;
end;
$$;

-- Results: fills that saw times, those that booked (a meeting from the fill that wasn't canceled) and those marked
-- not booked. Read as the member (row security applies); tests and spam left out.
create or replace function public.form_booking_stats(p_form uuid) returns jsonb
language sql stable security invoker set search_path = public as $$
  with f as (
    select s.booking_shown_at is not null as shown, s.not_booked_at is not null as missed,
           exists (select 1 from meetings m where m.submission_id = s.id and m.status in ('booked', 'held', 'no_show')) as booked
    from submissions s where s.form_id = p_form and not s.test and not s.spam
  )
  select jsonb_build_object('shown', count(*) filter (where shown), 'booked', count(*) filter (where booked),
                            'not_booked', count(*) filter (where shown and missed and not booked))
  from f;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['form_booking_ctx(uuid, uuid)', 'form_booking_shown(uuid, uuid, uuid)', 'submission_not_booked(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
  execute 'revoke execute on function public.form_booking_stats(uuid) from public, anon';
  execute 'grant execute on function public.form_booking_stats(uuid) to authenticated, service_role';
end;
$$;
