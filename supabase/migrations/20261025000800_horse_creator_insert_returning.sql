-- INSERT ... RETURNING must authorize the tuple being inserted directly.
-- can_access_horse() is STABLE and queries horses, so its statement snapshot
-- cannot see that new tuple yet. The helper already grants creators this same
-- read access after insertion; keep its other relationship/staff rules intact.
alter policy "Authorized users can view global horses"
  on public.horses
  using (
    created_by_user_id = public.current_profile_id()
    or public.can_access_horse(id)
  );
