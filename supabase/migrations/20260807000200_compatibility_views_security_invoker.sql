-- Compatibility views must enforce the querying user's grants and RLS rules.
-- ALTER VIEW preserves the existing INSTEAD OF triggers used by ShowScore.

alter view public.associations
  set (security_invoker = true);

alter view public.days
  set (security_invoker = true);

alter view public.association_memberships
  set (security_invoker = true);

notify pgrst, 'reload schema';
