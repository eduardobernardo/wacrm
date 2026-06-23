// ============================================================
// POST /api/billing/webhook
//
// Stripe's callback — the SINGLE source of truth for paid state.
// No auth/role guard: it's authenticated by the Stripe signature
// (STRIPE_WEBHOOK_SECRET). Writes go through the service-role
// client (billingAdmin) because `subscriptions` has no user-facing
// write RLS policy.
//
// Runtime note: Route Handlers receive a standard Web `Request`
// (Next 16 docs / 15-route-handlers.md), so `request.text()` gives
// the exact raw body Stripe signed. Do NOT parse the JSON first —
// signature verification needs the unmodified bytes. Node runtime
// (not edge) because the Stripe SDK uses Node crypto.
//
// Handled events:
//   checkout.session.completed      → link customer + activate plan
//   customer.subscription.updated   → sync plan/status/period
//   customer.subscription.deleted   → drop to free/canceled
//   invoice.payment_failed          → mark past_due
// ============================================================

import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe, tierFromPriceId } from "@/lib/billing/stripe";
import { billingAdmin } from "@/lib/billing/admin-client";

export const runtime = "nodejs";

/** Map a Stripe subscription status to our enum. */
function mapStatus(s: Stripe.Subscription.Status): string {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // incomplete, paused, anything new
      return "incomplete";
  }
}

/** Stripe moved current_period_end onto items in newer API versions;
 *  read it defensively so we work across SDK versions. */
function periodEndISO(sub: Stripe.Subscription): string | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySub = sub as any;
  const unix: number | undefined =
    anySub.current_period_end ?? anySub.items?.data?.[0]?.current_period_end;
  return typeof unix === "number" ? new Date(unix * 1000).toISOString() : null;
}

/**
 * Resolve our account_id for a subscription: metadata first (set at
 * checkout), then fall back to a lookup by stripe ids.
 */
async function resolveAccountId(sub: Stripe.Subscription): Promise<string | null> {
  const fromMeta = sub.metadata?.account_id;
  if (fromMeta) return fromMeta;

  const admin = billingAdmin();
  const bySub = await admin
    .from("subscriptions")
    .select("account_id")
    .eq("stripe_subscription_id", sub.id)
    .maybeSingle();
  if (bySub.data?.account_id) return bySub.data.account_id;

  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) {
    const byCust = await admin
      .from("subscriptions")
      .select("account_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (byCust.data?.account_id) return byCust.data.account_id;
  }
  return null;
}

/** Upsert a Stripe subscription object onto our row. */
async function syncSubscription(sub: Stripe.Subscription): Promise<void> {
  const accountId = await resolveAccountId(sub);
  if (!accountId) {
    throw new Error(
      `[billing/webhook] could not resolve account for subscription ${sub.id}`,
    );
  }

  const priceId = sub.items.data[0]?.price?.id;
  const tier = tierFromPriceId(priceId) ?? "free";
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

  await billingAdmin()
    .from("subscriptions")
    .update({
      plan: tier,
      status: mapStatus(sub.status),
      stripe_customer_id: customerId ?? null,
      stripe_subscription_id: sub.id,
      current_period_end: periodEndISO(sub),
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    })
    .eq("account_id", accountId);
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing/webhook] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.error("[billing/webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;
        if (subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          // Ensure our account_id rides on the subscription metadata
          // for future events (some flows don't propagate it).
          if (!sub.metadata?.account_id && session.metadata?.account_id) {
            sub.metadata = { ...sub.metadata, account_id: session.metadata.account_id };
          }
          await syncSubscription(sub);
        }
        break;
      }
      case "customer.subscription.updated": {
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const accountId = await resolveAccountId(sub);
        if (accountId) {
          await billingAdmin()
            .from("subscriptions")
            .update({
              plan: "free",
              status: "canceled",
              stripe_subscription_id: null,
              cancel_at_period_end: false,
            })
            .eq("account_id", accountId);
        }
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const subRef = (invoice as any).subscription;
        const subId = typeof subRef === "string" ? subRef : subRef?.id;
        if (subId) {
          const admin = billingAdmin();
          await admin
            .from("subscriptions")
            .update({ status: "past_due" })
            .eq("stripe_subscription_id", subId);
        }
        break;
      }
      default:
        // Unhandled event types are fine — Stripe sends many.
        break;
    }
  } catch (err) {
    console.error(`[billing/webhook] handler error for ${event.type}:`, err);
    // 500 so Stripe retries — the handler is idempotent (plain
    // updates keyed by account_id), so retries are safe.
    return NextResponse.json({ error: "Handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
