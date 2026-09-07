-- Render v2 applies only to future document INSERTs. Existing snapshots, PDF
-- artifacts, payments, allocations and financial rules are never updated.
-- Receipt numbers are immutable references, frozen alongside existing payments.
begin;
-- The current projection shares the new metadata so the existing exact recap
-- comparison remains valid. Pre-upgrade staff recaps require a fresh statement.
alter function public.billing_snapshot(uuid) rename to billingv2_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb
language sql stable set search_path='' as $$
 select s || jsonb_build_object('render_version',2,'payments',
  coalesce((select jsonb_agg(p || jsonb_build_object('receipt_number',
   (select d.number from public.billing_documents d where d.folio_id=p_folio
    and d.kind='receipt' and d.payment_id=(p->>'id')::uuid)) order by n)
   from jsonb_array_elements(s->'payments') with ordinality a(p,n)),'[]'))
 from (select public.billingv2_snapshot_previous(p_folio) s) x
$$;
revoke all on function public.billingv2_snapshot_previous(uuid),public.billing_snapshot(uuid)
 from public,anon,authenticated,service_role;
create function public.billing_document_render_v2() returns trigger
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
 new.snapshot := new.snapshot || jsonb_build_object('render_version',2,'payments',payments);
 if new.kind='receipt' then
  new.snapshot := new.snapshot || jsonb_build_object('receipt_payment',
   (select p from jsonb_array_elements(payments) p where p->>'id'=new.payment_id::text));
 end if;
 return new;
end $$;
revoke all on function public.billing_document_render_v2() from public,anon,authenticated,service_role;
create trigger billing_document_render_v2 before insert on public.billing_documents
 for each row execute function public.billing_document_render_v2();
commit;
