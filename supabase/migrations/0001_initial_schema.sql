create extension if not exists pgcrypto;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  first_name varchar(100),
  last_name varchar(100),
  phone varchar(20),
  type_user varchar(50) check (type_user in ('owner', 'agent', 'secretary', 'admin')),
  address varchar(255),
  city varchar(100),
  state varchar(50),
  zip_code varchar(20),
  country varchar(2),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.user_profiles(id) on delete cascade,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name varchar(255) not null,
  slug varchar(100) unique not null,
  description text,
  primary_contact_name varchar(255),
  primary_contact_email varchar(255),
  primary_contact_phone varchar(20),
  address varchar(255),
  city varchar(100),
  state varchar(50),
  zip_code varchar(20),
  country varchar(2),
  logo_url text,
  website_url text,
  subscription_plan varchar(50) not null default 'free',
  subscription_status varchar(50) not null default 'active',
  stripe_customer_id varchar(255),
  timezone varchar(50) not null default 'UTC',
  currency varchar(3) not null default 'USD',
  modules_enabled jsonb not null default '{"entries": true, "stall_booking": true, "show_score": false, "year_end_awards": false}'::jsonb,
  tax_rate numeric(5, 2) not null default 0.00,
  default_refund_policy varchar(50) not null default 'full_refund',
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role varchar(50) not null check (role in ('admin', 'secretary', 'user')),
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table public.shows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name varchar(255) not null,
  slug varchar(100) not null,
  description text,
  start_date date not null,
  end_date date not null,
  location varchar(255),
  city varchar(100),
  state varchar(50),
  zip_code varchar(20),
  country varchar(2),
  coordinates point,
  status varchar(50) not null default 'draft' check (status in ('draft', 'open', 'closed', 'archived')),
  timezone varchar(50),
  modules_enabled jsonb,
  default_currency varchar(3),
  tax_rate numeric(5, 2),
  is_public boolean not null default false,
  show_schedule_public boolean not null default false,
  show_draw_public boolean not null default false,
  show_results_public boolean not null default false,
  show_standings_public boolean not null default false,
  image_url text,
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.show_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  role varchar(50) not null check (role in ('organizer', 'secretary', 'judge', 'scribe', 'announcer')),
  scope varchar(50) not null default 'show' check (scope in ('show', 'ring', 'class')),
  scope_id uuid,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, user_id, role)
);

create table public.show_days (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  day_date date not null,
  day_name varchar(50),
  day_number smallint,
  start_time time,
  end_time time,
  gate_open_time time,
  max_entries_per_class smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (show_id, day_date)
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  name varchar(255) not null,
  code varchar(50),
  description text,
  min_entries smallint not null default 2,
  entry_fee numeric(10, 2),
  payment_method varchar(50) not null default 'any',
  class_block_id uuid,
  show_day_id uuid references public.show_days(id),
  scheduled_time time,
  estimated_duration interval,
  ring_number smallint not null default 1,
  status varchar(50) not null default 'open' check (status in ('open', 'closed', 'running', 'finished')),
  is_public boolean not null default true,
  requires_membership varchar(255),
  requires_coggins boolean not null default false,
  requires_health_cert boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.divisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  name varchar(255) not null,
  level smallint,
  code varchar(50),
  is_split_results boolean not null default true,
  is_split_classes boolean not null default false,
  entry_fee numeric(10, 2),
  min_age smallint,
  max_age smallint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, name)
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  type varchar(50) not null check (type in ('owner', 'agent', 'rider', 'payer', 'other')),
  first_name varchar(100) not null,
  last_name varchar(100) not null,
  email varchar(255),
  phone varchar(20),
  address varchar(255),
  city varchar(100),
  state varchar(50),
  zip_code varchar(20),
  country varchar(2),
  linked_user_id uuid unique references public.user_profiles(id) on delete set null,
  barn_name varchar(255),
  notes text,
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, email)
);

