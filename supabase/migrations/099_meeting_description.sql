-- The meeting description (src/lib/meetings/description.ts): what meeting_sync and the invite need besides the
-- meeting row. The form it was booked from (its name, the fill's answers and the version's fields for their labels)
-- and the guest's sealed manage token with its hash, so the reschedule and cancel link can go on the event. A
-- meeting with no form, or a fill that's spam, gives null for the form.

create or replace function public.meeting_invite_info(p_meeting uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'token_hash', m.token_hash,
    'token_sealed', m.token_sealed,
    'form', (select jsonb_build_object('name', f.name, 'values', s.values, 'body', jsonb_build_object('steps', v.body->'steps'))
             from submissions s
             left join forms f on f.id = s.form_id
             left join form_versions v on v.form_id = s.form_id and v.version = s.form_version
             where s.id = m.submission_id and s.workspace_id = m.workspace_id and not s.spam))
  from meetings m
  where m.id = p_meeting;
$$;

revoke execute on function public.meeting_invite_info(uuid) from public, anon, authenticated;
grant execute on function public.meeting_invite_info(uuid) to service_role;
