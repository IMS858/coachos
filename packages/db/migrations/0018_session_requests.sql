-- 0018_session_requests.sql
-- Client self-booking: adds a 'requested' session status.
-- Clients request a slot → staff approve (→ scheduled) or decline (→ cancelled).
--
-- NOTE: run this statement by itself in the Supabase SQL editor.

ALTER TYPE session_status ADD VALUE IF NOT EXISTS 'requested';
