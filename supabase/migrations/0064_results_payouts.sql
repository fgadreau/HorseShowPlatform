-- Results payout snapshots.
--
-- NRHA Schedule A/B brackets are seeded from the project brief. Compare these
-- seeded values manually with /home/fgadreau/AQR/showrules.pdf before merge/push.

create table if not exists public.payout_schedules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  federation text not null default 'NRHA'
    check (federation in ('NRHA', 'AQHA', 'NSBA', 'custom')),
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (federation, name)
);

create table if not exists public.payout_schedule_brackets (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.payout_schedules(id) on delete cascade,
  min_entries integer not null check (min_entries > 0),
  max_entries integer check (max_entries is null or max_entries >= min_entries),
  place integer not null check (place > 0),
  percentage numeric(6, 3) not null check (percentage > 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_payout_schedule_brackets_schedule_id
  on public.payout_schedule_brackets(schedule_id);

create index if not exists idx_payout_schedule_brackets_entries
  on public.payout_schedule_brackets(schedule_id, min_entries, max_entries, place);

create table if not exists public.payout_calculations (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'reviewed', 'published')),
  currency text not null,
  entry_count integer not null check (entry_count >= 0),
  gross_entry_fees numeric(12, 2) not null default 0,
  trophy_or_plaque_fee numeric(12, 2) not null default 0,
  base_after_trophy_fee numeric(12, 2) not null default 0,
  nrha_fee_amount numeric(12, 2) not null default 0,
  net_entry_fee numeric(12, 2) not null default 0,
  retainage_amount numeric(12, 2) not null default 0,
  final_net_entry_fee numeric(12, 2) not null default 0,
  added_money numeric(12, 2) not null default 0,
  net_purse numeric(12, 2) not null default 0,
  payout_schedule_id uuid references public.payout_schedules(id) on delete set null,
  source_snapshot jsonb not null default '{}'::jsonb,
  result_snapshot jsonb not null default '[]'::jsonb,
  calculated_at timestamptz not null default now(),
  reviewed_at timestamptz,
  published_at timestamptz,
  calculated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, division_id)
);

create index if not exists idx_payout_calculations_show_id
  on public.payout_calculations(show_id);

create index if not exists idx_payout_calculations_division_id
  on public.payout_calculations(division_id);

create index if not exists idx_payout_calculations_status
  on public.payout_calculations(status);

create table if not exists public.payout_awards (
  id uuid primary key default gen_random_uuid(),
  calculation_id uuid not null references public.payout_calculations(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  rank integer not null check (rank > 0),
  percentage numeric(6, 3) not null default 0 check (percentage >= 0),
  amount numeric(12, 2) not null default 0 check (amount >= 0),
  payee_contact_id uuid references public.contacts(id) on delete set null,
  payee_name text,
  payee_override_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calculation_id, entry_id)
);

create index if not exists idx_payout_awards_calculation_id
  on public.payout_awards(calculation_id);

create index if not exists idx_payout_awards_entry_id
  on public.payout_awards(entry_id);

create or replace function public.set_payout_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists set_payout_schedules_updated_at_trigger on public.payout_schedules;
create trigger set_payout_schedules_updated_at_trigger
  before update on public.payout_schedules
  for each row execute function public.set_payout_updated_at();

drop trigger if exists set_payout_calculations_updated_at_trigger on public.payout_calculations;
create trigger set_payout_calculations_updated_at_trigger
  before update on public.payout_calculations
  for each row execute function public.set_payout_updated_at();

drop trigger if exists set_payout_awards_updated_at_trigger on public.payout_awards;
create trigger set_payout_awards_updated_at_trigger
  before update on public.payout_awards
  for each row execute function public.set_payout_updated_at();

insert into public.payout_schedules (id, name, federation, description, is_system)
values
  (
    '64000000-0000-0000-0000-000000000001',
    'NRHA Schedule A',
    'NRHA',
    'Official NRHA Schedule A seeded from HSP payout brief.',
    true
  ),
  (
    '64000000-0000-0000-0000-000000000002',
    'NRHA Schedule B',
    'NRHA',
    'Official NRHA Schedule B seeded from HSP payout brief.',
    true
  )
on conflict (federation, name) do update
set description = excluded.description,
    is_system = excluded.is_system,
    updated_at = now();

delete from public.payout_schedule_brackets bracket
using public.payout_schedules schedule
where bracket.schedule_id = schedule.id
  and schedule.federation = 'NRHA'
  and schedule.name in ('NRHA Schedule A', 'NRHA Schedule B');

