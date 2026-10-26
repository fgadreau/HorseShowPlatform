begin;
alter table public.organizations
  add column back_number_auto_assign boolean not null default false,
  add column back_number_request_fee numeric(12,2) not null default 0 check (back_number_request_fee >= 0);
alter table public.blocks
  add column requires_association_back_number boolean not null default false,
  add column back_number_request_fee numeric(12,2) check (back_number_request_fee >= 0);
-- Existing stock and known staff assignments are association-issued. Historical
-- participant claims are personal; staff may confirm their origin without a fee.
alter table public.organization_back_numbers add column association_issued boolean not null default true;
update public.organization_back_numbers n set association_issued=false where n.status='assigned'
  and not exists(select 1 from public.organization_members m where m.organization_id=n.organization_id and m.user_id=n.created_by_user_id and m.role in ('admin','secretary'))
  and not exists(select 1 from public.platform_admins p where p.user_id=n.created_by_user_id);

create table public.back_number_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  horse_id uuid not null references public.horses(id),
  show_id uuid not null references public.shows(id),
  block_id uuid not null references public.blocks(id),
  payer_contact_id uuid not null references public.contacts(id),
  requested_by uuid not null references public.user_profiles(id),
  fee numeric(12,2) not null check (fee >= 0),
  status text not null default 'pending' check (status in ('pending','assigned')),
  assigned_number integer,
  created_at timestamptz not null default now(),
  assigned_at timestamptz,
  check ((status='pending' and assigned_number is null) or (status='assigned' and assigned_number > 0))
);
create unique index back_number_requests_one_pending on public.back_number_requests(organization_id,horse_id) where status='pending';
create index back_number_requests_horse on public.back_number_requests(horse_id);
alter table public.back_number_requests enable row level security;
revoke all on public.back_number_requests from public,anon,authenticated;
grant select on public.back_number_requests to authenticated;
create policy "Staff and requesters view back number requests" on public.back_number_requests for select to authenticated using (
  requested_by=public.current_profile_id() or public.is_platform_admin()
  or public.is_org_member(organization_id,array['admin','secretary'])
);
alter table public.entries
  add column back_number_choice text not null default 'legacy' check (back_number_choice in ('legacy','reuse','personal','request')),
  add column back_number_request_token uuid,
  add column back_number_request_id uuid references public.back_number_requests(id);

create function public.entry_back_number_options(p_org uuid,p_horse uuid,p_blocks uuid[] default '{}') returns jsonb
language plpgsql security definer set search_path=public as $$
declare n public.organization_back_numbers;o public.organizations;required boolean;price numeric;
begin
  if auth.uid() is null or not public.can_access_horse(p_horse) or not public.horse_is_linked_to_org(p_horse,p_org) then
    raise exception 'Dossard : cheval non autorisé.' using errcode='42501';
  end if;
  if exists(select 1 from unnest(p_blocks) x where not exists(select 1 from public.blocks b where b.id=x and b.organization_id=p_org)) then
    raise exception 'Bloc non autorisé.' using errcode='42501';
  end if;
  select * into strict o from public.organizations where id=p_org;
  select * into n from public.organization_back_numbers where organization_id=p_org and assigned_horse_id=p_horse and assignment_mode='horse' and status='assigned';
  select coalesce(bool_or(requires_association_back_number),false),coalesce(max(coalesce(back_number_request_fee,o.back_number_request_fee)),o.back_number_request_fee)
    into required,price from public.blocks where id=any(p_blocks);
  return jsonb_build_object('number',n.number,'association_issued',coalesce(n.association_issued,false),'requires_association',required,
    'fee',price,'auto_assign',o.back_number_auto_assign,'pending',exists(select 1 from public.back_number_requests where organization_id=p_org and horse_id=p_horse and status='pending'));
end $$;

