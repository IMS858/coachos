-- =============================================================================
-- Migration 0002 — Pricing Lock-In
-- Adds: recovery_monthly tier, configurable service catalog,
--       Stripe billing infrastructure, refund queue, cancellation tracking
-- =============================================================================

-- 1. Add recovery_monthly to membership tier enum
ALTER TYPE membership_tier ADD VALUE IF NOT EXISTS 'recovery_monthly';

-- 2. Stripe customer ID on clients
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS stripe_customer_id text UNIQUE;
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer
  ON clients(stripe_customer_id);

-- 3. Cancellation tracking on sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES profiles(id);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS cancellation_reason text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS late_cancel_fee_charged boolean DEFAULT false;

-- 4. Pause + cancellation tracking on memberships
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS paused_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS pause_resumes_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS pause_days_used_ytd int DEFAULT 0;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellation_requested_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS cancellation_effective_at timestamptz;

-- 5. Service catalog (recovery + future a-la-carte)
CREATE TABLE IF NOT EXISTS service_catalog (
  id                          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug                        text UNIQUE NOT NULL,
  name                        text NOT NULL,
  description                 text,
  category                    text NOT NULL DEFAULT 'recovery',
  duration_minutes            int,
  member_included             boolean NOT NULL DEFAULT false,
  recovery_member_included    boolean NOT NULL DEFAULT false,
  drop_in_eligible            boolean NOT NULL DEFAULT false,
  drop_in_price_cents         int,
  standalone_price_cents      int,
  stripe_price_lookup_key     text,
  active                      boolean NOT NULL DEFAULT true,
  display_order               int NOT NULL DEFAULT 0,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_active
  ON service_catalog(active, display_order);
CREATE INDEX IF NOT EXISTS idx_services_category
  ON service_catalog(category);

ALTER TABLE service_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS services_public_read ON service_catalog;
CREATE POLICY services_public_read ON service_catalog FOR SELECT TO authenticated
  USING (active = true);

DROP POLICY IF EXISTS services_owner_all ON service_catalog;
CREATE POLICY services_owner_all ON service_catalog FOR ALL TO authenticated
  USING (is_owner());

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at_service_catalog ON service_catalog;
CREATE TRIGGER set_updated_at_service_catalog
  BEFORE UPDATE ON service_catalog
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 6. Refund requests queue
CREATE TABLE IF NOT EXISTS refund_requests (
  id                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id               uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  membership_id           uuid REFERENCES memberships(id) ON DELETE SET NULL,
  payment_id              uuid REFERENCES payments(id) ON DELETE SET NULL,
  requested_amount_cents  int NOT NULL,
  reason                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending',
  reviewed_by             uuid REFERENCES profiles(id),
  reviewed_at             timestamptz,
  reviewer_notes          text,
  stripe_refund_id        text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_status
  ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_client
  ON refund_requests(client_id);

ALTER TABLE refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_owner_all ON refund_requests;
CREATE POLICY refund_owner_all ON refund_requests FOR ALL TO authenticated
  USING (is_owner());

DROP POLICY IF EXISTS refund_self_insert ON refund_requests;
CREATE POLICY refund_self_insert ON refund_requests FOR INSERT TO authenticated
  WITH CHECK (client_id = auth.uid());

DROP POLICY IF EXISTS refund_self_read ON refund_requests;
CREATE POLICY refund_self_read ON refund_requests FOR SELECT TO authenticated
  USING (client_id = auth.uid());

DROP TRIGGER IF EXISTS set_updated_at_refund_requests ON refund_requests;
CREATE TRIGGER set_updated_at_refund_requests
  BEFORE UPDATE ON refund_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 7. Stripe event log (idempotency + audit)
CREATE TABLE IF NOT EXISTS stripe_events (
  id                  text PRIMARY KEY,
  type                text NOT NULL,
  data                jsonb NOT NULL,
  processed_at        timestamptz,
  processing_error    text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_unprocessed
  ON stripe_events(created_at) WHERE processed_at IS NULL;

ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stripe_events_owner_only ON stripe_events;
CREATE POLICY stripe_events_owner_only ON stripe_events FOR ALL TO authenticated
  USING (is_owner());

-- 8. Seed the initial service catalog
-- 6 known services + 3 editable placeholders (inactive until configured)
INSERT INTO service_catalog
  (slug, name, description, category, duration_minutes,
   member_included, recovery_member_included, drop_in_eligible,
   drop_in_price_cents, standalone_price_cents, display_order, active)
VALUES
  ('sauna',         'Sauna',                'Heat-based recovery',                   'recovery', 30, true,  true,  true,  2500, NULL,  10, true),
  ('compression',   'Compression Therapy',  'Pneumatic compression boots/sleeves',   'recovery', 30, true,  true,  true,  2500, NULL,  20, true),
  ('massage_30',    '30-min Massage',       'Promo-rate therapeutic massage',        'recovery', 30, true,  true,  true,  2500, NULL,  30, true),
  ('massage_60',    '60-min Massage',       'Standard therapeutic massage (Kara)',   'recovery', 60, true,  true,  false, NULL, NULL,  40, true),
  ('massage_90',    '90-min Massage',       'Extended therapeutic massage (Kara)',   'recovery', 90, true,  true,  false, NULL, NULL,  50, true),
  ('body_comp',     'Body Composition',     'Body composition scan with review',     'recovery', 15, true,  true,  false, NULL, NULL,  60, true),
  ('placeholder_1', '[Recovery Slot 1]',    'Configure in Owner → Settings → Services', 'recovery', 30, true, true, true,  2500, NULL, 100, false),
  ('placeholder_2', '[Recovery Slot 2]',    'Configure in Owner → Settings → Services', 'recovery', 30, true, true, true,  2500, NULL, 110, false),
  ('placeholder_3', '[Recovery Slot 3]',    'Configure in Owner → Settings → Services', 'recovery', 30, true, true, true,  2500, NULL, 120, false)
ON CONFLICT (slug) DO NOTHING;

-- =============================================================================
-- Done. After running:
--   1. Existing memberships table now supports recovery_monthly tier
--   2. Stripe customer IDs can be saved on clients
--   3. Cancellation enforcement has the columns it needs
--   4. Pause/cancel-forward workflow is supported
--   5. Service catalog is live with 6 services + 3 inactive placeholders
--   6. Refund queue is ready for the owner approval workflow
--   7. Stripe webhooks have an idempotency log
-- =============================================================================
