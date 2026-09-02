import { createClient } from "@supabase/supabase-js";

// Used only for Supabase Auth (login/session) — never for reading or writing
// application data. All data access goes through the Express API; see
// docs/DECISIONS.md #4 "Clients never call Supabase directly" and
// docs/ARCHITECTURE.md §9, the same boundary apps/web's client uses.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