with seeded_brackets(schedule_name, bracket_index, min_entries, max_entries, percentages) as (
  values
    ('NRHA Schedule A', 1, 1, 1, array[100]::numeric[]),
    ('NRHA Schedule A', 2, 2, 5, array[60,40]::numeric[]),
    ('NRHA Schedule A', 3, 6, 9, array[45,35,20]::numeric[]),
    ('NRHA Schedule A', 4, 10, 13, array[40,30,20,10]::numeric[]),
    ('NRHA Schedule A', 5, 14, 18, array[34,27,20,10,9]::numeric[]),
    ('NRHA Schedule A', 6, 19, 24, array[32,22,19,10,9,8]::numeric[]),
    ('NRHA Schedule A', 7, 25, 28, array[28,22,17,10,9,8,6]::numeric[]),
    ('NRHA Schedule A', 8, 29, 32, array[26,22,14,10,9,8,6,5]::numeric[]),
    ('NRHA Schedule A', 9, 33, 36, array[25,20,13,10,9,8,6,5,4]::numeric[]),
    ('NRHA Schedule A', 10, 37, 40, array[25,18,13,10,9,7,6,5,4,3.5]::numeric[]),
    ('NRHA Schedule A', 11, 41, 44, array[25,17,12,9.5,8.5,7,6,5,4,3.5,3]::numeric[]),
    ('NRHA Schedule A', 12, 45, 48, array[23,17,12,9,8,7,6,5,4,3.5,3,2.5]::numeric[]),
    ('NRHA Schedule A', 13, 49, 52, array[23,16,11,9,8,7,6,5,4,3.5,3,2.5,2]::numeric[]),
    ('NRHA Schedule A', 14, 53, 60, array[23,15,10.5,9,8,7,6,5,4,3.5,3,2.5,2,1.5]::numeric[]),
    ('NRHA Schedule A', 15, 61, null, array[23,14,10.5,9,8,7,6,5,4,3.5,3,2.5,2,1.5,1]::numeric[]),
    ('NRHA Schedule B', 1, 1, 1, array[100]::numeric[]),
    ('NRHA Schedule B', 2, 2, 5, array[60,40]::numeric[]),
    ('NRHA Schedule B', 3, 6, 7, array[45,35,20]::numeric[]),
    ('NRHA Schedule B', 4, 8, 9, array[40,30,20,10]::numeric[]),
    ('NRHA Schedule B', 5, 10, 11, array[34,27,20,10,9]::numeric[]),
    ('NRHA Schedule B', 6, 12, 13, array[32,22,19,10,9,8]::numeric[]),
    ('NRHA Schedule B', 7, 14, 15, array[28,22,17,10,9,8,6]::numeric[]),
    ('NRHA Schedule B', 8, 16, 17, array[26,22,14,10,9,8,6,5]::numeric[]),
    ('NRHA Schedule B', 9, 18, 19, array[25,20,13,10,9,8,6,5,4]::numeric[]),
    ('NRHA Schedule B', 10, 20, 21, array[25,18,13,10,9,7,6,5,4,3.5]::numeric[]),
    ('NRHA Schedule B', 11, 22, 23, array[25,17,12,9.5,8.5,7,6,5,4,3.5,3]::numeric[]),
    ('NRHA Schedule B', 12, 24, 25, array[23,17,12,9,8,7,6,5,4,3.5,3,2.5]::numeric[]),
    ('NRHA Schedule B', 13, 26, 27, array[23,16,11,9,8,7,6,5,4,3.5,3,2.5,2]::numeric[]),
    ('NRHA Schedule B', 14, 28, 29, array[23,15,10.5,9,8,7,6,5,4,3.5,3,2.5,2,1.5]::numeric[]),
    ('NRHA Schedule B', 15, 30, null, array[23,14,10.5,9,8,7,6,5,4,3.5,3,2.5,2,1.5,1]::numeric[])
)
insert into public.payout_schedule_brackets (
  schedule_id,
  min_entries,
  max_entries,
  place,
  percentage
)
select
  schedule.id,
  seeded_brackets.min_entries,
  seeded_brackets.max_entries,
  percentage.ordinality::integer,
  percentage.value
from seeded_brackets
join public.payout_schedules schedule
  on schedule.federation = 'NRHA'
 and schedule.name = seeded_brackets.schedule_name
cross join lateral unnest(seeded_brackets.percentages) with ordinality as percentage(value, ordinality)
order by seeded_brackets.schedule_name, seeded_brackets.bracket_index, percentage.ordinality;

alter table public.payout_schedules enable row level security;
alter table public.payout_schedule_brackets enable row level security;
alter table public.payout_calculations enable row level security;
alter table public.payout_awards enable row level security;

drop policy if exists "Anyone can read payout schedules" on public.payout_schedules;
create policy "Anyone can read payout schedules"
  on public.payout_schedules for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can read payout schedule brackets" on public.payout_schedule_brackets;
create policy "Anyone can read payout schedule brackets"
  on public.payout_schedule_brackets for select
  to anon, authenticated
  using (true);

drop policy if exists "Staff can manage payout calculations" on public.payout_calculations;
create policy "Staff can manage payout calculations"
  on public.payout_calculations for all
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Public can read published payout calculations" on public.payout_calculations;
create policy "Public can read published payout calculations"
  on public.payout_calculations for select
  to anon, authenticated
  using (
    status = 'published'
    and exists (
      select 1
      from public.shows show
      where show.id = payout_calculations.show_id
        and show.is_public = true
    )
  );

drop policy if exists "Staff can manage payout awards" on public.payout_awards;
create policy "Staff can manage payout awards"
  on public.payout_awards for all
  to authenticated
  using (
    exists (
      select 1
      from public.payout_calculations calculation
      where calculation.id = payout_awards.calculation_id
        and public.can_manage_show(calculation.show_id, array['organizer', 'secretary'])
    )
  )
  with check (
    exists (
      select 1
      from public.payout_calculations calculation
      where calculation.id = payout_awards.calculation_id
        and public.can_manage_show(calculation.show_id, array['organizer', 'secretary'])
    )
  );

drop policy if exists "Public can read published payout awards" on public.payout_awards;
create policy "Public can read published payout awards"
  on public.payout_awards for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.payout_calculations calculation
      join public.shows show on show.id = calculation.show_id
      where calculation.id = payout_awards.calculation_id
        and calculation.status = 'published'
        and show.is_public = true
    )
  );

grant select on public.payout_schedules to anon, authenticated;
grant select on public.payout_schedule_brackets to anon, authenticated;
grant select, insert, update, delete on public.payout_calculations to authenticated;
grant select on public.payout_calculations to anon;
grant select, insert, update, delete on public.payout_awards to authenticated;
grant select on public.payout_awards to anon;

notify pgrst, 'reload schema';
