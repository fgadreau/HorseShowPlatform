begin;

alter table public.entries add column submitted_at timestamptz;
alter table public.entries add column activation_basis text check(activation_basis in ('manual','payment','preauthorization','free'));

create function public.entry_lifecycle_staff(p_org uuid,p_show uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary'])
 or public.has_show_role(p_show,array['secretary']);
$$;
create function public.entry_lifecycle_access(p_entry uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.entries e where e.id=p_entry and public.current_profile_id() is not null
 and (public.entry_lifecycle_staff(e.organization_id,e.show_id) or public.can_modify_entries_for_horse(e.horse_id)));
$$;
create function public.entry_draw_lock(p_block uuid) returns void
language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('entry-draw:'||p_block::text,0));
$$;
create function public.entry_draw_generated(p_block uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.blocks where id=p_block and draw_prepared_at is not null)
 or exists(select 1 from public.show_score_block_setups where block_id=p_block and (is_draw_imported or jsonb_array_length(runs)>0))
 or exists(select 1 from public.block_run_entries where block_id=p_block and order_of_go>0);
$$;

create table public.entry_cancellation_requests (
 id uuid primary key,organization_id uuid not null references public.organizations(id) on delete cascade,
 show_id uuid not null references public.shows(id) on delete cascade,block_id uuid not null references public.blocks(id),
 horse_id uuid not null references public.horses(id),rider_contact_id uuid references public.contacts(id),
 payer_contact_id uuid not null references public.contacts(id),entry_ids uuid[] not null check(cardinality(entry_ids)>0),
 scope text not null check(scope in ('class','block')),status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawn')),
 requested_by uuid not null references public.user_profiles(id),reason text not null default '',
 created_at timestamptz not null default clock_timestamp(),decided_at timestamptz,decided_by uuid references public.user_profiles(id),
 decision_note text not null default '',financial_decision jsonb,
 check((status='pending')=(decided_at is null)),check(scope<>'class' or cardinality(entry_ids)=1)
);
create index entry_cancellation_draw_queue on public.entry_cancellation_requests(block_id,created_at) where status='pending';
create index entry_cancellation_entry_ids on public.entry_cancellation_requests using gin(entry_ids);
alter table public.entry_cancellation_requests enable row level security;
revoke all on public.entry_cancellation_requests from public,anon,authenticated,service_role;
grant select on public.entry_cancellation_requests to authenticated;
create policy "Authorized entry users see cancellation decisions" on public.entry_cancellation_requests for select to authenticated
 using(public.entry_lifecycle_access(entry_ids[1]));

