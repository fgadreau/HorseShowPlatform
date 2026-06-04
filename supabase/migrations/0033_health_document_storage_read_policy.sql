drop policy if exists "Staff and linked users can view health document files" on storage.objects;
create policy "Staff and linked users can view health document files"
  on storage.objects for select
  using (
    bucket_id = 'health-documents'
    and auth.uid() is not null
    and (
      public.is_platform_admin()
      or case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then
          public.is_org_member(split_part(name, '/', 1)::uuid, array['admin', 'secretary'])
          or public.can_access_horse(split_part(name, '/', 2)::uuid)
        else false
      end
    )
  );
