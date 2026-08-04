-- Bloc 1 / F2, lot 2: reconstruction canonique blocks/classes/templates.
-- Impact ShowScore: SS-T. Les noms et cles internes changent, pas le workflow.
--
-- Conserver les valeurs qui quittent les tables canoniques afin de pouvoir les
-- redistribuer vers les nouvelles classes, slates et relations structurées.
create temporary table legacy_block_rebuild_data on commit drop as
select
  id,
  organization_id,
  show_id,
  code,
  description,
  min_entries,
  entry_fee,
  ring_number,
  sanctioning_body_codes,
  back_number_policy,
  eligibility_rules,
  requires_membership,
  requires_coggins,
  requires_health_cert,
  nrha_slate_number,
  late_entries_allowed,
  late_entry_fee_percent,
  is_event_block,
  legacy_showscore_class_id
from public.classes;

create temporary table legacy_class_rebuild_data on commit drop as
select id, sanctioning_body_codes
from public.divisions;

create temporary table legacy_block_template_rebuild_data on commit drop as
select id, sanctioning_body_codes, back_number_policy, eligibility_rules
from public.class_templates;

create temporary table legacy_class_template_rebuild_data on commit drop as
select id, sanctioning_body_codes
from public.class_template_divisions;

-- Toute organisation historique reçoit au minimum un répertoire de discipline
-- explicite. Les répertoires déjà configurés restent prioritaires.
insert into public.disciplines (code, name, description, metadata)
values (
  'LEGACY',
  'Legacy / to classify',
  'Temporary discipline assigned while preserving pre-rebuild data.',
  '{"source":"blocks_classes_core_rebuild"}'::jsonb
)
on conflict (code) do nothing;

insert into public.organization_disciplines (
  organization_id,
  discipline_id,
  is_default,
  is_active,
  settings
)
select
  organization.id,
  discipline.id,
  true,
  true,
  '{"source":"legacy_backfill"}'::jsonb
from public.organizations organization
cross join public.disciplines discipline
where discipline.code = 'LEGACY'
  and not exists (
    select 1
    from public.organization_disciplines existing
    where existing.organization_id = organization.id
  )
on conflict (organization_id, discipline_id) do nothing;

-- Liberer les noms definitifs dans le bon ordre.
alter table public.classes rename to blocks;
alter table public.divisions rename to classes;
alter table public.class_templates rename to block_templates;
alter table public.class_template_divisions rename to class_templates;

-- Les fonctions de contexte historiques utilisent encore les anciens noms de
-- colonnes. Les désactiver avant tout backfill; leurs versions canoniques sont
-- recréées plus bas dans cette même transaction.
drop trigger if exists classes_set_refs on public.blocks;
drop trigger if exists divisions_set_refs on public.classes;
drop trigger if exists class_template_divisions_set_organization on public.class_templates;

-- Les vraies classes sont les anciennes divisions.
alter table public.classes rename column class_id to block_id;
alter table public.classes rename column class_template_division_id to class_template_id;
alter table public.entries rename column division_id to class_id;
alter table public.entry_results rename column division_id to class_id;
alter table public.payout_calculations rename column division_id to class_id;

-- Les anciens modeles parents deviennent les modeles de blocs.
alter table public.blocks rename column class_template_id to block_template_id;
alter table public.block_templates rename column default_pattern to pattern;
alter table public.class_templates rename column class_template_id to block_template_id;

-- Noms ShowScore: l'unite scoree est un bloc.
alter table public.show_score_class_setups rename to show_score_block_setups;
alter table public.show_score_block_setups rename column class_id to block_id;
alter table public.show_score_scoring_sessions rename column class_id to block_id;
alter table public.show_score_judge_sessions rename column class_id to block_id;
alter table public.show_score_official_results rename column class_id to block_id;
alter table public.show_score_publication_states rename column class_id to block_id;
alter table public.class_result_publications rename to block_result_publications;
alter table public.block_result_publications rename column class_id to block_id;
alter table public.app_events rename column class_id to block_id;

drop trigger if exists show_score_class_setups_set_refs on public.show_score_block_setups;
drop trigger if exists show_score_scoring_sessions_set_refs on public.show_score_scoring_sessions;
drop trigger if exists show_score_judge_sessions_set_refs on public.show_score_judge_sessions;
drop trigger if exists show_score_official_results_set_refs on public.show_score_official_results;
drop trigger if exists show_score_publication_states_set_refs on public.show_score_publication_states;

-- Nettoyer le bloc: horaire, passage, pattern, juges et fermeture seulement.
alter table public.blocks rename column status to schedule_status;
alter table public.blocks rename column is_public to schedule_is_public;
alter table public.blocks rename column block_label to display_label;
alter table public.blocks rename column judge_name to judge_display_name;

alter table public.blocks
  add column slate_id uuid references public.slates(id) on delete set null,
  add column block_type text not null default 'competition',
  add column results_are_public boolean not null default false;

update public.blocks block
set
  display_label = coalesce(nullif(block.display_label, ''), nullif(legacy.code, ''), block.name),
  arena = coalesce(nullif(block.arena, ''), 'Ring ' || legacy.ring_number::text),
  block_type = case when legacy.is_event_block then 'event' else 'competition' end,
  notes = concat_ws(E'\n\n', nullif(block.notes, ''), nullif(legacy.description, ''))
from legacy_block_rebuild_data legacy
where legacy.id = block.id;

alter table public.blocks
  add constraint blocks_type_check
    check (block_type in ('competition', 'paid_warmup', 'event', 'break', 'ceremony'));

alter table public.blocks
  drop column code cascade,
  drop column description cascade,
  drop column min_entries cascade,
  drop column entry_fee cascade,
  drop column payment_method cascade,
  drop column class_block_id cascade,
  drop column ring_number cascade,
  drop column requires_membership cascade,
  drop column requires_coggins cascade,
  drop column requires_health_cert cascade,
  drop column sanctioning_body_codes cascade,
  drop column back_number_policy cascade,
  drop column eligibility_rules cascade,
  drop column nrha_slate_number cascade,
  drop column late_entries_allowed cascade,
  drop column late_entry_fee_percent cascade,
  drop column is_event_block cascade,
  drop column legacy_showscore_class_id cascade,
  drop column user_id cascade;

alter table public.blocks
  add constraint blocks_identity_context_key unique (id, organization_id, show_id);

