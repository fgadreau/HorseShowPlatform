\set ON_ERROR_STOP on

begin;

\ir ../seed.sql

insert into public.show_score_paid_warmups (
  id,
  organization_id,
  show_id,
  show_day_id,
  name,
  entries,
  sort_order
)
values (
  '59000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001',
  'Announcer visibility warmup',
  '[{"id":"entry-1","order":1,"rider":"Rider One","status":"pending","completedAt":null}]'::jsonb,
  1
);

update public.organization_members
set role = 'announcer'
where organization_id = '30000000-0000-0000-0000-000000000001'
  and user_id = '20000000-0000-0000-0000-000000000003';

delete from public.show_roles
where show_id = '40000000-0000-0000-0000-000000000001'
  and user_id = '20000000-0000-0000-0000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  saved_warmup jsonb;
begin
  if not exists (
    select 1 from public.show_score_paid_warmups
    where id = '59000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'Association announcer cannot read its paid warmup';
  end if;

  saved_warmup := public.save_show_score_paid_warmup_live(
    '59000000-0000-0000-0000-000000000001',
    true,
    true,
    'entry-1',
    now(),
    '[{"id":"entry-1","order":1,"rider":"Rider One","status":"done","completedAt":"2026-08-26T12:00:00.000Z"}]'::jsonb
  );

  if saved_warmup ->> 'active_entry_id' <> 'entry-1'
    or (saved_warmup ->> 'is_public_live')::boolean is not true
    or saved_warmup #>> '{entries,0,status}' <> 'done'
  then
    raise exception 'Announcer live update was not persisted: %', saved_warmup;
  end if;

  begin
    perform public.save_show_score_paid_warmup_live(
      '59000000-0000-0000-0000-000000000001',
      true,
      true,
      null,
      null,
      '[{"id":"entry-1","order":1,"rider":"Changed Rider","status":"pending","completedAt":null}]'::jsonb
    );
    raise exception 'Announcer changed the paid warmup draw';
  exception
    when insufficient_privilege then
      null;
  end;
end;
$$;

rollback;
