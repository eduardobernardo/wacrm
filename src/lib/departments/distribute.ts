import type { SupabaseClient } from '@supabase/supabase-js';
import type { RouteTarget } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApplyRoutingOpts {
  /** user_id who initiated the transfer */
  transferredBy?: string;
  /** origin of the routing action */
  source: 'inbox' | 'flow' | 'automation' | 'broadcast';
  /** optional status override applied alongside the assignment */
  newStatus?: 'open' | 'pending';
}

// ---------------------------------------------------------------------------
// resolveAssignment
// ---------------------------------------------------------------------------

export async function resolveAssignment(
  db: SupabaseClient,
  accountId: string,
  target: RouteTarget,
): Promise<{ userId: string | null; departmentId: string | null }> {
  // ---- kind: 'user' ----
  if (target.kind === 'user') {
    return { userId: target.user_id, departmentId: null };
  }

  // ---- kind: 'department_user' ----
  if (target.kind === 'department_user') {
    const { data, error } = await db
      .from('department_members')
      .select('user_id')
      .eq('department_id', target.department_id)
      .eq('user_id', target.user_id)
      .single();

    if (error || !data) {
      throw new Error(
        `User ${target.user_id} is not a member of department ${target.department_id}`,
      );
    }
    return { userId: target.user_id, departmentId: target.department_id };
  }

  // ---- kind: 'department' ----
  // Fetch all members of the department
  const { data: members, error: membersErr } = await db
    .from('department_members')
    .select('user_id')
    .eq('department_id', target.department_id);

  if (membersErr) throw membersErr;

  if (!members || members.length === 0) {
    return { userId: null, departmentId: target.department_id };
  }

  const memberIds = members.map((m: { user_id: string }) => m.user_id);

  // ---- strategy: 'auto' ----
  if (target.strategy === 'auto') {
    return resolveAuto(db, accountId, memberIds, target.department_id);
  }

  // ---- strategy: 'sequential' ----
  return resolveSequential(db, accountId, memberIds, target.department_id);
}

// ---------------------------------------------------------------------------
// Auto strategy — fewest open/pending conversations
// ---------------------------------------------------------------------------

async function resolveAuto(
  db: SupabaseClient,
  accountId: string,
  memberIds: string[],
  departmentId: string,
): Promise<{ userId: string | null; departmentId: string }> {
  // Count open/pending conversations per member, scoped to this account.
  const counts = new Map<string, number>();
  for (const uid of memberIds) counts.set(uid, 0);

  const { data: convs, error: convsErr } = await db
    .from('conversations')
    .select('assigned_agent_id')
    .eq('account_id', accountId)
    .in('assigned_agent_id', memberIds)
    .in('status', ['open', 'pending']);

  if (convsErr) throw convsErr;

  if (convs) {
    for (const row of convs as { assigned_agent_id: string }[]) {
      const prev = counts.get(row.assigned_agent_id) ?? 0;
      counts.set(row.assigned_agent_id, prev + 1);
    }
  }

  // Pick the member with the fewest conversations (first in list on tie)
  let bestId = memberIds[0];
  let bestCount = counts.get(bestId) ?? 0;

  for (let i = 1; i < memberIds.length; i++) {
    const uid = memberIds[i];
    const c = counts.get(uid) ?? 0;
    if (c < bestCount) {
      bestId = uid;
      bestCount = c;
    }
  }

  return { userId: bestId, departmentId };
}

// ---------------------------------------------------------------------------
// Sequential strategy — round-robin cursor
// ---------------------------------------------------------------------------

async function resolveSequential(
  db: SupabaseClient,
  accountId: string,
  memberIds: string[],
  departmentId: string,
): Promise<{ userId: string; departmentId: string }> {
  // Sort members by created_at so the order is deterministic
  const { data: orderedMembers } = await db
    .from('department_members')
    .select('user_id')
    .eq('department_id', departmentId)
    .order('created_at', { ascending: true });

  const ordered = (orderedMembers as { user_id: string }[] | null) ?? [];
  const orderedIds = ordered.map((m) => m.user_id);

  if (orderedIds.length === 0) {
    // Shouldn't happen because we already checked members, but be safe
    return { userId: memberIds[0], departmentId };
  }

  // Read current cursor
  const { data: dept } = await db
    .from('departments')
    .select('last_assigned_user_id')
    .eq('id', departmentId)
    .eq('account_id', accountId)
    .single();

  const cursor = (dept as { last_assigned_user_id: string | null } | null)
    ?.last_assigned_user_id;

  // Find position of cursor in the ordered list
  let idx = -1;
  if (cursor) {
    idx = orderedIds.indexOf(cursor);
  }

  // Advance to next (wrap around)
  const nextIdx = (idx + 1) % orderedIds.length;
  const nextUserId = orderedIds[nextIdx];

  // Update cursor.
  // NOTE: This read-then-write across two round trips is NOT atomic.
  // Two concurrent callers can both read the same cursor and assign
  // the same member.  For production, replace with a single UPDATE …
  // RETURNING via an RPC that locks the department row.
  const { error: updateErr } = await db
    .from('departments')
    .update({ last_assigned_user_id: nextUserId })
    .eq('id', departmentId)
    .eq('account_id', accountId);

  if (updateErr) throw updateErr;

  return { userId: nextUserId, departmentId };
}

// ---------------------------------------------------------------------------
// applyRouting
// ---------------------------------------------------------------------------

export async function applyRouting(
  db: SupabaseClient,
  conversationId: string,
  accountId: string,
  target: RouteTarget,
  opts?: ApplyRoutingOpts,
): Promise<void> {
  // Fetch current conversation state for audit trail before mutation.
  let fromAgentId: string | null = null;

  if (opts?.transferredBy) {
    const { data: current } = await db
      .from('conversations')
      .select('assigned_agent_id')
      .eq('id', conversationId)
      .single();

    if (current) {
      fromAgentId = (
        current as { assigned_agent_id: string | null }
      ).assigned_agent_id;
    }
  }

  // 1. Resolve the assignment
  const result = await resolveAssignment(db, accountId, target);

  // Build update payload
  const update: Record<string, unknown> = {
    department_id: result.departmentId,
    assigned_agent_id: result.userId,
    updated_at: new Date().toISOString(),
  };
  if (opts?.newStatus) {
    update.status = opts.newStatus;
  }

  // 2. Update the conversation
  await db
    .from('conversations')
    .update(update)
    .eq('id', conversationId);

  // 3. Insert audit row if requested
  if (opts?.transferredBy) {
    const strategyDesc =
      target.kind === 'user'
        ? 'manual'
        : target.kind === 'department_user'
          ? 'manual'
          : target.strategy;

    await db.from('conversation_transfers').insert({
      account_id: accountId,
      conversation_id: conversationId,
      from_agent_id: fromAgentId,
      to_agent_id: result.userId,
      to_department_id: result.departmentId,
      strategy: strategyDesc,
      transferred_by_user_id: opts.transferredBy,
      source: opts.source,
    });
  }
}
