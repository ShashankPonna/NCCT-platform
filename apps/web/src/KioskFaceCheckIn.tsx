import { FACE_EMBEDDING_DIMENSIONS } from "@ncct/constants";
import { kioskFaceCheckIn } from "@ncct/api-client";
import type { AttendanceCheckInResult } from "@ncct/api-client";
import { useRef, useState } from "react";
import { getHuman } from "./FaceCapture.js";

interface KioskFaceCheckInProps {
  accessToken: string;
  sessionId: string;
}

type Status =
  | "idle"
  | "loading-preview"
  | "capturing"
  | "submitting"
  | "no-face"
  | "matched"
  | "no-match"
  | "error";

const MAX_ATTEMPTS_PER_CLICK = 3;

// F5 kiosk face check-in (docs/DECISIONS.md #21): a staff-operated terminal
// has no trainee JWT to read an identity from, so trainee_id is typed here
// (or pasted from a preceding NFC lookup in KioskNfcReader.tsx) rather than
// inferred from the caller — same shift publicProfile.ts's NFC kiosk route
// already made for the same reason.
//
// Single-shot capture, not continuous live polling: real hardware testing
// showed the ESP32-CAM's WiFi link is marginal (observed transfer times
// ranging from 4.5s to full timeouts, occasional truncated frames), so
// hammering it every ~800ms the way an earlier version of this component
// did made things worse, not better, and risked the same brownout reset
// loop found on this board's power supply. A deliberate "position
// yourself, then capture" model — same shape as a webcam login prompt —
// asks far less of a connection that can't sustain continuous polling.
//
// Reuses FaceCapture.tsx's already-loaded @vladmandic/human instance to
// extract an embedding client-side, then submits it to the staff-only
// POST /timetable/:sessionId/kiosk-face-checkin route, which always
// recomputes the match server-side and never trusts a client verdict.
export function KioskFaceCheckIn({ accessToken, sessionId }: KioskFaceCheckInProps) {
  const [camUrl, setCamUrl] = useState("");
  const [traineeId, setTraineeId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  function camBase(): string {
    // Tolerate either "http://<ip>" or "http://<ip>/capture" in the input —
    // pasting the exact "Frame endpoint: ..." line the firmware prints on
    // boot (which already ends in /capture) is a natural, observed thing to
    // do, and doubling the suffix would hit a route that doesn't exist on
    // the board at all.
    return camUrl.trim().replace(/\/$/, "").replace(/\/capture$/, "");
  }

  // One capture attempt: fetches a single frame and draws it to the canvas.
  // Throws on any failure (timeout, truncated transfer, bad decode) — the
  // caller decides how many times to retry.
  async function fetchFrameToCanvas(): Promise<HTMLCanvasElement> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    let res: Response;
    try {
      res = await fetch(`${camBase()}/capture`, { cache: "no-store", signal: controller.signal });
    } catch (err) {
      throw (err as Error).name === "AbortError"
        ? new Error("Camera request timed out (weak WiFi signal?)")
        : err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Camera returned HTTP ${res.status}`);
    const blob = await res.blob();

    // A real, observed failure mode on weak WiFi: fetch() resolves "ok" but
    // the connection drops mid-body, handing back fewer bytes than the
    // server declared. Checking declared vs. actual size makes a truncated
    // transfer diagnosable instead of a mystery decode failure below.
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

    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Preview canvas not ready");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  // A handful of quick attempts per click, not an unbounded background
  // loop — absorbs a single dropped/truncated frame (common on this
  // hardware) without needing the operator to click again, but still ends
  // with a clear result rather than retrying forever.
  async function withRetries<T>(label: string, attempt: () => Promise<T>): Promise<T> {
    let lastErr: Error | null = null;
    for (let i = 0; i < MAX_ATTEMPTS_PER_CLICK; i++) {
      try {
        return await attempt();
      } catch (err) {
        lastErr = err as Error;
        setError(`${label} (attempt ${i + 1}/${MAX_ATTEMPTS_PER_CLICK}): ${lastErr.message}`);
      }
    }
    throw lastErr;
  }

  async function handlePreview() {
    if (!camUrl.trim()) return;
    setError(null);
    setStatus("loading-preview");
    try {
      await withRetries("Preview failed", fetchFrameToCanvas);
      setStatus("idle");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function handleCapture() {
    if (!camUrl.trim() || !traineeId.trim() || !sessionId.trim()) return;
    setError(null);
    setResult(null);
    setStatus("capturing");
    try {
      const canvas = await withRetries("Capture failed", fetchFrameToCanvas);
      const human = await getHuman();
      const detected = await human.detect(canvas);
      const face = detected.face[0];
      if (!face?.embedding || face.embedding.length !== FACE_EMBEDDING_DIMENSIONS) {
        setStatus("no-face");
        setError("No face detected in that frame — reposition and try again");
        return;
      }
      setError(null);
      await submit(face.embedding);
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  async function submit(embedding: number[]) {
    setStatus("submitting");
    try {
      const res = await kioskFaceCheckIn(accessToken, sessionId.trim(), traineeId.trim(), embedding);
      setResult(res);
      setStatus(res.matched ? "matched" : "no-match");
    } catch (err) {
      setError((err as Error).message);
      setStatus("error");
    }
  }

  const busy = status === "loading-preview" || status === "capturing" || status === "submitting";

  return (
    <section className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
        <span className="material-symbols-outlined text-primary">photo_camera</span>
        ESP32-CAM Face Check-in
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
        Requires the session ID above, the trainee&apos;s id (from an NFC tap on the Kiosk tab or
        the roster), and the camera&apos;s local address printed in its Serial Monitor on boot.
        Use Preview to frame the shot, then Capture &amp; Check In once ready.
      </p>

      <div className="flex flex-col md:flex-row gap-3">
        <input
          value={camUrl}
          onChange={(e) => setCamUrl(e.target.value)}
          placeholder="http://<esp32-cam-ip>"
          disabled={busy}
          className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
        />
        <input
          value={traineeId}
          onChange={(e) => setTraineeId(e.target.value)}
          placeholder="Trainee ID (UUID)"
          disabled={busy}
          className="flex-1 h-touch-target bg-surface-container-lowest border border-outline-variant rounded-lg px-3 font-mono text-body-sm disabled:opacity-50"
        />
      </div>

      <canvas
        ref={canvasRef}
        className="w-full max-w-sm rounded-lg border border-outline-variant self-center bg-surface-container-lowest"
      />

      {error && <p className="form-error">{error}</p>}

      {result &&
        ("fallbackToQr" in result ? (
          <div className="rounded-lg p-3 font-body-sm bg-status-rejected/15 text-status-rejected">
            No confident match (score {result.match_score.toFixed(3)}) — fall back to QR check-in
          </div>
        ) : (
          <div className="rounded-lg p-3 font-body-sm bg-status-success/15 text-status-success">
            Checked in — match score {result.match_score?.toFixed(3) ?? "n/a"}
          </div>
        ))}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => void handlePreview()}
          disabled={busy || !camUrl.trim()}
          className="h-touch-target px-6 border border-outline text-primary hover:bg-surface-container-highest disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors"
        >
          {status === "loading-preview" ? "Loading preview..." : "Preview"}
        </button>
        <button
          type="button"
          onClick={() => void handleCapture()}
          disabled={busy || !camUrl.trim() || !traineeId.trim() || !sessionId.trim()}
          className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors"
        >
          {status === "capturing"
            ? "Capturing..."
            : status === "submitting"
              ? "Submitting..."
              : "Capture & Check In"}
        </button>
      </div>
    </section>
  );
}
