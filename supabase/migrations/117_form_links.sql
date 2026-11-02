-- Sharing step 2 (docs/sharing-plan.md): a form's own link ending and emailing its link.
--
-- A form's link can end in a short name: /f/<workspace>/<ending> (the workspace's booking_slug, 053, the same name its
-- meeting links use). The id link /f/<form id> always keeps working, so a printed QR code never breaks. A changed or
-- removed ending still opens its form for 90 days, and no other form can take it meanwhile.

alter table public.forms add column if not exists slug text check (slug ~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$');
create unique index if not exists forms_slug on public.forms (workspace_id, slug) where slug is not null;

create table if not exists public.form_slug_moves (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  slug text not null,
  form_id uuid not null references public.forms (id) on delete cascade,
  until timestamptz not null,
  primary key (workspace_id, slug)
);
alter table public.form_slug_moves enable row level security;
revoke all on public.form_slug_moves from anon, authenticated;

-- The form's link parts for its Share tab: the workspace's name in links (made the first time) and the ending.
create or replace function public.form_link(p_form uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms;
begin
  select * into f from forms where id = p_form;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  return jsonb_build_object('ws', booking_slug_ensure(f.workspace_id), 'slug', f.slug);
end $$;

-- Set or clear a form's ending. Taken by another form, or by another form's old ending still within its 90 days: refused.
create or replace function public.form_set_slug(p_form uuid, p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f forms;
  s text := nullif(lower(trim(coalesce(p_slug, ''))), '');
begin
  select * into f from forms where id = p_form for update;
  if f.id is null or not is_member(f.workspace_id) then raise exception 'Form not found'; end if;
  if s is not null and s !~ '^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])?$' then
    raise exception 'Use lowercase letters, numbers and dashes, up to 50';
  end if;
  if s is not distinct from f.slug then return form_link(p_form); end if;
  if s is not null and (
    exists (select 1 from forms o where o.workspace_id = f.workspace_id and o.slug = s and o.id <> f.id)
    or exists (select 1 from form_slug_moves m where m.workspace_id = f.workspace_id and m.slug = s and m.form_id <> f.id and m.until > now())
  ) then
    raise exception 'That ending is taken';
  end if;
  -- The old ending keeps opening this form for 90 days.
  if f.slug is not null then
    insert into form_slug_moves (workspace_id, slug, form_id, until) values (f.workspace_id, f.slug, f.id, now() + interval '90 days')
    on conflict (workspace_id, slug) do update set form_id = excluded.form_id, until = excluded.until;
  end if;
  if s is not null then delete from form_slug_moves where workspace_id = f.workspace_id and slug = s; end if;
  update forms set slug = s, updated_at = now() where id = f.id;
  return form_link(p_form);
end $$;

-- The form an ending opens (server): {id, slug} for a current one, {id, slug, moved: true} for an old one within its
-- 90 days (the page redirects to the current link), null for none.
create or replace function public.form_by_slug(p_ws text, p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select jsonb_build_object('id', f.id, 'slug', f.slug) from forms f join workspaces w on w.id = f.workspace_id
     where w.booking_slug = lower(p_ws) and f.slug = lower(p_slug) limit 1),
    (select jsonb_build_object('id', f.id, 'slug', f.slug, 'moved', true) from form_slug_moves m
     join workspaces w on w.id = m.workspace_id join forms f on f.id = m.form_id
     where w.booking_slug = lower(p_ws) and m.slug = lower(p_slug) and m.until > now() limit 1)
  );
$$;

-- Email a form's link (server): one email, queued to each address once. A repeat call adds nothing; suppressed and
-- bounced addresses are skipped by the send guard as for every email.
create or replace function public.email_queue_to(p_email uuid, p_to text[]) returns int
language plpgsql security definer set search_path = public as $$
declare
  e emails;
  n int;
begin
  select * into e from emails where id = p_email;
  if e.id is null then raise exception 'Email not found'; end if;
  if cardinality(p_to) > 50 then raise exception 'Up to 50 addresses at once'; end if;
  insert into email_messages (workspace_id, email_id, to_email, dedupe)
  select e.workspace_id, e.id, a, e.id::text || ':' || a
  from (select distinct lower(trim(x)) as a from unnest(p_to) x) t
  where a ~ '^[^\s@<>()",;:]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$'
  on conflict (workspace_id, dedupe) do nothing;
  get diagnostics n = row_count;
  if n > 0 then perform enqueue_job(e.workspace_id, 'send', e.workspace_id::text, '{}', 0, 3); end if;
  return n;
end $$;

revoke execute on function public.form_by_slug(text, text) from public, anon, authenticated;
revoke execute on function public.email_queue_to(uuid, text[]) from public, anon, authenticated;
revoke execute on function public.form_link(uuid) from public, anon;
revoke execute on function public.form_set_slug(uuid, text) from public, anon;
grant execute on function public.form_link(uuid) to authenticated;
grant execute on function public.form_set_slug(uuid, text) to authenticated;
