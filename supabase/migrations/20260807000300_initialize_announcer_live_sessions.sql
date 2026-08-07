-- Keep the announcer session aligned with its setup until live scoring starts.
-- This also initializes setups that are created with `announcer` as the
-- database default, without requiring an operator to toggle the UI first.

create or replace function public.sync_show_score_announcer_session_from_setup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.live_data_source <> 'announcer' then
    return new;
  end if;

  insert into public.show_score_announcer_live_sessions (
    class_id,
    runs,
    active_manoeuvre,
    started_at,
    completed_at,
    completed_by,
    revision
  )
  values (
    new.block_id,
    coalesce(new.runs, '[]'::jsonb),
    null,
    null,
    null,
    null,
    0
  )
  on conflict (class_id) do update
  set
    runs = excluded.runs,
    revision = show_score_announcer_live_sessions.revision + 1
  where show_score_announcer_live_sessions.started_at is null
    and show_score_announcer_live_sessions.completed_at is null
    and show_score_announcer_live_sessions.runs is distinct from excluded.runs;

  return new;
end;
$$;

revoke all on function public.sync_show_score_announcer_session_from_setup()
  from public, anon, authenticated;

drop trigger if exists sync_show_score_announcer_session_from_setup
  on public.show_score_block_setups;
create trigger sync_show_score_announcer_session_from_setup
  after insert or update of live_data_source, runs
  on public.show_score_block_setups
  for each row execute function public.sync_show_score_announcer_session_from_setup();

-- Repair existing default-announcer setups that have not started scoring.
insert into public.show_score_announcer_live_sessions (
  class_id,
  runs,
  active_manoeuvre,
  started_at,
  completed_at,
  completed_by,
  revision
)
select
  setup.block_id,
  coalesce(setup.runs, '[]'::jsonb),
  null,
  null,
  null,
  null,
  0
from public.show_score_block_setups setup
where setup.live_data_source = 'announcer'
on conflict (class_id) do update
set
  runs = excluded.runs,
  revision = show_score_announcer_live_sessions.revision + 1
where show_score_announcer_live_sessions.started_at is null
  and show_score_announcer_live_sessions.completed_at is null
  and show_score_announcer_live_sessions.runs is distinct from excluded.runs;

notify pgrst, 'reload schema';
