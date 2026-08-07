-- Bloc 2 / I5: rendre les organismes de classe pleinement structurés.
-- Le code de rapport et le profil d'admissibilité appartiennent à la liaison
-- classe-organisme, car une même classe HSP peut relever de plusieurs organismes.
-- Impact ShowScore: SS-0. Aucun bloc, passage, setup ou résultat n'est touché.

alter table public.class_governing_bodies
  add column reporting_class_code text,
  add column eligibility_profile_code text,
  add column updated_at timestamptz not null default now(),
  add constraint class_governing_bodies_reporting_code_check
    check (reporting_class_code is null or btrim(reporting_class_code) <> ''),
  add constraint class_governing_bodies_eligibility_profile_check
    check (eligibility_profile_code is null or btrim(eligibility_profile_code) <> ''),
  add constraint class_governing_bodies_metadata_object_check
    check (jsonb_typeof(sanction_metadata) = 'object');

alter table public.class_template_governing_bodies
  add column reporting_class_code text,
  add column eligibility_profile_code text,
  add column updated_at timestamptz not null default now(),
  add constraint class_template_governing_bodies_reporting_code_check
    check (reporting_class_code is null or btrim(reporting_class_code) <> ''),
  add constraint class_template_governing_bodies_eligibility_profile_check
    check (eligibility_profile_code is null or btrim(eligibility_profile_code) <> ''),
  add constraint class_template_governing_bodies_metadata_object_check
    check (jsonb_typeof(sanction_metadata) = 'object');

create trigger class_governing_bodies_touch_updated_at
  before update on public.class_governing_bodies
  for each row execute function public.touch_updated_at();

create trigger class_template_governing_bodies_touch_updated_at
  before update on public.class_template_governing_bodies
  for each row execute function public.touch_updated_at();

comment on column public.class_governing_bodies.reporting_class_code is
  'Class code expected by this governing body in official reports. It is independent from another body linked to the same HSP class.';

comment on column public.class_governing_bodies.eligibility_profile_code is
  'Machine-readable eligibility profile selected for this governing body, such as an NRHA class category.';

comment on column public.class_template_governing_bodies.reporting_class_code is
  'Default governing-body reporting code copied when a class is created from this template.';

comment on column public.class_template_governing_bodies.eligibility_profile_code is
  'Default governing-body eligibility profile copied when a class is created from this template.';
