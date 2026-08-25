\set ON_ERROR_STOP on

begin;

\ir ../seed.sql

-- ShowScore onboarding creates an association and links the caller as admin.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.create_association_with_owner(
  '49400000-0000-0000-0000-000000000001',
  'ShowScore association write test',
  'SSWT',
  'America/Toronto',
  null,
  null,
  '[]'::jsonb
);

select public.showscore_update_organization_profile(
  '49400000-0000-0000-0000-000000000001',
  'ShowScore association write confirmed',
  'SSWT',
  'America/Toronto',
  null,
  null,
  '[]'::jsonb,
  false
);

do $$
begin
  if not exists (
    select 1
    from public.organizations organization_record
    join public.organization_members membership
      on membership.organization_id = organization_record.id
    join public.user_profiles profile
      on profile.id = membership.user_id
    where organization_record.id = '49400000-0000-0000-0000-000000000001'
      and organization_record.name = 'ShowScore association write confirmed'
      and profile.user_id = '10000000-0000-0000-0000-000000000004'
      and membership.role = 'admin'
  ) then
    raise exception 'ShowScore association create/update was not persisted';
  end if;
end;
$$;

-- Reproduce an association-only secretary without a direct show assignment.
delete from public.show_roles
where user_id = '20000000-0000-0000-0000-000000000003';

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.shows (
  id, organization_id, name, slug, start_date, end_date, status
)
values (
  '49000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  'ShowScore secretary write test',
  'showscore-secretary-write-test',
  '2026-08-26',
  '2026-08-26',
  'draft'
);

insert into public.blocks (
  id, organization_id, show_id, show_day_id, name, display_label,
  block_type, sort_order
)
values (
  '49200000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '49000000-0000-0000-0000-000000000001',
  (
    select id from public.show_days
    where show_id = '49000000-0000-0000-0000-000000000001'
      and day_date = '2026-08-26'
  ),
  'ShowScore block',
  'ShowScore block',
  'competition',
  1
);

insert into public.show_score_paid_warmups (
  id, organization_id, show_id, show_day_id, name, entries, sort_order
)
values (
  '49300000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '49000000-0000-0000-0000-000000000001',
  (
    select id from public.show_days
    where show_id = '49000000-0000-0000-0000-000000000001'
      and day_date = '2026-08-26'
  ),
  'ShowScore paid warmup',
  '[{"id":"entry-1","order":1,"rider":"Rider One","status":"pending","completedAt":null}]'::jsonb,
  2
);

update public.shows
set name = 'ShowScore secretary write confirmed'
where id = '49000000-0000-0000-0000-000000000001';

update public.show_days
set day_name = 'Mercredi'
where show_id = '49000000-0000-0000-0000-000000000001'
  and day_date = '2026-08-26';

update public.blocks
set display_label = 'Bloc ShowScore confirmé'
where id = '49200000-0000-0000-0000-000000000001';

do $$
begin
  if not exists (
    select 1 from public.shows
    where id = '49000000-0000-0000-0000-000000000001'
      and name = 'ShowScore secretary write confirmed'
  ) then
    raise exception 'Secretary show write was not persisted';
  end if;

  if not exists (
    select 1 from public.show_days
    where show_id = '49000000-0000-0000-0000-000000000001'
      and day_date = '2026-08-26'
      and day_name = 'Mercredi'
  ) then
    raise exception 'Secretary show-day write was not persisted';
  end if;

  if not exists (
    select 1 from public.blocks
    where id = '49200000-0000-0000-0000-000000000001'
      and display_label = 'Bloc ShowScore confirmé'
  ) then
    raise exception 'Secretary block write was not persisted';
  end if;

  if not exists (
    select 1 from public.show_score_paid_warmups
    where id = '49300000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Secretary paid-warmup write was not persisted';
  end if;
end;
$$;

rollback;
