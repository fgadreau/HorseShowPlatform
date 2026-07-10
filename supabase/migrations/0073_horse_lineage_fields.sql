alter table public.horses
add column if not exists sire_name varchar(255),
add column if not exists dam_name varchar(255);
