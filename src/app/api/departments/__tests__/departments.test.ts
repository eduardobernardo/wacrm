import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountContext } from '@/lib/auth/account';
import type { AccountRole } from '@/lib/auth/roles';

// ---------------------------------------------------------------------------
// Mock auth module — must be declared before imports that use it
// ---------------------------------------------------------------------------

const mockRequireRole = vi.fn();
const mockGetCurrentAccount = vi.fn();

vi.mock('@/lib/auth/account', () => ({
  requireRole: (role: string) => mockRequireRole(role),
  getCurrentAccount: () => mockGetCurrentAccount(),
  toErrorResponse: (err: unknown) => {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  },
}));

// ---------------------------------------------------------------------------
// Lightweight chainable mock Supabase client (adapted from distribute.test.ts)
// ---------------------------------------------------------------------------

interface MockCall {
  method: string;
  args: unknown[];
}

/**
 * Build a chainable mock that records every call and resolves with
 * controlled responses keyed by table name.
 *
 * The mock walks the chain: from() → select/insert/update/delete → eq/… →
 * single/then.  We intercept the terminal promise and return the
 * pre-configured response for the *last* `.from()` table.
 *
 * For responses that already contain an `error` property (e.g.
 * `{ data: null, error: { code: '23505' } }` or `{ error: null, count: 1 }`),
 * the whole object is returned as-is.  Otherwise the response is wrapped
 * in `{ data: <response>, error: null }`.
 */
