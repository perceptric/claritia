-- The booking page, round 2 (docs/booking-page-plan.md): each host's time zone for the guest's second clock, a short
-- hold on a time while the guest confirms, and a form fill's answers by label so the booking skips what the form
-- already asked. Service role only; guests never read these tables.

-- Hosts' time zones: the booking page shows "4:30 PM for Vincent" beside the guest's own time.
create or replace function public.book_profiles(p_ws uuid, p_users uuid[]) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('user_id', p.user_id, 'slug', p.slug, 'name', p.name, 'headline', p.headline, 'photo_url', p.photo_url,
                                               'tz', (select a.tz from availability a where a.workspace_id = p_ws and a.user_id = p.user_id)) order by p.name), '[]')
  from booking_profiles p where p.workspace_id = p_ws and p.user_id = any(p_users);
$$;

-- Holds: a picked time is kept for one guest for 5 minutes. One hold per guest (their page's token, hashed); a time
-- someone else holds leaves the other guests' lists and their bookings of it are refused until it runs out.
create table if not exists public.slot_holds (
  type_id uuid not null references public.meeting_types (id) on delete cascade,
  start_at timestamptz not null,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  primary key (type_id, start_at)
);
create index if not exists slot_holds_token on public.slot_holds (token_hash);
create index if not exists slot_holds_expires on public.slot_holds (expires_at);
alter table public.slot_holds enable row level security;

-- Take a time for this token: its other hold goes, run-out holds go, and the time is taken unless someone else holds it.
create or replace function public.slot_hold(p_type uuid, p_start timestamptz, p_token text, p_minutes int default 5) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  delete from slot_holds where token_hash = p_token or expires_at <= now();
  insert into slot_holds (type_id, start_at, token_hash, expires_at)
  values (p_type, p_start, p_token, now() + make_interval(mins => least(greatest(p_minutes, 1), 10)))
  on conflict (type_id, start_at) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- The times of a type that other guests hold right now (ms since 1970).
create or replace function public.slot_holds_taken(p_type uuid, p_token text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg((extract(epoch from start_at) * 1000)::bigint order by start_at), '[]')
  from slot_holds where type_id = p_type and expires_at > now() and token_hash is distinct from p_token;
$$;

create or replace function public.slot_hold_release(p_token text) returns void
language sql security definer set search_path = public as $$
  delete from slot_holds where token_hash = p_token;
$$;

-- A form fill's answers with each field's label and key, from the version of the form it was sent on.
create or replace function public.fill_answers(p_submission uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', f->>'label', 'key', f->>'key', 'type', f->>'type', 'value', s."values"->(f->>'id'))), '[]')
  from submissions s
  join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  cross join lateral jsonb_array_elements(coalesce(v.body->'steps', '[]')) st
  cross join lateral jsonb_array_elements(coalesce(st->'fields', '[]')) f
  where s.id = p_submission and s."values" ? (f->>'id');
$$;

revoke execute on function public.slot_hold(uuid, timestamptz, text, int) from public, anon, authenticated;
revoke execute on function public.slot_holds_taken(uuid, text) from public, anon, authenticated;
revoke execute on function public.slot_hold_release(text) from public, anon, authenticated;
revoke execute on function public.fill_answers(uuid) from public, anon, authenticated;
grant execute on function public.slot_hold(uuid, timestamptz, text, int) to service_role;
grant execute on function public.slot_holds_taken(uuid, text) to service_role;
grant execute on function public.slot_hold_release(text) to service_role;
grant execute on function public.fill_answers(uuid) to service_role;
