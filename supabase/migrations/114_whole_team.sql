-- The team every workspace starts with (router key q_everyone) reads "Whole team": teams aren't only sales, and the
-- old names ("Everyone", then "All reps") read badly next to "Everyone else". Only teams still on an old name change;
-- a team someone renamed keeps its name. Router bodies are read the same way in src/lib/router/check.ts (cleanBody).

update public.routing_teams t
set name = 'Whole team', revision = t.revision + 1, updated_at = now()
where t.name in ('All reps', 'Everyone')
  and exists (select 1 from public.routing_team_keys k where k.team_id = t.id and k.key = 'q_everyone');
