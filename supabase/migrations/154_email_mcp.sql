-- Emails for agents (docs/email-studio-plan.md Part 9): the MCP tools work with a workspace's API key through the
-- server, which has no signed-in person, so who-would-get-it is split in two: email_audience_counts does the counting
-- (server only), and email_audience_preview (151) checks the person is a member, then answers the same counts.

create or replace function public.email_audience_counts(p_ws uuid, p_lists uuid[], p_everyone boolean, p_topic uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', count(*),
    'ready', count(*) filter (where r is null),
    'suppressed', count(*) filter (where r = 'suppressed'),
    'no_consent', count(*) filter (where r in ('withdrawn', 'no_basis')),
    'not_subscribed', count(*) filter (where r = 'not_subscribed'),
    'room', send_month_room(p_ws))
  from (select campaign_block_reason(a, p_topic) r from campaign_audience(p_ws, p_lists, p_everyone) a) x;
$$;

create or replace function public.email_audience_preview(p_ws uuid, p_lists uuid[], p_everyone boolean, p_topic uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  return email_audience_counts(p_ws, p_lists, p_everyone, p_topic);
end;
$$;

revoke execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) from public, anon, authenticated;
grant execute on function public.email_audience_counts(uuid, uuid[], boolean, uuid) to service_role;

notify pgrst, 'reload schema';
