-- Synthetic billed options and cancellation pair, no real reservation modified.
begin;
do $$
declare
 staff_user uuid:=gen_random_uuid(); stranger_user uuid:=gen_random_uuid();staff_profile uuid;
 org uuid:=gen_random_uuid();other_org uuid:=gen_random_uuid();show_id uuid:=gen_random_uuid();ctx uuid:=gen_random_uuid();other_ctx uuid:=gen_random_uuid();
 payer uuid:=gen_random_uuid();customer uuid:=gen_random_uuid();product uuid:=gen_random_uuid();folio uuid:=gen_random_uuid();ch uuid;hsp uuid;payment uuid;
 request uuid:=gen_random_uuid();report jsonb;page jsonb;expense public.billing_context_expenses;blocked boolean;before_charges bigint;option_name text;price numeric;child_total numeric;
begin
 insert into auth.users(id,email,raw_user_meta_data) values(staff_user,staff_user||'@example.test','{"first_name":"Finance","last_name":"Test"}'),(stranger_user,stranger_user||'@example.test','{"first_name":"Other","last_name":"Test"}');
 select id into staff_profile from public.user_profiles where user_id=staff_user;
 insert into public.organizations(id,name,slug,is_test_mode) values(org,'Report TEST',org::text,true),(other_org,'Other TEST',other_org::text,true);
 insert into public.organization_members(organization_id,user_id,role) values(org,staff_profile,'admin');
 insert into public.shows(id,organization_id,name,slug,start_date,end_date) values(show_id,org,'Finance report TEST',show_id::text,current_date,current_date);
 insert into public.contacts(id,type,first_name,last_name) values(payer,'payer','Synthetic','Payer');
 insert into public.organization_products(id,organization_id,name,category,default_price,tax_applicable) values(product,org,'Report TEST product','merch',100,true);
 insert into public.billing_contexts(id,organization_id,kind,show_id,currency,config,opens_at,created_by)
 values(ctx,org,'event',show_id,'CAD','{"name_fr":"Concours TEST","name_en":"TEST show","timezone":"America/Toronto","account_prefix":"TEST-ACC","receipt_prefix":"TEST-RCPT","invoice_prefix":"TEST-INV","closing_policy":"manual","payment_policy":"received_only","activation_policy":"allocated_received","categories":["merch","stall","other"],"staff_roles":["admin","secretary"]}',now(),staff_profile);
 insert into public.billing_context_access(context_id,financial_year,year_basis) values(ctx,2026,'show_start')
 on conflict(context_id) do update set financial_year=2026,year_basis='show_start';
 insert into public.billing_customer_accounts(id,organization_id,payer_contact_id) values(customer,org,payer);
 insert into public.billing_folios(id,organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) values(folio,org,ctx,customer,'CAD','TEST-'||folio,staff_profile);
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'merch','TEST sale',1,100,100,5,payer,staff_profile,'{}') returning id into ch;
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,'{"section":"entry","fee_kind":"entry"}');
 -- An unpaid reservation and its immutable credit cancel out of revenue.
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'stall','TEST cancelled',1,50,50,2.5,payer,staff_profile,'{}'),
 (org,folio,'CAD','reservation_credit',gen_random_uuid(),product,'stall','TEST credit',1,50,-50,-2.5,payer,staff_profile,'{}');
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot,supplier)
 values(org,folio,'CAD','secretary_sale',gen_random_uuid(),product,'other','TEST HSP',1,5,5,.25,payer,staff_profile,'{}','hsp') returning id into hsp;
 insert into public.billing_payments(organization_id,folio_id,currency,amount,method,received_at,actor_id,authorization_snapshot,processing_fee_amount)
 values(org,folio,'CAD',60,'cash',now(),staff_profile,'{}',1.20) returning id into payment;
 insert into public.billing_payment_allocations(folio_id,payment_id,charge_id,amount) values(folio,payment,ch,55),(folio,payment,hsp,5);
 select count(*) into before_charges from public.billing_charges where folio_id=folio;

 insert into public.billing_charge_presentation(charge_id,presentation)
 select id,'{"section":"reservation"}'::jsonb from public.billing_charges where folio_id=folio and description in('TEST cancelled','TEST credit');
 insert into public.reservation_billing_reversals(charge_id,credit_id,actor_id)
 select debit.id,credit.id,staff_profile from public.billing_charges debit cross join public.billing_charges credit
 where debit.folio_id=folio and credit.folio_id=folio and debit.description='TEST cancelled' and credit.description='TEST credit';
 for option_name,price in select * from (values('Tack écurie principale',20::numeric),('Stalle écurie régulière',30::numeric),('Ripe',4::numeric),('Foin',6::numeric)) options(name,price) loop
   insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
   values(org,folio,'CAD','reservation',gen_random_uuid(),product,'stall_extra',option_name,1,price,price,round(price*.05,2),payer,staff_profile,'{}') returning id into ch;
   insert into public.billing_charge_presentation(charge_id,presentation) values(ch,'{"section":"reservation"}');
 end loop;
 -- A later label change must not move a reversal into a different revenue group.
 insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,beneficiary_contact_id,actor_id,authorization_snapshot)
 values(org,folio,'CAD','reservation',gen_random_uuid(),product,'stall_extra','Ripe',1,10,10,.5,payer,staff_profile,'{}') returning id into ch;
 insert into public.billing_charge_presentation(charge_id,presentation) values(ch,'{"section":"reservation"}');
 insert into public.billing_product_document_labels(product_id,labels,changed_by) values(product,'{"fr":"Nom modifié après facturation","en":"Renamed after billing"}',staff_profile);
 perform set_config('request.jwt.claim.sub',staff_user::text,true);
 perform set_config('request.jwt.claims',json_build_object('sub',staff_user,'role','authenticated')::text,true);
 perform public.reservation_reverse_charge(ch);
 set local role authenticated;
 report:=public.get_billing_context_report(ctx,org);
 select sum((row->>'subtotal')::numeric) into child_total from jsonb_array_elements(report->'reservation_revenue') row;
 if child_total<>60 or jsonb_array_length(report->'reservation_revenue')<>4 then raise exception 'Reservation detail must net original/credit labels and retain every billed option';end if;
 if (report#>>'{totals,revenue}')::numeric<>160 then raise exception 'Detail must not alter revenue totals';end if;
 if not exists(select 1 from jsonb_array_elements(report->'revenue_categories') row where row->>'category'='reservation' and (row->>'subtotal')::numeric=child_total) then raise exception 'Detail sum must match reservation parent';end if;
 if not exists(select 1 from jsonb_array_elements(report->'reservation_revenue') row where row->>'label_fr'='Stalle écurie régulière' and (row->>'subtotal')::numeric=30) then raise exception 'Frozen option label missing';end if;
 reset role;
 if has_function_privilege('anon','public.get_billing_context_report(uuid,uuid)','EXECUTE') then raise exception 'Report must remain private';end if;
end $$;
rollback;
