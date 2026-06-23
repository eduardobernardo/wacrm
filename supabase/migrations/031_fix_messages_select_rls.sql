-- ============================================================
-- 031_fix_messages_select_rls.sql — Fix missing account-membership
-- check in the department-membership branch of messages_select.
-- The original policy (027) allowed access via stale department_members
-- rows even after a user was removed from the account.
-- ============================================================
-- Idempotent — safe to run multiple times.
-- ============================================================

DROP POLICY IF EXISTS messages_select ON messages;
CREATE POLICY messages_select ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        is_account_member(c.account_id, 'admin')
        OR c.assigned_agent_id = auth.uid()
        OR (c.department_id IS NOT NULL AND is_department_member(c.department_id) AND is_account_member(c.account_id))
      )
  )
);
