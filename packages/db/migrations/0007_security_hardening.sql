-- =============================================================================
-- Migration 0007 — Security & Integrity Hardening (from full integration audit)
--
-- Fixes found during the integration review:
--   1. CRITICAL: client_billing_summary view bypassed RLS (any client could
--      query everyone's billing). Mark security_invoker so view respects
--      the caller's RLS on underlying tables.
--   2. Sessions need indexes on (client_id, scheduled_at) for the trainer
--      dashboard "today" query and the at-risk computation.
--   3. Plans need an index on (client_id, kind, status) for the active-plans
--      lookup that runs on every session detail page.
--   4. Add a database constraint preventing two active subscriptions on the
--      same client (you can have N packages but only 1 sub at a time).
-- =============================================================================

-- 1. CRITICAL: View RLS via security_invoker
-- Without this, anyone with SELECT on the view sees ALL rows because views
-- run as the view owner (postgres) by default, bypassing the underlying
-- tables' RLS policies. With security_invoker=on, the view runs as the
-- caller and underlying-table RLS applies.
ALTER VIEW client_billing_summary SET (security_invoker = on);

-- 2. Indexes for hot paths

-- Trainer dashboard "today's sessions" runs every page load
CREATE INDEX IF NOT EXISTS idx_sessions_trainer_today
  ON sessions(trainer_id, scheduled_at)
  WHERE status IN ('scheduled', 'confirmed', 'completed');

-- Client dashboard "next session"
CREATE INDEX IF NOT EXISTS idx_sessions_client_upcoming
  ON sessions(client_id, scheduled_at)
  WHERE status IN ('scheduled', 'confirmed');

-- Session detail page joins to plans on (client_id, status='active')
CREATE INDEX IF NOT EXISTS idx_plans_client_kind_status
  ON plans(client_id, kind, status);

-- 3. Soft uniqueness — no client should have two active subscriptions stacked.
-- (Multiple active packages of the same service type IS allowed.)
DROP INDEX IF EXISTS idx_one_active_subscription_per_client;
CREATE UNIQUE INDEX idx_one_active_subscription_per_client
  ON plans(client_id)
  WHERE kind = 'subscription' AND status = 'active';

COMMENT ON INDEX idx_one_active_subscription_per_client IS
  'Prevents two active subscriptions on the same client. To switch tiers, the existing active sub must be cancelled first.';

-- 4. Helpful view comment for future maintainers
COMMENT ON VIEW client_billing_summary IS
  'Aggregated client view. Runs with security_invoker=on so RLS on underlying tables (clients, profiles, plans) applies. Owner sees all rows. Trainer sees all rows. Client sees only their own row.';

-- =============================================================================
-- Done. Verify with:
--   SELECT n.nspname, c.relname, c.reloptions
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE c.relname = 'client_billing_summary';
--
-- reloptions should include 'security_invoker=on'.
-- =============================================================================

-- 5. payments.plan_id — webhook now writes to plans, not memberships
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_plan
  ON payments(plan_id) WHERE plan_id IS NOT NULL;

COMMENT ON COLUMN payments.plan_id IS
  'Replaces deprecated membership_id. Links a payment to the plan that was billed.';
