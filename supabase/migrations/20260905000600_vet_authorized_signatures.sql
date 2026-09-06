alter table public.vet_settings add column mandate_link_minutes integer not null default 30 check(mandate_link_minutes between 5 and 120),
 add column mandate_valid_days integer not null default 365 check(mandate_valid_days between 1 and 365);
create table public.vet_signature_authorizations (
 id uuid primary key default gen_random_uuid(), issuer_id uuid not null references public.vet_issuers(id),
 practitioner_id uuid not null references public.vet_practitioners(id), requested_by uuid not null references public.user_profiles(id),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 method text not null check(method in ('clinic_device','personal_link')), recipient_email text,
 status text not null default 'pending' check(status in ('pending','active','cancelled','revoked')),
 snapshot jsonb not null, verification_id uuid not null references public.vet_verifications(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null,
 authorized_at timestamptz, valid_until timestamptz, signature_visual jsonb,
 attestation text not null default 'J’autorise cette clinique et ses utilisateurs HSP autorisés à apposer automatiquement ma signature électronique sur les certificats de vaccination dont je suis le vétérinaire responsable. J’atteste que seuls des renseignements exacts concernant les vaccinations administrées doivent être émis en mon nom. Cette autorisation est révocable.'
);
alter table public.vet_signature_authorizations enable row level security;
revoke all on public.vet_signature_authorizations from public,anon,authenticated;
-- The token hash is not exposed to clinic clients either.
grant select(id,issuer_id,practitioner_id,requested_by,method,status,created_at,expires_at,authorized_at,valid_until,attestation) on public.vet_signature_authorizations to authenticated;
create policy vet_authorization_read on public.vet_signature_authorizations for select to authenticated using(public.vet_has_access(issuer_id));

create table public.vet_certificate_signatures (
 id uuid primary key default gen_random_uuid(), certificate_id uuid not null unique references public.vet_certificates(id),
 issuer_id uuid not null references public.vet_issuers(id), authorization_id uuid not null references public.vet_signature_authorizations(id),
 practitioner_name text not null, permit_number text not null, signed_at timestamptz not null default now(),
 method text not null default 'automatic_prior_authorization' check(method='automatic_prior_authorization'),
 prepared_by uuid not null references public.user_profiles(id), emitted_by uuid not null references public.user_profiles(id),
 signature_visual jsonb not null, signed_content jsonb not null, content_hash text not null,
 verification_id uuid not null references public.vet_verifications(id),
 attestation text not null default 'Je confirme être le vétérinaire responsable indiqué dans ce certificat et j’atteste que les renseignements concernant les vaccinations administrées sont exacts. J’autorise l’émission de ce certificat par la clinique.'
);
alter table public.vet_certificate_signatures enable row level security;
revoke all on public.vet_certificate_signatures from public,anon,authenticated;
grant select on public.vet_certificate_signatures to authenticated;
create policy vet_signature_read on public.vet_certificate_signatures for select to authenticated using(public.vet_has_access(issuer_id));
alter table public.vet_certificates add column signature_id uuid references public.vet_certificate_signatures(id),
 add column public_number text not null default ('VET-'||upper(encode(extensions.gen_random_bytes(6),'hex'))) unique,
 add column version_number integer not null default 1;

create function public.vet_current_verification(p_practitioner uuid) returns public.vet_verifications language plpgsql stable security definer set search_path='' as $$
declare p public.vet_practitioners;v public.vet_verifications;s public.vet_settings;begin
 select * into p from public.vet_practitioners where id=p_practitioner;
 select * into s from public.vet_settings;
 select * into v from public.vet_verifications where practitioner_id=p.id order by checked_at desc,id desc limit 1;
 if not s.omvq_enabled or v.id is null or v.result<>'verified' or v.declared_name is distinct from p.name or v.declared_permit is distinct from p.permit_number
 or v.returned_status is distinct from 'Actif' or v.checked_at<now()-make_interval(hours=>s.freshness_hours) then raise exception 'VET_FRESH_VERIFICATION_REQUIRED';end if;
 return v;
end $$;
create function public.vet_request_authorization(p_practitioner uuid,p_token_hash text,p_method text,p_email text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare p public.vet_practitioners;i public.vet_issuers;v public.vet_verifications;a uuid;begin
 select * into p from public.vet_practitioners where id=p_practitioner;perform public.vet_assert_access(p.issuer_id);
 v:=public.vet_current_verification(p.id);select * into i from public.vet_issuers where id=p.issuer_id;
 if p_method='personal_link' and (p_email is null or p_email !~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$') then raise exception 'VET_PERSONAL_EMAIL_REQUIRED';end if;
 if (select count(*) from public.vet_signature_authorizations where requested_by=public.current_profile_id() and created_at>now()-interval '1 hour')>=20 then raise exception 'VET_RATE_LIMIT';end if;
 update public.vet_signature_authorizations set status='cancelled' where practitioner_id=p.id and status='pending';
 insert into public.vet_signature_authorizations(issuer_id,practitioner_id,requested_by,token_hash,method,recipient_email,snapshot,verification_id,expires_at)
 values(p.issuer_id,p.id,public.current_profile_id(),p_token_hash,p_method,nullif(btrim(p_email),''),
 jsonb_build_object('clinic',i.name,'clinic_contact',i.contact_details,'name',p.name,'permit',p.permit_number,'verification',to_jsonb(v)),v.id,
 now()+make_interval(mins=>(select mandate_link_minutes from public.vet_settings))) returning id into a;
 perform public.vet_audit(p.issuer_id,'authorization_requested',a,jsonb_build_object('method',p_method));return a;
end $$;
create function public.vet_authorization_summary(p_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.vet_signature_authorizations;v public.vet_verifications;begin
 select * into a from public.vet_signature_authorizations where token_hash=p_hash and status='pending' and expires_at>now();
 if not found or not exists(select 1 from public.vet_issuers where id=a.issuer_id and status='active') then raise exception 'VET_AUTHORIZATION_LINK_INVALID';end if;
 v:=public.vet_current_verification(a.practitioner_id);
 if v.declared_name is distinct from a.snapshot->>'name' or v.declared_permit is distinct from a.snapshot->>'permit' then raise exception 'VET_AUTHORIZATION_IDENTITY_CHANGED';end if;
 return jsonb_build_object('clinic',a.snapshot->>'clinic','clinic_contact',a.snapshot->>'clinic_contact','name',a.snapshot->>'name','permit',a.snapshot->>'permit',
 'expires_at',a.expires_at,'attestation',a.attestation,'method',a.method,'valid_days',(select mandate_valid_days from public.vet_settings));
end $$;
create function public.vet_approve_authorization(p_hash text,p_visual jsonb,p_accepted boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.vet_signature_authorizations;stroke jsonb;point jsonb;n integer:=0;begin
 select * into a from public.vet_signature_authorizations where token_hash=p_hash for update;
 perform public.vet_authorization_summary(p_hash);
 if p_accepted is distinct from true or jsonb_typeof(p_visual) is distinct from 'array' or octet_length(p_visual::text)>60000 or jsonb_array_length(p_visual) not between 1 and 100 then raise exception 'VET_SIGNATURE_REQUIRED';end if;
 for stroke in select value from jsonb_array_elements(p_visual) loop
  if jsonb_typeof(stroke) is distinct from 'array' or jsonb_array_length(stroke)<2 then raise exception 'VET_SIGNATURE_REQUIRED';end if;
  for point in select value from jsonb_array_elements(stroke) loop
   if jsonb_typeof(point) is distinct from 'array' or jsonb_array_length(point)<>2 or jsonb_typeof(point->0)<>'number' or jsonb_typeof(point->1)<>'number'
    or (point->>0)::numeric not between 0 and 1 or (point->>1)::numeric not between 0 and 1 then raise exception 'VET_SIGNATURE_REQUIRED';end if;n:=n+1;
  end loop;
 end loop;
 if n<5 then raise exception 'VET_SIGNATURE_REQUIRED';end if;
 update public.vet_signature_authorizations set status='active',authorized_at=now(),valid_until=now()+make_interval(days=>(select mandate_valid_days from public.vet_settings)),signature_visual=p_visual where id=a.id;
 insert into public.vet_audit_events(issuer_id,actor_id,action,entity_id,details) values(a.issuer_id,a.requested_by,'authorization_accepted',a.id,jsonb_build_object('method',a.method));
end $$;
create function public.vet_cancel_authorization(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.vet_signature_authorizations;begin
 select * into a from public.vet_signature_authorizations where id=p_id for update;perform public.vet_assert_access(a.issuer_id);
 update public.vet_signature_authorizations set status=case when status='active' then 'revoked' else 'cancelled' end where id=a.id;
 perform public.vet_audit(a.issuer_id,'authorization_cancelled',a.id);
end $$;
create function public.vet_set_signature_settings(p_link_minutes integer,p_valid_days integer) returns void language plpgsql security definer set search_path='' as $$
begin if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED';end if;
 update public.vet_settings set mandate_link_minutes=p_link_minutes,mandate_valid_days=p_valid_days;
 perform public.vet_audit(null,'signature_settings_changed',null);
end $$;

-- Content bound to the automatic signature. Stored identities never change retrospectively.
create function public.vet_signable_content(p_certificate uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('certificate_id',c.id,'version',c.version_number,'number',c.public_number,'payload',c.payload,'horse_id',c.horse_id,
 'practitioner_id',c.practitioner_id,'prepared_by',c.created_by,'prepared_name',coalesce(nullif(btrim(concat_ws(' ',up.first_name,up.last_name)),''),nullif(up.display_name,''),'Personnel autorisé'),
 'issuer',jsonb_build_object('id',i.id,'name',i.name,'contact_details',i.contact_details),
 'practitioner',jsonb_build_object('id',p.id,'name',p.name,'permit_number',p.permit_number))
 from public.vet_certificates c join public.vet_issuers i on i.id=c.issuer_id join public.vet_practitioners p on p.id=c.practitioner_id join public.user_profiles up on up.id=c.created_by where c.id=p_certificate
$$;

create function public.vet_issue_authorized_internal(p_id uuid) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;p public.vet_practitioners;v public.vet_verifications;s public.vet_settings;i public.vet_issuers; item jsonb;d text;idx integer:=0;v_date date;v_exp date;v_until date;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status='issued' then return c;end if;
 if c.status<>'draft' then raise exception 'VET_INVALID_TRANSITION';end if;
 select * into s from public.vet_settings for share;
 if not s.omvq_enabled then raise exception 'VET_OMVQ_DISABLED';end if;
 select * into p from public.vet_practitioners where id=c.practitioner_id;
 select * into v from public.vet_verifications where practitioner_id=p.id order by checked_at desc,id desc limit 1;
 if v.id is null or v.result<>'verified' or v.declared_name<>p.name or v.declared_permit<>p.permit_number or v.checked_at<now()-make_interval(hours=>s.freshness_hours) then raise exception 'VET_FRESH_VERIFICATION_REQUIRED';end if;
 if c.horse_id is null or c.payload->'horse' is distinct from public.vet_horse_snapshot(c.horse_id) then raise exception 'VET_CONFIRMED_HORSE_REQUIRED';end if;
 if coalesce(length(btrim(c.payload#>>'{owner,name}')),0)<3 or coalesce(length(btrim(c.payload#>>'{owner,contact_details}')),0)<3 then raise exception 'VET_OWNER_DETAILS_REQUIRED';end if;
 if jsonb_typeof(c.payload->'administrations') is distinct from 'array' or jsonb_array_length(c.payload->'administrations') not between 1 and 20 then raise exception 'VET_ADMINISTRATIONS_REQUIRED';end if;
 for item in select value from jsonb_array_elements(c.payload->'administrations') loop
  idx:=idx+1;
  if coalesce(length(btrim(item->>'product')),0)=0 or coalesce(length(btrim(item->>'manufacturer')),0)=0 or coalesce(length(btrim(item->>'lot')),0)=0 then raise exception 'VET_PRODUCT_DETAILS_REQUIRED';end if;
  v_date:=nullif(item->>'administered_on','')::date;v_exp:=nullif(item->>'product_expires_on','')::date;v_until:=nullif(item->>'valid_until','')::date;
  if v_date is null or v_date>current_date or v_exp is null or v_exp<v_date or v_until<v_date then raise exception 'VET_INVALID_DATES';end if;
  if v_until is null and nullif(btrim(item->>'declared_duration'),'') is null then raise exception 'VET_VALIDITY_REQUIRED';end if;
  if jsonb_typeof(item->'diseases') is distinct from 'array' or jsonb_array_length(item->'diseases') not between 1 and 3 then raise exception 'VET_DISEASES_REQUIRED';end if;
  for d in select distinct value from jsonb_array_elements_text(item->'diseases') loop
   insert into public.horse_vaccinations(horse_id,certificate_id,administration_index,disease,product,manufacturer,lot,product_expires_on,administered_on,valid_until,declared_duration,practitioner_id)
   values(c.horse_id,c.id,idx,d,item->>'product',item->>'manufacturer',item->>'lot',v_exp,v_date,v_until,item->>'declared_duration',p.id);
  end loop;
 end loop;
 select * into i from public.vet_issuers where id=c.issuer_id;
 if c.replaces_id is not null then
  perform 1 from public.vet_certificates where id=c.replaces_id and issuer_id=c.issuer_id and status='issued' for update;
  if not found then raise exception 'VET_REPLACEMENT_CONFLICT';end if;
  update public.vet_certificates set status='superseded' where id=c.replaces_id;
  perform public.vet_audit(c.issuer_id,'superseded',c.replaces_id,jsonb_build_object('replacement_id',c.id));
 end if;
 update public.vet_certificates set status='issued',issued_at=now(),issued_by=public.current_profile_id(),verification_id=v.id,
 number=c.public_number,
 snapshot=jsonb_build_object('certificate',c.payload,'issuer',jsonb_build_object('id',i.id,'name',i.name,'kind',i.kind,'contact_details',i.contact_details),
 'practitioner',jsonb_build_object('id',p.id,'name',p.name,'permit_number',p.permit_number),'verification',to_jsonb(v),'created_by',c.created_by,'issued_by',public.current_profile_id(),'issued_at',now(),'version',c.version_number,'prepared_name',public.vet_signable_content(c.id)->>'prepared_name','signature',(select to_jsonb(sig) from public.vet_certificate_signatures sig where sig.id=c.signature_id))
 where id=c.id returning * into c;
 perform public.vet_audit(c.issuer_id,'issued',c.id);return c;
end $$;
create or replace function public.vet_issue_certificate(p_id uuid) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;a public.vet_signature_authorizations;v public.vet_verifications;content jsonb;sig uuid;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status='issued' and c.signature_id is not null then return c;end if;
 if c.status<>'draft' then raise exception 'VET_SIGNATURE_REQUIRED';end if;
 v:=public.vet_current_verification(c.practitioner_id);
 select * into a from public.vet_signature_authorizations where practitioner_id=c.practitioner_id and issuer_id=c.issuer_id and status='active' and valid_until>now() order by authorized_at desc limit 1 for share;
 if a.id is null or a.snapshot->>'name' is distinct from v.declared_name or a.snapshot->>'permit' is distinct from v.declared_permit then raise exception 'VET_PRIOR_AUTHORIZATION_REQUIRED';end if;
 if not (coalesce(c.payload#>>'{owner,email}','') ~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$' or coalesce(c.payload#>>'{agent,email}','') ~ '^[^@[:space:]<>]+@[^@[:space:]<>]+\.[^@[:space:]<>]+$') then raise exception 'VET_DELIVERY_EMAIL_REQUIRED';end if;
 content:=public.vet_signable_content(c.id);
 insert into public.vet_certificate_signatures(certificate_id,issuer_id,authorization_id,practitioner_name,permit_number,prepared_by,emitted_by,signature_visual,signed_content,content_hash,verification_id)
 values(c.id,c.issuer_id,a.id,v.declared_name,v.declared_permit,c.created_by,public.current_profile_id(),a.signature_visual,content,encode(extensions.digest(content::text,'sha256'),'hex'),v.id) returning id into sig;
 update public.vet_certificates set signature_id=sig where id=c.id;
 c:=public.vet_issue_authorized_internal(c.id);
 perform public.vet_audit(c.issuer_id,'automatically_signed',c.id,jsonb_build_object('authorization_id',a.id,'signature_id',sig));return c;
end $$;
-- Corrections are always new unsigned drafts, with a new content-bound automatic signature on issuance.
create or replace function public.vet_correct_certificate(p_id uuid) returns public.vet_certificates language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;n public.vet_certificates;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'issued' then raise exception 'VET_INVALID_TRANSITION';end if;
 insert into public.vet_certificates(issuer_id,practitioner_id,horse_id,created_by,payload,replaces_id,version_number)
 values(c.issuer_id,c.practitioner_id,c.horse_id,public.current_profile_id(),c.payload,c.id,c.version_number+1) returning * into n;
 perform public.vet_audit(c.issuer_id,'correction_started',n.id,jsonb_build_object('replaces_id',c.id));return n;
end $$;
create function public.vet_signature_intact(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.vet_certificates c join public.vet_certificate_signatures s on s.id=c.signature_id and s.certificate_id=c.id
 where c.id=p_id and s.content_hash=encode(extensions.digest(s.signed_content::text,'sha256'),'hex')
 and s.signed_content->'payload'=c.payload and s.signed_content->>'practitioner_id'=c.practitioner_id::text
 and s.signed_content->>'horse_id'=c.horse_id::text and s.signed_content->>'number'=c.public_number
 and (s.signed_content->>'version')::integer=c.version_number and c.snapshot->'signature'=to_jsonb(s)
 and c.snapshot->'certificate'=c.payload)
$$;
create function public.vet_public_certificate_status(p_number text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('number',c.public_number,'version',c.version_number,'issued_at',c.issued_at,
 'status',case when c.status='revoked' then 'revoked' when c.status='superseded' then 'superseded'
 when c.status='issued' and public.vet_signature_intact(c.id) then 'valid' else 'unverified' end,
 'replacement_number',(select public_number from public.vet_certificates n where n.replaces_id=c.id and n.status='issued' limit 1))
 from public.vet_certificates c where c.public_number=p_number and c.status<>'draft'
$$;
-- Exclude all legacy unsigned pilot evidence, without altering/deleting its historical records.
do $$begin
 execute replace(pg_get_functiondef('public.vet_evaluate_vaccinations(uuid,date,integer)'::regprocedure),
 'when c.status<>''issued'' then ''pending_verification''','when c.status<>''issued'' or not public.vet_signature_intact(c.id) then ''pending_verification''');
end $$;
revoke all on function public.vet_current_verification(uuid),public.vet_request_authorization(uuid,text,text,text),public.vet_authorization_summary(text),public.vet_approve_authorization(text,jsonb,boolean),public.vet_cancel_authorization(uuid),public.vet_set_signature_settings(integer,integer),public.vet_signable_content(uuid),public.vet_issue_authorized_internal(uuid),public.vet_signature_intact(uuid),public.vet_public_certificate_status(text) from public,anon,authenticated,service_role;
grant execute on function public.vet_request_authorization(uuid,text,text,text),public.vet_cancel_authorization(uuid),public.vet_set_signature_settings(integer,integer) to authenticated;
grant execute on function public.vet_authorization_summary(text),public.vet_approve_authorization(text,jsonb,boolean),public.vet_signature_intact(uuid) to service_role;
grant execute on function public.vet_public_certificate_status(text) to anon,authenticated,service_role;