-- Enrichir les vraies classes et retirer les anciens compromis de division.
alter table public.classes
  add column organization_discipline_id uuid references public.organization_disciplines(id) on delete restrict,
  add column description text,
  add column minimum_entries smallint not null default 2 check (minimum_entries >= 0),
  add column registration_status text not null default 'open',
  add column is_public boolean not null default true,
  add column back_number_policy_override text,
  add column sort_order integer not null default 1 check (sort_order > 0);

with ranked_classes as (
  select
    class_record.id,
    row_number() over (
      partition by class_record.block_id
      order by class_record.created_at, class_record.id
    )::integer as sort_order
  from public.classes class_record
)
update public.classes class_record
set
  organization_discipline_id = (
    select organization_discipline.id
    from public.organization_disciplines organization_discipline
    where organization_discipline.organization_id = class_record.organization_id
    order by organization_discipline.is_default desc, organization_discipline.created_at, organization_discipline.id
    limit 1
  ),
  description = coalesce(class_record.description, class_record.notes),
  minimum_entries = coalesce(legacy_block.min_entries, class_record.minimum_entries),
  entry_fee = coalesce(class_record.entry_fee, legacy_block.entry_fee),
  back_number_policy_override = legacy_block.back_number_policy,
  eligibility_rules = coalesce(legacy_block.eligibility_rules, '{}'::jsonb)
    || coalesce(class_record.eligibility_rules, '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'legacy_requires_membership', legacy_block.requires_membership,
      'legacy_requires_coggins', legacy_block.requires_coggins,
      'legacy_requires_health_cert', legacy_block.requires_health_cert,
      'legacy_late_entries_allowed', legacy_block.late_entries_allowed,
      'legacy_late_entry_fee_percent', legacy_block.late_entry_fee_percent
    )),
  sort_order = ranked.sort_order
from ranked_classes ranked, legacy_block_rebuild_data legacy_block
where ranked.id = class_record.id
  and legacy_block.id = class_record.block_id;

alter table public.classes
  alter column organization_discipline_id set not null;

insert into public.directory_horses (
  organization_discipline_id,
  horse_id,
  source,
  created_by_user_id
)
select distinct
  class_record.organization_discipline_id,
  entry.horse_id,
  'entry',
  entry.created_by_user_id
from public.entries entry
join public.classes class_record on class_record.id = entry.class_id
on conflict (organization_discipline_id, horse_id) do nothing;

insert into public.directory_contacts (
  organization_discipline_id,
  contact_id,
  source,
  created_by_user_id
)
select distinct
  class_record.organization_discipline_id,
  related_contact.contact_id,
  'entry',
  entry.created_by_user_id
from public.entries entry
join public.classes class_record on class_record.id = entry.class_id
cross join lateral (
  values
    (entry.owner_contact_id),
    (entry.payer_contact_id),
    (entry.rider_contact_id)
) related_contact(contact_id)
where related_contact.contact_id is not null
on conflict (organization_discipline_id, contact_id) do nothing;

alter table public.classes
  add constraint classes_registration_status_check
    check (registration_status in ('draft', 'open', 'closed', 'cancelled')),
  add constraint classes_back_number_policy_override_check
    check (
      back_number_policy_override is null
      or back_number_policy_override in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom')
    ),
  add constraint classes_identity_context_key unique (id, organization_id, show_id),
  add constraint classes_block_sort_key unique (block_id, sort_order);

alter table public.classes
  drop column is_split_results cascade,
  drop column is_split_classes cascade,
  drop column min_age cascade,
  drop column max_age cascade,
  drop column sanctioning_body_codes cascade;

-- Modeles simples un-a-plusieurs: block_templates -> class_templates.
alter table public.block_templates
  add column custom_pattern jsonb,
  add column block_type text not null default 'competition';

alter table public.block_templates
  add constraint block_templates_type_check
    check (block_type in ('competition', 'paid_warmup', 'event', 'break', 'ceremony'));

alter table public.block_templates
  drop column default_entry_fee cascade,
  drop column sanctioning_body_codes cascade,
  drop column back_number_policy cascade,
  drop column eligibility_rules cascade;

alter table public.class_templates
  add column organization_discipline_id uuid references public.organization_disciplines(id) on delete restrict,
  add column back_number_policy_override text;

update public.class_templates class_template
set
  organization_discipline_id = (
    select organization_discipline.id
    from public.organization_disciplines organization_discipline
    where organization_discipline.organization_id = class_template.organization_id
    order by organization_discipline.is_default desc, organization_discipline.created_at, organization_discipline.id
    limit 1
  ),
  back_number_policy_override = legacy_block_template.back_number_policy,
  eligibility_rules = coalesce(legacy_block_template.eligibility_rules, '{}'::jsonb)
    || coalesce(class_template.eligibility_rules, '{}'::jsonb)
from legacy_block_template_rebuild_data legacy_block_template
where legacy_block_template.id = class_template.block_template_id;

alter table public.class_templates
  alter column organization_discipline_id set not null;

alter table public.class_templates
  add constraint class_templates_back_number_policy_override_check
    check (
      back_number_policy_override is null
      or back_number_policy_override in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom')
    );

alter table public.class_templates
  drop column sanctioning_body_codes cascade;

