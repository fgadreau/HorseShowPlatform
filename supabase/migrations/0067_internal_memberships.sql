-- Internal organization memberships sold by the association.
--
-- External memberships (NRHA/AQHA/AQR numbers from another organization)
-- remain in contact_external_memberships. These tables model the cards an
-- organization sells for its own season.

alter table public.invoices
  alter column show_id drop not null;

drop index if exists public.idx_invoices_org_show_invoice_number;
create unique index if not exists idx_invoices_org_show_invoice_number
on public.invoices(organization_id, coalesce(show_id, '00000000-0000-0000-0000-000000000000'::uuid), invoice_number);

create or replace function public.next_invoice_number(target_organization_id uuid, target_show_id uuid)
returns varchar
language plpgsql
security definer
set search_path = public
as $$
declare
  next_number integer;
begin
  perform pg_advisory_xact_lock(
    hashtext(target_organization_id::text),
    hashtext(coalesce(target_show_id::text, 'association'))
  );

  select coalesce(max(invoice_number::integer), 0) + 1 into next_number
  from public.invoices
  where organization_id = target_organization_id
    and show_id is not distinct from target_show_id
    and invoice_number ~ '^[0-9]{4}$';

  if next_number > 9999 then
    raise exception 'Invoice number capacity reached for invoice scope %', coalesce(target_show_id::text, 'association')
      using errcode = '22003';
  end if;

  return lpad(next_number::text, 4, '0')::varchar;
end;
$$;

create table if not exists public.organization_membership_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  season_year integer not null,
  price numeric(10, 2) not null default 0 check (price >= 0),
  tax_applicable boolean not null default true,
  valid_from date not null,
  valid_until date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until >= valid_from),
  unique (organization_id, season_year, code)
);

create table if not exists public.contact_organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  membership_type_id uuid not null references public.organization_membership_types(id) on delete restrict,
  show_id uuid references public.shows(id) on delete set null,
  payer_contact_id uuid references public.contacts(id) on delete set null,
  season_year integer not null,
  membership_number text,
  status text not null default 'draft' check (status in ('draft', 'active', 'expired', 'cancelled')),
  valid_from date not null,
  valid_until date not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  notes text,
  sold_by_user_id uuid references public.user_profiles(id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until >= valid_from),
  unique (organization_id, contact_id, membership_type_id, season_year)
);

