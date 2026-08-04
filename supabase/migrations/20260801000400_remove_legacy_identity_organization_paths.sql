-- Les contacts et chevaux sont des identites globales. Leur presence dans une
-- association et une discipline est portee exclusivement par directory_contacts
-- et directory_horses.
--
-- Impact ShowScore: SS-T. Aucune donnee de programme, de passage, de pointage ou
-- de resultat ne change. Seuls les chemins d'autorisation et de rattachement des
-- identites sont simplifies.

drop trigger if exists horses_set_organization on public.horses;
drop trigger if exists horse_contacts_set_organization on public.horse_contacts;

drop function if exists public.set_horse_organization();
drop function if exists public.set_horse_contact_organization();

drop policy if exists "Horse creators can create their own horse contacts" on public.horse_contacts;
drop policy if exists "Horse creators can manage their own horse contacts" on public.horse_contacts;
drop policy if exists "Platform admin can manage all horse contacts" on public.horse_contacts;
drop policy if exists "Staff and related users can delete horse contacts" on public.horse_contacts;
drop policy if exists "Staff and related users can view horse contacts" on public.horse_contacts;
drop policy if exists "Staff can manage non-coowner horse contacts" on public.horse_contacts;

drop table if exists public.contact_organization_links;
drop table if exists public.horse_organization_links;

alter table public.horse_contacts
  drop column if exists organization_id;

alter table public.horses
  drop column if exists organization_id;

alter table public.contacts
  drop column if exists organization_id;

-- Le contact proprietaire principal demeure une source d'autorite meme avant
-- que la relation horse_contacts correspondante soit creee. Cela garde la
-- creation atomique possible sans redonner de droits au personnel du repertoire.
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
        select 1
        from public.directory_horses dh
        where dh.horse_id = h.id
      )
  )
  or exists (
    select 1
    from public.horses h
    where h.id = target_horse_id
      and public.can_manage_contact_identity(h.primary_owner_contact_id)
  )
  or exists (
    select 1
    from public.horse_contacts hc
    where hc.horse_id = target_horse_id
      and hc.role in ('owner', 'co-owner', 'agent', 'manager')
      and public.can_manage_contact_identity(hc.contact_id)
  )
$$;

-- Lire une relation cheval-contact est permis aux personnes qui peuvent deja
-- consulter l'une des deux identites. Le rattachement a un repertoire ne donne
-- pas, a lui seul, le droit de modifier les relations de propriete ou d'agence.
create policy "Related users can view horse contacts"
  on public.horse_contacts for select
  to authenticated
  using (
    public.is_platform_admin()
    or public.can_access_horse(horse_id)
    or public.can_access_contact(contact_id)
  );

create policy "Identity managers can create horse contacts"
  on public.horse_contacts for insert
  to authenticated
  with check (
    public.is_platform_admin()
    or (
      role <> 'co-owner'
      and public.can_manage_horse_identity(horse_id)
      and public.can_access_contact(contact_id)
    )
  );

create policy "Identity managers can update horse contacts"
  on public.horse_contacts for update
  to authenticated
  using (
    public.is_platform_admin()
    or (
      role <> 'co-owner'
      and public.can_manage_horse_identity(horse_id)
    )
  )
  with check (
    public.is_platform_admin()
    or (
      role <> 'co-owner'
      and public.can_manage_horse_identity(horse_id)
      and public.can_access_contact(contact_id)
    )
  );

create policy "Identity managers can delete horse contacts"
  on public.horse_contacts for delete
  to authenticated
  using (
    public.is_platform_admin()
    or (
      role <> 'co-owner'
      and public.can_manage_horse_identity(horse_id)
    )
  );

-- La signature reste stable pour les clients existants. organization_id est un
-- contexte de repertoire et n'est plus copie dans la fiche globale du contact.
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
      type,
      first_name,
      last_name,
      email,
      phone,
      barn_name,
      linked_user_id,
      created_by_user_id
    ) values (
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

grant execute on function public.reuse_contact_by_email(uuid, text, text, text, text, text, text, uuid, uuid, text[]) to authenticated;

notify pgrst, 'reload schema';
