-- No seeds, credentials or positive verification. Distributed OMVQ throttle and private test inbox.
create table public.vet_worker_throttle(id boolean primary key default true check(id),next_lookup_at timestamptz not null default '-infinity');
insert into public.vet_worker_throttle(id) values(true);
alter table public.vet_worker_throttle enable row level security;
revoke all on public.vet_worker_throttle from public,anon,authenticated;
create function public.vet_claim_omvq_lookup() returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.vet_worker_throttle set next_lookup_at=clock_timestamp()+interval '65 seconds' where id and next_lookup_at<=clock_timestamp();
 return found;
end $$;
revoke all on function public.vet_claim_omvq_lookup() from public,anon,authenticated;
grant execute on function public.vet_claim_omvq_lookup() to service_role;

create table public.vet_preprod_outbox(
 id uuid primary key default gen_random_uuid(),issuer_id uuid not null references public.vet_issuers(id),
 created_by uuid not null references public.user_profiles(id),recipient text not null check(length(recipient) between 3 and 254),
 kind text not null check(kind in ('authorization','certificate')),certificate_id uuid references public.vet_certificates(id),
 encrypted_message text not null check(length(encrypted_message)<4000000),
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '24 hours'
);
alter table public.vet_preprod_outbox enable row level security;
revoke all on public.vet_preprod_outbox from public,anon,authenticated;
grant all on public.vet_preprod_outbox to service_role;
grant select(id,issuer_id,recipient,kind,certificate_id,created_at,expires_at) on public.vet_preprod_outbox to authenticated;
create policy vet_preprod_outbox_read on public.vet_preprod_outbox for select to authenticated
 using(created_by=public.current_profile_id() and public.vet_has_access(issuer_id) and expires_at>now());
alter table public.vet_certificate_deliveries drop constraint vet_certificate_deliveries_status_check;
alter table public.vet_certificate_deliveries add constraint vet_certificate_deliveries_status_check check(status in ('queued','processing','local_captured','preprod_captured','uncertain'));
alter table public.vet_certificate_deliveries drop constraint vet_certificate_deliveries_transport_check;
alter table public.vet_certificate_deliveries add constraint vet_certificate_deliveries_transport_check check(transport in ('mailpit_local','preprod_private'));
