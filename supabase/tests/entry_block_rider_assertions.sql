-- Included inside entry_same_block_classes.sql's fictitious, rolled-back fixture.
insert into public.classes(id,organization_id,show_id,name,entry_fee,judge_fee,block_id,organization_discipline_id,sort_order)
values('a0730000-0000-0000-0000-000000000003','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','Third class TEST',20,10,'a0740000-0000-0000-0000-000000000001','a0650000-0000-0000-0000-000000000001',3);
set local role authenticated;
do $$ begin
 begin
  update public.entries set rider_contact_id='a0660000-0000-0000-0000-000000000002' where class_id='a0730000-0000-0000-0000-000000000002';
  raise exception 'DIFFERENT_RIDER_UPDATE_ALLOWED';
 exception when check_violation then
  if sqlerrm not like '%autre cavalier dans ce bloc%' then raise;end if;
 end;
 begin
  insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,rider_contact_id,status)
  values('a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000003',public.current_profile_id(),'a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000002','draft');
  raise exception 'DIFFERENT_RIDER_INSERT_ALLOWED';
 exception when check_violation then
  if sqlerrm not like '%autre cavalier dans ce bloc%' then raise;end if;
 end;
end $$;
reset role;
-- Failed insert/update must not change existing accounting.
do $$ begin
 if (select sum((public.billing_snapshot(f.id)->>'balance')::numeric) from public.billing_folios f)<>70 then raise exception 'FAILED_RIDER_CHANGE_CHANGED_BILLING';end if;
end $$;
-- Other blocks can use a different rider for the same horse.
insert into public.blocks(id,organization_id,show_id,show_day_id,name,block_type)
select 'a0740000-0000-0000-0000-000000000002',organization_id,show_id,show_day_id,'Other block TEST','competition' from public.blocks where id='a0740000-0000-0000-0000-000000000001';
insert into public.classes(id,organization_id,show_id,name,entry_fee,block_id,organization_discipline_id)
values('a0730000-0000-0000-0000-000000000004','a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','Other block class TEST',10,'a0740000-0000-0000-0000-000000000002','a0650000-0000-0000-0000-000000000001');
set local role authenticated;
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,rider_contact_id,status)
values('a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000004',public.current_profile_id(),'a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000002','draft');
-- Inactive entries no longer reserve the rider of the original block.
update public.entries set status='cancelled' where class_id in ('a0730000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000002');
insert into public.entries(organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,payer_contact_id,rider_contact_id,status)
values('a0630000-0000-0000-0000-000000000001','a0680000-0000-0000-0000-000000000001','a0670000-0000-0000-0000-000000000001','a0730000-0000-0000-0000-000000000003',public.current_profile_id(),'a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000001','a0660000-0000-0000-0000-000000000002','draft');
do $$ begin
 begin
  update public.entries set status='active' where class_id='a0730000-0000-0000-0000-000000000001';
  raise exception 'CONFLICTING_REACTIVATION_ALLOWED';
 exception when check_violation then
  if sqlerrm not like '%autre cavalier dans ce bloc%' then raise;end if;
 end;
end $$;
reset role;
select 'PASS: different rider insert/update/reactivation refused; same rider across classes and another rider in another block allowed; inactive entries released; failed writes leave billing unchanged';
