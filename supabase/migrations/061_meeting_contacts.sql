-- A guest who books from a page, a link or a poll becomes a contact (docs/meetings-scheduler.md 1.8b), like a form
-- fill: source 'meeting', a form-class source, so CRM and manual values win over it. Made only once the booking
-- stands (paid ones once paid), so a failed try never adds anyone. Team addresses (identity_settings.own_domains)
-- never become contacts.

insert into public.source_kinds (kind, class) values ('meeting', 'form') on conflict do nothing;

create or replace function public.meeting_contact_make(p_meeting uuid, p_row jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  m meetings%rowtype;
  ec text := lower(btrim(coalesce(p_row->>'email_clean', '')));
  up jsonb;
  cid uuid;
begin
  select * into m from meetings where id = p_meeting for update;
  if m.id is null or m.contact_id is not null or ec = '' or m.status <> 'booked' then return m.contact_id; end if;
  if lower(btrim(coalesce(p_row->>'email', ''))) <> m.guest_email then return null; end if;
  if split_part(ec, '@', 2) = any (coalesce((select own_domains from identity_settings where workspace_id = m.workspace_id), '{}')) then return null; end if;
  up := contacts_upsert(m.workspace_id, 'meeting', jsonb_build_array(p_row));
  cid := (up->'ids'->>0)::uuid;
  if cid is null then return null; end if;
  update meetings set contact_id = cid where id = m.id;
  perform meeting_timeline(m.id, 'meeting.booked');
  return cid;
end;
$$;

revoke execute on function public.meeting_contact_make(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.meeting_contact_make(uuid, jsonb) to service_role;
