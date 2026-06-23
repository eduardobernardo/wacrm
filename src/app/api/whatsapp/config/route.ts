import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin-client'
import {
  registerPhoneNumber,
  subscribeWabaToApp,
  verifyPhoneNumber,
} from '@/lib/whatsapp/meta-api'
import { encrypt, decrypt } from '@/lib/whatsapp/encryption'
import {
  enforceWhatsappEntitled,
  enforceCanConnectWhatsapp,
} from '@/lib/billing/subscription'
import { resolveAccountId } from '@/lib/auth/account'

/**
 * GET /api/whatsapp/config
 *
 * Returns all WhatsApp numbers configured for the authenticated
 * account. Supports optional `?probe=true` query param to run a
 * live Meta health probe for each number (expensive — involves Meta
 * API calls). Without `?probe=true`, only DB data is returned.
 *
 * Response shape:
 *   { numbers: [{ id, phone_number_id, label, status, waba_id, ... }] }
 *   { numbers: [], reason: 'no_account',        message: '...' }
 *   { numbers: [], reason: 'db_error',           message: '...' }
 *
 * When `?probe=true`, each number includes:
 *   { connected: true,  phone_info: {...} }
 *   { connected: false, probe_error: '...' }
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        {
          numbers: [],
          reason: 'no_account',
          message: 'Your profile is not linked to an account.',
        },
        { status: 200 },
      )
    }

    // Parse optional ?probe=true query param
    const url = new URL(request.url)
    const shouldProbe = url.searchParams.get('probe') === 'true'

    const { data: configs, error: configError } = await supabase
      .from('whatsapp_config')
      .select('id, phone_number_id, label, status, waba_id, access_token, connected_at, registered_at, subscribed_apps_at, last_registration_error')
      .eq('account_id', accountId)

    if (configError) {
      console.error('Error fetching whatsapp_config:', configError)
      return NextResponse.json(
        { numbers: [], reason: 'db_error', message: 'Failed to fetch configuration' },
        { status: 200 }
      )
    }

    if (!configs || configs.length === 0) {
      return NextResponse.json(
        {
          numbers: [],
          reason: 'no_config',
          message: 'No WhatsApp configuration saved yet. Fill in the form and click Save Configuration.',
        },
        { status: 200 }
      )
    }

    // Build base response for each number (DB data only, no Meta calls)
    const numbers = configs.map((config) => ({
      id: config.id,
      phone_number_id: config.phone_number_id,
      label: config.label ?? null,
      status: config.status,
      waba_id: config.waba_id,
      connected_at: config.connected_at,
      registered_at: config.registered_at,
      subscribed_apps_at: config.subscribed_apps_at,
      last_registration_error: config.last_registration_error,
      // Default connected derived from DB status; overridden by probe below
      connected: config.status === 'connected',
      phone_info: null as unknown,
      probe_error: null as string | null,
    }))

    // If probe requested, run Meta health checks via Promise.allSettled
    // so one failure doesn't reject the whole batch.
    if (shouldProbe) {
      const probeResults = await Promise.allSettled(
        configs.map(async (config, idx) => {
          // Try decrypt
          let accessToken: string
          try {
            accessToken = decrypt(config.access_token)
          } catch (err) {
            console.error(`[whatsapp/config GET] Token decryption failed for ${config.phone_number_id}:`, err)
            numbers[idx].connected = false
            numbers[idx].probe_error = 'Token cannot be decrypted — ENCRYPTION_KEY may have changed.'
            return
          }

          // Probe Meta
          try {
            const phoneInfo = await verifyPhoneNumber({
              phoneNumberId: config.phone_number_id,
              accessToken,
            })
            numbers[idx].connected = true
            numbers[idx].phone_info = phoneInfo
            numbers[idx].probe_error = null
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown Meta API error'
            console.error(`[whatsapp/config GET] Meta probe failed for ${config.phone_number_id}:`, message)
            numbers[idx].connected = false
            numbers[idx].probe_error = message
          }
        }),
      )

      // Log any unexpected rejections (shouldn't happen since we catch
      // inside the map, but be defensive).
      probeResults.forEach((result, idx) => {
        if (result.status === 'rejected') {
          console.error(`[whatsapp/config GET] Unexpected probe rejection for ${configs[idx].phone_number_id}:`, result.reason)
          numbers[idx].connected = false
          numbers[idx].probe_error = 'Unexpected error during probe.'
        }
      })
    }

    return NextResponse.json({ numbers })
  } catch (error) {
    console.error('Error in WhatsApp config GET:', error)
    return NextResponse.json(
      { numbers: [], reason: 'unknown', message: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/whatsapp/config
 *
 * Saves or updates a WhatsApp config for the authenticated account.
 * Supports multiple numbers per account — the phone_number_id in the
 * body determines whether this is an add (new number) or an update
 * (re-saving an existing number).
 *
 * Verifies credentials with Meta first, then encrypts and stores.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { phone_number_id, waba_id, access_token, verify_token, pin, label } = body

    if (!access_token || !phone_number_id) {
      return NextResponse.json(
        { error: 'access_token and phone_number_id are required' },
        { status: 400 }
      )
    }

    if (pin !== undefined && pin !== null && pin !== '') {
      if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) {
        return NextResponse.json(
          { error: 'PIN must be exactly 6 digits.' },
          { status: 400 }
        )
      }
    }

    // Look up existing config for this specific (account, phone_number_id)
    // pair BEFORE the gate, so we can branch add vs update.
    const { data: existing } = await supabase
      .from('whatsapp_config')
      .select('id, registered_at, phone_number_id')
      .eq('account_id', accountId)
      .eq('phone_number_id', phone_number_id)
      .maybeSingle()

    // Paywall gate — branched by add vs update:
    //   - Update (same phone_number_id already exists): entitlement
    //     only — doesn't count toward cap, it's the same number.
    //   - Add (new phone_number_id): entitlement + cap check.
    if (existing) {
      // Update: entitlement only (same number being re-saved)
      const gated = await enforceWhatsappEntitled(supabase, accountId)
      if (gated) return gated
    } else {
      // Add: entitlement + per-plan numeric cap
      const gated = await enforceCanConnectWhatsapp(supabase, accountId)
      if (gated) return gated
    }

    // Reject if another account has already claimed this phone_number_id.
    // wacrm is single-tenant-per-WhatsApp-number — letting two accounts
    // bind the same number causes the webhook's `.single()` lookup to
    // throw PGRST116 ("multiple rows"), silently dropping every
    // inbound message. See issue #136.
    const { data: claimed, error: claimedError } = await supabaseAdmin()
      .from('whatsapp_config')
      .select('account_id')
      .eq('phone_number_id', phone_number_id)
      .neq('account_id', accountId)
      .maybeSingle()

    if (claimedError) {
      console.error('Error checking phone_number_id ownership:', claimedError)
      return NextResponse.json(
        { error: 'Failed to validate configuration' },
        { status: 500 }
      )
    }

    if (claimed) {
      return NextResponse.json(
        {
          error:
            'This WhatsApp phone number is already linked to another account on this instance. Each phone number can only be connected to one wacrm user.',
        },
        { status: 409 }
      )
    }

    // Verify credentials with Meta BEFORE saving
    let phoneInfo
    try {
      phoneInfo = await verifyPhoneNumber({
        phoneNumberId: phone_number_id,
        accessToken: access_token,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API verification failed during save:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 400 }
      )
    }

    // Encrypt sensitive tokens before storing
    let encryptedAccessToken: string
    let encryptedVerifyToken: string | null
    try {
      encryptedAccessToken = encrypt(access_token)
      encryptedVerifyToken = verify_token ? encrypt(verify_token) : null
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown encryption error'
      console.error('Encryption failed:', message)
      return NextResponse.json(
        {
          error:
            'Failed to encrypt token. Check that ENCRYPTION_KEY is a valid 64-character hex string in your environment variables.',
        },
        { status: 500 }
      )
    }

    const sameNumber =
      existing?.phone_number_id === phone_number_id &&
      existing?.registered_at != null

    // Step 1: register the phone number for inbound webhooks.
    //
    // Attempted on first save AND whenever the user supplies a fresh
    // PIN (e.g. they rotated the 2 PIN in Meta Manager). Skipped
    // when the same number is already registered and no PIN was
    // supplied — re-registering an already-active number with a
    // stale PIN would actually fail and undo the active subscription.
    let registeredAt: string | null = existing?.registered_at ?? null
    let registrationError: string | null = null
    // True when registration was deliberately skipped because no PIN
    // was supplied (see below). Distinct from registrationError — this
    // is not a failure, just an incomplete-but-valid save.
    let registrationSkipped = false

    const needsRegistration = !sameNumber || (typeof pin === 'string' && pin.length > 0)
    if (needsRegistration) {
      if (!pin) {
        // No PIN provided. Meta TEST numbers (Developer Console) are
        // pre-registered by Meta and expose no two-step verification
        // PIN to set, so requiring one made them impossible to connect
        // (issue #242). The /register + PIN step only matters for
        // production numbers under a shared WABA (issue #136), so treat
        // it as best-effort: skip it, save the (already Meta-verified)
        // credentials as connected, and leave registered_at null. The
        // UI surfaces a separate "Not registered" banner with a path to
        // add a PIN later for users who do need inbound webhook routing.
        registrationSkipped = true
      } else {
        try {
          await registerPhoneNumber({
            phoneNumberId: phone_number_id,
            accessToken: access_token,
            pin,
          })
          registeredAt = new Date().toISOString()
        } catch (err) {
          registrationError =
            err instanceof Error ? err.message : 'Unknown Meta API error'
          console.error('Phone number /register failed:', registrationError)
          // We deliberately fall through and still save the row so the
          // user can retry without re-entering everything. The UI
          // surfaces `last_registration_error` so they see WHY it's
          // not actually live yet.
        }
      }
    }

    // Step 2: subscribe the WABA to this app. Idempotent on Meta's
    // side, so we call on every save and persist the timestamp.
    // Skipped only when there's no waba_id (legacy rows from before
    // we required it).
    let subscribedAppsAt: string | null = null
    if (waba_id) {
      try {
        await subscribeWabaToApp({
          wabaId: waba_id,
          accessToken: access_token,
        })
        subscribedAppsAt = new Date().toISOString()
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.warn('WABA subscribed_apps failed (non-fatal):', message)
        // Subscription failures are rare once the App has the right
        // permissions; we don't block save on them — the diagnostic
        // endpoint surfaces this state too.
      }
    }

    // Persist everything in one shot. If /register failed we still
    // store the credentials and the error so the UI can guide the
    // user through a retry.
    const baseRow = {
      phone_number_id,
      waba_id: waba_id || null,
      access_token: encryptedAccessToken,
      verify_token: encryptedVerifyToken,
      status: registrationError ? 'disconnected' : 'connected',
      connected_at: registrationError ? null : new Date().toISOString(),
      registered_at: registrationError ? null : registeredAt,
      subscribed_apps_at: subscribedAppsAt ?? null,
      last_registration_error: registrationError,
      label: label || null,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      // Update the specific config row by its id (not by account_id,
      // which would incorrectly update ALL numbers for this account).
      const { error: updateError } = await supabase
        .from('whatsapp_config')
        .update(baseRow)
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error updating whatsapp_config:', updateError)
        return NextResponse.json(
          { error: 'Failed to update configuration' },
          { status: 500 }
        )
      }
    } else {
      // Insert new config row for this account. account_id is the
      // tenancy key, user_id is the audit column identifying which
      // member of the account saved the config.
      const { error: insertError } = await supabase
        .from('whatsapp_config')
        .insert({
          account_id: accountId,
          user_id: user.id,
          ...baseRow,
        })

      if (insertError) {
        console.error('Error inserting whatsapp_config:', insertError)
        return NextResponse.json(
          { error: 'Failed to save configuration' },
          { status: 500 }
        )
      }
    }

    if (registrationError) {
      // Save succeeded but the number isn't actually live. Return
      // 200 with a structured error so the UI can show the specific
      // remediation step instead of a generic toast.
      return NextResponse.json({
        success: false,
        saved: true,
        registered: false,
        registration_error: registrationError,
        phone_info: phoneInfo,
      })
    }

    return NextResponse.json({
      success: true,
      saved: true,
      registered: registeredAt != null,
      // Credentials are valid and saved, but inbound webhook
      // registration was skipped because no PIN was supplied (e.g. a
      // Meta test number). The UI shows the "Not registered" banner
      // rather than claiming the number is fully live.
      registration_skipped: registrationSkipped,
      phone_info: phoneInfo,
    })
  } catch (error) {
    console.error('Error in WhatsApp config POST:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/whatsapp/config
 *
 * Soft-deletes a specific WhatsApp number by setting status to
 * 'disconnected' and clearing the access token. Accepts
 * `config_id` in the request body to identify which number to
 * disconnect (supports multi-number accounts).
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accountId = await resolveAccountId(supabase, user.id)
    if (!accountId) {
      return NextResponse.json(
        { error: 'Your profile is not linked to an account.' },
        { status: 403 },
      )
    }

    // Parse config_id from request body
    let configId: string
    try {
      const body = await request.json()
      configId = body.config_id
    } catch {
      return NextResponse.json(
        { error: 'config_id is required in request body' },
        { status: 400 }
      )
    }

    if (!configId) {
      return NextResponse.json(
        { error: 'config_id is required' },
        { status: 400 }
      )
    }

    // Soft delete: set status to disconnected and clear tokens.
    // Scope by both id AND account_id so a user can't disconnect
    // another account's number.
    const { data: updated, error: updateError } = await supabase
      .from('whatsapp_config')
      .update({
        status: 'disconnected',
        access_token: null,
        verify_token: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', configId)
      .eq('account_id', accountId)
      .select('id')

    if (updateError) {
      console.error('Error soft-deleting whatsapp_config:', updateError)
      return NextResponse.json(
        { error: 'Failed to disconnect configuration' },
        { status: 500 }
      )
    }

    if (!updated || updated.length === 0) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in WhatsApp config DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
