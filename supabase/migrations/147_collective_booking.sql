-- Collective team meetings from a form (docs/on-submission.md: Team meeting, With "Enterprise (Collective)"). A rule
-- that books a team collectively puts everyone on the team in the meeting: the times are those when all are free, and
-- the meeting holds them all. The members are taken once, when the times are first offered, and kept on the fill
-- (submissions.booking_hosts), so a retried send, the booking page, the form's own calendar and a booking made later
-- all use the same people, whatever happens to the team meanwhile.
--   form_booking_hosts   keeps the first host list a fill gets, from the rule's team (or the hosts given); a repeat
--                        returns it unchanged.
--   form_booking_ctx     also returns the fill's hosts.

drop function if exists public.form_booking_hosts(uuid, uuid[]);

alter table public.submissions add column if not exists booking_hosts uuid[] check (booking_hosts is null or cardinality(booking_hosts) between 1 and 20);

-- The team's members (a routing team by its key, in round-robin order), or the hosts given (an older body's own queue).
create or replace function public.form_booking_hosts(p_submission uuid, p_hosts uuid[] default null, p_key text default null) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  h uuid[];
  want uuid[] := p_hosts;
begin
  if want is null and p_key is not null then
    select array_agg(m.user_id order by m.position) into want
    from submissions s
    join routing_team_keys k on k.workspace_id = s.workspace_id and k.key = p_key
    join routing_teams t on t.id = k.team_id and t.archived_at is null
    join routing_team_members m on m.team_id = t.id
    where s.id = p_submission;
  end if;
  want := want[1:20];
  update submissions set booking_hosts = want
  where id = p_submission and booking_hosts is null and cardinality(want) between 1 and 20
  returning booking_hosts into h;
  if h is null then select booking_hosts into h from submissions where id = p_submission; end if;
  return h;
end;
$$;

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
    'hosts', to_jsonb(s.booking_hosts),
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
                                                  where t.id = p_type and h->>'user_id' ~ '^[0-9a-f-]{36}$')
                                 or p.user_id in (select r.owner from router_runs r
                                                  where r.workspace_id = s.workspace_id and r.key = 'form:' || s.id::text
                                                    and r.owner is not null))), '{}'::jsonb)
  )
  from submissions s left join contacts c on c.id = s.contact_id
  where s.id = p_submission;
$$;

revoke execute on function public.form_booking_hosts(uuid, uuid[], text) from public, anon, authenticated;
grant execute on function public.form_booking_hosts(uuid, uuid[], text) to service_role;
revoke execute on function public.form_booking_ctx(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_booking_ctx(uuid, uuid) to service_role;
