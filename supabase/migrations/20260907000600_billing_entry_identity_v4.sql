-- Presentation only: frozen business references for new, explicitly linked charges.
begin;
create table public.billing_charge_entry_identity (
 charge_id uuid primary key references public.billing_charges(id),
 request_id uuid not null unique,
 class_id uuid not null references public.classes(id),
 assignment_id uuid references public.organization_back_numbers(id),
 occurrence_id text not null,
 fee_kind text not null,
 identity jsonb not null,
 presentation jsonb not null
);
alter table public.billing_charge_entry_identity enable row level security;
revoke all on public.billing_charge_entry_identity from public,anon,authenticated,service_role;
create trigger immutable before update or delete on public.billing_charge_entry_identity
 for each row execute function public.billing_immutable();
-- Manual prototype registrations use real class and inventory assignment IDs.
-- The legacy-entry adoption guard remains untouched. No caller-provided labels
-- or rider are trusted; only a confirmed assignment supplies a rider.
create function public.add_documented_billing_entry_sale(p_request_id uuid,p_sale jsonb,p_class uuid,p_assignment uuid,p_occurrence text,p_fee_kind text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e record; saved public.billing_charge_entry_identity; presentation jsonb; identity jsonb; r jsonb;
begin
 if not coalesce(public.billing6_staff((p_sale->>'context_id')::uuid),false) then raise exception 'BILLING_FORBIDDEN'; end if;
 if p_class is null or p_occurrence is null or length(p_occurrence) not between 1 and 250 or p_fee_kind is null or p_fee_kind not in ('entry','judge_class','judge_block') then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 -- Serialize request replay, including the immutable metadata insert.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,406));
 select * into saved from public.billing_charge_entry_identity where request_id=p_request_id;
 if found then
  if saved.class_id<>p_class or saved.assignment_id is distinct from p_assignment or saved.occurrence_id<>p_occurrence or saved.fee_kind<>p_fee_kind then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
  return public.add_documented_billing_sale(p_request_id,p_sale,saved.presentation);
 end if;
 select cl.id class_id,cl.organization_id,cl.show_id,cl.block_id,cl.name class_label,b.name block_label,h.id horse_id,h.name horse_name,
  coalesce(cl.back_number_policy_override,o.back_number_policy)::text policy,
  bn.id assignment_id,bn.number entry_number,bn.assigned_rider_contact_id rider_contact_id,
  nullif(concat_ws(' ',ct.first_name,ct.middle_name,ct.last_name),'') rider_name
 into e from public.classes cl
 join public.blocks b on b.id=cl.block_id and b.show_id=cl.show_id and b.organization_id=cl.organization_id
 join public.organizations o on o.id=cl.organization_id
 join public.billing_contexts bc on bc.id=(p_sale->>'context_id')::uuid and bc.show_id=cl.show_id and bc.organization_id=cl.organization_id
 join public.billing_customer_accounts ca on ca.id=(p_sale->>'payer_customer_account_id')::uuid and ca.organization_id=cl.organization_id
 join public.horses h on h.id=(p_sale->>'horse_id')::uuid
 left join public.organization_back_numbers bn on bn.id=p_assignment and bn.organization_id=cl.organization_id and bn.status='assigned'
  and bn.assignment_mode=coalesce(cl.back_number_policy_override,o.back_number_policy)
  and (bn.assignment_mode='rider' or bn.assigned_horse_id=h.id)
 left join public.contacts ct on ct.id=bn.assigned_rider_contact_id and bn.assignment_mode in ('rider','horse_rider_team')
 where cl.id=p_class and (p_assignment is null or bn.id is not null)
 for share of cl,b,o,h;
 if not found then raise exception 'BILLING_ENTRY_REFERENCE_INVALID'; end if;
 -- Assignment/labels are copied in this transaction; future reassignments cannot
 -- change issued documents or metadata, and replay never rereads mutable labels.
 presentation:=jsonb_build_object('section','entry','block_id',e.block_id::text,'block_label',e.block_label,
  'occurrence_id',p_occurrence,'fee_kind',p_fee_kind);
 if p_fee_kind<>'judge_block' then presentation:=presentation||jsonb_build_object('class_id',e.class_id::text,'class_label',e.class_label); end if;
 identity:=jsonb_build_object('version',1,'organization_id',e.organization_id,'show_id',e.show_id,'entry_id',p_sale->>'source_id','assignment_id',e.assignment_id,
  'policy',e.policy,'number',e.entry_number,'horse',jsonb_build_object('id',e.horse_id,'name',e.horse_name),
  'rider',case when e.rider_name is not null then jsonb_build_object('id',e.rider_contact_id,'name',e.rider_name) else null end,
  'block_id',e.block_id,'class_id',e.class_id,'occurrence_id',p_occurrence);
 r:=public.add_documented_billing_sale(p_request_id,p_sale,presentation);
 if exists(select 1 from public.billing_documents d cross join lateral jsonb_array_elements(d.snapshot->'charges') c where c->>'id'=r->>'charge_id') then raise exception 'BILLING_PRESENTATION_ALREADY_DOCUMENTED'; end if;
 insert into public.billing_charge_entry_identity values((r->>'charge_id')::uuid,p_request_id,p_class,p_assignment,p_occurrence,p_fee_kind,identity,presentation);
 return r;
