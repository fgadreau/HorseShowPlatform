-- 1A.6: no activation, fixtures, provider integration or historical inference.
begin;
create table public.billing_pilot_organizations (
 organization_id uuid primary key references public.organizations(id),
 engine boolean not null default false, personal boolean not null default false,
 checkout boolean not null default false, revision bigint not null default 1
);
create table public.billing_context_access (
 context_id uuid primary key references public.billing_contexts(id),
 engine boolean not null default false, personal boolean not null default false,
 personal_history boolean not null default false, checkout boolean not null default false,
 closing_phase boolean not null default false, revision bigint not null default 1,
 financial_year integer check(financial_year between 1900 and 2200),
 year_basis text check(year_basis in ('show_start','service_year')),
 check((financial_year is null)=(year_basis is null))
);
-- Read continuity is not an activation. Existing 1A documents remain readable.
create table public.billing_read_history (folio_id uuid primary key references public.billing_folios(id));
insert into public.billing_read_history select id from public.billing_folios;
create table public.billing_checkout_state (
 folio_id uuid primary key references public.billing_folios(id), revision bigint not null default 1,
 ready boolean not null default false, attested_by uuid references public.user_profiles(id),
 attested_at timestamptz, check(not ready or (attested_by is not null and attested_at is not null))
);
create table public.billing_close_blocks (
 folio_id uuid not null references public.billing_folios(id), block_key text not null check(length(block_key) between 1 and 100),
 reason text not null check(reason in ('review','anomaly','pending_operation','pending_provider','other')),
 internal_detail text not null, active boolean not null, updated_at timestamptz not null default clock_timestamp(),
 actor_id uuid not null references public.user_profiles(id), primary key(folio_id,block_key)
);
create table public.billing_payer_recaps (
 document_id uuid primary key references public.billing_documents(id), folio_id uuid not null references public.billing_folios(id),
 actor_id uuid not null references public.user_profiles(id), financial_version bigint not null,
 control_token jsonb not null
);
-- Equality lookup for the current payer recap; document ordering remains on documents.
create index billing_payer_recap_current on public.billing_payer_recaps(folio_id,actor_id,financial_version);

