-- ============================================================
-- 027_conversation_visibility.sql — Department-scoped conversation visibility
--
-- Rewrites the RLS SELECT policies on `conversations` and `messages`
-- so that visibility follows department membership rather than
-- blanket account membership.
--
-- Visibility rules (SELECT):
--   - Admin/owner: sees everything in the account.
--   - Agent: sees conversations assigned to them (any department)
--     AND conversations in departments they belong to (the department
--     pool — assigned_agent_id IS NULL or not).
--   - Viewer: same read-only visibility via is_department_member.
--   - Orphan conversations (no department, no assignee): visible
--     only to admin+.
--
-- INSERT/UPDATE/DELETE policies on conversations and messages are
-- intentionally left as-is (account-scoped, agent+) from migration
-- 017 — write-path scoping does not change with department
-- visibility.
--
-- Part 3 back-fills a default "Departamento Geral" for every
-- existing account that lacks one, populates its membership with
-- all current account members, and links all orphan conversations
-- to it.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

-- ============================================================
-- Part 1: Rewrite conversations_select
-- ============================================================
DROP POLICY IF EXISTS conversations_select ON conversations;
CREATE POLICY conversations_select ON conversations FOR SELECT USING (
  is_account_member(account_id, 'admin')
  OR (assigned_agent_id = auth.uid() AND is_account_member(account_id))
  OR (department_id IS NOT NULL AND is_department_member(department_id) AND is_account_member(account_id))
);

-- ============================================================
-- Part 2: Rewrite messages_select
-- ============================================================
DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        is_account_member(c.account_id, 'admin')
        OR c.assigned_agent_id = auth.uid()
        OR (c.department_id IS NOT NULL AND is_department_member(c.department_id))
      )
  )
);

-- ============================================================
-- Part 3: Backfill — "Departamento Geral" per account
--
-- For each account that does not yet have a "Departamento Geral":
--   1. Create the department.
--   2. Add every current account member to it.
--   3. Link every existing conversation without a department.
-- ============================================================
DO $$
DECLARE
  v_account RECORD;
  v_dept_id UUID;
  v_profile RECORD;
BEGIN
  FOR v_account IN SELECT id FROM accounts LOOP
    -- Skip accounts that already have a "Departamento Geral"
    PERFORM 1 FROM departments WHERE account_id = v_account.id AND name = 'Departamento Geral';
    IF NOT FOUND THEN
      -- Create the department
      INSERT INTO departments (account_id, name, description)
      VALUES (v_account.id, 'Departamento Geral', 'Departamento padrão — todos os membros da conta')
      RETURNING id INTO v_dept_id;

      -- Add all account members
      FOR v_profile IN SELECT user_id FROM profiles WHERE account_id = v_account.id LOOP
        INSERT INTO department_members (account_id, department_id, user_id)
        VALUES (v_account.id, v_dept_id, v_profile.user_id)
        ON CONFLICT (department_id, user_id) DO NOTHING;
      END LOOP;

      -- Link all existing conversations (those without a department)
      UPDATE conversations
      SET department_id = v_dept_id
      WHERE account_id = v_account.id AND department_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- Part 4: Replace messages_modify (FOR ALL → INSERT/UPDATE/DELETE)
--
-- The original messages_modify from migration 017 is FOR ALL, which
-- also covers SELECT.  Postgres OR's permissive policies, so reading
-- a message through messages_select (department-scoped) AND through
-- messages_modify's USING (every agent) would return every message.
-- Splitting into write-only policies ensures messages_select is the
-- sole gate for reads.
-- ============================================================
DROP POLICY IF EXISTS messages_modify ON messages;
DROP POLICY IF EXISTS messages_insert ON messages;
DROP POLICY IF EXISTS messages_update ON messages;
DROP POLICY IF EXISTS messages_delete ON messages;
CREATE POLICY messages_insert ON messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent'))
);
CREATE POLICY messages_update ON messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent'))
);
CREATE POLICY messages_delete ON messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND is_account_member(c.account_id, 'agent'))
);
-- Service-role webhook inserts bypass RLS as before (unchanged).
-- ============================================================
