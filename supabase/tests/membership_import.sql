\set ON_ERROR_STOP on
begin;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';
create temp table membership_import_finance as select (select count(*) from public.invoices) invoices,(select count(*) from public.billing_charges) charges,(select count(*) from public.billing_payments) payments;
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';paid uuid;free uuid;begin
 insert into public.organization_membership_types(organization_id,name,season_year,price,tax_applicable,valid_from,valid_until,is_public) values(org,'Imported season',extract(year from current_date),100,false,current_date-10,current_date+365,true) returning id into paid;
 insert into public.organization_membership_types(organization_id,name,season_year,price,tax_applicable,valid_from,valid_until,is_public) values(org,'Board membership',extract(year from current_date),0,false,current_date-10,current_date+365,false) returning id into free;
 insert into public.organization_membership_types(organization_id,name,season_year,price,tax_applicable,valid_from,valid_until,is_public) values(org,'Unassigned internal membership',extract(year from current_date),0,false,current_date-10,current_date+365,false);
 perform public.membership_billing_configure(paid,'[]');perform public.membership_billing_configure(free,'[]');
 perform set_config('test.import_paid',paid::text,true);perform set_config('test.import_free',free::text,true);
end $$;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';rows jsonb;plan jsonb;result jsonb;op uuid:=gen_random_uuid();c uuid;begin
 rows:='[{"email":"phase1.owner-a@example.test","first_name":"Phase1","last_name":"Owner A"}]';
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 if plan->'rows'->0->>'action'<>'resolve' or jsonb_array_length(plan->'rows'->0->'candidates')=0 then raise exception 'TEST CSV should suggest existing rider';end if;
 begin perform public.apply_membership_import(op,org,current_setting('test.import_paid')::uuid,rows,'external_purchase',plan->>'token');raise exception 'TEST unresolved import accepted';exception when others then if sqlerrm<>'MEMBERSHIP_IMPORT_UNRESOLVED' then raise;end if;end;
 rows:='[{"contact_id":"70000000-0000-0000-0000-000000000001","membership_number":"EXT-001"}]';
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 if (plan->'rows'->0->>'has_account')::boolean is not true then raise exception 'TEST linked user missing';end if;
 result:=public.apply_membership_import(op,org,current_setting('test.import_paid')::uuid,rows,'external_purchase',plan->>'token');
 if result->>'created'<>'1' then raise exception 'TEST paid external membership not imported';end if;
 if public.apply_membership_import(op,org,current_setting('test.import_paid')::uuid,rows,'external_purchase',plan->>'token')<>result then raise exception 'TEST retry changed outcome';end if;
 begin perform public.apply_membership_import(op,org,current_setting('test.import_free')::uuid,rows,'complimentary','x');raise exception 'TEST changed retry accepted';exception when others then if sqlerrm<>'MEMBERSHIP_IMPORT_OPERATION_CONFLICT' then raise;end if;end;
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 if plan->'rows'->0->>'action'<>'skip' then raise exception 'TEST existing active card should be skipped';end if;
 plan:=public.preview_membership_import(org,current_setting('test.import_free')::uuid,rows,'complimentary');
 perform public.apply_membership_import(gen_random_uuid(),org,current_setting('test.import_free')::uuid,rows,'complimentary',plan->>'token');
 rows:='[{"first_name":"Csv","last_name":"New Rider","email":"csv-new-rider@example.test","create_contact":true,"linked_user_id":"20000000-0000-0000-0000-000000000006"}]';
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 update public.organization_membership_types set price=101 where id=current_setting('test.import_paid')::uuid;
 begin perform public.apply_membership_import(gen_random_uuid(),org,current_setting('test.import_paid')::uuid,rows,'external_purchase',plan->>'token');raise exception 'TEST stale preview accepted';exception when others then if sqlerrm<>'MEMBERSHIP_IMPORT_PREVIEW_CHANGED' then raise;end if;end;
 update public.organization_membership_types set price=100 where id=current_setting('test.import_paid')::uuid;
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 perform public.apply_membership_import(gen_random_uuid(),org,current_setting('test.import_paid')::uuid,rows,'external_purchase',plan->>'token');
 select id into c from public.contacts where email='csv-new-rider@example.test';
 if c is null or exists(select 1 from public.contacts where id=c and linked_user_id is not null) then raise exception 'TEST created contact must not assign user ownership';end if;
 if not public.contact_is_linked_to_org(c,org) then raise exception 'TEST new contact not in association directory';end if;
 if exists(select 1 from jsonb_array_elements(public.membership_billing_admin(org)->'legacy') x join public.contact_organization_memberships m on m.id=(x->>'id')::uuid where m.acquisition_source<>'platform') then raise exception 'TEST imported cards leaked into legacy invoice queue';end if;
 rows:='[{"contact_id":"70000000-0000-0000-0000-000000000001"},{"contact_id":"70000000-0000-0000-0000-000000000001"}]';
 plan:=public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows);
 if plan->'rows'->1->>'error'<>'DUPLICATE_CONTACT' then raise exception 'TEST duplicate CSV contact not flagged';end if;
 begin perform public.preview_membership_import(org,current_setting('test.import_paid')::uuid,rows,'complimentary');raise exception 'TEST paid type given for free';exception when others then if sqlerrm<>'MEMBERSHIP_COMPLIMENTARY_REQUIRES_FREE_TYPE' then raise;end if;end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
do $$begin
 if not exists(select 1 from public.organization_membership_types where id=current_setting('test.import_free')::uuid) then raise exception 'TEST holder cannot see own internal type';end if;
 if exists(select 1 from public.organization_membership_types where name='Unassigned internal membership') then raise exception 'TEST linked participant sees hidden unassigned catalog type';end if;
 if (select count(*) from public.contact_organization_memberships where contact_id='70000000-0000-0000-0000-000000000001' and status='active' and acquisition_source<>'platform')<>2 then raise exception 'TEST holder cannot see imported memberships';end if;
 begin perform public.membership_billing_quote(current_setting('test.import_free')::uuid);raise exception 'TEST hidden membership quote allowed';exception when others then if sqlerrm<>'MEMBERSHIP_UNAVAILABLE' then raise;end if;end;
 begin perform public.preview_membership_import('30000000-0000-0000-0000-000000000001',current_setting('test.import_paid')::uuid,'[]');raise exception 'TEST participant import allowed';exception when insufficient_privilege then null;end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000006';
do $$begin
 if exists(select 1 from public.organization_membership_types where id=current_setting('test.import_free')::uuid) then raise exception 'TEST unrelated participant sees hidden catalog type';end if;
 begin perform public.preview_membership_import('30000000-0000-0000-0000-000000000001',current_setting('test.import_paid')::uuid,'[]');raise exception 'TEST other org import allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if exists(select 1 from membership_import_finance f where f.invoices<>(select count(*) from public.invoices) or f.charges<>(select count(*) from public.billing_charges) or f.payments<>(select count(*) from public.billing_payments)) then raise exception 'TEST imported cards must not generate invoices, charges or payments';end if;
 if exists(select 1 from public.contact_organization_memberships where acquisition_source<>'platform' and (invoice_id is not null or billing_charge_id is not null or status<>'active')) then raise exception 'TEST incorrect external entitlement';end if;
end $$;
rollback;
