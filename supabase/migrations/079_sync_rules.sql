-- Sync rules (docs/form-builder.md 7.4): a delivery stopped on a possible duplicate can be sent again with
-- Create anyway, which skips the duplicate check for that one delivery. The rules themselves live in
-- form_destinations.config.rules (src/lib/delivery/rules.ts).

alter table public.deliveries add column if not exists allow_duplicate boolean not null default false;

create or replace function public.deliveries_create_anyway(p_ids uuid[]) returns int
language plpgsql security definer set search_path = public as $$
begin
  if cardinality(p_ids) > 500 then
    raise exception 'Up to 500 at a time';
  end if;
  update deliveries set allow_duplicate = true
  where id = any(p_ids) and status in ('failed', 'skipped') and is_member(workspace_id);
  return deliveries_replay(p_ids);
end;
$$;
revoke execute on function public.deliveries_create_anyway(uuid[]) from public, anon;
grant execute on function public.deliveries_create_anyway(uuid[]) to authenticated;
