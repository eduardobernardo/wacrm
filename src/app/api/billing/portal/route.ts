// ============================================================
// POST /api/billing/portal
//
// Creates a Stripe Customer Portal session so the account owner can
// manage their subscription self-service (update card, view
// invoices, upgrade/downgrade, cancel). Owner-only.
//
// Returns: { url } — the hosted portal page to redirect to.
//
// Requires the account to already have a Stripe customer (i.e. they
// went through checkout at least once). Otherwise 400 — the UI
// should show "Assinar" (checkout) instead of "Gerenciar".
// ============================================================

import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { getSubscription } from "@/lib/billing/subscription";
import { getStripe } from "@/lib/billing/stripe";

function baseUrl(request: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "") ||
    new URL(request.url).origin
  );
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("owner");
    const sub = await getSubscription(ctx.supabase, ctx.accountId);

    if (!sub.stripeCustomerId) {
      return NextResponse.json(
        { error: "Nenhuma assinatura ativa para gerenciar." },
        { status: 400 },
      );
    }

    const stripe = getStripe();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: `${baseUrl(request)}/settings?tab=billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return toErrorResponse(err);
  }
}
