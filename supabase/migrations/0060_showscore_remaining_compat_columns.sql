-- Remaining ShowScore compatibility columns on the canonical HSP schema.
-- These keep existing ShowScore client code working while standalone fallbacks
-- are removed from the application layer.

alter table public.shows
  add column if not exists user_id uuid;

alter table public.show_days
  add column if not exists user_id uuid;

alter table public.classes
  add column if not exists user_id uuid;

alter table public.user_profiles
  add column if not exists email text;

alter table public.platform_admins
  add column if not exists email text;

alter table public.show_score_class_setups
  add column if not exists final_pdf_file_name text,
  add column if not exists user_id uuid;

alter table public.show_score_publication_states
  add column if not exists published_by text;

update public.user_profiles profile
set email = coalesce(nullif(profile.email, ''), auth_user.email)
from auth.users auth_user
where auth_user.id = profile.user_id
  and nullif(profile.email, '') is null;

update public.platform_admins admin
set email = coalesce(nullif(admin.email, ''), profile.email)
from public.user_profiles profile
where profile.id = admin.user_id
  and nullif(admin.email, '') is null
  and nullif(profile.email, '') is not null;

notify pgrst, 'reload schema';
