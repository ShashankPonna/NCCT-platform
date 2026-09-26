import { FACE_EMBEDDING_DIMENSIONS } from "@ncct/constants";
import { getHuman } from "./FaceCapture.js";

// Camera-side helpers for the hardware-driven terminal (KioskTerminal.tsx),
// which talks to a real networked ESP32-CAM board. Pure functions, no React.
// The manual staff panel (StaffFaceCheckIn.tsx, DECISIONS.md #51) no longer
// has a networked camera of its own to fetch a frame from — it uses this
// device's own webcam via FaceCapture.tsx instead, so it has no use for
// these HTTP-fetch-a-JPEG-frame helpers.

// Measured against the real hardware, not guessed: the same 4KB QVGA frame
// came back in 2.5s, 4.7s and 11.0s on three consecutive requests over this
// kiosk's WiFi. An 8s timeout (an earlier value) aborted transfers that were
// completing normally — capture works at this link speed, it is just slow.
export const CAMERA_TIMEOUT_MS = 20000;

// Two attempts, not three: with `Connection: close` in the firmware the
// truncated-frame problem that motivated retries is gone, and every retry is
// another CAMERA_TIMEOUT_MS the person in front of the kiosk waits through.
export const MAX_CAPTURE_ATTEMPTS = 2;

// The worst case a whole BTN:CAPTURE -> verdict round takes, and the number
// the controller firmware's VERIFY_TIMEOUT_MS has to sit at or above:
// every capture attempt can burn a full CAMERA_TIMEOUT_MS, and Human's
// detect pass plus the kiosk-face-checkin round trip add roughly 10s more.
//
// This is not a timeout anything here enforces — it exists so the firmware
// number has one documented source. A board that gives up first is actively
// harmful: it shows "no response" and returns to idle while the browser is
// still working, so the OK that follows arrives in RESULT_HOLD and is
// ignored, leaving the student reading an error for attendance that was in
// fact recorded. See ESP32-CONTROLLER/arduino/kiosk_controller/ — change
// these together or not at all.
export const VERIFY_BUDGET_MS = MAX_CAPTURE_ATTEMPTS * CAMERA_TIMEOUT_MS + 10_000;

/**
 * Tolerates either "http://<ip>" or "http://<ip>/capture" — pasting the exact
 * "Frame endpoint: ..." line the firmware prints on boot (which already ends
 * in /capture) is a natural thing to do, and doubling the suffix would hit a
 * route that doesn't exist on the board at all.
 */
export function normalizeCamBase(camUrl: string): string {
  return camUrl.trim().replace(/\/$/, "").replace(/\/capture$/, "");
}

/**
 * Fetches one JPEG frame and draws it into `canvas`. Throws on any failure —
 * the caller decides whether to retry.
 */
export async function captureFrame(
  camUrl: string,
  canvas: HTMLCanvasElement,
): Promise<HTMLCanvasElement> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAMERA_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${normalizeCamBase(camUrl)}/capture`, {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err) {
    throw (err as Error).name === "AbortError"
      ? new Error("Camera request timed out (weak WiFi signal?)")
      : err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`Camera returned HTTP ${res.status}`);
  const blob = await res.blob();

  // A real, observed failure mode on weak WiFi: fetch() resolves "ok" but the
  // connection drops mid-body, handing back fewer bytes than the server
  // declared. Checking declared vs. actual size makes a truncated transfer
  // diagnosable instead of a mystery decode failure below.
  const declaredLength = Number(res.headers.get("content-length"));
  if (declaredLength && blob.size < declaredLength) {
    throw new Error(`Camera frame arrived truncated (${blob.size} of ${declaredLength} bytes)`);
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    throw new Error(`Camera frame could not be decoded (${blob.size} bytes received)`);
  }

  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

/**
 * Runs @vladmandic/human over an already-captured frame. Returns null when no
 * usable face descriptor came out — that is a "reposition and try again"
 * outcome, not an error.
 */
export async function extractEmbedding(canvas: HTMLCanvasElement): Promise<number[] | null> {
  const human = await getHuman();
  const detected = await human.detect(canvas);
  const face = detected.face[0];
  if (!face?.embedding || face.embedding.length !== FACE_EMBEDDING_DIMENSIONS) return null;
  return face.embedding;
}

/** Retries a capture a bounded number of times, reporting each failure. */
export async function withCaptureRetries<T>(
  attempt: () => Promise<T>,
  onAttemptFailed?: (message: string, attempt: number, total: number) => void,
): Promise<T> {
  let lastErr: Error | null = null;
  for (let i = 0; i < MAX_CAPTURE_ATTEMPTS; i++) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err as Error;
      onAttemptFailed?.(lastErr.message, i + 1, MAX_CAPTURE_ATTEMPTS);
    }
  }
  throw lastErr;
}
