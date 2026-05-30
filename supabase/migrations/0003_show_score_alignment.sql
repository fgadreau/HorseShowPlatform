alter table public.organizations
add column if not exists short_name varchar(100),
add column if not exists legacy_showscore_association_id text;

alter table public.shows
add column if not exists venue varchar(255),
add column if not exists legacy_showscore_show_id text;

alter table public.show_days
add column if not exists sort_order integer not null default 1,
add column if not exists legacy_showscore_day_id text;

alter table public.classes
add column if not exists arena varchar(100),
add column if not exists pattern text,
add column if not exists custom_pattern jsonb,
add column if not exists judge_name varchar(255),
add column if not exists sort_order integer not null default 1,
add column if not exists legacy_showscore_class_id text;

create unique index if not exists idx_organizations_legacy_showscore_association_id
on public.organizations(legacy_showscore_association_id)
where legacy_showscore_association_id is not null;

create unique index if not exists idx_shows_legacy_showscore_show_id
on public.shows(legacy_showscore_show_id)
where legacy_showscore_show_id is not null;

create unique index if not exists idx_show_days_legacy_showscore_day_id
on public.show_days(legacy_showscore_day_id)
where legacy_showscore_day_id is not null;

create unique index if not exists idx_classes_legacy_showscore_class_id
on public.classes(legacy_showscore_class_id)
where legacy_showscore_class_id is not null;

create index if not exists idx_show_days_sort_order
on public.show_days(show_id, sort_order);

create index if not exists idx_classes_sort_order
on public.classes(show_id, show_day_id, sort_order);

create or replace function public.can_view_show_score_show(target_show_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = target_show_id
      and (
        public.is_platform_admin()
        or public.is_org_member(s.organization_id, array['admin', 'secretary'])
        or public.has_show_role(
          s.id,
          array['organizer', 'secretary', 'judge', 'scribe', 'announcer']
        )
      )
  )
$$;

create or replace function public.can_manage_show_score_show(
  target_show_id uuid,
  accepted_show_roles text[] default array['organizer', 'secretary']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.shows s
    where s.id = target_show_id
      and (
        public.is_platform_admin()
        or public.is_org_member(s.organization_id, array['admin', 'secretary'])
        or public.has_show_role(s.id, accepted_show_roles)
      )
  )
$$;

create or replace function public.can_view_show_score_class(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and public.can_view_show_score_show(c.show_id)
  )
$$;

create or replace function public.can_manage_show_score_class(
  target_class_id uuid,
  accepted_show_roles text[] default array['organizer', 'secretary']
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and public.can_manage_show_score_show(c.show_id, accepted_show_roles)
  )
$$;

