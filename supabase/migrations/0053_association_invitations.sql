-- Association invitations for ShowScore

create table if not exists public.association_invitations (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'member',
  token text not null unique default gen_random_uuid()::text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  invited_by text,
  accepted_by text,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_association_invitations_association_id
  on public.association_invitations(association_id);
create index if not exists idx_association_invitations_email
  on public.association_invitations(email);
create index if not exists idx_association_invitations_token
  on public.association_invitations(token);

alter table public.association_invitations enable row level security;

-- Org admins can manage invitations for their org
create policy "Org admins can manage invitations"
  on public.association_invitations for all
  using (public.is_platform_admin() or public.is_org_member(association_id, array['admin']))
  with check (public.is_platform_admin() or public.is_org_member(association_id, array['admin']));

-- Anyone can read their own pending invitation by token (for redemption)
create policy "Anyone can read invitation by token"
  on public.association_invitations for select
  using (status = 'pending');

-- ─── accept_association_invitation RPC ───────────────────────────────────────
create or replace function public.accept_association_invitation(target_token text)
returns json
language plpgsql security definer as $$
declare
  v_invitation public.association_invitations;
  v_profile_id uuid;
  v_membership_id uuid;
  v_result json;
begin
  -- Find pending invitation
  select * into v_invitation
  from public.association_invitations
  where token = target_token and status = 'pending';

  if not found then
    raise exception 'Invitation introuvable ou déjà acceptée.';
  end if;

  -- Get calling user's profile
  select id into v_profile_id from public.user_profiles where user_id = auth.uid();
  if v_profile_id is null then
    raise exception 'Profil utilisateur introuvable.';
  end if;

  -- Add membership
  insert into public.organization_members (user_id, organization_id, role)
  values (v_profile_id, v_invitation.association_id, v_invitation.role)
  on conflict (organization_id, user_id) do update set role = excluded.role
  returning id into v_membership_id;

  -- Mark invitation accepted
  update public.association_invitations
  set status = 'accepted', accepted_by = auth.uid()::text, accepted_at = now(), updated_at = now()
  where id = v_invitation.id;

  select json_build_object(
    'invitation_id',     v_invitation.id,
    'association_id',    v_invitation.association_id,
    'invitation_role',   v_invitation.role,
    'invitation_status', 'accepted',
    'membership_id',     v_membership_id
  ) into v_result;

  return v_result;
end;
$$;

-- ─── accept_pending_association_invitations RPC ───────────────────────────────
create or replace function public.accept_pending_association_invitations()
returns json[]
language plpgsql security definer as $$
declare
  v_user_email text;
  v_profile_id uuid;
  v_invitation public.association_invitations;
  v_membership_id uuid;
  v_results json[] := '{}';
begin
  select email into v_user_email from auth.users where id = auth.uid();
  select id into v_profile_id from public.user_profiles where user_id = auth.uid();

  if v_user_email is null or v_profile_id is null then
    return v_results;
  end if;

  for v_invitation in
    select * from public.association_invitations
    where lower(email) = lower(v_user_email) and status = 'pending'
    order by created_at
  loop
    insert into public.organization_members (user_id, organization_id, role)
    values (v_profile_id, v_invitation.association_id, v_invitation.role)
    on conflict (organization_id, user_id) do update set role = excluded.role
    returning id into v_membership_id;

    update public.association_invitations
    set status = 'accepted', accepted_by = auth.uid()::text, accepted_at = now(), updated_at = now()
    where id = v_invitation.id;

    v_results := array_append(v_results, json_build_object(
      'invitation_id',     v_invitation.id,
      'association_id',    v_invitation.association_id,
      'invitation_role',   v_invitation.role,
      'invitation_status', 'accepted',
      'membership_id',     v_membership_id
    ));
  end loop;

  return v_results;
end;
$$;
