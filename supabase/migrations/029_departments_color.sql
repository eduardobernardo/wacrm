-- ============================================================
-- 029_departments_color.sql — Department color identity
--
-- Adds a `color` column to departments so each department can
-- carry a visual identity in the inbox and settings. The set of
-- allowed values is constrained by a CHECK so client UIs can
-- safely treat the field as a small enum (slate | amber | teal
-- | rose | violet) without runtime validation.
--
-- Existing rows backfill to 'slate' so the migration is safe
-- against the "Departamento Geral" created by 027.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT 'slate'
  CHECK (color IN ('slate', 'amber', 'teal', 'rose', 'violet'));
