-- Horse-based requests, server-side lottery and explicit association billing.
-- Existing ShowScore-only queues remain unchanged until registrations are enabled.
begin;
alter table public.show_score_paid_warmups
 add column registration_enabled boolean not null default false,
 add column entry_fee numeric(12,2) not null default 0 check(entry_fee>=0),
 add column capacity integer check(capacity>0),
 add column registration_state text not null default 'open' check(registration_state in ('open','drawn','validated')),
 add column registration_version bigint not null default 0,
 add constraint paid_warmup_capacity_required check(not registration_enabled or capacity is not null);
create table public.paid_warmup_requests (
 id uuid primary key default gen_random_uuid(),
 warmup_id uuid not null references public.show_score_paid_warmups(id),
 horse_id uuid not null references public.horses(id),
 owner_contact_id uuid not null references public.contacts(id),
 requested_by uuid not null references public.user_profiles(id),
 status text not null default 'requested' check(status in ('requested','selected','waiting','cancelled')),
 draw_rank integer check(draw_rank>0), position integer,
 check((status='selected' and position is not null and position>0) or (status<>'selected' and position is null)),
 billed_at timestamptz, charge_id uuid references public.billing_charges(id),
 created_at timestamptz not null default clock_timestamp(),
 unique(warmup_id,horse_id), unique(warmup_id,draw_rank)
);
create table public.paid_warmup_events (
 id bigint generated always as identity primary key,
 warmup_id uuid not null references public.show_score_paid_warmups(id),
 actor_id uuid not null references public.user_profiles(id),
 action text not null, snapshot jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.paid_warmup_requests enable row level security;
alter table public.paid_warmup_events enable row level security;
revoke all on public.paid_warmup_requests, public.paid_warmup_events from public,anon,authenticated,service_role;

create function public.paid_warmup_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
  if new.registration_state<>'open' or new.registration_version<>0 then raise exception 'WARMUP_INVALID_STATE'; end if;
 elsif not old.registration_enabled and new.registration_enabled and jsonb_array_length(old.entries)>0 then
  raise exception 'WARMUP_LEGACY_QUEUE_NOT_EMPTY';
 elsif exists(select 1 from public.paid_warmup_requests where warmup_id=old.id) then
  if new.registration_enabled is distinct from old.registration_enabled or new.entry_fee is distinct from old.entry_fee
     or new.show_id<>old.show_id or new.organization_id<>old.organization_id or new.id<>old.id then
   raise exception 'WARMUP_CONFIGURATION_FROZEN';
  end if;
  if old.registration_state<>'open' and new.capacity is distinct from old.capacity then raise exception 'WARMUP_CONFIGURATION_FROZEN'; end if;
 end if;
 if new.registration_enabled then
  -- ShowScore may update timers/status, but may not replace the authoritative roster.
  select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'order',r.position,
   'rider',concat_ws(' ',c.first_name,c.last_name)||' — '||h.name,
   'status',case when e.value->>'status' in ('pending','done','no_show','scratch') then e.value->>'status' else 'pending' end,
   'completedAt',e.value->>'completedAt') order by r.position,r.id),'[]') into new.entries
  from public.paid_warmup_requests r join public.horses h on h.id=r.horse_id join public.contacts c on c.id=r.owner_contact_id
  left join lateral(select value from jsonb_array_elements(coalesce(new.entries,'[]')) where value->>'id'=r.id::text limit 1) e on true
  where r.warmup_id=new.id and r.status='selected';
 end if;
 return new;
end $$;
create trigger a_paid_warmup_registration_guard before insert or update on public.show_score_paid_warmups for each row execute function public.paid_warmup_guard();
-- Internal state/version cannot be edited via PostgREST or a legacy ShowScore client.
revoke update on public.show_score_paid_warmups from authenticated;
do $$ declare cols text; begin
 select string_agg(quote_ident(column_name),',') into cols from information_schema.columns
 where table_schema='public' and table_name='show_score_paid_warmups' and column_name not in ('registration_state','registration_version');
 execute 'grant update ('||cols||') on public.show_score_paid_warmups to authenticated';
end $$;

create function public.paid_warmup_touch(p_warmup uuid,p_action text) returns void language plpgsql set search_path='' as $$
begin
 with ranked as (select id,row_number() over(order by position,id)::integer n from public.paid_warmup_requests where warmup_id=p_warmup and status='selected')
 update public.paid_warmup_requests r set position=ranked.n from ranked where r.id=ranked.id;
 update public.show_score_paid_warmups set registration_version=registration_version+1,
  active_entry_id=case when active_entry_id is not null and not exists(select 1 from public.paid_warmup_requests r where r.warmup_id=p_warmup and r.status='selected' and
   (active_entry_id=r.id::text or active_entry_id='drag-after-'||r.id::text or active_entry_id='completed:drag-after-'||r.id::text)) then null else active_entry_id end
 where id=p_warmup;
 insert into public.paid_warmup_events(warmup_id,actor_id,action,snapshot) values(p_warmup,public.current_profile_id(),p_action,
  (select coalesce(jsonb_agg(jsonb_build_object('id',id,'status',status,'rank',draw_rank,'position',position,'charge_id',charge_id) order by id),'[]') from public.paid_warmup_requests where warmup_id=p_warmup));
