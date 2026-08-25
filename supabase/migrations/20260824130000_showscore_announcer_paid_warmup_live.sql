-- Association-level announcers need read-only access to paid warmup setup and
-- a narrow write path for live state. Admin/secretary setup policies remain
-- unchanged; announcers never receive direct UPDATE access to the table.

drop policy if exists "Association announcers can view paid warmups"
  on public.show_score_paid_warmups;

create policy "Association announcers can view paid warmups"
  on public.show_score_paid_warmups for select
  to authenticated
  using (public.is_org_member(organization_id, array['announcer']));

create or replace function public.save_show_score_paid_warmup_live(
  target_paid_warmup_id uuid,
  target_is_public_live boolean default null,
  target_update_queue boolean default false,
  target_active_entry_id text default null,
  target_active_started_at timestamptz default null,
  target_entries jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_warmup public.show_score_paid_warmups%rowtype;
  updated_warmup public.show_score_paid_warmups%rowtype;
  current_queue_identity jsonb;
  target_queue_identity jsonb;
begin
  select *
  into current_warmup
  from public.show_score_paid_warmups
  where id = target_paid_warmup_id
  for update;

  if not found then
    raise exception 'Paid warmup % does not exist', target_paid_warmup_id
      using errcode = 'no_data_found';
  end if;

  if not (
    public.is_platform_admin()
    or public.is_org_member(
      current_warmup.organization_id,
      array['admin', 'secretary', 'announcer']
    )
    or public.has_show_role(
      current_warmup.show_id,
      array['organizer', 'secretary', 'announcer']
    )
  ) then
    raise exception 'Insufficient permissions for paid warmup live management'
      using errcode = 'insufficient_privilege';
  end if;

  if target_update_queue then
    if target_entries is null or jsonb_typeof(target_entries) <> 'array' then
      raise exception 'Paid warmup live entries must be an array'
        using errcode = 'check_violation';
    end if;

    select coalesce(
      jsonb_agg(entry.value - 'status' - 'completedAt' order by entry.ordinality),
      '[]'::jsonb
    )
    into current_queue_identity
    from jsonb_array_elements(coalesce(current_warmup.entries, '[]'::jsonb))
      with ordinality as entry(value, ordinality);

    select coalesce(
      jsonb_agg(entry.value - 'status' - 'completedAt' order by entry.ordinality),
      '[]'::jsonb
    )
    into target_queue_identity
    from jsonb_array_elements(target_entries)
      with ordinality as entry(value, ordinality);

    if current_queue_identity is distinct from target_queue_identity then
      raise exception 'Announcers cannot change the paid warmup draw'
        using errcode = 'insufficient_privilege';
    end if;

    if exists (
      select 1
      from jsonb_array_elements(target_entries) entry
      where coalesce(entry ->> 'status', 'pending') not in (
        'pending', 'done', 'no_show', 'scratch'
      )
    ) then
      raise exception 'Invalid paid warmup live entry status'
        using errcode = 'check_violation';
    end if;
  end if;

  update public.show_score_paid_warmups
  set
    is_public_live = coalesce(
      target_is_public_live,
      current_warmup.is_public_live
    ),
    active_entry_id = case
      when target_update_queue then target_active_entry_id
      else current_warmup.active_entry_id
    end,
    active_started_at = case
      when target_update_queue then target_active_started_at
      else current_warmup.active_started_at
    end,
    entries = case
      when target_update_queue then target_entries
      else current_warmup.entries
    end
  where id = target_paid_warmup_id
  returning * into updated_warmup;

  return to_jsonb(updated_warmup);
end;
$$;

revoke all on function public.save_show_score_paid_warmup_live(
  uuid,
  boolean,
  boolean,
  text,
  timestamptz,
  jsonb
) from public, anon;

grant execute on function public.save_show_score_paid_warmup_live(
  uuid,
  boolean,
  boolean,
  text,
  timestamptz,
  jsonb
) to authenticated;

notify pgrst, 'reload schema';
