-- Share › Email (docs/sharing-plan.md): each email sent from a form's Share tab remembers the form, so Share can show
-- where each person it went to is (Not started, In progress, Finished, Not delivered; src/lib/share/people.ts). Set by
-- the server right after the email is made (src/app/api/forms/share-email/route.ts); members read it like the rest
-- of emails. A deleted form leaves its emails as they were.

alter table public.emails add column if not exists form_id uuid references public.forms (id) on delete set null;
create index if not exists emails_form on public.emails (form_id, created_at desc) where form_id is not null;
