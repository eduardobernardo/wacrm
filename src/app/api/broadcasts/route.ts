import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { enforceLimit } from '@/lib/billing/subscription'

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('agent')

    // Plan limit: number of broadcasts per month.
    const limited = await enforceLimit(ctx.supabase, ctx.accountId, 'broadcasts')
    if (limited) return limited

    const body = await request.json().catch(() => null)
    if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

    const {
      name,
      template_name,
      template_language,
      template_variables,
      audience_filter,
      reply_routing,
      status,
      total_recipients,
    } = body

    if (!name || !template_name) {
      return NextResponse.json(
        { error: 'name and template_name are required' },
        { status: 400 },
      )
    }

    const { data: broadcast, error: insertErr } = await ctx.supabase
      .from('broadcasts')
      .insert({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        name,
        template_name,
        template_language: template_language ?? 'en_US',
        template_variables: template_variables ?? {},
        audience_filter: audience_filter ?? {},
        reply_routing: reply_routing ?? null,
        status: status ?? 'draft',
        total_recipients: total_recipients ?? 0,
        sent_count: 0,
        delivered_count: 0,
        read_count: 0,
        replied_count: 0,
        failed_count: 0,
      })
      .select()
      .single()

    if (insertErr || !broadcast) {
      return NextResponse.json(
        { error: insertErr?.message ?? 'insert failed' },
        { status: 500 },
      )
    }

    return NextResponse.json({ broadcast }, { status: 201 })
  } catch (err) {
    return toErrorResponse(err)
  }
}
