-- ShowScore public and authenticated timing RPCs on the canonical HSP schema.
-- These are the HSP-adapted versions from ShowScore's shared compatibility SQL.

create or replace function public.global_pattern_timing_stats(
  min_duration_seconds integer default 60
)
returns table (
  pattern text,
  class_count bigint,
  run_count bigint,
  timed_run_count bigint,
  average_run_seconds numeric,
  median_run_seconds numeric
) as $$
  with run_durations as (
    select
      coalesce(
        nullif(btrim(setup.pattern), ''),
        nullif(btrim(classes.pattern), ''),
        'Sans pattern'
      ) as pattern,
      classes.id as class_id,
      case
        when run.value ? 'durationSeconds'
          and nullif(run.value->>'durationSeconds', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (run.value->>'durationSeconds')::numeric
        when run.value ? 'startedAt'
          and run.value ? 'completedAt'
          and nullif(run.value->>'startedAt', '') is not null
          and nullif(run.value->>'completedAt', '') is not null
          then extract(
            epoch from (
              (run.value->>'completedAt')::timestamptz
              - (run.value->>'startedAt')::timestamptz
            )
          )
        else null
      end as duration_seconds
    from public.classes
    left join public.show_score_class_setups setup on setup.class_id = classes.id
    join public.show_score_scoring_sessions scoring on scoring.class_id = classes.id
    cross join lateral jsonb_array_elements(
      coalesce(scoring.runs, '[]'::jsonb)
    ) as run(value)
  )
  select
    run_durations.pattern,
    count(distinct run_durations.class_id) as class_count,
    count(*) as run_count,
    count(*) filter (
      where run_durations.duration_seconds >= greatest(min_duration_seconds, 0)
        and run_durations.duration_seconds <= 540
    ) as timed_run_count,
    avg(run_durations.duration_seconds) filter (
      where run_durations.duration_seconds >= greatest(min_duration_seconds, 0)
        and run_durations.duration_seconds <= 540
    ) as average_run_seconds,
    percentile_cont(0.5) within group (
      order by run_durations.duration_seconds
    ) filter (
      where run_durations.duration_seconds >= greatest(min_duration_seconds, 0)
        and run_durations.duration_seconds <= 540
    ) as median_run_seconds
  from run_durations
  group by run_durations.pattern
  having count(*) filter (
    where run_durations.duration_seconds >= greatest(min_duration_seconds, 0)
      and run_durations.duration_seconds <= 540
  ) > 0
  order by run_durations.pattern;
$$ language sql stable security definer set search_path = public;

grant execute on function public.global_pattern_timing_stats(integer)
to authenticated;

drop function if exists public.public_show_timing_summary(text, integer);
drop function if exists public.public_show_timing_summary(uuid, integer);

create or replace function public.public_show_timing_summary(
  target_show_id uuid,
  min_duration_seconds integer default 60
)
returns table (
  class_id uuid,
  day_id uuid,
  class_estimated_end_at timestamptz,
  day_estimated_end_at timestamptz,
  class_remaining_seconds numeric,
  day_remaining_seconds numeric,
  class_remaining_runs integer,
  day_remaining_runs integer,
  is_drag_due boolean,
  drag_started_at timestamptz,
  drag_duration_minutes integer,
  drag_remaining_seconds numeric,
  estimated_at timestamptz
) as $$
  with run_durations as (
    select
      coalesce(
        nullif(btrim(setup.pattern), ''),
        nullif(btrim(classes.pattern), ''),
        'Sans pattern'
      ) as pattern,
      case
        when run.value ? 'durationSeconds'
          and nullif(run.value->>'durationSeconds', '') ~ '^[0-9]+(\.[0-9]+)?$'
          then (run.value->>'durationSeconds')::numeric
        when run.value ? 'startedAt'
          and run.value ? 'completedAt'
          and nullif(run.value->>'startedAt', '') is not null
          and nullif(run.value->>'completedAt', '') is not null
          then extract(
            epoch from (
              (run.value->>'completedAt')::timestamptz
              - (run.value->>'startedAt')::timestamptz
            )
          )
        else null
      end as duration_seconds
    from public.classes
    left join public.show_score_class_setups setup on setup.class_id = classes.id
    join public.show_score_scoring_sessions scoring on scoring.class_id = classes.id
    join public.shows duration_shows
      on duration_shows.id = classes.show_id
     and duration_shows.status = 'open'
     and (
       duration_shows.is_public = true
       or duration_shows.show_schedule_public = true
       or duration_shows.show_draw_public = true
       or duration_shows.show_results_public = true
       or duration_shows.is_livestream_public = true
     )
    cross join lateral jsonb_array_elements(
      coalesce(scoring.runs, '[]'::jsonb)
    ) as run(value)
  ),
  pattern_averages as (
    select
      pattern,
      avg(duration_seconds) filter (
        where duration_seconds >= greatest(min_duration_seconds, 0)
          and duration_seconds <= 540
      ) as average_run_seconds
    from run_durations
    group by pattern
  ),
  class_metrics as (
    select
      classes.id,
      classes.show_day_id,
      classes.sort_order,
      coalesce(
        nullif(btrim(setup.pattern), ''),
        nullif(btrim(classes.pattern), ''),
        'Sans pattern'
      ) as pattern,
      case
        when setup.drag_interval is not null and setup.drag_interval > 0
          then setup.drag_interval
        else null
      end as drag_interval,
      greatest(coalesce(setup.drag_duration_minutes, 8), 0) as drag_duration_minutes,
      greatest(
        jsonb_array_length(coalesce(scoring.runs, '[]'::jsonb)),
        jsonb_array_length(coalesce(setup.runs, '[]'::jsonb))
      ) as run_count,
      completed.completed_runs,
      completed.last_completed_at,
      class_average.average_run_seconds as class_average_run_seconds,
      pattern_averages.average_run_seconds as pattern_average_run_seconds,
      (
        scoring.active_manoeuvre is not null
        or exists (
          select 1
          from jsonb_array_elements(coalesce(scoring.runs, '[]'::jsonb)) as active_run(value)
          where active_run.value->>'isActive' = 'true'
        )
      ) as has_active_manoeuvre
    from public.classes
    join public.shows target_show
      on target_show.id = classes.show_id
     and target_show.status = 'open'
     and (
       target_show.is_public = true
       or target_show.show_schedule_public = true
       or target_show.show_draw_public = true
       or target_show.show_results_public = true
       or target_show.is_livestream_public = true
     )
    left join public.show_score_class_setups setup on setup.class_id = classes.id
    left join public.show_score_scoring_sessions scoring on scoring.class_id = classes.id
    left join pattern_averages on pattern_averages.pattern = coalesce(
      nullif(btrim(setup.pattern), ''),
      nullif(btrim(classes.pattern), ''),
      'Sans pattern'
    )
    cross join lateral (
      select
        count(*)::integer as completed_runs,
        max(
          case
            when nullif(run.value->>'completedAt', '') is not null
              then (run.value->>'completedAt')::timestamptz
            else null
          end
        ) as last_completed_at
      from jsonb_array_elements(coalesce(scoring.runs, '[]'::jsonb)) as run(value)
      where nullif(btrim(run.value->>'scoreTotal'), '') is not null
        and btrim(run.value->>'scoreTotal') <> 'Review'
    ) completed
    cross join lateral (
      select avg(duration_seconds) filter (
        where duration_seconds >= greatest(min_duration_seconds, 0)
          and duration_seconds <= 540
      ) as average_run_seconds
      from (
        select
          case
            when run.value ? 'durationSeconds'
              and nullif(run.value->>'durationSeconds', '') ~ '^[0-9]+(\.[0-9]+)?$'
              then (run.value->>'durationSeconds')::numeric
            when run.value ? 'startedAt'
              and run.value ? 'completedAt'
              and nullif(run.value->>'startedAt', '') is not null
              and nullif(run.value->>'completedAt', '') is not null
              then extract(
                epoch from (
                  (run.value->>'startedAt')::timestamptz
                  - (run.value->>'completedAt')::timestamptz
                )
              ) * -1
            else null
          end as duration_seconds
        from jsonb_array_elements(coalesce(scoring.runs, '[]'::jsonb)) as run(value)
      ) durations
    ) class_average
    where classes.show_id = target_show_id
      and classes.is_public = true
  ),
  class_estimates as (
    select
      class_metrics.*,
      coalesce(
        class_metrics.class_average_run_seconds,
        class_metrics.pattern_average_run_seconds
      ) as average_run_seconds,
      greatest(class_metrics.run_count - class_metrics.completed_runs, 0) as remaining_runs,
      case
        when class_metrics.drag_interval is null then 0
        else greatest(
          floor(greatest(class_metrics.run_count - 1, 0)::numeric / class_metrics.drag_interval)
          - floor(greatest(class_metrics.completed_runs - 1, 0)::numeric / class_metrics.drag_interval),
          0
        )::integer
      end as remaining_drag_breaks
    from class_metrics
  ),
  class_remaining as (
    select
      class_estimates.*,
      case
        when class_estimates.remaining_runs > 0
          and class_estimates.average_run_seconds is null
          then null
        else
          class_estimates.remaining_runs * coalesce(class_estimates.average_run_seconds, 0)
          + class_estimates.remaining_drag_breaks
            * class_estimates.drag_duration_minutes
            * 60
      end as remaining_seconds
    from class_estimates
  ),
  live_classes as (
    select
      class_remaining.*,
      row_number() over (
        order by
          class_remaining.has_active_manoeuvre desc,
          class_remaining.sort_order,
          class_remaining.id
      ) as live_rank
    from class_remaining
    join public.show_score_publication_states publication
      on publication.class_id = class_remaining.id
     and publication.status in (
       'live',
       'live_no_score',
       'live_scoring',
       'live_finished'
     )
  ),
  day_remaining as (
    select
      live_classes.id as live_class_id,
      sum(class_remaining.remaining_runs)::integer as day_remaining_runs,
      case
        when bool_or(
          class_remaining.remaining_runs > 0
          and class_remaining.remaining_seconds is null
        ) then null
        else sum(coalesce(class_remaining.remaining_seconds, 0))
      end as day_remaining_seconds
    from live_classes
    join class_remaining
      on class_remaining.show_day_id = live_classes.show_day_id
     and class_remaining.sort_order >= live_classes.sort_order
    group by live_classes.id
  )
  select
    live_classes.id as class_id,
    live_classes.show_day_id as day_id,
    case
      when live_classes.remaining_seconds is null then null
      else now() + make_interval(secs => live_classes.remaining_seconds::double precision)
    end as class_estimated_end_at,
    case
      when day_remaining.day_remaining_seconds is null then null
      else now() + make_interval(secs => day_remaining.day_remaining_seconds::double precision)
    end as day_estimated_end_at,
    live_classes.remaining_seconds as class_remaining_seconds,
    day_remaining.day_remaining_seconds,
    live_classes.remaining_runs as class_remaining_runs,
    day_remaining.day_remaining_runs,
    (
      live_classes.drag_interval is not null
      and live_classes.completed_runs > 0
      and live_classes.completed_runs < live_classes.run_count
      and live_classes.completed_runs % live_classes.drag_interval = 0
      and live_classes.has_active_manoeuvre is false
    ) as is_drag_due,
    case
      when live_classes.drag_interval is not null
        and live_classes.completed_runs > 0
        and live_classes.completed_runs < live_classes.run_count
        and live_classes.completed_runs % live_classes.drag_interval = 0
        and live_classes.has_active_manoeuvre is false
        then live_classes.last_completed_at
      else null
    end as drag_started_at,
    live_classes.drag_duration_minutes,
    case
      when live_classes.drag_interval is not null
        and live_classes.completed_runs > 0
        and live_classes.completed_runs < live_classes.run_count
        and live_classes.completed_runs % live_classes.drag_interval = 0
        and live_classes.has_active_manoeuvre is false
        and live_classes.last_completed_at is not null
        then greatest(
          live_classes.drag_duration_minutes * 60
          - extract(epoch from (now() - live_classes.last_completed_at)),
          0
        )
      else null
    end as drag_remaining_seconds,
    now() as estimated_at
  from live_classes
  join day_remaining on day_remaining.live_class_id = live_classes.id
  order by live_classes.live_rank;
$$ language sql stable security definer set search_path = public;

grant execute on function public.public_show_timing_summary(uuid, integer)
to anon, authenticated;

notify pgrst, 'reload schema';
