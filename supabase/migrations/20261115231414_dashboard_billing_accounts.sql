-- Add the current account reader before switching the frontend.
begin;
create or replace function public.list_dashboard_billing_accounts(p_org uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if public.current_profile_id() is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501';end if;
 return coalesce((select jsonb_agg(q.item || jsonb_build_object('payer_contact_id',ca.payer_contact_id) order by q.id)
 from (select id,item from public.billing6_accounts(p_org,false,'{}')
       union select id,item from public.billing6_accounts(p_org,true,'{}')) q
 join public.billing_folios f on f.id=q.id
 join public.billing_customer_accounts ca on ca.id=f.payer_customer_account_id),'[]');
end $$;
revoke all on function public.list_dashboard_billing_accounts(uuid) from public,anon,authenticated;
grant execute on function public.list_dashboard_billing_accounts(uuid) to authenticated;

commit;
