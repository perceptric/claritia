-- Automations that start when someone joins a list (docs/email-studio-plan.md Part 6), and the brand's voice (Part 2).
--   Joining a list, however it happens (the Audiences bulk bar, an import, a form or a workflow later), leaves a
--   'list.joined' contact event with the list's id, made by a trigger on list_members so no way in can skip it. A
--   repeat add changes nothing, so it leaves no event.
--   workflow_scan (086) starts a workflow whose trigger is { kind: "list", lists: [...] } on those events, the same way
--   it starts on a form fill: once per event, from a mark, with the workflow's own entry rules.

create or replace function public.list_joined_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if to_regclass('partitions.contact_events_' || to_char(now(), 'YYYY_MM')) is null then
    perform contact_events_roll();
  end if;
  insert into contact_events (workspace_id, contact_id, kind, data, source)
  values (new.workspace_id, new.contact_id, 'list.joined', jsonb_build_object('list_id', new.list_id), 'list');
  return new;
end;
$$;

drop trigger if exists list_members_joined on public.list_members;
create trigger list_members_joined after insert on public.list_members for each row execute function public.list_joined_event();

create or replace function public.workflow_scan() returns integer
language plpgsql security definer set search_path = public as $$
declare
  w record;
  t jsonb;
  started int := 0;
  k int;
  since timestamptz;
  kinds text[];
