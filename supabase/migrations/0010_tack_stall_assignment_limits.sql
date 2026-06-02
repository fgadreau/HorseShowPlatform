alter table public.stall_options
add column if not exists requires_horse_assignment boolean not null default true,
add column if not exists limit_per_horse_stalls smallint check (limit_per_horse_stalls is null or limit_per_horse_stalls > 0);

update public.stall_options
set requires_horse_assignment = false
where category = 'stall'
  and (
    name ilike '%tack%'
    or coalesce(description, '') ilike '%tack%'
  );

update public.stall_options
set limit_per_horse_stalls = null
where requires_horse_assignment = true;
