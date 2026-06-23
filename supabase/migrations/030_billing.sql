-- ============================================================
-- 030_billing
--
-- Adds the subscription / plan layer that turns wacrm from a
-- self-hostable single-deployment app into a multi-tenant SaaS.
-- The multi-tenant foundation already exists (017_account_sharing:
-- one `accounts` row per tenant, RLS via is_account_member). This
-- migration only adds *billing state* on top of it.
--
-- Product rules encoded here (the rest live in TS,
-- src/lib/billing/plans.ts, so limits can iterate without a
-- migration):
--   - Every account has exactly one `subscriptions` row (1:1).
--   - New accounts start on the `free` tier. `free` is a
--     pre-payment state — it cannot connect WhatsApp (enforced in
--     the app via plans.maxWhatsappNumbers === 0, not here).
--   - Stripe is the source of truth for paid state; the webhook
--     (service role) is the ONLY writer of plan/status/period.
--     Hence: members may SELECT their row, but there is no user
--     write policy — the service-role key bypasses RLS.
--   - `extra_seats` is here from day one for the future
--     "buy extra seats" add-on; effective seat count is computed
--     in TS as (plan base + extra_seats).
--
-- Idempotent — safe to re-run. Types use a guarded DO block;
-- policies/triggers are dropped before recreate (Postgres has no
-- CREATE POLICY IF NOT EXISTS).
-- ============================================================

-- ============================================================
-- TYPES
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_tier_enum') THEN
    CREATE TYPE plan_tier_enum AS ENUM ('free', 'pro', 'business');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status_enum') THEN
    CREATE TYPE subscription_status_enum AS ENUM (
      'trialing', 'active', 'past_due', 'canceled', 'incomplete'
    );
  END IF;
END $$;

-- ============================================================
-- SUBSCRIPTIONS  (1:1 with accounts — account_id is the PK)
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  plan plan_tier_enum NOT NULL DEFAULT 'free',
  status subscription_status_enum NOT NULL DEFAULT 'active',
  -- Stripe linkage. NULL until the account first checks out. Kept
  -- on the subscription (not accounts) so all billing state lives
  -- in one table.
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  trial_ends_at TIMESTAMPTZ,
  -- Extra seats purchased on top of the plan's base allowance.
  -- Future add-on; defaults to 0 so today's logic is plan-base only.
  extra_seats INT NOT NULL DEFAULT 0 CHECK (extra_seats >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast reverse lookup from a Stripe webhook payload → our row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_subscription
  ON subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON subscriptions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- RLS
--
-- Any member can read their account's plan (UI shows current plan
-- / usage to everyone; upgrade buttons are role-gated in the app).
-- NO user-facing write policy: paid state is mutated exclusively by
-- the Stripe webhook using the service-role key, which bypasses RLS.
-- ============================================================
DROP POLICY IF EXISTS subscriptions_select ON subscriptions;
CREATE POLICY subscriptions_select ON subscriptions FOR SELECT
  USING (is_account_member(account_id));

-- ============================================================
-- BOOTSTRAP — one free subscription per account
--
-- A dedicated AFTER INSERT trigger on `accounts` (rather than
-- extending handle_new_user) so it also fires for accounts created
-- by invite-redemption RPCs or any future path, not just signup.
-- ============================================================
CREATE OR REPLACE FUNCTION public.bootstrap_account_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.subscriptions (account_id, plan, status)
  VALUES (NEW.id, 'free', 'active')
  ON CONFLICT (account_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let a billing-row failure abort account creation; the
  -- backfill below / app read-path treats a missing row as free.
  RAISE WARNING 'Failed to bootstrap subscription for account %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.bootstrap_account_subscription() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_account_created_bootstrap_subscription ON accounts;
CREATE TRIGGER on_account_created_bootstrap_subscription
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_account_subscription();

-- Backfill every existing account that predates this migration.
INSERT INTO subscriptions (account_id, plan, status)
SELECT a.id, 'free', 'active'
FROM accounts a
ON CONFLICT (account_id) DO NOTHING;