begin
  for w in
    select f.id, f.workspace_id, f.live_version, f.live_at, v.body, m.scanned_to, m.fired_version, m.date_ran_on
    from workflows f join workflow_versions v on v.workflow_id = f.id and v.version = f.live_version
    left join workflow_marks m on m.workflow_id = f.id
    where f.status = 'live' and f.trigger_kind not in ('manual')
  loop
    t := w.body->'trigger';
    if t->>'kind' in ('form', 'meeting', 'not_booked', 'outcome', 'band', 'routed', 'segment', 'field', 'clicked', 'product', 'list') then
      -- Re-read the last 15 minutes past the mark so an event that commits late is still picked up; never more than a day.
      since := greatest(w.live_at, coalesce(w.scanned_to, now()) - interval '15 minutes', now() - interval '1 day');
      kinds := case t->>'kind'
        when 'form' then array['form.submitted']
        when 'meeting' then array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x)
        when 'not_booked' then array['meeting.not_booked']
        when 'list' then array['list.joined']
        when 'outcome' then array['lead.outcome']
        when 'band' then array['lead.band']
        when 'routed' then array(select x from unnest(array['lead.routed', 'lead.unassigned']) x
                                 where (x = 'lead.routed' and t->>'result' in ('routed', 'any')) or (x = 'lead.unassigned' and t->>'result' in ('unassigned', 'any')))
        when 'segment' then array[case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end]
        when 'field' then array['field.changed']
        when 'clicked' then array['email.clicked']
        when 'product' then array['product.used']
      end;
      insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
      select distinct on (e.contact_id) w.workspace_id, w.id, w.live_version, e.contact_id, 'ev:' || e.id::text
      from contact_events e join contacts c on c.id = e.contact_id and c.deleted_at is null
      where e.workspace_id = w.workspace_id and e.kind = any(kinds) and e.at >= since and e.at <= now()
        and case t->>'kind'
          when 'form' then e.kind = 'form.submitted' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'meeting' then e.kind = any(array(select 'meeting.' || x from jsonb_array_elements_text(coalesce(t->'events', '[]')) x))
            and (jsonb_array_length(coalesce(t->'types', '[]')) = 0 or t->'types' ? (e.data->>'type_id'))
          when 'not_booked' then e.kind = 'meeting.not_booked' and (jsonb_array_length(coalesce(t->'forms', '[]')) = 0 or t->'forms' ? (e.data->>'form_id'))
          when 'outcome' then e.kind = 'lead.outcome' and t->'outcomes' ? (e.data->>'outcome')
          when 'band' then e.kind = 'lead.band' and (jsonb_array_length(coalesce(t->'bands', '[]')) = 0 or t->'bands' ? (e.data->>'to'))
          when 'routed' then (e.kind = 'lead.routed' and t->>'result' in ('routed', 'any')) or (e.kind = 'lead.unassigned' and t->>'result' in ('unassigned', 'any'))
          when 'segment' then e.kind = case when t->>'on' = 'left' then 'segment.left' else 'segment.entered' end and e.data->>'segment_id' = t->>'segment'
          when 'field' then e.kind = 'field.changed' and e.data->>'key' = t->>'key' and (coalesce(t->>'to', '') = '' or e.data->>'new' = to_jsonb(t->>'to')::text or e.data->'new' = to_jsonb(t->>'to'))
          when 'list' then e.kind = 'list.joined' and (jsonb_array_length(coalesce(t->'lists', '[]')) = 0 or t->'lists' ? (e.data->>'list_id'))
          when 'clicked' then e.kind = 'email.clicked' and (jsonb_array_length(coalesce(t->'emails', '[]')) = 0 or t->'emails' ? (e.data->>'email_id'))
          when 'product' then e.kind = 'product.used' and t->'events' ? (e.data->>'name')
          else false
        end
        and not exists (select 1 from workflow_runs r where r.workflow_id = w.id and r.key = 'ev:' || e.id::text)
        and workflow_may_start(w.id, e.contact_id)
      order by e.contact_id, e.at
      on conflict (workflow_id, key) do nothing;
      get diagnostics k = row_count;
      started := started + k;
      insert into workflow_marks (workflow_id, scanned_to) values (w.id, now())
      on conflict (workflow_id) do update set scanned_to = excluded.scanned_to;
    elsif t->>'kind' = 'broadcast' then
      -- Once, at its time, to everyone in the segment then.
      if (t->>'at')::timestamptz <= now() and w.fired_version is distinct from w.live_version then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, m.contact_id, 'bc:' || m.contact_id
        from segment_members m join contacts c on c.id = m.contact_id and c.deleted_at is null
        where m.segment_id = (t->>'segment')::uuid and m.left_at is null
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
        insert into workflow_marks (workflow_id, fired_version) values (w.id, w.live_version)
        on conflict (workflow_id) do update set fired_version = excluded.fired_version;
      end if;
    elsif t->>'kind' = 'date' then
      -- Once a day after the hour: contacts whose date field, moved by the days, is today.
      if to_char(now(), 'HH24:MI') >= coalesce(t->>'time', '09:00') and w.date_ran_on is distinct from current_date then
        insert into workflow_runs (workspace_id, workflow_id, version, contact_id, key)
        select w.workspace_id, w.id, w.live_version, c.id, 'date:' || c.id || ':' || current_date
        from contacts c
        where c.workspace_id = w.workspace_id and c.deleted_at is null
          and (case when t->>'field' like 'f.%' then c.fields->>substr(t->>'field', 3) else null end) ~ '^\d{4}-\d{2}-\d{2}'
          and (left(c.fields->>substr(t->>'field', 3), 10)::date + coalesce((t->>'days')::int, 0)) = current_date
          and workflow_may_start(w.id, c.id)
        on conflict (workflow_id, key) do nothing;
        get diagnostics k = row_count;
        started := started + k;
        insert into workflow_marks (workflow_id, date_ran_on) values (w.id, current_date)
        on conflict (workflow_id) do update set date_ran_on = excluded.date_ran_on;
      end if;
    end if;
  end loop;
  return started;
end;
$$;

-- The brand's voice (docs/email-studio-plan.md Part 2): the written brief every AI email and automation writes from
-- (076), now changed by hand on Emails › Brand. Any member; up to 2,000 characters.
create or replace function public.brand_brief_save(p_ws uuid, p_kit uuid, p_brief text) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not is_member(p_ws) then raise exception 'Workspace not found'; end if;
  update brand_kits set brief = nullif(left(btrim(coalesce(p_brief, '')), 2000), '') where id = p_kit and workspace_id = p_ws;
  return found;
end;
$$;
revoke execute on function public.brand_brief_save(uuid, uuid, text) from public, anon;
grant execute on function public.brand_brief_save(uuid, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
