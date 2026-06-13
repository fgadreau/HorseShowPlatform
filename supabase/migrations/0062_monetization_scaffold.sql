-- Monetization scaffold: align plan values, add metadata columns, simplify modules_enabled.
-- Grace period: all organizations keep full access through 2026-12-31.

-- 1. Add optional metadata columns.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS subscription_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS subscription_notes text;

-- 2. Remove any older plan constraint before changing defaults and values.
ALTER TABLE public.organizations
  DROP CONSTRAINT IF EXISTS organizations_subscription_plan_check;

-- 3. Normalize defaults before the new check constraint is added.
ALTER TABLE public.organizations
  ALTER COLUMN subscription_plan SET DEFAULT 'premium',
  ALTER COLUMN subscription_expires_at SET DEFAULT '2026-12-31 23:59:59-05'::timestamptz,
  ALTER COLUMN modules_enabled SET DEFAULT '{"show_score": true}'::jsonb;

-- 4. Existing organizations get Premium during the grace period so no current
--    customer loses access while monetization is not enforced.
UPDATE public.organizations
SET
  subscription_plan = 'premium',
  subscription_expires_at = coalesce(
    subscription_expires_at,
    '2026-12-31 23:59:59-05'::timestamptz
  ),
  subscription_notes = coalesce(
    subscription_notes,
    'Grace period: full Premium access through 2026-12-31.'
  ),
  modules_enabled = '{"show_score": true}'::jsonb;

-- 5. Enforce valid plan values going forward.
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_subscription_plan_check
  CHECK (subscription_plan IN ('community', 'professional', 'premium'));

-- 6. RPC: platform admins can set plan + modules in one call.
CREATE OR REPLACE FUNCTION public.set_organization_plan(
  target_org_id uuid,
  target_plan text,
  target_expires_at timestamptz DEFAULT NULL,
  target_notes text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  show_score_enabled boolean;
BEGIN
  -- Only platform_admins may call this
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Access denied: platform admin required';
  END IF;

  IF target_plan NOT IN ('community', 'professional', 'premium') THEN
    RAISE EXCEPTION 'Invalid plan: %', target_plan;
  END IF;

  -- show_score is automatically enabled for professional and premium
  show_score_enabled := target_plan IN ('professional', 'premium');

  UPDATE public.organizations
  SET
    subscription_plan      = target_plan,
    modules_enabled        = jsonb_build_object('show_score', show_score_enabled),
    subscription_expires_at = target_expires_at,
    subscription_notes     = target_notes
  WHERE id = target_org_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
