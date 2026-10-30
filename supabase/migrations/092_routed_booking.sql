-- Routing decides, the form shows the result (docs/inbound.md). A lead Routing gives a rep sees that rep's times only,
-- and books with them alone. Here:
--   form_booking_shown_rep   form_booking_shown for those leads: the same first-showing mark and timeline line, and the
--                            book-later job it queues carries only = true, so its email offers the rep's times alone.
-- Service role only, like form_booking_shown. Safe to run twice.

create or replace function public.form_booking_shown_rep(p_submission uuid, p_type uuid, p_owner uuid) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare
  t timestamptz;
  s submissions%rowtype;
begin
  update submissions set booking_shown_at = now(), booking_type_id = p_type
  where id = p_submission and booking_shown_at is null
  returning * into s;
  if s.id is null then
    select booking_shown_at into t from submissions where id = p_submission;
    return t;
  end if;
  perform enqueue_job(s.workspace_id, 'meeting_book_later', 'book_later:' || p_submission::text,
    jsonb_strip_nulls(jsonb_build_object('submission', p_submission, 'type', p_type, 'owner', p_owner, 'only', p_owner is not null)), 600, 3);
  if s.contact_id is not null then
    if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
      perform contact_events_roll();
    end if;
    insert into contact_events (workspace_id, contact_id, kind, data, source)
    values (s.workspace_id, s.contact_id, 'meeting.offered', jsonb_strip_nulls(jsonb_build_object('submission_id', s.id, 'form_id', s.form_id, 'type_id', p_type, 'owner', p_owner)), 'form');
  end if;
  return s.booking_shown_at;
end;
$$;

revoke execute on function public.form_booking_shown_rep(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.form_booking_shown_rep(uuid, uuid, uuid) to service_role;