create or replace function public.billing_snapshot(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('folio_id',f.id,'account_number',f.public_number,'state',f.state,'currency',f.currency,
 'context',jsonb_build_object('id',c.id,'kind',c.kind,'show_id',c.show_id,'name_fr',c.config->>'name_fr','name_en',c.config->>'name_en','period',c.config->'period','financial_year',(select financial_year from public.billing_context_access where context_id=c.id),'year_basis',(select year_basis from public.billing_context_access where context_id=c.id)),
 'payer',jsonb_build_object('customer_account_id',a.id,'contact_id',p.id,'first_name',p.first_name,'middle_name',p.middle_name,'last_name',p.last_name,
  'company_name',p.company_name,'address',p.address,'address_line2',p.address_line2,'city',p.city,'state',p.state,'zip_code',p.zip_code,'country',p.country,
  'email',p.email,'phone',p.phone,'tax_identifiers',null),
 'seller',jsonb_build_object('organization_id',o.id,'name',o.name,'billing_name',o.billing_name,'address',o.address,
  'address_line2',o.address_line2,'city',o.city,'state',o.state,'zip_code',o.zip_code,'country',o.country,
  'email',o.billing_email,'phone',o.billing_phone,'tax_name_1',o.tax_name,'tax_number_1',o.tax_number,
  'tax_name_2',o.secondary_tax_name,'tax_number_2',o.secondary_tax_number),
 'charges',coalesce((select jsonb_agg(jsonb_build_object('id',ch.id,'description',ch.description,'category',ch.category,'quantity',ch.quantity,'unit_price',ch.unit_price,'subtotal',ch.subtotal,'tax_amount',ch.tax_amount,'total',ch.total,'currency',ch.currency,'beneficiary_contact_id',ch.beneficiary_contact_id,'horse_id',ch.horse_id,'beneficiary',(select jsonb_build_object('contact_id',bc.id,'display_name',concat_ws(' ',nullif(btrim(bc.first_name),''),nullif(btrim(bc.middle_name),''),nullif(btrim(bc.last_name),''))) from public.contacts bc where bc.id=ch.beneficiary_contact_id),'horse',(select jsonb_build_object('id',h.id,'name',h.name) from public.horses h where h.id=ch.horse_id),'exemption_reason',ch.exemption_reason,'created_at',ch.created_at,'taxes',coalesce((select jsonb_agg(jsonb_build_object('name',t.name,'code',t.code,'jurisdiction',t.jurisdiction,'rate',t.rate,'base',t.base,'amount',t.amount) order by t.code) from public.billing_charge_taxes t where t.charge_id=ch.id),'[]')) order by ch.created_at,ch.id)
 from public.billing_charges ch where ch.folio_id=f.id),'[]'),
 'payments',coalesce((select jsonb_agg(jsonb_build_object('id',pmt.id,'amount',pmt.amount,'currency',pmt.currency,'method',pmt.method,'reference',pmt.reference,'received_at',pmt.received_at,'allocations',coalesce((select jsonb_agg(jsonb_build_object('charge_id',al.charge_id,'amount',al.amount) order by al.charge_id) from public.billing_payment_allocations al where al.payment_id=pmt.id),'[]')) order by pmt.created_at,pmt.id) from public.billing_payments pmt where pmt.folio_id=f.id),'[]'),
 'subtotal',coalesce((select sum(ch.subtotal) from public.billing_charges ch where ch.folio_id=f.id),0),
 'tax_amount',coalesce((select sum(ch.tax_amount) from public.billing_charges ch where ch.folio_id=f.id),0),
 'total',coalesce((select sum(ch.total) from public.billing_charges ch where ch.folio_id=f.id),0),
 'received',coalesce((select sum(pm.amount) from public.billing_payments pm where pm.folio_id=f.id),0),
 'balance',coalesce((select sum(ch.total) from public.billing_charges ch where ch.folio_id=f.id),0)-coalesce((select sum(pm.amount) from public.billing_payments pm where pm.folio_id=f.id),0))
 from public.billing_folios f join public.billing_contexts c on c.id=f.billing_context_id
 join public.billing_customer_accounts a on a.id=f.payer_customer_account_id join public.contacts p on p.id=a.payer_contact_id
 join public.organizations o on o.id=f.organization_id where f.id=p_folio;
$$;

create index billing_context_year on public.billing_context_access(financial_year,context_id);
create index billing_accounts_context_state on public.billing_folios(organization_id,billing_context_id,state,created_at,id);
create index billing_accounts_payer on public.billing_folios(payer_customer_account_id,created_at,id);
create index billing_account_number_search on public.billing_folios using gin(public_number extensions.gin_trgm_ops);
create index billing_document_number_search on public.billing_documents using gin(number extensions.gin_trgm_ops);
create index billing_contact_company_search on public.contacts using gin(company_name extensions.gin_trgm_ops);
create index billing_linked_contacts on public.contacts(linked_user_id,id);
create index billing_charges_beneficiary on public.billing_charges(beneficiary_contact_id,folio_id);
create index billing_charges_horse on public.billing_charges(horse_id,folio_id);

create function public.billing6_lock(p_org uuid) returns void language sql set search_path='' as $$
 select pg_advisory_xact_lock(hashtextextended('billing-controls:'||p_org,0));
$$;
create function public.billing6_staff(p_context uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_contexts c where c.id=p_context and
 (public.is_platform_admin() or public.is_org_member(c.organization_id,array(select jsonb_array_elements_text(c.config->'staff_roles')))
 or (c.show_id is not null and c.config->'staff_roles' ? 'secretary' and public.has_show_role(c.show_id,array['secretary']))));
$$;
create function public.billing6_owner(p_folio uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_folios f join public.billing_customer_accounts a on a.id=f.payer_customer_account_id
 join public.contacts c on c.id=a.payer_contact_id where f.id=p_folio and c.linked_user_id=public.current_profile_id());
$$;
create function public.billing6_cap(p_context uuid,p_cap text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case p_cap when 'engine' then o.engine and a.engine
 when 'personal' then o.personal and a.personal when 'checkout' then o.engine and a.engine and o.personal and a.personal and o.checkout and a.checkout else false end
 from public.billing_contexts c join public.billing_context_access a on a.context_id=c.id
 join public.billing_pilot_organizations o on o.organization_id=c.organization_id where c.id=p_context),false);
