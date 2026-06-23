-- ============================================================
-- 032_fix_dept_member_account_check.sql — Enforce account_id
-- consistency on department_members.
--
-- Adds a BEFORE INSERT/UPDATE trigger that rejects rows whose
-- account_id does not match the parent department's account_id.
-- This closes a data-integrity gap left by 026_departments.sql:
-- the denormalized column was never enforced at the DB level.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- Trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_department_member_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dept_account_id UUID;
BEGIN
  SELECT account_id INTO v_dept_account_id
  FROM departments
  WHERE id = NEW.department_id;

  IF v_dept_account_id IS NULL THEN
    RAISE EXCEPTION 'Department % not found', NEW.department_id;
  END IF;

  IF NEW.account_id != v_dept_account_id THEN
    RAISE EXCEPTION 'department_members.account_id (%) does not match departments.account_id (%)',
      NEW.account_id, v_dept_account_id;
  END IF;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.validate_department_member_account() OWNER TO postgres;

-- ============================================================
-- Trigger on department_members
-- ============================================================
DROP TRIGGER IF EXISTS trg_validate_dept_member_account ON department_members;
CREATE TRIGGER trg_validate_dept_member_account
  BEFORE INSERT OR UPDATE ON department_members
  FOR EACH ROW EXECUTE FUNCTION public.validate_department_member_account();

-- ============================================================
-- Cleanup: remove any existing rows where account_id doesn't
-- match the parent department (orphaned cross-tenant data).
-- ============================================================
DELETE FROM department_members dm
USING departments d
WHERE dm.department_id = d.id
  AND dm.account_id != d.account_id;
