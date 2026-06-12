-- Public read access for ShowScore's public view + analytics stub

-- ─── 1. Public read on organizations (associations view) ─────────────────────
drop policy if exists "Anyone can view organizations" on public.organizations;
create policy "Anyone can view organizations"
  on public.organizations for select
  using (true);

-- ─── 2. Public read on shows (is_public ones) ────────────────────────────────
drop policy if exists "Anyone can view public shows" on public.shows;
create policy "Anyone can view public shows"
  on public.shows for select
  using (is_public = true);

-- ─── 3. Public read on show_days (days view) for public shows ────────────────
drop policy if exists "Anyone can view days of public shows" on public.show_days;
create policy "Anyone can view days of public shows"
  on public.show_days for select
  using (
    exists (
      select 1 from public.shows s
      where s.id = show_days.show_id and s.is_public = true
    )
  );

-- ─── 4. Public read on classes for public shows ──────────────────────────────
drop policy if exists "Anyone can view classes of public shows" on public.classes;
create policy "Anyone can view classes of public shows"
  on public.classes for select
  using (
    exists (
      select 1 from public.shows s
      where s.id = classes.show_id and s.is_public = true
    )
  );

-- ─── 5. Public read on show_score_class_setups for public shows ──────────────
drop policy if exists "Anyone can view class setups of public shows" on public.show_score_class_setups;
create policy "Anyone can view class setups of public shows"
  on public.show_score_class_setups for select
  using (
    exists (
      select 1 from public.classes c
      join public.shows s on s.id = c.show_id
      where c.id = show_score_class_setups.class_id and s.is_public = true
    )
  );

-- ─── 6. Public read on show_score_official_results for public shows ───────────
drop policy if exists "Anyone can view official results of public shows" on public.show_score_official_results;
create policy "Anyone can view official results of public shows"
  on public.show_score_official_results for select
  using (
    exists (
      select 1 from public.classes c
      join public.shows s on s.id = c.show_id
      where c.id = show_score_official_results.class_id and s.is_public = true
    )
  );

-- ─── 7. Public read on show_score_publication_states ─────────────────────────
drop policy if exists "Anyone can view publication states of public shows" on public.show_score_publication_states;
create policy "Anyone can view publication states of public shows"
  on public.show_score_publication_states for select
  using (
    exists (
      select 1 from public.classes c
      join public.shows s on s.id = c.show_id
      where c.id = show_score_publication_states.class_id and s.is_public = true
    )
  );

-- ─── 8. record_app_event RPC stub ────────────────────────────────────────────
create or replace function public.record_app_event(
  target_event_type text default null,
  target_event_name text default null,
  target_association_id text default null,
  target_show_id text default null,
  target_day_id text default null,
  target_class_id text default null,
  target_session_id text default null,
  target_path text default null,
  target_user_agent text default null,
  target_locale text default null,
  target_timezone text default null,
  target_metadata jsonb default null
)
returns text
language plpgsql security definer as $$
begin
  -- Stub: silently accepts ShowScore analytics events without storing them.
  -- Replace with real implementation if analytics tracking is needed later.
  return gen_random_uuid()::text;
end;
$$;
