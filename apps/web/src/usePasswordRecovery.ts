import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

// Clicking a password-reset email link lands here with a recovery token in
// the URL hash. supabase-js (detectSessionInUrl defaults to true) parses it
// on load and establishes a real session — which useSession's own listener
// would otherwise treat as an ordinary login and jump straight to the
// dashboard. Supabase fires a distinct "PASSWORD_RECOVERY" auth event in
// that case so App.tsx can intercept it and show the "choose a new
// password" screen instead, before the session ever reaches the normal
// role-gated views.
export function usePasswordRecovery() {
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  return { isRecovery, clearRecovery: () => setIsRecovery(false) };
}
