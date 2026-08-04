-- Complete the ShowScore setup contract that predates the canonical block
-- naming. RPC argument names remain legacy-compatible for the deployed client.

alter table public.show_score_block_setups
  add column set_approval_mode text not null default 'class_end',
  add column set_approvals jsonb not null default '[]'::jsonb,
  add column live_data_source text not null default 'scribe',
  add column live_display_mode text not null default 'full',
  add column qualified_rider_count integer,
  add column live_source_changed_at timestamptz,
  add column live_source_changed_by text;

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
  add column set_approvals jsonb not null default '[]'::jsonb;

create or replace function public.set_show_score_live_display_mode(
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

create or replace function public.set_show_score_live_data_source(
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

grant execute on function public.set_show_score_live_display_mode(uuid, text)
  to authenticated;
grant execute on function public.set_show_score_live_data_source(uuid, text)
  to authenticated;

notify pgrst, 'reload schema';
