begin;
alter table public.manual_sales add column unit_price_tax_mode text not null default 'exclusive' check(unit_price_tax_mode in ('exclusive','inclusive'));
alter table public.manual_sales add column entered_unit_price numeric(12,2);
alter table public.entries add column base_fee_tax_mode text not null default 'exclusive' check(base_fee_tax_mode in ('exclusive','inclusive'));
alter table public.entries add column entered_base_fee numeric(12,2);

-- Unit prices remain stored before tax, as expected by both existing invoice
-- engines. Keep the original input and its meaning separately for the audit.
create function public.entry_amount_before_tax(p_org uuid,p_show uuid,p_amount numeric,p_taxable boolean,p_mode text) returns numeric language plpgsql security definer set search_path='' as $$
declare rules jsonb;ctx uuid;rate numeric;
begin
 if p_mode is null or p_mode not in ('exclusive','inclusive') or p_amount is null or p_amount<0 or p_amount<>round(p_amount,2) then raise exception 'ENTRY_INVALID_AMOUNT';end if;
 if p_mode='exclusive' or not p_taxable then return p_amount;end if;
 perform public.billing_assert_staff(p_org,p_show);
 select context_id into ctx from public.reservation_billing_contexts where show_id=p_show;
 if ctx is not null then
  if exists(select 1 from public.billing_tax_rules where context_id=ctx and (current_date<valid_from or (valid_until is not null and current_date>valid_until))) then raise exception 'BILLING_TAX_RULE_OUTSIDE_VALIDITY';end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'rate',t.rate) order by t.code,t.id),'[]') into rules from public.billing_tax_rules t where t.context_id=ctx;
 else
  select coalesce(s.tax_rate,o.tax_rate,0) into rate from public.organizations o left join public.shows s on s.id=p_show and s.organization_id=o.id where o.id=p_org;
  rules:=jsonb_build_array(jsonb_build_object('rate',coalesce(rate,0)));
 end if;
 return (public.entry_money_breakdown(p_amount,p_mode,rules)->>'subtotal')::numeric;
end $$;

create function public.manual_sale_tax_input() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  new.entered_unit_price:=new.unit_price;
  new.unit_price:=public.entry_amount_before_tax(new.organization_id,new.show_id,new.unit_price,new.tax_applicable,new.unit_price_tax_mode);
 elsif (new.unit_price,new.unit_price_tax_mode) is distinct from (old.unit_price,old.unit_price_tax_mode) then
  new.entered_unit_price:=new.unit_price;
  new.unit_price:=public.entry_amount_before_tax(new.organization_id,new.show_id,new.unit_price,new.tax_applicable,new.unit_price_tax_mode);
 else new.entered_unit_price:=old.entered_unit_price;
 end if;
 return new;
end $$;
create trigger manual_sales_00_tax_input before insert or update on public.manual_sales for each row execute function public.manual_sale_tax_input();

create function public.entry_fee_tax_input() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' or new.base_fee is distinct from old.base_fee then
  new.entered_base_fee:=new.base_fee;
  if new.base_fee is not null then new.base_fee:=public.entry_amount_before_tax(new.organization_id,new.show_id,new.base_fee,true,new.base_fee_tax_mode);end if;
 else new.entered_base_fee:=old.entered_base_fee;new.base_fee_tax_mode:=old.base_fee_tax_mode;
 end if;
 return new;
end $$;
create trigger entries_00_tax_input before insert or update on public.entries for each row execute function public.entry_fee_tax_input();
revoke all on function public.entry_amount_before_tax(uuid,uuid,numeric,boolean,text),public.manual_sale_tax_input(),public.entry_fee_tax_input() from public,anon,authenticated,service_role;
commit;
