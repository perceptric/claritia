-- Deleting a team (Meetings › Availability › Team). A team that anything still sends to is never deleted: the call
-- names what uses it (a routing policy, live or draft, a meeting type or a form's rules) so the owner can move those
-- first, and nothing that books or routes ever points at a team that's gone. The team every workspace starts with
-- (key q_everyone, "Whole team") stays. A deleted team is archived: every read already skips archived teams, its
-- past runs keep their history, and its keys are never reused.
--   A use is any mention of one of the team's keys as a quoted value in the body or settings, so a doubtful match
--   refuses rather than deletes.

create or replace function public.routing_team_delete(p_ws uuid, p_team uuid, p_revision int default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  t routing_teams%rowtype;
  keys text[];
  pats text[];
  used jsonb;
begin
  select * into t from routing_teams where id = p_team and workspace_id = p_ws and archived_at is null for update;
  if t.id is null then raise exception 'not_found: team'; end if;
  if p_revision is not null and t.revision <> p_revision then raise exception 'draft_conflict: team'; end if;
  select array_agg(key) into keys from routing_team_keys where team_id = t.id;
  if 'q_everyone' = any(coalesce(keys, '{}')) then raise exception 'invalid_configuration: the starting team stays'; end if;
  pats := array(select '%"' || k || '"%' from unnest(coalesce(keys, '{}')) k);
  select coalesce(jsonb_agg(u order by u->>'kind', u->>'name'), '[]') into used from (
    select jsonb_build_object('kind', 'policy', 'name', p.name) u
    from routing_policies p
    where p.workspace_id = p_ws and p.archived_at is null
      and (p.draft::text like any(pats)
        or exists (select 1 from routing_policy_versions v where v.policy_id = p.id and v.version = p.active_version and v.config::text like any(pats)))
    union all
    select jsonb_build_object('kind', 'meeting', 'name', m.name)
    from meeting_types m where m.workspace_id = p_ws and m.settings::text like any(pats)
    union all
    select jsonb_build_object('kind', 'form', 'name', f.name)
    from forms f where f.workspace_id = p_ws and f.draft::text like any(pats)
  ) x;
  if jsonb_array_length(used) > 0 then return jsonb_build_object('deleted', false, 'used_by', used); end if;
  update routing_teams set archived_at = now(), revision = revision + 1, updated_at = now() where id = t.id;
  return jsonb_build_object('deleted', true);
end;
$$;

revoke execute on function public.routing_team_delete(uuid, uuid, int) from public, anon, authenticated;
grant execute on function public.routing_team_delete(uuid, uuid, int) to service_role;

notify pgrst, 'reload schema';
