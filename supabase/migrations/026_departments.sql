-- ============================================================
-- 026_departments.sql — Department segmentation
--
-- Introduces department-based conversation visibility. A department
-- groups N account members; a user can belong to N departments.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- DEPARTMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  -- Cursor for round-robin (sequential) distribution.
  -- Points to the last user_id assigned; NULL = never assigned.
  last_assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(account_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_account ON departments(account_id);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS set_updated_at ON departments;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: any account member can list departments; only admin+ can modify.
DROP POLICY IF EXISTS departments_select ON departments;
CREATE POLICY departments_select ON departments FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS departments_insert ON departments;
CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS departments_update ON departments;
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS departments_delete ON departments;
CREATE POLICY departments_delete ON departments FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- DEPARTMENT_MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS department_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- denormalized for cheap RLS lookups (avoids a join to departments
  -- on every visibility check).
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_department_members_account
  ON department_members(account_id);
-- NB: UNIQUE(department_id, user_id) already provides a leading-column
-- index on department_id — a separate idx_department_members_department
-- is redundant and intentionally omitted.
CREATE INDEX IF NOT EXISTS idx_department_members_user
  ON department_members(user_id);

-- NB: UNIQUE(department_id, user_id) already provides a leading-column
-- index on department_id — a separate idx_department_members_department
-- is redundant and intentionally omitted.

-- RLS: any account member can see memberships; only admin+ can modify.
DROP POLICY IF EXISTS department_members_select ON department_members;
CREATE POLICY department_members_select ON department_members FOR SELECT
  USING (is_account_member(account_id));

DROP POLICY IF EXISTS department_members_insert ON department_members;
CREATE POLICY department_members_insert ON department_members FOR INSERT
  WITH CHECK (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS department_members_update ON department_members;
CREATE POLICY department_members_update ON department_members FOR UPDATE
  USING (is_account_member(account_id, 'admin'));

DROP POLICY IF EXISTS department_members_delete ON department_members;
CREATE POLICY department_members_delete ON department_members FOR DELETE
  USING (is_account_member(account_id, 'admin'));

-- ============================================================
-- CONVERSATIONS — department_id
--
-- ON DELETE SET NULL: deleting a department returns its conversations
-- to the orphan pool (admin-only), never deletes the conversation.
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_department
  ON conversations(department_id);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned_agent
  ON conversations(assigned_agent_id);

-- ============================================================
-- CONVERSATION_TRANSFERS — audit trail (optional, can be cut from MVP)
-- ============================================================
CREATE TABLE IF NOT EXISTS conversation_transfers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  strategy TEXT,
  transferred_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('inbox', 'flow', 'automation', 'broadcast')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_transfers_conversation
  ON conversation_transfers(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_transfers_account
  ON conversation_transfers(account_id);

ALTER TABLE conversation_transfers ENABLE ROW LEVEL SECURITY;

-- Visibility follows the same rules as the parent conversation.
DROP POLICY IF EXISTS conversation_transfers_select ON conversation_transfers;
CREATE POLICY conversation_transfers_select ON conversation_transfers FOR SELECT
  USING (is_account_member(account_id));

-- Only service-role and the distribution service write to this table.
-- No client INSERT policy; applyRouting uses the admin client.

-- ============================================================
-- is_department_member — SECURITY DEFINER helper
--
-- Mirrors is_account_member (017:136). Returns true iff auth.uid()
-- belongs to the target department. STABLE so Postgres can cache
-- within a statement.
-- ============================================================
CREATE OR REPLACE FUNCTION is_department_member(
  target_department_id UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM department_members dm
    WHERE dm.department_id = target_department_id
      AND dm.user_id = auth.uid()
  );
$$;

ALTER FUNCTION is_department_member(UUID) OWNER TO postgres;
REVOKE ALL ON FUNCTION is_department_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_department_member(UUID) TO authenticated, service_role;
