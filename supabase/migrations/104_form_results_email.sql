-- Interactive forms: "Email my results" (docs/interactive-forms-plan.md Part 4). Run after 103. Safe to run more
-- than once. Service role only.
--
--   submission_result_get    a submission's saved result (the form_notify job builds the email from it)
--   form_results_request     the visitor asks for their result by email. Only the browser that sent the fill knows
--                            its key, so only it can ask; the email goes to the contact's own address, once
--                            (form_notify, part 'results'). Answers 'queued' or why not.

create or replace function public.submission_result_get(p_sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('outcome_id', r.outcome_id, 'outcome_title', r.outcome_title, 'values', r."values", 'form_version', r.form_version)
  from submission_results r where r.submission_id = p_sid;
$$;

create or replace function public.form_results_request(p_form uuid, p_sid uuid, p_key text) returns text
language plpgsql security definer set search_path = public as $$
declare
  s record;
begin
  select sb.id, sb.workspace_id, sb.idem_key, sb.spam, sb.test, c.email into s
  from submissions sb left join contacts c on c.id = sb.contact_id
  where sb.id = p_sid and sb.form_id = p_form;
  if not found or s.idem_key is distinct from p_key then return 'not_found'; end if;
  if s.spam or s.test then return 'not_sent'; end if;
  if s.email is null then return 'no_email'; end if;
  if not exists (select 1 from submission_results r where r.submission_id = p_sid) then return 'no_result'; end if;
  perform enqueue_job(s.workspace_id, 'form_notify', 'form_results:' || p_sid, jsonb_build_object('submission', p_sid, 'only', 'results'));
  return 'queued';
end;
$$;

revoke execute on function public.submission_result_get(uuid) from public, anon, authenticated;
revoke execute on function public.form_results_request(uuid, uuid, text) from public, anon, authenticated;
