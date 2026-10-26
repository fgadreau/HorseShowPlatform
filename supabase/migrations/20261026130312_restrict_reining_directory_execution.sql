-- Project default privileges may grant anon directly in addition to PUBLIC.
revoke all on function public.ensure_default_reining_directory(uuid) from anon;
grant execute on function public.ensure_default_reining_directory(uuid) to authenticated;
