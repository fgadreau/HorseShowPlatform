-- Test-only opt-in for the original 1A fixtures. Never installed in application DBs.
do $$ begin
 if exists((select 'organization'::text,organization_id,to_jsonb(p) from public.billing_pilot_organizations p union all select 'context',context_id,to_jsonb(c) from public.billing_context_access c) except select scope,id,payload from public.billing_test_capability_baseline)
 or exists(select scope,id,payload from public.billing_test_capability_baseline except (select 'organization'::text,organization_id,to_jsonb(p) from public.billing_pilot_organizations p union all select 'context',context_id,to_jsonb(c) from public.billing_context_access c)) then raise exception 'Migration changed existing capability opt-ins'; end if;
end $$;
create function public.billing_test_enable_context() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.billing_pilot_organizations values(new.organization_id,true,true,true,1) on conflict do nothing;
 insert into public.billing_context_access(context_id,engine,personal,personal_history,checkout,closing_phase) values(new.id,true,true,true,true,true);
 return new;
end $$;
create trigger billing_test_opt_in after insert on public.billing_contexts for each row execute function public.billing_test_enable_context();
