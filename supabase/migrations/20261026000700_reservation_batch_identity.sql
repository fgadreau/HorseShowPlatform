begin;
-- Historical rows remain NULL: the UI groups them by their exact transaction
-- timestamp. No update touches inventory, charges, tax or payments.
alter table public.stall_bookings add column reservation_id uuid;
alter table public.stall_bookings alter column reservation_id set default gen_random_uuid();
create index stall_bookings_reservation_id_idx on public.stall_bookings(reservation_id);
create or replace function public.create_stall_booking_batch(p_rows jsonb) returns setof public.stall_bookings
language plpgsql security invoker set search_path='' as $$
declare r jsonb;b public.stall_bookings;reservation uuid:=gen_random_uuid();begin
 for r in select value from jsonb_array_elements(public.prepare_reservation_batch(p_rows)) loop
  b:=jsonb_populate_record(null::public.stall_bookings,r);
  return query insert into public.stall_bookings(reservation_id,id,organization_id,show_id,stall_option_id,horse_id,created_by_user_id,booker_contact_id,payer_contact_id,status,show_day_start_id,show_day_end_id,quantity,unit_price,total_price,affects_inventory,billable,notes)
  values(reservation,b.id,b.organization_id,b.show_id,b.stall_option_id,b.horse_id,b.created_by_user_id,b.booker_contact_id,b.payer_contact_id,b.status,b.show_day_start_id,b.show_day_end_id,b.quantity,b.unit_price,b.total_price,b.affects_inventory,b.billable,b.notes) returning *;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
