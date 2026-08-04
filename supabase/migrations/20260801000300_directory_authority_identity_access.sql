-- Bloc 1 / F2-F4, lot 3: les repertoires deviennent la seule autorite
-- d'appartenance association-discipline pour les contacts et chevaux.
-- Impact ShowScore: SS-T. Les identites et dossards gardent les memes valeurs;
-- seul le chemin d'autorisation change.
--
-- Les colonnes contacts.organization_id, horses.organization_id et les tables
-- *_organization_links sont encore presentes pour permettre la conversion du
-- frontend dans le prochain lot. Elles ne sont plus consultees par les helpers
-- d'appartenance, les permissions d'identite ni l'attribution des dossards.

create or replace function public.contact_is_linked_to_org(
  target_contact_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.directory_contacts dc
    join public.organization_disciplines od on od.id = dc.organization_discipline_id
    where dc.contact_id = target_contact_id
      and od.organization_id = target_organization_id
      and od.is_active
  )
$$;

create or replace function public.horse_is_linked_to_org(
  target_horse_id uuid,
  target_organization_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.directory_horses dh
    join public.organization_disciplines od on od.id = dh.organization_discipline_id
    where dh.horse_id = target_horse_id
      and od.organization_id = target_organization_id
      and od.is_active
  )
$$;

-- Creation des identites et creation des liens proprietaire/agent sont
-- independantes d'un repertoire. organization_id demeure uniquement un champ
-- de compatibilite d'ecriture jusqu'a sa suppression avec le frontend legacy.
create or replace function public.set_horse_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_legacy_organization_id uuid;
begin
  select organization_id into owner_legacy_organization_id
  from public.contacts
  where id = new.primary_owner_contact_id;

  if not found then
    raise exception 'Primary owner contact % does not exist', new.primary_owner_contact_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := coalesce(new.organization_id, owner_legacy_organization_id);
  return new;
end;
$$;

create or replace function public.set_horse_contact_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  horse_legacy_organization_id uuid;
begin
  select organization_id into horse_legacy_organization_id
  from public.horses
  where id = new.horse_id;

  if not found then
    raise exception 'Horse % does not exist', new.horse_id
      using errcode = 'foreign_key_violation';
  end if;

  if not exists (select 1 from public.contacts where id = new.contact_id) then
    raise exception 'Contact % does not exist', new.contact_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := coalesce(new.organization_id, horse_legacy_organization_id);
  return new;
end;
$$;

create or replace function public.has_linked_contact_in_org(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts c
    where c.linked_user_id = public.current_profile_id()
      and public.contact_is_linked_to_org(c.id, target_organization_id)
  )
$$;

-- Lecture: la personne elle-meme, son createur ou un membre d'un repertoire
-- auquel la fiche est rattachee peut voir la fiche.
create or replace function public.can_access_contact(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and (
        c.linked_user_id = public.current_profile_id()
        or c.created_by_user_id = public.current_profile_id()
      )
  )
  or exists (
    select 1
    from public.directory_contacts dc
    join public.organization_disciplines od on od.id = dc.organization_discipline_id
    where dc.contact_id = target_contact_id
      and public.is_org_member(od.organization_id)
  )
$$;

-- Edition d'identite: jamais accordee simplement parce qu'une personne est
-- secretaire ou admin d'une association. Un createur peut corriger une fiche
-- encore non rattachee; apres rattachement, la personne liee ou la plateforme
-- controle l'identite.
create or replace function public.can_manage_contact_identity(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and c.linked_user_id = public.current_profile_id()
  )
  or exists (
    select 1
    from public.contacts c
    where c.id = target_contact_id
      and c.created_by_user_id = public.current_profile_id()
      and not exists (
        select 1 from public.directory_contacts dc
        where dc.contact_id = c.id
      )
  )
$$;

create or replace function public.can_access_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.horses h
    where h.id = target_horse_id
      and h.created_by_user_id = public.current_profile_id()
  )
  or exists (
    select 1
    from public.horse_contacts hc
    where hc.horse_id = target_horse_id
      and public.can_access_contact(hc.contact_id)
  )
  or exists (
    select 1
    from public.directory_horses dh
    join public.organization_disciplines od on od.id = dh.organization_discipline_id
    where dh.horse_id = target_horse_id
      and public.is_org_member(od.organization_id)
  )
$$;

