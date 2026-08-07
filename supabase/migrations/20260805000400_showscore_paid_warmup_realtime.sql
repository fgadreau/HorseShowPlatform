-- Public TV and OBS views subscribe to paid-warmup changes so a timer started
-- by the announcer appears immediately instead of waiting for the 30-second
-- fallback refresh.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'show_score_paid_warmups'
  ) then
    alter publication supabase_realtime
      add table public.show_score_paid_warmups;
  end if;
end;
$$;

notify pgrst, 'reload schema';
