-- Presentation metadata only. No repricing, ledger mutation or historical document rewrite.
create table public.billing_product_document_labels (
 product_id uuid primary key references public.organization_products(id),
 labels jsonb not null check(jsonb_typeof(labels)='object' and labels ?& array['fr','en']),
 changed_by uuid not null references public.user_profiles(id), changed_at timestamptz not null default clock_timestamp()
);
alter table public.billing_product_document_labels enable row level security;
revoke all on public.billing_product_document_labels from public,anon,authenticated,service_role;
create function public.set_billing_product_document_labels(p_product uuid,p_fr text,p_en text) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 select organization_id into org from public.organization_products where id=p_product;
 if org is null or public.current_profile_id() is null or not coalesce(public.is_platform_admin() or public.is_org_member(org,array['admin']),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_fr is null or p_en is null or length(trim(p_fr)) not between 1 and 500 or length(trim(p_en)) not between 1 and 500 then raise exception 'BILLING_LABEL_INVALID'; end if;
 insert into public.billing_product_document_labels(product_id,labels,changed_by) values(p_product,jsonb_build_object('fr',p_fr,'en',p_en),public.current_profile_id())
 on conflict(product_id) do update set labels=excluded.labels,changed_by=excluded.changed_by,changed_at=clock_timestamp();
end $$;
alter table public.billing_charges add column description_i18n jsonb;
create function public.billing_capture_document_labels() returns trigger language plpgsql set search_path='' as $$
begin
 select labels into new.description_i18n from public.billing_product_document_labels where product_id=new.product_id;
 return new;
end $$;
create trigger billing_capture_document_labels before insert on public.billing_charges for each row execute function public.billing_capture_document_labels();
alter function public.billing_snapshot(uuid) rename to billing_document_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 with base as materialized (select public.billing_document_snapshot_previous(p_folio) s)
 select jsonb_set(jsonb_set(jsonb_set(s,'{context,timezone}',to_jsonb(c.config->>'timezone')),'{charges}',coalesce((select jsonb_agg(ch||jsonb_build_object('description_i18n',b.description_i18n) order by n) from jsonb_array_elements(s->'charges') with ordinality a(ch,n) join public.billing_charges b on b.id=(ch->>'id')::uuid),'[]')),
 '{payments}',coalesce((select jsonb_agg(p||jsonb_build_object('receipt_number',d.number) order by n) from jsonb_array_elements(s->'payments') with ordinality a(p,n) left join public.billing_documents d on d.payment_id=(p->>'id')::uuid and d.kind='receipt'),'[]'))
 from base x join public.billing_folios f on f.id=p_folio join public.billing_contexts c on c.id=f.billing_context_id
$$;
-- The receipt's own number is allocated before its snapshot is inserted, but is not yet queryable.
create function public.billing_capture_receipt_number() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='receipt' then
 new.snapshot:=jsonb_set(new.snapshot,'{payments}',(select jsonb_agg(case when p->>'id'=new.payment_id::text then p||jsonb_build_object('receipt_number',new.number) else p end order by n) from jsonb_array_elements(new.snapshot->'payments') with ordinality a(p,n)));
 new.snapshot:=jsonb_set(new.snapshot,'{receipt_payment}',(new.snapshot->'receipt_payment')||jsonb_build_object('receipt_number',new.number));
 end if;
 return new;
end $$;
create trigger billing_capture_receipt_number before insert on public.billing_documents for each row execute function public.billing_capture_receipt_number();
revoke all on function public.set_billing_product_document_labels(uuid,text,text),public.billing_capture_document_labels(),public.billing_document_snapshot_previous(uuid),public.billing_snapshot(uuid),public.billing_capture_receipt_number() from public,anon,authenticated,service_role;
grant execute on function public.set_billing_product_document_labels(uuid,text,text) to authenticated;
