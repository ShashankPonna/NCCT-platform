import type { Role } from "@ncct/shared-types";
import { useEffect, useState } from "react";
import { API_BASE_URL } from "./apiBaseUrl.js";
import { supabase } from "./supabaseClient.js";

interface SessionInfo {
  accessToken: string;
  userId: string;
  role: Role;
  fullName: string | null;
  email: string | null;
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

    async function loadRole(accessToken: string, userId: string, email: string | null) {
      const res = await fetch(`${API_BASE_URL}/api/profile`, {
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
        setSession({
          accessToken,
          userId,
          role: profile.role,
          // `profiles.full_name` is a nullable text column, but the signup
          // trigger writes '' when no name metadata was supplied — so most
          // real rows hold an empty string, not null. Normalising here keeps
          // the `string | null` type honest and means every consumer's
          // `?? "fallback"` actually fires instead of rendering blank.
          fullName: profile.full_name?.trim() ? profile.full_name : null,
          email,
        });
        setError(null);
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const current = data.session;
      if (current) {
        loadRole(current.access_token, current.user.id, current.user.email ?? null)
          .catch((err: Error) => setError(err.message))
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        loadRole(newSession.access_token, newSession.user.id, newSession.user.email ?? null).catch(
          (err: Error) => setError(err.message),
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
