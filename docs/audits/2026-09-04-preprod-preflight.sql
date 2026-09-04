-- PREPROD qaguotdproxamgudnnsd uniquement. Connexion à vérifier avant exécution.
-- Aucun DDL/DML; snapshot cohérent, aucune fonction de mutation appelée.
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

-- identity
select current_database(), current_user, current_timestamp, current_setting('transaction_read_only') as read_only, version();

-- history
select version, name from supabase_migrations.schema_migrations order by version;

-- columns
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('show_score_block_setups','show_score_judge_sessions','organizations','classes','class_templates') order by table_name,ordinal_position;

-- constraints
select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('show_score_block_setups','show_score_judge_sessions','class_templates','classes','class_governing_bodies','shows','show_days','blocks','show_score_paid_warmups');

-- functions
select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,p.proacl::text as acl,pg_get_userbyid(p.proowner) as owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('stamp_show_score_live_source_change','set_show_score_live_data_source','set_show_score_live_display_mode','save_show_score_paid_warmup_live','create_association_with_owner','is_org_member','has_show_role','is_platform_admin','set_class_refs','set_show_score_block_setup_refs','set_show_score_block_refs','set_show_score_paid_warmup_refs','can_manage_show_score_show');

-- policies
select * from pg_policies where schemaname='public' and tablename in ('shows','show_days','blocks','show_score_paid_warmups','show_score_block_setups');

-- rls
select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.shows'::regclass,'public.show_days'::regclass,'public.blocks'::regclass,'public.show_score_paid_warmups'::regclass,'public.show_score_block_setups'::regclass);

-- privileges
select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public' and table_name in ('shows','show_days','blocks','show_score_paid_warmups','show_score_block_setups');

-- triggers
select c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition,pg_get_functiondef(t.tgfoid) as function_definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal and c.relname in ('show_score_block_setups','show_score_judge_sessions','class_templates','classes','class_governing_bodies','show_score_paid_warmups','shows','show_days','blocks');

-- counts
select 'show_score_block_setups' as relation,count(*) from public.show_score_block_setups union all select 'show_score_judge_sessions',count(*) from public.show_score_judge_sessions union all select 'class_templates',count(*) from public.class_templates union all select 'blocks',count(*) from public.blocks union all select 'classes',count(*) from public.classes union all select 'class_governing_bodies',count(*) from public.class_governing_bodies union all select 'organizations',count(*) from public.organizations union all select 'show_score_paid_warmups',count(*) from public.show_score_paid_warmups;

-- setup_impact
select count(*) as updated_rows,count(*) filter(where s.set_approval_mode is null or s.set_approvals is null or s.live_data_source is null or s.live_display_mode is null) as backfill_rows,count(*) filter(where s.set_approval_mode not in ('class_end','per_set') or s.live_data_source not in ('scribe','announcer') or s.live_display_mode not in ('full','order_only') or s.qualified_rider_count <=0) as invalid_rows,count(*) filter(where (s.organization_id,s.show_id,s.show_day_id,s.pattern,s.custom_pattern) is distinct from (b.organization_id,b.show_id,b.show_day_id,b.pattern,b.custom_pattern)) as trigger_context_changes from public.show_score_block_setups s left join public.blocks b on b.id=s.block_id;

-- judge_impact
select count(*) filter(where set_approvals is null) as backfill_rows from public.show_score_judge_sessions;

-- ranked_templates
with r as (select id,block_template_id,sort_order as old_order,row_number() over(partition by block_template_id order by created_at,id)::integer as new_order from public.class_templates) select * from r where old_order is distinct from new_order order by block_template_id,new_order;

