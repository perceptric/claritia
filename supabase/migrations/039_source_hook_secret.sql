-- Saves the signing secret a tool hands back after setup (Omniscient), without connecting the source a second time.
create or replace function public.source_hook_secret_save(p_id uuid, p_hook_sealed text) returns void
language sql security definer set search_path = public as $$
  update source_secrets set hook_sealed = p_hook_sealed, updated_at = now() where source_id = p_id;
$$;

revoke execute on function public.source_hook_secret_save(uuid, text) from public, anon, authenticated;
grant execute on function public.source_hook_secret_save(uuid, text) to service_role;
