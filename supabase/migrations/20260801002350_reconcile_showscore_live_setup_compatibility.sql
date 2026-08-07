-- PROD received these ShowScore fields through the original manual rollout,
-- before HSP owned the shared migration chain. Reconcile that existing schema
-- without discarding any setup or approval data.

drop trigger if exists stamp_show_score_live_source_change
  on public.show_score_block_setups;
drop function if exists public.stamp_show_score_live_source_change();

alter table public.show_score_block_setups
  add column if not exists set_approval_mode text,
  add column if not exists set_approvals jsonb,
  add column if not exists live_data_source text,
  add column if not exists live_display_mode text,
  add column if not exists qualified_rider_count integer,
  add column if not exists live_source_changed_at timestamptz,
  add column if not exists live_source_changed_by text;

alter table public.show_score_block_setups
  alter column live_source_changed_by type text
    using live_source_changed_by::text;

update public.show_score_block_setups
set
  set_approval_mode = coalesce(set_approval_mode, 'class_end'),
  set_approvals = coalesce(set_approvals, '[]'::jsonb),
  live_data_source = coalesce(live_data_source, 'scribe'),
  live_display_mode = coalesce(live_display_mode, 'full');

alter table public.show_score_block_setups
  alter column set_approval_mode set default 'class_end',
  alter column set_approval_mode set not null,
  alter column set_approvals set default '[]'::jsonb,
  alter column set_approvals set not null,
  alter column live_data_source set default 'scribe',
  alter column live_data_source set not null,
  alter column live_display_mode set default 'full',
  alter column live_display_mode set not null;

alter table public.show_score_block_setups
  drop constraint if exists show_score_class_setups_set_approval_mode_check,
  drop constraint if exists show_score_class_setups_live_data_source_check,
  drop constraint if exists show_score_class_setups_live_display_mode_check,
  drop constraint if exists show_score_class_setups_qualified_rider_count_check,
  drop constraint if exists show_score_block_setups_set_approval_mode_check,
  drop constraint if exists show_score_block_setups_live_data_source_check,
  drop constraint if exists show_score_block_setups_live_display_mode_check,
  drop constraint if exists show_score_block_setups_qualified_rider_count_check;

alter table public.show_score_block_setups
  add constraint show_score_block_setups_set_approval_mode_check
    check (set_approval_mode in ('class_end', 'per_set')),
  add constraint show_score_block_setups_live_data_source_check
    check (live_data_source in ('scribe', 'announcer')),
  add constraint show_score_block_setups_live_display_mode_check
    check (live_display_mode in ('full', 'order_only')),
  add constraint show_score_block_setups_qualified_rider_count_check
    check (qualified_rider_count is null or qualified_rider_count > 0);

alter table public.show_score_judge_sessions
  add column if not exists set_approvals jsonb;

update public.show_score_judge_sessions
set set_approvals = '[]'::jsonb
where set_approvals is null;

alter table public.show_score_judge_sessions
  alter column set_approvals set default '[]'::jsonb,
  alter column set_approvals set not null;

drop function if exists public.set_show_score_live_display_mode(uuid, text);
create function public.set_show_score_live_display_mode(
  target_class_id uuid,
  target_mode text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if target_mode not in ('full', 'order_only') then
    raise exception 'Invalid ShowScore live display mode'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.show_score_block_setups (block_id, live_display_mode)
  values (target_class_id, target_mode)
  on conflict (block_id) do update
  set live_display_mode = excluded.live_display_mode,
      updated_at = now();
end;
$$;

drop function if exists public.set_show_score_live_data_source(uuid, text);
create function public.set_show_score_live_data_source(
  target_class_id uuid,
  target_source text
)
returns void
language plpgsql
set search_path = public
as $$
begin
  if target_source not in ('scribe', 'announcer') then
    raise exception 'Invalid ShowScore live data source'
      using errcode = 'invalid_parameter_value';
  end if;

  insert into public.show_score_block_setups (
    block_id,
    live_data_source,
    live_source_changed_at,
    live_source_changed_by
  )
  values (
    target_class_id,
    target_source,
    now(),
    auth.email()
  )
  on conflict (block_id) do update
  set live_data_source = excluded.live_data_source,
      live_source_changed_at = excluded.live_source_changed_at,
      live_source_changed_by = excluded.live_source_changed_by,
      updated_at = now();
end;
$$;

revoke all on function public.set_show_score_live_display_mode(uuid, text)
  from public, anon;
revoke all on function public.set_show_score_live_data_source(uuid, text)
  from public, anon;
grant execute on function public.set_show_score_live_display_mode(uuid, text)
  to authenticated;
grant execute on function public.set_show_score_live_data_source(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