end $$;

create function public.paid_warmup_request(p_warmup uuid,p_horse uuid,p_cancel boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare w public.show_score_paid_warmups; h public.horses; r public.paid_warmup_requests; staff boolean;
begin
 select * into w from public.show_score_paid_warmups where id=p_warmup for update;
 if w.id is null or not w.registration_enabled or public.current_profile_id() is null then raise exception 'WARMUP_FORBIDDEN'; end if;
 staff:=public.can_manage_show_score_show(w.show_id,array['organizer','secretary']);
 if staff and not (public.horse_is_linked_to_org(p_horse,w.organization_id) or public.can_manage_horse_identity(p_horse)) then raise exception 'WARMUP_FORBIDDEN'; end if;
 if not staff and (not public.can_manage_horse_identity(p_horse) or not exists(select 1 from public.shows where id=w.show_id and is_public and status='open')) then raise exception 'WARMUP_FORBIDDEN'; end if;
 select * into h from public.horses where id=p_horse;
 if h.id is null or h.primary_owner_contact_id is null then raise exception 'WARMUP_OWNER_REQUIRED'; end if;
 select * into r from public.paid_warmup_requests where warmup_id=w.id and horse_id=p_horse;
 if p_cancel then
  if r.id is null then raise exception 'WARMUP_NOT_FOUND'; end if;
  update public.paid_warmup_requests set status='cancelled',position=null where id=r.id;
 else
  if w.registration_state<>'open' and not staff then raise exception 'WARMUP_REGISTRATION_CLOSED'; end if;
  if r.id is not null and r.status<>'cancelled' then return r.id; end if;
  if r.billed_at is not null then raise exception 'WARMUP_ALREADY_BILLED_CONTACT_SECRETARY'; end if;
  if r.id is null then
   insert into public.paid_warmup_requests(warmup_id,horse_id,owner_contact_id,requested_by,status)
   values(w.id,h.id,h.primary_owner_contact_id,public.current_profile_id(),case when w.registration_state='open' then 'requested' else 'waiting' end) returning * into r;
  else
   update public.paid_warmup_requests set status=case when w.registration_state='open' then 'requested' else 'waiting' end,position=null where id=r.id;
  end if;
 end if;
 perform public.paid_warmup_touch(w.id,case when p_cancel then 'cancel_request_no_refund' else 'request' end);
 return r.id;
end $$;

create function public.paid_warmup_manage(p_warmup uuid,p_version bigint,p_action text,p_request uuid default null,p_order uuid[] default null) returns void language plpgsql security definer set search_path='' as $$
declare w public.show_score_paid_warmups; r public.paid_warmup_requests; n integer; item record;
begin
 select * into w from public.show_score_paid_warmups where id=p_warmup for update;
 if w.id is null or not w.registration_enabled or not public.can_manage_show_score_show(w.show_id,array['organizer','secretary']) then raise exception 'WARMUP_FORBIDDEN'; end if;
 if w.registration_version<>p_version then raise exception 'WARMUP_STALE_VERSION_REFRESH'; end if;
 if p_action='draw' then
  if w.registration_state<>'open' then raise exception 'WARMUP_DRAW_ALREADY_DONE'; end if;
  if not exists(select 1 from public.paid_warmup_requests where warmup_id=w.id and status='requested') then raise exception 'WARMUP_NO_REQUESTS'; end if;
  -- PostgreSQL generates the random permutation; the client supplies no winners/seed.
  for item in select id,row_number() over(order by gen_random_uuid())::integer rank from public.paid_warmup_requests where warmup_id=w.id and status='requested' loop
   update public.paid_warmup_requests set draw_rank=item.rank,position=case when item.rank<=w.capacity then item.rank end,status=case when item.rank<=w.capacity then 'selected' else 'waiting' end where id=item.id;
  end loop;
  update public.show_score_paid_warmups set registration_state='drawn' where id=w.id;
 elsif p_action='promote' then
  if w.registration_state='open' then raise exception 'WARMUP_DRAW_REQUIRED'; end if;
  select count(*) into n from public.paid_warmup_requests where warmup_id=w.id and status='selected';
  if n>=w.capacity then raise exception 'WARMUP_FULL'; end if;
  select * into r from public.paid_warmup_requests where warmup_id=w.id and status='waiting' order by draw_rank nulls last,created_at,id limit 1;
  if r.id is null then raise exception 'WARMUP_NO_WAITING_REQUEST'; end if;
  update public.paid_warmup_requests set status='selected',position=(select coalesce(max(position),0)+1 from public.paid_warmup_requests where warmup_id=w.id and status='selected') where id=r.id;
 elsif p_action='remove' then
  update public.paid_warmup_requests set status='cancelled',position=null where id=p_request and warmup_id=w.id;
  if not found then raise exception 'WARMUP_NOT_FOUND'; end if;
 elsif p_action='reorder' then
  select count(*) into n from public.paid_warmup_requests where warmup_id=w.id and status='selected';
  if p_order is null or cardinality(p_order)<>n or (select count(distinct u.request_id) from unnest(p_order) as u(request_id))<>n or exists(select 1 from unnest(p_order) as u(request_id) where not exists(select 1 from public.paid_warmup_requests candidate where candidate.id=u.request_id and candidate.warmup_id=w.id and candidate.status='selected')) then raise exception 'WARMUP_INVALID_ORDER'; end if;
  update public.paid_warmup_requests set position=array_position(p_order,id) where warmup_id=w.id and status='selected';
 else raise exception 'WARMUP_INVALID_ACTION'; end if;
 perform public.paid_warmup_touch(w.id,p_action);
end $$;

create function public.paid_warmup_signup_options(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'show_id',w.show_id,'show_name',s.name,'price',w.entry_fee,'currency',coalesce(s.default_currency,'CAD'),'capacity',w.capacity,'state',w.registration_state,
 'requests',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'horse_id',r.horse_id,'status',r.status,'rank',r.draw_rank,'position',r.position,'billed',r.billed_at is not null)),'[]') from public.paid_warmup_requests r where r.warmup_id=w.id and public.can_manage_horse_identity(r.horse_id))) order by w.sort_order,w.id),'[]')
 from public.show_score_paid_warmups w join public.shows s on s.id=w.show_id where w.organization_id=p_org and w.registration_enabled and s.is_public and s.status='open' and public.current_profile_id() is not null;