create function public.back_number_assert_change(p_org uuid,p_horse uuid,p_number integer) returns void
language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.entries e join public.classes c on c.id=e.class_id join public.blocks b on b.id=c.block_id
    where e.organization_id=p_org and e.horse_id=p_horse and e.status in ('draft','pending_checkout','active')
      and e.entry_number is distinct from p_number and b.draw_prepared_at is not null
      and exists(select 1 from public.shows s where s.id=e.show_id and s.end_date>=current_date)) then
    raise exception 'Retire ou régénère l''ordre de passage avant de changer ce dossard.';
  end if;
end $$;

-- Preserve the established authorization checks; serialize claims and classify their source.
alter function public.claim_horse_back_number(uuid,uuid,integer,text,uuid) rename to claim_horse_back_number_before_workflow;
revoke all on function public.claim_horse_back_number_before_workflow(uuid,uuid,integer,text,uuid) from public,anon,authenticated,service_role;
create function public.claim_horse_back_number(target_organization_id uuid,target_horse_id uuid,requested_number integer,target_assignment_mode text default 'horse',target_rider_contact_id uuid default null)
returns public.organization_back_numbers language plpgsql security definer set search_path=public as $$
declare result public.organization_back_numbers;prior public.organization_back_numbers;
begin
  if auth.uid() is null then raise exception 'Connexion requise.' using errcode='42501';end if;
  if not (public.is_platform_admin() or public.is_org_member(target_organization_id,array['admin','secretary']))
    and exists(select 1 from public.back_number_requests where organization_id=target_organization_id and horse_id=target_horse_id and status='pending') then
    raise exception 'Une demande de dossard est déjà en attente auprès de l''association.';
  end if;
  perform public.billing6_lock(target_organization_id);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||target_organization_id,0));
  select * into prior from public.organization_back_numbers where organization_id=target_organization_id and number=requested_number;
  if target_assignment_mode='horse' then perform public.back_number_assert_change(target_organization_id,target_horse_id,requested_number);end if;
  result:=public.claim_horse_back_number_before_workflow(target_organization_id,target_horse_id,requested_number,target_assignment_mode,target_rider_contact_id);
  if target_assignment_mode='horse' and not (public.is_platform_admin() or public.is_org_member(target_organization_id,array['admin','secretary']))
    and not (prior.id is not null and prior.status='assigned' and prior.assigned_horse_id=target_horse_id) then
    update public.organization_back_numbers set association_issued=false where id=result.id returning * into result;
  end if;
  return result;
end $$;

create function public.assign_association_back_number(p_org uuid,p_horse uuid,p_number integer) returns public.organization_back_numbers
language plpgsql security definer set search_path=public as $$
declare result public.organization_back_numbers;
begin
  if auth.uid() is null or not (public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])) then
    raise exception 'Assignation réservée au secrétariat.' using errcode='42501';end if;
  perform public.billing6_lock(p_org);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||p_org,0));
  if p_number is null then
    select number into p_number from public.organization_back_numbers where organization_id=p_org and status='available' and association_issued order by number for update skip locked limit 1;
    if p_number is null then raise exception 'Aucun dossard disponible dans l''inventaire de cette association.';end if;
  end if;
  result:=public.claim_horse_back_number(p_org,p_horse,p_number,'horse',null);
  update public.organization_back_numbers set association_issued=true where id=result.id returning * into result;
  return result;
end $$;

create function public.back_number_assignment_sync() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and old.status='assigned' and old.assignment_mode='horse'
    and (new.status<>'assigned' or old.assigned_horse_id is distinct from new.assigned_horse_id) then
    update public.entries e set entry_number=null,back_number_choice='legacy'
      where e.organization_id=old.organization_id and e.horse_id=old.assigned_horse_id and e.entry_number=old.number
        and e.status in ('draft','pending_checkout','active')
        and exists(select 1 from public.shows s where s.id=e.show_id and s.end_date>=current_date);
  end if;
  if new.status<>'assigned' or new.assignment_mode<>'horse' then return new;end if;
  if new.association_issued then
    update public.back_number_requests set status='assigned',assigned_number=new.number,assigned_at=now()
      where organization_id=new.organization_id and horse_id=new.assigned_horse_id and status='pending';
  end if;
  update public.entries e set entry_number=new.number
    where e.organization_id=new.organization_id and e.horse_id=new.assigned_horse_id and e.status in ('draft','pending_checkout','active')
      and exists(select 1 from public.shows s where s.id=e.show_id and s.end_date>=current_date)
      and e.entry_number is distinct from new.number
      and (new.association_issued or not exists(select 1 from public.back_number_requests r where r.id=e.back_number_request_id and r.status='pending'));
  return new;
