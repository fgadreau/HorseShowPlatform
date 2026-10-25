-- Operational hosting only. No activation, scheduler, external call or financial rewrite.
begin;
create table public.billing_hosted_inbox (
 id text primary key check(id ~ '^evt_[A-Za-z0-9]+$'),
 context_id uuid not null references public.billing_contexts(id),
 scope text not null check(scope in ('platform','connect')),
 event jsonb not null check(event->>'livemode'='false'),
 received_at timestamptz not null default clock_timestamp(),
 processed_at timestamptz, attempts integer not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(), last_error text
);
create index billing_hosted_inbox_due on public.billing_hosted_inbox(next_attempt_at,received_at) where processed_at is null;
create table public.billing_hosted_lanes (
 lane text primary key check(lane in ('stripe','pdf')),
 token uuid, lease_until timestamptz, last_started_at timestamptz, last_finished_at timestamptz,
 last_error text
);
insert into public.billing_hosted_lanes(lane) values ('stripe'),('pdf');
create table public.billing_hosted_reconciliation (
 attempt_id uuid primary key references public.billing_stripe_attempts(id),
 next_attempt_at timestamptz not null default clock_timestamp(), last_error text
);
alter table public.billing_hosted_inbox enable row level security;
alter table public.billing_hosted_lanes enable row level security;
alter table public.billing_hosted_reconciliation enable row level security;
revoke all on public.billing_hosted_inbox,public.billing_hosted_lanes,public.billing_hosted_reconciliation from public,anon,authenticated,service_role;

create function public.billing_hosted_scope(p_context uuid,p_folio uuid default null,p_document uuid default null,p_attempt uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
 select case when p_folio is not null then exists(select 1 from public.billing_folios where id=p_folio and billing_context_id=p_context)
 when p_document is not null then exists(select 1 from public.billing_documents d join public.billing_folios f on f.id=d.folio_id where d.id=p_document and f.billing_context_id=p_context)
 when p_attempt is not null then exists(select 1 from public.billing_stripe_attempts where id=p_attempt and context_id=p_context)
 else false end
$$;
create function public.billing_hosted_receive(p_context uuid,p_scope text,p_event jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous public.billing_hosted_inbox;
begin
 if p_event->>'livemode' is distinct from 'false' or p_event#>>'{data,object,livemode}' is distinct from 'false'
 or p_event->>'id' is null or p_event->>'type' is null or p_event#>>'{data,object,id}' is null then raise exception 'BILLING_TEST_ONLY'; end if;
 insert into public.billing_hosted_inbox(id,context_id,scope,event) values(p_event->>'id',p_context,p_scope,p_event) on conflict(id) do nothing;
 select * into previous from public.billing_hosted_inbox where id=p_event->>'id';
 if previous.context_id is distinct from p_context or previous.scope is distinct from p_scope or previous.event is distinct from p_event then raise exception 'BILLING_EVENT_CONFLICT'; end if;
 return jsonb_build_object('accepted',true);
end $$;
create function public.billing_hosted_claim(p_lane text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 update public.billing_hosted_lanes set token=gen_random_uuid(),lease_until=clock_timestamp()+interval '300 seconds',last_started_at=clock_timestamp(),last_error=null
 where lane=p_lane and (lease_until is null or lease_until<=clock_timestamp()) returning token into result;
 return result;
end $$;
create function public.billing_hosted_release(p_lane text,p_token uuid,p_error text default null) returns void language sql security definer set search_path='' as $$
 update public.billing_hosted_lanes set token=null,lease_until=null,last_finished_at=clock_timestamp(),last_error=left(p_error,100)
 where lane=p_lane and token=p_token and lease_until>clock_timestamp()
$$;
create function public.billing_hosted_next(p_context uuid,p_lane text,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not exists(select 1 from public.billing_hosted_lanes where lane=p_lane and token=p_token and lease_until>clock_timestamp()) then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 if p_lane='pdf' then
  select jsonb_build_object('document_id',j.document_id) into result from public.billing_outbox j join public.billing_documents d on d.id=j.document_id join public.billing_folios f on f.id=d.folio_id
  where f.billing_context_id=p_context and ((j.state in ('pending','failed') and j.next_attempt_at<=clock_timestamp()) or (j.state='processing' and j.lease_until<=clock_timestamp()))
  order by j.created_at,j.document_id limit 1;
 else
  select jsonb_build_object('event',i.event) into result from public.billing_hosted_inbox i where i.context_id=p_context and i.processed_at is null and i.next_attempt_at<=clock_timestamp() order by i.next_attempt_at,i.received_at,i.id limit 1;
  if result is null then
   select jsonb_build_object('attempt_id',a.id) into result from public.billing_stripe_attempts a left join public.billing_hosted_reconciliation r on r.attempt_id=a.id
   where a.context_id=p_context and not a.resolved and a.state<>'anomaly' and coalesce(r.next_attempt_at,a.updated_at+interval '60 seconds')<=clock_timestamp()
   order by coalesce(r.next_attempt_at,a.updated_at),a.id limit 1;
  end if;
 end if;
 return result;
end $$;
create function public.billing_hosted_event_attempt(p_context uuid,p_event text) returns uuid language sql stable security definer set search_path='' as $$
 select a.id from public.billing_stripe_events e join public.billing_stripe_attempts a on a.provider_id=e.provider_id
 where e.id=p_event and a.context_id=p_context and a.platform_account=e.platform_account and (e.connected_account is null or e.connected_account=a.connected_account)
$$;
create function public.billing_hosted_result(p_context uuid,p_token uuid,p_event text default null,p_attempt uuid default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billing_hosted_lanes where lane='stripe' and token=p_token and lease_until>clock_timestamp()) then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 if p_event is not null then
  update public.billing_hosted_inbox set attempts=attempts+1,processed_at=case when p_error is null then clock_timestamp() else null end,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(3600,60*(attempts+1))),last_error=left(p_error,100) where id=p_event and context_id=p_context;
 else
  if not public.billing_hosted_scope(p_context,p_attempt=>p_attempt) then raise exception 'BILLING_FORBIDDEN'; end if;
  insert into public.billing_hosted_reconciliation(attempt_id,next_attempt_at,last_error) values(p_attempt,clock_timestamp()+interval '60 seconds',left(p_error,100))
  on conflict(attempt_id) do update set next_attempt_at=excluded.next_attempt_at,last_error=excluded.last_error;
 end if;
end $$;
-- Only the server can call these operations. No browser access, even to the inbox.
revoke all on function public.billing_hosted_scope(uuid,uuid,uuid,uuid),public.billing_hosted_receive(uuid,text,jsonb),public.billing_hosted_claim(text),public.billing_hosted_release(text,uuid,text),public.billing_hosted_next(uuid,text,uuid),public.billing_hosted_event_attempt(uuid,text),public.billing_hosted_result(uuid,uuid,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_hosted_scope(uuid,uuid,uuid,uuid),public.billing_hosted_receive(uuid,text,jsonb),public.billing_hosted_claim(text),public.billing_hosted_release(text,uuid,text),public.billing_hosted_next(uuid,text,uuid),public.billing_hosted_event_attempt(uuid,text),public.billing_hosted_result(uuid,uuid,text,uuid,text) to service_role;
commit;
