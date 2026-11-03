-- Forms and booking in fewer round trips (the speed work, builder C). Every function here wraps the ones it names, so
-- their rules stay where they are and a later rewrite of those (086) still applies. Run after 089. Safe to run more
-- than once. Service role only. The server falls back to the old calls while a function here is missing.
--
--   form_submit_all       form_submit, plus the form's hourly limit (a fill past it is held as spam, reason 'rate')
--                         and the alert and auto-reply jobs (form_notify), in one transaction
--   router_facts_full     router_facts with the enrichment columns router_facts_more adds, under 'more'
--   book_page             a booking page's target (book_target) with its look (booking_look), found by workspace and
--                         slug or by a /booking/<handle>
--   meeting_book_all      meeting_book, then the sealed manage token, the team meeting's run (or its job when the
--                         queue is busy), the guest's contact and the meeting_sync job, in one transaction
--   poll_book_all         poll_book with the same tail
--   poll_vote_view        poll_vote, answering with the poll as it is now (book_link)
--   meeting_cancel_guest  the guest cancels: meeting_status, the meeting_sync job, and the meeting as it is now
--   meeting_move_guest    the guest moves: meeting_move, the meeting_sync job, and the meeting as it is now
--   form_submission_keys  the answer keys a form's last fills used (the form chat)

-- Forms --------------------------------------------------------------------------------------------------------------

create or replace function public.form_submit_all(p_form uuid, p_version int, p_idem text, p_values jsonb, p_hidden jsonb, p_contact jsonb,
  p_consent jsonb, p_country text, p_spam text, p_test boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b jsonb;
  ws uuid;
  per numeric;
  spam text := p_spam;
  contact jsonb := p_contact;
  r jsonb;
  sid text;
begin
  select v.body, f.workspace_id into b, ws from form_versions v join forms f on f.id = v.form_id where v.form_id = p_form and v.version = p_version;
  -- Past the hourly limit (submissions in the last hour, spam and tests aside): kept in Spam, never a contact.
  per := case when jsonb_typeof(b->'spam'->'perHour') = 'number' then (b->'spam'->>'perHour')::numeric end;
  if spam is null and not coalesce(p_test, false) and per > 0 and form_hour_count(p_form) >= per then
    spam := 'rate';
    contact := null;
  end if;
  -- form_submit refuses a form that isn't live and a version it doesn't have.
  r := form_submit(p_form, p_version, p_idem, p_values, p_hidden, contact, p_consent, p_country, spam, p_test);
  sid := r->>'id';
  -- The alerts go now (the job waits for routing); the auto-reply 5 minutes later. The key is the submission's, so a
  -- repeat never queues twice.
  if not coalesce((r->>'repeat')::boolean, false) and spam is null and not coalesce(p_test, false) and sid is not null then
    if b->'notify'->'on' = 'true'::jsonb then
      perform enqueue_job(ws, 'form_notify', 'form_notify:' || sid, jsonb_build_object('submission', sid, 'only', 'alerts'));
    end if;
    if b->'reply'->'on' = 'true'::jsonb then
      perform enqueue_job(ws, 'form_notify', 'form_reply:' || sid, jsonb_build_object('submission', sid, 'only', 'reply'), 300);
    end if;
  end if;
  return r || jsonb_build_object('spam', spam, 'notified', true);
end;
$$;

-- The answer keys of a form's latest 300 fills that aren't spam, for the chat's "keys in use".
create or replace function public.form_submission_keys(p_form uuid) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct k order by k), '{}')
  from (select s."values" from submissions s where s.form_id = p_form and not s.spam order by s.created_at desc limit 300) x,
       jsonb_object_keys(case when jsonb_typeof(x."values") = 'object' then x."values" else '{}'::jsonb end) k;
$$;

-- Routing ------------------------------------------------------------------------------------------------------------

