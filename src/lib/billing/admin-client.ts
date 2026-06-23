import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy, shared service-role client for billing writes.
// Mirrors src/lib/flows/admin-client.ts. The Stripe webhook and the
// checkout route write `subscriptions` rows that have NO user-facing
// RLS write policy (paid state is Stripe's source of truth), so they
// must go through the service role, which bypasses RLS.
let _adminClient: SupabaseClient | null = null;

export function billingAdmin(): SupabaseClient {
  if (!_adminClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    _adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      key,
    );
  }
  return _adminClient;
}
