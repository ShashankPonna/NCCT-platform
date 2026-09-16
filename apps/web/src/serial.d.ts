// Minimal Web Serial API surface used by the kiosk — TypeScript's lib.dom
// doesn't ship these yet. Kept local rather than pulling in
// @types/w3c-web-serial for a handful of interfaces.
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  // The kiosk writes back down the same cable it reads UIDs from — that's
  // how a server-side PASS/FAIL reaches the OLED and buzzer. `readable` and
  // `writable` are independent streams, so holding a reader on one does not
  // block a writer on the other.
  writable: WritableStream<Uint8Array> | null;
  close(): Promise<void>;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  serial?: Serial;
}
