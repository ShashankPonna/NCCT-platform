import { randomBytes } from "node:crypto";

// Alphabet excludes 0/O/1/I — avoids transcription errors when a human
// reads a code off a printed certificate. Shared by certificateService.ts
// (8-char codes) and the F10 public-profile code (16-char, since that code
// is never hand-transcribed — it only ever travels inside an NFC-written
// URL — so it can afford to be long enough that enumeration is infeasible).
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateCode(length: number): string {
  const bytes = randomBytes(length);
  let code = "";
  for (const byte of bytes) {
    code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
  }
  return code;
}
