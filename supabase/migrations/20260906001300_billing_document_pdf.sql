-- 1C: immutable structured presentation and private bilingual PDF publication.
-- No financial document, historical snapshot, deployment or pilot activation is created here.
create table public.billing_charge_presentation (
 charge_id uuid primary key references public.billing_charges(id),
 presentation jsonb not null check(jsonb_typeof(presentation)='object'),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.billing_charge_presentation enable row level security;
revoke all on public.billing_charge_presentation from public,anon,authenticated,service_role;
create trigger immutable before update or delete on public.billing_charge_presentation for each row execute function public.billing_immutable();
create function public.add_documented_billing_sale(p_request_id uuid,p_sale jsonb,p_presentation jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; cid uuid; old jsonb; k text; v jsonb;
begin
 if jsonb_typeof(p_presentation) is distinct from 'object' or length(p_presentation::text)>6000 then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 for k,v in select * from jsonb_each(p_presentation) loop
  if k<>all(array['section','block_id','occurrence_id','block_label','class_id','class_label','fee_kind','reservation_id','period','duration']) or jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 250 then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 end loop;
 if coalesce(p_presentation->>'section','') not in ('entry','reservation','other') then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 if p_presentation->>'section'='entry' and
  (p_sale->>'horse_id' is null or not p_presentation ?& array['block_id','occurrence_id','block_label','fee_kind'] or
   p_presentation->>'fee_kind' not in ('entry','judge_class','judge_block') or
   (p_presentation->>'fee_kind'<>'judge_block' and not p_presentation ?& array['class_id','class_label'])) then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 if p_presentation->>'section'='reservation' and not p_presentation ? 'reservation_id' then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 -- Existing dispatcher owns authorization, deterministic locks, capability, price and tax rules.
 r:=public.add_billing_sale(p_request_id,p_sale); cid:=(r->>'charge_id')::uuid;
 if cid is null then raise exception 'BILLING_PRESENTATION_INVALID'; end if;
 select presentation into old from public.billing_charge_presentation where charge_id=cid;
 if found then
  if old<>p_presentation then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
 else
  if exists(select 1 from public.billing_documents d cross join lateral jsonb_array_elements(d.snapshot->'charges') c where c->>'id'=cid::text) then raise exception 'BILLING_PRESENTATION_ALREADY_DOCUMENTED'; end if;
  insert into public.billing_charge_presentation values(cid,p_presentation,clock_timestamp());
 end if;
 return r;
end $$;
alter function public.billing_snapshot(uuid) rename to billingc_snapshot_previous;
create function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_set(s,'{charges}',coalesce((select jsonb_agg(case when p.charge_id is null then c else c||jsonb_build_object('presentation',p.presentation) end order by n)
 from jsonb_array_elements(s->'charges') with ordinality a(c,n) left join public.billing_charge_presentation p on p.charge_id=(c->>'id')::uuid),'[]'))
 from (select public.billingc_snapshot_previous(p_folio) s) x
$$;
revoke all on function public.billingc_snapshot_previous(uuid),public.billing_snapshot(uuid),public.add_documented_billing_sale(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.add_documented_billing_sale(uuid,jsonb,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('billing-pdfs','billing-pdfs',false,20971520,array['application/pdf']);
-- Restrictive even when another bucket has a broad permissive policy.
create policy billing_pdf_private on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'billing-pdfs') with check(bucket_id<>'billing-pdfs');
create table public.billing_pdf_artifacts (
 document_id uuid not null references public.billing_documents(id), locale text not null check(locale in ('fr','en')),
 object_path text not null unique, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 bytes integer not null check(bytes between 1 and 20971520), created_at timestamptz not null default clock_timestamp(),primary key(document_id,locale)
);
alter table public.billing_pdf_artifacts enable row level security;
revoke all on public.billing_pdf_artifacts from public,anon,authenticated,service_role;
create trigger immutable before update or delete on public.billing_pdf_artifacts for each row execute function public.billing_immutable();
create function public.billing_pdf_status(p_document uuid,p_personal boolean default true) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.billing_documents; f public.billing_folios; j public.billing_outbox;
begin
 select * into d from public.billing_documents where id=p_document;
 select * into f from public.billing_folios where id=d.folio_id;
 if f.id is null or not coalesce(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end,false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 select * into j from public.billing_outbox where document_id=d.id;
 return jsonb_build_object('document_id',d.id,'state',case when j.state='completed' and not exists(select 1 from public.billing_pdf_artifacts where document_id=d.id) then 'unavailable' else coalesce(j.state,'unavailable') end,
 'retry_at',j.next_attempt_at,'locales',(select coalesce(jsonb_agg(locale order by locale),'[]') from public.billing_pdf_artifacts where document_id=d.id));
end $$;
create function public.billing_pdf_source(p_document uuid,p_token uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billing_outbox where document_id=p_document and claim_token=p_token and state='processing' and lease_until>clock_timestamp()) then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 return public.billing_document_payload(p_document);
end $$;
create function public.billing_pdf_complete(p_document uuid,p_token uuid,p_artifacts jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.billing_outbox; a jsonb; org uuid;
begin
 select * into j from public.billing_outbox where document_id=p_document for update;
 if j.document_id is null or j.claim_token is distinct from p_token then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 if j.state='completed' then return jsonb_build_object('state','completed'); end if;
 if j.state<>'processing' or j.lease_until<=clock_timestamp() then raise exception 'BILLING_OUTBOX_STALE_CLAIM'; end if;
 if jsonb_typeof(p_artifacts) is distinct from 'array' or jsonb_array_length(p_artifacts)<>2 then raise exception 'BILLING_PDF_INVALID'; end if;
 select organization_id into org from public.billing_documents where id=p_document;
 for a in select * from jsonb_array_elements(p_artifacts) loop
  if a->>'locale' not in ('fr','en') or a->>'path' is distinct from org::text||'/'||p_document::text||'/'||p_token::text||'/'||(a->>'locale')||'.pdf' then raise exception 'BILLING_PDF_INVALID'; end if;
  insert into public.billing_pdf_artifacts(document_id,locale,object_path,sha256,bytes) values(p_document,a->>'locale',a->>'path',a->>'sha256',(a->>'bytes')::integer);
 end loop;
 perform public.billing_finish_document(p_document,p_token,true,'billing-pdfs/'||p_document::text);
 return jsonb_build_object('state','completed');
end $$;
create function public.billing_pdf_file(p_document uuid,p_locale text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('path',a.object_path,'sha256',a.sha256,'bytes',a.bytes) from public.billing_pdf_artifacts a join public.billing_outbox j using(document_id) where a.document_id=p_document and a.locale=p_locale and j.state='completed'
$$;
revoke all on function public.billing_pdf_status(uuid,boolean),public.billing_pdf_source(uuid,uuid),public.billing_pdf_complete(uuid,uuid,jsonb),public.billing_pdf_file(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.billing_pdf_status(uuid,boolean) to authenticated;
grant execute on function public.billing_pdf_source(uuid,uuid),public.billing_pdf_complete(uuid,uuid,jsonb),public.billing_pdf_file(uuid,text) to service_role;
