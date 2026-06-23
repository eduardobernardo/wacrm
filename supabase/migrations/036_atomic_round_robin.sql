-- ============================================================
-- 036_atomic_round_robin.sql — Atomic round-robin cursor update
--
-- Fixes a race condition in the sequential (round-robin)
-- department distribution strategy. The previous read-then-write
-- pattern (SELECT last_assigned_user_id → compute next → UPDATE)
-- was executed across two round trips, allowing concurrent
-- callers to read the same cursor and assign the same agent.
--
-- This migration introduces atomic_round_robin(), a SECURITY
-- DEFINER function that:
--   1. Locks the department row (SELECT … FOR UPDATE)
--   2. Reads the current cursor
--   3. Computes the next member in the ordered list
--   4. Updates the cursor
--   5. Returns the selected user_id
-- All within a single Postgres transaction, serialized by the
-- row-level lock.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

CREATE OR REPLACE FUNCTION public.atomic_round_robin(
  p_department_id UUID,
  p_account_id    UUID,
  p_member_ids    UUID[]       -- ordered (by created_at) member user_ids
) RETURNS UUID                   -- the selected user_id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cursor      UUID;
  v_arr_len     INTEGER;
  v_idx         INTEGER := -1;   -- 0-based position of cursor (-1 = not found / NULL)
  v_next_idx    INTEGER;
  v_next_user   UUID;
BEGIN
  -- 1. Lock the department row so concurrent callers serialize here.
  SELECT last_assigned_user_id INTO v_cursor
  FROM departments
  WHERE id = p_department_id
    AND account_id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Department % not found in account %',
      p_department_id, p_account_id;
  END IF;

  -- 2. Validate member list is non-empty.
  v_arr_len := array_length(p_member_ids, 1);
  IF v_arr_len IS NULL OR v_arr_len = 0 THEN
    RAISE EXCEPTION 'No members in department %', p_department_id;
  END IF;

  -- 3. Find 0-based position of current cursor in the ordered list.
  IF v_cursor IS NOT NULL THEN
    FOR i IN 1..v_arr_len LOOP
      IF p_member_ids[i] = v_cursor THEN
        v_idx := i - 1;  -- convert to 0-based
        EXIT;
      END IF;
    END LOOP;
    -- If cursor points to a user no longer in the department,
    -- v_idx stays -1 and we wrap to index 0 (first member).
  END IF;

  -- 4. Advance to next member (wrap around).
  v_next_idx  := (v_idx + 1) % v_arr_len;
  v_next_user := p_member_ids[v_next_idx + 1];  -- convert back to 1-based

  -- 5. Persist the new cursor.
  UPDATE departments
  SET last_assigned_user_id = v_next_user
  WHERE id = p_department_id;

  RETURN v_next_user;
END;
$$;

ALTER FUNCTION public.atomic_round_robin(UUID, UUID, UUID[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.atomic_round_robin(UUID, UUID, UUID[]) FROM PUBLIC;
-- Only service_role needs this — applyRouting uses the admin client.
GRANT EXECUTE ON FUNCTION public.atomic_round_robin(UUID, UUID, UUID[]) TO service_role;
