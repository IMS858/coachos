-- =============================================================================
-- 0027 — New agreement types, and sending an agreement to someone with no account
--
-- PART 1 fixes a real defect: lib/waivers.ts gained massage_consent and
-- communications documents, but waiver_type never did. Signing either would
-- have failed on insert with an enum error.
--
-- PART 2 adds agreement_requests — a one-time signing link for someone who
-- doesn't have (and may never have) a Coach OS account. Two uses:
--   · send a membership agreement to a client before their first session
--   · a partner running a study or class at IMS gets their own link, and their
--     participants sign the facility waiver without becoming IMS clients
--
-- Run the ALTER TYPE block first, on its own, then the rest.
-- =============================================================================

-- ── PART 1 · run this block alone ────────────────────────────────────────────
ALTER TYPE waiver_type ADD VALUE IF NOT EXISTS 'massage_consent';
ALTER TYPE waiver_type ADD VALUE IF NOT EXISTS 'communications';
ALTER TYPE waiver_type ADD VALUE IF NOT EXISTS 'membership_agreement';
ALTER TYPE waiver_type ADD VALUE IF NOT EXISTS 'package_terms';
ALTER TYPE waiver_type ADD VALUE IF NOT EXISTS 'facility_use';


-- ── PART 2 · run after the block above has committed ─────────────────────────


-- Anyone running something at IMS who isn't an IMS client: a university study,
-- a visiting practitioner, a corporate group. They get their own signing link
-- so their participants' paperwork stays separate from the client roster.
CREATE TABLE IF NOT EXISTS partners (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  kind         text NOT NULL DEFAULT 'program'
               CHECK (kind IN ('program', 'study', 'practitioner', 'corporate')),
  contact_name  text,
  contact_email text,
  notes        text,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE partners ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partners_staff ON partners;
CREATE POLICY partners_staff ON partners FOR ALL TO authenticated
  USING (is_trainer()) WITH CHECK (is_trainer());

-- Signers who have no account. client_id stays null for partner participants —
-- they're not IMS clients and shouldn't appear in the roster or billing.
CREATE TABLE IF NOT EXISTS agreement_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token         text UNIQUE NOT NULL,
  client_id     uuid REFERENCES clients(id) ON DELETE CASCADE,
  partner_id    uuid REFERENCES partners(id) ON DELETE SET NULL,
  full_name     text,
  email         text,
  doc_types     text[] NOT NULL,
  note          text,
  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  completed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_agreement_requests_token ON agreement_requests(token);
CREATE INDEX IF NOT EXISTS idx_agreement_requests_partner
  ON agreement_requests(partner_id, created_at DESC) WHERE partner_id IS NOT NULL;

ALTER TABLE agreement_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agreement_requests_staff ON agreement_requests;
CREATE POLICY agreement_requests_staff ON agreement_requests FOR ALL TO authenticated
  USING (is_trainer()) WITH CHECK (is_trainer());
-- The public signing route reads by token through the service role, so no
-- anonymous SELECT policy is needed — the token itself is the credential.

-- Signatures from people without an account. Kept apart from `waivers`, which
-- is keyed to clients(id); mixing them would mean either fake client rows or a
-- nullable foreign key on the record that matters most.
CREATE TABLE IF NOT EXISTS external_signatures (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id          uuid NOT NULL REFERENCES agreement_requests(id) ON DELETE CASCADE,
  partner_id          uuid REFERENCES partners(id) ON DELETE SET NULL,
  full_name           text NOT NULL,
  email               text,
  waiver_type         text NOT NULL,
  waiver_version      text NOT NULL,
  signed_at           timestamptz NOT NULL DEFAULT now(),
  ip_address          inet,
  user_agent          text,
  signature_data_url  text
);

CREATE INDEX IF NOT EXISTS idx_external_signatures_partner
  ON external_signatures(partner_id, signed_at DESC);

ALTER TABLE external_signatures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_signatures_staff ON external_signatures;
CREATE POLICY external_signatures_staff ON external_signatures FOR ALL TO authenticated
  USING (is_trainer()) WITH CHECK (is_trainer());
