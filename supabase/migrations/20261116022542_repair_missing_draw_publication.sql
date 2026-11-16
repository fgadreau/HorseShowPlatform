-- Restore only missing draw-publication objects. No entry or billing changes.
begin;
do $repair$ begin
 if to_regclass('public.block_draw_publications') is null then
 execute $ddl$

alter table public.blocks
  add column draw_version integer not null default 0,
  add column draw_published_version integer,
  add column draw_published_at timestamptz,
  add column draw_published_by_user_id uuid references public.user_profiles(id) on delete set null,
  add constraint blocks_draw_version_check check (draw_version >= 0),
  add constraint blocks_draw_published_version_check check (
    draw_published_version is null
    or (draw_published_version > 0 and draw_published_version <= draw_version)
  );

update public.blocks b
set draw_version = 1
where b.draw_prepared_at is not null
   or exists (
     select 1 from public.show_score_block_setups setup
     where setup.block_id = b.id and jsonb_array_length(setup.runs) > 0
   );

create table public.block_draw_publications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  block_id uuid not null references public.blocks(id) on delete cascade,
  version integer not null check (version > 0),
  runs jsonb not null check (jsonb_typeof(runs) = 'array'),
  judges jsonb not null default '[]'::jsonb check (jsonb_typeof(judges) = 'array'),
  published_by_user_id uuid not null references public.user_profiles(id),
  published_at timestamptz not null default clock_timestamp(),
  superseded_at timestamptz,
  unique (block_id, version)
);

create unique index block_draw_publications_current
  on public.block_draw_publications(block_id)
  where superseded_at is null;

create index block_draw_publications_show
  on public.block_draw_publications(show_id, block_id, version desc);

alter table public.block_draw_publications enable row level security;
revoke all on table public.block_draw_publications from public, anon, authenticated, service_role;
grant select on table public.block_draw_publications to anon, authenticated;

create policy "Current published draws are public"
  on public.block_draw_publications for select
  to anon, authenticated
  using (
    superseded_at is null
    or public.is_platform_admin()
    or public.is_org_member(organization_id, array['admin', 'secretary'])
    or public.has_show_role(show_id, array['secretary'])
  );

-- A public schedule does not make a draft draw public. ShowScore receives a
-- block setup only after this control room has published the draw, or while a
-- block is explicitly live through the existing ShowScore publication state.
create or replace function public.showscore_public_class_exists(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.blocks target_block
    where target_block.id = target_class_id
      and target_block.schedule_is_public = true
      and public.showscore_public_show_exists(target_block.show_id)
      and (
        exists (
          select 1
          from public.block_draw_publications publication
          where publication.block_id = target_block.id
            and publication.superseded_at is null
        )
        or exists (
          select 1
          from public.show_score_publication_states publication_state
          where publication_state.block_id = target_block.id
            and publication_state.status in (
              'live', 'live_no_score', 'live_scoring', 'live_finished', 'official', 'published'
            )
        )
      )
  );
$$;

create function public.mark_block_draw_generated(p_block uuid)
returns public.blocks
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.blocks;
begin
  select * into target from public.blocks where id = p_block for update;
  if not found or not (
    public.is_platform_admin()
    or public.is_org_member(target.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target.show_id, array['secretary'])
  ) then
    raise exception 'CONTROL_ROOM_FORBIDDEN' using errcode = '42501';
  end if;

  perform public.entry_draw_assert_ready(target.id);

  update public.blocks
  set draw_prepared_at = coalesce(draw_prepared_at, clock_timestamp()),
      draw_version = draw_version + 1
  where id = target.id
  returning * into target;

  return target;
end;
$$;

create function public.publish_block_draw(p_block uuid)
returns public.block_draw_publications
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.blocks;
  setup public.show_score_block_setups;
  publication public.block_draw_publications;
  actor uuid := public.current_profile_id();
begin
  select * into target from public.blocks where id = p_block for update;
  if actor is null or not found or not (
    public.is_platform_admin()
    or public.is_org_member(target.organization_id, array['admin', 'secretary'])
    or public.has_show_role(target.show_id, array['secretary'])
  ) then
    raise exception 'CONTROL_ROOM_FORBIDDEN' using errcode = '42501';
  end if;

  select * into setup
  from public.show_score_block_setups
  where block_id = target.id
  for update;

  if not found or jsonb_array_length(setup.runs) = 0 or target.draw_version <= 0 then
    raise exception 'CONTROL_ROOM_DRAW_NOT_READY';
  end if;

  select * into publication
  from public.block_draw_publications
  where block_id = target.id and version = target.draw_version;

  if not found then
    update public.block_draw_publications
    set superseded_at = clock_timestamp()
    where block_id = target.id and superseded_at is null;

    insert into public.block_draw_publications(
      organization_id,
      show_id,
      block_id,
      version,
      runs,
      judges,
      published_by_user_id
    ) values (
      target.organization_id,
      target.show_id,
      target.id,
      target.draw_version,
      setup.runs,
      coalesce(setup.judges, '[]'::jsonb),
      actor
    )
    returning * into publication;
  end if;

  update public.blocks
  set draw_published_version = draw_version,
      draw_published_at = publication.published_at,
      draw_published_by_user_id = publication.published_by_user_id,
      schedule_is_public = true
  where id = target.id;

  update public.shows
  set status = 'open',
      show_draw_public = true
  where id = target.show_id;

  -- Re-broadcast the exact setup now that public visibility is authorized.
  update public.show_score_block_setups
  set updated_at = clock_timestamp()
  where block_id = target.id;

  return publication;
end;
$$;


revoke all on function public.mark_block_draw_generated(uuid),public.publish_block_draw(uuid) from public,anon,authenticated,service_role;
grant execute on function public.mark_block_draw_generated(uuid),public.publish_block_draw(uuid) to authenticated;
$ddl$;
 end if;
end $repair$;
notify pgrst, 'reload schema';
commit;
