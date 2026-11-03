-- Bounces and complaints on meeting emails (docs/meetings-scheduler.md 1.7). SES reports them through the same SNS
-- topic as campaign email; /api/ses hands an event that isn't a campaign message to this function, which finds the
-- meeting email by its SES message id. A hard bounce or a complaint suppresses the address, so the optional meeting
-- emails (no-show follow-up, book later) and campaigns stop; confirmations and updates still go.

alter table public.meeting_mails add column if not exists bounced text check (bounced in ('hard', 'soft'));
alter table public.meeting_mails add column if not exists complained_at timestamptz;
create index if not exists meeting_mails_provider on public.meeting_mails (provider_id) where provider_id is not null;

create or replace function public.meeting_mail_event(p_event jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  r meeting_mails%rowtype;
  k text := p_event->>'kind';
begin
  if k not in ('bounced', 'complained') then return 'ignored'; end if;
  select * into r from meeting_mails where provider_id = p_event->>'ses_message_id' for update;
  if r.id is null then return 'unknown_message'; end if;
  if k = 'bounced' then
    update meeting_mails set bounced = coalesce(p_event->>'bounce', 'hard') where id = r.id;
    if coalesce(p_event->>'bounce', 'hard') = 'hard' then
      perform suppress(r.workspace_id, 'ses', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'bounced')));
    end if;
  else
    update meeting_mails set complained_at = coalesce(complained_at, now()) where id = r.id;
    perform suppress(r.workspace_id, 'ses', jsonb_build_array(jsonb_build_object('email_clean', r.to_email, 'reason', 'complained')));
  end if;
  return 'meeting_mail';
end;
$$;

revoke execute on function public.meeting_mail_event(jsonb) from public, anon, authenticated;
grant execute on function public.meeting_mail_event(jsonb) to service_role;
