alter table public.classes
add column if not exists schedule_start_mode text not null default 'unscheduled';

alter table public.classes
drop constraint if exists classes_schedule_start_mode_check;

alter table public.classes
add constraint classes_schedule_start_mode_check
check (schedule_start_mode in ('fixed', 'after_previous', 'unscheduled'));

update public.classes
set schedule_start_mode = 'fixed'
where scheduled_time is not null
  and schedule_start_mode = 'unscheduled';

create index if not exists idx_classes_day_schedule_start
on public.classes(show_id, show_day_id, schedule_start_mode, scheduled_time, sort_order);
