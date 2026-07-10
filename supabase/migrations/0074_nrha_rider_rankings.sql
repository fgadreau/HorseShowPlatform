create table if not exists public.nrha_rider_rankings (
  id uuid primary key default gen_random_uuid(),
  eligibility_year integer not null check (eligibility_year between 2000 and 2100),
  source_year integer check (source_year between 2000 and 2100),
  list_type varchar(80) not null check (list_type in ('top_professional_riders', 'top_200_non_pro_riders', 'top_200_lifetime_all_riders')),
  rank integer not null check (rank > 0),
  rider_name text not null,
  rider_name_normalized text not null,
  rider_name_match_key text not null,
  earnings numeric(14, 2),
  applies_to_categories integer[] not null default array[2, 6],
  source_file_name text,
  source_payload jsonb not null default '{}'::jsonb,
  imported_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (eligibility_year, list_type, rank),
  unique (eligibility_year, list_type, rider_name_normalized)
);

create index if not exists idx_nrha_rider_rankings_lookup
on public.nrha_rider_rankings(eligibility_year, list_type, rider_name_normalized);

create index if not exists idx_nrha_rider_rankings_match_key
on public.nrha_rider_rankings(eligibility_year, list_type, rider_name_match_key);

create index if not exists idx_nrha_rider_rankings_categories
on public.nrha_rider_rankings using gin(applies_to_categories);

drop trigger if exists nrha_rider_rankings_touch_updated_at on public.nrha_rider_rankings;
create trigger nrha_rider_rankings_touch_updated_at
before update on public.nrha_rider_rankings
for each row execute function public.touch_updated_at();

alter table public.nrha_rider_rankings enable row level security;

drop policy if exists "Authenticated users can view NRHA rider rankings" on public.nrha_rider_rankings;
create policy "Authenticated users can view NRHA rider rankings"
  on public.nrha_rider_rankings for select
  using (auth.uid() is not null);

drop policy if exists "Platform admins manage NRHA rider rankings" on public.nrha_rider_rankings;
create policy "Platform admins manage NRHA rider rankings"
  on public.nrha_rider_rankings for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());