-- Organismes de regles, plusieurs par vraie classe.
create table public.class_governing_bodies (
  class_id uuid not null references public.classes(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  sanction_metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (class_id, governing_body_id)
);

create index class_governing_bodies_governing_body_idx
  on public.class_governing_bodies (governing_body_id, class_id);

create table public.class_template_governing_bodies (
  class_template_id uuid not null references public.class_templates(id) on delete cascade,
  governing_body_id uuid not null references public.governing_bodies(id) on delete restrict,
  sanction_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (class_template_id, governing_body_id)
);

insert into public.class_governing_bodies (class_id, governing_body_id, sanction_metadata)
select distinct
  legacy_class.id,
  governing_body.id,
  jsonb_build_object('source', 'legacy_sanctioning_body_codes')
from legacy_class_rebuild_data legacy_class
join public.classes class_record on class_record.id = legacy_class.id
join legacy_block_rebuild_data legacy_block on legacy_block.id = class_record.block_id
cross join lateral unnest(
  coalesce(legacy_block.sanctioning_body_codes, '{}'::text[])
  || coalesce(legacy_class.sanctioning_body_codes, '{}'::text[])
) legacy_code(code)
join public.governing_bodies governing_body
  on upper(btrim(governing_body.code)) = upper(btrim(legacy_code.code))
on conflict (class_id, governing_body_id) do nothing;

insert into public.class_template_governing_bodies (
  class_template_id,
  governing_body_id,
  sanction_metadata
)
select distinct
  legacy_class_template.id,
  governing_body.id,
  jsonb_build_object('source', 'legacy_sanctioning_body_codes')
from legacy_class_template_rebuild_data legacy_class_template
join public.class_templates class_template on class_template.id = legacy_class_template.id
join legacy_block_template_rebuild_data legacy_block_template
  on legacy_block_template.id = class_template.block_template_id
cross join lateral unnest(
  coalesce(legacy_block_template.sanctioning_body_codes, '{}'::text[])
  || coalesce(legacy_class_template.sanctioning_body_codes, '{}'::text[])
) legacy_code(code)
join public.governing_bodies governing_body
  on upper(btrim(governing_body.code)) = upper(btrim(legacy_code.code))
on conflict (class_template_id, governing_body_id) do nothing;

insert into public.slates (
  organization_id,
  show_id,
  governing_body_id,
  name,
  technical_number,
  sort_order,
  reporting_rules,
  notes
)
select distinct on (legacy_block.show_id, legacy_block.nrha_slate_number)
  legacy_block.organization_id,
  legacy_block.show_id,
  governing_body.id,
  'NRHA ' || legacy_block.nrha_slate_number::text,
  legacy_block.nrha_slate_number::text,
  1,
  '{"source":"legacy_nrha_slate_number"}'::jsonb,
  'Preserved from the pre-rebuild block.'
from legacy_block_rebuild_data legacy_block
join public.governing_bodies governing_body on governing_body.code = 'NRHA'
where legacy_block.nrha_slate_number is not null
order by legacy_block.show_id, legacy_block.nrha_slate_number, legacy_block.id
on conflict do nothing;

update public.blocks block
set slate_id = slate.id
from legacy_block_rebuild_data legacy_block
join public.slates slate
  on slate.show_id = legacy_block.show_id
 and slate.technical_number = legacy_block.nrha_slate_number::text
join public.governing_bodies governing_body
  on governing_body.id = slate.governing_body_id
 and governing_body.code = 'NRHA'
where legacy_block.id = block.id
  and legacy_block.nrha_slate_number is not null;

-- Les juges sont affectes au bloc, mais les frais restent sur les classes.
create table public.block_judge_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  judge_user_profile_id uuid references public.user_profiles(id) on delete set null,
  judge_contact_id uuid references public.contacts(id) on delete set null,
  display_name text not null,
  assignment_role text not null default 'judge'
    check (assignment_role in ('judge', 'chair', 'alternate')),
  sort_order integer not null default 1 check (sort_order > 0),
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, sort_order),
  check (judge_user_profile_id is not null or judge_contact_id is not null or btrim(display_name) <> '')
);

insert into public.block_judge_assignments (
  organization_id,
  show_id,
  block_id,
  display_name,
  assignment_role,
  sort_order
)
select
  block.organization_id,
  block.show_id,
  block.id,
  block.judge_display_name,
  'judge',
  1
from public.blocks block
where nullif(btrim(block.judge_display_name), '') is not null
on conflict (block_id, sort_order) do nothing;

-- Les blocs concurrents partagent le meme passage et obligatoirement le pattern.
create table public.block_concurrency_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  name text not null,
  created_by_user_id uuid references public.user_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, name),
  unique (id, organization_id, show_id)
);

create table public.block_concurrency_group_members (
  group_id uuid not null references public.block_concurrency_groups(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  sort_order integer not null default 1 check (sort_order > 0),
  created_at timestamptz not null default now(),
  primary key (group_id, block_id),
  unique (block_id),
  unique (group_id, sort_order)
);

-- Le warmup payant est un bloc avec des donnees specialisees.
alter table public.show_score_paid_warmups
  add column block_id uuid references public.blocks(id) on delete cascade;

insert into public.blocks (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  display_label,
  block_type,
  arena,
  schedule_start_mode,
  scheduled_time,
  sort_order,
  schedule_status,
  schedule_is_public,
  results_are_public,
  notes
)
select
  warmup.id,
  warmup.organization_id,
  warmup.show_id,
  warmup.show_day_id,
  warmup.name,
  warmup.name,
  'paid_warmup',
  warmup.arena,
  coalesce(warmup.schedule_start_mode, 'after_previous'),
  case
    when coalesce(warmup.schedule_start_mode, 'after_previous') = 'fixed'
      then nullif(warmup.schedule_start_time, '')::time
    else null
  end,
  warmup.sort_order,
  'open',
  true,
  false,
  'Preserved from show_score_paid_warmups.'
from public.show_score_paid_warmups warmup
on conflict (id) do nothing;

update public.show_score_paid_warmups warmup
set block_id = warmup.id
where exists (
  select 1
  from public.blocks block
  where block.id = warmup.id
    and block.block_type = 'paid_warmup'
);

do $$
begin
  if exists (
    select 1
    from public.show_score_paid_warmups
    where block_id is null
  ) then
    raise exception 'A legacy paid warmup id conflicts with a non-paid-warmup block id';
  end if;
end;
$$;

alter table public.show_score_paid_warmups
  alter column block_id set not null,
  add constraint show_score_paid_warmups_block_key unique (block_id);

-- Renommer les contraintes et index les plus structurants pour eliminer division.
alter table public.blocks rename constraint classes_pkey to blocks_pkey;
alter table public.classes rename constraint divisions_pkey to classes_pkey;
alter table public.entries rename constraint entries_division_id_fkey to entries_class_id_fkey;
alter table public.entry_results rename constraint entry_results_division_id_fkey to entry_results_class_id_fkey;
alter table public.payout_calculations rename constraint payout_calculations_division_id_fkey to payout_calculations_class_id_fkey;

alter index public.idx_entries_division_id rename to idx_entries_class_id;
alter index public.idx_entry_results_division_id rename to idx_entry_results_class_id;
alter index public.idx_payout_calculations_division_id rename to idx_payout_calculations_class_id;
alter index public.idx_divisions_class_id rename to idx_classes_block_id;

create index blocks_show_schedule_idx
  on public.blocks (show_id, show_day_id, schedule_start_mode, scheduled_time, sort_order);

create index blocks_slate_idx
  on public.blocks (slate_id, sort_order)
  where slate_id is not null;

create index classes_discipline_idx
  on public.classes (organization_discipline_id, show_id, registration_status);

create index classes_block_idx
  on public.classes (block_id, sort_order, name);

create index block_judge_assignments_block_idx
  on public.block_judge_assignments (block_id, sort_order);

create trigger block_judge_assignments_touch_updated_at
  before update on public.block_judge_assignments
  for each row execute function public.touch_updated_at();

create trigger block_concurrency_groups_touch_updated_at
  before update on public.block_concurrency_groups
  for each row execute function public.touch_updated_at();

alter table public.class_governing_bodies enable row level security;
alter table public.class_template_governing_bodies enable row level security;
alter table public.block_judge_assignments enable row level security;
alter table public.block_concurrency_groups enable row level security;
alter table public.block_concurrency_group_members enable row level security;

grant select, insert, update, delete on public.class_governing_bodies to authenticated;
grant select, insert, update, delete on public.class_template_governing_bodies to authenticated;
grant select, insert, update, delete on public.block_judge_assignments to authenticated;
grant select, insert, update, delete on public.block_concurrency_groups to authenticated;
grant select, insert, update, delete on public.block_concurrency_group_members to authenticated;

grant select on public.class_governing_bodies to anon;
grant select on public.block_judge_assignments to anon;

create policy "Visible class governing bodies can be viewed"
  on public.class_governing_bodies for select
  using (
    public.is_platform_admin()
    or exists (
      select 1
      from public.classes c
      join public.blocks b on b.id = c.block_id
      join public.shows s on s.id = c.show_id
      where c.id = class_id
        and (
          public.is_org_member(c.organization_id)
          or (c.is_public and b.schedule_is_public and (s.is_public or s.show_schedule_public))
        )
    )
  );

create policy "Show staff manage class governing bodies"
  on public.class_governing_bodies for all
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = class_id
        and (
          public.is_org_member(c.organization_id, array['admin', 'secretary'])
          or public.can_manage_show(c.show_id, array['organizer', 'secretary'])
        )
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.classes c
      where c.id = class_id
        and (
          public.is_org_member(c.organization_id, array['admin', 'secretary'])
          or public.can_manage_show(c.show_id, array['organizer', 'secretary'])
        )
    )
  );

