-- Align SQL-language ShowScore helpers with the canonical block tables.
-- Compatibility function and return-column names remain unchanged for clients.
-- Impact ShowScore: SS-T.

create or replace function public.can_view_show_score_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks block
    where block.id = target_class_id
      and public.can_view_show_score_show(block.show_id)
  );
$$;

create or replace function public.can_manage_show_score_class(
  target_class_id uuid,
  accepted_show_roles text[] default array['organizer', 'secretary']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks block
    where block.id = target_class_id
      and public.can_manage_show_score_show(block.show_id, accepted_show_roles)
  );
$$;

create or replace function public.can_score_show_score_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks block
    where block.id = target_class_id
      and (
        public.is_platform_admin()
        or public.is_org_member(block.organization_id, array['admin', 'secretary', 'scribe'])
        or public.has_show_role(block.show_id, array['organizer', 'secretary', 'judge', 'scribe'])
      )
  );
$$;

create or replace function public.activate_show_for_scoring(target_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_show_id uuid;
begin
  select show_id into target_show_id
  from public.blocks
  where id = target_class_id;

  if target_show_id is not null then
    update public.shows
    set status = 'open', updated_at = now()
    where id = target_show_id;
  end if;
end;
$$;

create or replace function public.showscore_public_show_exists(target_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shows target_show
    where target_show.id = target_show_id
      and target_show.status = 'open'
      and (
        target_show.is_public = true
        or target_show.show_schedule_public = true
        or target_show.show_draw_public = true
        or target_show.show_results_public = true
        or target_show.is_livestream_public = true
        or exists (
          select 1
          from public.show_score_paid_warmups warmup
          where warmup.show_id = target_show.id
            and warmup.is_public_live = true
        )
        or exists (
          select 1
          from public.blocks public_block
          join public.show_score_publication_states publication
            on publication.block_id = public_block.id
          where public_block.show_id = target_show.id
            and public_block.schedule_is_public = true
            and publication.status in ('live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published')
        )
        or exists (
          select 1
          from public.blocks result_block
          join public.block_result_publications result_publication
            on result_publication.block_id = result_block.id
          where result_block.show_id = target_show.id
            and result_block.results_are_public = true
            and result_publication.status = 'published'
        )
      )
  );
$$;

create or replace function public.showscore_public_class_exists(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks target_block
    where target_block.id = target_class_id
      and target_block.schedule_is_public = true
      and public.showscore_public_show_exists(target_block.show_id)
  );
$$;

create or replace function public.showscore_public_live_class_exists(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.blocks target_block
    join public.show_score_publication_states publication
      on publication.block_id = target_block.id
    where target_block.id = target_class_id
      and target_block.schedule_is_public = true
      and public.showscore_public_show_exists(target_block.show_id)
      and publication.status in ('live', 'live_no_score', 'live_scoring', 'live_finished')
  );
$$;

-- The timing functions are lengthy but their calculation is still correct.
-- Rewrite only their renamed table/column references, preserving the complete
-- calculation and its legacy response keys used by ShowScore.
do $$
declare
  function_signature text;
  function_definition text;
begin
  foreach function_signature in array array[
    'public.global_pattern_timing_stats(integer)',
    'public.public_show_timing_summary(uuid,integer)'
  ] loop
    select pg_get_functiondef(function_signature::regprocedure)
    into function_definition;

    function_definition := replace(function_definition, 'public.classes', 'public.blocks');
    function_definition := regexp_replace(function_definition, '\mclasses\.', 'blocks.', 'g');
    function_definition := replace(function_definition, 'blocks.is_public', 'blocks.schedule_is_public');
    function_definition := replace(function_definition, 'public.show_score_class_setups', 'public.show_score_block_setups');
    function_definition := replace(function_definition, 'setup.class_id', 'setup.block_id');
    function_definition := replace(function_definition, 'scoring.class_id', 'scoring.block_id');
    function_definition := replace(function_definition, 'publication.class_id', 'publication.block_id');

    execute function_definition;
  end loop;
end;
$$;

grant execute on function public.can_view_show_score_class(uuid) to authenticated;
grant execute on function public.can_manage_show_score_class(uuid, text[]) to authenticated;
grant execute on function public.can_score_show_score_class(uuid) to authenticated;
grant execute on function public.activate_show_for_scoring(uuid) to authenticated;
grant execute on function public.showscore_public_show_exists(uuid) to anon, authenticated;
grant execute on function public.showscore_public_class_exists(uuid) to anon, authenticated;
grant execute on function public.showscore_public_live_class_exists(uuid) to anon, authenticated;
grant execute on function public.global_pattern_timing_stats(integer) to authenticated;
grant execute on function public.public_show_timing_summary(uuid, integer) to anon, authenticated;

notify pgrst, 'reload schema';
