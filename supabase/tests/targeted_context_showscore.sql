\set ON_ERROR_STOP on

begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['shows', 'show_days', 'blocks', 'classes', 'entries'] loop
    if not has_table_privilege('authenticated', format('public.%I', table_name), 'select') then
      raise exception 'authenticated is missing SELECT on public.%', table_name;
    end if;
  end loop;

  raise notice 'ok - authenticated application tables reach their RLS policies';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare
  unexpected_rows integer;
begin
  perform *
  from public.shows
  where organization_id = '30000000-0000-0000-0000-000000000002';

  select count(*) into unexpected_rows
  from public.blocks
  where organization_id <> '30000000-0000-0000-0000-000000000002';

  if unexpected_rows <> 0 then
    raise exception 'Organization B staff unexpectedly loaded blocks from another association';
  end if;

  if not public.can_view_show_score_class('50000000-0000-0000-0000-000000000003') then
    raise exception 'ShowScore block compatibility helper did not authorize the organization block';
  end if;

  perform public.showscore_public_show_exists('40000000-0000-0000-0000-000000000002');
  perform * from public.global_pattern_timing_stats(60);
  perform * from public.public_show_timing_summary('40000000-0000-0000-0000-000000000002', 60);

  raise notice 'ok - targeted context and ShowScore compatibility functions execute';
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1
    from pg_proc function_record
    join pg_namespace namespace_record on namespace_record.oid = function_record.pronamespace
    where namespace_record.nspname = 'public'
      and function_record.proname in (
        'global_pattern_timing_stats',
        'public_show_timing_summary',
        'showscore_public_show_exists',
        'showscore_public_class_exists',
        'showscore_public_live_class_exists'
      )
      and function_record.prokind <> 'a'
      and (
        pg_get_functiondef(function_record.oid) like '%publication.class_id%'
        or pg_get_functiondef(function_record.oid) like '%public.show_score_class_setups%'
      )
  ) then
    raise exception 'A live ShowScore compatibility function still references renamed class fields';
  end if;

  raise notice 'ok - active ShowScore public/timing functions use canonical block references';
end;
$$;

rollback;
