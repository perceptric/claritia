-- Where each fill came from (docs/sharing-plan.md, Channels): Share tags every fill with its channel (link, QR code,
-- email, personal link, each website style, the site's own form), kept in submissions.hidden as "channel" beside the
-- UTM tags. Submissions filters by it, and shows how many fills and booked meetings each channel brought.
--   form_fill_set       takes channel as one more filter
--   form_fill_channels  for one form and a set of filters (channel aside): {"<channel>": {"fills": n, "booked": n}},
--                       with fills from before channels under "none"

create or replace function public.form_fill_set(p_form uuid, p_f jsonb) returns table (id uuid, created_at timestamptz)
language sql stable as $$
  select s.id, s.created_at from public.submissions s
  where s.form_id = p_form
    and case coalesce(p_f->>'kind', 'leads') when 'spam' then s.spam when 'tests' then s.test and not s.spam else not s.test and not s.spam end
    and (public.fill_query(p_f->>'q') is null or s.search @@ public.fill_query(p_f->>'q'))
    and (p_f->>'from' is null or s.created_at >= (p_f->>'from')::timestamptz)
    and (p_f->>'to' is null or s.created_at < (p_f->>'to')::timestamptz)
    and case p_f->>'status'
      when 'failed' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'failed')
      when 'waiting' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status in ('queued', 'sending', 'retrying', 'held'))
      when 'sent' then exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status = 'done')
        and not exists (select 1 from public.deliveries d where d.submission_id = s.id and d.status not in ('done', 'skipped'))
      else true end
    and (jsonb_typeof(p_f->'booked') is distinct from 'boolean'
      or (p_f->>'booked')::boolean = (exists (select 1 from public.form_bookings b where b.submission_id = s.id)
        or exists (select 1 from public.meetings m where m.submission_id = s.id and m.status <> 'canceled')))
    and (p_f->>'channel' is null or s.hidden->>'channel' = p_f->>'channel')
    and (p_f->>'key' is null
      or s."values"->(p_f->>'key') = to_jsonb(p_f->>'value')
      or s."values"->(p_f->>'key') @> jsonb_build_array(p_f->>'value')
      or (s."values"->(p_f->>'key'))::text = (p_f->>'value'));
$$;

create or replace function public.form_fill_channels(p_form uuid, p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  out jsonb;
begin
  perform form_member(p_form);
  select coalesce(jsonb_object_agg(t.channel, jsonb_build_object('fills', t.fills, 'booked', t.booked)), '{}') into out from (
    select coalesce(s.hidden->>'channel', 'none') as channel, count(*) as fills,
           count(*) filter (where exists (select 1 from form_bookings b where b.submission_id = s.id)
             or exists (select 1 from meetings m where m.submission_id = s.id and m.status <> 'canceled')) as booked
    from form_fill_set(p_form, coalesce(p_filters, '{}') - 'channel') x
    join submissions s on s.id = x.id
    group by 1
  ) t;
  return out;
end;
$$;

do $$
begin
  revoke execute on function public.form_fill_channels(uuid, jsonb) from public, anon;
  grant execute on function public.form_fill_channels(uuid, jsonb) to authenticated, service_role;
end;
$$;
