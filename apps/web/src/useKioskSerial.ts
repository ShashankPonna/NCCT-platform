import { useCallback, useEffect, useRef, useState } from "react";

// One Web Serial connection, shared by everything the kiosk terminal does.
//
// A serial port can only be held open by one holder at a time, so card taps
// and capture-button presses — which arrive on the same cable — have to be
// consumed by a single screen. That constraint is why KioskTerminal.tsx
// exists at all rather than the NFC and face-capture panels staying on
// separate tabs.
//
// Requires a secure context: HTTPS, or http://localhost. Plain http:// on a
// LAN IP is NOT a secure context, so the kiosk must be opened as
// http://localhost — which also happens to be what the ESP32-CAM's plain-HTTP
// /capture endpoint needs to avoid a mixed-content block.

interface UseKioskSerial {
  connected: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  send: (line: string) => Promise<void>;
}

export function useKioskSerial(onLine: (line: string) => void): UseKioskSerial {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const portRef = useRef<SerialPort | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);

  // Held in a ref so the read loop always calls the latest handler instead of
  // the one captured when the loop started.
  const onLineRef = useRef(onLine);
  useEffect(() => {
    onLineRef.current = onLine;
  }, [onLine]);

  const readLoop = useCallback(async (port: SerialPort) => {
    if (!port.readable) return;
    const decoder = new TextDecoderStream();
    // TS types TextDecoderStream.writable as WritableStream<BufferSource>,
    // which pipeTo's generic won't accept against ReadableStream<Uint8Array> —
    // a known DOM-lib typing gap, not a real runtime mismatch.
    const closed = port.readable.pipeTo(decoder.writable as WritableStream<Uint8Array>);
    const reader = decoder.readable.getReader();

    let buffer = "";
    try {
      while (keepReadingRef.current) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);
          if (line) onLineRef.current(line);
        }
      }
    } catch {
      // Port unplugged mid-read — fall through to the cleanup below.
    } finally {
      reader.releaseLock();
      await closed.catch(() => undefined);
      setConnected(false);
    }
  }, []);

  const connect = useCallback(async () => {
    setError(null);
    if (!navigator.serial) {
      setError("This browser doesn't support Web Serial — use Chrome or Edge on desktop.");
      return;
    }
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      if (port.writable) {
        // Held for the life of the connection: the writer lock is only
        // contended if something else tries to write, and nothing does.
        writerRef.current = port.writable.getWriter();
      }

      keepReadingRef.current = true;
      setConnected(true);
      void readLoop(port);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [readLoop]);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    try {
      writerRef.current?.releaseLock();
    } catch {
      /* already released */
    }
    writerRef.current = null;
    try {
      await portRef.current?.close();
    } catch {
      /* already closed, or still held by a reader that is winding down */
    }
    portRef.current = null;
    setConnected(false);
  }, []);

  const send = useCallback(async (line: string) => {
    const writer = writerRef.current;
    if (!writer) return;
    try {
      await writer.write(new TextEncoder().encode(`${line}\n`));
    } catch (err) {
      setError(`Could not reach the reader: ${(err as Error).message}`);
    }
  }, []);

  useEffect(() => {
    return () => {
      keepReadingRef.current = false;
    };
  }, []);

  return { connected, error, connect, disconnect, send };
}
