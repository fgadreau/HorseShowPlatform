-- Explicitly simulated authorizations; never accepted as recognized health evidence.
alter table public.vet_signature_authorizations drop constraint vet_signature_authorizations_method_check;
alter table public.vet_signature_authorizations add constraint vet_signature_authorizations_method_check check(method in ('clinic_device','personal_link','local_test'));
create function public.vet_create_local_test_authorization(p_admin uuid,p_practitioner uuid,p_email text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare p public.vet_practitioners;v public.vet_verifications;target uuid;result uuid;begin
 if not exists(select 1 from public.platform_admins where user_id=p_admin or id=p_admin) then raise exception 'VET_ADMIN_REQUIRED';end if;
 select * into p from public.vet_practitioners where id=p_practitioner;
 if p.id is null or not exists(select 1 from public.vet_issuers where id=p.issuer_id and status='active') then raise exception 'VET_ACCESS_DENIED';end if;
 v:=public.vet_current_verification(p.id);
 if nullif(btrim(p_email),'') is null then target:=p_admin;
 else select up.id into target from public.user_profiles up join auth.users u on u.id=up.user_id where lower(u.email)=lower(btrim(p_email));end if;
 if target is null or not (exists(select 1 from public.vet_memberships where issuer_id=p.issuer_id and profile_id=target and active)
 or exists(select 1 from public.platform_admins where user_id=target or id=target)) then raise exception 'VET_TARGET_ACCOUNT_FORBIDDEN';end if;
 if exists(select 1 from public.vet_signature_authorizations where practitioner_id=p.id and requested_by=target and status='active' and valid_until>now() and method<>'local_test') then raise exception 'VET_REAL_AUTHORIZATION_ALREADY_ACTIVE';end if;
 select id into result from public.vet_signature_authorizations where practitioner_id=p.id and requested_by=target and status='active' and valid_until>now() and method='local_test' limit 1;
 if result is not null then return result;end if;
 insert into public.vet_signature_authorizations(issuer_id,practitioner_id,requested_by,token_hash,method,status,snapshot,verification_id,expires_at,authorized_at,valid_until,signature_visual,attestation)
 values(p.issuer_id,p.id,target,encode(extensions.digest(extensions.gen_random_bytes(32),'sha256'),'hex'),'local_test','active',
 jsonb_build_object('name',p.name,'permit',p.permit_number,'test_only',true,'created_by_admin',p_admin),v.id,now(),now(),now()+interval '24 hours','[]',
 'SIMULATION LOCALE — aucune autorisation ni signature réelle du vétérinaire. Valable uniquement pour les essais du pilote.') returning id into result;
 insert into public.vet_audit_events(issuer_id,actor_id,action,entity_id,details) values(p.issuer_id,p_admin,'test_authorization_created',result,jsonb_build_object('test_only',true,'authorized_account',target,'practitioner_id',p.id));
 return result;
end $$;
revoke all on function public.vet_create_local_test_authorization(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.vet_create_local_test_authorization(uuid,uuid,text) to service_role;
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.vet_issue_certificate(uuid)'::regprocedure);
 definition:=replace(definition,'content:=public.vet_signable_content(c.id);','content:=public.vet_signable_content(c.id)||jsonb_build_object(''test_only'',a.method=''local_test'');');execute definition;
 definition:=pg_get_functiondef('public.vet_evaluate_vaccinations(uuid,date,integer)'::regprocedure);
 definition:=replace(definition,'or not public.vet_signature_intact(c.id) then', 'or not public.vet_signature_intact(c.id) or coalesce((c.snapshot#>>''{signature,signed_content,test_only}'')::boolean,false) then');execute definition;
 definition:=pg_get_functiondef('public.vet_public_certificate_status(text)'::regprocedure);
 definition:=replace(definition,'case when c.status=''revoked''', 'case when coalesce((c.snapshot#>>''{signature,signed_content,test_only}'')::boolean,false) then ''test'' when c.status=''revoked''');execute definition;
end $$;
