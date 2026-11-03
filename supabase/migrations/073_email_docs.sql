-- Emails built with blocks (docs/design-system.md Part 4.1). Run after 072. Safe to run more than once.
--
-- An email template's body can now carry a block document beside the old words (`doc`, src/lib/design/email/doc.ts),
-- which is bigger than the 40 KB the old form needed. Workflow drafts already allow 400 KB. Documents are read
-- through readEmailDoc wherever they're used, so the database only bounds their size.

alter table public.email_templates drop constraint if exists email_templates_body_check;
alter table public.email_templates add constraint email_templates_body_check check (jsonb_typeof(body) = 'object' and length(body::text) <= 400000);
