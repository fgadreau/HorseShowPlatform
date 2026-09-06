create function public.vet_delete_draft(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.vet_certificates;begin
 select * into c from public.vet_certificates where id=p_id for update;perform public.vet_assert_access(c.issuer_id);
 if c.status<>'draft' or c.signature_id is not null then raise exception 'VET_ISSUED_CERTIFICATE_REVOKE_REQUIRED';end if;
 perform public.vet_audit(c.issuer_id,'draft_deleted',c.id,jsonb_build_object('horse_id',c.horse_id));
 delete from public.vet_horse_searches where certificate_id=c.id;
 delete from public.vet_certificates where id=c.id;
end $$;
revoke all on function public.vet_delete_draft(uuid) from public,anon;
grant execute on function public.vet_delete_draft(uuid) to authenticated;
