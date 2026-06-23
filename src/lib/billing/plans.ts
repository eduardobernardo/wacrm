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
      maxWhatsappNumbers: 1,
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
      // 1 today; bump to a higher number (or UNLIMITED) when the
      // multi-number inbox work lands — see the whatsapp_config
      // UNIQUE(account_id) constraint that must be relaxed first.
      maxWhatsappNumbers: 1,
      maxMembers: 20,
      maxContacts: UNLIMITED,
      monthlyBroadcasts: UNLIMITED,
      maxAutomations: UNLIMITED,
      maxFlows: UNLIMITED,
    },
  },
};

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