end $$;
revoke all on function public.add_documented_billing_entry_sale(uuid,jsonb,uuid,uuid,text,text) from public,anon,authenticated,service_role;
grant execute on function public.add_documented_billing_entry_sale(uuid,jsonb,uuid,uuid,text,text) to authenticated;
alter function public.billing_snapshot(uuid) rename to billingv4_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare s jsonb; charges jsonb;
begin
 -- Materialize once: SQL inlining otherwise repeats the full financial snapshot
 -- inside the enrichment subquery and can time out the participant account list.
 s:=public.billingv4_snapshot_previous(p_folio);
 select coalesce(jsonb_agg(case when p.charge_id is null then c else c||jsonb_build_object('entry_identity',p.identity) end order by n),'[]')
 into charges from jsonb_array_elements(s->'charges') with ordinality a(c,n)
 left join public.billing_charge_entry_identity p on p.charge_id=(c->>'id')::uuid;
 return jsonb_set(s,'{charges}',charges)||jsonb_build_object('render_version',4,'presentation_version',4);
end $$;
revoke all on function public.billingv4_snapshot_previous(uuid),public.billing_snapshot(uuid) from public,anon,authenticated,service_role;
drop trigger billing_document_render_v3 on public.billing_documents;
create function public.billing_document_render_v4() returns trigger
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
 new.snapshot := new.snapshot || jsonb_build_object('render_version',4,'presentation_version',4,'payments',payments);
 if new.kind='receipt' then
  new.snapshot := new.snapshot || jsonb_build_object('receipt_payment',
   (select p from jsonb_array_elements(payments) p where p->>'id'=new.payment_id::text));
 end if;
 return new;
end $$;
revoke all on function public.billing_document_render_v4() from public,anon,authenticated,service_role;
create trigger billing_document_render_v4 before insert on public.billing_documents
 for each row execute function public.billing_document_render_v4();
-- Keep the lateral snapshot as one evaluation per account, not one per
-- projected JSON field. Filters, authorization and financial sums are unchanged.
create or replace function public.billing6_accounts(p_org uuid,p_personal boolean,p_filter jsonb) returns table(id uuid,context_id uuid,year integer,currency text,state text,created_at timestamptz,item jsonb)
language sql stable security definer set search_path='' as $$
 select f.id,c.id,a.financial_year,f.currency,f.state,f.created_at,
 jsonb_build_object('id',f.id,'organization_id',f.organization_id,'context_id',c.id,'show_id',c.show_id,'type_id',c.context_type_id,
 'kind',case when c.kind='event' then 'show_account' else 'non_event_account' end,'name_fr',c.config->>'name_fr','name_en',c.config->>'name_en',
 'account_number',f.public_number,'year',a.financial_year,'currency',f.currency,'state',f.state,'payer',snap->'payer',
 'subtotal',snap->'subtotal','tax_amount',snap->'tax_amount','total',snap->'total','paid',snap->'received','balance',snap->'balance',
 'needs_attention',(f.state='closed' and (snap->>'balance')::numeric<>0) or (f.state='open' and coalesce((select ready from public.billing_checkout_state where folio_id=f.id),false)) or exists(select 1 from public.billing_close_blocks b where b.folio_id=f.id and active))
 from public.billing_folios f join public.billing_contexts c on c.id=f.billing_context_id
 left join public.billing_context_access a on a.context_id=c.id
 cross join lateral (select public.billing_snapshot(f.id) snap offset 0) s
 where (p_org is null or f.organization_id=p_org)
 and case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(c.id) end
 and (not(p_filter ? 'year') or a.financial_year=(p_filter->>'year')::integer)
 and (not coalesce((p_filter->>'unqualified')::boolean,false) or a.financial_year is null)
 and (not(p_filter ? 'state') or f.state=p_filter->>'state')
 and (not(p_filter ? 'show_id') or c.show_id=(p_filter->>'show_id')::uuid)
 and (not(p_filter ? 'context_id') or c.id=(p_filter->>'context_id')::uuid)
 and (not(p_filter ? 'type_id') or c.context_type_id=(p_filter->>'type_id')::uuid)
 and (not coalesce((p_filter->>'prior_balance')::boolean,false) or (a.financial_year<extract(year from current_date) and (snap->>'balance')::numeric>0))
 and (coalesce(p_filter->>'q','')='' or f.public_number ilike public.billing6_pattern(p_filter->>'q') or exists(select 1 from public.billing_customer_accounts ca join public.contacts pc on pc.id=ca.payer_contact_id where ca.id=f.payer_customer_account_id and pc.company_name ilike public.billing6_pattern(p_filter->>'q')) or position(lower(p_filter->>'q') in lower(concat_ws(' ',f.public_number,c.config->>'name_fr',c.config->>'name_en',snap->'payer'->>'first_name',snap->'payer'->>'last_name',snap->'payer'->>'company_name',(select name from public.shows where id=c.show_id))))>0
 or exists(select 1 from public.billing_charges ch left join public.contacts bc on bc.id=ch.beneficiary_contact_id left join public.horses h on h.id=ch.horse_id
 where ch.folio_id=f.id and position(lower(p_filter->>'q') in lower(concat_ws(' ',bc.first_name,bc.last_name,h.name)))>0)
 or exists(select 1 from public.billing_documents d where d.folio_id=f.id and d.number ilike public.billing6_pattern(p_filter->>'q')));
$$;
commit;
