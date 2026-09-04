import { FACE_EMBEDDING_DIMENSIONS } from "@ncct/constants";
import { kioskFaceCheckIn } from "@ncct/api-client";
import type { AttendanceCheckInResult } from "@ncct/api-client";
import { useEffect, useRef, useState } from "react";
import { getHuman } from "./FaceCapture.js";

interface KioskFaceCheckInProps {
  accessToken: string;
  sessionId: string;
}

type Status = "idle" | "polling" | "submitting" | "matched" | "no-match" | "error";

// F5 kiosk face check-in (docs/DECISIONS.md #21): a staff-operated terminal
// has no trainee JWT to read an identity from, so trainee_id is typed here
// (or pasted from a preceding NFC lookup in KioskNfcReader.tsx) rather than
// inferred from the caller — same shift publicProfile.ts's NFC kiosk route
// already made for the same reason.
//
// Polls a still frame from the ESP32-CAM firmware
// (ESP32-CAM/arduino/kiosk_capture_server/) roughly once a second, reuses
// FaceCapture.tsx's already-loaded @vladmandic/human instance to extract an
// embedding client-side, then submits it to the staff-only
// POST /timetable/:sessionId/kiosk-face-checkin route, which always
// recomputes the match server-side and never trusts a client verdict.
export function KioskFaceCheckIn({ accessToken, sessionId }: KioskFaceCheckInProps) {
  const [camUrl, setCamUrl] = useState("");
  const [traineeId, setTraineeId] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AttendanceCheckInResult | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    return () => {
      pollingRef.current = false; // stop an in-flight poll loop on unmount
    };
  }, []);

  // One capture-and-detect attempt. Returns an embedding only when a face
  // with a usable descriptor was found — null means "keep polling", not an
  // error (a still frame with nobody currently facing the camera is normal).
  // The fetch has an explicit timeout: on real hardware, WiFi signal
  // strength at the kiosk varies a lot moment to moment (observed directly —
  // the same board went from a 15s+ full timeout to a 4.5s successful
  // transfer between two back-to-back checks), and an un-timed-out fetch on
  // a stalled request would otherwise hang the whole polling loop silently,
  // with no visible feedback that anything is wrong.
  async function pollOnce(): Promise<number[] | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    // Tolerate either "http://<ip>" or "http://<ip>/capture" in the input —
    // pasting the exact "Frame endpoint: ..." line the firmware prints on
    // boot (which already ends in /capture) is a natural, observed thing to
    // do, and doubling the suffix would hit a route that doesn't exist on
    // the board at all.
    const base = camUrl.trim().replace(/\/$/, "").replace(/\/capture$/, "");
    let res: Response;
    try {
      res = await fetch(`${base}/capture`, {
        cache: "no-store",
        signal: controller.signal,
      });
    } catch (err) {
      throw (err as Error).name === "AbortError"
        ? new Error("Camera request timed out (weak WiFi signal?) — retrying")
        : err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`Camera returned HTTP ${res.status}`);
    const blob = await res.blob();
    // A real, observed failure mode on weak WiFi: fetch() resolves "ok" but
    // the connection drops mid-body, handing back fewer bytes than the
    // server declared — createImageBitmap's own error for this ("source
    // image cannot be decoded") doesn't say why, so check the declared vs.
    // actual size directly to make a truncated transfer diagnosable instead
    // of looking like a mystery decode failure.
    const declaredLength = Number(res.headers.get("content-length"));
    if (declaredLength && blob.size < declaredLength) {
      throw new Error(
        `Camera frame arrived truncated (${blob.size} of ${declaredLength} bytes) — weak WiFi signal, retrying`,
      );
    }
    const bitmap = await createImageBitmap(blob);

    const canvas = canvasRef.current;
    if (!canvas) return null;
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const human = await getHuman();
    const detected = await human.detect(canvas);
    const face = detected.face[0];
    if (!face?.embedding || face.embedding.length !== FACE_EMBEDDING_DIMENSIONS) return null;
    return face.embedding;
  }

  async function startPolling() {
    if (!camUrl.trim() || !traineeId.trim() || !sessionId.trim()) return;
    setError(null);
    setResult(null);
    setStatus("polling");
    pollingRef.current = true;

    // A single slow/failed frame (a real, observed WiFi-flakiness pattern on
    // the actual hardware, not hypothetical) is transient — shown, not
    // fatal, so a momentary drop doesn't kill the whole session. Only a run
    // of consecutive failures means the camera is genuinely unreachable, not
    // just slow, and stops the loop with a real error instead of retrying
    // forever with no visible end state.
    const MAX_CONSECUTIVE_FAILURES = 5;
    let consecutiveFailures = 0;

    while (pollingRef.current) {
      try {
        const embedding = await pollOnce();
        consecutiveFailures = 0;
        setError(null);
        if (embedding) {
          pollingRef.current = false;
          await submit(embedding);
          return;
        }
      } catch (err) {
        consecutiveFailures += 1;
        setError((err as Error).message);
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          pollingRef.current = false;
          setStatus("error");
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }

  function stopPolling() {
    pollingRef.current = false;
    setStatus("idle");
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

  const busy = status === "polling" || status === "submitting";

  return (
    <section className="bg-surface-card border border-outline-variant rounded-xl p-6 shadow-sm flex flex-col gap-4">
      <h2 className="font-headline-sm text-headline-sm text-on-surface flex items-center gap-2 m-0">
        <span className="material-symbols-outlined text-primary">photo_camera</span>
        ESP32-CAM Face Check-in
      </h2>
      <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
        Requires the session ID above, the trainee&apos;s id (from an NFC tap on the Kiosk tab or
        the roster), and the camera&apos;s local address printed in its Serial Monitor on boot.
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
        {status === "polling" && (
          <button
            type="button"
            onClick={stopPolling}
            className="h-touch-target px-6 border border-outline text-primary hover:bg-surface-container-highest rounded-full font-label-md text-label-md transition-colors"
          >
            Stop (waiting for a face)
          </button>
        )}
        {status === "submitting" && (
          <button
            type="button"
            disabled
            className="h-touch-target px-6 bg-cta text-on-primary opacity-50 rounded-full font-label-md text-label-md"
          >
            Submitting...
          </button>
        )}
        {status !== "polling" && status !== "submitting" && (
          <button
            type="button"
            onClick={() => void startPolling()}
            disabled={!camUrl.trim() || !traineeId.trim() || !sessionId.trim()}
            className="h-touch-target px-6 bg-cta text-on-primary hover:bg-cta-hover disabled:opacity-50 rounded-full font-label-md text-label-md transition-colors"
          >
            Start Camera
          </button>
        )}
      </div>
    </section>
  );
}