create or replace function public.can_manage_horse_identity(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
  or exists (
    select 1
    from public.horses h
    where h.id = target_horse_id
      and h.created_by_user_id = public.current_profile_id()
      and not exists (
        select 1 from public.directory_horses dh
        where dh.horse_id = h.id
      )
  )
  or exists (
    select 1
    from public.horse_contacts hc
    where hc.horse_id = target_horse_id
      and hc.role in ('owner', 'co-owner', 'agent', 'manager')
      and public.can_manage_contact_identity(hc.contact_id)
  )
$$;

drop policy if exists "Staff and linked users can view contacts" on public.contacts;
drop policy if exists "Staff and linked users can create contacts" on public.contacts;
drop policy if exists "Staff and linked users can update contacts" on public.contacts;
drop policy if exists "Staff and linked users can delete contacts" on public.contacts;

create policy "Authorized users can view global contacts"
  on public.contacts for select
  to authenticated
  using (public.can_access_contact(id));

create policy "Authenticated users can create global contacts"
  on public.contacts for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      public.current_profile_id() is not null
      and (
        created_by_user_id = public.current_profile_id()
        or linked_user_id = public.current_profile_id()
      )
    )
  );

create policy "Identity owners can update global contacts"
  on public.contacts for update
  to authenticated
  using (public.can_manage_contact_identity(id))
  with check (public.can_manage_contact_identity(id));

create policy "Identity owners can delete global contacts"
  on public.contacts for delete
  to authenticated
  using (public.can_manage_contact_identity(id));

drop policy if exists "Staff and related users can view horses" on public.horses;
drop policy if exists "Staff and creators can create horses" on public.horses;
drop policy if exists "Staff and related users can update horses" on public.horses;
drop policy if exists "Staff and related users can delete horses" on public.horses;

create policy "Authorized users can view global horses"
  on public.horses for select
  to authenticated
  using (public.can_access_horse(id));

create policy "Authorized users can create global horses"
  on public.horses for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(primary_owner_contact_id)
    )
  );

create policy "Horse owners and agents can update global horses"
  on public.horses for update
  to authenticated
  using (public.can_manage_horse_identity(id))
  with check (
    public.can_manage_horse_identity(id)
    and public.can_access_contact(primary_owner_contact_id)
  );

create policy "Horse owners and agents can delete global horses"
  on public.horses for delete
  to authenticated
  using (public.can_manage_horse_identity(id));

drop policy if exists "Organization staff manage directory contacts" on public.directory_contacts;
create policy "Authorized users manage directory contacts"
  on public.directory_contacts for all
  to authenticated
  using (
    public.is_platform_admin()
    or public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.organization_disciplines od
      where od.id = organization_discipline_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.organization_disciplines od
      where od.id = organization_discipline_id
        and od.is_active
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Organization staff manage directory horses" on public.directory_horses;
create policy "Authorized users manage directory horses"
  on public.directory_horses for all
  to authenticated
  using (
    public.is_platform_admin()
    or public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.organization_disciplines od
      where od.id = organization_discipline_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.is_platform_admin()
    or public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.organization_disciplines od
      where od.id = organization_discipline_id
        and od.is_active
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

-- Le role demeure propre a une association, mais la fiche doit maintenant se
-- trouver dans au moins un de ses repertoires actifs.
create or replace function public.set_contact_role_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.contacts where id = new.contact_id) then
    raise exception 'Contact role contact does not exist'
      using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.contact_id, new.organization_id) then
    raise exception 'Contact % is not linked to an active directory for organization %', new.contact_id, new.organization_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Reutilisation exacte par courriel: une association peut rattacher la fiche
-- existante sans acquerir le droit d'en modifier l'identite globale.
create or replace function public.reuse_contact_by_email(
  target_organization_id uuid,
  target_type text,
  target_first_name text,
  target_last_name text,
  target_email text,
  target_phone text default null,
  target_barn_name text default null,
  target_linked_user_id uuid default null,
  target_created_by_user_id uuid default null,
  target_roles text[] default '{}'::text[]
)
returns public.contacts
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := nullif(lower(btrim(target_email)), '');
  normalized_first_name text := nullif(btrim(target_first_name), '');
  normalized_last_name text := nullif(btrim(target_last_name), '');
  requester_profile_id uuid := public.current_profile_id();
  can_manage_organization boolean := public.is_platform_admin()
    or public.is_org_member(target_organization_id, array['admin', 'secretary']);
  directory_id uuid;
  result_contact public.contacts;
  role_name text;
  requested_roles text[];
