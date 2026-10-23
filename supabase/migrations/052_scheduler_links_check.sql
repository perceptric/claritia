-- Teammates' booking links, checked per tool (docs/form-studio.md Part 3, "The contact's owner, else the team link").
--   scheduler_link_ok: whether a link works for a scheduler, the same check as linkProblem in
--   src/lib/forms/schedule.ts: https, no user or password, and the tool's own host.
--   scheduler_link_save refuses a link for another tool, so a Cal.com link can't be saved as someone's Calendly.
--   scheduler_for only returns a link that works for the tool, so a link saved before this check (or for another
--   tool) never wins over the form's team link: the submit falls back to the team link (the CLAUDE.md rule on wrong
--   links).

create or replace function public.scheduler_link_ok(p_tool text, p_url text) returns boolean
language sql immutable set search_path = public as $$
  with a as (select substring(coalesce(p_url, '') from '^https://([^/?#\s]*)') as auth),
  h as (select case when auth is null or auth = '' or position('@' in auth) > 0 then null
                    else lower(regexp_replace(auth, ':[0-9]*$', '')) end as host from a)
  select coalesce(case p_tool
    when 'calendly' then host ~ '^(www\.)?calendly\.com$'
    when 'calcom' then host ~ '^(app\.)?cal\.com$' or host ~ '\.cal\.com$'
    when 'hubspot_meetings' then host ~ '^meetings(-[a-z0-9]+)?\.hubspot\.com$'
    when 'savvycal' then host ~ '^savvycal\.com$'
    when 'link' then host <> ''
    else false end, false)
  from h;
$$;

-- A teammate sets their own link; owners set anyone's. An empty url removes it. A link for another tool is refused.
create or replace function public.scheduler_link_save(p_ws uuid, p_user uuid, p_tool text, p_url text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) or (p_user <> auth.uid() and not is_owner(p_ws)) then
    raise exception 'Only owners set other people''s links';
  end if;
  if not exists (select 1 from workspace_members where workspace_id = p_ws and user_id = p_user) then
    raise exception 'Not in this workspace';
  end if;
  if coalesce(trim(p_url), '') = '' then
    delete from scheduler_links where workspace_id = p_ws and user_id = p_user and tool = p_tool;
    return;
  end if;
  if not scheduler_link_ok(p_tool, trim(p_url)) then
    raise exception 'That link doesn''t work for this scheduler';
  end if;
  insert into scheduler_links (workspace_id, user_id, tool, url) values (p_ws, p_user, p_tool, trim(p_url))
  on conflict (workspace_id, user_id, tool) do update set url = excluded.url, updated_at = now();
end;
$$;

-- Who books the meeting for a fill: the contact's owner's link for the tool, when the owner has one that works.
create or replace function public.scheduler_for(p_submission uuid, p_tool text) returns text
language sql stable security definer set search_path = public as $$
  select l.url from submissions s join contacts c on c.id = s.contact_id
  join scheduler_links l on l.workspace_id = s.workspace_id and l.user_id = c.owner_user_id and l.tool = p_tool
  where s.id = p_submission and scheduler_link_ok(p_tool, l.url);
$$;

revoke execute on function public.scheduler_link_ok(text, text) from public, anon;
grant execute on function public.scheduler_link_ok(text, text) to authenticated, service_role;
