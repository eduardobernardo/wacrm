-- Fix: tighten exception handling in bootstrap_account_subscription()
-- Previously, EXCEPTION WHEN OTHERS silently swallowed all errors (disk full,
-- FK violation, lock timeout, etc.) so account creation could succeed with no
-- subscription row.  Now only unique_violation (SQLSTATE 23505) is caught;
-- all other exceptions propagate and abort account creation.

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
EXCEPTION
  WHEN unique_violation THEN
    -- CONFLICT is safe — the subscription row already exists (the ON CONFLICT above
    -- should handle this, but this catches edge cases). Account creation proceeds.
    RAISE WARNING 'Unique violation bootstrapping subscription for account %: %', NEW.id, SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    -- Real failure: propagate the error to abort account creation.
    RAISE EXCEPTION 'Failed to bootstrap subscription for account %: %', NEW.id, SQLERRM;
END;
$$;

ALTER FUNCTION public.bootstrap_account_subscription() OWNER TO postgres;

-- Drop and recreate the trigger so it points at the updated function
DROP TRIGGER IF EXISTS on_account_created_bootstrap_subscription ON accounts;
CREATE TRIGGER on_account_created_bootstrap_subscription
  AFTER INSERT ON accounts
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_account_subscription();
