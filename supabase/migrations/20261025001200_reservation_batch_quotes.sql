-- Split amounts are derived from authoritative option prices and admitted only in the same transaction.
begin;
create table public.reservation_batch_quotes (
 transaction_id bigint not null,booking_id uuid not null,actor_id uuid not null references public.user_profiles(id),quote jsonb not null,
 primary key(transaction_id,booking_id)
);
alter table public.reservation_batch_quotes enable row level security;
revoke all on public.reservation_batch_quotes from public,anon,authenticated,service_role;
create function public.reservation_quote_cleanup() returns trigger language plpgsql security definer set search_path='' as $$
begin delete from public.reservation_batch_quotes where transaction_id=new.transaction_id and booking_id=new.booking_id;return null;end $$;
create constraint trigger reservation_quote_cleanup after insert on public.reservation_batch_quotes deferrable initially deferred for each row execute function public.reservation_quote_cleanup();
create function public.prepare_reservation_batch(p_rows jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.current_profile_id();r jsonb;b public.stall_bookings;opt public.stall_options;normalized jsonb:='[]';first_row jsonb;
 split_count integer;inventory_count integer;inventory_qty numeric;split_index integer;total_cents bigint;price numeric;
begin
 if actor is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'RESERVATION_INVALID_BATCH';end if;
 first_row:=p_rows->0;
 if not (public.is_platform_admin() or public.is_org_member((first_row->>'organization_id')::uuid,array['admin','secretary']) or public.has_linked_contact_in_org((first_row->>'organization_id')::uuid)) then raise exception 'BILLING_FORBIDDEN';end if;
 if exists(select 1 from jsonb_array_elements(p_rows) x where (x->>'organization_id',x->>'show_id',x->>'booker_contact_id',coalesce(x->>'status','requested')) is distinct from (first_row->>'organization_id',first_row->>'show_id',first_row->>'booker_contact_id',coalesce(first_row->>'status','requested'))) then raise exception 'RESERVATION_INVALID_BATCH';end if;
 perform public.billing6_lock((first_row->>'organization_id')::uuid);perform public.billing_lock_scope((first_row->>'organization_id')::uuid,(first_row->>'show_id')::uuid);
 perform 1 from public.stall_options where id in(select (x->>'stall_option_id')::uuid from jsonb_array_elements(p_rows) x) order by id for update;
 for r in select value from jsonb_array_elements(p_rows) loop
  b:=jsonb_populate_record(null::public.stall_bookings,r);
  if b.created_by_user_id is distinct from actor then raise exception 'RESERVATION_INVALID_ACTOR';end if;
  select * into opt from public.stall_options where id=b.stall_option_id;
  if opt.id is null or (opt.organization_id,opt.show_id) is distinct from (b.organization_id,b.show_id) or b.quantity is null or b.quantity<=0 or b.quantity<>trunc(b.quantity) then raise exception 'RESERVATION_INVALID_BATCH';end if;
  b.id:=gen_random_uuid();b.status:=coalesce(b.status,'requested');b.affects_inventory:=coalesce(b.affects_inventory,true);b.billable:=coalesce(b.billable,true);
  price:=opt.price;
  if not b.affects_inventory or not b.billable then
   select count(*) into inventory_count from jsonb_array_elements(p_rows) x where x->>'stall_option_id'=b.stall_option_id::text and not coalesce((x->>'billable')::boolean,true) and coalesce((x->>'affects_inventory')::boolean,true);
   select count(*) into split_count from jsonb_array_elements(p_rows) x where x->>'stall_option_id'=b.stall_option_id::text and coalesce((x->>'billable')::boolean,true) and not coalesce((x->>'affects_inventory')::boolean,true);
   if inventory_count<>1 or split_count=0 or (not b.billable and not b.affects_inventory) then raise exception 'RESERVATION_INVALID_SPLIT';end if;
   if b.billable then
    if b.quantity<>1 or b.horse_id is null then raise exception 'RESERVATION_INVALID_SPLIT';end if;
    select (x->>'quantity')::numeric into inventory_qty from jsonb_array_elements(p_rows) x where x->>'stall_option_id'=b.stall_option_id::text and not coalesce((x->>'billable')::boolean,true) and coalesce((x->>'affects_inventory')::boolean,true);
    select count(*) into split_index from jsonb_array_elements(normalized) x where x->>'stall_option_id'=b.stall_option_id::text and (x->>'billable')::boolean and not (x->>'affects_inventory')::boolean;
    total_cents:=round(inventory_qty*opt.price*100);
    price:=(total_cents/split_count+case when split_index<mod(total_cents,split_count) then 1 else 0 end)::numeric/100;
    if b.status='cancelled' then price:=0;end if;
   end if;
  end if;
  if b.unit_price is not null and b.unit_price is distinct from price then raise exception 'RESERVATION_PRICE_CHANGED';end if;
  b.unit_price:=price;
  r:=to_jsonb(b);
  insert into public.reservation_batch_quotes values(txid_current(),b.id,actor,jsonb_build_object('organization_id',b.organization_id,'show_id',b.show_id,'option',b.stall_option_id,'horse',b.horse_id,'payer',b.payer_contact_id,'booker',b.booker_contact_id,'quantity',b.quantity,'unit_price',b.unit_price,'billable',b.billable,'inventory',b.affects_inventory,'status',b.status));
  normalized:=normalized||jsonb_build_array(r);
 end loop;
 return normalized;
end $$;
create function public.reservation_split_quote_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not public.reservation_uses_accounts(new.show_id) then return new;end if;
 if not coalesce(new.affects_inventory,true) or not coalesce(new.billable,true) then
  if tg_op='UPDATE' and (to_jsonb(new)-array['status','notes','updated_at','total_price'])=(to_jsonb(old)-array['status','notes','updated_at','total_price']) then return new;end if;
  if not exists(select 1 from public.reservation_batch_quotes q where q.transaction_id=txid_current() and q.booking_id=new.id and q.actor_id=public.current_profile_id() and q.quote=jsonb_build_object('organization_id',new.organization_id,'show_id',new.show_id,'option',new.stall_option_id,'horse',new.horse_id,'payer',new.payer_contact_id,'booker',new.booker_contact_id,'quantity',new.quantity,'unit_price',new.unit_price,'billable',coalesce(new.billable,true),'inventory',coalesce(new.affects_inventory,true),'status',coalesce(new.status,'requested'))) then raise exception 'RESERVATION_SPLIT_REQUIRES_BATCH';end if;
 end if;
 return new;
end $$;
create trigger stall_bookings_x_split_quote before insert or update on public.stall_bookings for each row execute function public.reservation_split_quote_guard();
create or replace function public.create_stall_booking_batch(p_rows jsonb) returns setof public.stall_bookings
language plpgsql security invoker set search_path='' as $$
declare r jsonb;b public.stall_bookings;begin
 for r in select value from jsonb_array_elements(public.prepare_reservation_batch(p_rows)) loop
  b:=jsonb_populate_record(null::public.stall_bookings,r);
  return query insert into public.stall_bookings(id,organization_id,show_id,stall_option_id,horse_id,created_by_user_id,booker_contact_id,payer_contact_id,status,show_day_start_id,show_day_end_id,quantity,unit_price,total_price,affects_inventory,billable,notes)
  values(b.id,b.organization_id,b.show_id,b.stall_option_id,b.horse_id,b.created_by_user_id,b.booker_contact_id,b.payer_contact_id,b.status,b.show_day_start_id,b.show_day_end_id,b.quantity,b.unit_price,b.total_price,b.affects_inventory,b.billable,b.notes) returning *;
 end loop;
end $$;
revoke all on function public.reservation_quote_cleanup(),public.prepare_reservation_batch(jsonb),public.reservation_split_quote_guard() from public,anon,authenticated,service_role;
grant execute on function public.prepare_reservation_batch(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
