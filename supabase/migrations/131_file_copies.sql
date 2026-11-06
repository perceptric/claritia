-- File copies (docs/integrations-plan.md, Next step 9): a fill's uploads, for the delivery that copies them to Google
-- Drive, OneDrive, Dropbox, Box or Amazon S3. Only the uploads that fill kept.

create or replace function public.form_uploads_of(p_sid uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'path', u.path, 'name', u.name, 'kind', u.kind, 'bytes', u.bytes) order by u.created_at), '[]')
  from form_uploads u where u.submission_id = p_sid;
$$;

revoke execute on function public.form_uploads_of(uuid) from public, anon, authenticated;
grant execute on function public.form_uploads_of(uuid) to service_role;

notify pgrst, 'reload schema';