create table public.horses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name varchar(255) not null,
  breed varchar(100),
  color varchar(100),
  gender varchar(10) check (gender in ('M', 'F', 'G')),
  birth_year smallint,
  registration_number varchar(100),
  registration_organization varchar(100),
  primary_owner_contact_id uuid not null references public.contacts(id),
  coggins_expiry date,
  health_cert_expiry date,
  registration_doc_url text,
  notes text,
  created_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.horse_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  role varchar(50) not null check (role in ('owner', 'co-owner', 'agent', 'rider', 'manager')),
  can_create_entries boolean not null default false,
  can_modify_entries boolean not null default false,
  can_book_stalls boolean not null default false,
  can_pay_invoices boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (horse_id, contact_id, role)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  horse_id uuid not null references public.horses(id) on delete cascade,
  division_id uuid not null references public.divisions(id) on delete cascade,
  created_by_user_id uuid not null references public.user_profiles(id),
  owner_contact_id uuid not null references public.contacts(id),
  agent_user_id uuid references public.user_profiles(id),
  rider_contact_id uuid references public.contacts(id),
  payer_contact_id uuid not null references public.contacts(id),
  status varchar(50) not null default 'draft' check (
    status in ('draft', 'pending_checkout', 'active', 'scratched_pending_refund', 'scratched', 'completed', 'cancelled')
  ),
  membership_verified boolean not null default false,
  membership_verified_at timestamptz,
  coggins_verified boolean not null default false,
  coggins_verified_at timestamptz,
  health_cert_verified boolean not null default false,
  health_cert_verified_at timestamptz,
  entry_number smallint,
  base_fee numeric(10, 2),
  total_fees numeric(10, 2),
  notes text,
  special_requests text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  scratched_at timestamptz,
  scratched_by_user_id uuid references public.user_profiles(id),
  unique (show_id, horse_id, division_id)
);

create table public.stall_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  name varchar(255) not null,
  description text,
  price numeric(10, 2) not null,
  total_quantity smallint not null check (total_quantity >= 0),
  available_quantity smallint not null check (available_quantity >= 0),
  duration_days smallint,
  show_day_start_id uuid references public.show_days(id),
  show_day_end_id uuid references public.show_days(id),
  category varchar(50) check (category in ('stall', 'camping', 'parking', 'extra')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (available_quantity <= total_quantity)
);

