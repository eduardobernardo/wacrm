-- ============================================================
-- 028_broadcast_reply_routing.sql — Broadcast reply routing
--
-- Adds a `reply_routing` JSONB column to the `broadcasts` table.
-- When set, the first reply from a broadcast recipient triggers
-- `applyRouting` to assign the conversation according to the
-- stored RouteTarget. NULL preserves existing behavior (flag
-- replied only, no routing).
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS reply_routing JSONB;
