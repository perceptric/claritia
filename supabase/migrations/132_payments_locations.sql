-- Meetings and payments (docs/integrations-plan.md, Next step 12). Webex and Whereby are the team's own connections
-- in Settings › Integrations; a meeting type that meets on one gets a meeting or a room per booking from it. PayPal
-- and Square are the team's own connections too; a payment block or a paid meeting type that names one takes its
-- payment there. These answer which connection a workspace has for each, for the worker and the payment routes.

create or replace function public.workspace_source(p_ws uuid, p_kind text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from sources
  where workspace_id = p_ws and kind = p_kind and kind in ('webex', 'whereby', 'paypal', 'square') and status <> 'disconnected'
  order by created_at limit 1;
$$;

revoke execute on function public.workspace_source(uuid, text) from public, anon, authenticated;
grant execute on function public.workspace_source(uuid, text) to service_role;

notify pgrst, 'reload schema';
