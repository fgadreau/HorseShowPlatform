-- Fan out ShowScore public display changes once per show instead of running
-- Postgres Changes authorization once per connected public display.
--
-- This migration is intentionally additive. The existing supabase_realtime
-- publication remains available as an application fallback during rollout.
--
-- One private channel is used per show. Realtime RLS therefore authorizes the
-- show topic, while this single trigger function remains the mandatory block
-- visibility gate for every row payload. Visibility transitions never include
-- row data: they only invalidate the current public REST snapshot.

create sequence if not exists public.showscore_public_broadcast_seq;

revoke all on sequence public.showscore_public_broadcast_seq
  from public, anon, authenticated;

create or replace function public.showscore_can_receive_public_broadcast(
  target_topic text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target_show_id uuid;
begin
  if coalesce(target_topic, '') !~* '^showscore-public:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;

  target_show_id := split_part(target_topic, ':', 2)::uuid;
  return public.showscore_public_show_exists(target_show_id);
exception
  when invalid_text_representation then
    return false;
end;
$$;

revoke all on function public.showscore_can_receive_public_broadcast(text)
  from public;
grant execute on function public.showscore_can_receive_public_broadcast(text)
  to anon, authenticated;

alter table realtime.messages enable row level security;

drop policy if exists "ShowScore public displays can receive private broadcasts"
  on realtime.messages;
create policy "ShowScore public displays can receive private broadcasts"
  on realtime.messages
  for select
  to anon, authenticated
  using (
    extension = 'broadcast'
    and public.showscore_can_receive_public_broadcast(realtime.topic())
  );

create or replace function public.showscore_public_broadcast_project_row(
  target_table text,
  source_row jsonb
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if source_row is null then
    return null;
  end if;

  case target_table
    when 'shows' then
      return jsonb_build_object(
        'id', source_row -> 'id',
        'organization_id', source_row -> 'organization_id',
        'name', source_row -> 'name',
        'venue', source_row -> 'venue',
        'location', source_row -> 'location',
        'start_date', source_row -> 'start_date',
        'end_date', source_row -> 'end_date',
        'status', source_row -> 'status',
        'is_public', source_row -> 'is_public',
        'show_schedule_public', source_row -> 'show_schedule_public',
        'show_draw_public', source_row -> 'show_draw_public',
        'show_results_public', source_row -> 'show_results_public',
        'livestream_url', source_row -> 'livestream_url',
        'livestream_urls_by_date', source_row -> 'livestream_urls_by_date',
        'is_livestream_public', source_row -> 'is_livestream_public',
        'tv_display_paused', source_row -> 'tv_display_paused',
        'obs_overlay_mode', source_row -> 'obs_overlay_mode',
        'tv_display_message_fr', source_row -> 'tv_display_message_fr',
        'tv_display_message_en', source_row -> 'tv_display_message_en',
        'tv_display_video_path', source_row -> 'tv_display_video_path',
        'tv_display_video_name', source_row -> 'tv_display_video_name',
        'tv_display_video_size', source_row -> 'tv_display_video_size',
        'tv_display_video_arena', source_row -> 'tv_display_video_arena',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_paid_warmups' then
      return jsonb_build_object(
        'id', source_row -> 'id',
        'organization_id', source_row -> 'organization_id',
        'show_id', source_row -> 'show_id',
        'show_day_id', source_row -> 'show_day_id',
        'name', source_row -> 'name',
        'arena', source_row -> 'arena',
        'duration_minutes_per_rider', source_row -> 'duration_minutes_per_rider',
        'drag_interval', source_row -> 'drag_interval',
        'drag_duration_minutes', source_row -> 'drag_duration_minutes',
        'schedule_start_mode', source_row -> 'schedule_start_mode',
        'schedule_start_time', source_row -> 'schedule_start_time',
        'is_public_live', source_row -> 'is_public_live',
        'active_entry_id', source_row -> 'active_entry_id',
        'active_started_at', source_row -> 'active_started_at',
        'entries', source_row -> 'entries',
        'sort_order', source_row -> 'sort_order',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_scoring_sessions' then
      return jsonb_build_object(
        'block_id', source_row -> 'block_id',
        'runs', source_row -> 'runs',
        'active_manoeuvre', source_row -> 'active_manoeuvre',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_judge_sessions' then
      return jsonb_build_object(
        'block_id', source_row -> 'block_id',
        'judge_id', source_row -> 'judge_id',
        'judge_name', source_row -> 'judge_name',
        'runs', source_row -> 'runs',
        'active_manoeuvre', source_row -> 'active_manoeuvre',
        'finalized', source_row -> 'finalized',
        'finalized_at', source_row -> 'finalized_at',
        'judge_signed_at', source_row -> 'judge_signed_at',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_block_setups' then
      return jsonb_build_object(
        'block_id', source_row -> 'block_id',
        'pattern', source_row -> 'pattern',
        'custom_pattern', source_row -> 'custom_pattern',
        'runs', source_row -> 'runs',
        'schedule_details', source_row -> 'schedule_details',
        'judges', source_row -> 'judges',
        'block_classes', source_row -> 'block_classes',
        'drag_interval', source_row -> 'drag_interval',
        'drag_duration_minutes', source_row -> 'drag_duration_minutes',
        'live_data_source', source_row -> 'live_data_source',
        'live_display_mode', source_row -> 'live_display_mode',
        'qualified_rider_count', source_row -> 'qualified_rider_count',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_publication_states' then
      return jsonb_build_object(
        'block_id', source_row -> 'block_id',
        'status', source_row -> 'status',
        'published_at', source_row -> 'published_at',
        'published_by', source_row -> 'published_by',
        'public_url', source_row -> 'public_url',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_official_results' then
      return jsonb_build_object(
        'block_id', source_row -> 'block_id',
        'judge_name', source_row -> 'judge_name',
        'finalized', source_row -> 'finalized',
        'finalized_at', source_row -> 'finalized_at',
        'judge_signed_at', source_row -> 'judge_signed_at',
        'secretariat_validated_at', source_row -> 'secretariat_validated_at',
        'custom_pattern', source_row -> 'custom_pattern',
        'official_runs', source_row -> 'official_runs',
        'updated_at', source_row -> 'updated_at'
      );
    when 'show_score_announcer_live_sessions' then
      return jsonb_build_object(
        'class_id', source_row -> 'class_id',
        'runs', source_row -> 'runs',
        'active_manoeuvre', source_row -> 'active_manoeuvre',
        'started_at', source_row -> 'started_at',
        'completed_at', source_row -> 'completed_at',
        'completed_by', source_row -> 'completed_by',
        'revision', source_row -> 'revision',
        'updated_at', source_row -> 'updated_at'
      );
    else
      return null;
  end case;
end;
$$;

revoke all on function public.showscore_public_broadcast_project_row(text, jsonb)
  from public, anon, authenticated;

create or replace function public.showscore_broadcast_public_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  old_row jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  source_row jsonb := coalesce(new_row, old_row);
  target_show_id uuid;
  target_block_id uuid;
  target_row_key text;
  event_sequence bigint;
  event_identifier text;
  should_broadcast boolean := false;
  force_invalidation boolean := false;
  projected_new jsonb;
  projected_old jsonb;
  outgoing_table text;
  outgoing_event_type text;
  event_payload jsonb;
begin
  case tg_table_name
    when 'shows' then
      target_show_id := (source_row ->> 'id')::uuid;
      target_row_key := target_show_id::text;
      should_broadcast := true;
      force_invalidation := true;
    when 'blocks' then
      target_show_id := (source_row ->> 'show_id')::uuid;
      target_block_id := (source_row ->> 'id')::uuid;
      target_row_key := target_block_id::text;
      should_broadcast := true;
      force_invalidation := true;
    when 'show_score_paid_warmups' then
      target_show_id := (source_row ->> 'show_id')::uuid;
      target_block_id := nullif(source_row ->> 'block_id', '')::uuid;
      target_row_key := source_row ->> 'id';
      force_invalidation := coalesce(
        (old_row ->> 'is_public_live')::boolean,
        false
      ) is distinct from coalesce(
        (new_row ->> 'is_public_live')::boolean,
        false
      );
      should_broadcast := force_invalidation or (
        public.showscore_public_show_exists(target_show_id)
        and coalesce((new_row ->> 'is_public_live')::boolean, false)
      );
    when 'show_score_announcer_live_sessions' then
      target_block_id := (source_row ->> 'class_id')::uuid;
      select target_block.show_id
      into target_show_id
      from public.blocks target_block
      where target_block.id = target_block_id;
      target_row_key := target_block_id::text;
      should_broadcast := public.showscore_public_class_exists(target_block_id);
    else
      target_show_id := nullif(source_row ->> 'show_id', '')::uuid;
      target_block_id := nullif(source_row ->> 'block_id', '')::uuid;
      if target_show_id is null and target_block_id is not null then
        select target_block.show_id
        into target_show_id
        from public.blocks target_block
        where target_block.id = target_block_id;
      end if;
      target_row_key := case
        when tg_table_name = 'show_score_judge_sessions'
          then concat(target_block_id::text, ':', source_row ->> 'judge_id')
        else target_block_id::text
      end;

      case tg_table_name
        when 'show_score_scoring_sessions', 'show_score_judge_sessions' then
          should_broadcast := public.showscore_public_live_class_exists(target_block_id);
        when 'show_score_block_setups', 'show_score_announcer_live_sessions' then
          should_broadcast := public.showscore_public_class_exists(target_block_id);
        when 'show_score_publication_states' then
          force_invalidation := (
            coalesce(old_row ->> 'status', '') in (
              'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
            )
          ) is distinct from (
            coalesce(new_row ->> 'status', '') in (
              'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
            )
          );
          should_broadcast := force_invalidation or (
            public.showscore_public_class_exists(target_block_id)
            and (
              coalesce(new_row ->> 'status', '') in (
                'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
              )
              or coalesce(old_row ->> 'status', '') in (
                'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
              )
            )
          );
        when 'show_score_official_results' then
          should_broadcast := public.showscore_public_class_exists(target_block_id)
            and (
              coalesce((new_row ->> 'finalized')::boolean, false)
              or coalesce((old_row ->> 'finalized')::boolean, false)
            )
            and exists (
              select 1
              from public.show_score_publication_states publication
              where publication.block_id = target_block_id
                and publication.status in ('official', 'published')
            );
        else
          should_broadcast := false;
      end case;
  end case;

  if not should_broadcast or target_show_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  event_sequence := nextval('public.showscore_public_broadcast_seq'::regclass);
  event_identifier := concat(tg_table_name, ':', target_row_key, ':', event_sequence);

  if force_invalidation then
    projected_new := null;
    projected_old := null;
  else
    -- Public clients only need the current row for INSERT/UPDATE and the last
    -- row for DELETE. Avoid sending pre-update drafts and duplicating large
    -- run arrays on every score mutation.
    projected_new := case
      when tg_op = 'DELETE' then null
      else public.showscore_public_broadcast_project_row(tg_table_name, new_row)
    end;
    projected_old := case
      when tg_op = 'DELETE'
        then public.showscore_public_broadcast_project_row(tg_table_name, old_row)
      else null
    end;
  end if;

  outgoing_table := case
    when force_invalidation then 'public_show_snapshot'
    else tg_table_name
  end;
  outgoing_event_type := case
    when force_invalidation then 'INVALIDATE'
    else tg_op
  end;

  event_payload := jsonb_build_object(
    'version', 1,
    'event_id', event_identifier,
    'event_seq', event_sequence,
    'row_key', target_row_key,
    'schema', tg_table_schema,
    'table', outgoing_table,
    'eventType', outgoing_event_type,
    'show_id', target_show_id,
    'block_id', target_block_id,
    'new', projected_new,
    'old', projected_old
  );

  -- Realtime projects currently accept messages up to roughly 1 MB. Keep a
  -- conservative margin. An oversized 167-run snapshot becomes one explicit
  -- REST invalidation instead of failing the source write or dropping updates.
  if octet_length(event_payload::text) > 524288 then
    event_payload := jsonb_build_object(
      'version', 1,
      'event_id', event_identifier,
      'event_seq', event_sequence,
      'row_key', target_row_key,
      'schema', tg_table_schema,
      'table', 'public_show_snapshot',
      'eventType', 'INVALIDATE',
      'show_id', target_show_id,
      'block_id', target_block_id,
      'reason', 'payload_too_large',
      'new', null,
      'old', null
    );
  end if;

  perform realtime.send(
    event_payload,
    'change',
    concat('showscore-public:', target_show_id::text),
    true
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.showscore_broadcast_public_change()
  from public, anon, authenticated;

drop trigger if exists showscore_public_broadcast_shows on public.shows;
create trigger showscore_public_broadcast_shows
  after insert or update or delete on public.shows
  for each row execute function public.showscore_broadcast_public_change();

drop trigger if exists showscore_public_broadcast_blocks_visibility on public.blocks;
create trigger showscore_public_broadcast_blocks_visibility
  after update of schedule_is_public, results_are_public on public.blocks
  for each row execute function public.showscore_broadcast_public_change();

drop trigger if exists showscore_public_broadcast_blocks_delete on public.blocks;
create trigger showscore_public_broadcast_blocks_delete
  before delete on public.blocks
  for each row execute function public.showscore_broadcast_public_change();

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'show_score_paid_warmups',
    'show_score_scoring_sessions',
    'show_score_judge_sessions',
    'show_score_block_setups',
    'show_score_publication_states',
    'show_score_official_results',
    'show_score_announcer_live_sessions'
  ]
  loop
    execute format(
      'drop trigger if exists %I on public.%I',
      concat('showscore_public_broadcast_', target_table),
      target_table
    );
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.showscore_broadcast_public_change()',
      concat('showscore_public_broadcast_', target_table),
      target_table
    );
  end loop;
end;
$$;

notify pgrst, 'reload schema';