end $$;
create trigger back_number_assignment_sync after insert or update of status,assigned_horse_id,number,association_issued on public.organization_back_numbers
  for each row execute function public.back_number_assignment_sync();

create function public.back_number_source_guard() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  perform public.billing6_lock(new.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||new.organization_id,0));
  if tg_op='UPDATE' and old.status='assigned' and (old.assigned_horse_id is distinct from new.assigned_horse_id or new.status<>'assigned') then
    perform public.back_number_assert_change(old.organization_id,old.assigned_horse_id,null);
  end if;
  if new.status='assigned' and new.assignment_mode='horse' then
    perform public.back_number_assert_change(new.organization_id,new.assigned_horse_id,new.number);
    if not (public.is_platform_admin() or public.is_org_member(new.organization_id,array['admin','secretary']))
      and not exists(select 1 from public.back_number_requests where organization_id=new.organization_id and horse_id=new.assigned_horse_id and status='pending') then
      new.association_issued:=false;
    end if;
  end if;
  return new;
end $$;
create trigger back_number_source_guard before insert or update on public.organization_back_numbers for each row execute function public.back_number_source_guard();

create function public.entry_back_number_workflow() returns trigger
language plpgsql security definer set search_path=public as $$
declare b public.blocks;o public.organizations;n public.organization_back_numbers;r public.back_number_requests;price numeric;stock public.organization_back_numbers;
begin
  select * into b from public.blocks where id=(select block_id from public.classes where id=new.class_id);
  select * into o from public.organizations where id=new.organization_id;
  if o.back_number_policy<>'horse' then return new;end if;
  if tg_op='INSERT' then new.back_number_request_id:=null;
  elsif new.back_number_request_id is distinct from old.back_number_request_id then new.back_number_request_id:=old.back_number_request_id;
  end if;
  if b.organization_id is distinct from new.organization_id or b.show_id is distinct from new.show_id then raise exception 'Association ou concours incohérent.';end if;
  if tg_op='UPDATE' and (new.horse_id,new.class_id,new.entry_number,new.back_number_choice,new.back_number_request_token)
    is not distinct from (old.horse_id,old.class_id,old.entry_number,old.back_number_choice,old.back_number_request_token) then return new;end if;
  if auth.uid() is null or not public.can_access_horse(new.horse_id) or not public.can_access_contact(new.payer_contact_id) then
    raise exception 'Inscription non autorisée.' using errcode='42501';end if;
  perform public.billing6_lock(new.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||new.organization_id,0));
  select * into n from public.organization_back_numbers where organization_id=new.organization_id and assigned_horse_id=new.horse_id and assignment_mode='horse' and status='assigned' for update;
  if tg_op='UPDATE' and new.entry_number is not null and new.entry_number is distinct from old.entry_number
    and new.entry_number is distinct from n.number and new.back_number_choice=old.back_number_choice
    and new.back_number_request_token is not distinct from old.back_number_request_token then
    new.back_number_choice:='personal';
    new.back_number_request_id:=null;
  end if;
  if new.back_number_choice='legacy' then
    if new.entry_number is not null and new.entry_number is distinct from n.number then
      new.back_number_choice:='personal';
    elsif n.id is not null and (not b.requires_association_back_number or n.association_issued) then
      new.entry_number:=n.number;
      return new;
    else
      -- Existing integrations may leave the number pending, never purchase silently.
      new.entry_number:=null;
      if b.draw_prepared_at is not null then raise exception 'Un dossard doit être assigné avant d''ajouter ce cheval à un bloc dont l''ordre est créé.';end if;
      return new;
    end if;
  end if;
  -- Compatibility for existing entry clients that supply a number directly.
  if new.back_number_choice='reuse' and new.entry_number is not null and new.entry_number is distinct from n.number then
    new.back_number_choice:='personal';
  end if;

  -- Assignment propagation is not a new purchase.
  if tg_op='UPDATE' and new.entry_number is not distinct from n.number and new.back_number_request_id is not null then
    select * into r from public.back_number_requests where id=new.back_number_request_id;
    if r.status='assigned' and r.horse_id=new.horse_id and r.organization_id=new.organization_id then
      if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
      return new;
    end if;
  end if;
  if new.back_number_choice='request' then
    select * into r from public.back_number_requests where id=new.back_number_request_token for update;
    if r.id is not null and (r.organization_id<>new.organization_id or r.horse_id<>new.horse_id) then raise exception 'Demande de dossard incohérente.';end if;
    if r.id is null then select * into r from public.back_number_requests where organization_id=new.organization_id and horse_id=new.horse_id and status='pending' for update;end if;
    if r.id is null then
      price:=coalesce(b.back_number_request_fee,o.back_number_request_fee);
      insert into public.back_number_requests(id,organization_id,horse_id,show_id,block_id,payer_contact_id,requested_by,fee)
        values(coalesce(new.back_number_request_token,gen_random_uuid()),new.organization_id,new.horse_id,new.show_id,b.id,new.payer_contact_id,public.current_profile_id(),price) returning * into r;
      if price>0 then
        if public.reservation_uses_accounts(new.show_id) then
          perform public.event_billing_set_line('back-number:'||r.id,new.organization_id,new.show_id,new.payer_contact_id,new.owner_contact_id,new.horse_id,
            'back_number','Nouveau dossard / New back number',1,price,true,true,r.id::text);
        else
          insert into public.manual_sales(organization_id,show_id,payer_contact_id,sold_by_user_id,status,description,quantity,unit_price,tax_applicable,source_payload)
            values(new.organization_id,new.show_id,new.payer_contact_id,public.current_profile_id(),'active','Nouveau dossard / New back number',1,price,true,jsonb_build_object('back_number_request_id',r.id));
        end if;
      end if;
      if o.back_number_auto_assign then
        select * into stock from public.organization_back_numbers where organization_id=new.organization_id and status='available' and association_issued order by number for update skip locked limit 1;
        if stock.id is not null then
          perform public.back_number_assert_change(new.organization_id,new.horse_id,stock.number);
          update public.organization_back_numbers set status='available',assigned_horse_id=null,assigned_rider_contact_id=null,assigned_at=null where id=n.id;
          update public.organization_back_numbers set status='assigned',assignment_mode='horse',assigned_horse_id=new.horse_id,assigned_rider_contact_id=null,assigned_at=now() where id=stock.id;
          select * into r from public.back_number_requests where id=r.id;
        end if;
      end if;
    end if;
    new.back_number_request_id:=r.id;
    if r.status='assigned' then
      select * into n from public.organization_back_numbers where organization_id=new.organization_id and assigned_horse_id=new.horse_id and assignment_mode='horse' and status='assigned';
      if n.id is null then raise exception 'Le dossard de cette demande a été libéré. Crée une nouvelle demande.';end if;
      if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
      new.entry_number:=n.number;
    else new.entry_number:=null;
    end if;
  elsif new.back_number_choice='personal' then
    if b.requires_association_back_number then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
    if exists(select 1 from public.back_number_requests where organization_id=new.organization_id and horse_id=new.horse_id and status='pending') then
      raise exception 'Une demande de dossard est déjà en attente auprès de l''association.';end if;
    n:=public.claim_horse_back_number(new.organization_id,new.horse_id,new.entry_number,'horse',null);
    new.entry_number:=n.number;
    new.back_number_request_id:=null;
  else
    if n.id is null then raise exception 'Inscris un dossard libre ou demande une assignation à l''association.';end if;
    if b.requires_association_back_number and not n.association_issued then raise exception 'Ce bloc impose un dossard fourni par l''association.';end if;
    new.entry_number:=n.number;
  end if;
  if new.entry_number is null and b.draw_prepared_at is not null then raise exception 'Un dossard doit être assigné avant d''ajouter ce cheval à un bloc dont l''ordre est créé.';end if;
  return new;
