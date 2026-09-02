import type { Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { supabase } from "./supabaseClient.js";

interface SessionInfo {
  accessToken: string;
  userId: string;
  role: Role;
  fullName: string | null;
}

// Minimal session hook: Supabase Auth handles login (client-side, per
// ARCHITECTURE.md §9); the role comes back from GET /api/profile, the one
// route that already exists purely to answer "who is the caller and what's
// their role" — reused here instead of duplicating that lookup client-side.
export function useSession() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRole(accessToken: string, userId: string) {
      const apiUrl = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
      const res = await fetch(`${apiUrl}/api/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        // A cached session (getSession(), on mount) can point at a token
        // Express no longer accepts — e.g. the underlying auth user or its
        // profiles row is gone. Left alone, that session just sits in
        // localStorage and reproduces this same error on every reload with
        // no way to recover from the UI. Signing out clears it so the next
        // load starts clean and a fresh sign-in isn't fighting stale state.
        await supabase.auth.signOut();
        throw new Error(`Could not load profile/role for the signed-in user (HTTP ${res.status})`);
      }
      const profile = (await res.json()) as { role: Role; full_name: string | null };
      if (!cancelled) {
        setSession({ accessToken, userId, role: profile.role, fullName: profile.full_name });
        setError(null);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const current = data.session;
      if (current) {
        loadRole(current.access_token, current.user.id)
          .catch((err: Error) => setError(err.message))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        loadRole(newSession.access_token, newSession.user.id).catch((err: Error) =>
          setError(err.message),
        );
      } else {
        setSession(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return { session, loading, error };
}
