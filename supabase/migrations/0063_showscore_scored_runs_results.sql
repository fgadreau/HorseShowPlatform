-- ShowScore scored-run result bridge.
--
-- ShowScore writes one batch to scored_runs only after a block is officially
-- validated. HSP fans that run-level result out to every entry tied to the
-- physical run.

create table if not exists public.scored_runs (
  run_id uuid primary key,
  show_id uuid not null references public.shows(id) on delete cascade,
  back_number text,
  rider_id uuid references public.contacts(id) on delete set null,
  horse_id uuid references public.horses(id) on delete set null,
  owner_id uuid references public.contacts(id) on delete set null,
  scored_at timestamptz not null default now(),
  status text not null check (status in ('scored', 'scratch', 'no_score', 'disqualified')),
  final_score numeric(8, 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'scored' and final_score is not null)
    or (status <> 'scored' and final_score is null)
  )
);

create table if not exists public.block_run_entries (
  block_run_id uuid primary key,
  run_id uuid not null,
  show_id uuid not null references public.shows(id) on delete cascade,
  block_id uuid not null references public.classes(id) on delete cascade,
  order_of_go numeric(8, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, run_id)
);

create table if not exists public.block_run_class_entries (
  block_run_id uuid not null references public.block_run_entries(block_run_id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (block_run_id, entry_id)
);

create table if not exists public.entry_results (
  entry_id uuid primary key references public.entries(id) on delete cascade,
  run_id uuid not null references public.scored_runs(run_id) on delete cascade,
  block_run_id uuid not null references public.block_run_entries(block_run_id) on delete cascade,
  block_id uuid not null references public.classes(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  final_score numeric(8, 3),
  status text not null check (status in ('scored', 'scratch', 'no_score', 'disqualified')),
  synced_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'scored' and final_score is not null)
    or (status <> 'scored' and final_score is null)
  )
);

create index if not exists idx_scored_runs_show_id
  on public.scored_runs(show_id);

create index if not exists idx_block_run_entries_show_id
  on public.block_run_entries(show_id);

create index if not exists idx_block_run_entries_run_id
  on public.block_run_entries(run_id);

create index if not exists idx_block_run_entries_block_id
  on public.block_run_entries(block_id);

create index if not exists idx_block_run_class_entries_entry_id
  on public.block_run_class_entries(entry_id);

create index if not exists idx_entry_results_show_id
  on public.entry_results(show_id);

create index if not exists idx_entry_results_block_id
  on public.entry_results(block_id);

create index if not exists idx_entry_results_division_id
  on public.entry_results(division_id);

create or replace function public.set_scored_runs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_scored_runs_updated_at_trigger on public.scored_runs;
create trigger set_scored_runs_updated_at_trigger
  before update on public.scored_runs
  for each row execute function public.set_scored_runs_updated_at();

create or replace function public.set_block_run_entries_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_block_run_entries_updated_at_trigger on public.block_run_entries;
create trigger set_block_run_entries_updated_at_trigger
  before update on public.block_run_entries
  for each row execute function public.set_block_run_entries_updated_at();

create or replace function public.sync_entry_results_for_scored_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entry_results (
    entry_id,
    run_id,
    block_run_id,
    block_id,
    division_id,
    show_id,
    final_score,
    status,
    synced_at,
    updated_at
  )
  select
    link.entry_id,
    new.run_id,
    block_run.block_run_id,
    block_run.block_id,
    entry.division_id,
    new.show_id,
    new.final_score,
    new.status,
    now(),
    now()
  from public.block_run_entries block_run
  join public.block_run_class_entries link
    on link.block_run_id = block_run.block_run_id
  join public.entries entry
    on entry.id = link.entry_id
  where block_run.run_id = new.run_id
    and entry.show_id = new.show_id
  on conflict (entry_id) do update set
    run_id = excluded.run_id,
    block_run_id = excluded.block_run_id,
    block_id = excluded.block_id,
    division_id = excluded.division_id,
    show_id = excluded.show_id,
    final_score = excluded.final_score,
    status = excluded.status,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_entry_results_for_scored_run_trigger on public.scored_runs;