end $$;
create trigger entries_back_number_workflow before insert or update on public.entries for each row execute function public.entry_back_number_workflow();

create function public.back_number_draw_guard() returns trigger
language plpgsql security definer set search_path=public as $$
declare target uuid;org uuid;required_origin boolean;
begin
  if tg_table_name='blocks' then
    if new.draw_prepared_at is null then return new;end if;
    target:=new.id;
    required_origin:=new.requires_association_back_number;
  elsif tg_table_name='show_score_block_setups' then
    if not new.is_draw_imported and coalesce(jsonb_array_length(new.runs),0)=0 then return new;end if;
    target:=new.block_id;
  else target:=new.block_id;
  end if;
  select organization_id into org from public.blocks where id=target;
  perform public.billing6_lock(org);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||org,0));
  if exists(select 1 from public.entries e join public.classes c on c.id=e.class_id join public.blocks b on b.id=c.block_id
    where c.block_id=target and e.status in ('draft','pending_checkout','active') and (e.entry_number is null or e.entry_number<1
      or ((select back_number_policy='horse' from public.organizations where id=e.organization_id) and not exists(select 1 from public.organization_back_numbers n where n.organization_id=e.organization_id
        and n.status='assigned' and n.assigned_horse_id=e.horse_id and n.number=e.entry_number and (not coalesce(required_origin,b.requires_association_back_number) or n.association_issued))))) then
    raise exception 'Ordre de passage impossible : des dossards sont en attente.';
  end if;
  return new;
