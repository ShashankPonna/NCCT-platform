// Minimal Web Serial API surface used by KioskNfcReader.tsx — TypeScript's
// lib.dom doesn't ship these yet. Kept local rather than pulling in
// @types/w3c-web-serial for a handful of interfaces.
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  close(): Promise<void>;
}

interface Serial {
  requestPort(): Promise<SerialPort>;
  getPorts(): Promise<SerialPort[]>;
}

interface Navigator {
  serial?: Serial;
}
