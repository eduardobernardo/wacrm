// Lazy, shared service-role client for billing writes.
// The Stripe webhook and the checkout route write `subscriptions` rows
// that have NO user-facing RLS write policy (paid state is Stripe's
// source of truth), so they must go through the service role, which
// bypasses RLS. This file re-exports the shared validated client under
// the legacy `billingAdmin` name so existing call sites stay unchanged.
export { supabaseAdmin as billingAdmin } from "@/lib/supabase/admin-client";