create table public.stall_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  stall_option_id uuid not null references public.stall_options(id),
  horse_id uuid references public.horses(id),
  created_by_user_id uuid not null references public.user_profiles(id),
  booker_contact_id uuid not null references public.contacts(id),
  payer_contact_id uuid not null references public.contacts(id),
  status varchar(50) not null default 'reserved' check (status in ('requested', 'reserved', 'active', 'cancelled', 'completed')),
  show_day_start_id uuid not null references public.show_days(id),
  show_day_end_id uuid not null references public.show_days(id),
  unit_price numeric(10, 2),
  total_price numeric(10, 2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.user_profiles(id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  invoice_number varchar(50) unique not null,
  payer_contact_id uuid not null references public.contacts(id),
  created_by_user_id uuid not null references public.user_profiles(id),
  issue_date date not null default current_date,
  due_date date,
  status varchar(50) not null default 'draft' check (status in ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'void')),
  subtotal numeric(12, 2) not null default 0,
  tax_amount numeric(12, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  total_paid numeric(12, 2) not null default 0,
  balance_due numeric(12, 2) generated always as (total_amount - total_paid) stored,
  notes text,
  payment_terms text,
  sent_at timestamptz,
  sent_by_user_id uuid references public.user_profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  item_type varchar(50) not null check (item_type in ('entry', 'stall', 'extra', 'membership', 'fee', 'discount', 'tax', 'manual')),
  item_id uuid,
  description varchar(255) not null,
  quantity numeric(10, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total_price numeric(12, 2) not null,
  tax_applicable boolean not null default true,
  tax_amount numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  payment_method varchar(50) not null check (payment_method in ('stripe', 'cash', 'check', 'etransfer', 'bank_transfer', 'manual', 'comped')),
  amount numeric(12, 2) not null,
  currency varchar(3) not null default 'USD',
  stripe_payment_intent_id varchar(255),
  stripe_charge_id varchar(255),
  check_number varchar(50),
  bank_transfer_ref varchar(255),
  etransfer_ref varchar(255),
  status varchar(50) not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded')),
  created_by_user_id uuid not null references public.user_profiles(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  refunded_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  actor_user_id uuid references public.user_profiles(id),
  event_type varchar(100) not null,
  entity_type varchar(100) not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_user_profiles_user_id on public.user_profiles(user_id);
create index idx_platform_admins_user_id on public.platform_admins(user_id);
create index idx_organizations_slug on public.organizations(slug);
create index idx_organization_members_org_id on public.organization_members(organization_id);
create index idx_organization_members_user_id on public.organization_members(user_id);
create index idx_organization_members_role on public.organization_members(role);
create index idx_shows_org_id on public.shows(organization_id);
create index idx_shows_status on public.shows(status);
create index idx_shows_dates on public.shows(start_date, end_date);
create index idx_show_roles_show_id on public.show_roles(show_id);
create index idx_show_roles_user_id on public.show_roles(user_id);
create index idx_show_days_show_id on public.show_days(show_id);
create index idx_classes_show_id on public.classes(show_id);
create index idx_classes_day_id on public.classes(show_day_id);
create index idx_classes_status on public.classes(status);
create index idx_divisions_class_id on public.divisions(class_id);
create index idx_contacts_org_id on public.contacts(organization_id);
create index idx_contacts_type on public.contacts(type);
create index idx_contacts_linked_user_id on public.contacts(linked_user_id);
create index idx_horses_org_id on public.horses(organization_id);
create index idx_horses_owner_contact_id on public.horses(primary_owner_contact_id);
create index idx_horse_contacts_horse_id on public.horse_contacts(horse_id);
create index idx_horse_contacts_contact_id on public.horse_contacts(contact_id);
create index idx_entries_show_id on public.entries(show_id);
create index idx_entries_horse_id on public.entries(horse_id);
create index idx_entries_division_id on public.entries(division_id);
create index idx_entries_status on public.entries(status);
create index idx_entries_payer_contact_id on public.entries(payer_contact_id);
create index idx_stall_options_show_id on public.stall_options(show_id);
create index idx_stall_bookings_show_id on public.stall_bookings(show_id);
create index idx_stall_bookings_horse_id on public.stall_bookings(horse_id);
create index idx_stall_bookings_status on public.stall_bookings(status);
create index idx_invoices_show_id on public.invoices(show_id);
create index idx_invoices_org_id on public.invoices(organization_id);
create index idx_invoices_payer_contact_id on public.invoices(payer_contact_id);
create index idx_invoices_status on public.invoices(status);
create index idx_invoices_invoice_number on public.invoices(invoice_number);
create index idx_invoice_line_items_invoice_id on public.invoice_line_items(invoice_id);
create index idx_payments_invoice_id on public.payments(invoice_id);
create index idx_payments_status on public.payments(status);
create index idx_payments_stripe_payment_intent_id on public.payments(stripe_payment_intent_id);
create index idx_audit_events_org_id on public.audit_events(organization_id);
create index idx_audit_events_entity on public.audit_events(entity_type, entity_id);

create trigger user_profiles_touch_updated_at before update on public.user_profiles for each row execute function public.touch_updated_at();
create trigger platform_admins_touch_updated_at before update on public.platform_admins for each row execute function public.touch_updated_at();
create trigger organizations_touch_updated_at before update on public.organizations for each row execute function public.touch_updated_at();
create trigger organization_members_touch_updated_at before update on public.organization_members for each row execute function public.touch_updated_at();
create trigger shows_touch_updated_at before update on public.shows for each row execute function public.touch_updated_at();
create trigger show_roles_touch_updated_at before update on public.show_roles for each row execute function public.touch_updated_at();
create trigger show_days_touch_updated_at before update on public.show_days for each row execute function public.touch_updated_at();
create trigger classes_touch_updated_at before update on public.classes for each row execute function public.touch_updated_at();
create trigger divisions_touch_updated_at before update on public.divisions for each row execute function public.touch_updated_at();
create trigger contacts_touch_updated_at before update on public.contacts for each row execute function public.touch_updated_at();
create trigger horses_touch_updated_at before update on public.horses for each row execute function public.touch_updated_at();
create trigger horse_contacts_touch_updated_at before update on public.horse_contacts for each row execute function public.touch_updated_at();
create trigger entries_touch_updated_at before update on public.entries for each row execute function public.touch_updated_at();
create trigger stall_options_touch_updated_at before update on public.stall_options for each row execute function public.touch_updated_at();
create trigger stall_bookings_touch_updated_at before update on public.stall_bookings for each row execute function public.touch_updated_at();
create trigger invoices_touch_updated_at before update on public.invoices for each row execute function public.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payments for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.user_profiles where user_id = auth.uid()
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.platform_admins
    where user_id = public.current_profile_id()
  )
$$;

create or replace function public.is_org_member(target_organization_id uuid, accepted_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members
    where organization_id = target_organization_id
      and user_id = public.current_profile_id()
      and (accepted_roles is null or role = any(accepted_roles))
  )
$$;

create or replace function public.has_show_role(target_show_id uuid, accepted_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.show_roles
    where show_id = target_show_id
      and user_id = public.current_profile_id()
      and (accepted_roles is null or role = any(accepted_roles))
  )
$$;

create or replace function public.can_manage_show(target_show_id uuid, accepted_roles text[] default array['organizer', 'secretary'])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.shows
      where id = target_show_id
        and public.is_org_member(organization_id, array['admin'])
    )
    or public.has_show_role(target_show_id, accepted_roles)
$$;

create or replace function public.can_access_contact(target_contact_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contacts
    where id = target_contact_id
      and linked_user_id = public.current_profile_id()
  )
$$;

create or replace function public.can_access_horse(target_horse_id uuid)
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
  )
$$;

alter table public.user_profiles enable row level security;
alter table public.platform_admins enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.shows enable row level security;
alter table public.show_roles enable row level security;
alter table public.show_days enable row level security;
alter table public.classes enable row level security;
alter table public.divisions enable row level security;
alter table public.contacts enable row level security;
alter table public.horses enable row level security;
alter table public.horse_contacts enable row level security;
alter table public.entries enable row level security;
alter table public.stall_options enable row level security;
alter table public.stall_bookings enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_events enable row level security;

create policy "Users can create their own profile"
  on public.user_profiles for insert
  with check (user_id = auth.uid());

create policy "Users can view own or related profiles"
  on public.user_profiles for select
  using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.user_id = public.user_profiles.id
        and public.is_org_member(om.organization_id)
    )
  );

