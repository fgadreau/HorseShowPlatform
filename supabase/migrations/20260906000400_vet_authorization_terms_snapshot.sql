-- Bind the duration shown to the veterinarian to the request, not later admin settings.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.vet_request_authorization(uuid,text,text,text)'::regprocedure);
 definition:=replace(definition,'''authorized_account_id'',public.current_profile_id()', '''valid_days'',(select mandate_valid_days from public.vet_settings),''authorized_account_id'',public.current_profile_id()');
 execute definition;
 definition:=pg_get_functiondef('public.vet_authorization_summary(text)'::regprocedure);
 definition:=replace(definition,'''valid_days'',(select mandate_valid_days from public.vet_settings)', '''valid_days'',coalesce((a.snapshot->>''valid_days'')::integer,(select mandate_valid_days from public.vet_settings))');
 execute definition;
 definition:=pg_get_functiondef('public.vet_approve_authorization(text,jsonb,boolean)'::regprocedure);
 definition:=replace(definition,'days=>(select mandate_valid_days from public.vet_settings)', 'days=>coalesce((a.snapshot->>''valid_days'')::integer,(select mandate_valid_days from public.vet_settings))');
 execute definition;
 definition:=pg_get_functiondef('public.vet_public_certificate_status(text)'::regprocedure);
 definition:=replace(definition,'where n.replaces_id=c.id and n.status=''issued'' limit 1', 'where n.replaces_id=c.id and n.status in (''issued'',''superseded'',''revoked'') order by n.issued_at desc limit 1');
 execute definition;
end $$;
