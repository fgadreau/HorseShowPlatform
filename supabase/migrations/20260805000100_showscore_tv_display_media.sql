-- Persist every ShowScore public TV setting on the shared HSP schema and give
-- organization managers an isolated public bucket for competition display MP4s.

alter table public.shows
  add column if not exists livestream_urls_by_date jsonb not null default '{}'::jsonb,
  add column if not exists tv_display_paused boolean not null default false,
  add column if not exists tv_display_message_fr text not null default '',
  add column if not exists tv_display_message_en text not null default '',
  add column if not exists tv_display_video_path text not null default '',
  add column if not exists tv_display_video_name text not null default '',
  add column if not exists tv_display_video_size bigint not null default 0,
  add column if not exists tv_display_video_arena text not null default '';

alter table public.shows
  drop constraint if exists shows_tv_display_video_size_check;
alter table public.shows
  add constraint shows_tv_display_video_size_check
  check (tv_display_video_size >= 0 and tv_display_video_size <= 2147483648);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'tv-display-media',
  'tv-display-media',
  true,
  2147483648,
  array['video/mp4']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view TV display media" on storage.objects;
create policy "Public can view TV display media"
  on storage.objects for select to public
  using (bucket_id = 'tv-display-media');

drop policy if exists "Organization managers upload TV display media" on storage.objects;
create policy "Organization managers upload TV display media"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'tv-display-media'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.is_platform_admin()
      or public.is_org_member(
        split_part(name, '/', 1)::uuid,
        array['admin', 'secretary']::text[]
      )
    )
  );

drop policy if exists "Organization managers replace TV display media" on storage.objects;
create policy "Organization managers replace TV display media"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'tv-display-media'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.is_platform_admin()
      or public.is_org_member(
        split_part(name, '/', 1)::uuid,
        array['admin', 'secretary']::text[]
      )
    )
  )
  with check (
    bucket_id = 'tv-display-media'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.is_platform_admin()
      or public.is_org_member(
        split_part(name, '/', 1)::uuid,
        array['admin', 'secretary']::text[]
      )
    )
  );

drop policy if exists "Organization managers delete TV display media" on storage.objects;
create policy "Organization managers delete TV display media"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'tv-display-media'
    and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and (
      public.is_platform_admin()
      or public.is_org_member(
        split_part(name, '/', 1)::uuid,
        array['admin', 'secretary']::text[]
      )
    )
  );

notify pgrst, 'reload schema';
