begin;
create or replace function public.enforce_annual_house_rules() returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;begin
 if tg_op='UPDATE' then
  -- Historical entries may be scratched, cancelled or finalized without
  -- retroactively changing eligibility. Moving them to another team/class
  -- still requires a fresh assessment, regardless of their status.
  if (new.class_id,new.horse_id,new.rider_contact_id) is not distinct from (old.class_id,old.horse_id,old.rider_contact_id) then
   if new.status in ('cancelled','scratched','scratched_pending_refund','completed') or new.status is not distinct from old.status then return new;end if;
  end if;
 end if;
 a:=public.house_class_assessment(new.class_id,new.horse_id,new.rider_contact_id);
 if not (a->>'can_proceed')::boolean then raise exception 'HOUSE_ELIGIBILITY_BLOCKED: cavalier inéligible : %',a->'reasons' using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.enforce_annual_house_rules() from public,anon,authenticated,service_role;
commit;
