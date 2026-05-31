-- Phase 1 hardening: keep duplicated tenant references aligned and tighten
-- self-service write paths so UUID guessing cannot cross tenant boundaries.

create or replace function public.can_create_entries_for_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horse_contacts hc
    join public.contacts c on c.id = hc.contact_id
    where hc.horse_id = target_horse_id
      and c.linked_user_id = public.current_profile_id()
      and (hc.can_create_entries or hc.can_modify_entries)
  )
$$;

create or replace function public.can_modify_entries_for_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horse_contacts hc
    join public.contacts c on c.id = hc.contact_id
    where hc.horse_id = target_horse_id
      and c.linked_user_id = public.current_profile_id()
      and hc.can_modify_entries
  )
$$;

create or replace function public.can_book_stalls_for_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horse_contacts hc
    join public.contacts c on c.id = hc.contact_id
    where hc.horse_id = target_horse_id
      and c.linked_user_id = public.current_profile_id()
      and hc.can_book_stalls
  )
$$;

create or replace function public.can_pay_invoices_for_horse(
  target_horse_id uuid,
  target_contact_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.horse_contacts hc
    join public.contacts c on c.id = hc.contact_id
    where hc.horse_id = target_horse_id
      and hc.contact_id = target_contact_id
      and c.linked_user_id = public.current_profile_id()
      and hc.can_pay_invoices
  )
$$;

create or replace function public.set_show_role_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Show role organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_show_day_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Show day organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
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
  show_org_id uuid;
  day_record record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if new.show_day_id is not null then
    select organization_id, show_id into day_record
    from public.show_days
    where id = new.show_day_id;

    if not found then
      raise exception 'Show day % does not exist', new.show_day_id using errcode = 'foreign_key_violation';
    end if;

    if day_record.show_id is distinct from new.show_id then
      raise exception 'Show day % does not belong to show %', new.show_day_id, new.show_id
        using errcode = 'check_violation';
    end if;

    if day_record.organization_id is distinct from show_org_id then
      raise exception 'Show day organization % does not match show organization %', day_record.organization_id, show_org_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Class organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_division_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_record record;
begin
  select organization_id, show_id into class_record
  from public.classes
  where id = new.class_id;

  if not found then
    raise exception 'Class % does not exist', new.class_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from class_record.organization_id then
    raise exception 'Division organization % does not match class organization %', new.organization_id, class_record.organization_id
      using errcode = 'check_violation';
  end if;

  if new.show_id is not null and new.show_id is distinct from class_record.show_id then
    raise exception 'Division show % does not match class show %', new.show_id, class_record.show_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := class_record.organization_id;
  new.show_id := class_record.show_id;
  return new;
end;
$$;

create or replace function public.set_horse_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_org_id uuid;
begin
  select organization_id into owner_org_id
  from public.contacts
  where id = new.primary_owner_contact_id;

  if not found then
    raise exception 'Primary owner contact % does not exist', new.primary_owner_contact_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from owner_org_id then
    raise exception 'Horse organization % does not match owner contact organization %', new.organization_id, owner_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := owner_org_id;
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
  horse_org_id uuid;
  contact_org_id uuid;
begin
  select organization_id into horse_org_id
  from public.horses
  where id = new.horse_id;

  if not found then
    raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into contact_org_id
  from public.contacts
  where id = new.contact_id;

  if not found then
    raise exception 'Contact % does not exist', new.contact_id using errcode = 'foreign_key_violation';
  end if;

  if horse_org_id is distinct from contact_org_id then
    raise exception 'Horse organization % does not match contact organization %', horse_org_id, contact_org_id
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from horse_org_id then
    raise exception 'Horse contact organization % does not match horse organization %', new.organization_id, horse_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := horse_org_id;
  return new;
end;
$$;