create trigger sync_entry_results_for_scored_run_trigger
  after insert or update of status, final_score, scored_at on public.scored_runs
  for each row execute function public.sync_entry_results_for_scored_run();

create or replace function public.sync_entry_result_for_block_run_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entry_results (
    entry_id,
    run_id,
    block_run_id,
    block_id,
    division_id,
    show_id,
    final_score,
    status,
    synced_at,
    updated_at
  )
  select
    new.entry_id,
    scored_run.run_id,
    block_run.block_run_id,
    block_run.block_id,
    entry.division_id,
    scored_run.show_id,
    scored_run.final_score,
    scored_run.status,
    now(),
    now()
  from public.block_run_entries block_run
  join public.scored_runs scored_run
    on scored_run.run_id = block_run.run_id
  join public.entries entry
    on entry.id = new.entry_id
  where block_run.block_run_id = new.block_run_id
    and entry.show_id = scored_run.show_id
  on conflict (entry_id) do update set
    run_id = excluded.run_id,
    block_run_id = excluded.block_run_id,
    block_id = excluded.block_id,
    division_id = excluded.division_id,
    show_id = excluded.show_id,
    final_score = excluded.final_score,
    status = excluded.status,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

drop trigger if exists sync_entry_result_for_block_run_link_trigger on public.block_run_class_entries;
create trigger sync_entry_result_for_block_run_link_trigger
  after insert or update of block_run_id, entry_id on public.block_run_class_entries
  for each row execute function public.sync_entry_result_for_block_run_link();

alter table public.scored_runs enable row level security;
alter table public.block_run_entries enable row level security;
alter table public.block_run_class_entries enable row level security;
alter table public.entry_results enable row level security;

drop policy if exists "Staff can view scored runs" on public.scored_runs;
create policy "Staff can view scored runs"
  on public.scored_runs for select
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can write scored runs" on public.scored_runs;
create policy "Staff can write scored runs"
  on public.scored_runs for all
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can view block run entries" on public.block_run_entries;
create policy "Staff can view block run entries"
  on public.block_run_entries for select
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can write block run entries" on public.block_run_entries;
create policy "Staff can write block run entries"
  on public.block_run_entries for all
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can view block run class entries" on public.block_run_class_entries;
create policy "Staff can view block run class entries"
  on public.block_run_class_entries for select
  to authenticated
  using (
    exists (
      select 1
      from public.block_run_entries block_run
      where block_run.block_run_id = block_run_class_entries.block_run_id
        and public.can_manage_show(block_run.show_id, array['organizer', 'secretary'])
    )
  );

drop policy if exists "Staff can write block run class entries" on public.block_run_class_entries;
create policy "Staff can write block run class entries"
  on public.block_run_class_entries for all
  to authenticated
  using (
    exists (
      select 1
      from public.block_run_entries block_run
      where block_run.block_run_id = block_run_class_entries.block_run_id
        and public.can_manage_show(block_run.show_id, array['organizer', 'secretary'])
    )
  )
  with check (
    exists (
      select 1
      from public.block_run_entries block_run
      where block_run.block_run_id = block_run_class_entries.block_run_id
        and public.can_manage_show(block_run.show_id, array['organizer', 'secretary'])
    )
  );

drop policy if exists "Staff can view entry results" on public.entry_results;
create policy "Staff can view entry results"
  on public.entry_results for select
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can write entry results" on public.entry_results;
create policy "Staff can write entry results"
  on public.entry_results for all
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show(show_id, array['organizer', 'secretary']));

grant select, insert, update, delete on public.scored_runs to authenticated;
grant select, insert, update, delete on public.block_run_entries to authenticated;
grant select, insert, update, delete on public.block_run_class_entries to authenticated;
grant select, insert, update, delete on public.entry_results to authenticated;

notify pgrst, 'reload schema';