create policy "Users can update their own profile"
  on public.user_profiles for update
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

create policy "Platform admins manage platform admins"
  on public.platform_admins for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy "Members can view organizations"
  on public.organizations for select
  using (public.is_platform_admin() or public.is_org_member(id));

create policy "Authenticated users can create organizations"
  on public.organizations for insert
  with check (auth.uid() is not null and created_by_user_id = public.current_profile_id());

create policy "Organization admins can update organizations"
  on public.organizations for update
  using (public.is_platform_admin() or public.is_org_member(id, array['admin']))
  with check (public.is_platform_admin() or public.is_org_member(id, array['admin']));

create policy "Members can view organization memberships"
  on public.organization_members for select
  using (public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization admins can manage memberships"
  on public.organization_members for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']));

create policy "Organization creator can claim first admin membership"
  on public.organization_members for insert
  with check (
    user_id = public.current_profile_id()
    and role = 'admin'
    and exists (
      select 1
      from public.organizations o
      where o.id = organization_id
        and o.created_by_user_id = public.current_profile_id()
    )
    and not exists (
      select 1
      from public.organization_members om
      where om.organization_id = organization_id
    )
  );

create policy "Public and members can view shows"
  on public.shows for select
  using (is_public or public.is_platform_admin() or public.is_org_member(organization_id));

create policy "Organization admins can create shows"
  on public.shows for insert
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']));

create policy "Show managers can update shows"
  on public.shows for update
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']) or public.has_show_role(id, array['organizer']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']) or public.has_show_role(id, array['organizer']));