$$;
create function public.paid_warmup_roster(p_warmup uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.show_score_paid_warmups; ctx uuid; catalog jsonb;
begin
 select * into w from public.show_score_paid_warmups where id=p_warmup;
 if w.id is null or not public.can_manage_show_score_show(w.show_id,array['organizer','secretary']) then raise exception 'WARMUP_FORBIDDEN'; end if;
 select id into ctx from public.billing_contexts where show_id=w.show_id and organization_id=w.organization_id and kind='event';
 if ctx is not null and public.billing6_staff(ctx) then catalog:=public.billing_ui_catalog(ctx); end if;
 return jsonb_build_object('warmup',to_jsonb(w),'currency',(select coalesce(default_currency,'CAD') from public.shows where id=w.show_id),'catalog',catalog,'requests',
 (select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('horse_name',h.name,'owner_name',concat_ws(' ',c.first_name,c.last_name)) order by case r.status when 'selected' then 0 when 'waiting' then 1 when 'requested' then 2 else 3 end,r.position,r.draw_rank,r.created_at),'[]') from public.paid_warmup_requests r join public.horses h on h.id=r.horse_id join public.contacts c on c.id=r.owner_contact_id where r.warmup_id=w.id));
end $$;

-- Preview/confirmation use the existing tax/fee engine, never direct ledger writes.
create function public.paid_warmup_billing_preview(p_warmup uuid,p_version bigint,p_product uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.show_score_paid_warmups; ctx uuid; r record; customer uuid; sale jsonb; q jsonb; lines jsonb; result jsonb:='[]'; seen uuid[]:='{}'; subtotal numeric; tax numeric; payload jsonb; directory uuid;
begin
 select * into w from public.show_score_paid_warmups where id=p_warmup for update;
 if w.id is null then raise exception 'WARMUP_NOT_FOUND'; end if;
 perform public.billing_assert_staff(w.organization_id,w.show_id);
 if not w.registration_enabled or w.registration_state='open' then raise exception 'WARMUP_DRAW_REQUIRED'; end if;
 if w.registration_version<>p_version then raise exception 'WARMUP_STALE_VERSION_REFRESH'; end if;
 if w.entry_fee>0 then
  select id into ctx from public.billing_contexts where show_id=w.show_id and organization_id=w.organization_id and kind='event';
  if ctx is null then raise exception 'WARMUP_BILLING_CONTEXT_REQUIRED'; end if;
  perform public.billing6_lock(w.organization_id);
  if not exists(select 1 from public.billing_product_tax_profiles t join public.organization_products p on p.id=t.product_id where t.context_id=ctx and t.product_id=p_product and t.unit_price=w.entry_fee and p.is_active and p.organization_id=w.organization_id) then raise exception 'WARMUP_PRODUCT_PRICE_MUST_MATCH'; end if;
 end if;
 for r in select * from public.paid_warmup_requests where warmup_id=w.id and status='selected' and billed_at is null order by position,id loop
  lines:='[]';
  if w.entry_fee>0 then
   select id into directory from public.organization_disciplines where organization_id=w.organization_id and is_active order by id limit 1;
   if directory is null then raise exception 'WARMUP_ASSOCIATION_DIRECTORY_REQUIRED'; end if;
   if not public.contact_is_linked_to_org(r.owner_contact_id,w.organization_id) then insert into public.directory_contacts(organization_discipline_id,contact_id) values(directory,r.owner_contact_id) on conflict do nothing; end if;
   if not public.horse_is_linked_to_org(r.horse_id,w.organization_id) then insert into public.directory_horses(organization_discipline_id,horse_id) values(directory,r.horse_id) on conflict do nothing; end if;
   customer:=public.billing_get_customer_account(w.organization_id,r.owner_contact_id,ctx);
   sale:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id',p_product,'quantity',1,'beneficiary_contact_id',r.owner_contact_id,'horse_id',r.horse_id,'source_id',r.id);
   if exists(select 1 from public.billing_hsp_policies where context_id=ctx) then
    q:=public.prepare_billing_operation_quote(sale);
    select coalesce(jsonb_agg(l),'[]') into lines from jsonb_array_elements(q->'lines') l where l->>'supplier'<>'hsp' or not(customer=any(seen));
   else
    subtotal:=w.entry_fee;
    select coalesce(sum(round(subtotal*t.rate/100,2)),0) into tax from public.billing_product_tax_rules m join public.billing_tax_rules t on t.id=m.tax_rule_id where m.context_id=ctx and m.product_id=p_product;
    lines:=jsonb_build_array(jsonb_build_object('description',w.name,'subtotal',subtotal,'tax_amount',tax,'total',subtotal+tax));
   end if;
   seen:=array_append(seen,customer);
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('request_id',r.id,'horse_id',r.horse_id,'owner_contact_id',r.owner_contact_id,'lines',lines));
 end loop;
 payload:=jsonb_build_object('warmup_id',w.id,'version',w.registration_version,'product',p_product,'price',w.entry_fee,'items',result);
 return payload||jsonb_build_object('hash',md5(payload::text));
