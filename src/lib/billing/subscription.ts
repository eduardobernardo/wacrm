// ============================================================
// Server-side subscription context — for API routes and server
// components. Reads an account's billing row and enforces plan
// limits.
//
// IMPORTANT: server-only (it's used from route handlers). It takes
// a Supabase client + accountId rather than importing the SSR
// client itself, so it composes with both the `AccountContext`
// from `@/lib/auth/account` (RLS-scoped) and the inline
// account-resolution in the WhatsApp config route.
//
// Calling convention in a route:
//
//   const ctx = await requireRole("admin");
//   await assertWithinLimit(ctx.supabase, ctx.accountId, "broadcasts");
//   // ... proceed with the create
//
// Throws `ForbiddenError` (reused from account.ts → 403) with an
// upgrade-prompt message when a limit is hit.
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

import { ForbiddenError, toErrorResponse } from "@/lib/auth/account";
import { NextResponse } from "next/server";
import {
  PLANS,
  ENTITLED_STATUSES,
  effectiveTier,
  effectiveMaxMembers,
  getPlanLimits,
  isUnlimited,
  type PlanLimits,
  type PlanTier,
  type SubInfo,
} from "./plans";

export { effectiveTier, effectiveMaxMembers, ENTITLED_STATUSES } from "./plans";
export type { SubInfo } from "./plans";

export interface Subscription {
  accountId: string;
  plan: PlanTier;
  status: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  extraSeats: number;
}

/**
 * Read an account's subscription. Falls back to a synthetic `free`
 * row if none exists (defensive — the bootstrap trigger should
 * always create one, but a missing row must never grant paid
 * access).
 */
export async function getSubscription(
  supabase: SupabaseClient,
  accountId: string,
): Promise<Subscription> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select(
      "account_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, cancel_at_period_end, trial_ends_at, extra_seats",
    )
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) {
    console.error("[getSubscription] fetch error:", error);
  }

  if (!data) {
    return {
      accountId,
      plan: "free",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      extraSeats: 0,
    };
  }

  return {
    accountId: data.account_id,
    plan: data.plan,
    status: data.status,
    stripeCustomerId: data.stripe_customer_id,
    stripeSubscriptionId: data.stripe_subscription_id,
    currentPeriodEnd: data.current_period_end,
    cancelAtPeriodEnd: data.cancel_at_period_end,
    trialEndsAt: data.trial_ends_at,
    extraSeats: data.extra_seats ?? 0,
  };
}

// ------------------------------------------------------------
// Limit enforcement
// ------------------------------------------------------------

/** Resources whose creation is capped per plan. */
export type LimitResource =
  | "members"
  | "contacts"
  | "automations"
  | "flows"
  | "broadcasts";

interface ResourceSpec {
  /** Table to count existing rows in. */
  table: string;
  /** Limit field on PlanLimits. */
  limit: keyof PlanLimits;
  /** Verb phrase for the upgrade message: "... criar mais X". */
  noun: string;
  /** When true, only count rows created in the current month. */
  monthly?: boolean;
}

const RESOURCE_SPECS: Record<LimitResource, ResourceSpec> = {
  members: { table: "profiles", limit: "maxMembers", noun: "membros" },
  contacts: { table: "contacts", limit: "maxContacts", noun: "contatos" },
  automations: { table: "automations", limit: "maxAutomations", noun: "automações" },
  flows: { table: "flows", limit: "maxFlows", noun: "fluxos" },
  broadcasts: {
    table: "broadcasts",
    limit: "monthlyBroadcasts",
    noun: "transmissões neste mês",
    monthly: true,
  },
};

