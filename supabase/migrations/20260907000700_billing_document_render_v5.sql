-- New rendering only: no financial or historical document writes.
begin;
alter function public.billing_snapshot(uuid) rename to billingv5_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language plpgsql stable set search_path='' as $$
begin
 return public.billingv5_snapshot_previous(p_folio)||jsonb_build_object('render_version',5,'presentation_version',5);
end $$;
revoke all on function public.billingv5_snapshot_previous(uuid),public.billing_snapshot(uuid) from public,anon,authenticated,service_role;
drop trigger billing_document_render_v4 on public.billing_documents;
create function public.billing_document_render_v5() returns trigger
language plpgsql security definer set search_path='' as $$
declare payments jsonb;
begin
 select coalesce(jsonb_agg(p || jsonb_build_object('receipt_number',
  case when new.kind='receipt' and p->>'id'=new.payment_id::text then new.number
   else (select d.number from public.billing_documents d where d.folio_id=new.folio_id
    and d.kind='receipt' and d.payment_id=(p->>'id')::uuid) end) order by n),'[]')
 into payments from jsonb_array_elements(new.snapshot->'payments') with ordinality a(p,n);
 if exists(select 1 from jsonb_array_elements(payments) p where p->>'receipt_number' is null) then
  raise exception 'BILLING_DOCUMENT_RECEIPT_REQUIRED';
 end if;
 new.snapshot := new.snapshot || jsonb_build_object('render_version',5,'presentation_version',5,'payments',payments);
 if new.kind='receipt' then
  new.snapshot := new.snapshot || jsonb_build_object('receipt_payment',
   (select p from jsonb_array_elements(payments) p where p->>'id'=new.payment_id::text));
 end if;
 return new;
end $$;
revoke all on function public.billing_document_render_v5() from public,anon,authenticated,service_role;
create trigger billing_document_render_v5 before insert on public.billing_documents
 for each row execute function public.billing_document_render_v5();
commit;
