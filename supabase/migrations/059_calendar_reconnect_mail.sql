-- The "reconnect your calendar" email (docs/meetings-scheduler.md 1.1). calendar_reconnect (054_calendars.sql) queues
-- one calendar_reconnect job when an account's sign-in stops working; the worker (worker-intel/jobs/meetings.ts) sends
-- the person one email per break, through the same meeting_mails log as every other meeting email.

alter table public.meeting_mails drop constraint if exists meeting_mails_kind_check;
alter table public.meeting_mails add constraint meeting_mails_kind_check
  check (kind in ('confirm', 'host_booked', 'update', 'host_moved', 'cancel', 'host_canceled', 'reminder', 'after', 'no_show', 'book_later', 'reconnect'));

-- What the email needs. Null when the account is gone; status tells the worker whether it still needs reconnecting.
create or replace function public.calendar_reconnect_info(p_account uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  a calendar_accounts%rowtype;
begin
  select * into a from calendar_accounts where id = p_account;
  if a.id is null then return null; end if;
  return jsonb_build_object(
    'account', jsonb_build_object('id', a.id, 'workspace_id', a.workspace_id, 'user_id', a.user_id, 'provider', a.provider,
                                  'account_email', a.account_email, 'status', a.status, 'reconnect_at', a.reconnect_at),
    'person', meeting_people(a.workspace_id, array[a.user_id])->0,
    'upcoming', (select count(*) from meetings m
                 where m.workspace_id = a.workspace_id and a.user_id = any (m.hosts) and m.status = 'booked'
                   and m.start_at > now() and m.start_at < now() + interval '14 days'),
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name) from workspaces w where w.id = a.workspace_id),
    'sending', meeting_sending(a.workspace_id));
end;
$$;

revoke execute on function public.calendar_reconnect_info(uuid) from public, anon, authenticated;
grant execute on function public.calendar_reconnect_info(uuid) to service_role;
