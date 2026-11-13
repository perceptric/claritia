-- Audiences' columns (docs/email-unify-plan.md, E2): each person's phone, title, country and lists beside their name
-- and email, sorting by any column, search that matches phone numbers too, and editing a person's name, phone, title
-- and country in place. No new table.

drop function if exists public.audience_people(uuid, text, timestamptz, int, uuid);
create or replace function public.audience_people(
  p_ws uuid, p_q text default null, p_before timestamptz default null, p_limit int default 50, p_list uuid default null,
  p_sort text default 'added', p_desc boolean default true
)
returns table (
  id uuid, email text, first_name text, last_name text, phone text, title text, country text, lists text[],
  source text, created_at timestamptz, status text, last_sent timestamptz
)
language sql stable set search_path = public as $$
  with people as (
    select c.id, c.email, c.first_name, c.last_name, c.phone, c.title, c.country,
      coalesce((select array_agg(l.name order by l.name) from list_members lm join lists l on l.id = lm.list_id where lm.contact_id = c.id), '{}') lists,
      c.source, c.created_at,
      coalesce(
        (select case s.reason when 'manual' then 'unsubscribed' when 'cleaned' then 'bounced' else s.reason end from suppressions s where s.workspace_id = c.workspace_id and s.email_clean = c.email_clean),
        (select case k.status when 'granted' then 'subscribed' when 'withdrawn' then 'unsubscribed' else 'no consent' end
           from consents k where k.contact_id = c.id and k.channel = 'email' order by k.at desc limit 1),
        'no consent') status,
      (select max(m.sent_at) from email_messages m where m.contact_id = c.id) last_sent
    from contacts c
    where c.workspace_id = p_ws and c.deleted_at is null and c.email is not null
      and (p_list is null or exists (select 1 from list_members lm where lm.list_id = p_list and lm.contact_id = c.id))
      and (p_before is null or c.created_at < p_before)
      and (coalesce(btrim(p_q), '') = ''
        or c.email_clean ilike '%' || lower(btrim(p_q)) || '%'
        or (coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) ilike '%' || btrim(p_q) || '%'
        or (length(regexp_replace(p_q, '[^0-9]', '', 'g')) >= 3 and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') like '%' || regexp_replace(p_q, '[^0-9]', '', 'g') || '%'))
  )
  select * from people
  order by
    -- Text columns sort by their words, empty ones last either way.
    case when not p_desc then case p_sort when 'first' then lower(first_name) when 'last' then lower(last_name) when 'email' then lower(email) when 'phone' then phone
      when 'title' then lower(title) when 'country' then country when 'status' then status when 'from' then source end end asc nulls last,
    case when p_desc then case p_sort when 'first' then lower(first_name) when 'last' then lower(last_name) when 'email' then lower(email) when 'phone' then phone
      when 'title' then lower(title) when 'country' then country when 'status' then status when 'from' then source end end desc nulls last,
    case when p_sort = 'last_email' and not p_desc then last_sent end asc nulls last,
    case when p_sort = 'last_email' and p_desc then last_sent end desc nulls last,
    case when not p_desc and p_sort = 'added' then created_at end asc,
    created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- Edit a person from Audiences: first and last name, phone, title and country. Any member of the workspace; the email
-- stays as it is (a new address is a new person). Empty clears a field. Returns the person's id, or raises.
create or replace function public.audience_person_update(p_ws uuid, p_id uuid, p_patch jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v text;
  done uuid;
begin
  if not is_member(p_ws) then raise exception 'not a member'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'bad patch'; end if;
  if p_patch ? 'country' then
    v := upper(btrim(coalesce(p_patch->>'country', '')));
    if v <> '' and v !~ '^[A-Z]{2}$' then raise exception 'Use a two-letter country code, like US.'; end if;
  end if;
  update contacts c set
    first_name = case when p_patch ? 'first_name' then nullif(left(btrim(coalesce(p_patch->>'first_name', '')), 100), '') else c.first_name end,
    last_name = case when p_patch ? 'last_name' then nullif(left(btrim(coalesce(p_patch->>'last_name', '')), 100), '') else c.last_name end,
    phone = case when p_patch ? 'phone' then nullif(left(btrim(coalesce(p_patch->>'phone', '')), 50), '') else c.phone end,
    title = case when p_patch ? 'title' then nullif(left(btrim(coalesce(p_patch->>'title', '')), 120), '') else c.title end,
    country = case when p_patch ? 'country' then nullif(upper(btrim(coalesce(p_patch->>'country', ''))), '') else c.country end,
    updated_at = now()
  where c.id = p_id and c.workspace_id = p_ws and c.deleted_at is null
  returning c.id into done;
  if done is null then raise exception 'person not found'; end if;
  return done;
end;
$$;

revoke execute on function public.audience_people(uuid, text, timestamptz, int, uuid, text, boolean) from public, anon;
grant execute on function public.audience_people(uuid, text, timestamptz, int, uuid, text, boolean) to authenticated, service_role;
revoke execute on function public.audience_person_update(uuid, uuid, jsonb) from public, anon;
grant execute on function public.audience_person_update(uuid, uuid, jsonb) to authenticated, service_role;
