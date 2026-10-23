-- "Saw times, didn't book" in Slack (docs/meetings-scheduler.md 2.4): when a fill is marked not booked, the
-- meeting_book_later job queues one form_not_booked job per Slack destination on the form, and each posts one
-- message. The mark itself, the timeline line and the Results count are submission_not_booked (056).

-- The form's Slack destinations that are on, for the fan-out.
create or replace function public.form_not_booked_targets(p_submission uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(d.id order by d.position, d.created_at), '{}')
  from submissions s join form_destinations d on d.form_id = s.form_id
  where s.id = p_submission and d.kind = 'slack' and not d.paused and not s.spam;
$$;

-- What one message needs: the form, the lead, the meeting type and host they saw, and the destination's sealed address.
create or replace function public.form_not_booked_note(p_submission uuid, p_destination uuid, p_type uuid, p_host uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'form', f.name,
    'test', s.test,
    'not_booked', s.not_booked_at is not null,
    'booked', exists (select 1 from meetings m where m.submission_id = s.id and m.status in ('booked', 'held', 'no_show', 'pending_payment')),
    'contact', (select jsonb_build_object('email', c.email, 'first_name', c.first_name, 'last_name', c.last_name) from contacts c where c.id = s.contact_id),
    'type', (select t.name from meeting_types t where t.id = p_type and t.workspace_id = s.workspace_id),
    'host', case when p_host is null then null else meeting_people(s.workspace_id, array[p_host])->0->>'name' end,
    'paused', d.paused,
    'sealed', (select sealed from form_destination_secrets where destination_id = d.id))
  from submissions s
  join forms f on f.id = s.form_id
  join form_destinations d on d.id = p_destination and d.form_id = s.form_id and d.kind = 'slack'
  where s.id = p_submission;
$$;

revoke execute on function public.form_not_booked_targets(uuid) from public, anon, authenticated;
revoke execute on function public.form_not_booked_note(uuid, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_not_booked_targets(uuid) to service_role;
grant execute on function public.form_not_booked_note(uuid, uuid, uuid, uuid) to service_role;
