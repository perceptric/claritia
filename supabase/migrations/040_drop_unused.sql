-- Tables nothing uses.
--   email_tokens (023) was made for email click identity, which isn't built; nothing reads or writes it.
--   suite_connections (020) held links to Omniscient and Arrowsterr from a suite panel that was never shown;
--   Omniscient now connects as a source (036). It's dropped only when empty, so no saved key is ever lost:
--   with rows in it, this keeps the table and says how many.

drop table if exists public.email_tokens;

do $$
declare
  n bigint;
begin
  if to_regclass('public.suite_connections') is null then
    return;
  end if;
  select count(*) into n from public.suite_connections;
  if n = 0 then
    drop table public.suite_connections;
  else
    raise notice 'suite_connections kept: it has % rows. Move or delete them, then drop it.', n;
  end if;
end;
$$;
