// ============================================================
// Stripe client — server-only.
//
// Lazily instantiated so importing this module (e.g. for the
// `getStripePriceId` helper, which is pure) doesn't throw when
// STRIPE_SECRET_KEY is absent — only actually *calling* Stripe
// does. Keeps non-billing builds / tests from needing the key.
//
// We intentionally do NOT pin `apiVersion`: the installed SDK
// pins its own, which avoids a TS literal-type mismatch every
// time the SDK bumps. Upgrade the `stripe` package to move
// versions.
// ============================================================

import Stripe from "stripe";

import { PLANS, type PlanTier } from "./plans";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(key);
  }
  return _stripe;
}

/**
 * Resolve the Stripe Price ID for a paid tier from env. Throws for
 * `free` (no price) or when the env var is missing — surfaces a
 * misconfiguration at checkout time rather than silently charging
 * the wrong amount.
 */
export function getStripePriceId(tier: PlanTier): string {
  const envKey = PLANS[tier].stripePriceEnv;
  if (!envKey) {
    throw new Error(`Plan '${tier}' has no Stripe price (not a paid tier)`);
  }
  const priceId = process.env[envKey];
  if (!priceId) {
    throw new Error(`Env var ${envKey} is not set`);
  }
  return priceId;
}

/** Reverse map a Stripe Price ID back to our plan tier (used by the
 *  webhook to translate a subscription's price into a `plan`). */
export function tierFromPriceId(priceId: string | null | undefined): PlanTier | null {
  if (!priceId) return null;
  for (const tier of ["pro", "business"] as const) {
    if (process.env[PLANS[tier].stripePriceEnv!] === priceId) return tier;
  }
  return null;
}

/** Base URL for redirect/success URLs — env override (trailing slashes
 *  trimmed) or the request's own origin. Shared by checkout + portal. */
export function baseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    new URL(request.url).origin
  );
}
