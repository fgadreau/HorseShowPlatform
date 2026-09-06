-- Staff cannot turn the ordinary consent flow into an administrator simulation.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.vet_request_authorization(uuid,text,text,text)'::regprocedure);
 definition:=replace(definition,'select * into p from public.vet_practitioners',
 'if p_method is null or p_method not in (''clinic_device'',''personal_link'') then raise exception ''VET_AUTHORIZATION_METHOD_INVALID'';end if; select * into p from public.vet_practitioners');
 execute definition;
end $$;
