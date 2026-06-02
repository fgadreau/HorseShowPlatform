alter table public.classes
add column if not exists nrha_slate_number text;

create index if not exists idx_classes_nrha_slate_number
on public.classes(show_id, nrha_slate_number)
where nrha_slate_number is not null;
