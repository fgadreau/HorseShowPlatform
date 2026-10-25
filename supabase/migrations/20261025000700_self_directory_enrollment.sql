-- Self-enrollment links a participant's own contact, not an organization staff
-- membership or a paid membership card. All writes are atomic and repeatable.
create or replace function public.join_public_directory(p_directory_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_record public.user_profiles%rowtype;
  directory_record public.organization_disciplines%rowtype;
  own_contact_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into profile_record from public.user_profiles
    where id = public.current_profile_id() and user_id = auth.uid() for update;
  if not found then
    raise exception 'Complete your user profile first' using errcode = '42501';
  end if;
  select * into directory_record from public.organization_disciplines
    where id = p_directory_id and is_active for share;
  if not found or not (
    public.is_org_member(directory_record.organization_id)
    or exists (select 1 from public.shows s where s.organization_id = directory_record.organization_id and s.is_public)
  ) then
    raise exception 'Directory is inactive or unavailable' using errcode = '42501';
  end if;

  perform public.claim_contacts_for_current_user();
  select id into own_contact_id from public.contacts
    where linked_user_id = profile_record.id order by created_at, id limit 1;
  if own_contact_id is null then
    if nullif(btrim(profile_record.first_name), '') is null or nullif(btrim(profile_record.last_name), '') is null then
      raise exception 'Complete your first and last name before choosing a directory' using errcode = '22023';
    end if;
    insert into public.contacts (type, first_name, last_name, linked_user_id, created_by_user_id)
      values ('owner', btrim(profile_record.first_name), btrim(profile_record.last_name), profile_record.id, profile_record.id)
      returning id into own_contact_id;
  end if;
  insert into public.directory_contacts (organization_discipline_id, contact_id, source, created_by_user_id)
    values (directory_record.id, own_contact_id, 'manual', profile_record.id)
    on conflict (organization_discipline_id, contact_id) do nothing;
  return own_contact_id;
end;
$$;

revoke all on function public.join_public_directory(uuid) from public;
grant execute on function public.join_public_directory(uuid) to authenticated;
