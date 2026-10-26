-- Platform administrators own HSP pricing. No amount, charge or invoice changes.
begin;
create or replace function public.set_billing_hsp_fee(p_scope text,p_id uuid,p_amount numeric,p_note text default null) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; rowdata jsonb;
begin
 if public.current_profile_id() is null or not coalesce(public.is_platform_admin(),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_scope is null then raise exception 'BILLING_INVALID_SCOPE'; end if;
 if p_scope='association' then select id into org from public.organizations where id=p_id;
 elsif p_scope='show' then select organization_id into org from public.shows where id=p_id;
 elsif p_scope<>'platform' then raise exception 'BILLING_INVALID_SCOPE'; end if;
 if (p_scope<>'platform' and org is null) or (p_scope='platform' and (p_id<>'00000000-0000-0000-0000-000000000000' or p_amount is null or p_amount<=0)) or p_amount<0 or p_amount<>round(p_amount,2) or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'BILLING_INVALID_AMOUNT'; end if;
 insert into public.billing_hsp_fee_settings(scope,scope_id,amount,note,changed_by) values(p_scope,p_id,p_amount,p_note,public.current_profile_id())
 on conflict(scope,scope_id) do update set amount=excluded.amount,note=excluded.note,changed_by=excluded.changed_by,changed_at=clock_timestamp()
 returning to_jsonb(billing_hsp_fee_settings.*) into rowdata;
 insert into public.billing_hsp_fee_setting_events(setting) values(rowdata);
end $$;
create or replace function public.get_billing_hsp_fee_settings(p_org uuid,p_show uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.current_profile_id() is null or not coalesce(public.is_platform_admin(),false) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_org is null or not exists(select 1 from public.organizations where id=p_org) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 if p_show is not null and not exists(select 1 from public.shows where id=p_show and organization_id=p_org) then raise exception 'BILLING_FORBIDDEN' using errcode='42501'; end if;
 return jsonb_build_object('platform_admin',true,'settings',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.billing_hsp_fee_settings s where scope='platform' or (scope='association' and scope_id=p_org) or (scope='show' and scope_id=p_show)));
end $$;
revoke all on function public.set_billing_hsp_fee(text,uuid,numeric,text),public.get_billing_hsp_fee_settings(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_billing_hsp_fee(text,uuid,numeric,text),public.get_billing_hsp_fee_settings(uuid,uuid) to authenticated;
commit;