create policy "Organization admins can delete shows"
  on public.shows for delete
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']));

create policy "Members can view show roles"
  on public.show_roles for select
  using (public.is_platform_admin() or public.is_org_member(organization_id) or public.has_show_role(show_id));

create policy "Organization admins can manage show roles"
  on public.show_roles for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin']));

create policy "Public and members can view show days"
  on public.show_days for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or exists (select 1 from public.shows s where s.id = show_id and (s.is_public or s.show_schedule_public))
  );

create policy "Show organizers manage show days"
  on public.show_days for all
  using (public.can_manage_show(show_id, array['organizer']))
  with check (public.can_manage_show(show_id, array['organizer']));

create policy "Public and members can view classes"
  on public.classes for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or (is_public and exists (select 1 from public.shows s where s.id = show_id and (s.is_public or s.show_schedule_public)))
  );

create policy "Show organizers manage classes"
  on public.classes for all
  using (public.can_manage_show(show_id, array['organizer']))
  with check (public.can_manage_show(show_id, array['organizer']));

create policy "Public and members can view divisions"
  on public.divisions for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or exists (
      select 1
      from public.classes c
      join public.shows s on s.id = c.show_id
      where c.id = class_id
        and c.is_public
        and (s.is_public or s.show_schedule_public)
    )
  );

create policy "Show organizers manage divisions"
  on public.divisions for all
  using (public.can_manage_show(show_id, array['organizer']))
  with check (public.can_manage_show(show_id, array['organizer']));

create policy "Staff and linked users can view contacts"
  on public.contacts for select
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or linked_user_id = public.current_profile_id());

create policy "Staff and linked users can create contacts"
  on public.contacts for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or linked_user_id = public.current_profile_id()
  );

create policy "Staff and linked users can update contacts"
  on public.contacts for update
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or linked_user_id = public.current_profile_id())
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or linked_user_id = public.current_profile_id());

create policy "Staff and related users can view horses"
  on public.horses for select
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or public.can_access_horse(id));

create policy "Staff and creators can create horses"
  on public.horses for insert
  with check (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or created_by_user_id = public.current_profile_id()
  );

create policy "Staff and related users can update horses"
  on public.horses for update
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or public.can_access_horse(id))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or public.can_access_horse(id));

create policy "Staff and related users can view horse contacts"
  on public.horse_contacts for select
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']) or public.can_access_contact(contact_id));

create policy "Staff manage horse contacts"
  on public.horse_contacts for all
  using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']))
  with check (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

create policy "Staff and related users can view entries"
  on public.entries for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.has_show_role(show_id, array['organizer', 'secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
    or public.can_access_contact(owner_contact_id)
    or public.can_access_contact(payer_contact_id)
    or public.can_access_horse(horse_id)
  );

create policy "Staff and related users can create entries"
  on public.entries for insert
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
  );

create policy "Staff and related users can update entries"
  on public.entries for update
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
    or public.can_access_horse(horse_id)
  )
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or agent_user_id = public.current_profile_id()
    or public.can_access_horse(horse_id)
  );

