-- Explicit setup for future non-event sales. Historical invoices remain in the read-only archive.
begin;
create function public.configure_non_event_billing(p_org uuid,p_year integer,p_config jsonb,p_taxes jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare ctx uuid;typ uuid;a jsonb;tax jsonb;c public.billing_contexts;begin
 a:=public.billing_assert_staff(p_org);
 if a->>'kind'<>'platform_admin' and a->>'role'<>'admin' then raise exception 'BILLING_FORBIDDEN';end if;
 if p_year is null or p_year not between 1900 and 2200 then raise exception 'BILLING_INVALID_YEAR';end if;
 perform public.billing6_lock(p_org);perform public.billing_lock_scope(p_org,null);
 if not coalesce((select engine and personal from public.billing_pilot_organizations where organization_id=p_org),false) then raise exception 'BILLING_PILOT_REQUIRED';end if;
 select id into ctx from public.billing_contexts where organization_id=p_org and kind='non_event' and context_code='SERVICES-'||p_year;
 if ctx is not null then return ctx;end if;
 perform public.billing_check_config(p_config);
 if not exists(select 1 from pg_timezone_names where name=p_config->>'timezone') or jsonb_typeof(p_taxes) is distinct from 'array' then raise exception 'BILLING_INVALID_CONFIG';end if;
 select id into typ from public.billing_context_types where organization_id=p_org and code='association_services' and version=1;
 if typ is null then typ:=public.billing_create_context_type(p_org,'association_services',1,p_config);end if;
 insert into public.billing_contexts(organization_id,kind,context_type_id,context_code,currency,config,opens_at,created_by)
 values(p_org,'non_event',typ,'SERVICES-'||p_year,(select currency from public.organizations where id=p_org),p_config,clock_timestamp(),public.current_profile_id()) returning id into ctx;
 for tax in select value from jsonb_array_elements(p_taxes) loop
  if nullif(trim(tax->>'code'),'') is null or nullif(trim(tax->>'name'),'') is null or nullif(trim(tax->>'jurisdiction'),'') is null or (tax->>'rate')::numeric is null or (tax->>'rate')::numeric<=0 then raise exception 'BILLING_TAX_CONFIG_REQUIRED';end if;
  insert into public.billing_tax_rules(organization_id,context_id,code,name,jurisdiction,rate,rule_version,valid_from) values(p_org,ctx,tax->>'code',tax->>'name',tax->>'jurisdiction',(tax->>'rate')::numeric,'non-event-adoption-1',current_date);
 end loop;
 insert into public.billing_product_tax_profiles(context_id,product_id,unit_price,exemption_reason)
 select ctx,p.id,p.default_price,case when not p.tax_applicable or jsonb_array_length(p_taxes)=0 then 'Configuration explicite sans taxes' end
 from public.organization_products p where p.organization_id=p_org and p.is_active and p_config->'categories' ? p.category
 and not exists(select 1 from public.event_billing_products ep where ep.product_id=p.id) and not exists(select 1 from public.reservation_billing_products rp where rp.product_id=p.id);
 insert into public.billing_product_tax_rules(context_id,product_id,tax_rule_id)
 select ctx,pr.product_id,t.id from public.billing_product_tax_profiles pr join public.organization_products p on p.id=pr.product_id cross join public.billing_tax_rules t where pr.context_id=ctx and p.tax_applicable and t.context_id=ctx;
 perform public.billing_set_capabilities(p_org,ctx,true,true,false,false,p_year);
 insert into public.billing_audit_events(organization_id,actor_id,operation,authorization_snapshot,payload) values(p_org,public.current_profile_id(),'non_event_billing_adopt',a,jsonb_build_object('context_id',ctx,'year',p_year,'taxes',p_taxes,'historical_invoices','preserved_without_import'));
 return ctx;
end $$;
revoke all on function public.configure_non_event_billing(uuid,integer,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_non_event_billing(uuid,integer,jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
