-- Past fills as rule fields (src/lib/router/conditions.ts PAST_FIELDS): what the person did before this send, read
-- only when a rule tests one. The person is the contact, or the live contact with this email.
--   sent_form: an earlier real send (not spam, not a test) of this form; of any form when no form is given (a
--     booking page). The send being routed now (p_skip) never counts.
--   has_meeting: a booked meeting that hasn't started yet.
--   days_since_booked: whole days since they last booked a meeting that wasn't canceled; null when they never did.

create index if not exists meetings_guest_email on public.meetings (workspace_id, lower(guest_email));

create or replace function public.routing_past(p_ws uuid, p_contact uuid, p_email text, p_form uuid, p_skip uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cid uuid := p_contact;
  em text := nullif(lower(trim(coalesce(p_email, ''))), '');
  sent boolean := false;
  upcoming boolean := false;
  last_booked timestamptz;
begin
  if cid is null and em is not null then
    select c.id into cid from contacts c where c.workspace_id = p_ws and c.email_clean = em and c.deleted_at is null limit 1;
  end if;
  if cid is not null and em is null then
    select c.email_clean into em from contacts c where c.id = cid and c.workspace_id = p_ws;
  end if;
  if cid is not null then
    select exists (
      select 1 from submissions s
      where s.workspace_id = p_ws and s.contact_id = cid and not s.spam and not s.test
        and (p_form is null or s.form_id = p_form) and (p_skip is null or s.id <> p_skip)
    ) into sent;
  end if;
  if cid is not null or em is not null then
    select
      coalesce(bool_or(m.status = 'booked' and m.start_at > now()), false),
      max(m.created_at) filter (where m.status in ('booked', 'held', 'no_show'))
    into upcoming, last_booked
    from meetings m
    where m.workspace_id = p_ws and ((cid is not null and m.contact_id = cid) or (em is not null and lower(m.guest_email) = em));
  end if;
  return jsonb_build_object(
    'sent_form', sent,
    'has_meeting', upcoming,
    'days_since_booked', case when last_booked is null then null else floor(extract(epoch from (now() - last_booked)) / 86400)::int end
  );
end $$;

revoke all on function public.routing_past(uuid, uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.routing_past(uuid, uuid, text, uuid, uuid) to service_role;
