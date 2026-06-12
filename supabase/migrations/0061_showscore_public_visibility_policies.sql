-- Align ShowScore public showcase visibility with HSP's canonical schema.
-- Public access remains limited to open shows with an explicit public signal.

alter table public.show_score_publication_states
  drop constraint if exists show_score_publication_states_status_check;

alter table public.show_score_publication_states
  add constraint show_score_publication_states_status_check
  check (
    status in (
      'hidden',
      'live',
      'live_no_score',
      'live_scoring',
      'live_finished',
      'pending_review',
      'official',
      'published'
    )
  );

create or replace function public.showscore_public_show_exists(
  target_show_id uuid
)
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
          from public.classes public_class
          join public.show_score_publication_states publication
            on publication.class_id = public_class.id
          where public_class.show_id = target_show.id
            and public_class.is_public = true
            and publication.status in (
              'live',
              'live_no_score',
              'live_scoring',
              'live_finished',
              'official',
              'published'
            )
        )
        or exists (
          select 1
          from public.classes result_class
          join public.class_result_publications result_publication
            on result_publication.class_id = result_class.id
          where result_class.show_id = target_show.id
            and result_class.is_public = true
            and result_publication.status = 'published'
        )
      )
  )
$$;

create or replace function public.showscore_public_class_exists(
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes target_class
    where target_class.id = target_class_id
      and target_class.is_public = true
      and public.showscore_public_show_exists(target_class.show_id)
  )
$$;

create or replace function public.showscore_public_live_class_exists(
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes target_class
    join public.show_score_publication_states publication
      on publication.class_id = target_class.id
    where target_class.id = target_class_id
      and target_class.is_public = true
      and public.showscore_public_show_exists(target_class.show_id)
      and publication.status in (
        'live',
        'live_no_score',
        'live_scoring',
        'live_finished'
      )
  )
$$;

grant execute on function public.showscore_public_show_exists(uuid)
to anon, authenticated;

grant execute on function public.showscore_public_class_exists(uuid)
to anon, authenticated;

grant execute on function public.showscore_public_live_class_exists(uuid)
to anon, authenticated;

drop policy if exists "ShowScore public can view visible shows" on public.shows;
create policy "ShowScore public can view visible shows"
  on public.shows for select
  to anon, authenticated
  using (public.showscore_public_show_exists(id));

drop policy if exists "ShowScore public can view visible show days" on public.show_days;
create policy "ShowScore public can view visible show days"
  on public.show_days for select
  to anon, authenticated
  using (public.showscore_public_show_exists(show_id));

drop policy if exists "ShowScore public can view visible classes" on public.classes;
create policy "ShowScore public can view visible classes"
  on public.classes for select
  to anon, authenticated
  using (
    is_public = true
    and public.showscore_public_show_exists(show_id)
  );

drop policy if exists "ShowScore public can view visible class setups" on public.show_score_class_setups;
create policy "ShowScore public can view visible class setups"
  on public.show_score_class_setups for select
  to anon, authenticated
  using (public.showscore_public_class_exists(class_id));

drop policy if exists "ShowScore public can view visible publication states" on public.show_score_publication_states;
create policy "ShowScore public can view visible publication states"
  on public.show_score_publication_states for select
  to anon, authenticated
  using (
    status in (
      'live',
      'live_no_score',
      'live_scoring',
      'live_finished',
      'official',
      'published'
    )
    and public.showscore_public_class_exists(class_id)
  );

drop policy if exists "ShowScore public can view visible official results" on public.show_score_official_results;
create policy "ShowScore public can view visible official results"
  on public.show_score_official_results for select
  to anon, authenticated
  using (
    finalized = true
    and exists (
      select 1
      from public.show_score_publication_states publication
      where publication.class_id = show_score_official_results.class_id
        and publication.status in ('official', 'published')
    )
    and public.showscore_public_class_exists(class_id)
  );

drop policy if exists "ShowScore public can view visible scoring sessions" on public.show_score_scoring_sessions;
create policy "ShowScore public can view visible scoring sessions"
  on public.show_score_scoring_sessions for select
  to anon, authenticated
  using (public.showscore_public_live_class_exists(class_id));

drop policy if exists "ShowScore public can view visible judge sessions" on public.show_score_judge_sessions;
create policy "ShowScore public can view visible judge sessions"
  on public.show_score_judge_sessions for select
  to anon, authenticated
  using (public.showscore_public_live_class_exists(class_id));

drop policy if exists "ShowScore public can view visible paid warmups" on public.show_score_paid_warmups;
create policy "ShowScore public can view visible paid warmups"
  on public.show_score_paid_warmups for select
  to anon, authenticated
  using (
    is_public_live = true
    and public.showscore_public_show_exists(show_id)
  );

drop policy if exists "public can read published class_result_publications" on public.class_result_publications;
drop policy if exists "ShowScore public can view published class result publications" on public.class_result_publications;
create policy "ShowScore public can view published class result publications"
  on public.class_result_publications for select
  to anon, authenticated
  using (
    status = 'published'
    and public.showscore_public_class_exists(class_id)
  );

notify pgrst, 'reload schema';
