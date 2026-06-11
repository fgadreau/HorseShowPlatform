alter table public.classes
add column if not exists is_event_block boolean not null default false;