end $$;
create function public.paid_warmup_validate(p_warmup uuid,p_version bigint,p_product uuid,p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare w public.show_score_paid_warmups; preview jsonb; ctx uuid; r record; customer uuid; sale jsonb; q jsonb; billed jsonb; n integer:=0;
begin
 preview:=public.paid_warmup_billing_preview(p_warmup,p_version,p_product);
 if p_hash is distinct from preview->>'hash' then raise exception 'WARMUP_REVIEW_CHANGED'; end if;
 select * into w from public.show_score_paid_warmups where id=p_warmup;
 select id into ctx from public.billing_contexts where show_id=w.show_id and organization_id=w.organization_id and kind='event';
 for r in select * from public.paid_warmup_requests where warmup_id=w.id and status='selected' and billed_at is null order by position,id loop
  billed:=null;
  if w.entry_fee>0 then
   customer:=public.billing_get_customer_account(w.organization_id,r.owner_contact_id,ctx);
   sale:=jsonb_build_object('context_id',ctx,'payer_customer_account_id',customer,'product_id',p_product,'quantity',1,'beneficiary_contact_id',r.owner_contact_id,'horse_id',r.horse_id,'source_id',r.id);
   if exists(select 1 from public.billing_hsp_policies where context_id=ctx) then q:=public.prepare_billing_operation_quote(sale);sale:=sale||jsonb_build_object('quote_id',q->>'quote_id');end if;
   billed:=public.add_billing_sale(r.id,sale);
  end if;
  update public.paid_warmup_requests set billed_at=clock_timestamp(),charge_id=(billed->>'charge_id')::uuid where id=r.id;n:=n+1;
 end loop;
 update public.show_score_paid_warmups set registration_state='validated' where id=w.id;
 perform public.paid_warmup_touch(w.id,'validate_and_bill');
 return jsonb_build_object('billed',n,'state','validated');
end $$;

do $$ declare f record;begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname like 'paid_warmup_%' loop execute 'revoke all on function '||f.signature||' from public,anon,authenticated,service_role';end loop;
end $$;
grant execute on function public.paid_warmup_request(uuid,uuid,boolean),public.paid_warmup_manage(uuid,bigint,text,uuid,uuid[]),public.paid_warmup_signup_options(uuid),public.paid_warmup_roster(uuid),public.paid_warmup_billing_preview(uuid,bigint,uuid),public.paid_warmup_validate(uuid,bigint,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
