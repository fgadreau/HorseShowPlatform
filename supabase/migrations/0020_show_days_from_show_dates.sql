create or replace function public.ensure_show_days_from_show_dates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.show_days (
    organization_id,
    show_id,
    day_date,
    day_name,
    day_number,
    sort_order
  )
  select
    new.organization_id,
    new.id,
    generated_day.day_date::date,
    'Day ' || generated_day.ordinality,
    generated_day.ordinality,
    generated_day.ordinality
  from generate_series(new.start_date, new.end_date, interval '1 day') with ordinality as generated_day(day_date, ordinality)
  on conflict (show_id, day_date) do nothing;

  return new;
end;
$$;

drop trigger if exists shows_ensure_show_days on public.shows;
create trigger shows_ensure_show_days
after insert or update of start_date, end_date on public.shows
for each row execute function public.ensure_show_days_from_show_dates();

insert into public.show_days (
  organization_id,
  show_id,
  day_date,
  day_name,
  day_number,
  sort_order
)
select
  shows.organization_id,
  shows.id,
  generated_day.day_date::date,
  'Day ' || generated_day.ordinality,
  generated_day.ordinality,
  generated_day.ordinality
from public.shows
cross join lateral generate_series(shows.start_date, shows.end_date, interval '1 day') with ordinality as generated_day(day_date, ordinality)
on conflict (show_id, day_date) do nothing;
