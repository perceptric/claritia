-- Visitors (docs/visitors.md): everyone on the site, one row per device, known people marked, and one visitor's
-- whole journey. Read-only, members only. A device only exists with full policy (consent where the law asks for it,
-- docs/identity.md Part 3): cookieless visits have no device, so they never show as a visitor. Internal and opted-out
-- devices, and devices seen only as bots, never show.

create or replace function public.visitors_list(p_ws uuid, p_show text default 'all', p_before timestamptz default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(v) order by v.last_seen desc) from (
      select d.id, d.first_seen, d.last_seen, d.sessions, d.state,
             ls.source, ls.medium, ls.campaign, ls.referrer_host, ls.ref_class, ls.landing_path, ls.country, ls.city, ls.device_type,
             pv.views, c.id as contact_id, c.first_name, c.last_name, c.email, l.level as link_level
      from devices d
      left join device_links l on l.device_id = d.id and l.to_at is null
      left join lateral (
        select ct.id, ct.first_name, ct.last_name, ct.email from contacts ct
        where ct.workspace_id = d.workspace_id and ct.person_id = l.person_id and ct.deleted_at is null
        order by ct.created_at limit 1
      ) c on l.person_id is not null
      left join lateral (
        select s.source, s.medium, s.campaign, s.referrer_host, s.ref_class, s.landing_path, s.country, s.city, s.device_type
        from sessions s where s.device_id = d.id and not s.is_bot order by s.started_at desc limit 1
      ) ls on true
      left join lateral (select coalesce(sum(s.pageviews), 0)::int as views from sessions s where s.device_id = d.id and not s.is_bot) pv on true
      where d.workspace_id = p_ws and d.state not in ('internal', 'opted_out')
        and (p_before is null or d.last_seen < p_before)
        and exists (select 1 from sessions s where s.device_id = d.id and not s.is_bot and not s.internal)
        and (coalesce(p_show, 'all') = 'all' or (p_show = 'known' and c.id is not null) or (p_show = 'unknown' and c.id is null))
      order by d.last_seen desc
      limit least(greatest(coalesce(p_limit, 50), 1), 200)
    ) v
  ), '[]'::jsonb);
end;
$$;

-- One visitor: the device, who it is (when linked), each visit with its pages and actions, the proof that linked it,
-- and, once known, what they did as a contact (forms, bookings, email clicks).
create or replace function public.visitor_journey(p_ws uuid, p_device uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  d devices%rowtype;
  cid uuid;
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  select * into d from devices where id = p_device and workspace_id = p_ws and state not in ('internal', 'opted_out');
  if d.id is null then return null; end if;
  select ct.id into cid from device_links l join contacts ct on ct.person_id = l.person_id and ct.workspace_id = p_ws and ct.deleted_at is null
  where l.device_id = d.id and l.to_at is null order by ct.created_at limit 1;
  return jsonb_build_object(
    'device', jsonb_build_object('id', d.id, 'first_seen', d.first_seen, 'last_seen', d.last_seen, 'sessions', d.sessions, 'state', d.state),
    'contact', (select jsonb_build_object('id', ct.id, 'first_name', ct.first_name, 'last_name', ct.last_name, 'email', ct.email,
                                          'level', (select l.level from device_links l where l.device_id = d.id and l.to_at is null))
                from contacts ct where ct.id = cid),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.started_at desc) from (
        select s.id, s.started_at, s.ended_at, s.source, s.medium, s.campaign, s.term, s.content, s.referrer_host, s.ref_class, s.landing_path,
               s.country, s.region, s.city, s.device_type, s.browser, s.os, s.pageviews, s.engaged_s,
               coalesce((
                 select jsonb_agg(jsonb_build_object('kind', e.kind, 'path', e.path, 'title', e.title, 'data', e.data, 'at', e.server_at) order by e.server_at)
                 from (select e.* from events e
                       where e.session_id = s.id and e.kind <> 'engage'
                         and e.day >= (s.started_at at time zone 'UTC')::date - 1 and e.day <= (s.ended_at at time zone 'UTC')::date + 1
                       order by e.server_at limit 80) e
               ), '[]') as events
        from sessions s where s.device_id = d.id and not s.is_bot
        order by s.started_at desc limit 30
      ) x
    ), '[]'),
    'proof', coalesce((
      select jsonb_agg(jsonb_build_object('source', ev.source, 'level', ev.level, 'at', ev.server_at, 'ignored', ev.ignored,
                                          'email', (select i->>'value' from jsonb_array_elements(ev.identifiers) i where i->>'kind' = 'email' limit 1)) order by ev.server_at desc)
      from (select * from identity_evidence where device_id = d.id and revoked_at is null order by server_at desc limit 20) ev
    ), '[]'),
    'actions', case when cid is null then '[]'::jsonb else coalesce((
      select jsonb_agg(jsonb_build_object('kind', a.kind, 'data', a.data, 'at', a.at) order by a.at desc)
      from (select kind, data, at from contact_events
            where contact_id = cid and kind in ('form.submitted', 'meeting.booked', 'meeting.canceled', 'email.clicked', 'lead.routed')
            order by at desc limit 40) a
    ), '[]') end
  );
end;
$$;

-- The three counts above the list, for visitors seen in the last 90 days.
create or replace function public.visitors_counts(p_ws uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return (
    select jsonb_build_object('all', count(*), 'known', count(*) filter (where l.device_id is not null))
    from devices d
    left join device_links l on l.device_id = d.id and l.to_at is null
    where d.workspace_id = p_ws and d.state not in ('internal', 'opted_out') and d.last_seen > now() - interval '90 days'
      and exists (select 1 from sessions s where s.device_id = d.id and not s.is_bot and not s.internal)
  );
end;
$$;

revoke execute on function public.visitors_list(uuid, text, timestamptz, int) from public, anon;
revoke execute on function public.visitor_journey(uuid, uuid) from public, anon;
revoke execute on function public.visitors_counts(uuid) from public, anon;
grant execute on function public.visitors_list(uuid, text, timestamptz, int) to authenticated;
grant execute on function public.visitor_journey(uuid, uuid) to authenticated;
grant execute on function public.visitors_counts(uuid) to authenticated;