create policy "Public and members can view stall options"
  on public.stall_options for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id)
    or exists (select 1 from public.shows s where s.id = show_id and s.is_public)
  );

create policy "Show organizers manage stall options"
  on public.stall_options for all
  using (public.can_manage_show(show_id, array['organizer']))
  with check (public.can_manage_show(show_id, array['organizer']));

create policy "Staff and related users can view stall bookings"
  on public.stall_bookings for select
  using (
    public.can_manage_show(show_id, array['organizer', 'secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
    or public.can_access_contact(payer_contact_id)
    or (horse_id is not null and public.can_access_horse(horse_id))
  );

create policy "Staff and related users can create stall bookings"
  on public.stall_bookings for insert
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
  );

create policy "Staff and related users can update stall bookings"
  on public.stall_bookings for update
  using (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
  )
  with check (
    public.can_manage_show(show_id, array['secretary'])
    or created_by_user_id = public.current_profile_id()
    or public.can_access_contact(booker_contact_id)
  );

create policy "Staff and payers can view invoices"
  on public.invoices for select
  using (
    public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.has_show_role(show_id, array['secretary'])
    or public.can_access_contact(payer_contact_id)
  );

create policy "Staff can create invoices"
  on public.invoices for insert
  with check (public.can_manage_show(show_id, array['secretary']));

create policy "Staff can update invoices"
  on public.invoices for update
  using (public.can_manage_show(show_id, array['secretary']))
  with check (public.can_manage_show(show_id, array['secretary']));

create policy "Invoice viewers can view line items"
  on public.invoice_line_items for select
  using (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_id
        and (
          public.is_platform_admin()
          or public.is_org_member(i.organization_id, array['admin', 'secretary'])
          or public.has_show_role(i.show_id, array['secretary'])
          or public.can_access_contact(i.payer_contact_id)
        )
    )
  );

create policy "Staff can manage line items"
  on public.invoice_line_items for all
  using (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.can_manage_show(i.show_id, array['secretary']))
  )
  with check (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.can_manage_show(i.show_id, array['secretary']))
  );

create policy "Invoice viewers can view payments"
  on public.payments for select
  using (
    exists (
      select 1
      from public.invoices i
      where i.id = invoice_id
        and (
          public.is_platform_admin()
          or public.is_org_member(i.organization_id, array['admin', 'secretary'])
          or public.has_show_role(i.show_id, array['secretary'])
          or public.can_access_contact(i.payer_contact_id)
        )
    )
  );

create policy "Staff can record payments"
  on public.payments for insert
  with check (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.can_manage_show(i.show_id, array['secretary']))
  );

create policy "Staff can update payments"
  on public.payments for update
  using (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.can_manage_show(i.show_id, array['secretary']))
  )
  with check (
    exists (select 1 from public.invoices i where i.id = invoice_id and public.can_manage_show(i.show_id, array['secretary']))
  );

create policy "Organization admins can view audit events"
  on public.audit_events for select
  using (public.is_platform_admin() or (organization_id is not null and public.is_org_member(organization_id, array['admin'])));

create policy "Authenticated users can write audit events"
  on public.audit_events for insert
  with check (auth.uid() is not null);

insert into storage.buckets (id, name, public)
values
  ('organization-logos', 'organization-logos', true),
  ('show-documents', 'show-documents', false),
  ('horse-documents', 'horse-documents', false),
  ('invoices', 'invoices', false),
  ('health-documents', 'health-documents', false)
on conflict (id) do nothing;

create policy "Public can view organization logos"
  on storage.objects for select
  using (bucket_id = 'organization-logos');

create policy "Authenticated users can upload MVP files"
  on storage.objects for insert
  with check (
    auth.uid() is not null
    and bucket_id in ('organization-logos', 'show-documents', 'horse-documents', 'invoices', 'health-documents')
  );