create or replace function public.router_facts_full(p_ws uuid, p_contact uuid, p_key text, p_users uuid[], p_queues text[], p_email text default null,
  p_email_class text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f jsonb := router_facts(p_ws, p_contact, p_key, p_users, p_queues, p_email, p_email_class);
  cid uuid;
begin
  if f is null or f ? 'existing' then return f; end if;
  cid := nullif(f->'contact'->>'id', '')::uuid;
  return f || jsonb_build_object('more', case when cid is null then '{}'::jsonb else coalesce(router_facts_more(cid), '{}'::jsonb) end);
end;
$$;

-- Booking pages ------------------------------------------------------------------------------------------------------

/*
 * What a booking page draws, in one read: book_target plus 'look' (booking_look: the person's, else the team page's).
 * With p_handle (/booking/<handle>), the handle is resolved first (booking_resolve) and answers as 'handle'; the slug
 * then defaults to the handle's person. Null when nothing is there.
 */
create or replace function public.book_page(p_ws text, p_slug text default null, p_form uuid default null, p_handle text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  h jsonb;
  t jsonb;
  w text := p_ws;
  s text := p_slug;
begin
  if p_handle is not null then
    h := booking_resolve(p_handle);
    if h is null then return null; end if;
    w := h->>'ws';
    s := coalesce(p_slug, h->>'person');
  end if;
  if w is null then return null; end if;
  t := book_target(w, s, p_form);
  if t is null then return null; end if;
  return t || jsonb_build_object('look', booking_look((t->'ws'->>'id')::uuid, nullif(t->'profile'->>'user_id', '')::uuid), 'handle', h);
end;
$$;

-- Booking ------------------------------------------------------------------------------------------------------------

/*
 * The booking and everything that follows it, in one transaction, so the guest's manage link and the calendar job
 * exist exactly when the meeting does:
 *   p_sealed       the sealed copy of the guest's manage token (meeting_token_keep)
 *   p_team         a Routing team's pick {queue, owner, version}: the queue's run is written here when its lock is
 *                  free at once, else the meeting_team_run job writes it (the key is the meeting, so it's written once)
 *   p_contact_row  the guest as a new contact, when the CRM doesn't have them (meeting_contact_make); a failure
 *                  there never stops the booking
 *   p_sync         queue meeting_sync to make the calendar events and send the confirmation
 * Refuses what meeting_book refuses (slot_taken, full, link_used, link_closed), writing nothing.
 */
create or replace function public.meeting_book_all(
  p_ws uuid, p_type uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz,
  p_guest jsonb, p_source text, p_token_hash text, p_status text default 'booked', p_contact uuid default null, p_submission uuid default null,
  p_link uuid default null, p_seats int default 0, p_rr boolean default false, p_location jsonb default '{}', p_booked_by uuid default null,
  p_sealed text default null, p_team jsonb default null, p_contact_row jsonb default null, p_sync boolean default true
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  team text;
begin
  mid := meeting_book(p_ws, p_type, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, p_source, p_token_hash, p_status, p_contact,
                      p_submission, p_link, p_seats, p_rr, p_location, p_booked_by);
  if p_sealed is not null then
    perform meeting_token_keep(mid, p_token_hash, p_sealed);
  end if;
  if p_team is not null and nullif(p_team->>'queue', '') is not null and nullif(p_team->>'owner', '') is not null then
    -- Never wait on the queue: busy, or failing, the job writes the run a moment later.
    if pg_try_advisory_xact_lock(hashtextextended('router-queue:' || p_ws::text || ':' || (p_team->>'queue'), 0)) then
      begin
        perform meeting_team_run(p_ws, mid, p_contact, p_team->>'queue', (p_team->>'owner')::uuid, nullif(p_team->>'version', '')::int, '[]'::jsonb);
        team := 'written';
      exception when others then
        team := null;
      end;
    end if;
    if team is null then
      perform enqueue_job(p_ws, 'meeting_team_run', 'booking:' || mid::text,
        jsonb_build_object('p_ws', p_ws, 'p_meeting', mid, 'p_contact', p_contact, 'p_queue', p_team->>'queue', 'p_owner', p_team->>'owner',
                           'p_version', p_team->'version', 'p_steps', '[]'::jsonb), 0, 8);
      team := 'queued';
    end if;
  end if;
  if p_contact is null and p_contact_row is not null and p_status = 'booked' then
    begin
      perform meeting_contact_make(mid, p_contact_row);
    exception when others then
      null;
    end;
  end if;
  if p_sync and p_status = 'booked' then
    perform enqueue_job(p_ws, 'meeting_sync', 'create:' || mid::text, jsonb_build_object('meeting', mid, 'action', 'create'));
  end if;
  return jsonb_build_object('id', mid, 'team', team);
end;
$$;

-- poll_book with the same tail: the sealed token, the guest's contact and meeting_sync.
create or replace function public.poll_book_all(
  p_link uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz,
  p_guest jsonb, p_token_hash text, p_location jsonb default '{}', p_booked_by uuid default null, p_sealed text default null, p_contact_row jsonb default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  mid uuid;
  ws uuid;
begin
  mid := poll_book(p_link, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, p_token_hash, p_location, p_booked_by);
  select workspace_id into ws from meetings where id = mid;
  if p_sealed is not null then
    perform meeting_token_keep(mid, p_token_hash, p_sealed);
  end if;
  if p_contact_row is not null then
    begin
      perform meeting_contact_make(mid, p_contact_row);
    exception when others then
      null;
    end;
  end if;
  perform enqueue_job(ws, 'meeting_sync', 'create:' || mid::text, jsonb_build_object('meeting', mid, 'action', 'create'));
  return jsonb_build_object('id', mid);
end;
$$;

-- A guest's vote, answering with the poll as it is now.
create or replace function public.poll_vote_view(p_hash text, p_email text, p_name text, p_picks timestamptz[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  perform poll_vote(p_hash, p_email, p_name, p_picks);
  return book_link(p_hash, null);
end;
$$;

-- The guest cancels: a booked meeting's calendar event is canceled by meeting_sync; a time held for payment lets go.
create or replace function public.meeting_cancel_guest(p_id uuid, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  was text;
  ws uuid;
begin
  select status, workspace_id into was, ws from meetings where id = p_id;
  perform meeting_status(p_id, 'canceled', p_reason, null);
  if was = 'booked' then
    perform enqueue_job(ws, 'meeting_sync', 'cancel:' || p_id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      jsonb_build_object('meeting', p_id, 'action', 'cancel'));
  end if;
  return book_meeting(null, p_id);
end;
$$;

-- The guest moves: meeting_move's locks and overlap check, then meeting_sync moves the calendar event.
create or replace function public.meeting_move_guest(p_id uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz,
  p_block_end timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  perform meeting_move(p_id, p_hosts, p_start, p_end, p_block_start, p_block_end);
  select workspace_id into ws from meetings where id = p_id;
  perform enqueue_job(ws, 'meeting_sync', 'move:' || p_id::text || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    jsonb_build_object('meeting', p_id, 'action', 'move'));
  return book_meeting(null, p_id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'form_submit_all(uuid, int, text, jsonb, jsonb, jsonb, jsonb, text, text, boolean)',
    'form_submission_keys(uuid)',
    'router_facts_full(uuid, uuid, text, uuid[], text[], text, text)',
    'book_page(text, text, uuid, text)',
    'meeting_book_all(uuid, uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, text, text, uuid, uuid, uuid, int, boolean, jsonb, uuid, text, jsonb, jsonb, boolean)',
    'poll_book_all(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, jsonb, uuid, text, jsonb)',
    'poll_vote_view(text, text, text, timestamptz[])',
    'meeting_cancel_guest(uuid, text)',
    'meeting_move_guest(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
