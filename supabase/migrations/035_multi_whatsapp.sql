-- ============================================================
-- 035_multi_whatsapp
--
-- Enables multiple WhatsApp numbers per account (Business plan).
-- Core schema changes:
--   - whatsapp_config: adds `label` for user-facing number alias.
--   - conversations:    adds `whatsapp_config_id` (NOT NULL) so
--                       every conversation is tied to a specific
--                       number. Backfill from the 1:1
--                       UNIQUE(account_id) that exists today.
--   - message_templates: adds `waba_id` (nullable) for multi-WABA
--                       template filtering.
--   - automations, flows, broadcasts: adds nullable
--     `whatsapp_config_id` for proactive-resource number binding.
--   - Drops UNIQUE(account_id) on whatsapp_config; replaces with
--     UNIQUE(account_id, phone_number_id).
--   - Drops UNIQUE(user_id, name, language) on message_templates;
--     replaces with UNIQUE(account_id, waba_id, name, language).
--
-- Order is critical:
--   1. Add columns (nullable)
--   2. Backfill
--   3. Guard (abort if orphans exist)
--   4. SET NOT NULL (conversations only)
--   5. Drop old constraints / create new indexes
--
-- The backfill (3) runs BEFORE dropping UNIQUE(account_id) so the
-- join is guaranteed 1:1. The DO guard (4) aborts loudly if any
-- conversation was missed.
--
-- Idempotent — safe to re-run. Columns use IF NOT EXISTS;
-- indexes use IF NOT EXISTS; constraint drops use IF EXISTS.
-- Backfill UPDATEs are no-ops on re-run (WHERE … IS NULL).
-- ============================================================

-- ============================================================
-- (1) whatsapp_config: optional label to identify the number
-- ============================================================
ALTER TABLE whatsapp_config ADD COLUMN IF NOT EXISTS label TEXT;

-- ============================================================
-- (2) conversations: FK to the number that received the message
-- ============================================================
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES whatsapp_config(id) ON DELETE RESTRICT;

-- ============================================================
-- (3) Backfill conversations.whatsapp_config_id
--     Today there is exactly 1 config per account
--     (UNIQUE(account_id) still active), so the join is 1:1
--     and unambiguous.
-- ============================================================
UPDATE conversations c
  SET whatsapp_config_id = wc.id
  FROM whatsapp_config wc
  WHERE c.account_id = wc.account_id
    AND c.whatsapp_config_id IS NULL;

-- ============================================================
-- (4) Guard: abort if there are orphan conversations (no config)
--     Accounts that never connected WhatsApp have no conversations
--     (they don't receive inbound). If orphans exist (account
--     connected then hard-deleted via old path), abort with a
--     message listing the count for manual resolution.
-- ============================================================
DO $$
DECLARE orphan_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO orphan_count
    FROM conversations WHERE whatsapp_config_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Cannot SET NOT NULL on conversations.whatsapp_config_id — % orphan conversation(s) '
      'have no matching whatsapp_config. Resolve manually (assign a config or delete '
      'the orphan conversations) before re-running migrations.',
      orphan_count;
  END IF;
END $$;

-- ============================================================
-- (5) SET NOT NULL — every conversation belongs to a number
-- ============================================================
ALTER TABLE conversations ALTER COLUMN whatsapp_config_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_whatsapp_config
  ON conversations(whatsapp_config_id);

-- Unique constraint: one conversation per (account, contact, number).
-- Prevents TOCTOU race when two concurrent inbound webhooks for the
-- same contact+number create duplicate conversations.
CREATE UNIQUE INDEX IF NOT EXISTS conversations_account_contact_config_key
  ON conversations(account_id, contact_id, whatsapp_config_id);

-- ============================================================
-- (6) message_templates: waba_id nullable (local drafts have no WABA)
-- ============================================================
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS waba_id TEXT;

-- ============================================================
-- (7) Backfill message_templates.waba_id (NULL if account has no config)
-- ============================================================
UPDATE message_templates t
  SET waba_id = (SELECT waba_id FROM whatsapp_config WHERE account_id = t.account_id)
  WHERE t.waba_id IS NULL;

-- ============================================================
-- (8) Drop UNIQUE(account_id) — allow multiple numbers per account
-- ============================================================
ALTER TABLE whatsapp_config DROP CONSTRAINT IF EXISTS whatsapp_config_account_id_key;

-- ============================================================
-- (9) New uniqueness: (account_id, phone_number_id)
--     UNIQUE(phone_number_id) globally (migration 013) is KEPT —
--     a number still belongs to only one account.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_config_account_phone_key
  ON whatsapp_config(account_id, phone_number_id);

-- ============================================================
-- (10) message_templates: unique index changes from
--      (user_id, name, language) to (account_id, waba_id, name, language)
--      — allows same template name across different WABAs, prohibits
--      duplicates within the same WABA.
-- ============================================================
DROP INDEX IF EXISTS message_templates_user_name_language_key;
CREATE UNIQUE INDEX IF NOT EXISTS message_templates_account_waba_name_language_key
  ON message_templates(account_id, waba_id, name, language);

-- ============================================================
-- (11–13) Nullable whatsapp_config_id on proactive-resource tables
--     NULL = "all numbers" (inbound trigger scope) and fallback
--     "use the only one if there's exactly one" (proactive send).
--     SET = specific number (inbound scope + proactive send).
--     The same column serves both purposes.
-- ============================================================
ALTER TABLE automations ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES whatsapp_config(id) ON DELETE SET NULL;

ALTER TABLE flows ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES whatsapp_config(id) ON DELETE SET NULL;

ALTER TABLE broadcasts ADD COLUMN IF NOT EXISTS whatsapp_config_id UUID
  REFERENCES whatsapp_config(id) ON DELETE SET NULL;