function startOfMonthISO(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Throw `ForbiddenError` if creating one more `resource` would
 * exceed the account's plan limit. Members use the seat-adjusted
 * allowance (plan base + extra_seats); everything else uses the
 * plan's flat cap.
 */
export async function assertWithinLimit(
  supabase: SupabaseClient,
  accountId: string,
  resource: LimitResource,
): Promise<void> {
  const sub = await getSubscription(supabase, accountId);
  const spec = RESOURCE_SPECS[resource];

  const limit =
    resource === "members"
      ? effectiveMaxMembers(sub)
      : getPlanLimits(effectiveTier(sub))[spec.limit];

  if (isUnlimited(limit)) return;

  let query = supabase
    .from(spec.table)
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

  if (spec.monthly) {
    query = query.gte("created_at", startOfMonthISO());
  }

  const { count, error } = await query;
  if (error) {
    console.error(`[assertWithinLimit] count error for ${resource}:`, error);
    // Fail closed only for the hard paywall (limit 0); otherwise
    // don't block a legit action on a transient count failure.
    if (limit === 0) throw new ForbiddenError(upgradeMessage(sub.plan, spec.noun));
    return;
  }

  if ((count ?? 0) >= limit) {
    throw new ForbiddenError(upgradeMessage(sub.plan, spec.noun));
  }
}

/**
 * Throw `ForbiddenError` if the account's plan can't connect WhatsApp
 * at all (`free` has maxWhatsappNumbers === 0). This is the primary
 * free→paid paywall. Entitlement-only (no row count), so it's safe to
 * call on every save — including *updating* an already-connected
 * number (which a count check would wrongly block at the 1-number cap).
 * The per-account "only one number" rule is enforced by the
 * `whatsapp_config UNIQUE(account_id)` DB constraint today.
 */
export async function assertWhatsappEntitled(
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> {
  const sub = await getSubscription(supabase, accountId);
  const max = getPlanLimits(effectiveTier(sub)).maxWhatsappNumbers;

  if (max <= 0) {
    throw new ForbiddenError(
      "Conectar o WhatsApp requer um plano Pro ou Business. Faça upgrade em Configurações → Plano e cobrança.",
    );
  }
}

/**
 * Throw `ForbiddenError` unless the account may connect *another*
 * WhatsApp number — entitlement plus the per-plan numeric cap.
 *
 * NOT used today: the current product allows one number per account,
 * already enforced by `whatsapp_config UNIQUE(account_id)`, and the
 * save route updates in place. This helper is the call site for the
 * future Business multi-number plan — once that UNIQUE is relaxed,
 * the "add a number" path will call this instead of
 * `assertWhatsappEntitled`.
 */
export async function assertCanConnectWhatsapp(
  supabase: SupabaseClient,
  accountId: string,
): Promise<void> {
  await assertWhatsappEntitled(supabase, accountId);

  const sub = await getSubscription(supabase, accountId);
  const max = getPlanLimits(effectiveTier(sub)).maxWhatsappNumbers;

  if (isUnlimited(max)) return;

  const { count, error } = await supabase
    .from("whatsapp_config")
    .select("*", { count: "exact", head: true })
    .eq("account_id", accountId);

  // If we can't count, don't block reconnecting an existing number.
  if (error) {
    console.error("[assertCanConnectWhatsapp] count error:", error);
    return;
  }

  if ((count ?? 0) >= max) {
    throw new ForbiddenError(
      `Seu plano permite ${max} número(s) de WhatsApp. Faça upgrade para conectar mais.`,
    );
  }
}

function upgradeMessage(plan: PlanTier, noun: string): string {
  const planName = PLANS[plan].name;
  return `Seu plano ${planName} atingiu o limite de ${noun}. Faça upgrade em Configurações → Plano e cobrança para continuar.`;
}

/**
 * Convenience: call `assertWithinLimit`, catching ForbiddenError and
 * returning a 403 response. Returns `null` when within limits — the
 * caller proceeds. Eliminates the need for try/catch + instanceof
 * ForbiddenError boilerplate at every inline route call site.
 */
export async function enforceLimit(
  supabase: SupabaseClient,
  accountId: string,
  resource: LimitResource,
): Promise<NextResponse | null> {
  try {
    await assertWithinLimit(supabase, accountId, resource);
    return null;
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Same pattern for the WhatsApp entitlement gate. */
export async function enforceWhatsappEntitled(
  supabase: SupabaseClient,
  accountId: string,
): Promise<NextResponse | null> {
  try {
    await assertWhatsappEntitled(supabase, accountId);
    return null;
  } catch (err) {
    return toErrorResponse(err);
  }
}
