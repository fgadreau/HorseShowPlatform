\set ON_ERROR_STOP on

begin;

-- Reuse the deterministic local fixture, then make one show explicitly public
-- for the Broadcast authorization and trigger checks below.
\ir ../seed.sql

update public.shows
set
  status = 'open',
  is_public = true,
  show_schedule_public = true
where id = '40000000-0000-0000-0000-000000000001';

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

do $$
begin
  if not public.showscore_can_receive_public_broadcast(
    'showscore-public:40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'A public show topic was rejected';
  end if;

  if public.showscore_can_receive_public_broadcast(
    'showscore-public:40000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'A private show topic was accepted';
  end if;

  if public.showscore_can_receive_public_broadcast('showscore-public:not-a-uuid') then
    raise exception 'An invalid Broadcast topic was accepted';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.showscore_broadcast_public_change()',
    'execute'
  ) then
    raise exception 'authenticated can execute the Broadcast trigger function';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.showscore_public_broadcast_project_row(text,jsonb)',
    'execute'
  ) then
    raise exception 'authenticated can execute the Broadcast projector';
  end if;

  if has_sequence_privilege(
    'authenticated',
    'public.showscore_public_broadcast_seq',
    'usage'
  ) then
    raise exception 'authenticated can advance the Broadcast sequence';
  end if;

  raise notice 'ok - private topic authorization and function privileges';
end;
$$;

set local role authenticated;
do $$
begin
  begin
    insert into realtime.messages (topic, extension, event, payload, private)
    values (
      'showscore-public:40000000-0000-0000-0000-000000000001',
      'broadcast',
      'change',
      '{"forged":true}'::jsonb,
      true
    );
  exception
    when insufficient_privilege or check_violation then
      raise notice 'ok - authenticated cannot forge a Broadcast message';
      return;
  end;

  raise exception 'authenticated forged a Broadcast message';
end;
$$;
reset role;

insert into public.show_score_publication_states (
  block_id,
  organization_id,
  show_id,
  status
)
values (
  '50000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  'live_scoring'
)
on conflict (block_id) do update
set status = excluded.status;

update public.shows
set
  is_public = false,
  show_schedule_public = false,
  show_draw_public = false,
  show_results_public = false,
  is_livestream_public = false
where id = '40000000-0000-0000-0000-000000000001';

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

update public.show_score_publication_states
set status = 'hidden'
where block_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  message_payload jsonb;
begin
  select payload
  into message_payload
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001'
  order by inserted_at desc
  limit 1;

  if message_payload ->> 'table' <> 'public_show_snapshot'
    or message_payload ->> 'eventType' <> 'INVALIDATE'
    or message_payload -> 'new' <> 'null'::jsonb
    or message_payload -> 'old' <> 'null'::jsonb
  then
    raise exception 'Publication hidden transition leaked row data: %', message_payload;
  end if;

  raise notice 'ok - last public publication becoming hidden still invalidates safely';
end;
$$;

delete from public.show_score_publication_states
where block_id = '50000000-0000-0000-0000-000000000001';

update public.shows
set is_public = true
where id = '40000000-0000-0000-0000-000000000001';

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

update public.show_score_block_setups
set pattern = '10'
where block_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  message_payload jsonb;
begin
  select payload
  into message_payload
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001'
    and event = 'change'
  order by inserted_at desc
  limit 1;

  if message_payload is null then
    raise exception 'A public block update did not emit Broadcast';
  end if;

  if message_payload ->> 'table' <> 'show_score_block_setups'
    or message_payload ->> 'eventType' <> 'UPDATE'
    or message_payload ->> 'block_id' <> '50000000-0000-0000-0000-000000000001'
    or message_payload ->> 'row_key' <> '50000000-0000-0000-0000-000000000001'
    or coalesce((message_payload ->> 'event_seq')::bigint, 0) <= 0
  then
    raise exception 'Unexpected public block Broadcast payload: %', message_payload;
  end if;

  if message_payload -> 'new' ? 'organization_id'
    or message_payload -> 'new' ? 'legacy_payload'
  then
    raise exception 'Broadcast leaked a non-projected column: %', message_payload;
  end if;

  if message_payload -> 'old' <> 'null'::jsonb then
    raise exception 'Broadcast exposed a pre-update row: %', message_payload;
  end if;

  raise notice 'ok - public block update emits a projected ordered payload';
end;
$$;

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

update public.blocks
set schedule_is_public = false
where id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  message_payload jsonb;
begin
  select payload
  into message_payload
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001'
  order by inserted_at desc
  limit 1;

  if message_payload ->> 'table' <> 'public_show_snapshot'
    or message_payload ->> 'eventType' <> 'INVALIDATE'
    or message_payload -> 'new' <> 'null'::jsonb
    or message_payload -> 'old' <> 'null'::jsonb
  then
    raise exception 'Visibility transition leaked row data: %', message_payload;
  end if;

  raise notice 'ok - public to hidden transition emits only invalidation';
end;
$$;

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

update public.show_score_block_setups
set pattern = '11'
where block_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  message_count integer;
begin
  select count(*)
  into message_count
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

  if message_count <> 0 then
    raise exception 'A hidden block emitted % Broadcast messages', message_count;
  end if;

  raise notice 'ok - hidden block rows are not broadcast';
end;
$$;

update public.blocks
set schedule_is_public = true
where id = '50000000-0000-0000-0000-000000000001';

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

update public.show_score_block_setups
set runs = (
  select jsonb_agg(
    jsonb_build_object(
      'id', concat('broadcast-run-', run_number),
      'draw', run_number,
      'backNumber', 1000 + run_number,
      'rider', concat('Broadcast Rider ', run_number),
      'horse', concat('Broadcast Horse ', run_number),
      'owner', concat('Broadcast Owner ', run_number),
      'scores', jsonb_build_array(0, 0.5, -0.5, 1, 0, 0.5, -1, 0)
    )
    order by run_number
  )
  from generate_series(1, 167) run_number
)
where block_id = '50000000-0000-0000-0000-000000000001';

do $$
declare
  message_payload jsonb;
begin
  select payload
  into message_payload
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001'
  order by inserted_at desc
  limit 1;

  if message_payload is null then
    raise exception 'The 167-run update did not emit Broadcast or invalidation';
  end if;

  if octet_length(message_payload::text) > 524288 then
    raise exception 'The 167-run payload exceeded the 512 KiB safety cap';
  end if;

  raise notice 'ok - 167-run payload remains within the safety cap (%)',
    octet_length(message_payload::text);
end;
$$;

delete from realtime.messages
where topic = 'showscore-public:40000000-0000-0000-0000-000000000001';

delete from public.blocks
where id = '50000000-0000-0000-0000-000000000002';

do $$
declare
  message_payload jsonb;
begin
  select payload
  into message_payload
  from realtime.messages
  where topic = 'showscore-public:40000000-0000-0000-0000-000000000001'
    and payload ->> 'block_id' = '50000000-0000-0000-0000-000000000002'
  order by inserted_at desc
  limit 1;

  if message_payload ->> 'table' <> 'public_show_snapshot'
    or message_payload ->> 'eventType' <> 'INVALIDATE'
  then
    raise exception 'Cascade block deletion did not emit invalidation: %', message_payload;
  end if;

  raise notice 'ok - block deletion invalidates before child cascades';
end;
$$;

rollback;
