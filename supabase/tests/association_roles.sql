-- Fresh local fixtures only. No persistent role or account changes.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001'; member uuid;begin
  if (select count(*) from public.association_team(org))<2 then raise exception 'TEST team listing'; end if;
  begin perform public.association_team('30000000-0000-0000-0000-000000000002'); raise exception 'TEST cross association listing allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_association_team_role(org,'missing@example.test','admin',null); raise exception 'TEST missing account accepted'; exception when others then if sqlerrm<>'ASSOCIATION_ACCOUNT_NOT_FOUND' then raise; end if; end;
  begin perform public.set_association_team_role(org,'phase1.org-a-admin@example.test','secretary','admin'); raise exception 'TEST last admin demoted'; exception when others then if sqlerrm<>'LAST_ASSOCIATION_ADMIN' then raise; end if; end;
  select id into member from public.association_team(org) where role='admin';
  begin perform public.remove_association_team_member(org,member,'admin'); raise exception 'TEST last admin removed'; exception when others then if sqlerrm<>'LAST_ASSOCIATION_ADMIN' then raise; end if; end;
  perform public.set_association_team_role(org,'phase1.org-a-judge@example.test','scribe',null);
  if not exists(select 1 from public.association_memberships where association_id=org and user_id='10000000-0000-0000-0000-000000000005' and role='scribe') then raise exception 'TEST ShowScore shared role missing'; end if;
  begin perform public.set_association_team_role(org,'phase1.org-a-judge@example.test','admin',null); raise exception 'TEST stale overwrite accepted'; exception when others then if sqlerrm<>'ASSOCIATION_ROLE_CHANGED' then raise; end if; end;
end $$;
-- Neither operational role may acquire HSP management or administer the team.
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';begin
  if (public.billing_navigation_scope(org)->>'staff')::boolean or public.entry_lifecycle_staff(org,'40000000-0000-0000-0000-000000000001') then raise exception 'TEST scribe gained HSP management'; end if;
  begin perform public.association_team(org); raise exception 'TEST scribe team listing allowed'; exception when insufficient_privilege then null; end;
  begin perform public.set_association_team_role(org,'phase1.org-a-judge@example.test','admin','scribe'); raise exception 'TEST scribe escalation allowed'; exception when insufficient_privilege then null; end;
  -- Legacy compatibility-view writes must not bypass authorization.
  begin insert into public.association_memberships(user_id,association_id,role) values('10000000-0000-0000-0000-000000000005',org,'admin'); raise exception 'TEST legacy escalation allowed'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
select public.set_association_team_role('30000000-0000-0000-0000-000000000001','phase1.org-a-judge@example.test','announcer','scribe');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';begin
  if (public.billing_navigation_scope(org)->>'staff')::boolean or public.entry_lifecycle_staff(org,'40000000-0000-0000-0000-000000000001') then raise exception 'TEST announcer gained HSP management'; end if;
  begin perform public.set_association_team_role(org,'phase1.org-a-judge@example.test','admin','announcer'); raise exception 'TEST announcer escalation allowed'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
do $$begin
  begin perform public.set_association_team_role('30000000-0000-0000-0000-000000000001','phase1.org-a-judge@example.test','admin','announcer'); raise exception 'TEST secretary escalation allowed'; exception when insufficient_privilege then null; end;
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';member uuid;begin
  perform public.set_association_team_role(org,'phase1.org-a-judge@example.test','admin','announcer');
  perform public.set_association_team_role(org,'phase1.org-a-admin@example.test','secretary','admin');
end $$;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
do $$declare org uuid:='30000000-0000-0000-0000-000000000001';member uuid;begin
  select id into member from public.association_team(org) where email='phase1.org-a-admin@example.test';
  perform public.remove_association_team_member(org,member,'secretary');
  if exists(select 1 from public.association_team(org) where id=member) then raise exception 'TEST removed member still listed'; end if;
end $$;
reset role;
do $$begin
  if not exists(select 1 from public.user_profiles where user_id='10000000-0000-0000-0000-000000000002') then raise exception 'TEST account deleted'; end if;
end $$;
rollback;
