-- =============================================================================
-- 0021 — Add the 48-session package tier
--
-- 'package_custom' already exists in plan_tier (added in 0005), so only the
-- 48-pack is new here.
--
-- ALTER TYPE ... ADD VALUE cannot run in the same transaction as anything that
-- USES the new value, so run this statement on its own and let it finish before
-- adding any 48-pack plans.
-- =============================================================================

ALTER TYPE plan_tier ADD VALUE IF NOT EXISTS 'package_48';
