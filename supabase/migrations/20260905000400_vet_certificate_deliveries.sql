-- Trusted local worker records delivery attempts. Clients cannot forge delivery status.
create table public.vet_certificate_deliveries (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null,
 certificate_id uuid not null references public.vet_certificates(id),
 issuer_id uuid not null references public.vet_issuers(id),
 created_by uuid not null references public.user_profiles(id),
 recipient text not null check(length(recipient) between 3 and 254),
 status text not null default 'queued' check(status in ('queued','processing','local_captured','uncertain')),
 transport text not null default 'mailpit_local' check(transport='mailpit_local'),
 created_at timestamptz not null default now(), completed_at timestamptz,
 unique(request_id,recipient)
);
alter table public.vet_certificate_deliveries enable row level security;
revoke all on public.vet_certificate_deliveries from anon,authenticated;
grant select on public.vet_certificate_deliveries to authenticated;
grant all on public.vet_certificate_deliveries to service_role;
create policy vet_delivery_read on public.vet_certificate_deliveries for select to authenticated
 using(public.vet_has_access(issuer_id));
