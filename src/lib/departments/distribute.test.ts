import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RouteTarget } from './types';

// ---------------------------------------------------------------------------
// Lightweight mock Supabase client
// ---------------------------------------------------------------------------

interface MockCall {
  method: string;
  args: unknown[];
}

/**
 * Mark a value as a list of sequential responses for a single table.
 * Each call to `.single()` or terminal `then` consumes the next item.
 */
function multi(...responses: unknown[]) {
  return { _multi: responses };
}

/**
 * Build a chainable mock that records every call and resolves with
 * controlled responses keyed by table name.
 */
function createMockDb(
  responses: Record<string, unknown>,
  calls: MockCall[],
) {
  // Per-table response map — each value is the final resolved payload.
  // The mock walks the chain: from() → select/insert/update → eq/… →
  // single/then.  We only need to intercept the terminal promise and
  // return the pre-configured response for the *last* `.from()` table.

  let currentTable = '';
  const callCount: Record<string, number> = {};

  function getResponse(table: string): unknown {
    const resp = responses[table];
    if (
      resp &&
      typeof resp === 'object' &&
      '_multi' in (resp as Record<string, unknown>)
    ) {
      const arr = (resp as { _multi: unknown[] })._multi;
      const idx = callCount[table] ?? 0;
      callCount[table] = idx + 1;
      return arr[idx] ?? null;
    }
    return resp;
  }

  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};

    // Each chain method returns itself so we can keep chaining.
    c.select = (...args: unknown[]) => {
      calls.push({ method: 'select', args });
      return chain();
    };
    c.insert = (...args: unknown[]) => {
      calls.push({ method: 'insert', args });
      return chain();
    };
    c.update = (...args: unknown[]) => {
      calls.push({ method: 'update', args });
      return chain();
    };
    c.eq = (...args: unknown[]) => {
      calls.push({ method: 'eq', args });
      return chain();
    };
    c.in = (...args: unknown[]) => {
      calls.push({ method: 'in', args });
      return chain();
    };
    c.order = (...args: unknown[]) => {
      calls.push({ method: 'order', args });
      return chain();
    };
    c.single = () => {
      const resp = getResponse(currentTable);
      if (resp && typeof resp === 'object' && 'error' in (resp as Record<string, unknown>)) {
        return Promise.resolve(resp);
      }
      return Promise.resolve({ data: resp ?? null, error: null });
    };
    // Terminal thenable — used when the code awaits the chain directly
    // (e.g. `.update(…).eq(…).eq(…)` without `.single()`).
    c.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      const resp = getResponse(currentTable);
      const resolved =
        resp && typeof resp === 'object' && 'error' in (resp as Record<string, unknown>)
          ? resp
          : { data: resp ?? null, error: null };
      return Promise.resolve(resolved).then(onFulfilled, onRejected);
    };

    return c;
  }

  const db = {
    from: (table: string) => {
      currentTable = table;
      calls.push({ method: 'from', args: [table] });
      return chain();
    },
  };

  return db as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const ACCOUNT = 'acct-1';