create table if not exists public.organization_products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  description text,
  category text not null default 'manual' check (category in ('stall_extra', 'feed', 'merch', 'ticket', 'meal', 'admin_fee', 'manual')),
  default_price numeric(10, 2) not null default 0 check (default_price >= 0),
  tax_applicable boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.manual_sales (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid references public.organization_products(id) on delete set null,
  show_id uuid references public.shows(id) on delete set null,
  payer_contact_id uuid not null references public.contacts(id) on delete restrict,
  sold_by_user_id uuid not null references public.user_profiles(id) on delete restrict,
  status text not null default 'active' check (status in ('draft', 'active', 'cancelled')),
  description text not null,
  quantity numeric(10, 2) not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null default 0 check (unit_price >= 0),
  tax_applicable boolean not null default true,
  invoice_id uuid references public.invoices(id) on delete set null,
  source_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.stall_options
  add column if not exists product_id uuid references public.organization_products(id) on delete set null;

create index if not exists idx_organization_membership_types_org
  on public.organization_membership_types(organization_id, season_year, is_active);

create index if not exists idx_contact_organization_memberships_org
  on public.contact_organization_memberships(organization_id, season_year, status);

create index if not exists idx_contact_organization_memberships_contact
  on public.contact_organization_memberships(contact_id, organization_id);

create index if not exists idx_contact_organization_memberships_show
  on public.contact_organization_memberships(show_id, payer_contact_id);

create index if not exists idx_organization_products_org
  on public.organization_products(organization_id, category, is_active);

create index if not exists idx_manual_sales_org
  on public.manual_sales(organization_id, show_id, payer_contact_id, status);

drop trigger if exists organization_membership_types_touch_updated_at
  on public.organization_membership_types;
create trigger organization_membership_types_touch_updated_at
  before update on public.organization_membership_types
  for each row execute function public.touch_updated_at();

drop trigger if exists contact_organization_memberships_touch_updated_at
  on public.contact_organization_memberships;
create trigger contact_organization_memberships_touch_updated_at
  before update on public.contact_organization_memberships
  for each row execute function public.touch_updated_at();

drop trigger if exists organization_products_touch_updated_at
  on public.organization_products;
create trigger organization_products_touch_updated_at
  before update on public.organization_products
  for each row execute function public.touch_updated_at();

drop trigger if exists manual_sales_touch_updated_at
  on public.manual_sales;
create trigger manual_sales_touch_updated_at
  before update on public.manual_sales
  for each row execute function public.touch_updated_at();

create or replace function public.set_internal_membership_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_type public.organization_membership_types;
begin
  select *
    into membership_type
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

  if not exists (
    select 1
    from public.contacts contact
    where contact.id = new.contact_id
      and (
        contact.organization_id = new.organization_id
        or exists (
          select 1
          from public.contact_organization_links link
          where link.organization_id = new.organization_id
            and link.contact_id = contact.id
        )
      )
  ) then
    raise exception 'Contact does not belong to the membership organization';
  end if;

  if new.payer_contact_id is not null and not exists (
    select 1
    from public.contacts contact
    where contact.id = new.payer_contact_id
      and (
        contact.organization_id = new.organization_id
        or exists (
          select 1
          from public.contact_organization_links link
          where link.organization_id = new.organization_id
            and link.contact_id = contact.id
        )
      )
  ) then
    raise exception 'Payer contact does not belong to the membership organization';
  end if;

  if new.show_id is not null and not exists (
    select 1
    from public.shows show_record
    where show_record.id = new.show_id
      and show_record.organization_id = new.organization_id
  ) then
    raise exception 'Show does not belong to the membership organization';
  end if;

  if new.status = 'active' and new.activated_at is null then
    new.activated_at := now();
  end if;

  return new;
end;
$$;

drop trigger if exists set_internal_membership_defaults_trigger
  on public.contact_organization_memberships;
create trigger set_internal_membership_defaults_trigger
  before insert or update on public.contact_organization_memberships
  for each row execute function public.set_internal_membership_defaults();

create or replace function public.sync_contact_organization_membership_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  membership_record record;
  target_invoice_id uuid;
  previous_invoice_id uuid;
  existing_line record;
  generated_invoice_number varchar(50);
  line_total numeric(12, 2);
  line_tax numeric(12, 2);
  line_description varchar(255);
begin
  if tg_op = 'DELETE' then
    select id, invoice_id into existing_line
    from public.invoice_line_items
    where item_id = old.id
      and item_type = 'membership'
    order by created_at desc
    limit 1;

    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    return old;
  end if;

  select
    membership_type.name,
    membership_type.code,
    membership_type.season_year,
    membership_type.price,
    membership_type.tax_applicable,
    coalesce(show_record.tax_rate, organization.tax_rate, 0) as tax_rate,
    trim(coalesce(contact.first_name, '') || ' ' || coalesce(contact.last_name, '')) as contact_name
  into membership_record
  from public.organization_membership_types membership_type
  join public.organizations organization on organization.id = membership_type.organization_id
  left join public.shows show_record on show_record.id = new.show_id
  left join public.contacts contact on contact.id = new.contact_id
  where membership_type.id = new.membership_type_id;

  if not found then
    return new;
  end if;

  select id, invoice_id into existing_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type = 'membership'
  order by created_at desc
  limit 1;

  if new.status = 'cancelled'
    or new.payer_contact_id is null
    or new.sold_by_user_id is null then
    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    if new.invoice_id is not null then
      update public.contact_organization_memberships
      set invoice_id = null
      where id = new.id;
    end if;

    return new;
  end if;

  select id into target_invoice_id
  from public.invoices
  where organization_id = new.organization_id
    and show_id is not distinct from new.show_id
    and payer_contact_id = new.payer_contact_id
    and status = 'draft'
  order by created_at desc
  limit 1;

  if target_invoice_id is null then
    generated_invoice_number := public.next_invoice_number(new.organization_id, new.show_id);

    insert into public.invoices (
      organization_id,
      show_id,
      invoice_number,
      payer_contact_id,
      created_by_user_id,
      status,
      subtotal,
      tax_amount,
      total_amount,
      total_paid
    )
    values (
      new.organization_id,
      new.show_id,
      generated_invoice_number,
      new.payer_contact_id,
      new.sold_by_user_id,
      'draft',
      0,
      0,
      0,
      0
    )
    returning id into target_invoice_id;
  end if;

  line_total := round(coalesce(membership_record.price, 0), 2);
  line_tax := case
    when coalesce(membership_record.tax_applicable, true)
      then round(line_total * coalesce(membership_record.tax_rate, 0) / 100, 2)
    else 0
  end;
  line_description := left(
    coalesce(membership_record.name, 'Membership')
      || ' ' || membership_record.season_year::text
      || case when membership_record.contact_name <> '' then ' / ' || membership_record.contact_name else '' end,
    255
  );

  if existing_line.id is null then
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
    values (
      new.organization_id,
      target_invoice_id,
      'membership',
      new.id,
      line_description,
      1,
      line_total,
      line_total,
      coalesce(membership_record.tax_applicable, true),
      line_tax
    );
  else
    previous_invoice_id := existing_line.invoice_id;

    update public.invoice_line_items
    set
      organization_id = new.organization_id,
      invoice_id = target_invoice_id,
      description = line_description,
      quantity = 1,
      unit_price = line_total,
      total_price = line_total,
      tax_applicable = coalesce(membership_record.tax_applicable, true),
      tax_amount = line_tax
    where id = existing_line.id;
  end if;

  perform public.recalculate_invoice_totals(target_invoice_id);

  if previous_invoice_id is not null and previous_invoice_id is distinct from target_invoice_id then
    perform public.recalculate_invoice_totals(previous_invoice_id);
  end if;

  if new.invoice_id is distinct from target_invoice_id then
    update public.contact_organization_memberships
    set invoice_id = target_invoice_id
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists contact_organization_memberships_invoice_sync
  on public.contact_organization_memberships;
create trigger contact_organization_memberships_invoice_sync
  after insert or update or delete on public.contact_organization_memberships
  for each row execute function public.sync_contact_organization_membership_invoice();

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
    select *
      into product_record
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

  if new.quantity is null then
    new.quantity := 1;
  end if;

  if new.unit_price is null then
    new.unit_price := 0;
  end if;

  if new.tax_applicable is null then
    new.tax_applicable := true;
  end if;

  if not exists (
    select 1
    from public.contacts contact
    where contact.id = new.payer_contact_id
      and (
        contact.organization_id = new.organization_id
        or exists (
          select 1
          from public.contact_organization_links link
          where link.organization_id = new.organization_id
            and link.contact_id = contact.id
        )
      )
  ) then
    raise exception 'Payer contact does not belong to the sale organization';
  end if;

  if new.show_id is not null and not exists (
    select 1
    from public.shows show_record
    where show_record.id = new.show_id
      and show_record.organization_id = new.organization_id
  ) then
    raise exception 'Show does not belong to the sale organization';
  end if;

  return new;
end;
$$;

drop trigger if exists set_manual_sale_defaults_trigger
  on public.manual_sales;
create trigger set_manual_sale_defaults_trigger
  before insert or update on public.manual_sales
  for each row execute function public.set_manual_sale_defaults();

create or replace function public.manual_sale_invoice_item_type(target_category text)
returns text
language sql
immutable
as $$
  select case
    when target_category in ('stall_extra', 'feed') then 'extra'
    else 'manual'
  end
$$;

create or replace function public.sync_manual_sale_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  product_category text;
  target_invoice_id uuid;
  previous_invoice_id uuid;
  existing_line record;
  generated_invoice_number varchar(50);
  line_item_type text;
  line_total numeric(12, 2);
  line_tax numeric(12, 2);
  tax_rate numeric(10, 4);
begin
  if tg_op = 'DELETE' then
    select id, invoice_id into existing_line
    from public.invoice_line_items
    where item_id = old.id
      and item_type in ('extra', 'manual')
    order by created_at desc
    limit 1;

    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    return old;
  end if;

  select coalesce(product.category, 'manual')
    into product_category
  from public.organization_products product
  where product.id = new.product_id;

  product_category := coalesce(product_category, 'manual');

  select coalesce(show_record.tax_rate, organization.tax_rate, 0)
    into tax_rate
  from public.organizations organization
  left join public.shows show_record on show_record.id = new.show_id
  where organization.id = new.organization_id;

  select id, invoice_id into existing_line
  from public.invoice_line_items
  where item_id = new.id
    and item_type in ('extra', 'manual')
  order by created_at desc
  limit 1;

  if new.status = 'cancelled' then
    if existing_line.id is not null then
      previous_invoice_id := existing_line.invoice_id;

      delete from public.invoice_line_items
      where id = existing_line.id;

      perform public.recalculate_invoice_totals(previous_invoice_id);
    end if;

    if new.invoice_id is not null then
      update public.manual_sales
      set invoice_id = null
      where id = new.id;
    end if;

    return new;
  end if;

  select id into target_invoice_id
  from public.invoices
  where organization_id = new.organization_id
    and show_id is not distinct from new.show_id
    and payer_contact_id = new.payer_contact_id
    and status = 'draft'
  order by created_at desc
  limit 1;

  if target_invoice_id is null then
    generated_invoice_number := public.next_invoice_number(new.organization_id, new.show_id);

    insert into public.invoices (
      organization_id,
      show_id,
      invoice_number,
      payer_contact_id,
      created_by_user_id,
      status,
      subtotal,
      tax_amount,
      total_amount,
      total_paid
    )
    values (
      new.organization_id,
      new.show_id,
      generated_invoice_number,
      new.payer_contact_id,
      new.sold_by_user_id,
      'draft',
      0,
      0,
      0,
      0
    )
    returning id into target_invoice_id;
  end if;

  line_item_type := public.manual_sale_invoice_item_type(product_category);
  line_total := round(coalesce(new.quantity, 0) * coalesce(new.unit_price, 0), 2);
  line_tax := case
    when coalesce(new.tax_applicable, true)
      then round(line_total * coalesce(tax_rate, 0) / 100, 2)
    else 0
  end;

  if existing_line.id is null then
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
    values (
      new.organization_id,
      target_invoice_id,
      line_item_type,
      new.id,
      left(new.description, 255),
      new.quantity,
      new.unit_price,
      line_total,
      new.tax_applicable,
      line_tax
    );
  else
    previous_invoice_id := existing_line.invoice_id;

    update public.invoice_line_items
    set
      organization_id = new.organization_id,
      invoice_id = target_invoice_id,
      item_type = line_item_type,
      description = left(new.description, 255),
      quantity = new.quantity,
      unit_price = new.unit_price,
      total_price = line_total,
      tax_applicable = new.tax_applicable,
      tax_amount = line_tax
    where id = existing_line.id;
  end if;

  perform public.recalculate_invoice_totals(target_invoice_id);

  if previous_invoice_id is not null and previous_invoice_id is distinct from target_invoice_id then
    perform public.recalculate_invoice_totals(previous_invoice_id);
  end if;

  if new.invoice_id is distinct from target_invoice_id then
    update public.manual_sales
    set invoice_id = target_invoice_id
    where id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists manual_sales_invoice_sync
  on public.manual_sales;
create trigger manual_sales_invoice_sync
  after insert or update or delete on public.manual_sales
  for each row execute function public.sync_manual_sale_invoice();

alter table public.organization_membership_types enable row level security;
alter table public.contact_organization_memberships enable row level security;
alter table public.organization_products enable row level security;
alter table public.manual_sales enable row level security;

drop policy if exists "Members can view internal membership types"
  on public.organization_membership_types;
create policy "Members can view internal membership types"
  on public.organization_membership_types for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Staff can manage internal membership types"
  on public.organization_membership_types;
create policy "Staff can manage internal membership types"
  on public.organization_membership_types for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

drop policy if exists "Members can view internal memberships"
  on public.contact_organization_memberships;
create policy "Members can view internal memberships"
  on public.contact_organization_memberships for select
  to authenticated
  using (
    public.is_org_member(organization_id)
    or exists (
      select 1
      from public.contacts contact
      where contact.id = contact_organization_memberships.contact_id
        and contact.linked_user_id = public.current_profile_id()
    )
  );

drop policy if exists "Staff can manage internal memberships"
  on public.contact_organization_memberships;
create policy "Staff can manage internal memberships"
  on public.contact_organization_memberships for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

drop policy if exists "Members can view organization products"
  on public.organization_products;
create policy "Members can view organization products"
  on public.organization_products for select
  to authenticated
  using (public.is_org_member(organization_id));

drop policy if exists "Staff can manage organization products"
  on public.organization_products;
create policy "Staff can manage organization products"
  on public.organization_products for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

drop policy if exists "Staff can view manual sales"
  on public.manual_sales;
create policy "Staff can view manual sales"
  on public.manual_sales for select
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

drop policy if exists "Staff can manage manual sales"
  on public.manual_sales;
create policy "Staff can manage manual sales"
  on public.manual_sales for all
  to authenticated
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));
