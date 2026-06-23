// ============================================================
// POST /api/billing/checkout
//
// Creates a Stripe Checkout Session for the caller's account to
// subscribe to (or upgrade to) a paid plan. Owner-only — billing
// is an owner responsibility.
//
// Body: { tier: "pro" | "business" }
// Returns: { url } — the hosted Checkout page to redirect to.
//
// We ensure a Stripe Customer exists and is persisted on the
// account's subscription row first, so the Customer Portal
// (/api/billing/portal) works afterwards and so the webhook can
// map events back to the account via customer + metadata.
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getSubscription } from "@/lib/billing/subscription";
import { getStripe, getStripePriceId } from "@/lib/billing/stripe";
import { isPaidTier, type PlanTier } from "@/lib/billing/plans";
import { billingAdmin } from "@/lib/billing/admin-client";

function baseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");

    const body = (await request.json().catch(() => null)) as
      | { tier?: unknown }
      | null;
    const tier = body?.tier;
    if (tier !== "pro" && tier !== "business") {
      return NextResponse.json(
        { error: "'tier' must be 'pro' or 'business'" },
        { status: 400 },
      );
    }
    if (!isPaidTier(tier as PlanTier)) {
      return NextResponse.json({ error: "Not a paid tier" }, { status: 400 });
    }

    const stripe = getStripe();
    const sub = await getSubscription(ctx.supabase, ctx.accountId);

    // Ensure a Stripe Customer, persisted on the subscription row.
    let customerId = sub.stripeCustomerId;
    if (!customerId) {
      const {
        data: { user },
      } = await ctx.supabase.auth.getUser();
      const customer = await stripe.customers.create({
        email: user?.email ?? undefined,
        name: ctx.account.name,
        metadata: { account_id: ctx.accountId },
      });
      customerId = customer.id;
      await billingAdmin()
        .from("subscriptions")
        .update({ stripe_customer_id: customerId })
        .eq("account_id", ctx.accountId);
    }

    const url = baseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: getStripePriceId(tier as PlanTier), quantity: 1 }],
      // account_id rides on both the session and the resulting
      // subscription so the webhook can resolve our row either way.
      client_reference_id: ctx.accountId,
      metadata: { account_id: ctx.accountId },
      subscription_data: { metadata: { account_id: ctx.accountId } },
      success_url: `${url}/settings?tab=billing&checkout=success`,
      cancel_url: `${url}/settings?tab=billing&checkout=cancel`,
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Stripe did not return a checkout URL" },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