create or replace function public.set_entry_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  horse_org_id uuid;
  division_record record;
  owner_org_id uuid;
  rider_org_id uuid;
  payer_org_id uuid;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into horse_org_id
  from public.horses
  where id = new.horse_id;

  if not found then
    raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into division_record
  from public.divisions
  where id = new.division_id;

  if not found then
    raise exception 'Division % does not exist', new.division_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into owner_org_id
  from public.contacts
  where id = new.owner_contact_id;

  if not found then
    raise exception 'Owner contact % does not exist', new.owner_contact_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into payer_org_id
  from public.contacts
  where id = new.payer_contact_id;

  if not found then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if new.rider_contact_id is not null then
    select organization_id into rider_org_id
    from public.contacts
    where id = new.rider_contact_id;

    if not found then
      raise exception 'Rider contact % does not exist', new.rider_contact_id using errcode = 'foreign_key_violation';
    end if;
  end if;

  if division_record.show_id is distinct from new.show_id then
    raise exception 'Entry division show % does not match entry show %', division_record.show_id, new.show_id
      using errcode = 'check_violation';
  end if;

  if horse_org_id is distinct from show_org_id
    or division_record.organization_id is distinct from show_org_id
    or owner_org_id is distinct from show_org_id
    or payer_org_id is distinct from show_org_id
    or (new.rider_contact_id is not null and rider_org_id is distinct from show_org_id)
  then
    raise exception 'Entry related records must belong to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Entry organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_stall_option_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  start_day record;
  end_day record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  if new.show_day_start_id is not null then
    select organization_id, show_id into start_day from public.show_days where id = new.show_day_start_id;
    if not found then
      raise exception 'Start show day % does not exist', new.show_day_start_id using errcode = 'foreign_key_violation';
    end if;
    if start_day.show_id is distinct from new.show_id or start_day.organization_id is distinct from show_org_id then
      raise exception 'Start show day % does not belong to stall option show %', new.show_day_start_id, new.show_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.show_day_end_id is not null then
    select organization_id, show_id into end_day from public.show_days where id = new.show_day_end_id;
    if not found then
      raise exception 'End show day % does not exist', new.show_day_end_id using errcode = 'foreign_key_violation';
    end if;
    if end_day.show_id is distinct from new.show_id or end_day.organization_id is distinct from show_org_id then
      raise exception 'End show day % does not belong to stall option show %', new.show_day_end_id, new.show_id
        using errcode = 'check_violation';
    end if;
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Stall option organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_stall_booking_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  option_record record;
  horse_org_id uuid;
  booker_org_id uuid;
  payer_org_id uuid;
  start_day record;
  end_day record;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into option_record
  from public.stall_options
  where id = new.stall_option_id;

  if not found then
    raise exception 'Stall option % does not exist', new.stall_option_id using errcode = 'foreign_key_violation';
  end if;

  if option_record.show_id is distinct from new.show_id or option_record.organization_id is distinct from show_org_id then
    raise exception 'Stall option % does not belong to booking show %', new.stall_option_id, new.show_id
      using errcode = 'check_violation';
  end if;

  if new.horse_id is not null then
    select organization_id into horse_org_id from public.horses where id = new.horse_id;
    if not found then
      raise exception 'Horse % does not exist', new.horse_id using errcode = 'foreign_key_violation';
    end if;
    if horse_org_id is distinct from show_org_id then
      raise exception 'Booking horse % does not belong to show organization %', new.horse_id, show_org_id
        using errcode = 'check_violation';
    end if;
  end if;

  select organization_id into booker_org_id from public.contacts where id = new.booker_contact_id;
  if not found then
    raise exception 'Booker contact % does not exist', new.booker_contact_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into payer_org_id from public.contacts where id = new.payer_contact_id;
  if not found then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if booker_org_id is distinct from show_org_id or payer_org_id is distinct from show_org_id then
    raise exception 'Booking contacts must belong to the same organization as the show'
      using errcode = 'check_violation';
  end if;

  select organization_id, show_id into start_day from public.show_days where id = new.show_day_start_id;
  if not found then
    raise exception 'Start show day % does not exist', new.show_day_start_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id, show_id into end_day from public.show_days where id = new.show_day_end_id;
  if not found then
    raise exception 'End show day % does not exist', new.show_day_end_id using errcode = 'foreign_key_violation';
  end if;

  if start_day.show_id is distinct from new.show_id
    or end_day.show_id is distinct from new.show_id
    or start_day.organization_id is distinct from show_org_id
    or end_day.organization_id is distinct from show_org_id
  then
    raise exception 'Booking show days must belong to the booking show'
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Booking organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_invoice_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_org_id uuid;
  payer_org_id uuid;
