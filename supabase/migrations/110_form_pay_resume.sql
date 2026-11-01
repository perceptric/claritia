-- Forms step 3 (docs/form-kinds-plan.md): payments on the workspace's own Stripe account, and save and finish later.
--   A form with a payment block opens Stripe Checkout on the connected account (the same Connect Standard account
--   paid meetings use) after the fill is saved; the submission keeps the payment's state, which the webhook moves to
--   paid, expired or failed. A visitor can save a long form and get a link by email that opens it where they stopped.

alter table submissions add column if not exists payment jsonb check (payment is null or jsonb_typeof(payment) = 'object');

-- Merge a patch into a submission's payment (service role: the submit route and the Stripe webhook).
create or replace function public.submission_payment(p_sid uuid, p_patch jsonb) returns jsonb
language sql security definer set search_path = public as $$
  update submissions set payment = coalesce(payment, '{}'::jsonb) || p_patch where id = p_sid returning payment;
$$;

-- Saved fills, by a token sent to the visitor's email. Kept 30 days.
create table if not exists public.form_drafts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  form_id uuid not null references public.forms (id) on delete cascade,
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{24,64}$'),
  email text not null check (length(email) between 3 and 320),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  step int not null default 0 check (step between 0 and 100),
  page text check (length(page) <= 1000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);
create index if not exists form_drafts_form on public.form_drafts (form_id, created_at desc);
alter table public.form_drafts enable row level security;
revoke all on public.form_drafts from anon, authenticated;

create or replace function public.form_draft_save(p_form uuid, p_token text, p_email text, p_answers jsonb, p_step int, p_page text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  ws uuid;
  did uuid;
begin
  select f.workspace_id into ws from forms f where f.id = p_form and f.status = 'live';
  if ws is null then
    raise exception 'This form isn''t taking answers';
  end if;
  -- At most 200 saves a form an hour from everyone: a script can't fill the table.
  if (select count(*) from form_drafts where form_id = p_form and created_at > now() - interval '1 hour') >= 200 then
    raise exception 'Too many saves';
  end if;
  delete from form_drafts where expires_at < now();
  insert into form_drafts (workspace_id, form_id, token, email, answers, step, page) values (ws, p_form, p_token, p_email, p_answers, p_step, p_page) returning form_drafts.id into did;
  return did;
end;
$$;

create or replace function public.form_draft_get(p_form uuid, p_token text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('answers', answers, 'step', step, 'email', email, 'page', page)
  from form_drafts where form_id = p_form and token = p_token and expires_at > now();
$$;

-- What the resume email needs: the form's name, its workspace and the draft.
create or replace function public.form_draft_info(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('form', f.name, 'form_id', f.id, 'workspace_id', d.workspace_id, 'email', d.email, 'token', d.token, 'page', d.page,
           'workspace', (select name from workspaces w where w.id = d.workspace_id), 'sending', meeting_sending(d.workspace_id))
  from form_drafts d join forms f on f.id = d.form_id where d.id = p_id and d.expires_at > now();
$$;

do $$
begin
  revoke execute on function public.submission_payment(uuid, jsonb) from public, anon, authenticated;
  grant execute on function public.submission_payment(uuid, jsonb) to service_role;
  revoke execute on function public.form_draft_save(uuid, text, text, jsonb, int, text) from public, anon, authenticated;
  grant execute on function public.form_draft_save(uuid, text, text, jsonb, int, text) to service_role;
  revoke execute on function public.form_draft_get(uuid, text) from public, anon, authenticated;
  grant execute on function public.form_draft_get(uuid, text) to service_role;
  revoke execute on function public.form_draft_info(uuid) from public, anon, authenticated;
  grant execute on function public.form_draft_info(uuid) to service_role;
end;
$$;
