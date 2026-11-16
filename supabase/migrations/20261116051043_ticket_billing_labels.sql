-- Preserve French billing labels when applying SQL through Windows clients.
begin;
create or replace function public.save_ticket_block(p_block uuid,p_config jsonb,p_options jsonb,p_taxes jsonb,p_revision integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare b public.blocks;s public.shows;cfg public.ticket_blocks;ctx uuid;typ uuid;prod uuid;prefix text;config jsonb;r jsonb;opt uuid;kept uuid[]:='{}';has_orders boolean;taxes jsonb;cap integer;begin
 select * into b from public.blocks where id=p_block;
 if not public.ticket_staff(p_block) then raise exception 'TICKET_FORBIDDEN' using errcode='42501';end if;
 perform public.billing6_lock(b.organization_id);perform public.billing_lock_scope(b.organization_id,null);
 select * into b from public.blocks where id=p_block for update;
 if b.block_type not in ('event','ticketed_event') then raise exception 'TICKET_BLOCK_TYPE_REQUIRED';end if;
 select * into s from public.shows where id=b.show_id;
 select * into cfg from public.ticket_blocks where block_id=b.id;
 if cfg.block_id is not null and p_revision is distinct from cfg.revision then raise exception 'TICKET_SETTINGS_CHANGED';end if;
 if p_config->>'payment_policy' is null or p_config->>'payment_policy' not in ('manual','pay_at_booking') or jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options) not between 1 and 30 or jsonb_typeof(p_taxes) is distinct from 'array' then raise exception 'TICKET_INVALID_SETTINGS';end if;
 cap:=nullif(p_config->>'capacity','')::integer;
 if cap is not null and cap<public.ticket_used(b.id) then raise exception 'TICKET_CAPACITY_BELOW_RESERVED';end if;
 if not coalesce((select engine and personal from public.billing_pilot_organizations where organization_id=b.organization_id),false) then raise exception 'BILLING_PILOT_REQUIRED';end if;
 if cfg.block_id is null then
  prefix:='T-'||upper(substr(replace(b.id::text,'-',''),1,12));
  config:=jsonb_build_object('name_fr',s.name||' — '||b.name,'name_en',s.name||' — '||b.name,'account_prefix',prefix||'-A','receipt_prefix',prefix||'-R','invoice_prefix',prefix||'-I','closing_policy','manual','payment_policy','received_only','activation_policy','allocated_received','categories',jsonb_build_array('ticket'),'staff_roles',jsonb_build_array('admin','secretary'),'period',extract(year from s.start_date)::text,'timezone',coalesce(s.timezone,'America/Toronto'));
  perform public.billing_check_config(config);
  insert into public.billing_context_types(organization_id,code,version,config) values(b.organization_id,'ticket_'||replace(b.id::text,'-',''),1,config) returning id into typ;
  insert into public.billing_contexts(organization_id,kind,context_type_id,context_code,currency,config,opens_at,created_by)
  values(b.organization_id,'non_event',typ,'TICKET-'||b.id,coalesce(s.default_currency,(select currency from public.organizations where id=b.organization_id)),config,clock_timestamp(),public.current_profile_id()) returning id into ctx;
  -- Narrow domain adoption, preserving the association's existing global opt-in.
  insert into public.billing_context_access(context_id,engine,personal,personal_history,checkout,closing_phase,revision,financial_year,year_basis)
  values(ctx,true,true,true,false,false,1,extract(year from s.start_date)::integer,'service_year');
  insert into public.ticket_blocks(block_id,context_id,payment_policy) values(b.id,ctx,p_config->>'payment_policy');
 else ctx:=cfg.context_id;end if;
 has_orders:=exists(select 1 from public.ticket_orders where block_id=b.id);
 select coalesce(jsonb_agg(jsonb_build_object('code',code,'name',name,'rate',rate,'jurisdiction',jurisdiction) order by code),'[]') into taxes from public.billing_tax_rules where context_id=ctx;
 if has_orders and taxes is distinct from (select coalesce(jsonb_agg(v order by v->>'code'),'[]') from jsonb_array_elements(p_taxes) v) then raise exception 'TICKET_TAXES_FROZEN';end if;
 if not has_orders then
  delete from public.billing_tax_rules where context_id=ctx;
  for r in select value from jsonb_array_elements(p_taxes) loop
   if nullif(btrim(r->>'name'),'') is null or nullif(btrim(r->>'code'),'') is null or nullif(btrim(r->>'jurisdiction'),'') is null or (r->>'rate')::numeric is null or (r->>'rate')::numeric<=0 then raise exception 'TICKET_TAX_CONFIG_REQUIRED';end if;
   insert into public.billing_tax_rules(organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from) values(b.organization_id,ctx,r->>'code',r->>'name',r->>'jurisdiction',(r->>'rate')::numeric,'ticket-1',current_date);
  end loop;
 end if;
 for r in select value from jsonb_array_elements(p_options) loop
  opt:=nullif(r->>'id','')::uuid;
  if opt=any(kept) then raise exception 'TICKET_DUPLICATE_OPTION';end if;
  if (r->>'taxable')::boolean and jsonb_array_length(p_taxes)=0 then raise exception 'TICKET_TAX_CONFIG_REQUIRED';end if;
  if opt is not null and not exists(select 1 from public.ticket_options where id=opt and block_id=b.id) then raise exception 'TICKET_OPTION_SCOPE';end if;
  if nullif(r->>'capacity','')::integer<public.ticket_used(b.id,opt) and opt is not null then raise exception 'TICKET_CAPACITY_BELOW_RESERVED';end if;
  if opt is null then
   opt:=gen_random_uuid();
   insert into public.organization_products(organization_id,name,code,category,default_price,tax_applicable) values(b.organization_id,r->>'name','TICKET-'||opt,'ticket',(r->>'price')::numeric,(r->>'taxable')::boolean) returning id into prod;
   insert into public.ticket_options(id,block_id,product_id,name,price,taxable,tax_mode,capacity,is_active,sort_order)
   values(opt,b.id,prod,r->>'name',(r->>'price')::numeric,(r->>'taxable')::boolean,r->>'tax_mode',nullif(r->>'capacity','')::integer,coalesce((r->>'is_active')::boolean,true),coalesce((r->>'sort_order')::integer,0));
  else
   update public.ticket_options set name=r->>'name',price=(r->>'price')::numeric,taxable=(r->>'taxable')::boolean,tax_mode=r->>'tax_mode',capacity=nullif(r->>'capacity','')::integer,is_active=coalesce((r->>'is_active')::boolean,true),sort_order=coalesce((r->>'sort_order')::integer,0) where id=opt;
  end if;kept:=array_append(kept,opt);
 end loop;
 update public.ticket_options set is_active=false where block_id=b.id and not id=any(kept);
 update public.ticket_blocks set payment_policy=p_config->>'payment_policy',capacity=cap,sales_open_at=nullif(p_config->>'sales_open_at','')::timestamptz,sales_close_at=nullif(p_config->>'sales_close_at','')::timestamptz,is_active=coalesce((p_config->>'is_active')::boolean,false),revision=revision+1 where block_id=b.id;
 update public.blocks set block_type='ticketed_event' where id=b.id;
 update public.billing_close_blocks set active=coalesce((p_config->>'is_active')::boolean,false),updated_at=clock_timestamp(),actor_id=public.current_profile_id() where block_key='ticket_sales_open' and folio_id in(select id from public.billing_folios where billing_context_id=ctx);
 if s.event_only and coalesce((p_config->>'is_active')::boolean,false) then update public.shows set status='open',is_public=true where id=s.id;end if;
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(b.organization_id,public.current_profile_id(),'ticket_settings',jsonb_build_object('block',b.id),jsonb_build_object('config',p_config,'taxes',p_taxes));
 return jsonb_build_object('block_id',b.id,'context_id',ctx);
