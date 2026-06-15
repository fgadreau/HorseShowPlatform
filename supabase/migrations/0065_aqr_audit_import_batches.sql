create table if not exists public.entry_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  source text not null default 'showscore_draw_aqr_audit',
  status text not null default 'created' check (status in ('created', 'cleaned', 'failed')),
  created_by_user_id uuid,
  summary jsonb not null default '{}'::jsonb,
  source_run_snapshots jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  cleaned_at timestamptz
);

create index if not exists idx_entry_import_batches_show
on public.entry_import_batches(show_id, source, status);

alter table public.entry_import_batches enable row level security;

drop policy if exists "Staff can view entry import batches" on public.entry_import_batches;
create policy "Staff can view entry import batches"
  on public.entry_import_batches for select
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']));

drop policy if exists "Staff can manage entry import batches" on public.entry_import_batches;
create policy "Staff can manage entry import batches"
  on public.entry_import_batches for all
  to authenticated
  using (public.can_manage_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show(show_id, array['organizer', 'secretary']));

alter table public.entries
  add column if not exists import_source text,
  add column if not exists import_batch_id uuid references public.entry_import_batches(id) on delete set null,
  add column if not exists external_source_key text,
  add column if not exists source_payload jsonb not null default '{}'::jsonb;

create index if not exists idx_entries_import_batch_id
on public.entries(import_batch_id);

create unique index if not exists idx_entries_import_source_key
on public.entries(organization_id, show_id, import_source, external_source_key)
where import_source is not null and external_source_key is not null;

alter table public.payout_calculations
  add column if not exists import_batch_id uuid references public.entry_import_batches(id) on delete set null;

create index if not exists idx_payout_calculations_import_batch_id
on public.payout_calculations(import_batch_id);

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
  if new.import_source = 'showscore_draw_aqr_audit' then
    return new;
  end if;

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

create or replace function public.enforce_entry_coggins_health()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.import_source = 'showscore_draw_aqr_audit' then
    return new;
  end if;

  if new.status in ('cancelled', 'scratched', 'scratched_pending_refund') then
    return new;
  end if;

  perform public.assert_horse_health_valid_for_show(new.horse_id, new.show_id);
  return new;
end;
$$;
