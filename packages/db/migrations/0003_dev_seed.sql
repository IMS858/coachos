-- =============================================================================
-- Migration 0003 — Development Seed Data
--
-- ⚠️  RUN THIS ONLY IN DEV / STAGING. Do not run against production.
--
-- Creates synthetic users + clients + sessions so the dashboards have
-- something to render. To bootstrap real users:
--   1. Sign up via /login on each environment
--   2. Manually update profiles.role for the bootstrap owner
-- =============================================================================

-- This file expects you to have already created auth users via the Supabase
-- dashboard or signup flow. Replace the UUIDs below with the real auth.users.id
-- values from your project before running.

-- Example seed (commented out — fill in real UUIDs):
/*

-- Owner: Jason
INSERT INTO profiles (id, email, full_name, phone, role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'jason@imsmethod.com', 'Jason Patterson', '6199371434', 'owner')
ON CONFLICT (id) DO UPDATE SET role = 'owner';

-- Trainers
INSERT INTO profiles (id, email, full_name, role) VALUES
  ('00000000-0000-0000-0000-000000000002', 'gabriel@imsmethod.com', 'Gabriel Madrid', 'trainer'),
  ('00000000-0000-0000-0000-000000000003', 'kara@imsmethod.com',    'Kara Vasko',     'trainer')
ON CONFLICT (id) DO UPDATE SET role = 'trainer';

-- Sample clients (3 active, 1 lead)
INSERT INTO profiles (id, email, full_name, role) VALUES
  ('10000000-0000-0000-0000-000000000001', 'sarah@example.com', 'Sarah Patterson', 'client'),
  ('10000000-0000-0000-0000-000000000002', 'mark@example.com',  'Mark Reyes',      'client'),
  ('10000000-0000-0000-0000-000000000003', 'linda@example.com', 'Linda Park',      'client'),
  ('10000000-0000-0000-0000-000000000004', 'newleadexample@example.com', 'Tom Wright', 'client')
ON CONFLICT (id) DO NOTHING;

INSERT INTO clients (id, status, primary_trainer_id, joined_at, lead_source) VALUES
  ('10000000-0000-0000-0000-000000000001', 'active', '00000000-0000-0000-0000-000000000001', now() - interval '6 months', 'referral'),
  ('10000000-0000-0000-0000-000000000002', 'active', '00000000-0000-0000-0000-000000000002', now() - interval '2 months', 'google'),
  ('10000000-0000-0000-0000-000000000003', 'active', '00000000-0000-0000-0000-000000000001', now() - interval '4 months', 'instagram'),
  ('10000000-0000-0000-0000-000000000004', 'lead',   NULL, NULL, 'walk_in')
ON CONFLICT (id) DO NOTHING;

INSERT INTO memberships (client_id, tier, status, sessions_per_week, monthly_rate_cents, start_date) VALUES
  ('10000000-0000-0000-0000-000000000001', 'standard_3x',    'active', 3, 116900, current_date - interval '6 months'),
  ('10000000-0000-0000-0000-000000000002', 'essentials_2x',  'active', 2, 78000,  current_date - interval '2 months'),
  ('10000000-0000-0000-0000-000000000003', 'premium_4x',     'active', 4, 155900, current_date - interval '4 months')
ON CONFLICT DO NOTHING;

-- Sample upcoming sessions for today
INSERT INTO sessions (client_id, trainer_id, scheduled_at, duration_minutes, session_type, status) VALUES
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) + interval '9 hours', 60, 'training', 'confirmed'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) + interval '10 hours 30 minutes', 60, 'assessment', 'confirmed'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
    date_trunc('day', now()) + interval '12 hours', 60, 'training', 'scheduled'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002',
    date_trunc('day', now()) + interval '14 hours', 60, 'training', 'scheduled')
ON CONFLICT DO NOTHING;

-- Intake token for Tom Wright (the lead) — for testing the public intake flow
INSERT INTO intake_tokens (token, client_id) VALUES
  ('demo_intake_token_abc123', '10000000-0000-0000-0000-000000000004')
ON CONFLICT (token) DO NOTHING;

*/

-- ✅ Uncomment the block above and replace UUIDs with real auth.users IDs
-- to populate dev data. The intake token in particular lets you visit
-- /intake/demo_intake_token_abc123 and walk through the full flow.
