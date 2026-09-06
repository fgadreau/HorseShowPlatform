-- The authorized issuer is the requesting personal HSP account, never a device or all clinic staff.
alter table public.vet_signature_authorizations alter column attestation set default
 'J’autorise le compte personnel HSP identifié ci-dessus, au sein de cette clinique, à apposer automatiquement ma signature électronique sur les certificats de vaccination dont je suis le vétérinaire responsable. J’atteste que seuls des renseignements exacts concernant les vaccinations administrées doivent être émis en mon nom. Cette autorisation est révocable et ne s’étend pas aux autres comptes de la clinique.';
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.vet_request_authorization(uuid,text,text,text)'::regprocedure);
 definition:=replace(definition,'where practitioner_id=p.id and status=''pending''','where practitioner_id=p.id and requested_by=public.current_profile_id() and status=''pending''');
 definition:=replace(definition,'''verification'',to_jsonb(v))','''verification'',to_jsonb(v),''authorized_account_id'',public.current_profile_id(),''authorized_account_name'',(select coalesce(nullif(btrim(concat_ws('' '',first_name,last_name)),''''),nullif(display_name,''''),''Compte personnel HSP'') from public.user_profiles where id=public.current_profile_id()))');
 execute definition;
 definition:=pg_get_functiondef('public.vet_authorization_summary(text)'::regprocedure);
 definition:=replace(definition,'''clinic'',a.snapshot->>''clinic'',','''authorized_account_name'',coalesce(a.snapshot->>''authorized_account_name'',(select coalesce(nullif(btrim(concat_ws('' '',first_name,last_name)),''''),nullif(display_name,''''),''Compte personnel HSP'') from public.user_profiles where id=a.requested_by)),''clinic'',a.snapshot->>''clinic'',');
 execute definition;
 definition:=pg_get_functiondef('public.vet_issue_certificate(uuid)'::regprocedure);
 definition:=replace(definition,'where practitioner_id=c.practitioner_id and issuer_id=c.issuer_id and status=''active''',
 'where practitioner_id=c.practitioner_id and issuer_id=c.issuer_id and requested_by=public.current_profile_id() and status=''active''');
 execute definition;
end $$;