-- candidates
with ranked as (select ct.*,row_number() over(partition by ct.block_template_id order by ct.created_at,ct.id)::integer as ranked_order from public.class_templates ct), candidates as (select b.id as block_id,b.organization_id,b.show_id,b.created_at as block_created_at,b.block_type,b.schedule_status,b.schedule_is_public,ct.id as class_template_id,ct.organization_id as template_org,ct.organization_discipline_id,od.is_active as discipline_active,od.organization_id as discipline_org,ct.default_entry_fee,ct.default_judge_fee,ct.default_payout_rules,coalesce((select max(c.sort_order) from public.classes c where c.block_id=b.id),0)+row_number() over(partition by b.id order by ct.ranked_order,ct.created_at,ct.id)::integer as next_sort_order,(select count(*) from public.class_template_governing_bodies g where g.class_template_id=ct.id) as governing_bodies from public.blocks b join ranked ct on ct.block_template_id=b.block_template_id left join public.organization_disciplines od on od.id=ct.organization_discipline_id where b.created_at>=timestamptz '2026-08-07 20:13:45+00' and exists(select 1 from public.classes c where c.block_id=b.id and c.class_template_id is not null) and not exists(select 1 from public.classes c where c.block_id=b.id and c.class_template_id=ct.id)) select * from candidates order by block_id,next_sort_order;

-- empty_template_blocks
select count(*) from public.blocks b where b.block_template_id is not null and b.created_at>=timestamptz '2026-08-07 20:13:45+00' and not exists(select 1 from public.classes c where c.block_id=b.id and c.class_template_id is not null);

-- duplicate_template_classes
select block_id,class_template_id,count(*) from public.classes where class_template_id is not null group by block_id,class_template_id having count(*)>1;

-- warmup_shapes
select jsonb_typeof(entries) as entries_type,count(*) from public.show_score_paid_warmups group by 1;

-- function_dependencies
select p.oid::regprocedure::text as function,pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,d.deptype from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_depend d on d.refclassid='pg_proc'::regclass and d.refobjid=p.oid where n.nspname='public' and p.proname in ('stamp_show_score_live_source_change','set_show_score_live_display_mode','set_show_score_live_data_source');

-- announcer_impact
select count(*) as setup_count,count(*) filter(where s.live_data_source='announcer') as announcer_setups,count(*) filter(where s.live_data_source='announcer' and a.class_id is null) as sessions_to_insert,count(*) filter(where s.live_data_source='announcer' and a.class_id is not null and a.started_at is null and a.completed_at is null and a.runs is distinct from coalesce(s.runs,'[]'::jsonb)) as sessions_to_update from public.show_score_block_setups s left join public.show_score_announcer_live_sessions a on a.class_id=s.block_id;

-- public_broadcast_impact
select count(*) filter(where public.showscore_public_class_exists(s.block_id)) as broadcast_eligible_setups from public.show_score_block_setups s;

-- ancillary_counts
select 'show_score_announcer_live_sessions' as relation,count(*) from public.show_score_announcer_live_sessions union all select 'eligibility_requirements',count(*) from public.eligibility_requirements union all select 'entries',count(*) from public.entries union all select 'invoices',count(*) from public.invoices union all select 'payments',count(*) from public.payments;

-- announcer_triggers
select t.tgname,pg_get_triggerdef(t.oid) as definition,pg_get_functiondef(t.tgfoid) as function_definition from pg_trigger t where t.tgrelid='public.show_score_announcer_live_sessions'::regclass and not t.tgisinternal;

-- column_dependencies
select pg_describe_object(d.classid,d.objid,d.objsubid) as dependent,d.deptype from pg_depend d join pg_attribute a on a.attrelid=d.refobjid and a.attnum=d.refobjsubid where d.refclassid='pg_class'::regclass and a.attrelid='public.show_score_block_setups'::regclass and a.attname='live_source_changed_by';

-- default_acl
select pg_get_userbyid(defaclrole) as role,defaclnamespace::regnamespace::text as namespace,defaclobjtype,defaclacl::text from pg_default_acl;

-- critical_privileges
select r,has_schema_privilege(r,'public','CREATE') as public_create,has_function_privilege(r,'public.create_association_with_owner(text,text,text,text,text,text,jsonb)','EXECUTE') as association_rpc_execute from unnest(array['anon','authenticated','service_role']) r;

-- active_warmup
select count(distinct w.id) filter(where w.id=w.block_id) as legacy_linked,count(distinct w.id) filter(where w.active_entry_id is not null) as active_warmups,count(*) filter(where jsonb_typeof(e.value)<>'object') as invalid_queue_objects from public.show_score_paid_warmups w left join lateral jsonb_array_elements(w.entries) e(value) on true;

ROLLBACK;
