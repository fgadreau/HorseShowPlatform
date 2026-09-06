-- Public QR view: explicit snapshot fields only; no central data access or internal IDs.
create or replace function public.vet_public_certificate_status(p_number text) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'number',c.public_number,'version',c.version_number,'issued_at',c.issued_at,
 'status',case when coalesce((c.snapshot#>>'{signature,signed_content,test_only}')::boolean,false) then 'test'
 when c.status='revoked' then 'revoked' when c.status='superseded' then 'superseded'
 when c.status='issued' and public.vet_signature_intact(c.id) then 'valid' else 'unverified' end,
 'certificate_status',c.status,
 'replacement_number',(select n.public_number from public.vet_certificates n where n.replaces_id=c.id
 and n.status in ('issued','superseded','revoked') order by n.issued_at desc limit 1),
 'details',jsonb_strip_nulls(jsonb_build_object(
 'horse_name',c.snapshot#>>'{certificate,horse,name}',
 'identifiers',(select jsonb_agg(jsonb_build_object('type',i->>'type','value',i->>'value')) from jsonb_array_elements(coalesce(c.snapshot#>'{certificate,horse,identifiers}','[]'::jsonb)) i),
 'owner_name',c.snapshot#>>'{certificate,owner,name}',
 'agent_name',c.snapshot#>>'{certificate,agent,name}',
 'clinic_name',c.snapshot#>>'{issuer,name}','clinic_contact',c.snapshot#>>'{issuer,contact_details}',
 'prepared_name',coalesce(c.snapshot->>'prepared_name',c.snapshot#>>'{signature,signed_content,prepared_name}'),
 'veterinarian_name',c.snapshot#>>'{practitioner,name}','permit_number',c.snapshot#>>'{practitioner,permit_number}',
 'verification_result',c.snapshot#>>'{verification,result}','verification_status',c.snapshot#>>'{verification,returned_status}',
 'verified_at',c.snapshot#>>'{verification,checked_at}',
 'signed_at',c.snapshot#>>'{signature,signed_at}','signature_visual',c.snapshot#>'{signature,signature_visual}',
 'administrations',(select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
 'product',a->>'product','manufacturer',a->>'manufacturer','lot',a->>'lot','diseases',a->'diseases',
 'product_expires_on',a->>'product_expires_on','administered_on',a->>'administered_on',
 'valid_until',a->>'valid_until','declared_duration',a->>'declared_duration')))
 from jsonb_array_elements(coalesce(c.snapshot#>'{certificate,administrations}','[]'::jsonb)) a)
 )))
 from public.vet_certificates c where c.public_number=p_number and c.status<>'draft'
$$;
revoke all on function public.vet_public_certificate_status(text) from public,anon,authenticated,service_role;
grant execute on function public.vet_public_certificate_status(text) to anon,authenticated,service_role;

-- Keep the established compliance statuses; explain why simulated evidence is excluded.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.vet_evaluate_vaccinations(uuid,date,integer)'::regprocedure);
 if position('select v.*,c.status certificate_status,' in definition)=0 then raise exception 'Unexpected vaccination evaluator';end if;
 definition:=replace(definition,'select v.*,c.status certificate_status,',
 'select v.*,c.status certificate_status,coalesce((c.snapshot#>>''{signature,signed_content,test_only}'')::boolean,false) test_only,');
 definition:=replace(definition,'''reason'',coalesce(assessment,''missing'')',
 '''reason'',case when assessment=''pending_verification'' and test_only then ''test_certificate'' else coalesce(assessment,''missing'') end');
 execute definition;
end $$;
