-- PREPROD already received the initial paid-warmup synchronization migration.
-- Keep an explicitly linked canonical block authoritative while continuing to
-- let legacy ShowScore rows create and maintain their own paid-warmup block.

create or replace function public.set_show_score_paid_warmup_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  block_record record;
begin
  new.block_id := coalesce(new.block_id, new.id);

  select b.block_type
  into block_record
  from public.blocks b
  where b.id = new.block_id;

  if found and block_record.block_type <> 'paid_warmup' then
    raise exception 'Paid warmup block % must have block_type paid_warmup', new.block_id
      using errcode = 'check_violation';
  end if;

  if found and new.block_id = new.id then
    update public.blocks
    set
      organization_id = new.organization_id,
      show_id = new.show_id,
      show_day_id = new.show_day_id,
      name = coalesce(nullif(btrim(new.name), ''), 'Paid warm up'),
      display_label = coalesce(nullif(btrim(new.name), ''), 'Paid warm up'),
      arena = new.arena,
      schedule_start_mode = coalesce(new.schedule_start_mode, 'after_previous'),
      scheduled_time = case
        when coalesce(new.schedule_start_mode, 'after_previous') = 'fixed'
          then nullif(new.schedule_start_time, '')::time
        else null
      end,
      sort_order = coalesce(new.sort_order, 1),
      updated_at = now()
    where id = new.block_id;
  elsif not found then
    insert into public.blocks (
      id,
      organization_id,
      show_id,
      show_day_id,
      name,
      display_label,
      block_type,
      arena,
      schedule_start_mode,
      scheduled_time,
      sort_order,
      schedule_status,
      schedule_is_public,
      results_are_public
    )
    values (
      new.block_id,
      new.organization_id,
      new.show_id,
      new.show_day_id,
      coalesce(nullif(btrim(new.name), ''), 'Paid warm up'),
      coalesce(nullif(btrim(new.name), ''), 'Paid warm up'),
      'paid_warmup',
      new.arena,
      coalesce(new.schedule_start_mode, 'after_previous'),
      case
        when coalesce(new.schedule_start_mode, 'after_previous') = 'fixed'
          then nullif(new.schedule_start_time, '')::time
        else null
      end,
      coalesce(new.sort_order, 1),
      'open',
      true,
      false
    );
  end if;

  select
    b.organization_id,
    b.show_id,
    b.show_day_id,
    b.name,
    b.arena,
    b.schedule_start_mode,
    b.scheduled_time,
    b.sort_order
  into block_record
  from public.blocks b
  where b.id = new.block_id;

  if new.active_entry_id is not null and not exists (
    select 1
    from public.entries e
    join public.classes c on c.id = e.class_id
    where e.id = new.active_entry_id
      and c.block_id = new.block_id
  ) then
    raise exception 'Active entry % does not belong to paid warmup block %', new.active_entry_id, new.block_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := block_record.organization_id;
  new.show_id := block_record.show_id;
  new.show_day_id := block_record.show_day_id;
  new.name := block_record.name;
  new.arena := block_record.arena;
  new.schedule_start_mode := block_record.schedule_start_mode;
  new.schedule_start_time := block_record.scheduled_time::text;
  new.sort_order := block_record.sort_order;
  return new;
end;
$$;

notify pgrst, 'reload schema';