begin
  select organization_id into show_org_id
  from public.shows
  where id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select organization_id into payer_org_id
  from public.contacts
  where id = new.payer_contact_id;

  if not found then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if payer_org_id is distinct from show_org_id then
    raise exception 'Invoice payer organization % does not match show organization %', payer_org_id, show_org_id
      using errcode = 'check_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from show_org_id then
    raise exception 'Invoice organization % does not match show organization %', new.organization_id, show_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := show_org_id;
  return new;
end;
$$;

create or replace function public.set_invoice_line_item_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_org_id uuid;
begin
  select organization_id into invoice_org_id
  from public.invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Invoice % does not exist', new.invoice_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from invoice_org_id then
    raise exception 'Line item organization % does not match invoice organization %', new.organization_id, invoice_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := invoice_org_id;
  return new;
end;
$$;

create or replace function public.set_payment_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_org_id uuid;
begin
  select organization_id into invoice_org_id
  from public.invoices
  where id = new.invoice_id;

  if not found then
    raise exception 'Invoice % does not exist', new.invoice_id using errcode = 'foreign_key_violation';
  end if;

  if new.organization_id is not null and new.organization_id is distinct from invoice_org_id then
    raise exception 'Payment organization % does not match invoice organization %', new.organization_id, invoice_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := invoice_org_id;
  return new;
end;
$$;

drop trigger if exists show_roles_set_organization on public.show_roles;
create trigger show_roles_set_organization
before insert or update on public.show_roles
for each row execute function public.set_show_role_organization();

drop trigger if exists show_days_set_organization on public.show_days;
create trigger show_days_set_organization
before insert or update on public.show_days
for each row execute function public.set_show_day_organization();

drop trigger if exists classes_set_refs on public.classes;
create trigger classes_set_refs
before insert or update on public.classes
for each row execute function public.set_class_refs();

drop trigger if exists divisions_set_refs on public.divisions;
create trigger divisions_set_refs
before insert or update on public.divisions
for each row execute function public.set_division_refs();

drop trigger if exists horses_set_organization on public.horses;
create trigger horses_set_organization
before insert or update on public.horses
for each row execute function public.set_horse_organization();

drop trigger if exists horse_contacts_set_organization on public.horse_contacts;
create trigger horse_contacts_set_organization
before insert or update on public.horse_contacts
for each row execute function public.set_horse_contact_organization();

drop trigger if exists entries_set_refs on public.entries;
create trigger entries_set_refs
before insert or update on public.entries
for each row execute function public.set_entry_refs();

drop trigger if exists stall_options_set_refs on public.stall_options;
create trigger stall_options_set_refs
before insert or update on public.stall_options
for each row execute function public.set_stall_option_refs();

drop trigger if exists stall_bookings_set_refs on public.stall_bookings;
create trigger stall_bookings_set_refs
before insert or update on public.stall_bookings
for each row execute function public.set_stall_booking_refs();

drop trigger if exists invoices_set_refs on public.invoices;
create trigger invoices_set_refs
before insert or update on public.invoices
for each row execute function public.set_invoice_refs();