const DEPT = 'dept-1';
const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('resolveAssignment', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
  });

  it('kind: user → returns userId, null departmentId', async () => {
    const db = createMockDb(
      { profiles: { user_id: USER_A } },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = { kind: 'user', user_id: USER_A };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: USER_A, departmentId: null });
  });

  it('kind: department_user with valid member → returns user + dept', async () => {
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: { user_id: USER_A },
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department_user',
      department_id: DEPT,
      user_id: USER_A,
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: USER_A, departmentId: DEPT });
  });

  it('kind: department_user with invalid member → throws', async () => {
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: {
          data: null,
          error: { message: 'Row not found', code: 'PGRST116' },
        },
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department_user',
      department_id: DEPT,
      user_id: 'unknown-user',
    };

    await expect(resolveAssignment(db, ACCOUNT, target)).rejects.toThrow(
      /not a member/,
    );
  });

  it('kind: department + auto → picks member with fewest open/pending conversations', async () => {
    // Members: A, B, C.  A has 3 open/pending, B has 1, C has 2.
    // Responses keyed by table name in call order:
    //   1. departments → ownership check
    //   2. department_members → member list
    //   3. conversations → all open/pending assigned to any member
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: [
          { user_id: USER_A },
          { user_id: USER_B },
          { user_id: USER_C },
        ],
        conversations: [
          { assigned_agent_id: USER_A },
          { assigned_agent_id: USER_A },
          { assigned_agent_id: USER_A },
          { assigned_agent_id: USER_B },
          { assigned_agent_id: USER_C },
          { assigned_agent_id: USER_C },
        ],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'auto',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: USER_B, departmentId: DEPT });
  });

  it('kind: department + auto with equal counts → picks first member (stable)', async () => {
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: [
          { user_id: USER_A },
          { user_id: USER_B },
        ],
        conversations: [
          { assigned_agent_id: USER_A },
          { assigned_agent_id: USER_B },
        ],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'auto',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    // Both have 1 — first in list wins
    expect(result).toEqual({ userId: USER_A, departmentId: DEPT });
  });

  it('kind: department + auto with no members → returns null userId', async () => {
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: [],
        conversations: [],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'auto',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: null, departmentId: DEPT });
  });

  it('kind: department + sequential → picks next member after cursor', async () => {
    // Ordered members: A, B, C.  Cursor currently on A → next is B.
    const db = createMockDb(
      {
        // Call order:
        //   1. departments (ownership check)
        //   2. department_members (unfiltered for initial member check)
        //   3. department_members (ordered for sequential)
        //   4. departments (read cursor)
        //   5. departments (update cursor)
        departments: multi(
          { id: DEPT },
          { last_assigned_user_id: USER_A },
          null,
        ),
        department_members: [
          { user_id: USER_A },
          { user_id: USER_B },
          { user_id: USER_C },
        ],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'sequential',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: USER_B, departmentId: DEPT });
  });

  it('kind: department + sequential wraps around from last to first', async () => {
    // Ordered members: A, B, C.  Cursor currently on C → wraps to A.
    const db = createMockDb(
      {
        departments: multi(
          { id: DEPT },
          { last_assigned_user_id: USER_C },
          null,
        ),
        department_members: [
          { user_id: USER_A },
          { user_id: USER_B },
          { user_id: USER_C },
        ],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'sequential',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    expect(result).toEqual({ userId: USER_A, departmentId: DEPT });
  });

  it('kind: department + sequential with null cursor → picks first member', async () => {
    const db = createMockDb(
      {
        departments: multi(
          { id: DEPT },
          { last_assigned_user_id: null },
          null,
        ),
        department_members: [
          { user_id: USER_A },
          { user_id: USER_B },
        ],
      },
      calls,
    );
    const { resolveAssignment } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department',
      department_id: DEPT,
      strategy: 'sequential',
    };
    const result = await resolveAssignment(db, ACCOUNT, target);

    // idx starts at -1, next = (-1+1) % 2 = 0 → first member
    expect(result).toEqual({ userId: USER_A, departmentId: DEPT });
  });
});

describe('applyRouting', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
  });

  it('updates conversation with correct dept + assignee + status', async () => {
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: { user_id: USER_A },
        conversations: null,
      },
      calls,
    );
    const { applyRouting } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department_user',
      department_id: DEPT,
      user_id: USER_A,
    };
    await applyRouting(db, 'conv-1', ACCOUNT, target, {
      source: 'inbox',
      newStatus: 'open',
    });

    // Should have called conversations.update and conversations (then)
    const updateCalls = calls.filter((c) => c.method === 'update');
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);

    // The update payload should contain the assignment fields
    const updatePayload = updateCalls[0].args[0] as Record<string, unknown>;
    expect(updatePayload).toMatchObject({
      department_id: DEPT,
      assigned_agent_id: USER_A,
      status: 'open',
    });
    expect(updatePayload).toHaveProperty('updated_at');
  });

  it('inserts audit row with correct source + from/to when transferredBy set', async () => {
    // Mock responses: departments (ownership check), department_members (for resolveAssignment),
    // then conversations (for pre-fetch of current state), then insert.
    const db = createMockDb(
      {
        departments: { id: DEPT },
        department_members: { user_id: USER_B },
        conversations: {
          assigned_agent_id: USER_A,
          account_id: ACCOUNT,
        },
        conversation_transfers: null,
      },
      calls,
    );
    const { applyRouting } = await import('./distribute');

    const target: RouteTarget = {
      kind: 'department_user',
      department_id: DEPT,
      user_id: USER_B,
    };
    await applyRouting(db, 'conv-1', ACCOUNT, target, {
      source: 'automation',
      transferredBy: 'admin-user',
    });

    // Find the insert call
    const insertCalls = calls.filter((c) => c.method === 'insert');
    expect(insertCalls.length).toBeGreaterThanOrEqual(1);

    const auditPayload = insertCalls[0].args[0] as Record<string, unknown>;
    expect(auditPayload).toMatchObject({
      account_id: ACCOUNT,
      conversation_id: 'conv-1',
      from_agent_id: USER_A,
      to_agent_id: USER_B,
      to_department_id: DEPT,
      transferred_by_user_id: 'admin-user',
      source: 'automation',
    });
    expect(auditPayload).toHaveProperty('strategy');
  });

  it('does not insert audit row when transferredBy is not set', async () => {
    const db = createMockDb(
      {
        profiles: { user_id: USER_A },
        conversations: null,
      },
      calls,
    );
    const { applyRouting } = await import('./distribute');

    const target: RouteTarget = { kind: 'user', user_id: USER_A };
    await applyRouting(db, 'conv-1', ACCOUNT, target, { source: 'flow' });

    const insertCalls = calls.filter((c) => c.method === 'insert');
    expect(insertCalls).toHaveLength(0);
  });
});
