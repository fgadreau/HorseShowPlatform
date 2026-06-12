-- Platform admin: alias RPC for ShowScore + seed first admin

-- ShowScore calls current_user_is_platform_admin(), HSP uses is_platform_admin()
create or replace function public.current_user_is_platform_admin()
returns boolean
language sql security definer stable as $$
  select public.is_platform_admin();
$$;

-- Add fgadreau@gmail.com as platform admin
insert into public.platform_admins (user_id)
select up.id
from public.user_profiles up
join auth.users au on au.id = up.user_id
where au.email = 'fgadreau@gmail.com'
on conflict (user_id) do nothing;