create policy "Organization members view class template governing bodies"
  on public.class_template_governing_bodies for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.class_templates ct
      where ct.id = class_template_id
        and public.is_org_member(ct.organization_id)
    )
  );

create policy "Organization staff manage class template governing bodies"
  on public.class_template_governing_bodies for all
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.class_templates ct
      where ct.id = class_template_id
        and public.is_org_member(ct.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.class_templates ct
      where ct.id = class_template_id
        and public.is_org_member(ct.organization_id, array['admin', 'secretary'])
    )
  );

create policy "Visible block judges can be viewed"
  on public.block_judge_assignments for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or exists (
      select 1
      from public.blocks b
      join public.shows s on s.id = b.show_id
      where b.id = block_id
        and b.schedule_is_public
        and (s.is_public or s.show_schedule_public)
    )
  );

create policy "Show staff manage block judges"
  on public.block_judge_assignments for all
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_manage_show(show_id, array['organizer', 'secretary'])
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_manage_show(show_id, array['organizer', 'secretary'])
  );

create policy "Organization members view block concurrency groups"
  on public.block_concurrency_groups for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Show staff manage block concurrency groups"
  on public.block_concurrency_groups for all
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_manage_show(show_id, array['organizer', 'secretary'])
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_manage_show(show_id, array['organizer', 'secretary'])
  );

create policy "Organization members view block concurrency members"
  on public.block_concurrency_group_members for select
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.block_concurrency_groups bcg
      where bcg.id = group_id
        and public.is_org_member(bcg.organization_id)
    )
  );

create policy "Show staff manage block concurrency members"
  on public.block_concurrency_group_members for all
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.block_concurrency_groups bcg
      where bcg.id = group_id
        and (
          public.is_org_member(bcg.organization_id, array['admin', 'secretary'])
          or public.can_manage_show(bcg.show_id, array['organizer', 'secretary'])
        )
    )
  )
  with check (
    public.is_platform_admin()
    or exists (
      select 1 from public.block_concurrency_groups bcg
      where bcg.id = group_id
        and (
          public.is_org_member(bcg.organization_id, array['admin', 'secretary'])
          or public.can_manage_show(bcg.show_id, array['organizer', 'secretary'])
        )
    )
  );

-- Contexte canonique des blocs et classes.
drop trigger if exists classes_set_refs on public.blocks;
drop trigger if exists divisions_set_refs on public.classes;

create or replace function public.set_block_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_record record;
  day_record record;
  slate_record record;
  template_organization_id uuid;
begin
  select organization_id into show_record
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.show_day_id is not null then
    select organization_id, show_id into day_record
    from public.show_days
    where id = new.show_day_id;

    if not found
      or day_record.show_id is distinct from new.show_id
      or day_record.organization_id is distinct from show_record.organization_id then
      raise exception 'Block day must belong to the same show and organization'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.slate_id is not null then
    select organization_id, show_id into slate_record
    from public.slates
    where id = new.slate_id;

    if not found
      or slate_record.show_id is distinct from new.show_id
      or slate_record.organization_id is distinct from show_record.organization_id then
      raise exception 'Block slate must belong to the same show and organization'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.block_template_id is not null then
    select organization_id into template_organization_id
    from public.block_templates
    where id = new.block_template_id;

    if template_organization_id is null
      or template_organization_id is distinct from show_record.organization_id then
      raise exception 'Block template must belong to the show organization'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.organization_id is not null
    and new.organization_id is distinct from show_record.organization_id then
    raise exception 'Block organization must match its show organization'
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_record.organization_id;
  return new;
end;
$$;

create or replace function public.set_class_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_record record;
  directory_organization_id uuid;
  template_record record;
