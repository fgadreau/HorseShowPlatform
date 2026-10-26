begin;
-- A horse may enter several classes of a block, with one rider across all of them.
-- No historical registrations, charges or payments are rewritten.
create function public.assert_entry_block_single_rider() returns trigger
language plpgsql security definer set search_path='' as $$
declare target_block uuid;previous_block uuid;lock_key text;
begin
 if tg_op='UPDATE' and (new.horse_id,new.class_id,new.rider_contact_id,new.owner_contact_id,new.status)
  is not distinct from (old.horse_id,old.class_id,old.rider_contact_id,old.owner_contact_id,old.status) then return new;end if;
 select block_id into target_block from public.classes where id=new.class_id;
 if tg_op='UPDATE' then select block_id into previous_block from public.classes where id=old.class_id;end if;
 -- Serialize competing submissions and moves of the same horse between blocks.
 for lock_key in select distinct key from unnest(array[
  case when target_block is not null then target_block::text||':'||new.horse_id::text end,
  case when previous_block is not null then previous_block::text||':'||old.horse_id::text end
 ]) key where key is not null order by key loop
  perform pg_advisory_xact_lock(hashtextextended('entry-block-rider:'||lock_key,0));
 end loop;
 if new.status in ('cancelled','scratched','scratched_pending_refund') or target_block is null then return new;end if;
 if exists(select 1 from public.entries e join public.classes c on c.id=e.class_id
  where c.block_id=target_block and e.horse_id=new.horse_id and e.id<>new.id
  and e.status not in ('cancelled','scratched','scratched_pending_refund')
  and coalesce(e.rider_contact_id,e.owner_contact_id) is distinct from coalesce(new.rider_contact_id,new.owner_contact_id)) then
  raise exception 'Ce cheval a déjà un autre cavalier dans ce bloc. Le même cavalier doit être conservé pour toutes ses classes du bloc.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function public.assert_entry_block_single_rider() from public,anon,authenticated;
create trigger entries_block_single_rider before insert or update on public.entries
for each row execute function public.assert_entry_block_single_rider();
notify pgrst,'reload schema';
commit;
