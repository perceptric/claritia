-- Public booking (docs/meetings-scheduler.md 1.6 to 1.8b, from the guest's side): booking pages, manage links, one-off
-- and single-use links, polls and paid types. Guests never read tables: the server reads through the functions below
-- (service role only) and answers with what a guest may see. Writes keep going through meeting_book, meeting_move and
-- meeting_status (053); the new writes here are a poll's vote and its booking, and a paid meeting's payment.

-- Where a one-off meeting or a poll's meeting happens (a type's links use the type's location).
alter table public.meeting_links add column if not exists location jsonb check (location is null or jsonb_typeof(location) = 'object');

-- A workspace's own Stripe account (Connect Standard): guests pay the team directly, and Claritia never holds money.
create table if not exists public.payment_accounts (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  stripe_account text not null unique check (stripe_account ~ '^acct_[A-Za-z0-9]{1,64}$'),
  -- Stripe says the account can take card payments.
  ready boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.payment_accounts enable row level security;
revoke all on public.payment_accounts from anon;
revoke insert, update, delete on public.payment_accounts from authenticated;
create policy "members read" on public.payment_accounts for select using (is_member(workspace_id));

create or replace function public.payment_account_set(p_ws uuid, p_account text, p_ready boolean) returns void
language sql security definer set search_path = public as $$
  insert into payment_accounts (workspace_id, stripe_account, ready) values (p_ws, p_account, p_ready)
  on conflict (workspace_id) do update set stripe_account = excluded.stripe_account, ready = excluded.ready, updated_at = now();
$$;

-- What pages need ---------------------------------------------------------------------------------------------------

-- The brand kit for a page: the form's kit when the page was opened from one of this workspace's forms, else the
-- workspace's newest kit.
create or replace function public.book_kit(p_ws uuid, p_form uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url) from forms f join brand_kits k on k.id = f.brand_kit_id where f.id = p_form and f.workspace_id = p_ws),
    (select jsonb_build_object('tokens', k.tokens, 'logo_url', k.logo_url) from brand_kits k where k.workspace_id = p_ws order by k.created_at desc limit 1),
    jsonb_build_object('tokens', '{}'::jsonb, 'logo_url', null)
  );
$$;

-- Turnstile on booking pages when any of the workspace's live forms uses it.
create or replace function public.book_turnstile(p_ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from forms f join form_versions v on v.form_id = f.id and v.version = f.version
    where f.workspace_id = p_ws and f.status = 'live' and v.body->'spam'->>'turnstile' = 'true'
  );
$$;

create or replace function public.book_profiles(p_ws uuid, p_users uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url) order by p.name), '[]')
  from booking_profiles p where p.workspace_id = p_ws and p.user_id = any(p_users);
$$;

create or replace function public.book_ws(p_ws uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.booking_slug, 'kit', book_kit(w.id), 'turnstile', book_turnstile(w.id),
                            'pay', (select jsonb_build_object('account', a.stripe_account, 'ready', a.ready) from payment_accounts a where a.workspace_id = w.id))
  from workspaces w where w.id = p_ws;
$$;

/*
 * A booking address: /book/<workspace> (p_slug null) is the team page with every public team type; /book/<workspace>/
 * <slug> is a meeting type when one has that slug (secret ones too: the link is the secret), else a person's page with
 * their public types. Null when nothing is there. Inactive types are never reachable.
 */
create or replace function public.book_target(p_ws text, p_slug text default null, p_form uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  w workspaces%rowtype;
  t meeting_types%rowtype;
  p booking_profiles%rowtype;
  types jsonb;
  users uuid[];
begin
  select * into w from workspaces where booking_slug = lower(p_ws);
  if w.id is null then return null; end if;
  if p_slug is not null then
    select * into t from meeting_types where workspace_id = w.id and slug = lower(p_slug) and active;
    if t.id is null then
      select * into p from booking_profiles where workspace_id = w.id and slug = lower(p_slug);
      if p.user_id is null then return null; end if;
    end if;
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.name), '[]') into types
  from meeting_types x
  where x.workspace_id = w.id and x.active and not x.secret and t.id is null
    and case when p.user_id is not null
             then x.owner_user_id = p.user_id or (x.owner_user_id is null and x.kind in ('one', 'group') and x.hosts->0->>'user_id' = p.user_id::text)
             else x.owner_user_id is null end;
  select array_agg(distinct (h->>'user_id')::uuid) into users
  from (select jsonb_array_elements(case when t.id is null then '[]'::jsonb else t.hosts end) h
        union all select jsonb_array_elements(y->'hosts') from jsonb_array_elements(types) y) z
  where h->>'user_id' ~ '^[0-9a-f-]{36}$';
  if p.user_id is not null then users := coalesce(users, '{}') || p.user_id; end if;
  return jsonb_build_object(
    'ws', jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.booking_slug),
    'kit', book_kit(w.id, p_form),
    'turnstile', book_turnstile(w.id),
    'pay', exists (select 1 from payment_accounts a where a.workspace_id = w.id and a.ready),
    'type', case when t.id is null then null else to_jsonb(t) end,
    'profile', case when p.user_id is null then null else jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url) end,
    'types', types,
    'profiles', book_profiles(w.id, coalesce(users, '{}'))
  );
