import { Preferences } from "@capacitor/preferences";
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

// A tiny local cache of the last successful profile lookup, keyed by user
// id — see the network-failure branch in loadRole() below for why this
// exists. Deliberately not a general-purpose cache: it only ever holds one
// entry (today's signed-in user), overwritten on every successful load, so
// it can never serve stale data for a *different* account, only a stale
// (but still correct at the time it was fetched) role/name for the same
// one.
const CACHED_PROFILE_KEY = "ncct_cached_profile";

interface CachedProfile {
  userId: string;
  role: Role;
  fullName: string | null;
}

async function readCachedProfile(userId: string): Promise<CachedProfile | null> {
  try {
    const { value } = await Preferences.get({ key: CACHED_PROFILE_KEY });
    if (!value) return null;
    const parsed = JSON.parse(value) as CachedProfile;
    return parsed.userId === userId ? parsed : null;
  } catch {
    // Preferences can throw in edge cases (e.g. a private/blocked storage
    // context on plain web) — treat exactly like "no cache available"
    // rather than crashing the whole session-restore path over it.
    return null;
  }
}

async function writeCachedProfile(profile: CachedProfile): Promise<void> {
  try {
    await Preferences.set({ key: CACHED_PROFILE_KEY, value: JSON.stringify(profile) });
  } catch {
    // Same reasoning as above — losing the cache write is a missed
    // convenience next time the device is offline, never a correctness
    // problem for the current, already-successful load.
  }
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
      // Real bug found on an actual offline device test: this fetch used to
      // run unconditionally with no network-failure handling, so opening
      // the app with no connectivity at all — even with a perfectly valid
      // cached Supabase session sitting in local storage — threw here,
      // `session` was never set, and the app rendered its logged-out
      // LoginPage. That defeats PRD §6.9's entire premise (learning must
      // work without connectivity): a trainee could never even reach the
      // screen that shows their downloaded lessons if the very first thing
      // a cold launch does is a network call that offline always fails.
      // Distinguishing "couldn't reach the server at all" from "the server
      // was reached and said this token is invalid" is the fix — only the
      // second case is a real reason to sign out.
      let res: Response;
      try {
        res = await fetch(`${API_BASE_URL}/api/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
      } catch (networkErr) {
        const cached = await readCachedProfile(userId);
        if (cached) {
          if (!cancelled) {
            setSession({ accessToken, userId, role: cached.role, fullName: cached.fullName, email });
            setError(null);
          }
          return;
        }
        // No cached profile to fall back to (e.g. the very first launch
        // ever happens to be offline) — nothing to show, so surface the
        // real reason rather than silently signing the user out for a
        // problem that has nothing to do with their credentials.
        throw new Error(`Offline and no cached profile available: ${(networkErr as Error).message}`);
      }
      if (!res.ok) {
        // The server WAS reached and rejected the token — e.g. the
        // underlying auth user or its profiles row is gone. Left alone,
        // that session just sits in localStorage and reproduces this same
        // error on every reload with no way to recover from the UI. Signing
        // out clears it so the next load starts clean and a fresh sign-in
        // isn't fighting stale state. Unlike the network-failure branch
        // above, this is a genuine "this token is invalid," not "couldn't
        // ask," so falling back to a cache here would be wrong.
        await supabase.auth.signOut();
        throw new Error(`Could not load profile/role for the signed-in user (HTTP ${res.status})`);
      }
      const profile = (await res.json()) as { role: Role; full_name: string | null };
      // `profiles.full_name` is a nullable text column, but the signup
      // trigger writes '' when no name metadata was supplied — so most
      // real rows hold an empty string, not null. Normalising here keeps
      // the `string | null` type honest and means every consumer's
      // `?? "fallback"` actually fires instead of rendering blank.
      const fullName = profile.full_name?.trim() ? profile.full_name : null;
      await writeCachedProfile({ userId, role: profile.role, fullName });
      if (!cancelled) {
        setSession({ accessToken, userId, role: profile.role, fullName, email });
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
