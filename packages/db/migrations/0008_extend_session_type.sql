-- =============================================================================
-- Migration 0008 — Extend session_type enum
--
-- The original schema's session_type enum had ('training', 'assessment', 'recovery').
-- Adding 'massage' and 'pilates' so the New Session form can record them
-- without a separate column.
-- =============================================================================

ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'massage';
ALTER TYPE session_type ADD VALUE IF NOT EXISTS 'pilates';

-- =============================================================================
-- Done. session_type now matches the service_type values where they overlap.
-- =============================================================================
