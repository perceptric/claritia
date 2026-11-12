-- Moving customer sending domains to Amazon SES, without anyone having to find the button (docs/ses-plan.md Step 4).
-- With EMAIL_SES_MOVE=1 the worker, once an hour:
--   domain_moves_start   starts the move for verified Resend domains that haven't started: their SES identity and
--                        records are made by the next domain_check.
--   domain_moves_due     the moves whose owners are due an email: the records once they're ready (step 0), a reminder
--                        7 days later (step 1) and another at 14 days (step 2). Only while the move waits; a domain on
--                        SES, or still on Resend after that, gets no more. A domain still on Resend keeps working.
--   domain_move_claim    takes one step for one domain, so two workers never send it twice; domain_move_unclaim gives
--                        it back when nothing went out.

alter table public.sending_domains add column if not exists move_emailed_at timestamptz;
alter table public.sending_domains add column if not exists move_reminders int not null default 0 check (move_reminders between 0 and 2);
alter table public.sending_domains add column if not exists move_reminded_at timestamptz;

create or replace function public.domain_moves_start(p_limit int default 50) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, workspace_id, domain from sending_domains
    where provider = 'resend' and provider_id is not null and status = 'verified' and ses_status is null
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 50), 500))
    for update skip locked
  loop
    update sending_domains set ses_status = 'pending', ses_mail_from = coalesce(ses_mail_from, 'bounce.' || r.domain), ses_error = null where id = r.id;
    perform enqueue_job(r.workspace_id, 'domain_check', r.id::text, jsonb_build_object('domain_id', r.id), 0, 5);
    insert into audit_log (workspace_id, action, target) values (r.workspace_id, 'sending.domain_move', r.domain);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- The step a moving domain is due, or null.
create or replace function public.domain_move_step(d sending_domains) returns int
language sql stable set search_path = public as $$
  select case
    when d.provider <> 'resend' or d.provider_id is null or d.ses_status is distinct from 'pending' then null
    when d.move_emailed_at is null and jsonb_array_length(d.ses_records) >= 5 then 0
    -- At 14 days, and never within 7 days of the first reminder (a worker that was down doesn't send both at once).
    when d.move_emailed_at < now() - interval '14 days' and d.move_reminders = 1 and d.move_reminded_at < now() - interval '7 days' then 2
    when d.move_emailed_at < now() - interval '7 days' and d.move_reminders = 0 then 1
  end;
$$;

create or replace function public.domain_moves_due(p_limit int default 100) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]') from (
    select d.id, d.domain, d.workspace_id, d.ses_records as records, domain_move_step(d) as step,
           (select coalesce(jsonb_agg(u.email order by u.email), '[]') from workspace_members m join auth.users u on u.id = m.user_id
             where m.workspace_id = d.workspace_id and m.role = 'owner' and u.email is not null) as owners
    from sending_domains d
    where domain_move_step(d) is not null
    order by d.created_at
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) x;
$$;

create or replace function public.domain_move_claim(p_id uuid, p_step int) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update sending_domains d set
    move_emailed_at = case when p_step = 0 then now() else d.move_emailed_at end,
    move_reminders = case when p_step = 0 then 0 else p_step end,
    move_reminded_at = case when p_step = 0 then null else now() end
  where d.id = p_id and domain_move_step(d) = p_step;
  return found;
end;
$$;

create or replace function public.domain_move_unclaim(p_id uuid, p_step int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_step = 0 then
    update sending_domains set move_emailed_at = null, move_reminders = 0 where id = p_id and move_reminders = 0;
  else
    update sending_domains set move_reminders = p_step - 1, move_reminded_at = case when p_step = 2 then now() - interval '8 days' else null end where id = p_id and move_reminders = p_step;
  end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['domain_moves_start(int)', 'domain_moves_due(int)', 'domain_move_claim(uuid, int)', 'domain_move_unclaim(uuid, int)', 'domain_move_step(sending_domains)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
