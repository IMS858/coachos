-- =============================================================================
-- 0023 — Poster frames for coaching videos
--
-- A list of identical play icons tells a client nothing. A still from the video
-- makes each drill recognisable at a glance, which matters when someone has six
-- pieces of homework and wants the hip one.
--
-- The poster is extracted in the browser before upload (canvas from a seeked
-- frame), so there's no transcoding service in the loop.
-- =============================================================================

ALTER TABLE client_media ADD COLUMN IF NOT EXISTS poster_path text;

-- Whether the client has been emailed about this item, so a re-send or a
-- backfill can't spam them twice.
ALTER TABLE client_media ADD COLUMN IF NOT EXISTS notified_at timestamptz;