begin
  select organization_id, show_id into block_record
  from public.blocks
  where id = new.block_id;

  if not found then
    raise exception 'Block % does not exist', new.block_id
      using errcode = 'foreign_key_violation';
  end if;

  select organization_id into directory_organization_id
  from public.organization_disciplines
  where id = new.organization_discipline_id
    and is_active;

  if directory_organization_id is null
    or directory_organization_id is distinct from block_record.organization_id then
    raise exception 'Class discipline directory must be active and belong to the block organization'
      using errcode = 'check_violation';
  end if;

  if new.class_template_id is not null then
    select organization_id, organization_discipline_id into template_record
    from public.class_templates
    where id = new.class_template_id;

    if not found
      or template_record.organization_id is distinct from block_record.organization_id
      or template_record.organization_discipline_id is distinct from new.organization_discipline_id then
      raise exception 'Class template must belong to the same organization and discipline directory'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.organization_id is not null
    and new.organization_id is distinct from block_record.organization_id then
    raise exception 'Class organization must match its block organization'
      using errcode = 'check_violation';
  end if;

  if new.show_id is not null
    and new.show_id is distinct from block_record.show_id then
    raise exception 'Class show must match its block show'
      using errcode = 'check_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  return new;
end;
$$;

create trigger blocks_set_refs
  before insert or update of organization_id, show_id, show_day_id, slate_id, block_template_id
  on public.blocks
  for each row execute function public.set_block_refs();

create trigger classes_set_refs
  before insert or update of organization_id, show_id, block_id, organization_discipline_id, class_template_id
  on public.classes
  for each row execute function public.set_class_refs();

alter trigger classes_touch_updated_at on public.blocks rename to blocks_touch_updated_at;
alter trigger divisions_touch_updated_at on public.classes rename to classes_touch_updated_at;

drop trigger if exists class_template_divisions_set_organization on public.class_templates;

create or replace function public.set_class_template_context()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_organization_id uuid;
  directory_organization_id uuid;
begin
  select organization_id into parent_organization_id
  from public.block_templates
  where id = new.block_template_id;

  if parent_organization_id is null then
    raise exception 'Block template % does not exist', new.block_template_id
      using errcode = 'foreign_key_violation';
  end if;

  select organization_id into directory_organization_id
  from public.organization_disciplines
  where id = new.organization_discipline_id
    and is_active;

  if directory_organization_id is null
    or directory_organization_id is distinct from parent_organization_id then
    raise exception 'Class template discipline directory must belong to the block template organization'
      using errcode = 'check_violation';
  end if;

  new.organization_id := parent_organization_id;
  return new;
end;
$$;

create trigger class_templates_set_context
  before insert or update of organization_id, block_template_id, organization_discipline_id
  on public.class_templates
  for each row execute function public.set_class_template_context();

-- Validation des groupes concurrents et de leur pattern commun.
create or replace function public.validate_block_concurrency_member()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  group_record record;
  block_record record;
  reference_block record;
begin
  select organization_id, show_id into group_record
  from public.block_concurrency_groups
  where id = new.group_id;

  select organization_id, show_id, show_day_id, arena, pattern, custom_pattern into block_record
  from public.blocks
  where id = new.block_id;

  if group_record.organization_id is distinct from block_record.organization_id
    or group_record.show_id is distinct from block_record.show_id then
    raise exception 'Concurrent blocks must belong to the same show and organization'
      using errcode = 'check_violation';
  end if;

  select block.show_day_id, block.arena, block.pattern, block.custom_pattern
  into reference_block
  from public.block_concurrency_group_members member
  join public.blocks block on block.id = member.block_id
  where member.group_id = new.group_id
    and member.block_id <> new.block_id
  order by member.sort_order
  limit 1;

  if found and (
    reference_block.show_day_id is distinct from block_record.show_day_id
    or reference_block.arena is distinct from block_record.arena
    or reference_block.pattern is distinct from block_record.pattern
    or reference_block.custom_pattern is distinct from block_record.custom_pattern
  ) then
    raise exception 'Concurrent blocks must share the same day, arena and pattern'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create or replace function public.validate_concurrent_block_pattern_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.block_concurrency_group_members own_membership
    join public.block_concurrency_group_members other_membership
      on other_membership.group_id = own_membership.group_id
     and other_membership.block_id <> own_membership.block_id
    join public.blocks other_block on other_block.id = other_membership.block_id
    where own_membership.block_id = new.id
      and (
        other_block.show_day_id is distinct from new.show_day_id
        or other_block.arena is distinct from new.arena
        or other_block.pattern is distinct from new.pattern
        or other_block.custom_pattern is distinct from new.custom_pattern
      )
  ) then
    raise exception 'Concurrent blocks must share the same day, arena and pattern'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger block_concurrency_members_validate
  before insert or update of group_id, block_id
  on public.block_concurrency_group_members
  for each row execute function public.validate_block_concurrency_member();

create trigger blocks_validate_concurrent_pattern
  before update of show_day_id, arena, pattern, custom_pattern
  on public.blocks
  for each row execute function public.validate_concurrent_block_pattern_update();

-- Affectation de juge coherente avec le bloc.
create or replace function public.set_block_judge_assignment_refs()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  block_record record;
begin
  select organization_id, show_id into block_record
  from public.blocks
  where id = new.block_id;

  if not found then
    raise exception 'Block % does not exist', new.block_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  return new;
end;
$$;

create trigger block_judge_assignments_set_refs
  before insert or update of organization_id, show_id, block_id
  on public.block_judge_assignments
  for each row execute function public.set_block_judge_assignment_refs();

-- Une inscription vise une vraie classe. Le cheval et les contacts sont lies
-- automatiquement au repertoire de discipline de cette classe.
create or replace function public.set_entry_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_organization_id uuid;
  class_record record;
begin
  select organization_id into show_organization_id
  from public.shows
  where id = new.show_id;

  if show_organization_id is null then
    raise exception 'Show % does not exist', new.show_id
      using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id, organization_discipline_id
  into class_record
  from public.classes
  where id = new.class_id;

  if not found
    or class_record.show_id is distinct from new.show_id
    or class_record.organization_id is distinct from show_organization_id then
    raise exception 'Entry class must belong to the entry show and organization'
      using errcode = 'check_violation';
  end if;

  if not exists (select 1 from public.horses where id = new.horse_id) then
    raise exception 'Horse % does not exist', new.horse_id
      using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.owner_contact_id) then
    raise exception 'Owner contact % does not exist', new.owner_contact_id
      using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.rider_contact_id is not null
    and not exists (select 1 from public.contacts where id = new.rider_contact_id) then
    raise exception 'Rider contact % does not exist', new.rider_contact_id
      using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null
    and new.organization_id is distinct from show_organization_id then
    raise exception 'Entry organization must match its show organization'
      using errcode = 'check_violation';
  end if;

  insert into public.directory_horses (
    organization_discipline_id,
    horse_id,
    source,
    created_by_user_id
  )
  values (
    class_record.organization_discipline_id,
    new.horse_id,
    'entry',
    new.created_by_user_id
  )
  on conflict (organization_discipline_id, horse_id) do nothing;

  insert into public.directory_contacts (
    organization_discipline_id,
    contact_id,
    source,
    created_by_user_id
  )
  select
    class_record.organization_discipline_id,
    related_contact.contact_id,
    'entry',
    new.created_by_user_id
  from (
    values
      (new.owner_contact_id),
      (new.payer_contact_id),
      (new.rider_contact_id)
  ) as related_contact(contact_id)
  where related_contact.contact_id is not null
  on conflict (organization_discipline_id, contact_id) do nothing;

  new.organization_id := show_organization_id;
  return new;
