import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabasePublishableKey || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, or SUPABASE_SERVICE_ROLE_KEY environment variables",
  );
}

// Full-access client. Use only for legitimately privileged/cross-user
// operations (admin actions, certificate issuance, etc.) — it bypasses RLS
// entirely, so it is not a substitute for the per-user client below.
// See docs/DECISIONS.md #9.
export const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

// Request-scoped client that authenticates as the calling user, so Postgres
// RLS policies evaluate against that user's auth.uid(). Use this for any
// route acting on a user's own data.
export function getSupabaseForUser(accessToken: string): SupabaseClient {
  return createClient(supabaseUrl!, supabasePublishableKey!, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
