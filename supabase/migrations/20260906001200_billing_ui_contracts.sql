-- UI contracts; no routes, fixtures or activation in the migration.
begin;
create function public.billing_ui_reasons(p_reasons jsonb) returns jsonb language sql immutable set search_path='' as $$
 select coalesce(jsonb_agg(case v when 'Finalisation autonome non disponible' then 'CHECKOUT_DISABLED' when 'Compte fermé' then 'CLOSED' when 'Fermeture non encore autorisée' then 'CLOSING_PHASE' when 'D’autres frais sont attendus' then 'FEES_EXPECTED' when 'Une opération est en traitement' then 'PAYMENT_PENDING' when 'Vérification par l’association' then 'ADMIN_REVIEW' when 'Le solde doit être réglé' then 'BALANCE_DUE' when 'Vérification du solde par l’association' then 'BALANCE_REVIEW' when 'Seul le payeur peut finaliser ce compte' then 'PAYER_ONLY' when 'Récapitulatif à confirmer' then 'RECAP_REQUIRED' else 'ADMIN_REVIEW' end),'[]') from jsonb_array_elements_text(p_reasons) v;
$$;
create function public.billing_ui_detail(p_folio uuid,p_personal boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb; c public.billing_contexts; sale boolean; staff boolean;
begin
 d:=public.get_billing_account_detail(p_folio,p_personal);
 select * into c from public.billing_contexts where id=(d#>>'{context,id}')::uuid;
 staff:=not p_personal and public.billing6_staff(c.id) and public.billing6_cap(c.id,'engine');
 sale:=staff and d->>'state'='open' and clock_timestamp()>=c.opens_at and (c.closes_at is null or clock_timestamp()<c.closes_at) and not exists(select 1 from public.shows where id=c.show_id and status='archived');
 return jsonb_set(d,'{checkout,reasons}',public.billing_ui_reasons(d#>'{checkout,reasons}'))||jsonb_build_object('stripe',public.get_billing_stripe_status(p_folio,p_personal),'actions',jsonb_build_object('sale',sale,'payment',staff,'attest',staff and d->>'state'='open','finalize',staff and d->>'state'='open'),
 'controls',case when not p_personal then public.billing_get_close_controls(p_folio) else null end);
end $$;
create function public.billing_ui_catalog(p_context uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.billing_contexts;
begin
 select * into c from public.billing_contexts where id=p_context;
 if not found or not public.billing6_staff(c.id) then raise exception 'BILLING_FORBIDDEN'; end if;
 return jsonb_build_object('context_id',c.id,'organization_id',c.organization_id,'currency',c.currency,'enabled',public.billing6_cap(c.id,'engine'),
 'products',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'price',t.unit_price,'exemption_reason',t.exemption_reason) order by p.name,p.id) from public.billing_product_tax_profiles t join public.organization_products p on p.id=t.product_id where t.context_id=c.id and p.is_active),'[]'));
end $$;
create function public.billing_navigation_scope(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('staff',public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']) or exists(select 1 from public.shows s where s.organization_id=p_org and public.has_show_role(s.id,array['secretary'])));
$$;
revoke all on function public.billing_ui_reasons(jsonb),public.billing_ui_detail(uuid,boolean),public.billing_ui_catalog(uuid),public.billing_navigation_scope(uuid) from public,anon,authenticated;
grant execute on function public.billing_ui_detail(uuid,boolean),public.billing_ui_catalog(uuid),public.billing_navigation_scope(uuid) to authenticated;
commit;
