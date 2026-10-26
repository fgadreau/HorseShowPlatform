-- Summary-only reads: avoid rebuilding document snapshots for every total.
begin;
create or replace function public.list_billing_contexts(p_org uuid,p_kind text,p_year integer default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 perform public.billing6_filter('{}',p_limit,p_offset);
 if p_org is null or p_kind not in ('event','non_event') then raise exception 'BILLING_INVALID_FILTER'; end if;
 with contexts as materialized (
 select c.id,s.id show_id,s.name name_fr,coalesce(c.config->>'name_en',s.name) name_en,s.start_date,s.end_date,s.status,
 coalesce(a.financial_year,case when c.id is null then extract(year from s.start_date)::integer end) as year,c.currency
 from public.shows s left join public.billing_contexts c on c.show_id=s.id left join public.billing_context_access a on a.context_id=c.id
 where s.organization_id=p_org and p_kind='event' and (case when c.id is null then public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']) or public.has_show_role(s.id,array['secretary']) else public.billing6_staff(c.id) end)
 union all
 select c.id,null,c.config->>'name_fr',c.config->>'name_en',null,null,null,a.financial_year,c.currency
 from public.billing_contexts c left join public.billing_context_access a on a.context_id=c.id where c.organization_id=p_org and c.kind='non_event' and p_kind='non_event' and public.billing6_staff(c.id)),
 filtered as materialized (select * from contexts c where p_year is null or c.year=p_year),
 page as materialized (select * from filtered order by name_fr,coalesce(id,show_id) limit p_limit offset p_offset),
 folios as materialized (select f.id,f.billing_context_id,f.state from public.billing_folios f join page c on c.id=f.billing_context_id where f.organization_id=p_org),
 counts as (select billing_context_id,count(*) accounts,count(*) filter(where state='open') open_accounts from folios group by billing_context_id),
 charges as (select f.billing_context_id,sum(ch.total) total from folios f join public.billing_charges ch on ch.folio_id=f.id group by f.billing_context_id),
 payments as (select f.billing_context_id,sum(pm.amount) paid from folios f join public.billing_payments pm on pm.folio_id=f.id group by f.billing_context_id),
 rows as (select c.*,coalesce(n.accounts,0) accounts,coalesce(n.open_accounts,0) open_accounts,
 coalesce(ch.total,0) total,coalesce(pm.paid,0) paid,coalesce(ch.total,0)-coalesce(pm.paid,0) balance
 from page c left join counts n on n.billing_context_id=c.id left join charges ch on ch.billing_context_id=c.id left join payments pm on pm.billing_context_id=c.id)
 select (select count(*) from filtered),coalesce(jsonb_agg(to_jsonb(q) order by name_fr,coalesce(id,show_id)),'[]') into n,r from rows q;
 return jsonb_build_object('items',r,'total',n,'limit',p_limit,'offset',p_offset);
end $$;
commit;
