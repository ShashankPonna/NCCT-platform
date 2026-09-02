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
