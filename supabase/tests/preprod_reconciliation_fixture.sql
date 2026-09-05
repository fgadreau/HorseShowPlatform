\set ON_ERROR_STOP on
-- Synthetic fixture: audit has aggregates, not a backup of private row data.
\ir ../seed.sql

delete from public.invoice_line_items;
delete from public.invoices;
delete from public.show_score_judge_sessions;
insert into public.organizations (id,name,slug) values
 ('30000000-0000-0000-0000-000000000003','Fixture C','fixture-c'),
 ('30000000-0000-0000-0000-000000000004','Fixture D','fixture-d');
insert into public.blocks (id, organization_id, show_id, show_day_id, name, pattern, sort_order, schedule_is_public)
select ('50000000-0000-0000-0000-' || lpad(n::text,12,'0'))::uuid,
 '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '41000000-0000-0000-0000-000000000001','Reconciliation '||n,'8',n,true
from generate_series(4,7) n;
insert into public.classes (id, block_id, organization_id, show_id, organization_discipline_id, name, sort_order)
select ('60000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '33000000-0000-0000-0000-000000000001','Fixture class '||n,1
from generate_series(4,7) n;
insert into public.show_score_block_setups (block_id,live_data_source,runs,set_approval_mode,set_approvals,live_display_mode,qualified_rider_count,live_source_changed_at,live_source_changed_by)
select ('50000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 case when n=7 then 'scribe' else 'announcer' end,
 jsonb_build_array(jsonb_build_object('id','fixture-'||n,'draw',1,'rider','Fixture '||n)),
 case when n%2=0 then 'per_set' else 'class_end' end,
 jsonb_build_array(jsonb_build_object('set',1,'approved',true)),
 case when n%2=0 then 'order_only' else 'full' end,n,
 '2026-09-01T12:00:00Z','fixture@example.test'
from generate_series(2,7) n;
insert into public.show_score_paid_warmups (id, organization_id, show_id, show_day_id, name, entries, sort_order)
values ('50000000-0000-0000-0000-000000000008',
 '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 '41000000-0000-0000-0000-000000000001','Fixture warmup',
 '[{"id":"entry-1","order":1,"status":"pending"},{"id":"entry-2","order":2,"status":"pending"}]',8);
-- All seven setup broadcasts eligible; keep six initialized session revisions.
update public.shows set is_public=true,show_schedule_public=true;
update public.show_score_announcer_live_sessions set revision=5;
-- Match the ancillary aggregate counts without copying personal PREPROD data.
insert into public.class_governing_bodies (class_id,governing_body_id)
select '60000000-0000-0000-0000-000000000004',id from public.governing_bodies where code='AQR';
insert into public.horses (id,name,primary_owner_contact_id,created_by_user_id)
select ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'Fixture horse '||n,
 '70000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004'
from generate_series(3,50) n;
insert into public.horse_documents (uploaded_by_organization_id,horse_id,document_type,status,verification_source,certificate_number,issuer_name,test_or_administered_on,result,horse_name,reviewed_by_user_id,reviewed_at,created_by_user_id)
select '30000000-0000-0000-0000-000000000001',
 ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 d.document_type,'approved','manual','FIXTURE-'||n||'-'||d.document_type,
 'Fixture Vet','2026-01-15',d.result,'Fixture horse '||n,
 '20000000-0000-0000-0000-000000000002',now(),'20000000-0000-0000-0000-000000000004'
from generate_series(3,50) n
cross join (values ('coggins_eia','negative'),('combo_vaccine',null)) d(document_type,result);
insert into public.contacts (id,type,first_name,last_name,created_by_user_id)
select ('71000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 'rider','Fixture','Rider '||n,'20000000-0000-0000-0000-000000000002'
from generate_series(3,50) n;
insert into public.entries (id,organization_id,show_id,horse_id,class_id,created_by_user_id,owner_contact_id,rider_contact_id,payer_contact_id,status,entry_number,base_fee,total_fees)
select ('90000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001',
 ('80000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '60000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000004',
 '70000000-0000-0000-0000-000000000001',('71000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,
 '70000000-0000-0000-0000-000000000001','active',300+n,150,150
from generate_series(3,50) n;

-- Requirements can be configured after registrations already exist.
insert into public.eligibility_requirements (organization_id,scope_type,class_id,requirement_type,subject_type)
select organization_id,'class',id,'host_membership','rider' from public.classes;
