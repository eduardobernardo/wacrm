import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ForbiddenError } from "@/lib/auth/account";
import {
  assertCanConnectWhatsapp,
  assertWhatsappEntitled,
  assertWithinLimit,
  effectiveMaxMembers,
  effectiveTier,
  getSubscription,
  type Subscription,
} from "./subscription";

// ------------------------------------------------------------
// Minimal fake Supabase client.
//
// Supports the two shapes this module uses:
//   - subscriptions row:  .from().select().eq().maybeSingle()
//   - count query:        await .from().select('*',{count,head}).eq()[.gte()]
// The query builder is thenable so `await query` resolves to a
// { count, error } result, matching the real client.
// ------------------------------------------------------------
function fakeClient(opts: {
  subRow?: Record<string, unknown> | null;
  counts?: Record<string, number>;
}): SupabaseClient {
  const counts = opts.counts ?? {};
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      Object.assign(builder, {
        select: () => builder,
        eq: () => builder,
        gte: () => builder,
        maybeSingle: () =>
          Promise.resolve(
            table === "subscriptions"
              ? { data: opts.subRow ?? null, error: null }
              : { data: null, error: null },
          ),
        then: (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
          Promise.resolve({ count: counts[table] ?? 0, error: null }).then(onF, onR),
      });
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function subRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    account_id: "acct-1",
    plan: "pro",
    status: "active",
    stripe_customer_id: "cus_1",
    stripe_subscription_id: "sub_1",
    current_period_end: null,
    cancel_at_period_end: false,
    trial_ends_at: null,
    extra_seats: 0,
    ...over,
  };
}

describe("getSubscription", () => {
  it("falls back to free when no row exists", async () => {
    const sub = await getSubscription(fakeClient({ subRow: null }), "acct-1");
    expect(sub.plan).toBe("free");
    expect(sub.status).toBe("active");
  });

  it("maps a DB row to camelCase", async () => {
    const sub = await getSubscription(
      fakeClient({ subRow: subRow({ extra_seats: 3 }) }),
      "acct-1",
    );
    expect(sub.plan).toBe("pro");
    expect(sub.extraSeats).toBe(3);
    expect(sub.stripeCustomerId).toBe("cus_1");
  });
});

describe("effectiveTier", () => {
  const base: Subscription = {
    accountId: "a",
    plan: "pro",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    extraSeats: 0,
  };

  it("honours the plan while entitled", () => {
    expect(effectiveTier({ ...base, status: "active" })).toBe("pro");
    expect(effectiveTier({ ...base, status: "trialing" })).toBe("pro");
    expect(effectiveTier({ ...base, status: "past_due" })).toBe("pro");
  });

  it("drops to free on a dead subscription", () => {
    expect(effectiveTier({ ...base, status: "canceled" })).toBe("free");
    expect(effectiveTier({ ...base, status: "incomplete" })).toBe("free");
  });
});

describe("effectiveMaxMembers", () => {
  const base: Subscription = {
    accountId: "a",
    plan: "pro",
    status: "active",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    trialEndsAt: null,
    extraSeats: 0,
  };

  it("adds extra seats to the plan base when entitled", () => {
    // pro base is 5
    expect(effectiveMaxMembers({ ...base, extraSeats: 2 })).toBe(7);
  });

  it("ignores extra seats on a canceled subscription (free base)", () => {
    expect(effectiveMaxMembers({ ...base, status: "canceled", extraSeats: 9 })).toBe(1);
  });
});

describe("assertWhatsappEntitled", () => {
  it("blocks the free plan", async () => {
    await expect(
      assertWhatsappEntitled(fakeClient({ subRow: subRow({ plan: "free" }) }), "acct-1"),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows a paid plan", async () => {
    await expect(
      assertWhatsappEntitled(fakeClient({ subRow: subRow({ plan: "pro" }) }), "acct-1"),
    ).resolves.toBeUndefined();
  });
});

describe("assertCanConnectWhatsapp", () => {
  it("blocks once the per-plan number cap is reached", async () => {
    // pro allows 1; already has 1 connected
    await expect(
      assertCanConnectWhatsapp(
        fakeClient({ subRow: subRow({ plan: "pro" }), counts: { whatsapp_config: 1 } }),
        "acct-1",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows when under the cap", async () => {
    await expect(
      assertCanConnectWhatsapp(
        fakeClient({ subRow: subRow({ plan: "pro" }), counts: { whatsapp_config: 0 } }),
        "acct-1",
      ),
    ).resolves.toBeUndefined();
  });
});

describe("assertWithinLimit", () => {
  it("throws when at the limit", async () => {
    // pro automations cap is 10
    await expect(
      assertWithinLimit(
        fakeClient({ subRow: subRow({ plan: "pro" }), counts: { automations: 10 } }),
        "acct-1",
        "automations",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("passes when under the limit", async () => {
    await expect(
      assertWithinLimit(
        fakeClient({ subRow: subRow({ plan: "pro" }), counts: { automations: 3 } }),
        "acct-1",
        "automations",
      ),
    ).resolves.toBeUndefined();
  });

  it("never caps an unlimited (business) resource", async () => {
    await expect(
      assertWithinLimit(
        fakeClient({
          subRow: subRow({ plan: "business" }),
          counts: { automations: 9999 },
        }),
        "acct-1",
        "automations",
      ),
    ).resolves.toBeUndefined();
  });

  it("blocks a free account from creating gated resources", async () => {
    await expect(
      assertWithinLimit(
        fakeClient({ subRow: subRow({ plan: "free" }), counts: { automations: 0 } }),
        "acct-1",
        "automations",
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