begin
  if requester_profile_id is null then
    raise exception 'Connecte-toi avant de creer un contact.';
  end if;

  if target_type not in ('owner', 'agent', 'rider', 'payer', 'other') then
    raise exception 'Type de contact invalide.' using errcode = 'check_violation';
  end if;

  if normalized_first_name is null or normalized_last_name is null or normalized_email is null then
    raise exception 'Le prenom, le nom et le courriel du contact sont requis.';
  end if;

  select od.id into directory_id
  from public.organization_disciplines od
  where od.organization_id = target_organization_id
    and od.is_active
  order by od.is_default desc, od.created_at, od.id
  limit 1;

  if directory_id is null then
    raise exception 'Cette association ne possede aucun repertoire de discipline actif.'
      using errcode = 'check_violation';
  end if;

  if target_linked_user_id is not null
    and target_linked_user_id is distinct from requester_profile_id
    and not can_manage_organization then
    raise exception 'Tu ne peux pas lier ce contact a un autre compte utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  if target_created_by_user_id is not null
    and target_created_by_user_id is distinct from requester_profile_id
    and not can_manage_organization then
    raise exception 'Tu ne peux pas creer de contact au nom d''un autre utilisateur.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into result_contact
  from public.contacts
  where email = normalized_email
  order by (linked_user_id is null), created_at, id
  for update
  limit 1;

  if result_contact.id is null then
    insert into public.contacts (
      organization_id,
      type,
      first_name,
      last_name,
      email,
      phone,
      barn_name,
      linked_user_id,
      created_by_user_id
    ) values (
      target_organization_id,
      target_type,
      normalized_first_name,
      normalized_last_name,
      normalized_email,
      nullif(btrim(target_phone), ''),
      nullif(btrim(target_barn_name), ''),
      target_linked_user_id,
      coalesce(target_created_by_user_id, requester_profile_id)
    )
    returning * into result_contact;
  elsif public.can_manage_contact_identity(result_contact.id) then
    update public.contacts
    set phone = coalesce(nullif(phone, ''), nullif(btrim(target_phone), '')),
        barn_name = coalesce(nullif(barn_name, ''), nullif(btrim(target_barn_name), '')),
        linked_user_id = coalesce(linked_user_id, target_linked_user_id),
        type = case when type = 'other' and target_type <> 'other' then target_type else type end,
        updated_at = now()
    where id = result_contact.id
    returning * into result_contact;
  end if;

  if not can_manage_organization
    and not public.can_manage_contact_identity(result_contact.id) then
    raise exception 'Tu ne peux pas rattacher ce contact a ce repertoire.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.directory_contacts (
    organization_discipline_id,
    contact_id,
    source,
    created_by_user_id
  ) values (
    directory_id,
    result_contact.id,
    'manual',
    coalesce(target_created_by_user_id, requester_profile_id)
  )
  on conflict (organization_discipline_id, contact_id) do update
  set updated_at = now();

  select array_agg(distinct role_value)
  into requested_roles
  from unnest(array_append(coalesce(target_roles, '{}'::text[]), target_type)) as role_value
  where role_value in ('owner', 'agent', 'rider', 'payer', 'booker', 'other');

  foreach role_name in array coalesce(requested_roles, array[target_type]) loop
    insert into public.contact_roles (organization_id, contact_id, role, source)
    values (
      target_organization_id,
      result_contact.id,
      role_name,
      case when role_name = target_type then 'contact_type' else 'manual' end
    )
    on conflict (organization_id, contact_id, role) do nothing;
  end loop;

  return result_contact;
end;
$$;

create or replace function public.set_internal_membership_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_type public.organization_membership_types;
begin
  select * into membership_type
  from public.organization_membership_types
  where id = new.membership_type_id;

  if membership_type.id is null then
    raise exception 'Membership type not found';
  end if;

  new.organization_id := membership_type.organization_id;
  new.season_year := membership_type.season_year;
  new.valid_from := coalesce(new.valid_from, membership_type.valid_from);
  new.valid_until := coalesce(new.valid_until, membership_type.valid_until);
  new.payer_contact_id := coalesce(new.payer_contact_id, new.contact_id);

  if not public.contact_is_linked_to_org(new.contact_id, new.organization_id) then
    raise exception 'Contact does not belong to an active directory of the membership organization';
  end if;

  if new.payer_contact_id is not null
    and not public.contact_is_linked_to_org(new.payer_contact_id, new.organization_id) then
    raise exception 'Payer contact does not belong to an active directory of the membership organization';
  end if;

  if new.show_id is not null and not exists (
    select 1 from public.shows s
    where s.id = new.show_id
      and s.organization_id = new.organization_id
  ) then
    raise exception 'Show does not belong to the membership organization';
  end if;

  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.set_manual_sale_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_record public.organization_products;
