\set ON_ERROR_STOP on
begin;
create function pg_temp.expect_error(command text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute command;
  exception when others then
    if sqlstate=expected_state then return; end if;
    raise;
  end;
  raise exception 'Expected SQLSTATE %, command succeeded: %',expected_state,command;
end;
$$;

-- Confirm the defaults by omitting both columns in a real INSERT.
insert into public.blocks (id,organization_id,show_id,show_day_id,name,sort_order)
values ('50000000-0000-0000-0000-000000000099','30000000-0000-0000-0000-000000000001',
 '40000000-0000-0000-0000-000000000001','41000000-0000-0000-0000-000000000001','Default check',99);
insert into public.show_score_block_setups (block_id) values ('50000000-0000-0000-0000-000000000099');
do $$ begin
 if not exists (select 1 from public.show_score_block_setups where block_id='50000000-0000-0000-0000-000000000099' and live_data_source='announcer' and qualified_rider_count=6) then
  raise exception 'Incorrect setup defaults';
 end if;
 if exists (select 1 from public.organizations where is_test_mode is distinct from false) then raise exception 'Unexpected test mode'; end if;
 if has_function_privilege('anon','public.create_association_with_owner(text,text,text,text,text,text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.save_show_score_paid_warmup_live(uuid,boolean,boolean,text,timestamptz,jsonb)','EXECUTE') then raise exception 'Anonymous RPC access'; end if;
end $$;

-- Capture complete victim state, including membership, before attempted attacks.
create temp table victim_before as select to_jsonb(o) as data from public.organizations o;
create temp table members_before as select to_jsonb(m) as data from public.organization_members m;
set local role anon;
select pg_temp.expect_error($q$select public.create_association_with_owner(null,'Anon')$q$,'42501');
select pg_temp.expect_error($q$select public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true)$q$,'42501');
set local role authenticated;
select set_config('request.jwt.claim.sub','',true);
select pg_temp.expect_error($q$select public.create_association_with_owner(null,'No identity')$q$,'42501');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000099',true);
select pg_temp.expect_error($q$select public.create_association_with_owner(null,'No profile')$q$,'42501');

-- A valid unrelated profile may create, but cannot take over any existing ID.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
select pg_temp.expect_error($q$select public.create_association_with_owner('30000000-0000-0000-0000-000000000002','Hijacked')$q$,'23505');
select pg_temp.expect_error($q$select public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true)$q$,'42501');
select public.create_association_with_owner('30000000-0000-0000-0000-000000000099','New association');
select pg_temp.expect_error($q$select public.create_association_with_owner('30000000-0000-0000-0000-000000000099','Retry')$q$,'23505');
reset role;
do $$ begin
 if exists ((select data from victim_before) except (select to_jsonb(o) from public.organizations o)) then raise exception 'Existing organization changed'; end if;
 if exists ((select data from members_before) except (select to_jsonb(m) from public.organization_members m)) then raise exception 'Existing member changed'; end if;
 if exists (select 1 from public.organization_members where organization_id='30000000-0000-0000-0000-000000000002' and user_id='20000000-0000-0000-0000-000000000004') then raise exception 'Cross-association escalation'; end if;
 if not exists (select 1 from public.organization_members where organization_id='30000000-0000-0000-0000-000000000099' and user_id='20000000-0000-0000-0000-000000000004' and role='admin') then raise exception 'New owner not admin'; end if;
end $$;

-- Remove show assignments as postgres so these are truly association-only roles.
delete from public.show_roles where user_id='20000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$ declare n integer; begin
 if exists (select 1 from public.show_roles where user_id=public.current_profile_id()) then raise exception 'Secretary still has show role'; end if;
 update public.shows set name='Secretary edit',is_public=false where id='40000000-0000-0000-0000-000000000001';
 get diagnostics n=row_count; if n<>1 then raise exception 'Secretary show update denied'; end if;
 update public.show_days set day_name='Secretary day' where id='41000000-0000-0000-0000-000000000001';
 get diagnostics n=row_count; if n<>1 then raise exception 'Secretary day update denied'; end if;
 update public.blocks set display_label='Secretary block' where id='50000000-0000-0000-0000-000000000001';
 get diagnostics n=row_count; if n<>1 then raise exception 'Secretary block update denied'; end if;
 update public.shows set name='Forbidden' where id='40000000-0000-0000-0000-000000000002';
 get diagnostics n=row_count; if n<>0 then raise exception 'Secretary cross-association update'; end if;
 perform public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true);
end $$;
select pg_temp.expect_error($q$insert into public.shows (organization_id,name,slug,start_date,end_date) values ('30000000-0000-0000-0000-000000000002','Forbidden','forbidden','2026-09-04','2026-09-04')$q$,'42501');
select pg_temp.expect_error($q$select public.create_association_with_owner('30000000-0000-0000-0000-000000000002','Secretary takeover')$q$,'23505');

reset role;
update public.organization_members set role='announcer' where user_id='20000000-0000-0000-0000-000000000003';
set local role authenticated;
do $$ declare n integer; result jsonb; q jsonb; begin
 if not exists(select 1 from public.show_score_paid_warmups where id='50000000-0000-0000-0000-000000000008') then raise exception 'Announcer read denied'; end if;
 update public.show_score_paid_warmups set name='Forbidden direct edit' where id='50000000-0000-0000-0000-000000000008';
 get diagnostics n=row_count; if n<>0 then raise exception 'Announcer direct UPDATE allowed'; end if;
 select entries into q from public.show_score_paid_warmups where id='50000000-0000-0000-0000-000000000008';
 result:=public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true,true,'entry-1',now(),jsonb_set(q,'{0,status}','"done"'));
 if result#>>'{entries,0,status}'<>'done' then raise exception 'Live RPC did not persist'; end if;
 perform pg_temp.expect_error(format('select public.save_show_score_paid_warmup_live(%L,true,true,null,null,%L::jsonb)','50000000-0000-0000-0000-000000000008',q||'[{"id":"new"}]'::jsonb),'42501');
 perform pg_temp.expect_error(format('select public.save_show_score_paid_warmup_live(%L,true,true,null,null,%L::jsonb)','50000000-0000-0000-0000-000000000008',q-0),'42501');
 perform pg_temp.expect_error(format('select public.save_show_score_paid_warmup_live(%L,true,true,null,null,%L::jsonb)','50000000-0000-0000-0000-000000000008',jsonb_build_array(q->1,q->0)),'42501');
 perform pg_temp.expect_error(format('select public.save_show_score_paid_warmup_live(%L,true,true,null,null,%L::jsonb)','50000000-0000-0000-0000-000000000008',jsonb_set(q,'{0,status}','"invalid"')),'23514');
 perform pg_temp.expect_error(format('select public.save_show_score_paid_warmup_live(%L,true,true,%L,null,%L::jsonb)','50000000-0000-0000-0000-000000000008','not-in-queue',q),'23514');
end $$;
select pg_temp.expect_error($q$select public.create_association_with_owner('30000000-0000-0000-0000-000000000002','Announcer takeover')$q$,'23505');

-- Foreign admin denied, local admin and platform admin retain their RPC path.
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000006',true);
select pg_temp.expect_error($q$select public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true)$q$,'42501');
select pg_temp.expect_error($q$select public.create_association_with_owner('30000000-0000-0000-0000-000000000001','Foreign admin takeover')$q$,'23505');
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',false);
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.save_show_score_paid_warmup_live('50000000-0000-0000-0000-000000000008',true);
rollback;
