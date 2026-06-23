// ============================================================
// Plan definitions — pure, unit-testable, no I/O.
//
// Single source of truth for "what does each plan allow and cost?"
// Mirrors the `plan_tier_enum` Postgres type from migration
// 030_billing.sql. Limits live HERE (TypeScript), not in the DB,
// so they can be tuned without a migration.
//
// Both API route guards (src/lib/billing/subscription.ts) and UI
// (the billing panel, gated buttons) read from this module so a
// pricing/packaging change is a one-file diff.
//
// Product rules:
//   - `free` is a pre-payment state: maxWhatsappNumbers === 0, so
//     it cannot connect WhatsApp. Connecting requires Pro/Business.
//   - Business gets 1 WhatsApp number today; the field exists so
//     raising it to many is a one-line change (no schema change to
//     the limit shape).
//   - Effective seat count = plan.maxMembers + subscription.extra_seats
//     (the extra-seats add-on is computed in subscription.ts).
// ============================================================

export type PlanTier = "free" | "pro" | "business";

/** Subscription lifecycle status — mirrors the `subscription_status_enum`
 *  Postgres type from migration 030_billing.sql. */
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

/** Ordered list, cheapest first. */
export const PLAN_TIERS: readonly PlanTier[] = ["free", "pro", "business"] as const;

/** Sentinel for "no cap". Kept as a real number so comparisons
 *  (`count < limit`) work without special-casing every call site. */
export const UNLIMITED = Number.POSITIVE_INFINITY;

/** Per-account resource caps. A value of `UNLIMITED` means no cap. */
export interface PlanLimits {
  /** WhatsApp numbers the account may connect. 0 = cannot connect. */
  maxWhatsappNumbers: number;
  /** Base seat allowance (before the extra-seats add-on). */
  maxMembers: number;
  maxContacts: number;
  /** Broadcasts that may be started per calendar month. */
  monthlyBroadcasts: number;
  maxAutomations: number;
  maxFlows: number;
}

export interface PlanDefinition {
  tier: PlanTier;
  /** Display name (pt-BR UI). */
  name: string;
  /** Monthly price in BRL (reais). 0 for free. */
  priceMonthlyBRL: number;
  limits: PlanLimits;
  /** Env var holding the Stripe Price ID for this tier (paid only). */
  stripePriceEnv?: "STRIPE_PRICE_PRO" | "STRIPE_PRICE_BUSINESS";
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    tier: "free",
    name: "Gratuito",
    priceMonthlyBRL: 0,
    limits: {
      maxWhatsappNumbers: 0,
      maxMembers: 1,
      maxContacts: 0,
      monthlyBroadcasts: 0,
      maxAutomations: 0,
      maxFlows: 0,
    },
  },
  pro: {
    tier: "pro",
    name: "Pro",
    priceMonthlyBRL: 99,
    stripePriceEnv: "STRIPE_PRICE_PRO",
    limits: {
      maxWhatsappNumbers: overrideMaxWhatsappNumbers("pro", 1),
      maxMembers: 5,
      maxContacts: 10_000,
      monthlyBroadcasts: 20,
      maxAutomations: 10,
      maxFlows: 10,
    },
  },
  business: {
    tier: "business",
    name: "Business",
    priceMonthlyBRL: 249,
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
    limits: {
      // Bump to a higher number (or UNLIMITED) when the multi-number
      // inbox work lands — see the whatsapp_config UNIQUE(account_id)
      // constraint that must be relaxed first.
      maxWhatsappNumbers: overrideMaxWhatsappNumbers("business", 3),
      maxMembers: 20,
      maxContacts: UNLIMITED,
      monthlyBroadcasts: UNLIMITED,
      maxAutomations: UNLIMITED,
      maxFlows: UNLIMITED,
    },
  },
};

// Override WhatsApp number limits via env vars (decision 4 + 5).
// NEXT_PUBLIC_ prefix so the client bundle sees the same value as the server.
// Falls back to the hardcoded default if the env var is absent or invalid.
function overrideMaxWhatsappNumbers(
  tier: "pro" | "business",
  defaultValue: number,
): number {
  const envName =
    tier === "pro"
      ? "NEXT_PUBLIC_PRO_MAX_WHATSAPP_NUMBERS"
      : "NEXT_PUBLIC_BUSINESS_MAX_WHATSAPP_NUMBERS";
  const raw = process.env[envName];
  if (raw == null || raw === "") return defaultValue;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.warn(`[billing] ${envName} has invalid value "${raw}"; falling back to default ${defaultValue}.`);
    return defaultValue;
  }
  if (parsed === 0) {
    console.warn(`[billing] ${envName} is 0; this will disable WhatsApp connections for the ${tier} plan.`);
  }
  return parsed;
}


/** Limits for a tier. */
export function getPlanLimits(tier: PlanTier): PlanLimits {
  return PLANS[tier].limits;
}

/** A paid tier is anything that can connect WhatsApp. */
export function isPaidTier(tier: PlanTier): boolean {
  return PLANS[tier].limits.maxWhatsappNumbers > 0;
}

export function isUnlimited(value: number): boolean {
  return value === UNLIMITED;
}

/** Human-readable limit for the UI ("Ilimitado" vs the number). */
export function formatLimit(value: number): string {
  return isUnlimited(value) ? "Ilimitado" : String(value);
}

// ============================================================
// Entitlement helpers — pure functions, safe for client & server.
// ============================================================

/** Subscription statuses that keep plan entitlements active. */
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set([
  "trialing",
  "active",
  "past_due",
]);

/** Minimal subscription info needed for pure entitlement calculations. */
export interface SubInfo {
  plan: PlanTier;
  status: SubscriptionStatus;
  extraSeats: number;
}

/** The tier whose entitlements currently apply. A canceled/incomplete
 *  subscription falls back to 'free'. */
export function effectiveTier(sub: SubInfo): PlanTier {
  return ENTITLED_STATUSES.has(sub.status) ? sub.plan : "free";
}

/** Effective seat allowance = plan base + purchased extra seats.
 *  Returns the unlimited sentinel when the base cap is UNLIMITED. */
export function effectiveMaxMembers(sub: SubInfo): number {
  const tier = effectiveTier(sub);
  const base = getPlanLimits(tier).maxMembers;
  if (isUnlimited(base)) return base;
  return tier === "free" ? base : base + sub.extraSeats;
}
