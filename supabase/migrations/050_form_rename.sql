-- Rename a form from the forms list (docs/form-studio.md Part 0). The name only: the draft and its revision stay.
create or replace function public.form_rename(p_id uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  f forms%rowtype;
begin
  select * into f from forms where id = p_id for update;
  if f.id is null or not is_member(f.workspace_id) then
    raise exception 'Form not found';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name the form';
  end if;
  update forms set name = trim(left(p_name, 120)), updated_at = now() where id = p_id;
end;
$$;
revoke execute on function public.form_rename(uuid, text) from public, anon;
grant execute on function public.form_rename(uuid, text) to authenticated;
