-- Creation only: existing associations use showscore_update_organization_profile.
create or replace function public.create_association_with_owner(
  target_id text,
  target_name text,
  target_short_name text default '',
  target_timezone text default 'America/Toronto',
  target_logo_data_url text default null,
  target_website_url text default null,
  target_sponsor_logos jsonb default '[]'::jsonb
)
returns json
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_org_id uuid;
  v_profile_id uuid;
  v_slug text;
  v_result json;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  select id into v_profile_id from public.user_profiles where user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'User profile required' using errcode = '42501';
  end if;

  v_org_id := coalesce(nullif(target_id, '')::uuid, gen_random_uuid());
  v_slug := lower(regexp_replace(coalesce(target_name, ''), '[^a-zA-Z0-9]+', '-', 'g'))
            || '-' || substring(v_org_id::text, 1, 8);

  insert into public.organizations (id, name, short_name, timezone, logo_url, website_url, sponsor_logos, slug)
  values (v_org_id, target_name, coalesce(target_short_name,''), coalesce(target_timezone,'America/Toronto'),
          target_logo_data_url, target_website_url, coalesce(target_sponsor_logos,'[]'::jsonb), v_slug);

  -- A plain INSERT rejects existing IDs, including concurrent creations.
  -- Never update an existing association or grant membership on conflict.
  insert into public.organization_members (user_id, organization_id, role)
  values (v_profile_id, v_org_id, 'admin');

  select row_to_json(o) into v_result
  from (
    select id, name, short_name, timezone, logo_url as logo_data_url, website_url, sponsor_logos, created_at, updated_at
    from public.organizations where id = v_org_id
  ) o;

  return v_result;
end;
$$;

revoke all on function public.create_association_with_owner(text,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.create_association_with_owner(text,text,text,text,text,text,jsonb) to authenticated;

notify pgrst, 'reload schema';
