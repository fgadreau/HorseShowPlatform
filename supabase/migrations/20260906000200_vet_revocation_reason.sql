-- A short non-empty reason is valid; do not report it as missing.
create or replace function public.vet_revoke_certificate(p_id uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;begin
 if not public.is_platform_admin() then raise exception 'VET_ADMIN_REQUIRED' using errcode='42501';end if;
 if p_reason is null or p_reason !~ '[^[:space:]]' then raise exception 'VET_REASON_REQUIRED';end if;
 if length(p_reason)>2000 then raise exception 'VET_REASON_TOO_LONG';end if;
 p_reason:=btrim(p_reason);
 select * into c from public.vet_certificates where id=p_id for update;
 if c.status<>'issued' then raise exception 'VET_INVALID_TRANSITION';end if;
 update public.vet_certificates set status='revoked' where id=c.id;
 perform public.vet_audit(c.issuer_id,'revoked',c.id,jsonb_build_object('reason',p_reason));
end $$;
