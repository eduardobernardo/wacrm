import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve which WhatsApp config to use for an outbound send.
 *
 * Priority chain:
 *   1. conversation.whatsapp_config_id (inbound-triggered: reply in conversation)
 *   2. opts.whatsappConfigId (proactive: resource with a selected number)
 *   3. Fallback: single connected number if exactly one, else error
 *
 * The caller passes the DB client so this works with both the server
 * client (API routes) and the admin client (engines).
 */
export async function resolveWhatsappConfig(
  db: SupabaseClient,
  opts: {
    accountId: string
    conversationId?: string | null
    whatsappConfigId?: string | null
  },
): Promise<{
  id: string
  phone_number_id: string
  access_token: string
  [key: string]: unknown
}> {
  let configId: string | null = null

  // 1. Conversation's whatsapp_config_id (inbound-triggered)
  if (opts.conversationId) {
    const { data: conv } = await db
      .from('conversations')
      .select('whatsapp_config_id')
      .eq('id', opts.conversationId)
      .maybeSingle()
    configId = conv?.whatsapp_config_id ?? null
  }

  // 2. Explicit whatsappConfigId (proactive with selected number)
  if (!configId && opts.whatsappConfigId) {
    configId = opts.whatsappConfigId
  }

  // 3. Fallback: single connected number if exactly one, else error
  if (!configId) {
    const { data: configs, error } = await db
      .from('whatsapp_config')
      .select('id')
      .eq('account_id', opts.accountId)
      .eq('status', 'connected')
    if (error || !configs || configs.length === 0) {
      throw new Error('WhatsApp not configured for this account')
    }
    if (configs.length > 1) {
      throw new Error(
        'Multiple WhatsApp numbers connected — specify which number to send from',
      )
    }
    configId = configs[0].id
  }

  const { data: config, error: configErr } = await db
    .from('whatsapp_config')
    .select('*')
    .eq('id', configId)
    .eq('account_id', opts.accountId)
    .eq('status', 'connected')
    .single()
  if (configErr || !config) {
    throw new Error('WhatsApp not configured for this account')
  }

  return config as {
    id: string
    phone_number_id: string
    access_token: string
    [key: string]: unknown
  }
}
