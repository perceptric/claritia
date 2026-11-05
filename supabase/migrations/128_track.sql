-- Tracking (docs/integrations-plan.md, Next step 2). A fill on a form whose Tracking sends server events (Meta's
-- Conversions API, a Google Ads upload) keeps what those events need from the browser for 30 days: the visitor's
-- address and browser, Meta's cookies and the page. Each event is a track_send job, keyed by the fill (and by the
-- fill for its booking), so a repeat never sends twice. Only fills whose consent allows ad events get here.

create table if not exists public.submission_track (
  submission_id uuid primary key references public.submissions (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  info jsonb not null default '{}' check (jsonb_typeof(info) = 'object' and length(info::text) <= 4000),
  created_at timestamptz not null default now()
);
create index if not exists submission_track_created on public.submission_track (created_at);
alter table public.submission_track enable row level security;
revoke all on public.submission_track from anon, authenticated;

-- Keep a fill's browser details and queue its event. The first write wins, so a repeated send changes nothing.
create or replace function public.track_keep(p_sub uuid, p_info jsonb) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  n int;
begin
  select workspace_id into ws from submissions where id = p_sub and not spam and not test;
  if ws is null then return false; end if;
  insert into submission_track (submission_id, workspace_id, info) values (p_sub, ws, coalesce(p_info, '{}'))
  on conflict (submission_id) do nothing;
  get diagnostics n = row_count;
  if n = 0 then return false; end if;
  -- A few seconds, so the fill's contact is in.
  perform enqueue_job(ws, 'track_send', 'track:' || p_sub, jsonb_build_object('submission', p_sub, 'event', 'submit'), 10, 6);
  return true;
end;
$$;

-- A booking from that fill: its own event, once.
create or replace function public.track_booked(p_sub uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
begin
  select workspace_id into ws from submission_track where submission_id = p_sub;
  if ws is null then return false; end if;
  perform enqueue_job(ws, 'track_send', 'track:b:' || p_sub, jsonb_build_object('submission', p_sub, 'event', 'booked'), 0, 6);
  return true;
end;
$$;

-- What the job sends: the form's Tracking, the browser details, the fill's click ids and page, its contact, and the
-- workspace's Meta and Google Ads connections. Null when the fill or its details are gone.
create or replace function public.track_take(p_sub uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'workspace_id', s.workspace_id,
    'submission', jsonb_build_object('id', s.id, 'created_at', s.created_at, 'hidden', s.hidden, 'contact_id', s.contact_id),
    'form', jsonb_build_object('id', f.id, 'name', f.name),
    'track', coalesce(v.body->'track', '{}'::jsonb),
    'info', t.info,
    'booked_at', (select m.created_at from meetings m where m.submission_id = s.id and m.status <> 'canceled' order by m.created_at limit 1),
    'contact', case when c.id is null then null else jsonb_build_object('id', c.id, 'email', c.email_clean, 'phone', c.phone, 'first_name', c.first_name,
                 'last_name', c.last_name, 'country', c.country) end,
    'meta_source', (select x.id from sources x where x.workspace_id = s.workspace_id and x.kind = 'meta_ads' and x.status <> 'disconnected' order by x.created_at limit 1),
    'ads_source', (select x.id from sources x where x.workspace_id = s.workspace_id and x.kind = 'google_ads' and x.status <> 'disconnected' order by x.created_at limit 1)
  )
  from submission_track t
  join submissions s on s.id = t.submission_id
  left join forms f on f.id = s.form_id
  left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
  left join contacts c on c.id = s.contact_id and c.deleted_at is null
  where t.submission_id = p_sub;
$$;

-- Kept 30 days.
create or replace function public.track_prune() returns void
language sql security definer set search_path = public as $$
  delete from submission_track where created_at < now() - interval '30 days';
$$;

do $$
declare
  f text;
begin
  foreach f in array array['track_keep(uuid, jsonb)', 'track_booked(uuid)', 'track_take(uuid)', 'track_prune()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('claritia-track-prune', '41 4 * * *', 'select public.track_prune()');
  end if;
end;
$$;

notify pgrst, 'reload schema';
