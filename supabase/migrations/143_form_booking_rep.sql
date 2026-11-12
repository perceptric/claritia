-- The rep Routing gave a form fill keeps their name and photo on the booking, even when the lead's owner changes
-- between the send and the booking (docs/ending-plan.md Part 4): form_booking_ctx reads the profile of the fill's
-- routed rep too (router_runs, key form:<submission>), alongside the contact's owner and the type's hosts.

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
                                                  where t.id = p_type and h->>'user_id' ~ '^[0-9a-f-]{36}$')
                                 or p.user_id in (select r.owner from router_runs r
                                                  where r.workspace_id = s.workspace_id and r.key = 'form:' || s.id::text
                                                    and r.owner is not null))), '{}'::jsonb)
  )
  from submissions s left join contacts c on c.id = s.contact_id
  where s.id = p_submission;
$$;

revoke execute on function public.form_booking_ctx(uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_booking_ctx(uuid, uuid) to service_role;
