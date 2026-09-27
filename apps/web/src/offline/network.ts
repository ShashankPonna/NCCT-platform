import { Network } from "@capacitor/network";
import { useEffect, useState } from "react";

// Capacitor's Network plugin has a real web implementation (backed by
// navigator.onLine + the browser's online/offline events) as well as its
// native one, so this hook behaves correctly whether the app is running
// inside the Capacitor shell or as a plain website — no platform branching
// needed here.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Network.getStatus().then((status) => {
      if (!cancelled) setOnline(status.connected);
    });

    const listenerPromise = Network.addListener("networkStatusChange", (status) => {
      setOnline(status.connected);
    });

    return () => {
      cancelled = true;
      listenerPromise.then((l) => l.remove());
    };
  }, []);

  return online;
}

// fetch() rejects with a bare TypeError when there's no connection; the
// message differs per engine (Android WebView/Chrome, iOS WKWebView/Safari,
// Firefox). supabase-js passes the same message through.
const NETWORK_FAILURE = /failed to fetch|load failed|networkerror|network request failed/i;

export function isNetworkError(err: unknown): boolean {
  return err instanceof Error && NETWORK_FAILURE.test(err.message);
}

// For error banners: a lost connection isn't shown as an error, because
// OfflineBanner already tells the user they're offline.
export function errorText(err: unknown): string | null {
  if (isNetworkError(err)) return null;
  return err instanceof Error ? err.message : String(err);
}
