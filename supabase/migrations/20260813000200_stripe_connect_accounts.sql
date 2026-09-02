-- One Stripe Express test account receives each association's invoice proceeds.
-- No bank, identity, or card data is persisted in HSP.
create table if not exists public.stripe_connect_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_account_id varchar(255) not null unique,
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  requirements_due text[] not null default '{}',
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stripe_connect_account_id_format check (stripe_account_id like 'acct_%')
);

create trigger stripe_connect_accounts_touch_updated_at
before update on public.stripe_connect_accounts
for each row execute function public.touch_updated_at();

alter table public.stripe_connect_accounts enable row level security;

create policy "Association managers can view Stripe Connect status"
on public.stripe_connect_accounts for select
using (public.is_platform_admin() or public.is_org_member(organization_id, array['admin', 'secretary']));

grant select on table public.stripe_connect_accounts to authenticated;

notify pgrst, 'reload schema';
