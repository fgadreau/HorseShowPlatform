\set ON_ERROR_STOP on

begin;

\ir ../seed.sql

delete from public.show_score_announcer_live_sessions
where class_id = '50000000-0000-0000-0000-000000000002';

insert into public.show_score_block_setups (
  block_id,
  runs,
  live_data_source
)
values (
  '50000000-0000-0000-0000-000000000002',
  '[
    {"id":"announcer-default-1","draw":1,"rider":"Rider 1"},
    {"id":"announcer-default-2","draw":2,"rider":"Rider 2"}
  ]'::jsonb,
  'announcer'
)
on conflict (block_id) do update
set
  runs = excluded.runs,
  live_data_source = excluded.live_data_source;

do $$
declare
  session_row public.show_score_announcer_live_sessions%rowtype;
begin
  select *
  into strict session_row
  from public.show_score_announcer_live_sessions
  where class_id = '50000000-0000-0000-0000-000000000002';

  if jsonb_array_length(session_row.runs) <> 2
    or session_row.revision <> 0
  then
    raise exception 'Default announcer setup did not initialize its live session: %', session_row;
  end if;

  raise notice 'ok - default announcer setup initializes its live session';
end;
$$;

update public.show_score_block_setups
set runs = runs || '[{"id":"announcer-default-3","draw":3,"rider":"Rider 3"}]'::jsonb
where block_id = '50000000-0000-0000-0000-000000000002';

do $$
declare
  session_row public.show_score_announcer_live_sessions%rowtype;
begin
  select *
  into strict session_row
  from public.show_score_announcer_live_sessions
  where class_id = '50000000-0000-0000-0000-000000000002';

  if jsonb_array_length(session_row.runs) <> 3
    or session_row.revision <> 1
  then
    raise exception 'Unstarted announcer session did not follow setup runs: %', session_row;
  end if;

  raise notice 'ok - unstarted announcer session follows setup runs';
end;
$$;

update public.show_score_announcer_live_sessions
set
  started_at = now(),
  runs = jsonb_set(runs, '{0,status}', '"scored"'::jsonb),
  revision = revision + 1
where class_id = '50000000-0000-0000-0000-000000000002';

update public.show_score_block_setups
set runs = runs || '[{"id":"announcer-default-4","draw":4,"rider":"Rider 4"}]'::jsonb
where block_id = '50000000-0000-0000-0000-000000000002';

do $$
declare
  session_row public.show_score_announcer_live_sessions%rowtype;
begin
  select *
  into strict session_row
  from public.show_score_announcer_live_sessions
  where class_id = '50000000-0000-0000-0000-000000000002';

  if jsonb_array_length(session_row.runs) <> 3
    or session_row.runs #>> '{0,status}' <> 'scored'
    or session_row.started_at is null
    or session_row.revision <> 2
  then
    raise exception 'Started announcer session was overwritten by setup changes: %', session_row;
  end if;

  raise notice 'ok - started announcer session is protected from setup changes';
end;
$$;

rollback;
