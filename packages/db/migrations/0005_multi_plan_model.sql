-- =============================================================================
-- Migration 0005 — Multi-plan model with service types
--
-- Replaces the single-membership-per-client assumption with stackable plans.
-- A client can have any number of concurrent active plans:
--   - 1 subscription (recurring monthly) + N packages (session counts)
--   - Multiple packages of the same service type allowed (Nikki could have
--     a 12-pack training and a second 12-pack training running concurrently)
--
-- Migrates existing data from `memberships` → `plans` (preserves history).
-- Old `memberships` table is kept but deprecated; new code reads `plans`.
-- =============================================================================

-- 1. Service type enum (separate counters per type)
DO $$ BEGIN
  CREATE TYPE service_type AS ENUM ('training', 'massage', 'pilates', 'recovery', 'body_comp');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Plan kind enum (subscription vs package)
DO $$ BEGIN
  CREATE TYPE plan_kind AS ENUM ('subscription', 'package');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Plan tier enum (now includes 'custom' for non-standard subscriptions like Nikki's $3,550)
DO $$ BEGIN
  CREATE TYPE plan_tier AS ENUM (
    'essentials_2x',
    'standard_3x',
    'premium_4x',
    'recovery_monthly',
    'custom',
    'package_6',
    'package_12',
    'package_24',
    'package_custom'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 4. The plans table — replaces memberships for new writes
CREATE TABLE IF NOT EXISTS plans (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id                   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Plan classification
  kind                        plan_kind NOT NULL,
  tier                        plan_tier NOT NULL,
  service_type                service_type,            -- NULL for subscriptions covering multiple types
  custom_label                text,                    -- "Nikki Custom" for custom-tier plans

  status                      text NOT NULL DEFAULT 'active',  -- active, paused, cancelled, expired

  -- Counter (packages only)
  current_session_number      int,
  total_sessions              int,
  sessions_used               int DEFAULT 0,

  -- Subscription details
  monthly_rate_cents          int,
  sessions_per_week           int,                     -- for training subscriptions

  -- Package details
  package_total_cents         int,

  -- Lifecycle
  start_date                  date NOT NULL DEFAULT CURRENT_DATE,
  end_date                    date,
  expires_at                  date,                    -- packages: 12 months from purchase

  -- Stripe linkage
  stripe_subscription_id      text,
  stripe_price_id             text,

  -- Notes (visible to trainers/owner)
  notes                       text,

  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT plan_consistency CHECK (
    (kind = 'subscription' AND monthly_rate_cents IS NOT NULL)
    OR
    (kind = 'package' AND total_sessions IS NOT NULL AND service_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_plans_client_active
  ON plans(client_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_plans_service_type
  ON plans(client_id, service_type) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_plans_kind
  ON plans(client_id, kind);

-- 5. RLS
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_self_read ON plans;
CREATE POLICY plans_self_read ON plans FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP POLICY IF EXISTS plans_trainer_all ON plans;
CREATE POLICY plans_trainer_all ON plans FOR ALL TO authenticated
  USING (is_trainer() OR is_owner());

-- 6. updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_plans ON plans;
CREATE TRIGGER set_updated_at_plans
  BEFORE UPDATE ON plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Migrate existing data from memberships → plans
-- This preserves all current Nikki/Will/Diana/etc. counters
INSERT INTO plans (
  client_id, kind, tier, service_type, custom_label, status,
  current_session_number, total_sessions, sessions_used,
  monthly_rate_cents, sessions_per_week,
  package_total_cents,
  start_date, end_date,
  stripe_subscription_id,
  created_at, updated_at
)
SELECT
  m.client_id,
  CASE
    WHEN m.tier::text LIKE 'package_%' THEN 'package'::plan_kind
    ELSE 'subscription'::plan_kind
  END,
  m.tier::text::plan_tier,
  CASE
    WHEN m.tier::text LIKE 'package_%' THEN 'training'::service_type  -- assume training; correct in editor
    ELSE NULL
  END,
  NULL,
  m.status::text,
  m.current_session_number,
  m.total_sessions,
  m.sessions_used,
  m.monthly_rate_cents,
  m.sessions_per_week,
  m.package_total_cents,
  COALESCE(m.start_date, CURRENT_DATE),
  m.end_date,
  m.stripe_subscription_id,
  m.created_at,
  COALESCE(m.updated_at, m.created_at)
FROM memberships m
WHERE NOT EXISTS (
  -- Don't double-migrate if 0005 has run before
  SELECT 1 FROM plans p
  WHERE p.client_id = m.client_id
    AND p.tier::text = m.tier::text
    AND p.created_at = m.created_at
);

-- 8. Drop the old single-active-membership view; rebuild as a multi-plan summary
DROP VIEW IF EXISTS client_billing_summary;
CREATE VIEW client_billing_summary AS
SELECT
  c.id AS client_id,
  p.full_name,
  p.email,
  p.phone,
  c.status,
  c.billing_type,
  c.primary_trainer_id,
  c.last_session_at,
  -- Aggregate plan counts
  (SELECT COUNT(*) FROM plans WHERE client_id = c.id AND status = 'active') AS active_plans_count,
  (SELECT COUNT(*) FROM plans WHERE client_id = c.id AND status = 'active' AND kind = 'subscription') AS active_subscriptions_count,
  (SELECT COUNT(*) FROM plans WHERE client_id = c.id AND status = 'active' AND kind = 'package') AS active_packages_count,
  -- Total MRR contribution from this client (sum of all active subscriptions)
  COALESCE(
    (SELECT SUM(monthly_rate_cents) FROM plans WHERE client_id = c.id AND status = 'active' AND kind = 'subscription'),
    0
  ) AS total_monthly_cents,
  -- Most recent plan label for the list display (newest active)
  (
    SELECT
      CASE
        WHEN tier = 'custom' AND custom_label IS NOT NULL THEN custom_label
        WHEN tier::text LIKE 'package_%' THEN
          CASE service_type
            WHEN 'training' THEN 'Training pack'
            WHEN 'massage' THEN 'Massage pack'
            WHEN 'pilates' THEN 'Pilates pack'
            ELSE 'Package'
          END
        ELSE tier::text
      END
    FROM plans
    WHERE client_id = c.id AND status = 'active'
    ORDER BY
      CASE WHEN kind = 'subscription' THEN 0 ELSE 1 END,  -- subscriptions first
      created_at DESC
    LIMIT 1
  ) AS primary_plan_label
FROM clients c
JOIN profiles p ON p.id = c.id;

COMMENT ON VIEW client_billing_summary IS
  'Aggregated client view with plan counts and total MRR contribution. Use in the clients list. For full plan details, query the plans table directly.';

-- 9. Replace the old session counter function with a service-type aware version
CREATE OR REPLACE FUNCTION increment_session_counter(
  p_client_id uuid,
  p_service_type service_type
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_plan_id uuid;
  new_count int;
  new_used int;
  result jsonb;
BEGIN
  -- Find the oldest active package for this client + service type
  -- (FIFO: drain old packages first when client has stacked packages)
  SELECT id INTO target_plan_id
  FROM plans
  WHERE client_id = p_client_id
    AND service_type = p_service_type
    AND kind = 'package'
    AND status = 'active'
    AND (sessions_used IS NULL OR sessions_used < total_sessions)
  ORDER BY created_at ASC
  LIMIT 1;

  IF target_plan_id IS NULL THEN
    -- No package available; return null. Caller may decide whether to charge a la carte.
    RETURN jsonb_build_object(
      'plan_id', null,
      'incremented', false,
      'reason', 'no_active_package'
    );
  END IF;

  UPDATE plans
  SET
    current_session_number = COALESCE(current_session_number, 0) + 1,
    sessions_used = COALESCE(sessions_used, 0) + 1,
    updated_at = now()
  WHERE id = target_plan_id
  RETURNING current_session_number, sessions_used INTO new_count, new_used;

  -- If just exhausted, mark as expired
  IF new_used >= (SELECT total_sessions FROM plans WHERE id = target_plan_id) THEN
    UPDATE plans SET status = 'expired', end_date = CURRENT_DATE WHERE id = target_plan_id;
  END IF;

  RETURN jsonb_build_object(
    'plan_id', target_plan_id,
    'incremented', true,
    'session_number', new_count,
    'sessions_used', new_used
  );
END;
$$;

COMMENT ON FUNCTION increment_session_counter IS
  'Atomically advances the next active package of the given service type for this client. FIFO across stacked packages. Returns the affected plan + new counter, or null if no active package exists for that service type.';

-- 10. Drop the old single-arg function (signature changed)
DROP FUNCTION IF EXISTS increment_session_counter(uuid);

-- =============================================================================
-- Done.
--
-- Old `memberships` table is kept for now (do not drop until app code is fully
-- migrated). New code should read/write `plans` only.
--
-- After running:
--   - Existing Nikki/Will/Diana/etc. counters preserved (migrated to plans table)
--   - Each client can have N active plans (subscription + multiple packages)
--   - Stacked packages of the same type drain FIFO when sessions are completed
--   - Custom subscription tier ('custom') with custom_label supports Nikki's $3,550
-- =============================================================================