end;
$$;

-- A meeting by the hash of its guest's manage token, or by id (the server's own callers: payments, refunds).
create or replace function public.book_meeting(p_hash text default null, p_id uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'meeting', jsonb_build_object('id', m.id, 'workspace_id', m.workspace_id, 'type_id', m.type_id, 'link_id', m.link_id, 'hosts', m.hosts, 'guest_email', m.guest_email,
                                  'guest_name', m.guest_name, 'guest_tz', m.guest_tz, 'start_at', m.start_at, 'end_at', m.end_at, 'status', m.status, 'source', m.source,
                                  'location', m.location, 'payment', m.payment, 'cancel_reason', m.cancel_reason, 'created_at', m.created_at,
                                  'holds', meeting_holds(m)),
    'type', (select to_jsonb(t) from meeting_types t where t.id = m.type_id),
    'link', (select jsonb_build_object('kind', l.kind, 'title', l.title, 'length_min', l.length_min) from meeting_links l where l.id = m.link_id),
    'ws', book_ws(m.workspace_id),
    'profiles', book_profiles(m.workspace_id, m.hosts)
  )
  from meetings m
  where (p_hash is not null and m.token_hash = p_hash) or (p_hash is null and m.id = p_id);
$$;

-- A one-off, single-use or poll link by the hash of its token, or by id (the host's poll booking). Poll picks are
-- counted per time; who voted is only listed for the host (p_id).
create or replace function public.book_link(p_hash text default null, p_id uuid default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'link', jsonb_build_object('id', l.id, 'workspace_id', l.workspace_id, 'kind', l.kind, 'type_id', l.type_id, 'owner_user_id', l.owner_user_id, 'title', l.title,
                               'offered', l.offered, 'length_min', l.length_min, 'location', l.location, 'used', l.used_at is not null, 'closed', l.closed_at is not null
                                 or (l.expires_at is not null and l.expires_at < now()), 'meeting_id', l.meeting_id),
    'type', (select to_jsonb(t) from meeting_types t where t.id = l.type_id and t.active),
    'ws', book_ws(l.workspace_id),
    'owner', (select jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url)
              from booking_profiles p where p.workspace_id = l.workspace_id and p.user_id = l.owner_user_id),
    'profiles', book_profiles(l.workspace_id, array[l.owner_user_id] || coalesce((select array_agg((h->>'user_id')::uuid) from meeting_types t, jsonb_array_elements(t.hosts) h
                                                                                  where t.id = l.type_id and h->>'user_id' ~ '^[0-9a-f-]{36}$'), '{}')),
    'votes', (select coalesce(jsonb_agg(jsonb_build_object('start', s, 'n', n) order by s), '[]')
              from (select (x #>> '{}')::timestamptz s, count(*)::int n from poll_votes v, jsonb_array_elements(v.picks) x where v.link_id = l.id group by 1) c),
    'voters', case when p_id is null then to_jsonb((select count(*)::int from poll_votes v where v.link_id = l.id))
                   else (select coalesce(jsonb_agg(jsonb_build_object('email', v.email, 'name', v.name, 'picks', v.picks) order by v.at), '[]') from poll_votes v where v.link_id = l.id) end
  )
  from meeting_links l
  where (p_hash is not null and l.token_hash = p_hash) or (p_hash is null and l.id = p_id);
$$;

-- A contact already in the CRM with this email, so the booking lands on their timeline.
create or replace function public.book_contact(p_ws uuid, p_email text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from contacts where workspace_id = p_ws and (email_clean = lower(trim(p_email)) or lower(email) = lower(trim(p_email))) order by created_at limit 1;
$$;

-- Polls ----------------------------------------------------------------------------------------------------------------

/*
 * A guest's vote on a poll: their picks, all from the offered times, replacing any earlier vote with the same email.
 * Refuses: link_closed (closed, expired or already booked), bad_pick.
 */
create or replace function public.poll_vote(p_hash text, p_email text, p_name text, p_picks timestamptz[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  l meeting_links%rowtype;
begin
  select * into l from meeting_links where token_hash = p_hash and kind = 'poll' for share;
  if l.id is null or l.closed_at is not null or l.meeting_id is not null or (l.expires_at is not null and l.expires_at < now()) then raise exception 'link_closed'; end if;
  if coalesce(cardinality(p_picks), 0) = 0 or cardinality(p_picks) > 60 or exists (
    select 1 from unnest(p_picks) x
    where not exists (select 1 from jsonb_array_elements(l.offered) o where (o->>'start')::timestamptz = x)
  ) then
    raise exception 'bad_pick';
  end if;
  insert into poll_votes (link_id, email, name, picks)
  values (l.id, lower(trim(p_email)), nullif(trim(left(p_name, 200)), ''), (select jsonb_agg(to_jsonb(x) order by x) from (select distinct x from unnest(p_picks) x) d))
  on conflict (link_id, email) do update set name = excluded.name, picks = excluded.picks, at = now();
end;
$$;

-- The host books a poll's winning time: the link is locked so two clicks can't book twice, the meeting is written by
-- meeting_book (locks, overlap check), and the poll closes in the same transaction.
create or replace function public.poll_book(
  p_link uuid, p_hosts uuid[], p_start timestamptz, p_end timestamptz, p_block_start timestamptz, p_block_end timestamptz,
  p_guest jsonb, p_token_hash text, p_location jsonb default '{}', p_booked_by uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  l meeting_links%rowtype;
  mid uuid;
begin
  select * into l from meeting_links where id = p_link and kind = 'poll' for update;
  if l.id is null or l.closed_at is not null or l.meeting_id is not null then raise exception 'link_closed'; end if;
  if not exists (select 1 from jsonb_array_elements(l.offered) o where (o->>'start')::timestamptz = p_start) then raise exception 'not_offered'; end if;
  mid := meeting_book(l.workspace_id, l.type_id, p_hosts, p_start, p_end, p_block_start, p_block_end, p_guest, 'poll', p_token_hash, 'booked',
                      null, null, p_link, 0, false, p_location, p_booked_by);
  update meeting_links set closed_at = now(), used_at = now(), meeting_id = mid where id = p_link;
  return mid;
end;
$$;

-- Payments ---------------------------------------------------------------------------------------------------------

-- Merge facts about a meeting's payment (checkout session, intent, refund) into meetings.payment.
create or replace function public.meeting_payment(p_id uuid, p_patch jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update meetings set payment = coalesce(payment, '{}') || p_patch, updated_at = now() where id = p_id returning payment;
$$;

/*
 * A paid meeting's payment arrived. With the hosts locked (as meeting_book does): a meeting still waiting on payment
 * is booked when its time is still free (within the 10-minute hold it always is), else canceled. Answers:
 *   booked   now booked: the caller queues the calendar event;
 *   already  booked before (a repeated webhook): nothing to do;
 *   refund   the time was lost, or the meeting was canceled while the guest paid: the caller refunds.
 */
create or replace function public.meeting_pay(p_id uuid, p_payment jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  h uuid;
  seats int := 0;
begin
  select * into m from meetings where id = p_id;
  if m.id is null then raise exception 'not_found'; end if;
  foreach h in array (select array_agg(x order by x) from unnest(m.hosts) x) loop
    perform pg_advisory_xact_lock(hashtextextended('meeting-host:' || h::text, 0));
  end loop;
  select * into m from meetings where id = p_id for update;
  update meetings set payment = coalesce(payment, '{}') || p_payment, updated_at = now() where id = p_id;
  if m.status in ('booked', 'held', 'no_show') then return 'already'; end if;
  if m.status = 'canceled' then return 'refund'; end if;
  select case when t.kind = 'group' then greatest(1, coalesce((t.settings->>'seats')::int, 1)) else 0 end into seats from meeting_types t where t.id = m.type_id;
  seats := coalesce(seats, 0);
  if (seats > 0 and (select count(*) from meetings x where x.id <> m.id and x.type_id = m.type_id and x.start_at = m.start_at and meeting_holds(x)) >= seats)
     or exists (
       select 1 from meetings x
       where x.workspace_id = m.workspace_id and x.id <> m.id and x.hosts && m.hosts and meeting_holds(x)
         and tstzrange(x.block_start, x.block_end) && tstzrange(m.block_start, m.block_end)
         and not (seats > 0 and x.type_id = m.type_id and x.start_at = m.start_at)
     ) then
    update meetings set status = 'canceled', cancel_reason = 'The time was taken before the payment finished.', updated_at = now() where id = p_id;
    insert into meeting_events (meeting_id, kind, detail) values (p_id, 'canceled', jsonb_build_object('reason', 'payment_late'));
    return 'refund';
  end if;
  update meetings set status = 'booked', updated_at = now() where id = p_id;
  insert into meeting_events (meeting_id, kind, detail) values (p_id, 'booked', jsonb_build_object('paid', true));
  perform meeting_timeline(p_id, 'meeting.booked');
  return 'booked';
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'payment_account_set(uuid, text, boolean)', 'book_kit(uuid, uuid)', 'book_turnstile(uuid)', 'book_profiles(uuid, uuid[])', 'book_ws(uuid)',
    'book_target(text, text, uuid)', 'book_meeting(text, uuid)', 'book_link(text, uuid)', 'book_contact(uuid, text)', 'poll_vote(text, text, text, timestamptz[])',
    'poll_book(uuid, uuid[], timestamptz, timestamptz, timestamptz, timestamptz, jsonb, text, jsonb, uuid)', 'meeting_payment(uuid, jsonb)', 'meeting_pay(uuid, jsonb)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
