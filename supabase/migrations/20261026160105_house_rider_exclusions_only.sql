begin;
-- No horse exclusions exist in PREPROD. Retain the legacy column for compatibility,
-- while making rider-only exclusions authoritative in the database.
alter table public.house_class_exclusions add constraint house_class_exclusions_riders_only
  check (rider_contact_id is not null and horse_id is null);
alter policy "Staff manage house class exclusions" on public.house_class_exclusions
  with check ((public.is_platform_admin() or public.is_org_member(organization_id,array['admin','secretary']))
    and exists(select 1 from public.class_templates t where t.id=class_template_id and t.organization_id=house_class_exclusions.organization_id)
    and rider_contact_id is not null and horse_id is null and public.can_access_contact(rider_contact_id));
create or replace function public.house_class_exclusion_scope_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.rider_contact_id is null or new.horse_id is not null then
    raise exception 'Seuls les cavaliers peuvent figurer dans cette liste.' using errcode='23514';
  end if;
  if not exists(select 1 from public.class_templates t where t.id=new.class_template_id and t.organization_id=new.organization_id)
    or exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=new.class_template_id) then
    raise exception 'La liste doit appartenir à une classe maison récurrente de cette association.';
  end if;
  return new;
end $$;

-- Participants receive only the blocked class IDs for their own entry team.
-- Staff-only rows (including reasons and other riders' identities) stay private.
create or replace function public.house_class_entry_blocks(p_org uuid,p_show uuid,p_horse uuid,p_rider uuid)
returns table(class_id uuid) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.shows s where s.id=p_show and s.organization_id=p_org)
    or not (public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])
      or (public.can_access_horse(p_horse) and public.can_access_contact(p_rider))) then
    raise exception 'Vérification non autorisée.' using errcode='42501';
  end if;
  return query select distinct c.id from public.classes c
    join public.class_templates t on t.id=c.class_template_id and t.organization_id=c.organization_id
    join public.house_class_exclusions x on x.class_template_id=t.id and x.organization_id=t.organization_id
    where c.organization_id=p_org and c.show_id=p_show
      and x.rider_contact_id=p_rider
      and not exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=t.id)
      and not exists(select 1 from public.class_governing_bodies g where g.class_id=c.id);
end $$;

create or replace function public.entry_house_class_exclusion_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.status='cancelled' then return new;end if;
  if tg_op='UPDATE' then
    if (new.class_id,new.horse_id,new.rider_contact_id,new.status) is not distinct from
       (old.class_id,old.horse_id,old.rider_contact_id,old.status) then return new;end if;
  end if;
  if exists(select 1 from public.classes c
    join public.class_templates t on t.id=c.class_template_id and t.organization_id=c.organization_id
    join public.house_class_exclusions x on x.class_template_id=t.id and x.organization_id=t.organization_id
    where c.id=new.class_id and c.organization_id=new.organization_id and c.show_id=new.show_id
      and x.rider_contact_id=new.rider_contact_id
      and not exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=t.id)
      and not exists(select 1 from public.class_governing_bodies g where g.class_id=c.id)) then
    raise exception 'Le cavalier est inéligible à cette classe maison selon la liste de l''association.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.house_class_exclusion_scope_guard(), public.entry_house_class_exclusion_guard(), public.house_class_entry_blocks(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.house_class_entry_blocks(uuid,uuid,uuid,uuid) to authenticated;
commit;
