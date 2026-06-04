create or replace function public.enforce_entry_program_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_class_id uuid;
  active_rider_contact_id uuid;
  rider_entry_count integer;
begin
  if new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  select class_id into target_class_id
  from public.divisions
  where id = new.division_id;

  if target_class_id is null then
    return new;
  end if;

  if exists (
    select 1
    from public.entries e
    join public.divisions d on d.id = e.division_id
    where e.id <> new.id
      and e.horse_id = new.horse_id
      and d.class_id = target_class_id
      and e.status not in ('cancelled', 'scratched', 'scratched_pending_refund')
  ) then
    raise exception 'Un meme cheval ne peut etre inscrit qu''une fois par classe.';
  end if;

  active_rider_contact_id := coalesce(new.rider_contact_id, new.owner_contact_id);

  if active_rider_contact_id is not null then
    select count(*) into rider_entry_count
    from public.entries e
    where e.id <> new.id
      and e.division_id = new.division_id
      and coalesce(e.rider_contact_id, e.owner_contact_id) = active_rider_contact_id
      and e.status not in ('cancelled', 'scratched', 'scratched_pending_refund');

    if rider_entry_count >= 3 then
      raise exception 'Un cavalier ne peut pas etre inscrit plus de trois fois dans une meme division.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists entries_program_limits on public.entries;
create trigger entries_program_limits
before insert or update of horse_id, division_id, owner_contact_id, rider_contact_id, status on public.entries
for each row execute function public.enforce_entry_program_limits();