create table if not exists public.show_score_class_setups (
  class_id uuid primary key references public.classes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  show_day_id uuid references public.show_days(id) on delete set null,
  pattern text,
  custom_pattern jsonb,
  runs jsonb not null default '[]'::jsonb,
  schedule_details jsonb not null default '{}'::jsonb,
  judges jsonb not null default '[{"id":"judge-1","name":"","order":1}]'::jsonb,
  is_draw_imported boolean not null default false,
  started_at timestamptz,
  drag_interval integer,
  drag_duration_minutes integer not null default 8,
  locked_at timestamptz,
  locked_by_user_id uuid references public.user_profiles(id) on delete set null,
  locked_by_label text,
  finalized boolean not null default false,
  finalized_at timestamptz,
  finalized_by_user_id uuid references public.user_profiles(id) on delete set null,
  legacy_showscore_class_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.show_score_scoring_sessions (
  class_id uuid primary key references public.classes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  runs jsonb not null default '[]'::jsonb,
  active_manoeuvre jsonb,
  started_at timestamptz,
  legacy_showscore_class_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.show_score_judge_sessions (
  class_id uuid not null references public.classes(id) on delete cascade,
  judge_id text not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  judge_user_id uuid references public.user_profiles(id) on delete set null,
  judge_name text,
  claimed_by_user_id uuid references public.user_profiles(id) on delete set null,
  claimed_by_email text,
  claimed_at timestamptz,
  runs jsonb not null default '[]'::jsonb,
  active_manoeuvre jsonb,
  judge_signature text,
  finalized boolean not null default false,
  finalized_at timestamptz,
  judge_signed_at timestamptz,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (class_id, judge_id)
);

create table if not exists public.show_score_official_results (
  class_id uuid primary key references public.classes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  judge_name text,
  judge_signature text,
  finalized boolean not null default false,
  finalized_at timestamptz,
  judge_signed_at timestamptz,
  secretariat_validated_at timestamptz,
  secretariat_validated_by_user_id uuid references public.user_profiles(id) on delete set null,
  final_pdf_file_name text,
  custom_pattern jsonb,
  official_runs jsonb not null default '[]'::jsonb,
  legacy_showscore_class_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.show_score_publication_states (
  class_id uuid primary key references public.classes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  status text not null default 'hidden' check (status in ('hidden', 'live', 'pending_review', 'official', 'published')),
  published_at timestamptz,
  published_by_user_id uuid references public.user_profiles(id) on delete set null,
  public_url text,
  visible_fields jsonb not null default '["draw","backNumber","rider","horse","owner","scoreTotal","status"]'::jsonb,
  legacy_showscore_class_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.show_score_paid_warmups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  show_id uuid not null references public.shows(id) on delete cascade,
  show_day_id uuid not null references public.show_days(id) on delete cascade,
  name text not null,
  duration_minutes_per_rider integer not null default 5,
  drag_interval integer,
  drag_duration_minutes integer not null default 8,
  is_public_live boolean not null default false,
  active_entry_id uuid references public.entries(id) on delete set null,
  active_started_at timestamptz,
  entries jsonb not null default '[]'::jsonb,
  sort_order integer not null default 1,
  legacy_showscore_paid_warmup_id text,
  legacy_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_show_score_class_setup_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_record record;
begin
  select c.organization_id, c.show_id, c.show_day_id
  into class_record
  from public.classes c
  where c.id = new.class_id;

  if not found then
    raise exception 'Class % does not exist', new.class_id using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := class_record.organization_id;
  new.show_id := class_record.show_id;
  new.show_day_id := class_record.show_day_id;

  return new;
end;
$$;

create or replace function public.set_show_score_class_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class_record record;
begin
  select c.organization_id, c.show_id
  into class_record
  from public.classes c
  where c.id = new.class_id;

  if not found then
    raise exception 'Class % does not exist', new.class_id using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := class_record.organization_id;
  new.show_id := class_record.show_id;

  return new;
end;
$$;

create or replace function public.set_show_score_paid_warmup_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  show_record record;
  day_record record;
begin
  select s.organization_id
  into show_record
  from public.shows s
  where s.id = new.show_id;

  if not found then
    raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
  end if;

  select sd.organization_id, sd.show_id
  into day_record
  from public.show_days sd
  where sd.id = new.show_day_id;

  if not found then
    raise exception 'Show day % does not exist', new.show_day_id using errcode = 'foreign_key_violation';
  end if;

  if day_record.show_id <> new.show_id then
    raise exception 'Show day % does not belong to show %', new.show_day_id, new.show_id
      using errcode = 'foreign_key_violation';
  end if;

  if day_record.organization_id <> show_record.organization_id then
    raise exception 'Show day % does not belong to the same organization as show %', new.show_day_id, new.show_id
      using errcode = 'foreign_key_violation';
  end if;

  new.organization_id := show_record.organization_id;

  return new;
end;
$$;

create unique index if not exists idx_show_score_paid_warmups_legacy_id
on public.show_score_paid_warmups(legacy_showscore_paid_warmup_id)
where legacy_showscore_paid_warmup_id is not null;

create index if not exists idx_show_score_class_setups_show_id
on public.show_score_class_setups(show_id);

create index if not exists idx_show_score_scoring_sessions_show_id
on public.show_score_scoring_sessions(show_id);

create index if not exists idx_show_score_judge_sessions_show_id
on public.show_score_judge_sessions(show_id);

create index if not exists idx_show_score_official_results_show_id
on public.show_score_official_results(show_id);

create index if not exists idx_show_score_publication_states_show_id
on public.show_score_publication_states(show_id);

create index if not exists idx_show_score_publication_states_status
on public.show_score_publication_states(status);

create index if not exists idx_show_score_paid_warmups_show_id
on public.show_score_paid_warmups(show_id);

create index if not exists idx_show_score_paid_warmups_sort_order
on public.show_score_paid_warmups(show_id, show_day_id, sort_order);

drop trigger if exists show_score_class_setups_set_refs on public.show_score_class_setups;
create trigger show_score_class_setups_set_refs
before insert or update on public.show_score_class_setups
for each row execute function public.set_show_score_class_setup_refs();

drop trigger if exists show_score_scoring_sessions_set_refs on public.show_score_scoring_sessions;
create trigger show_score_scoring_sessions_set_refs
before insert or update on public.show_score_scoring_sessions
for each row execute function public.set_show_score_class_refs();

drop trigger if exists show_score_judge_sessions_set_refs on public.show_score_judge_sessions;
create trigger show_score_judge_sessions_set_refs
before insert or update on public.show_score_judge_sessions
for each row execute function public.set_show_score_class_refs();

drop trigger if exists show_score_official_results_set_refs on public.show_score_official_results;
create trigger show_score_official_results_set_refs
before insert or update on public.show_score_official_results
for each row execute function public.set_show_score_class_refs();

drop trigger if exists show_score_publication_states_set_refs on public.show_score_publication_states;
create trigger show_score_publication_states_set_refs
before insert or update on public.show_score_publication_states
for each row execute function public.set_show_score_class_refs();

drop trigger if exists show_score_paid_warmups_set_refs on public.show_score_paid_warmups;
create trigger show_score_paid_warmups_set_refs
before insert or update on public.show_score_paid_warmups
for each row execute function public.set_show_score_paid_warmup_refs();

drop trigger if exists show_score_class_setups_touch_updated_at on public.show_score_class_setups;
create trigger show_score_class_setups_touch_updated_at
before update on public.show_score_class_setups
for each row execute function public.touch_updated_at();

drop trigger if exists show_score_scoring_sessions_touch_updated_at on public.show_score_scoring_sessions;
create trigger show_score_scoring_sessions_touch_updated_at
before update on public.show_score_scoring_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists show_score_judge_sessions_touch_updated_at on public.show_score_judge_sessions;
create trigger show_score_judge_sessions_touch_updated_at
before update on public.show_score_judge_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists show_score_official_results_touch_updated_at on public.show_score_official_results;
create trigger show_score_official_results_touch_updated_at
before update on public.show_score_official_results
for each row execute function public.touch_updated_at();

drop trigger if exists show_score_publication_states_touch_updated_at on public.show_score_publication_states;
create trigger show_score_publication_states_touch_updated_at
before update on public.show_score_publication_states
for each row execute function public.touch_updated_at();

drop trigger if exists show_score_paid_warmups_touch_updated_at on public.show_score_paid_warmups;
create trigger show_score_paid_warmups_touch_updated_at
before update on public.show_score_paid_warmups
for each row execute function public.touch_updated_at();

alter table public.show_score_class_setups enable row level security;
alter table public.show_score_scoring_sessions enable row level security;
alter table public.show_score_judge_sessions enable row level security;
alter table public.show_score_official_results enable row level security;
alter table public.show_score_publication_states enable row level security;
alter table public.show_score_paid_warmups enable row level security;

drop policy if exists "ShowScore staff can view class setups" on public.show_score_class_setups;
create policy "ShowScore staff can view class setups"
  on public.show_score_class_setups for select
  using (public.can_view_show_score_class(class_id));

drop policy if exists "ShowScore managers can manage class setups" on public.show_score_class_setups;
create policy "ShowScore managers can manage class setups"
  on public.show_score_class_setups for all
  using (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']))
  with check (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']));

drop policy if exists "ShowScore staff can view scoring sessions" on public.show_score_scoring_sessions;
create policy "ShowScore staff can view scoring sessions"
  on public.show_score_scoring_sessions for select
  using (public.can_view_show_score_class(class_id));

drop policy if exists "ShowScore scorers can manage scoring sessions" on public.show_score_scoring_sessions;
create policy "ShowScore scorers can manage scoring sessions"
  on public.show_score_scoring_sessions for all
  using (public.can_manage_show_score_class(class_id, array['organizer', 'secretary', 'judge', 'scribe']))
  with check (public.can_manage_show_score_class(class_id, array['organizer', 'secretary', 'judge', 'scribe']));

drop policy if exists "ShowScore staff can view judge sessions" on public.show_score_judge_sessions;
create policy "ShowScore staff can view judge sessions"
  on public.show_score_judge_sessions for select
  using (public.can_view_show_score_class(class_id));

drop policy if exists "ShowScore scorers can manage judge sessions" on public.show_score_judge_sessions;
create policy "ShowScore scorers can manage judge sessions"
  on public.show_score_judge_sessions for all
  using (public.can_manage_show_score_class(class_id, array['organizer', 'secretary', 'judge', 'scribe']))
  with check (public.can_manage_show_score_class(class_id, array['organizer', 'secretary', 'judge', 'scribe']));

drop policy if exists "ShowScore staff and public can view official results" on public.show_score_official_results;
create policy "ShowScore staff and public can view official results"
  on public.show_score_official_results for select
  using (
    public.can_view_show_score_class(class_id)
    or exists (
      select 1
      from public.show_score_publication_states ps
      join public.classes c on c.id = ps.class_id
      join public.shows s on s.id = c.show_id
      where ps.class_id = public.show_score_official_results.class_id
        and ps.status in ('official', 'published')
        and c.is_public
        and (s.is_public or s.show_results_public)
    )
  );

drop policy if exists "ShowScore managers can manage official results" on public.show_score_official_results;
create policy "ShowScore managers can manage official results"
  on public.show_score_official_results for all
  using (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']))
  with check (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']));

drop policy if exists "ShowScore staff and public can view publication states" on public.show_score_publication_states;
create policy "ShowScore staff and public can view publication states"
  on public.show_score_publication_states for select
  using (
    public.can_view_show_score_class(class_id)
    or (
      status <> 'hidden'
      and exists (
        select 1
        from public.classes c
        join public.shows s on s.id = c.show_id
        where c.id = public.show_score_publication_states.class_id
          and c.is_public
          and (s.is_public or s.show_draw_public or s.show_results_public)
      )
    )
  );

drop policy if exists "ShowScore managers can manage publication states" on public.show_score_publication_states;
create policy "ShowScore managers can manage publication states"
  on public.show_score_publication_states for all
  using (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']))
  with check (public.can_manage_show_score_class(class_id, array['organizer', 'secretary']));

drop policy if exists "ShowScore staff and public can view paid warmups" on public.show_score_paid_warmups;
create policy "ShowScore staff and public can view paid warmups"
  on public.show_score_paid_warmups for select
  using (
    public.can_view_show_score_show(show_id)
    or (
      is_public_live
      and exists (
        select 1
        from public.shows s
        where s.id = public.show_score_paid_warmups.show_id
          and s.is_public
      )
    )
  );

drop policy if exists "ShowScore managers can manage paid warmups" on public.show_score_paid_warmups;
create policy "ShowScore managers can manage paid warmups"
  on public.show_score_paid_warmups for all
  using (public.can_manage_show_score_show(show_id, array['organizer', 'secretary']))
  with check (public.can_manage_show_score_show(show_id, array['organizer', 'secretary']));
