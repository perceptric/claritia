-- Interactive forms: the funnel counts results (docs/interactive-forms-plan.md Part 7). A visitor who saw a result
-- screen counts once per form every 30 minutes, the same way views and starts do. Run after 104. Safe to run more
-- than once.

alter table public.form_daily add column if not exists results int not null default 0;
alter table public.form_seen drop constraint if exists form_seen_kind_check;
alter table public.form_seen add constraint form_seen_kind_check check (kind in ('view', 'start', 'result'));

create or replace function public.form_seen(p_form uuid, p_vid text, p_kind text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
  hit boolean;
begin
  if p_kind not in ('view', 'start', 'result') or p_vid !~ '^[A-Za-z0-9_-]{8,64}$' then return false; end if;
  select * into f from forms where id = p_form;
  if f.id is null then return false; end if;
  insert into form_seen (form_id, vid, kind, at) values (p_form, p_vid, p_kind, now())
  on conflict (form_id, vid, kind) do update set at = now() where form_seen.at < now() - interval '30 minutes'
  returning true into hit;
  if not coalesce(hit, false) then return false; end if;
  insert into form_daily (form_id, workspace_id, day, views, starts, results)
  values (p_form, f.workspace_id, (now() at time zone ws_tz(f.workspace_id))::date, (p_kind = 'view')::int, (p_kind = 'start')::int, (p_kind = 'result')::int)
  on conflict (form_id, day) do update set views = form_daily.views + excluded.views, starts = form_daily.starts + excluded.starts, results = form_daily.results + excluded.results;
  return true;
end;
$$;
