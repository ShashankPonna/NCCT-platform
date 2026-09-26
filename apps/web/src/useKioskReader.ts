import { useCallback, useEffect, useRef, useState } from "react";

// HTTP-polling replacement for the old Web Serial connection (useKioskSerial.ts,
// removed). The DevKit no longer has a USB cable to the kiosk PC at all — it
// runs on battery and talks WiFi — so this hook polls its GET /events route
// instead of reading a serial port, and POSTs to /command instead of writing
// to one. Wire protocol (vocabulary unchanged from the serial build) is
// documented in kiosk_controller.ino's own header comment.
//
// The "one screen because a serial port has only one holder" reasoning that
// used to justify KioskTerminal.tsx existing as a single combined screen no
// longer strictly applies — HTTP has no exclusive-lock concept, multiple tabs
// could poll the reader at once. It stays one screen anyway: a card tap and
// the button press that follows it are one linear conversation with the
// board, and splitting them across tabs would just mean two polling loops
// racing to answer the same events.
//
// Requires a secure context exactly like the serial build did, just for a
// different reason now: the reader serves plain HTTP (no TLS on an ESP32),
// and an HTTPS page may not fetch a plain-HTTP resource (mixed content). The
// kiosk must still be opened as http://localhost — the ESP32-CAM's /capture
// endpoint already forced this same constraint.

interface UseKioskReader {
  connected: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  send: (line: string) => Promise<void>;
}

const POLL_INTERVAL_MS = 300;
// Bounded so one stalled poll can't block the next one forever — same
// reasoning as kioskCapture.ts's CAMERA_TIMEOUT_MS, just a much smaller
// number, since a GET /events reply is a few bytes, not a camera frame.
const POLL_TIMEOUT_MS = 2500;

function normalizeBase(url: string): string {
  return url.trim().replace(/\/$/, "");
}

export function useKioskReader(readerUrl: string, onLine: (line: string) => void): UseKioskReader {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read inside the poll loop, which would otherwise capture whatever these
  // were when start() was called — same pattern KioskTerminal.tsx itself
  // already uses for sessionIdRef/camUrlRef, for the same reason.
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);
  const urlRef = useRef(readerUrl);
  useEffect(() => {
    urlRef.current = readerUrl;
  }, [readerUrl]);

  const keepPollingRef = useRef(false);
  const timerRef = useRef<number | null>(null);

  // A plain while-loop over a ref flag, not a recursive useCallback chain —
  // everything it needs comes from refs read at call time, so this function
  // never needs to change identity and nothing about it goes stale mid-loop.
  const pollLoop = useCallback(async () => {
    while (keepPollingRef.current) {
      const base = normalizeBase(urlRef.current);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), POLL_TIMEOUT_MS);
      try {
        const res = await fetch(`${base}/events`, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = (await res.text()).trim();
        setError(null);
        // "NONE" means nothing happened since the last poll — the read-once
        // mailbox's normal idle reply, not an event to act on.
        if (text && text !== "NONE") onLineRef.current(text);
      } catch (err) {
        setError(
          (err as Error).name === "AbortError"
            ? "Reader request timed out"
            : `Could not reach the reader: ${(err as Error).message}`,
        );
      } finally {
        clearTimeout(timeout);
      }

      if (!keepPollingRef.current) break;
      await new Promise<void>((resolve) => {
        timerRef.current = window.setTimeout(resolve, POLL_INTERVAL_MS);
      });
    }
  }, []);

  const start = useCallback(() => {
    if (keepPollingRef.current) return;
    if (!normalizeBase(readerUrl)) {
      setError("Enter the reader's address first.");
      return;
    }
    setError(null);
    keepPollingRef.current = true;
    setConnected(true);
    void pollLoop();
  }, [readerUrl, pollLoop]);

  const stop = useCallback(() => {
    keepPollingRef.current = false;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setConnected(false);
  }, []);

  const send = useCallback(async (line: string) => {
    const base = normalizeBase(urlRef.current);
    if (!base) return;
    try {
      const res = await fetch(`${base}/command`, { method: "POST", body: line });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      setError(`Could not reach the reader: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      keepPollingRef.current = false;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return { connected, error, start, stop, send };
}
