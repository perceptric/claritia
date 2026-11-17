-- Limits on sign-in emails (src/app/api/auth/link/route.ts, docs/signup.md): how many sign-in links one address, and one visitor's IP,
-- can ask for. Each is a counter per bucket per fixed window, bumped with one atomic upsert, so two servers counting
-- at once never lose a hit. Buckets hold a keyed hash, never an address or IP as it is (src/lib/authLimits.ts).
-- Server-only (secret key): RLS on, no policies, no grants to anon or authenticated. Safe to run twice.

create table if not exists public.rate_counts (
  bucket text not null check (char_length(bucket) <= 200),
  window_start timestamptz not null,
  count int not null default 0,
  primary key (bucket, window_start)
);
create index if not exists rate_counts_window on public.rate_counts (window_start);
alter table public.rate_counts enable row level security;
revoke all on public.rate_counts from anon, authenticated;
grant all on public.rate_counts to service_role;

-- Counts `p_n` hits in the bucket's current window (windows start on multiples of p_window_s since 1970, UTC). Returns 0
-- while the total is within p_max, else the seconds until the window ends. Hits over the limit still count, so a
-- client that keeps trying stays limited until the window ends. About 1 call in 100 clears windows over 2 days old.
create or replace function public.take_rate(p_bucket text, p_window_s int, p_max int, p_n int default 1) returns int
language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_s) * p_window_s);
  c int;
begin
  insert into public.rate_counts as r (bucket, window_start, count)
  values (p_bucket, w, greatest(p_n, 1))
  on conflict (bucket, window_start) do update set count = r.count + excluded.count
  returning r.count into c;
  if random() < 0.01 then
    delete from public.rate_counts where window_start < now() - interval '2 days';
  end if;
  if c <= p_max then
    return 0;
  end if;
  return greatest(1, ceil(extract(epoch from (w + make_interval(secs => p_window_s) - now())))::int);
end $$;
revoke all on function public.take_rate(text, int, int, int) from public, anon, authenticated;
grant execute on function public.take_rate(text, int, int, int) to service_role;

notify pgrst, 'reload schema';