$$;
create function public.billing6_personal_read(p_folio uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.billing6_owner(p_folio) and exists(select 1 from public.billing_folios f where f.id=p_folio and
 (public.billing6_cap(f.billing_context_id,'personal') or exists(select 1 from public.billing_read_history h where h.folio_id=f.id)
 ));
$$;
create or replace function public.billing_can_read(p_folio uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.billing_folios f where f.id=p_folio and
 (public.billing6_staff(f.billing_context_id) or public.billing6_personal_read(f.id)));
$$;
create function public.billing6_audit(p_org uuid,p_folio uuid,p_op text,p_payload jsonb) returns void language sql set search_path='' as $$
 insert into public.billing_audit_events(organization_id,folio_id,actor_id,operation,authorization_snapshot,payload)
 values(p_org,p_folio,public.current_profile_id(),p_op,
 case when p_op in ('own_recap','own_finalize') then jsonb_build_object('kind','payer','actor',public.current_profile_id(),'contact_id',(select a.payer_contact_id from public.billing_folios f join public.billing_customer_accounts a on a.id=f.payer_customer_account_id where f.id=p_folio),'checked_at',clock_timestamp()) else public.billing_assert_staff(p_org,(select c.show_id from public.billing_folios f join public.billing_contexts c on c.id=f.billing_context_id where f.id=p_folio)) end,p_payload);
$$;

-- Platform administrator controls association allowlist; association admin controls adopted contexts.
create function public.billing_set_capabilities(p_org uuid,p_context uuid,p_engine boolean,p_personal boolean,p_checkout boolean,p_closing_phase boolean default false,p_year integer default null)
 returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; y integer; basis text; authority jsonb;
begin
 if public.current_profile_id() is null or not(public.is_platform_admin() or (p_context is not null and public.is_org_member(p_org,array['admin']))) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_engine is null or p_personal is null or p_checkout is null or p_closing_phase is null then raise exception 'BILLING_INVALID_CONFIG'; end if;
 perform public.billing6_lock(p_org);
 authority:=public.billing_assert_staff(p_org);
 if authority->>'kind'<>'platform_admin' and (p_context is null or authority->>'role'<>'admin') then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_context is null then
  if p_year is not null or p_closing_phase then raise exception 'BILLING_INVALID_CONFIG'; end if;
  insert into public.billing_pilot_organizations values(p_org,p_engine,p_personal,p_checkout,1)
  on conflict(organization_id) do update set engine=excluded.engine,personal=excluded.personal,checkout=excluded.checkout,revision=public.billing_pilot_organizations.revision+1;
  update public.billing_checkout_state st set ready=false,revision=revision+1 where folio_id in(select id from public.billing_folios where organization_id=p_org);
 else
  select * into c from public.billing_contexts where id=p_context and organization_id=p_org;
  if not found then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
  if c.show_id is not null then
   select extract(year from start_date)::integer into y from public.shows where id=c.show_id;
   basis:='show_start';
   if p_year is not null and p_year<>y then raise exception 'BILLING_INVALID_YEAR'; end if;
  else y:=coalesce(p_year,(select financial_year from public.billing_context_access where context_id=c.id)); basis:=case when y is not null then 'service_year' end;
  end if;
  if exists(select 1 from public.billing_context_access where context_id=c.id and financial_year is not null and financial_year is distinct from y) then raise exception 'BILLING_YEAR_FROZEN'; end if;
  insert into public.billing_context_access values(c.id,p_engine,p_personal,p_personal and coalesce((select personal from public.billing_pilot_organizations where organization_id=p_org),false),p_checkout,p_closing_phase,1,y,basis)
  on conflict(context_id) do update set engine=excluded.engine,personal=excluded.personal,personal_history=public.billing_context_access.personal_history or excluded.personal_history,
   checkout=excluded.checkout,closing_phase=excluded.closing_phase,revision=public.billing_context_access.revision+1,
   financial_year=excluded.financial_year,year_basis=excluded.year_basis;
  update public.billing_checkout_state set ready=false,revision=revision+1 where folio_id in(select id from public.billing_folios where billing_context_id=c.id);
 end if;
 insert into public.billing_read_history select f.id from public.billing_folios f where f.organization_id=p_org and public.billing6_cap(f.billing_context_id,'personal') on conflict do nothing;
 perform public.billing6_audit(p_org,null,'capabilities',jsonb_build_object('context_id',p_context,'engine',p_engine,'personal',p_personal,'checkout',p_checkout,'year',y,'closing_phase',p_closing_phase));
 return jsonb_build_object('updated',true);
end $$;

create function public.billing6_lock_account(p_folio uuid,p_personal boolean default false) returns public.billing_folios
language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; c public.billing_contexts;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not found or not(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing6_lock(f.organization_id);
 select * into c from public.billing_contexts where id=f.billing_context_id;
 perform public.billing_lock_scope(f.organization_id,c.show_id);
 if not p_personal then perform public.billing_assert_staff(f.organization_id,c.show_id); end if;
 select * into f from public.billing_folios where id=p_folio for update;
 -- Freeze document coordinates and identity against concurrent edits during this command.
 -- Constant order: all payer/beneficiary contacts by UUID, then horses by UUID, then association.
 perform 1 from public.contacts ct where ct.id in (
  select payer_contact_id from public.billing_customer_accounts where id=f.payer_customer_account_id
  union select beneficiary_contact_id from public.billing_charges where folio_id=f.id
 ) order by ct.id for share;
 perform 1 from public.horses h where h.id in (select horse_id from public.billing_charges where folio_id=f.id)
 order by h.id for share;
 perform 1 from public.organizations where id=f.organization_id for share;
 if not(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 return f;
end $$;
create function public.billing_set_ready(p_folio uuid,p_ready boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; st public.billing_checkout_state;
begin
 f:=public.billing6_lock_account(p_folio);
 if p_ready is null or f.state<>'open' or not public.billing6_cap(f.billing_context_id,'engine') then raise exception 'BILLING_NOT_ADMISSIBLE'; end if;
 if p_ready and exists(select 1 from public.billing_close_blocks where folio_id=f.id and active) then raise exception 'BILLING_BLOCKED'; end if;
 insert into public.billing_checkout_state values(f.id,1,p_ready,public.current_profile_id(),clock_timestamp())
 on conflict(folio_id) do update set revision=public.billing_checkout_state.revision+1,ready=excluded.ready,attested_by=excluded.attested_by,attested_at=excluded.attested_at returning * into st;
 perform public.billing6_audit(f.organization_id,f.id,'attestation',to_jsonb(st));
 return to_jsonb(st);
end $$;
create function public.billing_set_close_block(p_folio uuid,p_key text,p_reason text,p_active boolean,p_internal_detail text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.billing_folios;
begin
 f:=public.billing6_lock_account(p_folio);
 if p_active is null or not public.billing6_cap(f.billing_context_id,'engine') then raise exception 'BILLING_NOT_ADMISSIBLE'; end if;
 insert into public.billing_close_blocks values(f.id,p_key,p_reason,p_internal_detail,p_active,clock_timestamp(),public.current_profile_id())
 on conflict(folio_id,block_key) do update set reason=excluded.reason,internal_detail=excluded.internal_detail,active=excluded.active,updated_at=excluded.updated_at,actor_id=excluded.actor_id;
 insert into public.billing_checkout_state(folio_id) values(f.id) on conflict(folio_id) do update set ready=false,revision=public.billing_checkout_state.revision+1;
 perform public.billing6_audit(f.organization_id,f.id,'close_block',jsonb_build_object('key',p_key,'reason',p_reason,'active',p_active,'detail',p_internal_detail));
 return jsonb_build_object('updated',true);
end $$;
create function public.billing6_invalidate_charge() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.billing_checkout_state(folio_id) values(new.folio_id) on conflict(folio_id) do update set ready=false,revision=public.billing_checkout_state.revision+1;
 return new;
end $$;
create trigger billing_checkout_new_charge after insert on public.billing_charges for each row execute function public.billing6_invalidate_charge();

create function public.billing6_remember_read() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if public.billing6_cap(new.billing_context_id,'personal') then insert into public.billing_read_history values(new.id) on conflict do nothing; end if;
 return new;
end $$;
create trigger billing_personal_history after insert on public.billing_folios for each row execute function public.billing6_remember_read();

-- Preserve 1A algorithm privately. The public dispatcher adds controls before every new command.
alter function public.billing_execute(uuid,jsonb) rename to billing6_execute_foundation;
create function public.billing_execute(p_request_id uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.billing_contexts; f public.billing_folios; old public.billing_operations; a jsonb;
begin
 if p_command->>'operation'='sale' then select * into c from public.billing_contexts where id=(p_command->>'context_id')::uuid;
 else select ctx.* into c from public.billing_folios fol join public.billing_contexts ctx on ctx.id=fol.billing_context_id where fol.id=(p_command->>'folio_id')::uuid; end if;
 if c.id is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing6_lock(c.organization_id);
 a:=public.billing_assert_staff(c.organization_id,c.show_id);
 if not public.billing6_staff(c.id) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 -- Durable retries remain readable after a capability is revoked; no new effect is performed.
 select * into old from public.billing_operations where organization_id=c.organization_id and actor_id=public.current_profile_id() and request_id=p_request_id;
 if found then
  if old.request<>p_command then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
  return old.response;
 end if;
 if not public.billing6_cap(c.id,'engine') then raise exception 'BILLING_CAPABILITY_DISABLED'; end if;
 if p_command->>'operation'='sale' and c.show_id is not null then
  perform 1 from public.shows where id=c.show_id for share;
  if exists(select 1 from public.shows where id=c.show_id and status='archived') then raise exception 'BILLING_SHOW_ARCHIVED'; end if;
 end if;
 if p_command->>'operation'<>'sale' then
  f:=public.billing6_lock_account((p_command->>'folio_id')::uuid);
  if p_command->>'operation'='finalize' and exists(select 1 from public.billing_close_blocks where folio_id=f.id and active) then raise exception 'BILLING_BLOCKED'; end if;
 end if;
 return public.billing6_execute_foundation(p_request_id,p_command);
end $$;

alter function public.billing_get_customer_account(uuid,uuid,uuid) rename to billing6_customer_foundation;
create function public.billing_get_customer_account(p_org uuid,p_contact uuid,p_context uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
begin
 perform public.billing6_lock(p_org);
 if not coalesce((select engine from public.billing_pilot_organizations where organization_id=p_org),false)
 or (p_context is not null and not public.billing6_cap(p_context,'engine')) then raise exception 'BILLING_CAPABILITY_DISABLED'; end if;
 return public.billing6_customer_foundation(p_org,p_contact,p_context);
end $$;

create function public.billing6_token(p_folio uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('control_revision',coalesce(st.revision,0),'context_revision',coalesce(a.revision,0),'association_revision',coalesce(o.revision,0))
 from public.billing_folios f left join public.billing_checkout_state st on st.folio_id=f.id
 left join public.billing_context_access a on a.context_id=f.billing_context_id left join public.billing_pilot_organizations o on o.organization_id=f.organization_id where f.id=p_folio;
$$;
create function public.billing6_reasons(p_folio uuid) returns jsonb language plpgsql stable set search_path='' as $$
declare f public.billing_folios; reasons jsonb:='[]'; balance numeric;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not public.billing6_cap(f.billing_context_id,'checkout') then reasons:=reasons||'"Finalisation autonome non disponible"'::jsonb; end if;
 if f.state<>'open' then reasons:=reasons||'"Compte fermé"'::jsonb; end if;
 if not coalesce((select closing_phase from public.billing_context_access where context_id=f.billing_context_id),false) then reasons:=reasons||'"Fermeture non encore autorisée"'::jsonb; end if;
 if not coalesce((select ready from public.billing_checkout_state where folio_id=f.id),false) then reasons:=reasons||'"D’autres frais sont attendus"'::jsonb; end if;
 if exists(select 1 from public.billing_close_blocks where folio_id=f.id and active and reason in ('pending_operation','pending_provider')) then reasons:=reasons||'"Une opération est en traitement"'::jsonb; end if;
 if exists(select 1 from public.billing_close_blocks where folio_id=f.id and active and reason not in ('pending_operation','pending_provider')) then reasons:=reasons||'"Vérification par l’association"'::jsonb; end if;
 balance:=(public.billing_snapshot(f.id)->>'balance')::numeric;
 if balance<>0 then reasons:=reasons||to_jsonb(case when balance>0 then 'Le solde doit être réglé' else 'Vérification du solde par l’association' end); end if;
 return reasons;
end $$;
create function public.billing6_current_recap(p_folio uuid,p_actor uuid) returns uuid language sql stable set search_path='' as $$
 select d.id from public.billing_payer_recaps r join public.billing_documents d on d.id=r.document_id join public.billing_folios f on f.id=r.folio_id
 where r.folio_id=p_folio and r.actor_id=p_actor and r.financial_version=f.version and r.control_token=public.billing6_token(f.id)
 and (d.snapshot-array['issued_at','checkout'])=public.billing_snapshot(f.id) order by d.created_at desc,d.id desc limit 1;
$$;
create function public.get_billing_checkout_eligibility(p_folio uuid,p_personal boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.billing_folios; r jsonb; recap uuid;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not found or not(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 r:=public.billing6_reasons(f.id);
 if not public.billing6_owner(f.id) then r:=r||'"Seul le payeur peut finaliser ce compte"'::jsonb; end if;
 recap:=public.billing6_current_recap(f.id,public.current_profile_id());
 return jsonb_build_object('can_prepare',jsonb_array_length(r)=0,'eligible',jsonb_array_length(r)=0 and recap is not null,
 'reasons',case when recap is null then r||'"Récapitulatif à confirmer"'::jsonb else r end,'recap_id',recap,
 'ready',coalesce((select ready from public.billing_checkout_state where folio_id=f.id),false),'version',f.version);
end $$;

create function public.billing6_own_command(p_request uuid,p_folio uuid,p_version bigint,p_recap uuid,p_finalize boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare f public.billing_folios; old public.billing_operations; cmd jsonb; snap jsonb; doc uuid; r jsonb; token jsonb;
begin
 if p_request is null then raise exception 'BILLING_INVALID_REQUEST'; end if;
 f:=public.billing6_lock_account(p_folio,true);
 cmd:=jsonb_build_object('operation',case when p_finalize then 'own_finalize' else 'own_recap' end,'folio_id',f.id,'version',p_version,'recap_id',p_recap);
 select * into old from public.billing_operations where organization_id=f.organization_id and actor_id=public.current_profile_id() and request_id=p_request;
 if found then
  if old.request<>cmd then raise exception 'BILLING_IDEMPOTENCY_CONFLICT'; end if;
  return old.response;
 end if;
 if jsonb_array_length(public.billing6_reasons(f.id))<>0 then raise exception 'BILLING_NOT_ADMISSIBLE'; end if;
 snap:=public.billing_snapshot(f.id); token:=public.billing6_token(f.id);
 if p_finalize then
  if p_version is distinct from f.version or p_recap is null or p_recap is distinct from public.billing6_current_recap(f.id,public.current_profile_id()) then raise exception 'BILLING_STALE_RECAP'; end if;
  update public.billing_folios set state='closed',closed_at=clock_timestamp(),closed_by=public.current_profile_id(),version=version+1 where id=f.id;
  insert into public.billing_documents(organization_id,folio_id,currency,kind,number,snapshot,actor_id)
  select f.organization_id,f.id,f.currency,'invoice',public.billing_number(f.organization_id,'invoice',c.config->>'invoice_prefix'),
   public.billing_snapshot(f.id)||jsonb_build_object('issued_at',clock_timestamp(),'payment_id',null),public.current_profile_id()
  from public.billing_contexts c where c.id=f.billing_context_id returning id into doc;
 else
  doc:=public.billing6_current_recap(f.id,public.current_profile_id());
  if doc is null then
   insert into public.billing_documents(organization_id,folio_id,currency,kind,snapshot,actor_id)
   values(f.organization_id,f.id,f.currency,'statement',snap||jsonb_build_object('issued_at',clock_timestamp(),'checkout',jsonb_build_object('policy','zero_balance','ready',true,'attested_at',(select attested_at from public.billing_checkout_state where folio_id=f.id),'financial_version',f.version)),public.current_profile_id()) returning id into doc;
   insert into public.billing_payer_recaps values(doc,f.id,public.current_profile_id(),f.version,token);
  end if;
 end if;
 insert into public.billing_outbox(document_id) values(doc) on conflict(document_id) do nothing;
 r:=jsonb_build_object('document_id',doc,'document',public.billing_document_payload(doc),'version',(select version from public.billing_folios where id=f.id));
 insert into public.billing_operations(organization_id,actor_id,request_id,request,response) values(f.organization_id,public.current_profile_id(),p_request,cmd,r);
 perform public.billing6_audit(f.organization_id,f.id,cmd->>'operation',jsonb_build_object('document_id',doc,'control',token));
 return r;
end $$;
create function public.prepare_own_billing_recap(p_request_id uuid,p_folio uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.billing6_own_command(p_request_id,p_folio,null,null,false);
$$;
create function public.finalize_own_billing_folio(p_request_id uuid,p_folio uuid,p_version bigint,p_recap_id uuid) returns jsonb language sql security definer set search_path='' as $$
 select public.billing6_own_command(p_request_id,p_folio,p_version,p_recap_id,true);
$$;

create function public.get_billing_account_detail(p_folio uuid,p_personal boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare f public.billing_folios; r jsonb;
begin
 select * into f from public.billing_folios where id=p_folio;
 if not found or not(case when p_personal then public.billing6_personal_read(f.id) else public.billing6_staff(f.billing_context_id) end) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 r:=public.billing_snapshot(f.id);
 return r||jsonb_build_object('year',(select financial_year from public.billing_context_access where context_id=f.billing_context_id),
 'beneficiaries',coalesce((select jsonb_agg(jsonb_build_object('id',bc.id,'first_name',bc.first_name,'last_name',bc.last_name) order by bc.id) from public.contacts bc where bc.id in(select beneficiary_contact_id from public.billing_charges where folio_id=f.id)),'[]'),
 'horses',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'name',h.name) order by h.id) from public.horses h where h.id in(select horse_id from public.billing_charges where folio_id=f.id)),'[]'),
 'documents',coalesce((select jsonb_agg(public.billing_document_payload(d.id) order by d.created_at,d.id) from public.billing_documents d where d.folio_id=f.id),'[]'),
 'checkout',public.get_billing_checkout_eligibility(f.id,p_personal));
end $$;
create function public.billing_get_close_controls(p_folio uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from public.billing_folios where id=p_folio and public.billing6_staff(billing_context_id)) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('attestation',(select to_jsonb(s) from public.billing_checkout_state s where folio_id=p_folio),
 'blocks',coalesce((select jsonb_agg(to_jsonb(b) order by block_key) from public.billing_close_blocks b where folio_id=p_folio),'[]'));
end $$;

-- Common filter validation and bounded pages. No full audit payload is loaded by these reads.
create function public.billing6_filter(p jsonb,p_limit integer,p_offset integer) returns void language plpgsql immutable set search_path='' as $$
begin
 if p is null or jsonb_typeof(p)<>'object' or p_limit is null or p_limit not between 1 and 100 or p_offset is null or p_offset not between 0 and 100000 then raise exception 'BILLING_INVALID_FILTER'; end if;
 if exists(select 1 from jsonb_object_keys(p) k where k not in ('year','state','show_id','context_id','type_id','prior_balance','unqualified','q'))
 or (p ? 'state' and p->>'state' not in ('open','closed')) or length(coalesce(p->>'q',''))>200 then raise exception 'BILLING_INVALID_FILTER'; end if;
end $$;
create function public.billing6_pattern(p text) returns text language sql immutable set search_path='' as $$
 select '%'||replace(replace(replace(p,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%';
$$;
create function public.billing6_accounts(p_org uuid,p_personal boolean,p_filter jsonb) returns table(id uuid,context_id uuid,year integer,currency text,state text,created_at timestamptz,item jsonb)
language sql stable security definer set search_path='' as $$
 select f.id,c.id,a.financial_year,f.currency,f.state,f.created_at,
 jsonb_build_object('id',f.id,'organization_id',f.organization_id,'context_id',c.id,'show_id',c.show_id,'type_id',c.context_type_id,
 'kind',case when c.kind='event' then 'show_account' else 'non_event_account' end,'name_fr',c.config->>'name_fr','name_en',c.config->>'name_en',
 'account_number',f.public_number,'year',a.financial_year,'currency',f.currency,'state',f.state,'payer',snap->'payer',
 'subtotal',snap->'subtotal','tax_amount',snap->'tax_amount','total',snap->'total','paid',snap->'received','balance',snap->'balance',
 'needs_attention',(f.state='closed' and (snap->>'balance')::numeric<>0) or (f.state='open' and coalesce((select ready from public.billing_checkout_state where folio_id=f.id),false)) or exists(select 1 from public.billing_close_blocks b where b.folio_id=f.id and active))
 from public.billing_folios f join public.billing_contexts c on c.id=f.billing_context_id
 left join public.billing_context_access a on a.context_id=c.id
 cross join lateral (select public.billing_snapshot(f.id) snap) s
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
create function public.list_billing_accounts(p_org uuid,p_filter jsonb default '{}',p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 perform public.billing6_filter(p_filter,p_limit,p_offset);
 if p_org is null then raise exception 'BILLING_INVALID_FILTER'; end if;
 select count(*) into n from public.billing6_accounts(p_org,false,p_filter);
 select coalesce(jsonb_agg(item order by created_at,id),'[]') into r from (select * from public.billing6_accounts(p_org,false,p_filter) order by created_at,id limit p_limit offset p_offset) q;
 return jsonb_build_object('items',r,'total',n,'limit',p_limit,'offset',p_offset);
end $$;
create function public.list_my_billing_accounts(p_org uuid default null,p_filter jsonb default '{}',p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 if public.current_profile_id() is null then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 perform public.billing6_filter(p_filter,p_limit,p_offset);
 select count(*) into n from public.billing6_accounts(p_org,true,p_filter);
 select coalesce(jsonb_agg(item order by created_at,id),'[]') into r from (select * from public.billing6_accounts(p_org,true,p_filter) order by created_at,id limit p_limit offset p_offset) q;
 return jsonb_build_object('items',r,'total',n,'limit',p_limit,'offset',p_offset);
end $$;
create function public.get_billing_finance_overview(p_org uuid,p_year integer default null) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('groups',coalesce(jsonb_agg(to_jsonb(g) order by currency),'[]'),'year',p_year,'has_data',count(*)>0) from
 (select currency,count(*) accounts,count(*) filter(where state='open') open_accounts,count(*) filter(where state='closed') closed_accounts,
 sum((item->>'subtotal')::numeric) subtotal,sum((item->>'tax_amount')::numeric) tax_amount,sum((item->>'total')::numeric) total,
 sum((item->>'paid')::numeric) paid,sum((item->>'balance')::numeric) balance,count(*) filter(where (item->>'needs_attention')::boolean) needs_attention
 from public.billing6_accounts(p_org,false,case when p_year is null then '{}'::jsonb else jsonb_build_object('year',p_year) end) where p_org is not null group by currency) g;
$$;
create function public.search_billing_finance(p_org uuid,p_query text,p_year integer default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 perform public.billing6_filter(jsonb_build_object('q',p_query),p_limit,p_offset);
 if p_org is null or coalesce(length(btrim(p_query)),0)=0 then raise exception 'BILLING_INVALID_FILTER'; end if;
 with accounts as (select * from public.billing6_accounts(p_org,false,jsonb_build_object('q',p_query)||case when p_year is null then '{}'::jsonb else jsonb_build_object('year',p_year) end)),
 results as (select id,created_at,item from accounts union all
 select d.id,d.created_at,jsonb_build_object('id',d.id,'kind',d.kind,'account_id',a.id,'account_number',a.item->'account_number','number',d.number,'year',a.year,'name_fr',a.item->'name_fr','payer',a.item->'payer','currency',a.currency)
 from accounts a join public.billing_documents d on d.folio_id=a.id)
 select count(*),coalesce(jsonb_agg(item order by created_at,id) filter(where rn>p_offset and rn<=p_offset+p_limit),'[]') into n,r
 from (select *,row_number() over(order by created_at,id) rn from results) q;
 return jsonb_build_object('items',r,'total',n,'limit',p_limit,'offset',p_offset);
end $$;
-- Includes permitted shows with no adopted financial context and no account.
create function public.list_billing_contexts(p_org uuid,p_kind text,p_year integer default null,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; n bigint;
begin
 perform public.billing6_filter('{}',p_limit,p_offset);
 if p_org is null or p_kind not in ('event','non_event') then raise exception 'BILLING_INVALID_FILTER'; end if;
 with contexts as (
 select c.id,s.id show_id,s.name name_fr,coalesce(c.config->>'name_en',s.name) name_en,s.start_date,s.end_date,s.status,
 coalesce(a.financial_year,case when c.id is null then extract(year from s.start_date)::integer end) as year,c.currency
 from public.shows s left join public.billing_contexts c on c.show_id=s.id left join public.billing_context_access a on a.context_id=c.id
 where s.organization_id=p_org and p_kind='event' and (case when c.id is null then public.is_platform_admin() or public.is_org_member(p_org,array['admin','secretary']) or public.has_show_role(s.id,array['secretary']) else public.billing6_staff(c.id) end)
 union all
 select c.id,null,c.config->>'name_fr',c.config->>'name_en',null,null,null,a.financial_year,c.currency
 from public.billing_contexts c left join public.billing_context_access a on a.context_id=c.id where c.organization_id=p_org and c.kind='non_event' and p_kind='non_event' and public.billing6_staff(c.id)),
 rows as (select c.*, (select count(*) from public.billing_folios f where f.billing_context_id=c.id) accounts,
 (select count(*) from public.billing_folios f where f.billing_context_id=c.id and f.state='open') open_accounts,
 (select coalesce(sum((s->>'total')::numeric),0) from public.billing_folios f cross join lateral(select public.billing_snapshot(f.id) s) x where f.billing_context_id=c.id) total,
 (select coalesce(sum((s->>'received')::numeric),0) from public.billing_folios f cross join lateral(select public.billing_snapshot(f.id) s) x where f.billing_context_id=c.id) paid,
 (select coalesce(sum((s->>'balance')::numeric),0) from public.billing_folios f cross join lateral(select public.billing_snapshot(f.id) s) x where f.billing_context_id=c.id) balance
 from contexts c where p_year is null or c.year=p_year)
 select count(*),coalesce(jsonb_agg(to_jsonb(q)-'rn' order by name_fr,coalesce(id,show_id)) filter(where rn>p_offset and rn<=p_offset+p_limit),'[]') into n,r
 from (select *,row_number() over(order by name_fr,coalesce(id,show_id)) rn from rows) q;
 return jsonb_build_object('items',r,'total',n,'limit',p_limit,'offset',p_offset);
end $$;

do $$ declare t text; f record; begin
 foreach t in array array['billing_pilot_organizations','billing_context_access','billing_read_history','billing_checkout_state','billing_close_blocks','billing_payer_recaps'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 create trigger billing_payer_recaps_immutable before update or delete on public.billing_payer_recaps for each row execute function public.billing_immutable();
 create trigger billing_read_history_immutable before update or delete on public.billing_read_history for each row execute function public.billing_immutable();
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and (proname like 'billing6_%' or proname in
 ('billing_execute','billing_get_customer_account','billing_set_capabilities','billing_set_ready','billing_set_close_block','billing_get_close_controls','get_billing_checkout_eligibility','prepare_own_billing_recap','finalize_own_billing_folio','get_billing_account_detail','list_billing_accounts','list_my_billing_accounts','get_billing_finance_overview','search_billing_finance','list_billing_contexts')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 end loop;
end $$;
grant execute on function public.billing_get_customer_account(uuid,uuid,uuid),public.billing_set_capabilities(uuid,uuid,boolean,boolean,boolean,boolean,integer),public.billing_set_ready(uuid,boolean),public.billing_set_close_block(uuid,text,text,boolean,text),public.billing_get_close_controls(uuid),
 public.get_billing_checkout_eligibility(uuid,boolean),public.prepare_own_billing_recap(uuid,uuid),public.finalize_own_billing_folio(uuid,uuid,bigint,uuid),public.get_billing_account_detail(uuid,boolean),
 public.list_billing_accounts(uuid,jsonb,integer,integer),public.list_my_billing_accounts(uuid,jsonb,integer,integer),public.get_billing_finance_overview(uuid,integer),public.search_billing_finance(uuid,text,integer,integer,integer),public.list_billing_contexts(uuid,text,integer,integer,integer) to authenticated;
commit;
