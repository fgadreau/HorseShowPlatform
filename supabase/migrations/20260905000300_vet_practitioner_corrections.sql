-- Preserve prior practitioner declarations and all issued certificate references.
-- A corrected spelling is a new declaration, never an overwrite of the original.
alter table public.vet_practitioners drop constraint vet_practitioners_issuer_id_permit_number_key;
alter table public.vet_practitioners add constraint vet_practitioners_declaration_key unique(issuer_id,permit_number,name);

-- OMVQ-only comparison: do not broaden central horse/owner identity matching.
create function public.vet_omvq_name_key(p_name text) returns text
language sql immutable set search_path='' as $$
 select regexp_replace(normalize(public.vet_name_key(p_name),NFD),U&'[\0300-\036f]','','g')
$$;
revoke all on function public.vet_omvq_name_key(text) from public,anon,authenticated;

create or replace function public.vet_record_verification(p_practitioner uuid,p_name text,p_permit text,p_status text,p_result text) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.vet_practitioners; v_id uuid; begin
 select * into p from public.vet_practitioners where id=p_practitioner;
 if not found then raise exception 'VET_PRACTITIONER_NOT_FOUND'; end if;
 if p_result='verified' and (p_permit is distinct from p.permit_number or public.vet_omvq_name_key(p_name)<>public.vet_omvq_name_key(p.name) or p_status is distinct from 'Actif') then raise exception 'VET_INVALID_POSITIVE'; end if;
 insert into public.vet_verifications(practitioner_id,declared_name,declared_permit,returned_name,returned_permit,returned_status,result)
 values(p.id,p.name,p.permit_number,left(p_name,200),left(p_permit,20),left(p_status,100),p_result) returning id into v_id;
 perform public.vet_audit(p.issuer_id,'omvq_checked',p.id,jsonb_build_object('verification_id',v_id,'result',p_result)); return v_id;
end $$;
