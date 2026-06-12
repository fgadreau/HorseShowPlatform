-- Backfill user_profiles for any auth.users that signed up without one

insert into public.user_profiles (user_id)
select id from auth.users u
where not exists (
  select 1 from public.user_profiles p where p.user_id = u.id
)
on conflict (user_id) do nothing;
