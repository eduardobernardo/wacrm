import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Lazy, shared service-role client. Bypasses RLS — only for server
// paths that must write cross-tenant state (Stripe webhook, flows
// engine, automations engine, whatsapp config conflict check).
// Validates key presence so misconfiguration surfaces at first call
// instead of producing an opaque auth error deep in a query.
let _adminClient: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_adminClient) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    }
    _adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
  }
  return _adminClient;
}
