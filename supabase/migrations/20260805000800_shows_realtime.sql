-- Public ShowScore views subscribe to the current show row for visibility,
-- livestream and TV-setting updates. Missing this table from the publication
-- makes the entire combined channel fail and retry, even when every live
-- scoring table is already published.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'shows'
  )
  then
    alter publication supabase_realtime add table public.shows;
  end if;
end;
$$;

notify pgrst, 'reload schema';
