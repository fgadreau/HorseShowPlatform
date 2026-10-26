begin;
create table public.house_class_exclusions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  class_template_id uuid not null references public.class_templates(id) on delete cascade,
  rider_contact_id uuid references public.contacts(id),
  horse_id uuid references public.horses(id),
  reason text not null default '' check (length(reason) <= 500),
  created_at timestamptz not null default now(),
  check (num_nonnulls(rider_contact_id,horse_id)=1)
);
create unique index house_class_exclusions_rider on public.house_class_exclusions(class_template_id,rider_contact_id) where rider_contact_id is not null;
create unique index house_class_exclusions_horse on public.house_class_exclusions(class_template_id,horse_id) where horse_id is not null;
create index house_class_exclusions_org on public.house_class_exclusions(organization_id);
alter table public.house_class_exclusions enable row level security;
revoke all on public.house_class_exclusions from public,anon,authenticated;
grant select,insert,delete on public.house_class_exclusions to authenticated;
create policy "Staff manage house class exclusions" on public.house_class_exclusions for all to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id,array['admin','secretary']))
  with check ((public.is_platform_admin() or public.is_org_member(organization_id,array['admin','secretary']))
    and exists(select 1 from public.class_templates t where t.id=class_template_id and t.organization_id=house_class_exclusions.organization_id)
    and (rider_contact_id is null or public.can_access_contact(rider_contact_id))
    and (horse_id is null or public.can_access_horse(horse_id)));

create function public.house_class_exclusion_scope_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.class_templates t where t.id=new.class_template_id and t.organization_id=new.organization_id)
    or exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=new.class_template_id) then
    raise exception 'La liste doit appartenir à une classe maison récurrente de cette association.';
  end if;
  return new;
end $$;
create trigger house_class_exclusion_scope before insert or update on public.house_class_exclusions
  for each row execute function public.house_class_exclusion_scope_guard();

-- Participants receive only the blocked class IDs for their own entry team.
-- Staff-only rows (including reasons and other riders' identities) stay private.
create function public.house_class_entry_blocks(p_org uuid,p_show uuid,p_horse uuid,p_rider uuid)
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
      and (x.horse_id=p_horse or x.rider_contact_id=p_rider)
      and not exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=t.id)
      and not exists(select 1 from public.class_governing_bodies g where g.class_id=c.id);
end $$;

create function public.entry_house_class_exclusion_guard() returns trigger
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
      and (x.horse_id=new.horse_id or x.rider_contact_id=new.rider_contact_id)
      and not exists(select 1 from public.class_template_governing_bodies g where g.class_template_id=t.id)
      and not exists(select 1 from public.class_governing_bodies g where g.class_id=c.id)) then
    raise exception 'Le cavalier ou le cheval est inéligible à cette classe maison selon la liste de l''association.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger entries_house_class_exclusion before insert or update of class_id,horse_id,rider_contact_id,status on public.entries
  for each row execute function public.entry_house_class_exclusion_guard();
revoke all on function public.house_class_exclusion_scope_guard(), public.entry_house_class_exclusion_guard(), public.house_class_entry_blocks(uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.house_class_entry_blocks(uuid,uuid,uuid,uuid) to authenticated;
commit;