end $$;

create or replace function public.purchase_tickets(p_request uuid,p_block uuid,p_buyer uuid,p_items jsonb,p_preference text,p_signature text) returns jsonb language plpgsql security definer set search_path='' as $$
declare b public.blocks;cfg public.ticket_blocks;ord public.ticket_orders;cmd jsonb;q jsonb;line jsonb;t jsonb;customer uuid;f public.billing_folios;ch uuid;opt public.ticket_options;directory uuid;begin
 if public.current_profile_id() is null or p_request is null then raise exception 'TICKET_FORBIDDEN' using errcode='42501';end if;
 select * into b from public.blocks where id=p_block;
 if b.id is null then raise exception 'TICKET_NOT_FOUND';end if;
 perform public.billing6_lock(b.organization_id);perform public.billing_lock_scope(b.organization_id,null);
 perform 1 from public.blocks where id=p_block for update;
 if not public.ticket_staff(p_block) and not exists(select 1 from public.contacts where id=p_buyer and linked_user_id=public.current_profile_id()) then raise exception 'TICKET_BUYER_FORBIDDEN' using errcode='42501';end if;
 if length(coalesce(p_preference,''))>1000 then raise exception 'TICKET_PREFERENCE_TOO_LONG';end if;
 cmd:=jsonb_build_object('block',p_block,'buyer',p_buyer,'items',p_items,'preference',coalesce(p_preference,''),'signature',p_signature);
 select * into ord from public.ticket_orders where id=p_request;
 if ord.id is not null then
  if ord.actor_id<>public.current_profile_id() or ord.command<>cmd then raise exception 'TICKET_IDEMPOTENCY_CONFLICT';end if;
  return jsonb_build_object('order_id',ord.id,'folio_id',ord.folio_id,'payment_policy',ord.payment_policy,'total',ord.quote->'total');
 end if;
 q:=public.ticket_quote(p_block,p_items);
 if q->>'signature' is distinct from p_signature then raise exception 'TICKET_QUOTE_CHANGED';end if;
 select * into cfg from public.ticket_blocks where block_id=p_block;
 select id into directory from public.organization_disciplines where organization_id=b.organization_id order by id limit 1;
 if directory is null then raise exception 'TICKET_DIRECTORY_REQUIRED';end if;
 insert into public.directory_contacts(organization_discipline_id,contact_id) values(directory,p_buyer) on conflict do nothing;
 perform pg_advisory_xact_lock(hashtextextended('billing-customer:'||b.organization_id||':'||p_buyer,0));
 insert into public.billing_customer_accounts(organization_id,payer_contact_id) values(b.organization_id,p_buyer) on conflict do nothing;
 select id into customer from public.billing_customer_accounts where organization_id=b.organization_id and payer_contact_id=p_buyer;
 select * into f from public.billing_folios where billing_context_id=cfg.context_id and payer_customer_account_id=customer for update;
 if not found then insert into public.billing_folios(organization_id,billing_context_id,payer_customer_account_id,currency,public_number,created_by) select b.organization_id,c.id,customer,c.currency,public.billing_number(b.organization_id,'account',c.config->>'account_prefix'),public.current_profile_id() from public.billing_contexts c where c.id=cfg.context_id returning * into f;end if;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 insert into public.billing_close_blocks(folio_id,block_key,reason,internal_detail,active,actor_id) values(f.id,'ticket_sales_open','pending_operation','Ventes de billets ouvertes',true,public.current_profile_id()) on conflict(folio_id,block_key) do update set active=true,updated_at=clock_timestamp();
 insert into public.ticket_orders(id,block_id,buyer_contact_id,actor_id,folio_id,preference,command,quote,payment_policy) values(p_request,p_block,p_buyer,public.current_profile_id(),f.id,coalesce(p_preference,''),cmd,q,cfg.payment_policy);
 for line in select value from jsonb_array_elements(q->'lines') loop
  select * into opt from public.ticket_options where id=(line->>'option_id')::uuid;
  ch:=null;
  if (line#>>'{amounts,total}')::numeric>0 then
   insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
   values(b.organization_id,f.id,f.currency,'secretary_sale',gen_random_uuid(),opt.product_id,'ticket',b.name||' — '||opt.name,(line->>'quantity')::integer,round((line#>>'{amounts,subtotal}')::numeric/(line->>'quantity')::integer,2),(line#>>'{amounts,subtotal}')::numeric,(line#>>'{amounts,tax_amount}')::numeric,case when not opt.taxable then 'Billet non taxable — choix de l’association' end,p_buyer,public.current_profile_id(),jsonb_build_object('kind','ticket','order',p_request,'block',b.id)) returning id into ch;
   for t in select value from jsonb_array_elements(line#>'{amounts,taxes}') loop
    insert into public.billing_charge_taxes values(ch,(t->>'id')::uuid,t->>'name',t->>'code',t->>'jurisdiction',(t->>'rate')::numeric,(t->>'base')::numeric,(t->>'amount')::numeric);
   end loop;
   insert into public.billing_charge_presentation(charge_id,presentation) values(ch,jsonb_build_object('section','ticket','block_label',b.name,'option_label',opt.name,'order_id',p_request,'show_name',(select name from public.shows where id=b.show_id)));
  end if;
  insert into public.ticket_order_lines(order_id,option_id,quantity,charge_id,snapshot) values(p_request,opt.id,(line->>'quantity')::integer,ch,line);
 end loop;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(b.organization_id,f.id,public.current_profile_id(),'ticket_purchase',jsonb_build_object('buyer',p_buyer),jsonb_build_object('order',p_request,'quote',q));
 return jsonb_build_object('order_id',p_request,'folio_id',f.id,'payment_policy',cfg.payment_policy,'total',q->'total');
end $$;

create or replace function public.cancel_ticket_order(p_order uuid,p_reason text,p_credit text) returns void language plpgsql security definer set search_path='' as $$
declare ord public.ticket_orders;b public.blocks;f public.billing_folios;ch public.billing_charges;credit uuid;begin
 select * into ord from public.ticket_orders where id=p_order;
 if not public.ticket_staff(ord.block_id) then raise exception 'TICKET_FORBIDDEN' using errcode='42501';end if;
 select * into b from public.blocks where id=ord.block_id;
 perform public.billing6_lock(b.organization_id);perform public.billing_lock_scope(b.organization_id,null);
 perform 1 from public.blocks where id=b.id for update;select * into ord from public.ticket_orders where id=p_order for update;
 if ord.status='cancelled' then return;end if;
 if length(btrim(coalesce(p_reason,''))) not between 5 and 1000 or p_credit is null or p_credit not in ('full','none') then raise exception 'TICKET_CANCELLATION_REASON_REQUIRED';end if;
 select * into f from public.billing_folios where id=ord.folio_id for update;
 if f.state<>'open' then raise exception 'BILLING_FOLIO_CLOSED';end if;
 if exists(select 1 from public.billing_stripe_attempts where folio_id=f.id and not resolved) then raise exception 'BILLING_PAYMENT_PENDING';end if;
 if p_credit='full' then
  for ch in select c.* from public.ticket_order_lines l join public.billing_charges c on c.id=l.charge_id where l.order_id=ord.id loop
   insert into public.billing_charges(organization_id,folio_id,currency,source_type,source_id,product_id,category,description,quantity,unit_price,subtotal,tax_amount,exemption_reason,beneficiary_contact_id,actor_id,authorization_snapshot)
   values(ch.organization_id,ch.folio_id,ch.currency,'reservation_credit',gen_random_uuid(),ch.product_id,ch.category,'Annulation / Cancellation — '||ch.description,ch.quantity,ch.unit_price,-ch.subtotal,-ch.tax_amount,ch.exemption_reason,ch.beneficiary_contact_id,public.current_profile_id(),jsonb_build_object('kind','ticket_cancellation','order',ord.id,'original_charge_id',ch.id)) returning id into credit;
   insert into public.billing_charge_taxes select credit,tax_rule_id,name,code,jurisdiction,rate,-base,-amount from public.billing_charge_taxes where charge_id=ch.id;
   insert into public.billing_charge_presentation(charge_id,presentation) select credit,presentation from public.billing_charge_presentation where charge_id=ch.id;
   insert into public.reservation_billing_reversals(charge_id,credit_id,actor_id) values(ch.id,credit,public.current_profile_id());
  end loop;
 end if;
 update public.ticket_orders set status='cancelled',cancelled_at=clock_timestamp(),cancelled_by=public.current_profile_id(),cancellation_reason=btrim(p_reason),credit_mode=p_credit where id=ord.id;
 update public.billing_folios set version=version+1 where id=f.id;
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload) values(b.organization_id,f.id,public.current_profile_id(),'ticket_cancellation',jsonb_build_object('order',ord.id),jsonb_build_object('reason',p_reason,'credit',p_credit));
end $$;
notify pgrst,'reload schema';
commit;