end;
$$;

create or replace function public.enforce_entry_program_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_rider_contact_id uuid;
  rider_entry_count integer;
begin
  if new.import_source = 'showscore_draw_aqr_audit'
    or new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  if exists (
    select 1
    from public.entries entry
    where entry.id <> new.id
      and entry.horse_id = new.horse_id
      and entry.class_id = new.class_id
      and entry.status not in ('cancelled', 'scratched', 'scratched_pending_refund')
  ) then
    raise exception 'The same horse cannot be entered twice in the same class.';
  end if;

  active_rider_contact_id := coalesce(new.rider_contact_id, new.owner_contact_id);

  select count(*) into rider_entry_count
  from public.entries entry
  where entry.id <> new.id
    and entry.class_id = new.class_id
    and coalesce(entry.rider_contact_id, entry.owner_contact_id) = active_rider_contact_id
    and entry.status not in ('cancelled', 'scratched', 'scratched_pending_refund');

  if rider_entry_count >= 3 then
    raise exception 'A rider cannot be entered more than three times in the same class.';
  end if;

  return new;
end;
$$;

drop trigger if exists entries_program_limits on public.entries;
create trigger entries_program_limits
  before insert or update of horse_id, class_id, owner_contact_id, rider_contact_id, status
  on public.entries
  for each row execute function public.enforce_entry_program_limits();

