-- Stripe owns all cardholder data. HSP stores only the opaque Customer reference
-- required to open a short-lived, authenticated Stripe CustomerSession.
create table if not exists public.stripe_payment_profiles (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null unique references public.contacts(id) on delete cascade,
  stripe_customer_id varchar(255) not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger stripe_payment_profiles_touch_updated_at
before update on public.stripe_payment_profiles
for each row execute function public.touch_updated_at();

alter table public.stripe_payment_profiles enable row level security;

create policy "Users can view their own Stripe payment profile"
on public.stripe_payment_profiles for select
using (
  exists (
    select 1
    from public.contacts
    where contacts.id = stripe_payment_profiles.contact_id
      and contacts.linked_user_id = public.current_profile_id()
  )
);

-- Creation and mutation happen only through the service-role Edge Function.
grant select on table public.stripe_payment_profiles to authenticated;

create table if not exists public.stripe_webhook_events (
  stripe_event_id varchar(255) primary key,
  event_type varchar(100) not null,
  livemode boolean not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

create unique index if not exists idx_payments_stripe_payment_intent_unique
on public.payments(stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

-- Only the service-role webhook may read or mutate event receipts.

notify pgrst, 'reload schema';
