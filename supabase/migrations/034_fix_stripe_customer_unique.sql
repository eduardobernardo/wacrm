-- ============================================================
-- 034_fix_stripe_customer_unique.sql — Add a partial UNIQUE
-- index on subscriptions.stripe_customer_id.  The original
-- billing migration (030) created a plain index on this column
-- but only a UNIQUE partial index on stripe_subscription_id.
-- While the app flow prevents duplicate customer→account
-- mappings, the constraint acts as defense-in-depth against
-- accidental data corruption.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

DROP INDEX IF EXISTS idx_subscriptions_stripe_customer;
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
