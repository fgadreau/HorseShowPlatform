alter table public.organizations
add column if not exists back_number_policy varchar(30) not null default 'horse';

alter table public.organizations
drop constraint if exists organizations_back_number_policy_check;

alter table public.organizations
add constraint organizations_back_number_policy_check
check (back_number_policy in ('horse', 'rider', 'horse_rider_team'));

alter table public.organization_back_numbers
drop constraint if exists organization_back_numbers_assignment_mode_check;

alter table public.organization_back_numbers
add constraint organization_back_numbers_assignment_mode_check
check (assignment_mode in ('horse', 'rider', 'horse_rider_team'));

alter table public.organization_back_numbers
drop constraint if exists organization_back_numbers_check;

alter table public.organization_back_numbers
drop constraint if exists organization_back_numbers_assignment_check;

alter table public.organization_back_numbers
add constraint organization_back_numbers_assignment_check
check (
  status <> 'assigned'
  or (
    (assignment_mode = 'horse' and assigned_horse_id is not null)
    or (assignment_mode = 'rider' and assigned_rider_contact_id is not null)
    or (assignment_mode = 'horse_rider_team' and assigned_horse_id is not null and assigned_rider_contact_id is not null)
  )
);

create unique index if not exists idx_unique_active_rider_back_number_assignment
on public.organization_back_numbers(organization_id, assigned_rider_contact_id)
where status = 'assigned'
  and assignment_mode = 'rider'
  and assigned_rider_contact_id is not null;

alter table public.sanctioning_bodies
drop constraint if exists sanctioning_bodies_back_number_policy_check;

