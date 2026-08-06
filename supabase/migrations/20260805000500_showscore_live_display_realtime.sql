-- Keep every public live display synchronized with both announcer-led and
-- scribe-led scoring. The frontend subscribes to these tables by block_id.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'show_score_scoring_sessions',
    'show_score_judge_sessions',
    'show_score_block_setups',
    'show_score_publication_states',
    'show_score_official_results'
  ]
  loop
    if to_regclass(format('public.%I', target_table)) is not null
      and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      )
    then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