create function public.request_entry_cancellation(p_request uuid,p_entry uuid,p_scope text,p_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare e public.entries;b uuid;ids uuid[];previous public.entry_cancellation_requests;
begin
 if p_request is null or p_scope is null or p_scope not in ('class','block') or not public.entry_lifecycle_access(p_entry) then raise exception 'ENTRY_FORBIDDEN';end if;
 select * into e from public.entries where id=p_entry;
 select block_id into b from public.classes where id=e.class_id;
 perform public.entry_draw_lock(b);
 select * into e from public.entries where id=p_entry;
 if (select block_id from public.classes where id=e.class_id) is distinct from b then raise exception 'ENTRY_CONTEXT_CHANGED';end if;
 if not public.entry_lifecycle_access(p_entry) then raise exception 'ENTRY_FORBIDDEN';end if;
 select * into previous from public.entry_cancellation_requests where id=p_request;
 if found then
  if not p_entry=any(previous.entry_ids) or previous.scope<>p_scope or previous.requested_by<>public.current_profile_id() or previous.reason<>left(coalesce(p_reason,''),2000) then raise exception 'ENTRY_IDEMPOTENCY_CONFLICT';end if;
  return previous.id;
 end if;
 if public.entry_draw_generated(b) then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH';end if;
 if p_scope='class' then ids:=array[e.id];else
  select array_agg(en.id order by en.id) into ids from public.entries en join public.classes c on c.id=en.class_id
  where c.block_id=b and en.organization_id=e.organization_id and en.show_id=e.show_id and en.horse_id=e.horse_id
  and en.rider_contact_id is not distinct from e.rider_contact_id and en.payer_contact_id=e.payer_contact_id
  and en.status in ('active','pending_checkout');
 end if;
 if e.status not in ('active','pending_checkout') or cardinality(ids) is null then raise exception 'ENTRY_NOT_SUBMITTED';end if;
 if exists(select 1 from public.entry_cancellation_requests where block_id=b and status='pending' and entry_ids&&ids) then raise exception 'ENTRY_CANCELLATION_ALREADY_PENDING';end if;
 insert into public.entry_cancellation_requests(id,organization_id,show_id,block_id,horse_id,rider_contact_id,payer_contact_id,entry_ids,scope,requested_by,reason)
 values(p_request,e.organization_id,e.show_id,b,e.horse_id,e.rider_contact_id,e.payer_contact_id,ids,p_scope,public.current_profile_id(),left(coalesce(p_reason,''),2000));
 return p_request;
end $$;

create function public.withdraw_entry_cancellation(p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare r public.entry_cancellation_requests;
begin
 select * into r from public.entry_cancellation_requests where id=p_request;
 if not found or not public.entry_lifecycle_access(r.entry_ids[1]) or r.requested_by<>public.current_profile_id() then raise exception 'ENTRY_FORBIDDEN';end if;
 perform public.entry_draw_lock(r.block_id);
 select * into r from public.entry_cancellation_requests where id=p_request for update;
 if r.status='withdrawn' then return;end if;
 if r.status<>'pending' then raise exception 'ENTRY_CANCELLATION_ALREADY_DECIDED';end if;
 update public.entry_cancellation_requests set status='withdrawn',decided_at=clock_timestamp(),decided_by=public.current_profile_id() where id=r.id;
end $$;

create function public.entry_draw_assert_ready(p_block uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.entry_draw_lock(p_block);
 if exists(select 1 from public.entry_cancellation_requests where block_id=p_block and status='pending') then raise exception 'ENTRY_DRAW_PENDING_CANCELLATIONS';end if;
 if exists(select 1 from public.entries e join public.classes c on c.id=e.class_id where c.block_id=p_block and e.status='pending_checkout') then raise exception 'ENTRY_DRAW_PENDING_FINANCIAL_CONFIRMATION';end if;
end $$;
create function public.entry_draw_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b uuid;
begin
 if tg_table_name='blocks' then
  b:=new.id;
  if old.draw_prepared_at is not null and new.draw_prepared_at is null then raise exception 'ENTRY_DRAW_ALREADY_GENERATED';end if;
  if new.draw_prepared_at is null then return new;end if;
 elsif tg_table_name='show_score_block_setups' then
  b:=new.block_id;
  if not new.is_draw_imported and jsonb_array_length(new.runs)=0 then return new;end if;
 else
  b:=new.block_id;
  if coalesce(new.order_of_go,0)<=0 then return new;end if;
 end if;
 perform public.entry_draw_assert_ready(b);
 if tg_table_name<>'blocks' then update public.blocks set draw_prepared_at=coalesce(draw_prepared_at,clock_timestamp()) where id=b;end if;
 return new;
end $$;
create trigger entry_draw_cancellations_guard before update of draw_prepared_at on public.blocks for each row execute function public.entry_draw_guard();
create trigger entry_draw_cancellations_guard before insert or update of runs,is_draw_imported on public.show_score_block_setups for each row execute function public.entry_draw_guard();
create trigger entry_draw_cancellations_guard before insert or update of order_of_go on public.block_run_entries for each row execute function public.entry_draw_guard();

-- The activation ledger is private: verified money or the server's free-entry rule.
create table public.entry_activation_events (
 id uuid primary key default gen_random_uuid(),entry_id uuid not null references public.entries(id) on delete cascade,
 kind text not null check(kind in ('payment','preauthorization','free')),provider_reference text not null,
 created_at timestamptz not null default clock_timestamp(),unique(entry_id,kind,provider_reference)
);
alter table public.entry_activation_events enable row level security;
revoke all on public.entry_activation_events from public,anon,authenticated,service_role;

create function public.entry_status_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare b uuid;manual boolean;
begin
 if tg_op='DELETE' then
  if not exists(select 1 from public.shows where id=old.show_id) then return old;end if;
  if old.status<>'draft' then raise exception 'ENTRY_USE_CANCELLATION_REQUEST';end if;
  return old;
 end if;
 select block_id into b from public.classes where id=new.class_id;
 perform public.billing6_lock(new.organization_id);
 perform public.billing_lock_scope(new.organization_id,new.show_id);
 perform public.entry_draw_lock(b);
 if tg_op='UPDATE' and old.class_id is distinct from new.class_id then
  perform public.entry_draw_lock((select block_id from public.classes where id=old.class_id));
  if public.entry_draw_generated(b) or public.entry_draw_generated((select block_id from public.classes where id=old.class_id)) then raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY';end if;
 end if;
 if tg_op='INSERT' and public.entry_draw_generated(b) and not new.is_late then raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY';end if;
 if tg_op='UPDATE' and new.status is distinct from old.status and new.status<>'active' and exists(select 1 from public.entry_cancellation_requests where old.id=any(entry_ids) and status='pending') then raise exception 'ENTRY_PENDING_CANCELLATION_LOCKED';end if;
 if tg_op='UPDATE' and new.status is distinct from old.status then
  if new.status in ('scratched','scratched_pending_refund') and not public.entry_draw_generated(b) then raise exception 'ENTRY_USE_CANCELLATION_REQUEST';end if;
  if new.status='draft' or (new.status='pending_checkout' and old.status<>'draft') then raise exception 'ENTRY_STATUS_AUTOMATIC';end if;
  if new.status='completed' and (old.status<>'active' or not public.entry_lifecycle_staff(new.organization_id,new.show_id) or not public.entry_draw_generated(b)) then raise exception 'ENTRY_STATUS_AUTOMATIC';end if;
 end if;
 if tg_op='UPDATE' and (new.class_id,new.horse_id,new.rider_contact_id,new.payer_contact_id) is distinct from (old.class_id,old.horse_id,old.rider_contact_id,old.payer_contact_id)
 and exists(select 1 from public.entry_cancellation_requests where old.id=any(entry_ids) and status='pending') then raise exception 'ENTRY_PENDING_CANCELLATION_LOCKED';end if;
 if tg_op='UPDATE' and old.status is distinct from new.status then
  perform public.entry_draw_lock(b);
  if new.status='cancelled' then
   if public.entry_draw_generated(b) then raise exception 'ENTRY_DRAW_GENERATED_USE_SCRATCH';end if;
   if not exists(select 1 from public.entry_cancellation_requests r where new.id=any(r.entry_ids) and r.status='approved') then raise exception 'ENTRY_USE_CANCELLATION_REQUEST';end if;
  end if;
  if old.status='cancelled' and new.status<>'cancelled' then raise exception 'ENTRY_CANCELLATION_FINAL';end if;
 end if;
 if new.status='active' and (tg_op='INSERT' or old.status<>'active') then
  if tg_op='UPDATE' and old.status='draft' and public.entry_draw_generated(b) and not new.is_late then raise exception 'ENTRY_DRAW_GENERATED_USE_LATE_ENTRY';end if;
  select entry_payment_policy='manual' into manual from public.shows where id=new.show_id;
  if manual then new.activation_basis:='manual';
  elsif exists(select 1 from public.entry_activation_events where entry_id=new.id and kind='free') then new.activation_basis:='free';
  elsif exists(select 1 from public.entry_activation_events where entry_id=new.id and kind='preauthorization') then new.activation_basis:='preauthorization';
  elsif exists(select 1 from public.entry_activation_events where entry_id=new.id and kind='payment') then new.activation_basis:='payment';
  else raise exception 'ENTRY_PAYMENT_OR_AUTHORIZATION_REQUIRED';end if;
 end if;
 return new;
end $$;
create trigger z_entry_status_guard before insert or update or delete on public.entries for each row execute function public.entry_status_guard();

create function public.confirm_existing_entry(p_entry uuid) returns void language plpgsql security invoker set search_path='' as $$
declare e public.entries;policy text;
begin
 if not public.entry_lifecycle_access(p_entry) then raise exception 'ENTRY_FORBIDDEN';end if;
 select * into e from public.entries where id=p_entry for update;
 if e.status<>'draft' then return;end if;
 select entry_payment_policy into policy from public.shows where id=e.show_id;
 update public.entries set submitted_at=clock_timestamp(),status=case when policy='manual' then 'active' else 'pending_checkout' end where id=e.id;
end $$;

create function public.submit_entry(p_entry jsonb) returns setof public.entries language plpgsql security invoker set search_path='' as $$
declare actor uuid:=public.current_profile_id();policy text;inserted uuid;
begin
 if actor is null or actor is distinct from (p_entry->>'created_by_user_id')::uuid then raise exception 'ENTRY_FORBIDDEN';end if;
 select entry_payment_policy into policy from public.shows where id=(p_entry->>'show_id')::uuid;
 insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,rider_contact_id,payer_contact_id,entry_number,back_number_choice,back_number_request_token,base_fee,total_fees,is_late,late_fee_percent,late_fee_amount,status,submitted_at)
 values((p_entry->>'organization_id')::uuid,(p_entry->>'show_id')::uuid,(p_entry->>'horse_id')::uuid,(p_entry->>'class_id')::uuid,actor,(p_entry->>'owner_contact_id')::uuid,(p_entry->>'rider_contact_id')::uuid,(p_entry->>'payer_contact_id')::uuid,(p_entry->>'entry_number')::integer,coalesce(p_entry->>'back_number_choice','legacy'),(p_entry->>'back_number_request_token')::uuid,(p_entry->>'base_fee')::numeric,(p_entry->>'total_fees')::numeric,coalesce((p_entry->>'is_late')::boolean,false),coalesce((p_entry->>'late_fee_percent')::numeric,0),coalesce((p_entry->>'late_fee_amount')::numeric,0),case when policy='manual' then 'active' else 'pending_checkout' end,clock_timestamp()) returning entries.id into inserted;
 return query select * from public.entries where id=inserted;
end $$;

do $$declare f record;begin
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname in ('confirm_existing_entry','entry_lifecycle_staff','entry_lifecycle_access','entry_draw_lock','entry_draw_generated','request_entry_cancellation','withdraw_entry_cancellation','entry_draw_assert_ready','entry_draw_guard','entry_status_guard','submit_entry') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
grant execute on function public.confirm_existing_entry(uuid),public.entry_lifecycle_access(uuid),public.entry_lifecycle_staff(uuid,uuid),public.request_entry_cancellation(uuid,uuid,text,text),public.withdraw_entry_cancellation(uuid),public.submit_entry(jsonb) to authenticated;
commit;
