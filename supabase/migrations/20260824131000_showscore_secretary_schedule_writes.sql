-- ShowScore exposes schedule creation and editing to association secretaries.
-- Add only INSERT/UPDATE permissions; destructive policies are unchanged.

alter table public.organizations
  add column if not exists is_test_mode boolean not null default false;

revoke all on function public.create_association_with_owner(
  text, text, text, text, text, text, jsonb
) from public, anon;
grant execute on function public.create_association_with_owner(
  text, text, text, text, text, text, jsonb
) to authenticated;

drop policy if exists "Association secretaries can create shows"
  on public.shows;
create policy "Association secretaries can create shows"
  on public.shows for insert
  to authenticated
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

drop policy if exists "Association secretaries can update shows"
  on public.shows;
create policy "Association secretaries can update shows"
  on public.shows for update
  to authenticated
  using (
    public.is_org_member(organization_id, array['secretary'])
  )
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

drop policy if exists "Association secretaries can create show days"
  on public.show_days;
create policy "Association secretaries can create show days"
  on public.show_days for insert
  to authenticated
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

drop policy if exists "Association secretaries can update show days"
  on public.show_days;
create policy "Association secretaries can update show days"
  on public.show_days for update
  to authenticated
  using (
    public.is_org_member(organization_id, array['secretary'])
  )
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

drop policy if exists "Association secretaries can create blocks"
  on public.blocks;
create policy "Association secretaries can create blocks"
  on public.blocks for insert
  to authenticated
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

drop policy if exists "Association secretaries can update blocks"
  on public.blocks;
create policy "Association secretaries can update blocks"
  on public.blocks for update
  to authenticated
  using (
    public.is_org_member(organization_id, array['secretary'])
  )
  with check (
    public.is_org_member(organization_id, array['secretary'])
  );

notify pgrst, 'reload schema';