-- Facturation: frais de classe directs et frais de juge une seule fois par
-- cheval/cavalier/bloc, comme avant la refonte.
create or replace function public.recalculate_entry_judge_fees(target_invoice_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_record record;
begin
  select
    invoice.id,
    invoice.organization_id,
    invoice.show_id,
    invoice.payer_contact_id,
    coalesce(show_record.tax_rate, organization.tax_rate, 0) as tax_rate
  into invoice_record
  from public.invoices invoice
  join public.shows show_record on show_record.id = invoice.show_id
  join public.organizations organization on organization.id = invoice.organization_id
  where invoice.id = target_invoice_id;

  if not found then
    return;
  end if;

  delete from public.invoice_line_items
  where invoice_id = target_invoice_id
    and item_type = 'judge_fee';

  insert into public.invoice_line_items (
    organization_id,
    invoice_id,
    item_type,
    item_id,
    description,
    quantity,
    unit_price,
    total_price,
    tax_applicable,
    tax_amount
  )
  select
    invoice_record.organization_id,
    target_invoice_id,
    'judge_fee',
    selected_entry.entry_id,
    left(
      'Judge fee - '
        || coalesce(selected_entry.horse_name, 'Horse')
        || case when selected_entry.rider_name is null then '' else ' / ' || selected_entry.rider_name end
        || ' / ' || coalesce(selected_entry.block_name, 'Block')
        || ' / ' || coalesce(selected_entry.class_name, 'Class'),
      255
    ),
    1,
    selected_entry.judge_fee,
    selected_entry.judge_fee,
    true,
    round(selected_entry.judge_fee * invoice_record.tax_rate / 100, 2)
  from (
    select entry.horse_id, entry.rider_contact_id, class_record.block_id
    from public.entries entry
    join public.classes class_record on class_record.id = entry.class_id
    where entry.organization_id = invoice_record.organization_id
      and entry.show_id = invoice_record.show_id
      and entry.payer_contact_id = invoice_record.payer_contact_id
      and entry.status not in ('cancelled', 'scratched')
    group by entry.horse_id, entry.rider_contact_id, class_record.block_id
  ) entry_blocks
  join lateral (
    select
      entry.id as entry_id,
      horse.name as horse_name,
      nullif(trim(coalesce(rider.first_name, '') || ' ' || coalesce(rider.last_name, '')), '') as rider_name,
      block.name as block_name,
      class_record.name as class_name,
      coalesce(entry.base_fee, class_record.entry_fee, 0) as entry_fee,
      coalesce(class_record.judge_fee, 0) as judge_fee
    from public.entries entry
    join public.classes class_record on class_record.id = entry.class_id
    join public.blocks block on block.id = class_record.block_id
    join public.horses horse on horse.id = entry.horse_id
    left join public.contacts rider on rider.id = entry.rider_contact_id
    where entry.organization_id = invoice_record.organization_id
      and entry.show_id = invoice_record.show_id
      and entry.payer_contact_id = invoice_record.payer_contact_id
      and entry.horse_id = entry_blocks.horse_id
      and entry.rider_contact_id is not distinct from entry_blocks.rider_contact_id
      and class_record.block_id = entry_blocks.block_id
      and entry.status not in ('cancelled', 'scratched')
    order by coalesce(entry.base_fee, class_record.entry_fee, 0) desc, entry.created_at, entry.id
    limit 1
  ) selected_entry on selected_entry.judge_fee > 0;
end;
$$;

create or replace function public.sync_entry_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_record record;
  target_invoice_id uuid;
  previous_invoice_id uuid;
  existing_line record;
  existing_late_line record;
  line_quantity numeric(10, 2);
  line_unit_price numeric(12, 2);
  line_total numeric(12, 2);
  line_tax numeric(12, 2);
  late_line_total numeric(12, 2);
  late_line_tax numeric(12, 2);
  line_description varchar(255);
  late_line_description varchar(255);
  generated_invoice_number varchar(50);
begin
  if tg_op = 'DELETE' then
    select invoice_id into previous_invoice_id
    from public.invoice_line_items
    where item_id = old.id
      and item_type in ('entry', 'judge_fee', 'fee')
    order by created_at desc
    limit 1;

    if previous_invoice_id is not null then
      delete from public.invoice_line_items
      where item_id = old.id
        and item_type in ('entry', 'fee');

      perform public.recalculate_entry_judge_fees(previous_invoice_id);
      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    return old;
  end if;

  select id, invoice_id into existing_line
  from public.invoice_line_items
  where item_id = new.id and item_type = 'entry'
  order by created_at desc
  limit 1;

  select id, invoice_id into existing_late_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type = 'fee'
    and description ilike 'Late entry fee%'
  order by created_at desc
  limit 1;

  if new.status <> 'draft' and existing_line.id is null then
    return new;
  end if;

  select
    horse.name as horse_name,
    block.name as block_name,
    class_record.name as class_name,
    coalesce(new.base_fee, class_record.entry_fee, 0) as entry_fee,
    coalesce(show_record.tax_rate, organization.tax_rate, 0) as tax_rate
  into entry_record
  from public.classes class_record
  join public.blocks block on block.id = class_record.block_id
  join public.horses horse on horse.id = new.horse_id
  join public.shows show_record on show_record.id = new.show_id
  join public.organizations organization on organization.id = new.organization_id
  where class_record.id = new.class_id;

  if not found then
    return new;
  end if;

  select id into target_invoice_id
  from public.invoices
  where organization_id = new.organization_id
    and show_id = new.show_id
    and payer_contact_id = new.payer_contact_id
    and status = 'draft'
  order by created_at desc
  limit 1;

  if target_invoice_id is null then
    generated_invoice_number := public.next_invoice_number(new.organization_id, new.show_id);

    insert into public.invoices (
      organization_id, show_id, invoice_number, payer_contact_id,
      created_by_user_id, status, subtotal, tax_amount, total_amount, total_paid
    ) values (
      new.organization_id, new.show_id, generated_invoice_number, new.payer_contact_id,
      new.created_by_user_id, 'draft', 0, 0, 0, 0
    )
    returning id into target_invoice_id;
  end if;

  line_quantity := case when new.status in ('cancelled', 'scratched') then 0 else 1 end;
  line_unit_price := coalesce(entry_record.entry_fee, 0);
  line_total := round(line_unit_price * line_quantity, 2);
  line_tax := round(line_total * coalesce(entry_record.tax_rate, 0) / 100, 2);
  line_description := left(
    case when new.status in ('cancelled', 'scratched') then 'Cancelled - ' else '' end
      || 'Entry - ' || coalesce(entry_record.horse_name, 'Horse')
      || ' / ' || coalesce(entry_record.block_name, 'Block')
      || ' / ' || coalesce(entry_record.class_name, 'Class'),
    255
  );

  if existing_line.id is null then
    insert into public.invoice_line_items (
      organization_id, invoice_id, item_type, item_id, description,
      quantity, unit_price, total_price, tax_applicable, tax_amount
    ) values (
      new.organization_id, target_invoice_id, 'entry', new.id, line_description,
      line_quantity, line_unit_price, line_total, true, line_tax
    );
  else
    previous_invoice_id := existing_line.invoice_id;
    update public.invoice_line_items
    set organization_id = new.organization_id,
        invoice_id = target_invoice_id,
        description = line_description,
        quantity = line_quantity,
        unit_price = line_unit_price,
        total_price = line_total,
        tax_applicable = true,
        tax_amount = line_tax
    where id = existing_line.id;
  end if;

  late_line_total := case
    when new.status in ('cancelled', 'scratched') then 0
    else round(coalesce(new.late_fee_amount, 0), 2)
  end;
  late_line_tax := round(late_line_total * coalesce(entry_record.tax_rate, 0) / 100, 2);
  late_line_description := left(
    'Late entry fee - ' || coalesce(entry_record.horse_name, 'Horse')
      || ' / ' || coalesce(entry_record.block_name, 'Block')
      || ' / ' || coalesce(entry_record.class_name, 'Class'),
    255
  );

  if late_line_total > 0 then
    if existing_late_line.id is null then
      insert into public.invoice_line_items (
        organization_id, invoice_id, item_type, item_id, description,
        quantity, unit_price, total_price, tax_applicable, tax_amount
      ) values (
        new.organization_id, target_invoice_id, 'fee', new.id, late_line_description,
        1, late_line_total, late_line_total, true, late_line_tax
      );
    else
      previous_invoice_id := coalesce(previous_invoice_id, existing_late_line.invoice_id);
      update public.invoice_line_items
      set organization_id = new.organization_id,
          invoice_id = target_invoice_id,
          description = late_line_description,
          quantity = 1,
          unit_price = late_line_total,
          total_price = late_line_total,
          tax_applicable = true,
          tax_amount = late_line_tax
      where id = existing_late_line.id;
    end if;
  elsif existing_late_line.id is not null then
    previous_invoice_id := coalesce(previous_invoice_id, existing_late_line.invoice_id);
    delete from public.invoice_line_items where id = existing_late_line.id;
  end if;

  perform public.recalculate_entry_judge_fees(target_invoice_id);
  perform public.recalculate_invoice_totals(target_invoice_id);

  if previous_invoice_id is not null and previous_invoice_id is distinct from target_invoice_id then
    perform public.recalculate_entry_judge_fees(previous_invoice_id);
    perform public.recalculate_invoice_totals(previous_invoice_id);
  end if;

  return new;
end;
$$;

-- Pont de resultats: un passage physique alimente toutes ses vraies classes.
create or replace function public.sync_entry_results_for_scored_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entry_results (
    entry_id,
    run_id,
    block_run_id,
    block_id,
    class_id,
    show_id,
    final_score,
    status,
    synced_at,
    updated_at
  )
  select
    link.entry_id,
    new.run_id,
    block_run.block_run_id,
    block_run.block_id,
    entry.class_id,
    new.show_id,
    new.final_score,
    new.status,
    now(),
    now()
  from public.block_run_entries block_run
  join public.block_run_class_entries link on link.block_run_id = block_run.block_run_id
  join public.entries entry on entry.id = link.entry_id
  where block_run.run_id = new.run_id
    and entry.show_id = new.show_id
  on conflict (entry_id) do update set
    run_id = excluded.run_id,
    block_run_id = excluded.block_run_id,
    block_id = excluded.block_id,
    class_id = excluded.class_id,
    show_id = excluded.show_id,
    final_score = excluded.final_score,
    status = excluded.status,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

create or replace function public.sync_entry_result_for_block_run_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.entry_results (
    entry_id,
    run_id,
    block_run_id,
    block_id,
    class_id,
    show_id,
    final_score,
    status,
    synced_at,
    updated_at
  )
  select
    new.entry_id,
    scored_run.run_id,
    block_run.block_run_id,
    block_run.block_id,
    entry.class_id,
    scored_run.show_id,
    scored_run.final_score,
    scored_run.status,
    now(),
    now()
  from public.block_run_entries block_run
  join public.scored_runs scored_run on scored_run.run_id = block_run.run_id
  join public.entries entry on entry.id = new.entry_id
  where block_run.block_run_id = new.block_run_id
    and entry.show_id = scored_run.show_id
  on conflict (entry_id) do update set
    run_id = excluded.run_id,
    block_run_id = excluded.block_run_id,
    block_id = excluded.block_id,
    class_id = excluded.class_id,
    show_id = excluded.show_id,
    final_score = excluded.final_score,
    status = excluded.status,
    synced_at = excluded.synced_at,
    updated_at = excluded.updated_at;

  return new;
end;
$$;

-- References techniques ShowScore. Les cartes visibles restent des blocs.
drop trigger if exists show_score_class_setups_set_refs on public.show_score_block_setups;
drop trigger if exists show_score_scoring_sessions_set_refs on public.show_score_scoring_sessions;
drop trigger if exists show_score_judge_sessions_set_refs on public.show_score_judge_sessions;
drop trigger if exists show_score_official_results_set_refs on public.show_score_official_results;
drop trigger if exists show_score_publication_states_set_refs on public.show_score_publication_states;

create or replace function public.set_show_score_block_setup_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_record record;
begin
  select organization_id, show_id, show_day_id, pattern, custom_pattern
  into block_record
  from public.blocks
  where id = new.block_id;

  if not found then
    raise exception 'Block % does not exist', new.block_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  new.show_day_id := block_record.show_day_id;
  new.pattern := block_record.pattern;
  new.custom_pattern := block_record.custom_pattern;
  return new;
end;
$$;

create or replace function public.set_show_score_block_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_record record;
begin
  select organization_id, show_id into block_record
  from public.blocks
  where id = new.block_id;

  if not found then
    raise exception 'Block % does not exist', new.block_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  return new;
end;
$$;

create trigger show_score_block_setups_set_refs
  before insert or update on public.show_score_block_setups
  for each row execute function public.set_show_score_block_setup_refs();

create trigger show_score_scoring_sessions_set_refs
  before insert or update on public.show_score_scoring_sessions
  for each row execute function public.set_show_score_block_refs();

create trigger show_score_judge_sessions_set_refs
  before insert or update on public.show_score_judge_sessions
  for each row execute function public.set_show_score_block_refs();

create trigger show_score_official_results_set_refs
  before insert or update on public.show_score_official_results
  for each row execute function public.set_show_score_block_refs();

create trigger show_score_publication_states_set_refs
  before insert or update on public.show_score_publication_states
  for each row execute function public.set_show_score_block_refs();

create or replace function public.set_show_score_paid_warmup_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_record record;
begin
  select
    b.organization_id,
    b.show_id,
    b.show_day_id,
    b.name,
    b.arena,
    b.schedule_start_mode,
    b.scheduled_time,
    b.sort_order,
    b.block_type
  into block_record
  from public.blocks b
  where b.id = new.block_id;

  if not found then
    raise exception 'Block % does not exist', new.block_id
      using errcode = 'foreign_key_violation';
  end if;

  if block_record.block_type <> 'paid_warmup' then
    raise exception 'Paid warmup block % must have block_type paid_warmup', new.block_id
      using errcode = 'check_violation';
  end if;

  if new.active_entry_id is not null and not exists (
    select 1
    from public.entries e
    join public.classes c on c.id = e.class_id
    where e.id = new.active_entry_id
      and c.block_id = new.block_id
  ) then
    raise exception 'Active entry % does not belong to paid warmup block %', new.active_entry_id, new.block_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  new.show_day_id := block_record.show_day_id;
  new.name := block_record.name;
  new.arena := block_record.arena;
  new.schedule_start_mode := block_record.schedule_start_mode;
  new.schedule_start_time := block_record.scheduled_time::text;
  new.sort_order := block_record.sort_order;
  return new;
end;
$$;

-- Conserver la signature RPC ShowScore actuelle, mais la cle recue designe
-- maintenant un bloc. La signature sera renommee avec le client ShowScore.
create or replace function public.record_app_event(
  target_event_type text default null,
  target_event_name text default null,
  target_association_id text default null,
  target_show_id text default null,
  target_day_id text default null,
  target_class_id text default null,
  target_session_id text default null,
  target_path text default null,
  target_user_agent text default null,
  target_locale text default null,
  target_timezone text default null,
  target_metadata jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  created_event_id uuid;
  normalized_event_type text;
  normalized_event_name text;
begin
  normalized_event_type := lower(nullif(btrim(coalesce(target_event_type, '')), ''));
  normalized_event_name := lower(nullif(btrim(coalesce(target_event_name, '')), ''));

  if normalized_event_type not in ('analytics', 'audit') then
    raise exception 'Invalid app event type' using errcode = '22023';
  end if;

  if normalized_event_name is null then
    raise exception 'App event name is required' using errcode = '22023';
  end if;

  insert into public.app_events (
    event_type,
    event_name,
    association_id,
    show_id,
    day_id,
    block_id,
    session_id,
    actor_user_id,
    actor_email,
    path,
    user_agent,
    locale,
    timezone,
    metadata
  )
  values (
    normalized_event_type,
    left(normalized_event_name, 120),
    nullif(btrim(coalesce(target_association_id, '')), ''),
    nullif(btrim(coalesce(target_show_id, '')), ''),
    nullif(btrim(coalesce(target_day_id, '')), ''),
    nullif(btrim(coalesce(target_class_id, '')), ''),
    nullif(btrim(coalesce(target_session_id, '')), ''),
    auth.uid(),
    nullif(auth.email(), ''),
    left(nullif(btrim(coalesce(target_path, '')), ''), 500),
    left(nullif(target_user_agent, ''), 500),
    left(nullif(btrim(coalesce(target_locale, '')), ''), 40),
    left(nullif(btrim(coalesce(target_timezone, '')), ''), 80),
    coalesce(target_metadata, '{}'::jsonb)
  )
  returning id into created_event_id;

  return created_event_id::text;
end;
$$;

alter trigger show_score_class_setups_touch_updated_at on public.show_score_block_setups
  rename to show_score_block_setups_touch_updated_at;
