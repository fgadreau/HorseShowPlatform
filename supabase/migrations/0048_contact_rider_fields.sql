alter table public.contacts
add column if not exists date_of_birth date,
add column if not exists address_line2 varchar(255);