alter table public.sanctioning_bodies
add constraint sanctioning_bodies_back_number_policy_check
check (back_number_policy in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom'));

alter table public.class_templates
drop constraint if exists class_templates_back_number_policy_check;

alter table public.class_templates
add constraint class_templates_back_number_policy_check
check (back_number_policy in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom'));

alter table public.classes
drop constraint if exists classes_back_number_policy_check;

alter table public.classes
add constraint classes_back_number_policy_check
check (back_number_policy in ('horse', 'rider', 'horse_rider_team', 'entry', 'custom'));

create or replace function public.claim_horse_back_number(
  target_organization_id uuid,
  target_horse_id uuid,
  requested_number integer,
  target_assignment_mode text default 'horse',
  target_rider_contact_id uuid default null
)
returns public.organization_back_numbers
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_back_number public.organization_back_numbers;
  result_back_number public.organization_back_numbers;
  organization_policy text;
  normalized_mode text := coalesce(target_assignment_mode, 'horse');
  normalized_horse_id uuid := case when coalesce(target_assignment_mode, 'horse') in ('horse', 'horse_rider_team') then target_horse_id else null end;
  normalized_rider_contact_id uuid := case when coalesce(target_assignment_mode, 'horse') in ('rider', 'horse_rider_team') then target_rider_contact_id else null end;
  requester_profile_id uuid := public.current_profile_id();
  can_manage boolean := public.is_platform_admin() or public.is_org_member(target_organization_id, array['admin', 'secretary']);
begin
  if requester_profile_id is null then
    raise exception 'Connecte-toi avant d''ajouter un dossard.';
  end if;

  select coalesce(o.back_number_policy, 'horse')
  into organization_policy
  from public.organizations o
  where o.id = target_organization_id;

  if organization_policy is null then
    raise exception 'Association introuvable.';
  end if;

  if requested_number is null or requested_number < 1 then
    raise exception 'Le numero de dossard doit etre un entier positif.';
  end if;

  if normalized_mode not in ('horse', 'rider', 'horse_rider_team') then
    raise exception 'Mode de dossard invalide.';
  end if;

  if normalized_mode <> organization_policy then
    raise exception 'Cette association gere les dossards en mode %, pas en mode %.', organization_policy, normalized_mode;
  end if;

  if normalized_mode in ('horse', 'horse_rider_team') and normalized_horse_id is null then
    raise exception 'Choisis un cheval avant d''assigner un dossard.';
  end if;

  if normalized_mode in ('rider', 'horse_rider_team') and normalized_rider_contact_id is null then
    raise exception 'Choisis un cavalier avant d''assigner ce dossard.';
  end if;

  if normalized_horse_id is not null and not can_manage and not public.can_access_horse(normalized_horse_id) then
    raise exception 'Tu ne peux pas assigner un dossard a ce cheval.';
  end if;

  if normalized_rider_contact_id is not null and not can_manage and not public.can_access_contact(normalized_rider_contact_id) then
    raise exception 'Tu ne peux pas assigner un dossard a ce cavalier.';
  end if;

  if normalized_horse_id is not null
    and not exists (
      select 1
      from public.horses h
      where h.id = normalized_horse_id
        and h.organization_id = target_organization_id
    )
    and not exists (
      select 1
      from public.horse_organization_links hol
      where hol.horse_id = normalized_horse_id
        and hol.organization_id = target_organization_id
    )
  then
    raise exception 'Ce cheval n''est pas lie a cette association.';
  end if;

  if normalized_rider_contact_id is not null
    and not exists (
      select 1
      from public.contacts c
      where c.id = normalized_rider_contact_id
        and c.organization_id = target_organization_id
    )
    and not exists (
      select 1
      from public.contact_organization_links col
      where col.contact_id = normalized_rider_contact_id
        and col.organization_id = target_organization_id
    )
  then
    raise exception 'Ce cavalier n''est pas lie a cette association.';
  end if;

  select *
  into existing_back_number
  from public.organization_back_numbers obn
  where obn.organization_id = target_organization_id
    and obn.number = requested_number
  for update;

  if existing_back_number.id is not null then
    if existing_back_number.status = 'assigned'
      and existing_back_number.assignment_mode = normalized_mode
      and (
        (normalized_mode = 'horse' and existing_back_number.assigned_horse_id = normalized_horse_id)
        or (normalized_mode = 'rider' and existing_back_number.assigned_rider_contact_id = normalized_rider_contact_id)
        or (
          normalized_mode = 'horse_rider_team'
          and existing_back_number.assigned_horse_id = normalized_horse_id
          and existing_back_number.assigned_rider_contact_id = normalized_rider_contact_id
        )
      )
    then
      return existing_back_number;
    end if;

    if existing_back_number.status <> 'available' then
      raise exception 'Le dossard % est deja utilise ou indisponible.', requested_number;
    end if;
  end if;

  update public.organization_back_numbers
  set
    status = 'available',
    assigned_horse_id = null,
    assigned_rider_contact_id = null,
    assigned_at = null
  where organization_id = target_organization_id
    and status = 'assigned'
    and assignment_mode = normalized_mode
    and (
      (normalized_mode = 'horse' and assigned_horse_id = normalized_horse_id)
      or (normalized_mode = 'rider' and assigned_rider_contact_id = normalized_rider_contact_id)
      or (
        normalized_mode = 'horse_rider_team'
        and assigned_horse_id = normalized_horse_id
        and assigned_rider_contact_id = normalized_rider_contact_id
      )
    )
    and (existing_back_number.id is null or id <> existing_back_number.id);

  if existing_back_number.id is not null then
    update public.organization_back_numbers
    set
      status = 'assigned',
      assignment_mode = normalized_mode,
      assigned_horse_id = normalized_horse_id,
      assigned_rider_contact_id = normalized_rider_contact_id,
      assigned_at = now(),
      created_by_user_id = coalesce(created_by_user_id, requester_profile_id)
    where id = existing_back_number.id
    returning * into result_back_number;
  else
    insert into public.organization_back_numbers (
      organization_id,
      number,
      status,
      assignment_mode,
      assigned_horse_id,
      assigned_rider_contact_id,
      assigned_at,
      created_by_user_id
    )
    values (
      target_organization_id,
      requested_number,
      'assigned',
      normalized_mode,
      normalized_horse_id,
      normalized_rider_contact_id,
      now(),
      requester_profile_id
    )
    returning * into result_back_number;
  end if;

  return result_back_number;
end;
$$;

grant execute on function public.claim_horse_back_number(uuid, uuid, integer, text, uuid) to authenticated;