function createMockDb(
  responses: Record<string, unknown>,
  calls: MockCall[],
) {
  let currentTable = '';

  function chain(): Record<string, unknown> {
    const c: Record<string, unknown> = {};

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
    c.delete = (...args: unknown[]) => {
      calls.push({ method: 'delete', args });
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
      const resp = responses[currentTable];
      if (
        resp &&
        typeof resp === 'object' &&
        'error' in (resp as Record<string, unknown>)
      ) {
        return Promise.resolve(resp);
      }
      return Promise.resolve({ data: resp ?? null, error: null });
    };
    // Terminal thenable — used when the code awaits the chain directly
    // (e.g. `.delete(…).eq(…).eq(…)` without `.single()`).
    c.then = (
      onFulfilled: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      const resp = responses[currentTable];
      const resolved =
        resp &&
        typeof resp === 'object' &&
        'error' in (resp as Record<string, unknown>)
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
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT = 'acct-1';
const DEPT_ID = 'dept-1';
const USER_ID = 'user-1';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAdminCtx(
  mockDb: SupabaseClient,
): AccountContext {
  return {
    supabase: mockDb,
    userId: USER_ID,
    accountId: ACCOUNT,
    role: 'admin' as AccountRole,
    account: { id: ACCOUNT, name: 'Test Account' },
  };
}

/**
 * Create a mock Request with a JSON body.
 */
function makeJsonRequest(
  body: unknown,
  url = 'http://localhost/api/departments',
  method = 'POST',
): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Create a mock Request with no body (for GET/DELETE with query params).
 */
function makeRequest(
  url: string,
  method = 'GET',
): Request {
  return new Request(url, { method });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/departments (create)', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
  });

  it('returns 400 when name is missing', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ description: 'some desc' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 400 when name is empty string', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: '   ' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it('returns 201 with department on success', async () => {
    const dept = { id: DEPT_ID, name: 'Sales', account_id: ACCOUNT };
    const db = createMockDb({ departments: dept }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: 'Sales' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.department).toMatchObject({ id: DEPT_ID, name: 'Sales' });
  });

  it('defaults color to "slate" when omitted', async () => {
    const db = createMockDb({ departments: { id: DEPT_ID, name: 'Sales' } }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: 'Sales' });
    await POST(req);

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toMatchObject({ color: 'slate' });
  });

  it('accepts a valid color from the curated palette', async () => {
    const db = createMockDb({ departments: { id: DEPT_ID, name: 'Sales' } }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: 'Sales', color: 'teal' });
    await POST(req);

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toMatchObject({ color: 'teal' });
  });

  it('falls back to "slate" when color is not in the palette', async () => {
    const db = createMockDb({ departments: { id: DEPT_ID, name: 'Sales' } }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: 'Sales', color: 'neon-pink' });
    await POST(req);

    const insertCall = calls.find((c) => c.method === 'insert');
    expect(insertCall?.args[0]).toMatchObject({ color: 'slate' });
  });

  it('returns 409 on unique violation (duplicate name)', async () => {
    const db = createMockDb(
      {
        departments: {
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../route');
    const req = makeJsonRequest({ name: 'Sales' });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });
});

describe('PATCH /api/departments/[id] (update)', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
  });

  it('returns 400 when name is empty string', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { PATCH } = await import('../[id]/route');
    const req = makeJsonRequest(
      { name: '   ' },
      'http://localhost/api/departments/dept-1',
      'PATCH',
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/non-empty/i);
  });

  it('returns 200 with updated department on success', async () => {
    const updated = {
      id: DEPT_ID,
      name: 'Marketing',
      account_id: ACCOUNT,
    };
    const db = createMockDb({ departments: updated }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { PATCH } = await import('../[id]/route');
    const req = makeJsonRequest(
      { name: 'Marketing' },
      'http://localhost/api/departments/dept-1',
      'PATCH',
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.department).toMatchObject({ id: DEPT_ID, name: 'Marketing' });
  });

  it('returns 409 on unique violation', async () => {
    const db = createMockDb(
      {
        departments: {
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { PATCH } = await import('../[id]/route');
    const req = makeJsonRequest(
      { name: 'ExistingDept' },
      'http://localhost/api/departments/dept-1',
      'PATCH',
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already exists/i);
  });

  it('accepts a valid color in the update payload', async () => {
    const updated = { id: DEPT_ID, name: 'Sales', color: 'amber' };
    const db = createMockDb({ departments: updated }, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { PATCH } = await import('../[id]/route');
    const req = makeJsonRequest(
      { color: 'amber' },
      'http://localhost/api/departments/dept-1',
      'PATCH',
    );
    await PATCH(req, { params: Promise.resolve({ id: DEPT_ID }) });

    const updateCall = calls.find((c) => c.method === 'update');
    expect(updateCall?.args[0]).toMatchObject({ color: 'amber' });
  });

  it('rejects an invalid color in the update payload with 400', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { PATCH } = await import('../[id]/route');
    const req = makeJsonRequest(
      { color: 'neon-pink' },
      'http://localhost/api/departments/dept-1',
      'PATCH',
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/color/i);
  });
});

describe('POST /api/departments/[id]/members (add member)', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
  });

  it('returns 400 when user_id is missing', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../[id]/members/route');
    const req = makeJsonRequest({});
    const res = await POST(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/user_id/i);
  });

  it('returns 400 when user_id is not an account member', async () => {
    const db = createMockDb(
      {
        // dept exists
        departments: { id: DEPT_ID },
        // user profile not found in account
        profiles: {
          data: null,
          error: { message: 'Row not found', code: 'PGRST116' },
        },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../[id]/members/route');
    const req = makeJsonRequest({ user_id: 'stranger' });
    const res = await POST(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not an account member/i);
  });

  it('returns 409 when user is already a member', async () => {
    const db = createMockDb(
      {
        // dept exists
        departments: { id: DEPT_ID },
        // user is an account member
        profiles: { user_id: USER_ID },
        // insert fails with unique violation
        department_members: {
          data: null,
          error: { code: '23505', message: 'duplicate key value' },
        },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../[id]/members/route');
    const req = makeJsonRequest({ user_id: USER_ID });
    const res = await POST(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toMatch(/already a member/i);
  });

  it('returns 201 on success', async () => {
    const member = {
      id: 'dm-1',
      account_id: ACCOUNT,
      department_id: DEPT_ID,
      user_id: USER_ID,
    };
    const db = createMockDb(
      {
        departments: { id: DEPT_ID },
        profiles: { user_id: USER_ID },
        department_members: member,
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { POST } = await import('../[id]/members/route');
    const req = makeJsonRequest({ user_id: USER_ID });
    const res = await POST(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.member).toMatchObject({
      id: 'dm-1',
      user_id: USER_ID,
      department_id: DEPT_ID,
    });
  });
});

describe('DELETE /api/departments/[id]/members (remove member)', () => {
  let calls: MockCall[];

  beforeEach(() => {
    calls = [];
    vi.clearAllMocks();
  });

  it('returns 400 when user_id is missing', async () => {
    const db = createMockDb({}, calls);
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { DELETE } = await import('../[id]/members/route');
    // No user_id in query string or body
    const req = makeRequest(
      'http://localhost/api/departments/dept-1/members',
      'DELETE',
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/user_id/i);
  });

  it('returns 200 on success', async () => {
    const db = createMockDb(
      {
        department_members: { error: null, count: 1 },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { DELETE } = await import('../[id]/members/route');
    // Pass user_id as query param
    const req = makeRequest(
      `http://localhost/api/departments/${DEPT_ID}/members?user_id=${USER_ID}`,
      'DELETE',
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 404 when membership not found', async () => {
    const db = createMockDb(
      {
        department_members: { error: null, count: 0 },
      },
      calls,
    );
    mockRequireRole.mockResolvedValue(makeAdminCtx(db));

    const { DELETE } = await import('../[id]/members/route');
    const req = makeRequest(
      `http://localhost/api/departments/${DEPT_ID}/members?user_id=${USER_ID}`,
      'DELETE',
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: DEPT_ID }),
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });
});