drop trigger if exists invoice_line_items_set_refs on public.invoice_line_items;
create trigger invoice_line_items_set_refs
before insert or update on public.invoice_line_items
for each row execute function public.set_invoice_line_item_refs();

drop trigger if exists payments_set_refs on public.payments;
create trigger payments_set_refs
before insert or update on public.payments
for each row execute function public.set_payment_refs();

drop policy if exists "Staff and creators can create horses" on public.horses;
create policy "Staff and creators can create horses"
  on public.horses for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(primary_owner_contact_id)
    )
  );

drop policy if exists "Staff and related users can update horses" on public.horses;
create policy "Staff and related users can update horses"
  on public.horses for update
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.can_access_horse(id)
  )
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or (
      public.can_access_horse(id)
      and public.can_access_contact(primary_owner_contact_id)
    )
  );

drop policy if exists "Horse creators can create their own horse contacts" on public.horse_contacts;
create policy "Horse creators can create their own horse contacts"
  on public.horse_contacts for insert
  with check (
    exists (
      select 1
      from public.horses h
      where h.id = horse_id
        and h.created_by_user_id = public.current_profile_id()
    )
    and public.can_access_contact(contact_id)
  );

drop policy if exists "Staff and related users can create entries" on public.entries;
create policy "Staff and related users can create entries"
  on public.entries for insert
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_create_entries_for_horse(horse_id)
      and (
        public.can_access_contact(owner_contact_id)
        or public.can_access_horse(horse_id)
      )
      and (
        public.can_access_contact(payer_contact_id)
        or public.can_pay_invoices_for_horse(horse_id, payer_contact_id)
      )
      and (
        rider_contact_id is null
        or public.can_access_contact(rider_contact_id)
        or public.can_create_entries_for_horse(horse_id)
      )
      and (agent_user_id is null or agent_user_id = public.current_profile_id())
    )
    or (
      agent_user_id = public.current_profile_id()
      and public.can_create_entries_for_horse(horse_id)
    )
  );

drop policy if exists "Staff and related users can update entries" on public.entries;
create policy "Staff and related users can update entries"
  on public.entries for update
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
    or public.can_modify_entries_for_horse(horse_id)
  )
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      (
        created_by_user_id = public.current_profile_id()
        or agent_user_id = public.current_profile_id()
        or public.can_modify_entries_for_horse(horse_id)
      )
      and public.can_modify_entries_for_horse(horse_id)
      and (
        public.can_access_contact(payer_contact_id)
        or public.can_pay_invoices_for_horse(horse_id, payer_contact_id)
      )
    )
  );

drop policy if exists "Staff and related users can create stall bookings" on public.stall_bookings;
create policy "Staff and related users can create stall bookings"
  on public.stall_bookings for insert
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(booker_contact_id)
      and (
        public.can_access_contact(payer_contact_id)
        or (horse_id is not null and public.can_pay_invoices_for_horse(horse_id, payer_contact_id))
      )
      and (horse_id is null or public.can_book_stalls_for_horse(horse_id))
    )
  );

drop policy if exists "Staff and related users can update stall bookings" on public.stall_bookings;
create policy "Staff and related users can update stall bookings"
  on public.stall_bookings for update
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
  )
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or (
      created_by_user_id = public.current_profile_id()
      and public.can_access_contact(booker_contact_id)
      and (
        public.can_access_contact(payer_contact_id)
        or (horse_id is not null and public.can_pay_invoices_for_horse(horse_id, payer_contact_id))
      )
      and (horse_id is null or public.can_book_stalls_for_horse(horse_id))
    )
  );

drop policy if exists "Authenticated users can write audit events" on public.audit_events;
create policy "Authenticated users can write audit events"
  on public.audit_events for insert
  with check (
    auth.uid() is not null
    and (actor_user_id is null or actor_user_id = public.current_profile_id())
    and (
      organization_id is null
      or public.is_platform_admin()
      or public.is_org_member(organization_id, array['admin', 'secretary'])
    )
  );
