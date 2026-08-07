-- The public ShowScore channel subscribes to announcer-led live sessions by
-- class_id. If this table is absent from the Realtime publication, every TV,
-- mobile view and OBS source enters the channel retry loop and reloads the full
-- public snapshot repeatedly.

do $$
begin
  if to_regclass('public.show_score_announcer_live_sessions') is not null
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'show_score_announcer_live_sessions'
    )
  then
    alter publication supabase_realtime
      add table public.show_score_announcer_live_sessions;
  end if;
end;
$$;

notify pgrst, 'reload schema';