end $$;
create trigger blocks_back_number_draw_guard before update of draw_prepared_at,requires_association_back_number on public.blocks for each row execute function public.back_number_draw_guard();
create trigger setups_back_number_draw_guard before insert or update on public.show_score_block_setups for each row execute function public.back_number_draw_guard();
create trigger runs_back_number_draw_guard before insert or update of order_of_go on public.block_run_entries for each row execute function public.back_number_draw_guard();

create function public.back_number_block_policy_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.requires_association_back_number and not exists(select 1 from public.organizations where id=new.organization_id and back_number_policy='horse') then
    raise exception 'Cette option nécessite une association qui gère les dossards par cheval.';
  end if;
  return new;
end $$;
create trigger back_number_block_policy_guard before insert or update of requires_association_back_number on public.blocks for each row execute function public.back_number_block_policy_guard();

create function public.back_number_delete_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
  perform public.billing6_lock(old.organization_id);
  perform pg_advisory_xact_lock(hashtextextended('backnumbers:'||old.organization_id,0));
  if old.status='assigned' and exists(select 1 from public.entries e join public.shows s on s.id=e.show_id
    where e.organization_id=old.organization_id and e.horse_id=old.assigned_horse_id and e.status in ('draft','pending_checkout','active') and s.end_date>=current_date) then
    raise exception 'Libère ou réassigne le dossard avant de le supprimer : des inscriptions sont actives.';
  end if;
  return old;
end $$;
create trigger back_number_delete_guard before delete on public.organization_back_numbers for each row execute function public.back_number_delete_guard();

revoke all on function public.entry_back_number_options(uuid,uuid,uuid[]),public.claim_horse_back_number(uuid,uuid,integer,text,uuid),public.assign_association_back_number(uuid,uuid,integer) from public,anon;
grant execute on function public.entry_back_number_options(uuid,uuid,uuid[]),public.claim_horse_back_number(uuid,uuid,integer,text,uuid),public.assign_association_back_number(uuid,uuid,integer) to authenticated;
revoke all on function public.back_number_assert_change(uuid,uuid,integer),public.back_number_assignment_sync(),public.entry_back_number_workflow(),public.back_number_draw_guard() from public,anon,authenticated,service_role;
revoke all on function public.back_number_source_guard() from public,anon,authenticated,service_role;
revoke all on function public.back_number_delete_guard() from public,anon,authenticated,service_role;
revoke all on function public.back_number_block_policy_guard() from public,anon,authenticated,service_role;
commit;
