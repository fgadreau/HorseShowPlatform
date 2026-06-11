alter table public.user_profiles
add column if not exists date_of_birth date,
add column if not exists address_line2 varchar(255),
add column if not exists preferred_locale varchar(5) not null default 'fr',
add column if not exists marketing_opt_in boolean not null default false;
