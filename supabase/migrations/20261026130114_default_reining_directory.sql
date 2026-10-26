-- Initialize the participant directory without purchasing a membership or
-- granting organization staff access. Existing directory choices are retained.
create or replace function public.ensure_default_reining_directory(p_organization_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  profile_record public.user_profiles%rowtype;
  directory_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select * into profile_record from public.user_profiles
    where user_id = auth.uid() for update;
  if not found or nullif(btrim(profile_record.first_name), '') is null
    or nullif(btrim(profile_record.last_name), '') is null then
    return null;
  end if;

  if not (public.is_org_member(p_organization_id) or exists (
    select 1 from public.shows s where s.organization_id = p_organization_id
      and (s.is_public or public.showscore_public_show_exists(s.id))
  )) then
    return null;
  end if;

  if exists (
    select 1 from public.directory_contacts dc
    join public.contacts c on c.id = dc.contact_id
    join public.organization_disciplines od on od.id = dc.organization_discipline_id
    where c.linked_user_id = profile_record.id and od.organization_id = p_organization_id
  ) then
    return null;
  end if;

  select od.id into directory_id
    from public.organization_disciplines od
    join public.disciplines d on d.id = od.discipline_id
    where od.organization_id = p_organization_id and od.is_active and d.is_active
      and lower(d.code) = 'reining'
    order by od.id limit 1;
  if directory_id is not null then
    perform public.join_public_directory(directory_id);
  end if;
  return directory_id;
end;
$$;

revoke all on function public.ensure_default_reining_directory(uuid) from public;
grant execute on function public.ensure_default_reining_directory(uuid) to authenticated;
