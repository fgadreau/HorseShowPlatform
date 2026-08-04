-- Make "after previous" an explicit schedule dependency. Existing rows keep
-- working: when a predecessor can be inferred from their current day/arena
-- ordering it is backfilled, otherwise the legacy null fallback is preserved.

alter table public.blocks
  add column if not exists follows_block_id uuid
    references public.blocks(id) on delete set null;

with ordered_blocks as (
  select
    block.id,
    lag(block.id) over (
      partition by
        block.show_id,
        block.show_day_id,
        coalesce(nullif(lower(btrim(block.arena)), ''), '__no_arena__')
      order by
        case when block.schedule_start_mode = 'fixed' and block.scheduled_time is not null then 0 else 1 end,
        block.scheduled_time nulls last,
        block.sort_order,
        block.id
    ) as previous_block_id
  from public.blocks block
)
update public.blocks block
set follows_block_id = ordered.previous_block_id
from ordered_blocks ordered
where ordered.id = block.id
  and block.schedule_start_mode = 'after_previous'
  and block.follows_block_id is null
  and ordered.previous_block_id is not null;

create or replace function public.validate_block_schedule_dependency()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  predecessor public.blocks%rowtype;
begin
  if new.schedule_start_mode <> 'after_previous' then
    new.follows_block_id := null;
    return new;
  end if;

  -- Null remains accepted for legacy ShowScore writers. HSP requires an
  -- explicit predecessor for every new or edited after_previous block.
  if new.follows_block_id is null then
    return new;
  end if;

  if new.follows_block_id = new.id then
    raise exception 'A block cannot follow itself'
      using errcode = 'check_violation';
  end if;

  select block.*
  into predecessor
  from public.blocks block
  where block.id = new.follows_block_id;

  if not found then
    raise exception 'The preceding block % does not exist', new.follows_block_id
      using errcode = 'foreign_key_violation';
  end if;

  if predecessor.organization_id <> new.organization_id
    or predecessor.show_id <> new.show_id
    or predecessor.show_day_id is distinct from new.show_day_id
    or coalesce(nullif(lower(btrim(predecessor.arena)), ''), '__no_arena__')
       <> coalesce(nullif(lower(btrim(new.arena)), ''), '__no_arena__') then
    raise exception 'A block must follow a block from the same show day and arena'
      using errcode = 'check_violation';
  end if;

  if exists (
    with recursive ancestors as (
      select block.id, block.follows_block_id
      from public.blocks block
      where block.id = new.follows_block_id
      union all
      select block.id, block.follows_block_id
      from public.blocks block
      join ancestors ancestor on block.id = ancestor.follows_block_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'Block schedule dependencies cannot form a cycle'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists blocks_validate_schedule_dependency on public.blocks;
create trigger blocks_validate_schedule_dependency
  before insert or update of organization_id, show_id, show_day_id, arena,
    schedule_start_mode, follows_block_id
  on public.blocks
  for each row execute function public.validate_block_schedule_dependency();

create index if not exists blocks_follows_block_idx
  on public.blocks(follows_block_id)
  where follows_block_id is not null;

notify pgrst, 'reload schema';
