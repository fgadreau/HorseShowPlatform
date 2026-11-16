begin;
-- Return identifiers only, not another booker's reservation or billing details.
create function public.entry_stabled_horses(p_show uuid) returns table(horse_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare org uuid;begin
 select organization_id into org from public.shows where id=p_show;
 if public.current_profile_id() is null or org is null then raise exception 'ENTRY_HORSES_FORBIDDEN' using errcode='42501';end if;
 return query select distinct b.horse_id from public.stall_bookings b
 join public.stall_options o on o.id=b.stall_option_id and o.show_id=b.show_id and o.organization_id=b.organization_id
 where b.show_id=p_show and b.organization_id=org and b.horse_id is not null
 and b.status<>'cancelled' and b.quantity>0 and b.affects_inventory
 and coalesce(o.category,'stall')='stall' and o.requires_horse_assignment
 and lower(concat_ws(' ',o.name,o.description)) not like '%tack%'
 and (public.house_rules_staff(org) or public.has_show_role(p_show,array['secretary']) or public.can_access_horse(b.horse_id));
end $$;
revoke all on function public.entry_stabled_horses(uuid) from public,anon,authenticated,service_role;
grant execute on function public.entry_stabled_horses(uuid) to authenticated;

alter table public.house_class_rules add column excluded_membership_type_ids uuid[] not null default '{}';
-- Extend the existing rule scope guard without changing its other validations.
do $$declare source text;changed text;begin
 select pg_get_functiondef('public.house_rule_scope_guard()'::regprocedure) into source;
 changed:=replace(source,' new.updated_at:=clock_timestamp();return new;',
 ' if exists(select 1 from unnest(new.excluded_membership_type_ids) selected_id where not exists(select 1 from public.organization_membership_types mt where mt.id=selected_id and mt.organization_id=org)) then raise exception ''HOUSE_MEMBERSHIP_TYPE_INVALID_SCOPE'';end if;
 new.updated_at:=clock_timestamp();return new;');
 if changed=source then raise exception 'HOUSE_RULE_SCOPE_CONTRACT_CHANGED';end if;execute changed;
 select pg_get_functiondef('public.house_class_assessment(uuid,uuid,uuid)'::regprocedure) into source;
 changed:=replace(source,' if r.minimum_age is not null or r.maximum_age is not null then',
 ' if exists(select 1 from public.contact_organization_memberships m
 join public.organization_membership_types held on held.id=m.membership_type_id and held.organization_id=m.organization_id
 where m.organization_id=c.organization_id and m.contact_id=p_rider and m.status=''active'' and s.start_date between m.valid_from and m.valid_until
 and exists(select 1 from public.organization_membership_types selected_type where selected_type.id=any(r.excluded_membership_type_ids) and selected_type.organization_id=c.organization_id
 and (selected_type.id=held.id or (nullif(btrim(selected_type.code),'''') is not null and upper(btrim(selected_type.code))=upper(btrim(held.code))))))
 then reasons:=reasons||jsonb_build_array(''Le cavalier détient un type de carte de membre incompatible avec cette classe.'');end if;
 if r.minimum_age is not null or r.maximum_age is not null then');
 if changed=source then raise exception 'HOUSE_ASSESSMENT_CONTRACT_CHANGED';end if;execute changed;
end $$;
notify pgrst,'reload schema';
commit;