begin
  if new.product_id is not null then
    select * into product_record
    from public.organization_products
    where id = new.product_id;

    if product_record.id is null then
      raise exception 'Product not found';
    end if;

    new.organization_id := product_record.organization_id;
    new.description := coalesce(nullif(trim(new.description), ''), product_record.name);
    new.unit_price := coalesce(new.unit_price, product_record.default_price);
    new.tax_applicable := coalesce(new.tax_applicable, product_record.tax_applicable);
  end if;

  new.quantity := coalesce(new.quantity, 1);
  new.unit_price := coalesce(new.unit_price, 0);
  new.tax_applicable := coalesce(new.tax_applicable, true);

  if not public.contact_is_linked_to_org(new.payer_contact_id, new.organization_id) then
    raise exception 'Payer contact does not belong to an active directory of the sale organization';
  end if;

  if new.show_id is not null and not exists (
    select 1 from public.shows s
    where s.id = new.show_id
      and s.organization_id = new.organization_id
  ) then
    raise exception 'Show does not belong to the sale organization';
  end if;

  return new;
end;
$$;

drop policy if exists "Staff and linked users can view contact external memberships"
  on public.contact_external_memberships;
drop policy if exists "Staff and linked users can manage contact external memberships"
  on public.contact_external_memberships;

create policy "Authorized users view contact external memberships"
  on public.contact_external_memberships for select
  to authenticated
  using (public.can_access_contact(contact_id));

create policy "Authorized users manage contact external memberships"
  on public.contact_external_memberships for all
  to authenticated
  using (
    public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = contact_external_memberships.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.can_manage_contact_identity(contact_id)
    or exists (
      select 1
      from public.directory_contacts dc
      join public.organization_disciplines od on od.id = dc.organization_discipline_id
      where dc.contact_id = contact_external_memberships.contact_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

drop policy if exists "Staff and linked users can view horse external memberships"
  on public.horse_external_memberships;
drop policy if exists "Staff and linked users can manage horse external memberships"
  on public.horse_external_memberships;

create policy "Authorized users view horse external memberships"
  on public.horse_external_memberships for select
  to authenticated
  using (public.can_access_horse(horse_id));

create policy "Authorized users manage horse external memberships"
  on public.horse_external_memberships for all
  to authenticated
  using (
    public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = horse_external_memberships.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  )
  with check (
    public.can_manage_horse_identity(horse_id)
    or exists (
      select 1
      from public.directory_horses dh
      join public.organization_disciplines od on od.id = dh.organization_discipline_id
      where dh.horse_id = horse_external_memberships.horse_id
        and public.is_org_member(od.organization_id, array['admin', 'secretary'])
    )
  );

-- La meme signature RPC est conservee pour le client actuel. Le rattachement
-- est toutefois verifie exclusivement dans les repertoires.
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
    and not public.horse_is_linked_to_org(normalized_horse_id, target_organization_id) then
    raise exception 'Ce cheval n''est pas lie a un repertoire actif de cette association.';
  end if;

  if normalized_rider_contact_id is not null
    and not public.contact_is_linked_to_org(normalized_rider_contact_id, target_organization_id) then
    raise exception 'Ce cavalier n''est pas lie a un repertoire actif de cette association.';
  end if;

  select * into existing_back_number
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
      ) then
      return existing_back_number;
    end if;

    if existing_back_number.status <> 'available' then
      raise exception 'Le dossard % est deja utilise ou indisponible.', requested_number;
    end if;
  end if;

  update public.organization_back_numbers
  set status = 'available',
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
    set status = 'assigned',
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
    ) values (
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

grant execute on function public.contact_is_linked_to_org(uuid, uuid) to authenticated;
grant execute on function public.horse_is_linked_to_org(uuid, uuid) to authenticated;
grant execute on function public.has_linked_contact_in_org(uuid) to authenticated;
grant execute on function public.can_access_contact(uuid) to authenticated;
grant execute on function public.can_access_horse(uuid) to authenticated;
grant execute on function public.can_manage_contact_identity(uuid) to authenticated;
grant execute on function public.can_manage_horse_identity(uuid) to authenticated;
grant execute on function public.claim_horse_back_number(uuid, uuid, integer, text, uuid) to authenticated;

notify pgrst, 'reload schema';
